#!/usr/bin/env bash
# Deploys one commit of IncidentSense on the VM. CI streams this file over SSH
# (.github/workflows/deploy.yml), so the version being deployed is the one that runs.
#
#   usage: deploy.sh <app-dir> <commit-sha> [branch] [allowed-config-changes]
#
# Production config = tracked docker-compose.yml + the VM-only, git-ignored
# docker-compose.override.yml (Caddy/HTTPS, no web host port, CORS, demo users off).
# Every Compose command names both files explicitly.
#
# Safe by design:
#   * Before touching anything it computes the target commit's effective Compose config and
#     refuses to deploy if it differs from what any running service was created with, unless
#     that service is listed in allowed-config-changes (e.g. "api,web"). Postgres, Redis and
#     Caddy are therefore never recreated by surprise.
#   * Never runs `down`, never removes volumes or orphan containers, never reads or writes
#     .env, and never resets, restores or stashes files in the VM checkout.
#   * Only builds the three app images, and never recreates Caddy.
#   * Never prints `docker compose config` or container logs, because Actions logs of a
#     public repository are public.
set -Eeuo pipefail

# CI pipes this script into `bash -s` over SSH, so stdin *is* the script. Everything runs
# inside main(), which bash has to read in full before it starts, so a command that reads
# stdin can never swallow the rest of the script.
main() {
  USAGE="usage: deploy.sh <app-dir> <commit-sha> [branch] [allowed-config-changes]"
  APP_DIR=${1:?$USAGE}
  TARGET_SHA=${2:?$USAGE}
  BRANCH=${3:-main}
  ALLOW_CONFIG_CHANGE=${4:-}
  APP_SERVICES=(ai api web)                       # built from source; recreated when their image changes
  ALL_SERVICES=(postgres redis ai api web caddy)  # must all be running before and after a deploy
  STOCK_IMAGE_SERVICES=(postgres redis)           # `up` would recreate these if their local image changed
  HEALTH_TIMEOUT=${HEALTH_TIMEOUT:-600}
  OVERRIDE=docker-compose.override.yml
  COMPOSE_FILES=(-f docker-compose.yml -f "$OVERRIDE")
  COMPOSE_CMD="docker compose -f docker-compose.yml -f $OVERRIDE"

  compose() { docker compose "${COMPOSE_FILES[@]}" "$@"; }
  # Git can start detached background maintenance (gc/repack) that outlives this script.
  # Run git without the deploy lock's fd 9 so such a process can never keep holding the lock.
  git() { command git "$@" 9>&-; }
  step() { printf '\n==> %s\n' "$*"; }
  # ::error:: lines become annotations on the GitHub Actions run page.
  fail() { printf '::error::%s\n' "$*"; exit 1; }
  trap 'fail "Deploy script failed at line $LINENO: $BASH_COMMAND"' ERR

  [[ $TARGET_SHA =~ ^[0-9a-f]{40}$ ]] || fail "Not a full commit SHA: $TARGET_SHA"
  [[ $ALLOW_CONFIG_CHANGE =~ ^[a-z0-9_,\ -]*$ ]] || fail "allowed-config-changes must be a comma-separated list of service names"
  allowed=" ${ALLOW_CONFIG_CHANGE//,/ } "

  step "Pre-flight checks"
  cd "$APP_DIR" 2>/dev/null || fail "App directory '$APP_DIR' does not exist on the VM (check the VM_APP_DIR secret)"
  [[ -f docker-compose.yml ]] || fail "No docker-compose.yml in $APP_DIR"
  [[ -f $OVERRIDE ]] || fail "$OVERRIDE is missing in $APP_DIR. Production needs it for Caddy/HTTPS (see docs/DEPLOYMENT.md)"
  [[ -f Caddyfile ]] || fail "Caddyfile is missing in $APP_DIR"
  [[ -f .env ]] || fail "$APP_DIR/.env is missing. Create it on the VM; CI never creates or changes it"
  command -v git >/dev/null || fail "git is not installed on the VM"
  command -v flock >/dev/null || fail "flock is not installed on the VM (apt install util-linux)"
  docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 ('docker compose') is not available for user $(whoami)"
  docker info >/dev/null 2>&1 || fail "User $(whoami) cannot reach the Docker daemon. Add it to the docker group (see docs/DEPLOYMENT.md)"
  echo "Running as $(whoami) in $APP_DIR ($(docker compose version --short))"

  # Never overlap with another deploy, whether from CI or a manual run of this script.
  exec 9>/tmp/incidentsense-deploy.lock
  flock -n 9 || fail "Another deployment is already running on the VM"

  step "Checking the VM checkout"
  current_branch=$(git symbolic-ref --quiet --short HEAD) \
    || fail "VM checkout is on a detached HEAD (left over from a manual rollback?). Run: cd $APP_DIR && git switch $BRANCH"
  [[ $current_branch == "$BRANCH" ]] || fail "VM checkout is on branch '$current_branch', expected '$BRANCH'"
  if ! git diff --quiet || ! git diff --cached --quiet; then
    git status --short --untracked-files=no
    fail "Tracked files were edited on the VM (listed above). Move VM-only settings into $OVERRIDE or .env, or commit them to the repo. Nothing was changed"
  fi

  previous_sha=$(git rev-parse HEAD)
  git fetch --quiet origin "$BRANCH" || fail "git fetch from origin failed"
  git merge-base --is-ancestor "$TARGET_SHA" "origin/$BRANCH" || fail "$TARGET_SHA is not on origin/$BRANCH"
  if git merge-base --is-ancestor "$TARGET_SHA" HEAD; then
    echo "VM checkout already contains $TARGET_SHA; redeploying what is checked out"
    deploy_sha=$previous_sha
  else
    git merge-base --is-ancestor HEAD "$TARGET_SHA" \
      || fail "Cannot fast-forward the VM checkout to $TARGET_SHA (are there commits made directly on the VM?)"
    deploy_sha=$TARGET_SHA
  fi
  echo "Current commit: $previous_sha"
  echo "Target commit:  $(git log -1 --format='%H %s' "$deploy_sha")"

  step "Comparing the target's effective Compose configuration with the running containers"
  # The target's docker-compose.yml is read from git into a temp file, so this check runs
  # before the checkout moves. --project-directory keeps relative paths and .env identical.
  target_base=$(mktemp)
  trap 'rm -f "$target_base"' EXIT
  git show "$deploy_sha:docker-compose.yml" > "$target_base"
  target_compose() { docker compose --project-directory . -f "$target_base" -f "$OVERRIDE" "$@"; }
  target_compose config --quiet \
    || fail "docker-compose.yml at ${deploy_sha:0:7} + $OVERRIDE is not a valid configuration ('!reset' needs Compose 2.24+). Nothing was changed"

  declare -A target_hash=()
  while read -r svc hash; do target_hash[$svc]=$hash; done < <(target_compose config --hash '*')

  changes=()
  for svc in "${ALL_SERVICES[@]}"; do
    [[ -n ${target_hash[$svc]:-} ]] || fail "Service '$svc' is not defined by docker-compose.yml + $OVERRIDE. Nothing was changed"
    cid=$(compose ps -q "$svc" 2>/dev/null || true)
    if [[ -z $cid ]]; then changes+=("$svc:not-running"); continue; fi
    running_hash=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.config-hash"}}' "$cid")
    [[ $running_hash == "${target_hash[$svc]}" ]] || changes+=("$svc:config")
  done
  for svc in "${STOCK_IMAGE_SERVICES[@]}"; do
    cid=$(compose ps -q "$svc" 2>/dev/null || true)
    [[ -n $cid ]] || continue
    read -r image_ref running_image < <(docker inspect -f '{{.Config.Image}} {{.Image}}' "$cid")
    local_image=$(docker image inspect -f '{{.Id}}' "$image_ref" 2>/dev/null || true)
    [[ $local_image == "$running_image" ]] || changes+=("$svc:image")
  done

  unexpected=()
  for change in "${changes[@]}"; do
    if [[ $allowed == *" ${change%%:*} "* ]]; then
      echo "Allowed change: $change"
    else
      unexpected+=("$change")
    fi
  done
  if ((${#unexpected[@]} > 0)); then
    fail "Refusing to deploy: these services would be created or recreated with a different configuration: ${unexpected[*]}. Nothing was changed on the VM. If this is intended, run the workflow manually with allow_config_change set to those service names (see docs/DEPLOYMENT.md)"
  fi
  if [[ " ${changes[*]} " == *" caddy:"* ]]; then
    echo "::warning::Caddy's configuration differs from its running container. Deploys never recreate Caddy; apply it yourself with: $COMPOSE_CMD up -d caddy"
  fi
  echo "Effective configuration check passed"

  step "Updating code to $deploy_sha"
  if [[ $deploy_sha != "$previous_sha" ]]; then
    git merge --ff-only --quiet "$deploy_sha" || fail "Fast-forward to $deploy_sha failed. Nothing else was changed"
  fi
  compose config --quiet || fail "$COMPOSE_CMD config failed after updating the checkout"

  step "Building app images: ${APP_SERVICES[*]}"
  # Build before touching containers: if this fails, the old containers keep serving traffic.
  compose build "${APP_SERVICES[@]}" \
    || fail "Image build failed. The running containers were not changed. The checkout is now at ${deploy_sha:0:7} (previous: $previous_sha) and was NOT reset; fix forward with a new commit, or see Rolling back in docs/DEPLOYMENT.md"

  step "Recreating changed containers"
  # Only the app services (and their dependencies) are named, so Caddy is never touched.
  # No --remove-orphans on purpose.
  compose up -d --no-build "${APP_SERVICES[@]}"

  step "Waiting for services to become healthy (timeout ${HEALTH_TIMEOUT}s)"
  deadline=$((SECONDS + HEALTH_TIMEOUT))
  while :; do
    pending=()
    for svc in "${ALL_SERVICES[@]}"; do
      cid=$(compose ps -q "$svc" 2>/dev/null || true)
      if [[ -z $cid ]]; then pending+=("$svc(not running)"); continue; fi
      state=$(docker inspect -f '{{.State.Status}}/{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$cid")
      [[ $state == running/healthy || $state == running/none ]] || pending+=("$svc($state)")
    done
    # Checked from inside the web container (it ships curl), because the host has no web port.
    # 401/403 means Spring answered and is enforcing auth; 502/504 means nginx cannot reach it yet.
    code=$(compose exec -T web curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://localhost/api/alerts </dev/null 2>/dev/null || true)
    [[ $code == 401 || $code == 403 ]] || pending+=("api-http($code)")
    code=$(compose exec -T web curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://localhost/ai/health </dev/null 2>/dev/null || true)
    [[ $code == 200 ]] || pending+=("ai-http($code)")

    ((${#pending[@]} == 0)) && break
    if ((SECONDS >= deadline)); then
      compose ps
      fail "Not healthy after ${HEALTH_TIMEOUT}s: ${pending[*]}. On the VM run: cd $APP_DIR && $COMPOSE_CMD logs --tail=200 <service>. To roll back see docs/DEPLOYMENT.md (previous commit: $previous_sha)"
    fi
    echo "  waiting: ${pending[*]}"
    sleep 10
  done

  step "Cleaning up dangling images"
  # Removes only untagged images left behind by the rebuild. It never touches volumes.
  docker image prune -f >/dev/null

  compose ps
  step "Deployed $(git rev-parse --short HEAD) successfully"
}

main "$@"
