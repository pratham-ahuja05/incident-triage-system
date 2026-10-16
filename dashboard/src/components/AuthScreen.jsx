import { useState } from "react";
import { IconMark } from "./Icons";
import { DEMO_LOGIN, loginRequest, registerRequest } from "../api";

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
        <div className="brand-mark" aria-hidden="true">
          <IconMark />
        </div>
        <p className="auth-kicker">Incident Triage</p>
        <h1 className="auth-headline">Triage production alerts before they become pages.</h1>
        <p className="auth-copy">
          Match incoming logs against resolved incidents, auto-suggest proven fixes, and escalate only when the case is new.
        </p>
        <ul className="auth-points">
          <li>RAG search over the incident knowledge base</li>
          <li>AI suggests a proven fix or escalates — people approve</li>
          <li>Human review feeds confirmed resolutions back in</li>
        </ul>
      </section>

      <div className="auth-card-wrap">
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
              <button type="button" className="link-btn" onClick={() => setShowPassword((v) => !v)} aria-pressed={showPassword}>
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

          {error && <p className="form-error" role="alert">{error}</p>}

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
      </div>
    </div>
  );
}

export default AuthScreen;
