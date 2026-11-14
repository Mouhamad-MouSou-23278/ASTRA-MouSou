import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Layout, ROLE_LABEL } from "../components/Layout";
import { Banner, Chip, ErrorBanner, Field, Modal, Tabs, fmtClock, fmtDate, useAction, useLoad } from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { Role, SessionState, User } from "../lib/types";

const ROLES: Role[] = ["admin", "physical", "medical", "operator", "viewer"];

interface Overview {
  users: { total: number; active: number; by_role: Record<string, number> };
  sensors: Record<string, number>;
  medical: Record<string, number>;
  sessions: Record<string, number>;
  warnings: Record<string, number>;
  viewer_tokens_active: number;
  running_now: SessionState[];
  simulation_lock: boolean;
}
interface ConfigRow { key: string; value: unknown; description: string; updated_by: string; updated_at: string }
interface AuditRow { id: number; ts: string; username: string; role: string; action: string; entity_type: string; entity_id: string; detail: Record<string, unknown> }

function OverviewTab() {
  const overview = useLoad(() => api<Overview>("/admin/overview"));
  const [stopping, setStopping] = useState(false);
  const [reason, setReason] = useState("");
  const act = useAction();
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => void overview.reload(), 4000);
    return () => window.clearInterval(id);
  }, [overview.reload]);

  const stop = () => act.run(async () => {
    const res = await api<{ stopped: string[] }>("/admin/emergency-stop", { body: { reason } });
    setResult(`Emergency stop executed: ${res.stopped.length} simulation${res.stopped.length === 1 ? "" : "s"} aborted. New starts are locked.`);
    setStopping(false);
    setReason("");
    await overview.reload();
  });
  const setLock = (locked: boolean) => act.run(async () => {
    await api("/admin/simulation-lock", { body: { locked } });
    await overview.reload();
  });
  const o = overview.data;
  const sum = (r?: Record<string, number>) => Object.values(r ?? {}).reduce((a, b) => a + b, 0);

  return (
    <>
      <ErrorBanner error={overview.error ?? act.error} />
      {result && <Banner kind="warn">{result}</Banner>}
      <section className="panel" style={{ marginBottom: 14 }}>
        <div className="panel-head">
          <h3>Simulation safety</h3>
          {o && <Chip kind={o.simulation_lock ? "critical" : "ok"}>{o.simulation_lock ? "starts locked" : "starts allowed"}</Chip>}
        </div>
        <div className="panel-body row">
          <button className="btn solid-danger" onClick={() => setStopping(true)}>■ EMERGENCY STOP ALL SIMULATIONS</button>
          {o?.simulation_lock
            ? <button className="btn" disabled={act.busy} onClick={() => setLock(false)}>Release lock</button>
            : <button className="btn" disabled={act.busy} onClick={() => setLock(true)}>Lock new starts</button>}
          <span className="muted small">Emergency stop aborts every running or paused session, overriding operators, and locks new starts until released.</span>
        </div>
      </section>
      {o && (
        <>
          <div className="stats">
            <div className="stat card"><span className="label">Users (active)</span><b>{o.users.active}/{o.users.total}</b></div>
            <div className="stat card"><span className="label">Active sensors</span><b>{o.sensors.active ?? 0}</b><span className="muted small">{o.sensors.draft ?? 0} draft · {o.sensors.archived ?? 0} archived</span></div>
            <div className="stat card"><span className="label">Medical rules</span><b>{o.medical.rules_enabled}/{o.medical.rules}</b><span className="muted small">{o.medical.conditions} conditions · {o.medical.sources} sources</span></div>
            <div className="stat card"><span className="label">Sessions</span><b>{sum(o.sessions)}</b><span className="muted small">{o.sessions.running ?? 0} running · {o.sessions.completed ?? 0} completed</span></div>
            <div className="stat card"><span className="label">Warnings recorded</span><b>{sum(o.warnings)}</b><span className="muted small">{o.warnings.medical ?? 0} medical · {o.warnings.data_quality ?? 0} data quality</span></div>
            <div className="stat card"><span className="label">Live viewer links</span><b>{o.viewer_tokens_active}</b></div>
          </div>
          <section className="panel">
            <div className="panel-head"><h3>Running now</h3></div>
            <div className="panel-body">
              {o.running_now.length === 0 && <div className="muted">No simulation is running.</div>}
              {o.running_now.map((s) => (
                <div className="row" key={s.id} style={{ padding: "4px 0" }}>
                  <Chip kind={s.status}>{s.status}</Chip><b>{s.name}</b>
                  <span className="num muted">{fmtClock(s.sim_time)} / {fmtClock(s.duration_s)} · {s.speed}×</span>
                  <Link className="btn sm right" to={`/watch/${s.id}`}>Watch</Link>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
      {stopping && (
        <Modal title="Emergency stop" onClose={() => setStopping(false)} footer={
          <><button className="btn" onClick={() => setStopping(false)}>Cancel</button>
            <button className="btn solid-danger" disabled={act.busy || reason.trim().length < 3} onClick={stop}>Stop all simulations</button></>
        }>
          <p>Every running or paused simulation will be aborted immediately and new starts will be locked. This is recorded in the audit log.</p>
          <Field label="Reason (required)"><input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} autoFocus /></Field>
        </Modal>
      )}
    </>
  );
}

function UsersTab() {
  const { user: me } = useAuth();
  const users = useLoad(() => api<User[]>("/admin/users"));
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ username: "", full_name: "", role: "viewer" as Role, password: "" });
  const [resetting, setResetting] = useState<User | null>(null);
  const [password, setPassword] = useState("");
  const act = useAction();
  const patch = (u: User, body: Record<string, unknown>) => act.run(async () => {
    await api(`/admin/users/${u.id}`, { method: "PATCH", body });
    await users.reload();
  });
  const create = () => act.run(async () => {
    await api("/admin/users", { body: form });
    setCreating(false);
    setForm({ username: "", full_name: "", role: "viewer", password: "" });
    await users.reload();
  });
  const reset = () => act.run(async () => {
    if (!resetting) return;
    await api(`/admin/users/${resetting.id}/reset-password`, { body: { password } });
    setResetting(null);
    setPassword("");
  });
  return (
    <section className="panel">
      <div className="panel-head"><h3>Users &amp; roles</h3><span className="muted small">no public registration: accounts are provisioned here</span>
        <button className="btn primary sm right" onClick={() => { act.clear(); setCreating(true); }}>+ New user</button></div>
      <div className="panel-body">
        <ErrorBanner error={users.error ?? (creating || resetting ? null : act.error)} />
        <div className="table-wrap">
          <table>
            <thead><tr><th>User</th><th>Role</th><th>Status</th><th>Last sign-in</th><th>Created</th><th /></tr></thead>
            <tbody>
              {users.data?.map((u) => (
                <tr key={u.id}>
                  <td><b>{u.username}</b>{u.id === me?.id && <span className="muted small"> (you)</span>}<div className="muted small">{u.full_name}</div></td>
                  <td>
                    <select value={u.role} disabled={act.busy} onChange={(e) => patch(u, { role: e.target.value })} style={{ width: "auto" }} aria-label={`Role of ${u.username}`}>
                      {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                    </select>
                  </td>
                  <td><Chip kind={u.is_active ? "ok" : "inactive"}>{u.is_active ? "active" : "disabled"}</Chip></td>
                  <td className="small muted">{fmtDate(u.last_login_at)}</td><td className="small muted">{fmtDate(u.created_at)}</td>
                  <td className="actions">
                    <button className="btn sm" onClick={() => { act.clear(); setResetting(u); }}>Reset password</button>
                    <button className={`btn sm ${u.is_active ? "danger" : ""}`} disabled={act.busy} onClick={() => patch(u, { is_active: !u.is_active })}>
                      {u.is_active ? "Disable" : "Enable"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {creating && (
        <Modal title="New user" onClose={() => setCreating(false)} footer={
          <><button className="btn" onClick={() => setCreating(false)}>Cancel</button><button className="btn primary" disabled={act.busy} onClick={create}>Create user</button></>}>
          <ErrorBanner error={act.error} />
          <div className="form-grid">
            <Field label="Username *" help="lowercase letters, digits, . _ -"><input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })} autoFocus /></Field>
            <Field label="Full name"><input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></Field>
            <Field label="Role *"><select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></Field>
            <Field label="Initial password *" help="at least 8 characters"><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" /></Field>
          </div>
        </Modal>
      )}
      {resetting && (
        <Modal title={`Reset password — ${resetting.username}`} onClose={() => setResetting(null)} footer={
          <><button className="btn" onClick={() => setResetting(null)}>Cancel</button><button className="btn primary" disabled={act.busy || password.length < 8} onClick={reset}>Set password</button></>}>
          <ErrorBanner error={act.error} />
          <Field label="New password" help="at least 8 characters"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" autoFocus /></Field>
        </Modal>
      )}
    </section>
  );
}

function ConfigTab() {
  const config = useLoad(() => api<ConfigRow[]>("/admin/config"));
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const act = useAction();
  const save = (row: ConfigRow) => act.run(async () => {
    const raw = drafts[row.key];
    let value: unknown = raw;
    if (typeof row.value === "boolean") value = raw === "true";
    else if (typeof row.value === "number") { value = Number(raw); if (Number.isNaN(value)) throw new Error(`${row.key} must be a number`); }
    await api(`/admin/config/${row.key}`, { method: "PUT", body: { value } });
    setDrafts((d) => { const { [row.key]: _, ...rest } = d; return rest; });
    await config.reload();
  });
  return (
    <section className="panel">
      <div className="panel-head"><h3>System configuration</h3></div>
      <div className="panel-body">
        <ErrorBanner error={config.error ?? act.error} />
        <div className="table-wrap">
          <table>
            <thead><tr><th>Setting</th><th style={{ width: 260 }}>Value</th><th>Last change</th><th /></tr></thead>
            <tbody>
              {config.data?.map((row) => {
                const current = drafts[row.key] ?? String(row.value);
                const dirty = row.key in drafts && drafts[row.key] !== String(row.value);
                const set = (v: string) => setDrafts((d) => ({ ...d, [row.key]: v }));
                return (
                  <tr key={row.key}>
                    <td><span className="mono">{row.key}</span><div className="muted small">{row.description}</div></td>
                    <td>
                      {typeof row.value === "boolean" ? (
                        <select value={current} onChange={(e) => set(e.target.value)} aria-label={row.key}><option value="true">true</option><option value="false">false</option></select>
                      ) : row.key === "ai_mode" ? (
                        <select value={current} onChange={(e) => set(e.target.value)} aria-label={row.key}><option value="auto">auto</option><option value="local_only">local_only</option></select>
                      ) : (
                        <input type={typeof row.value === "number" ? "number" : "text"} value={current} onChange={(e) => set(e.target.value)} aria-label={row.key} />
                      )}
                    </td>
                    <td className="small muted">{row.updated_by} · {fmtDate(row.updated_at)}</td>
                    <td className="actions"><button className="btn sm primary" disabled={!dirty || act.busy} onClick={() => save(row)}>Save</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function AuditTab() {
  const [action, setAction] = useState("");
  const [username, setUsername] = useState("");
  const [limit, setLimit] = useState(100);
  const query = new URLSearchParams({ limit: String(limit) });
  if (action) query.set("action", action);
  if (username) query.set("username", username);
  const audit = useLoad(() => api<AuditRow[]>(`/admin/audit?${query}`), [action, username, limit]);
  return (
    <section className="panel">
      <div className="panel-head">
        <h3>Audit log</h3>
        <div className="row right">
          <input placeholder="action prefix, e.g. sensor." value={action} onChange={(e) => setAction(e.target.value.trim())} style={{ width: 200 }} aria-label="Filter by action" />
          <input placeholder="username" value={username} onChange={(e) => setUsername(e.target.value.trim())} style={{ width: 130 }} aria-label="Filter by user" />
          <button className="btn sm" onClick={() => void audit.reload()}>Refresh</button>
        </div>
      </div>
      <div className="panel-body">
        <ErrorBanner error={audit.error} />
        <div className="table-wrap">
          <table>
            <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Entity</th><th>Detail</th></tr></thead>
            <tbody>
              {audit.data?.map((a) => (
                <tr key={a.id}>
                  <td className="small nowrap">{fmtDate(a.ts)}</td>
                  <td>{a.username} <span className="muted small">({a.role})</span></td>
                  <td className="mono small">{a.action}</td>
                  <td className="small">{a.entity_type}{a.entity_id ? ` #${a.entity_id}` : ""}</td>
                  <td className="small muted mono" style={{ overflowWrap: "anywhere" }}>{Object.keys(a.detail).length ? JSON.stringify(a.detail) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {audit.data?.length === 0 && <div className="empty">No matching audit entries.</div>}
        {audit.data && audit.data.length >= limit && limit < 500 && (
          <button className="btn sm" style={{ marginTop: 10 }} onClick={() => setLimit((l) => Math.min(500, l + 200))}>Load more</button>
        )}
      </div>
    </section>
  );
}

export function AdminPage() {
  const [tab, setTab] = useState<"overview" | "users" | "config" | "audit">("overview");
  return (
    <Layout>
      <div className="page-head"><h1>Administration</h1>
        <span className="muted">Users and roles, system configuration, audit trail, global review and emergency stop.</span></div>
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: "overview", label: "Overview & safety" }, { id: "users", label: "Users & roles" },
        { id: "config", label: "Configuration" }, { id: "audit", label: "Audit log" },
      ]} />
      {tab === "overview" && <OverviewTab />}
      {tab === "users" && <UsersTab />}
      {tab === "config" && <ConfigTab />}
      {tab === "audit" && <AuditTab />}
    </Layout>
  );
}
