import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Brand, ROLE_LABEL } from "../components/Layout";
import { ErrorBanner, Field } from "../components/ui";
import { api } from "../lib/api";
import { HOME, useAuth } from "../lib/auth";
import type { Role, SystemInfo } from "../lib/types";

const DEMO_ROLES: Role[] = ["admin", "physical", "medical", "operator", "viewer"];

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<(SystemInfo & { demo_login?: boolean }) | null>(null);

  useEffect(() => { api<SystemInfo>("/system/info").then(setInfo).catch(() => undefined); }, []);

  if (user) return <Navigate to={HOME[user.role]} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const u = await login(username.trim().toLowerCase(), password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from !== "/login" ? from : HOME[u.role], { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <div className="login">
        <Brand />
        <p className="muted" style={{ marginBottom: 18 }}>Astronaut health monitoring &amp; Mars mission simulation</p>
        <form className="panel" onSubmit={submit}>
          <div className="panel-body col gap-lg">
            <ErrorBanner error={error} />
            <Field label="Username"><input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus required /></Field>
            <Field label="Password"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></Field>
            <button className="btn primary" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
            <p className="faint small" style={{ margin: 0 }}>Accounts are provisioned by an administrator. There is no self-registration.</p>
          </div>
        </form>
        {info?.demo_login && (
          <div style={{ marginTop: 16 }}>
            <div className="label">Demo accounts</div>
            <div className="demo-users">
              {DEMO_ROLES.map((r) => (
                <button key={r} type="button" className="btn sm" title={`Fill the ${ROLE_LABEL[r]} demo credentials`}
                  onClick={() => { setUsername(r); setPassword(`astra-${r}-2026`); }}>
                  {ROLE_LABEL[r]}
                </button>
              ))}
            </div>
            <p className="faint small" style={{ marginTop: 8 }}>
              Demo credentials are seeded for evaluation and listed in the README. Change them before any real use.
            </p>
          </div>
        )}
        {info && (
          <p className="faint small" style={{ marginTop: 16 }}>
            v{info.version} · database: {info.database} · ASTRA AI: {info.ai.active} · speech: {info.speech.provider} · all data is simulated
          </p>
        )}
      </div>
    </div>
  );
}
