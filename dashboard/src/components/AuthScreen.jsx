import { useState } from "react";
import { IconMark, IconSearch, IconSparkle, IconUserCheck, IconKanban } from "./Icons";
import PipelineStepper from "./PipelineStepper";
import LogWall from "./LogWall";
import { STAGES, useLoopingCount } from "../lib/pipeline";
import { DEMO_LOGIN, loginRequest, registerRequest } from "../api";

// Illustrative only: shows how a typical alert moves through the pipeline. Labelled "Example" in the UI.
const PREVIEW_STAGES = STAGES.map((s, i) => ({
  ...s,
  state: "done",
  tone: i === 4 ? "success" : undefined,
  note: ["Stored", "12 ms wait", "85% match", "Confirmed", "Fix suggested", "Awaiting review"][i],
}));

const FEATURES = [
  {
    icon: IconSearch,
    title: "Retrieval over past fixes",
    body: "pgvector search finds the closest incident your team already solved.",
  },
  {
    icon: IconSparkle,
    title: "Explainable AI",
    body: "An LLM verifies the match and writes evidence-linked hypotheses.",
  },
  {
    icon: IconUserCheck,
    title: "Humans decide",
    body: "Suggestions are never applied automatically — people approve.",
  },
  {
    icon: IconKanban,
    title: "Workflow & SLAs",
    body: "Priorities, due dates, Kanban, calendar and a full audit trail.",
  },
];

function AuthPreview() {
  const visible = useLoopingCount(PREVIEW_STAGES.length, 900);
  return (
    <div className="auth-preview" aria-hidden="true">
      <div className="auth-preview-head">
        <span className="dup-key">INC-1042</span>
        <span className="auth-preview-src">checkout-service</span>
        <span className="auth-preview-tag">Example</span>
      </div>
      <p className="auth-preview-msg">Error: Unable to connect to Redis at cache-01:6379, connection refused</p>
      <PipelineStepper stages={PREVIEW_STAGES} visible={visible} />
    </div>
  );
}

// Seeded by DataInitializationConfig.java — local demo only.
const DEMO_ACCOUNTS = [
  { username: "admin", role: "Admin" },
  { username: "analyst", role: "Analyst" },
  { username: "viewer", role: "Viewer" },
];
const DEMO_PASSWORD = "password123";

function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const isRegister = mode === "register";

  const authenticate = async (user, pass) => {
    setError("");
    setSubmitting(true);
    try {
      const session = isRegister
        ? await registerRequest(user.trim(), email.trim(), pass)
        : await loginRequest(user.trim(), pass);
      onAuthenticated(session);
    } catch (err) {
      setError(err.message || "Authentication failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    authenticate(username, password);
  };

  const signInAsDemo = (account) => {
    setUsername(account.username);
    setPassword(DEMO_PASSWORD);
    authenticate(account.username, DEMO_PASSWORD);
  };

  return (
    <div className="auth-shell">
      <section className="auth-panel">
        <div className="auth-hero">
          <div className="auth-brand">
            <span className="brand-mark" aria-hidden="true">
              <IconMark />
            </span>
            <span className="brand-copy">
              <span className="brand-name">Incident Triage</span>
              <span className="brand-sub">AI-assisted incident response</span>
            </span>
          </div>

          <h1 className="auth-headline">
            Triage production alerts <span className="auth-accent">before they become pages.</span>
          </h1>
          <p className="auth-copy">
            Every alert is matched against incidents your team already solved. Known problems get the proven fix
            suggested in seconds; new ones go straight to an engineer — with the evidence attached.
          </p>

          <AuthPreview />

          <ul className="auth-features">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <li key={f.title}>
                  <span className="auth-feature-icon" aria-hidden="true">
                    <Icon size={15} />
                  </span>
                  <span>
                    <strong>{f.title}</strong>
                    <span>{f.body}</span>
                  </span>
                </li>
              );
            })}
          </ul>

          <p className="auth-stack">React · Spring Boot · PostgreSQL + pgvector · Redis · Groq LLM · Docker</p>
        </div>
      </section>

      <div className="auth-card-wrap">
        <LogWall />
        <form className="auth-card" onSubmit={handleSubmit}>
          <div>
            <h2 className="modal-title">{isRegister ? "Create an account" : "Sign in"}</h2>
            <p className="modal-sub">
              {isRegister
                ? "New accounts start as Viewer. Analyst access is required to report or review issues."
                : "Use your Incident Triage credentials."}
            </p>
          </div>

          <label className="field">
            <span>Username</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
              minLength={3}
              autoFocus
            />
          </label>

          {isRegister && (
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </label>
          )}

          <label className="field">
            <span className="field-label-row">
              Password
              <button
                type="button"
                className="link-btn"
                onClick={() => setShowPassword((v) => !v)}
                aria-pressed={showPassword}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </span>
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isRegister ? "new-password" : "current-password"}
              required
              minLength={isRegister ? 6 : 1}
            />
          </label>

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? "Please wait…" : isRegister ? "Create account" : "Sign in"}
          </button>

          <button
            type="button"
            className="auth-switch"
            onClick={() => {
              setMode(isRegister ? "login" : "register");
              setError("");
            }}
          >
            {isRegister ? "Already have an account? Sign in" : "Need an account? Register"}
          </button>

          {!isRegister && DEMO_LOGIN && (
            <div className="demo-accounts">
              <span className="detail-label">Demo accounts</span>
              <div className="demo-buttons">
                {DEMO_ACCOUNTS.map((account) => (
                  <button
                    key={account.username}
                    type="button"
                    className="btn btn-small"
                    onClick={() => signInAsDemo(account)}
                    disabled={submitting}
                  >
                    {account.role}
                  </button>
                ))}
              </div>
            </div>
          )}
        </form>
        <p className="auth-footnote">JWT sessions · role-based access for Admin, Analyst and Viewer</p>
      </div>
    </div>
  );
}

export default AuthScreen;
