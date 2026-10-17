# Continuous deployment to the Azure VM

Every push to `main` is checked and then deployed to the Azure VM that serves
https://incidentsense.duckdns.org. You can also start a deploy by hand from the Actions tab.

```
push to main ──► Checks job (GitHub runner)                ──► Deploy job (GitHub runner)
                 • actionlint + shellcheck                      • SSH into the VM (pinned host key)
                 • docker compose config                        • stream scripts/deploy.sh and run it
                 • Python syntax check                          • public health checks on the domain
                 • Spring tests (throwaway Postgres/Redis)
                 • dashboard lint + build
```

Production runs **two Compose files**:

* `docker-compose.yml`: tracked in git, identical to GitHub `main`.
* `docker-compose.override.yml`: VM-only and git-ignored. It holds Caddy/HTTPS, no host port for `web`, CORS, and demo users off by default. A sanitized copy lives at [`deploy/docker-compose.override.example.yml`](../deploy/docker-compose.override.example.yml), and CI validates it against the base file.

Every Compose command in the deploy script names both files: `docker compose -f docker-compose.yml -f docker-compose.override.yml …`.

On the VM, [`scripts/deploy.sh`](../scripts/deploy.sh) does the following:

1. Checks that the app directory, the override, `Caddyfile`, `.env`, git, Docker and Compose v2 are there, and takes a lock so two deploys can't overlap.
2. Refuses if tracked files were edited on the VM, if the checkout isn't on `main`, or if it can't fast-forward.
3. **Checks the configuration before changing anything.** It reads the target commit's `docker-compose.yml` from git and computes the effective config of every service (base + override + `.env`). It compares that against the `config-hash` label Compose put on each running container, and also checks that the Postgres/Redis images haven't been replaced locally. If any of the six services would be created or recreated with a different configuration, the deploy **stops and changes nothing**. You can approve an intended change with a manual run (see [Deploying](#deploying)).
4. Fast-forwards the checkout to the exact commit that triggered the run.
5. Builds `ai api web`. Postgres, Redis and Caddy are stock images and are never built. If the build fails, the running containers are left alone.
6. Runs `up -d --no-build ai api web`. Compose recreates only the app containers whose image changed. Caddy is never named, so it is never recreated by a deploy.
7. Waits until all six containers are running/healthy, and checks `/api/alerts` (expects 401/403) and `/ai/health` (expects 200) from inside the `web` container.
8. Prunes only dangling (untagged) images.

What the script never does:

* run `docker compose down`, delete volumes (`-v`), or use `--remove-orphans`;
* read or write `.env`;
* reset, restore or stash files in the checkout, even after a failure;
* print `docker compose config` or container logs. Actions logs of a public repository are public, so container logs stay on the VM.

---

## One-time setup

The examples assume the VM user is `azureuser` and the project lives in `/home/azureuser/incident-triage-system`. Use your real values.

### 1. Check the VM

SSH in the way you do today, go to the project directory, and run:

```bash
pwd                          # -> the value for the VM_APP_DIR secret
git branch --show-current    # must print: main
git status --short           # must print nothing except untracked (??) files
git remote -v                # should be https://github.com/pratham-ahuja05/incident-triage-system.git
docker compose version       # must be v2.x or newer
docker ps                    # must work WITHOUT sudo
```

Fix anything that doesn't match:

* **`docker ps` needs sudo.** Run `sudo usermod -aG docker $USER`, log out, and log back in. The deploy key gets the same Docker access you have. Membership in the `docker` group is effectively root on that VM, so keep the deploy key restricted, as in step 3.
* **`git status` lists modified (` M`) tracked files.** These are edits made directly on the VM. Production edits to `docker-compose.yml` belong in the VM-only override; follow [Production override](#production-override-one-time-cutover). Deploys refuse to run until the tree is clean, so nothing is ever silently overwritten.
* **Not on `main`.** Run `git switch main`.

### Production override (one-time cutover)

You do this by hand once, before the first CI deploy. It moves the VM's production edits out of the tracked `docker-compose.yml` into the git-ignored `docker-compose.override.yml`, **without recreating any container**. Run every command from the project directory.

**a. Inspect what is running.** These commands are read-only and print no secrets:

```bash
cd /home/azureuser/incident-triage-system
docker compose version --short                          # must be 2.24+ for `!reset`
docker compose ls                                       # project name
docker volume ls --format '{{.Name}}' | grep -E 'caddy|pgdata'
CADDY=$(docker compose -f docker-compose.yml ps -q caddy)
docker inspect -f 'image={{.Config.Image}} project={{index .Config.Labels "com.docker.compose.project"}}' "$CADDY"
docker inspect -f '{{range .Mounts}}{{.Type}} {{.Name}}{{.Source}} -> {{.Destination}} rw={{.RW}}{{println}}{{end}}' "$CADDY"
docker inspect -f '{{range $p, $b := .HostConfig.PortBindings}}{{$p}} -> {{range $b}}{{.HostIp}}:{{.HostPort}} {{end}}{{println}}{{end}}' "$CADDY"
git diff -- docker-compose.yml                          # your VM edits; check for passwords before sharing
```

**b. Write the override.** Copy `deploy/docker-compose.override.example.yml` to `docker-compose.override.yml`. Check the two `CONFIRM` lines against `git diff`, and copy anything else from `git diff` that the example doesn't cover. The example pins the existing volume names exactly (`incident-triage-system_caddy_data`, `incident-triage-system_caddy_config`, `incident-triage-system_pgdata`). Before continuing, confirm they match `docker volume ls`.

> Between creating the override and step d, don't run any plain `docker compose` command (`up`, `restart` and so on). Compose would auto-load both the edited file and the override and define Caddy twice. Always name the files with `-f`.

**c. Prove nothing would be recreated.** Compare the configuration the running containers were created with (their `config-hash` labels, which is exactly what the deploy checks) against what CI will deploy:

```bash
for s in ai api caddy postgres redis web; do
  printf '%s %s\n' "$s" "$(docker inspect -f '{{index .Config.Labels "com.docker.compose.config-hash"}}' "$(docker compose -f docker-compose.yml ps -q "$s")")"
done > /tmp/hash-now
git fetch origin main && git show origin/main:docker-compose.yml > /tmp/base-main.yml
docker compose --project-directory . -f /tmp/base-main.yml -f docker-compose.override.yml config --hash '*' | sort > /tmp/hash-cicd
diff /tmp/hash-now /tmp/hash-cicd && echo "IDENTICAL: no container would be recreated"
```

If any line differs, stop: the override doesn't reproduce that service yet. Adjust it and repeat. All six services must be identical.

**d. Switch the tracked file back to GitHub's version.** Do this only after step c shows identical output. This is a manual step; the deploy script never does it for you:

```bash
cp docker-compose.yml docker-compose.yml.pre-cicd.bak   # extra backup (git-ignored)
git restore docker-compose.yml
git status --short                                       # tracked files clean; ?? lines are fine
```

Nothing is restarted by these commands. From now on, the first CI deploy repeats the step c comparison by itself before changing anything.

### 2. Create a dedicated deploy key (on your own computer)

Use a new key used only by GitHub Actions, not your personal key. In PowerShell:

```powershell
ssh-keygen -t ed25519 -C "github-actions-deploy" -f "$HOME\.ssh\incidentsense_deploy"
```

Press **Enter twice** when asked for a passphrase. CI can't type one, so the key must have none, which is why it gets locked down in the next step. This creates two files:

* `incidentsense_deploy`: the **private** key. It goes only into a GitHub secret. Never commit it, never paste it anywhere else.
* `incidentsense_deploy.pub`: the **public** key. It goes on the VM.

### 3. Authorise the key on the VM

From PowerShell (replace the user and host):

```powershell
$pub = Get-Content "$HOME\.ssh\incidentsense_deploy.pub"
ssh azureuser@incidentsense.duckdns.org "echo 'restrict $pub' >> ~/.ssh/authorized_keys"
```

The `restrict` prefix stops this key from opening port forwards, agent forwarding or a terminal (PTY). It can still run the deploy commands. Test it:

```powershell
ssh -i "$HOME\.ssh\incidentsense_deploy" azureuser@incidentsense.duckdns.org "docker ps --format '{{.Names}}'"
```

### 4. Get and verify the VM's host key

The workflow only connects if the server's host key matches the one you give it. That prevents a man-in-the-middle from receiving your deploy.

On your computer, scan the key using **exactly the same host name or IP you will put in `VM_HOST`**:

```powershell
ssh-keyscan -t ed25519 incidentsense.duckdns.org | Out-File -Encoding ascii vm_known_hosts.txt
ssh-keygen -lf vm_known_hosts.txt
```

Then, in your existing SSH session on the VM, print the real fingerprint:

```bash
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
```

The two `SHA256:...` fingerprints **must be identical**. If they differ, stop and don't use the scanned key. If SSH runs on a port other than 22, add `-p <port>` to `ssh-keyscan`.

### 5. Allow GitHub Actions to reach SSH

GitHub-hosted runners connect from a large and changing set of IP addresses. In the Azure portal, open **VM → Networking**. If the inbound SSH rule only allows your own IP, deploys can't connect.

You can allow SSH from any source as long as password logins are disabled. Check that on the VM with `sudo sshd -T | grep -i passwordauthentication`, which must say `no`. Key-only SSH plus the restricted deploy key is the usual setup for this. If you'd rather keep SSH closed to the internet, ask for the workflow to be switched to a self-hosted runner on the VM instead.

### 6. Add the repository secrets

On GitHub, open the repo and go to **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
| --- | --- |
| `VM_HOST` | The VM's public host name or IP, e.g. `incidentsense.duckdns.org`. It must be the same value you scanned in step 4. |
| `VM_USER` | The Linux user that owns the project and can run `docker`, e.g. `azureuser`. |
| `VM_SSH_KEY` | The whole contents of the **private** key file `incidentsense_deploy`, including the `-----BEGIN…` and `-----END…` lines. Copy it with `Get-Content "$HOME\.ssh\incidentsense_deploy" -Raw \| Set-Clipboard`. |
| `VM_KNOWN_HOSTS` | The whole contents of `vm_known_hosts.txt` from step 4. |
| `VM_APP_DIR` | The absolute project path from step 1, e.g. `/home/azureuser/incident-triage-system`. |
| `VM_SSH_PORT` | *Optional.* Only needed if SSH isn't on port 22. |

After saving the secrets, delete `vm_known_hosts.txt`. Keep the private key file somewhere safe, or delete it, since you can always generate a new one.

*Optional:* under **Settings → Environments → production** you can add yourself as a required reviewer. Every deploy then waits for your approval click.

---

## Deploying

* **Normal:** push (or merge a PR) to `main`. That's it.
* **Manual:** go to **Actions → Deploy → Run workflow**, choose branch `main`, then **Run workflow**. This re-deploys the current `main`, which is safe to repeat. Runs started from another branch run the checks but skip the deploy.
* **A commit that intentionally changes Compose configuration** (for example a new environment variable for `api`, or a change to the override). The push-triggered deploy stops with `Refusing to deploy … api:config` and changes nothing. Run the workflow manually and put the listed service names in **allow_config_change**, for example `api`. Only list services you expect to change. Listing `postgres` recreates the Postgres container but keeps the `pgdata` volume. Caddy is never recreated by a deploy; after editing the override, apply it yourself with `docker compose -f docker-compose.yml -f docker-compose.override.yml up -d caddy`.

Pushes that land while a deploy is running wait for it to finish; they never cancel it halfway. If several pushes queue up, only the newest waiting run is kept.

## Verifying a deploy and finding out why one failed

1. On the **Actions** tab, open the run. A failed step is red, and the error is also shown as an annotation at the top of the run page. The messages say what to fix: missing secret, SSH refused, dirty checkout, build failure, an unhealthy service, and so on.
2. Open https://incidentsense.duckdns.org and sign in.
3. For details, check the VM:

```bash
cd /home/azureuser/incident-triage-system
git log -1 --oneline                  # which commit is deployed
docker compose -f docker-compose.yml -f docker-compose.override.yml ps                     # state and health
docker compose -f docker-compose.yml -f docker-compose.override.yml logs --tail=200 api    # or ai / web / caddy …
```

| Error | Likely cause |
| --- | --- |
| `Missing repository secrets: …` | A secret wasn't added, or its name is misspelt. |
| `Host key verification failed` | `VM_KNOWN_HOSTS` doesn't match `VM_HOST` (scan the same name or IP), or the VM's host key changed. If the key changed, verify why before updating the secret. |
| `Permission denied (publickey)` | The public key isn't in `authorized_keys` for `VM_USER`, or `VM_SSH_KEY` was copied incompletely. |
| `Connection timed out` | The Azure NSG blocks SSH from GitHub runners (step 5), or the VM is stopped. |
| `Tracked files were edited on the VM` | See step 1. Nothing was changed by the deploy. |
| `docker-compose.override.yml is missing` | The VM-only override hasn't been created yet; see [Production override](#production-override-one-time-cutover). |
| `Refusing to deploy: … <service>:config` | The commit (or an edit to the override) changes that service's Compose configuration. Nothing was changed. If it's intended, re-run manually with `allow_config_change`. |
| `Refusing to deploy: … postgres:image` | The local `pgvector/pgvector` (or `redis`) image was replaced, e.g. by a manual `docker pull`, so the container would be recreated. Allow it explicitly, or retag the old image. |
| `Refusing to deploy: … <service>:not-running` | That container isn't running. Start it manually and investigate first. |
| Every service reports `:config` after a Docker update | Newer Compose versions can hash configs differently. Compose itself would recreate them all, so this is a real change. Allow it deliberately in a quiet moment. |
| `Image build failed` | Check the build output in the log. The old containers are still serving. The checkout stays at the new commit and is not reset; the next deploy rebuilds it. |
| `Not healthy after 600s: …` | The new containers didn't come up. Read `docker compose logs` for the listed services, then roll back. |

## Rolling back

**Preferred: revert and push.** This takes the normal path, is fully recorded in git, and leaves the VM clean:

```bash
git revert <bad-commit-sha>    # on your computer
git push origin main           # deploys the reverted code
```

**Emergency (the site is down and you can't wait for CI):** on the VM, check out the last good commit. The deploy log prints it as `Previous commit:`.

```bash
cd /home/azureuser/incident-triage-system
git switch --detach <good-commit-sha>
C="docker compose -f docker-compose.yml -f docker-compose.override.yml"
$C build ai api web && $C up -d --no-build ai api web
```

Then revert the bad commit on GitHub as above, and before the next deploy run `git switch main` on the VM. Deploys refuse to run from a detached checkout, so an emergency rollback is never overwritten by surprise.

**About the database:** none of these steps touches the `pgdata` volume. Never run `docker compose down -v` or `docker volume rm` on the VM. The API uses `spring.jpa.hibernate.ddl-auto=update`, which only *adds* tables and columns and never drops them. Rolling back code leaves any new columns in place, which older code normally ignores. Before shipping a risky schema change, take a backup:

```bash
docker compose exec -T postgres pg_dump -U postgres triage_db | gzip > ~/triage_db-$(date +%F).sql.gz
```

## Rotating or revoking the deploy key

Delete the `github-actions-deploy` line from `~/.ssh/authorized_keys` on the VM. GitHub can no longer connect. Generate a new key (steps 2–3) and update the `VM_SSH_KEY` secret.
