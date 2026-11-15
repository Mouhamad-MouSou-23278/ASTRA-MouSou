import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Brand, Layout } from "../components/Layout";
import { Banner, Chip, ErrorBanner, fmtClock, fmtDate, useAction, useLoad } from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { SessionDetail, SessionState, SessionSummary } from "../lib/types";
import { MissionView, SessionStatusBar } from "../mission/MissionView";
import { useStoreVersion, type SessionStore } from "../mission/store";

/** Read-only session list for staff who watch but do not operate (viewer role, admin, teams). */
export function SessionsPage() {
  const sessions = useLoad(() => api<SessionSummary[]>("/sessions"));
  useEffect(() => {
    const id = window.setInterval(() => void sessions.reload(), 4000);
    return () => window.clearInterval(id);
  }, [sessions.reload]);
  return (
    <Layout>
      <div className="page-head"><h1>Simulation sessions</h1><span className="muted">Open a session to watch the live 3D scene, telemetry and warnings.</span></div>
      <section className="panel">
        <div className="panel-body">
          <ErrorBanner error={sessions.error} />
          <div className="table-wrap">
            <table>
              <thead><tr><th>Session</th><th>Status</th><th>Mission time</th><th>Operator</th><th>Created</th><th /></tr></thead>
              <tbody>
                {sessions.data?.map((s) => (
                  <tr key={s.id}>
                    <td><Link to={`/watch/${s.id}`}><b>{s.name}</b></Link><div className="muted small">seed {s.seed} · plan: {s.plan_source}</div></td>
                    <td><Chip kind={s.status}>{s.status}</Chip></td>
                    <td className="num">{fmtClock(s.sim_time)} / {fmtClock(s.duration_s)}</td>
                    <td className="small">{s.created_by}</td><td className="small muted">{fmtDate(s.created_at)}</td>
                    <td className="actions"><Link className="btn sm primary" to={`/watch/${s.id}`}>Watch</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {sessions.data?.length === 0 && <div className="empty">No sessions exist yet. A Test Operator creates them.</div>}
        </div>
      </section>
    </Layout>
  );
}

function WatchHeader({ detail, store }: { detail: SessionDetail; store: SessionStore }) {
  const { user } = useAuth();
  useStoreVersion(store, 300);
  const act = useAction();
  const s = store.state ?? detail.session;
  const active = s.status === "running" || s.status === "paused";
  return (
    <>
      <div className="page-head">
        <SessionStatusBar detail={detail} store={store} />
        <Chip>read-only</Chip>
        {user?.role === "admin" && (
          <button className="btn danger" disabled={!active || act.busy} title="Administrator override"
            onClick={() => act.run(async () => store.applyState(await api<SessionState>(`/sessions/${detail.session.id}/control`, { body: { action: "stop" } })))}>
            ■ Stop (override)
          </button>
        )}
      </div>
      <ErrorBanner error={act.error} />
    </>
  );
}

export function WatchPage() {
  const { id } = useParams();
  return (
    <Layout wide>
      <div className="small" style={{ marginBottom: 8 }}><Link to="/sessions">← Sessions</Link></div>
      {id && <MissionView sessionId={id} header={(ctx) => <WatchHeader {...ctx} />} />}
    </Layout>
  );
}

import { DoctorExaminerConsole } from "../components/DoctorExaminerConsole";
import { useSessionStream } from "../mission/store";

/**
 * Instrument Viewer reached by scanning a QR code. There is no login: the token
 * in the URL is exchanged for the one session it is allowed to watch.
 */
export function ViewerPage() {
  const { token = "" } = useParams();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [expires, setExpires] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [viewMode, setViewMode] = useState<"mission" | "doctor">("doctor");

  useEffect(() => {
    setSessionId(null);
    setError(null);
    api<{ session_id: string; expires_at: string }>(`/viewer/resolve?token=${encodeURIComponent(token)}`)
      .then((r) => { setSessionId(r.session_id); setExpires(r.expires_at); })
      .catch(setError);
  }, [token]);

  const stream = useSessionStream(sessionId, { viewerToken: token });

  return (
    <div className="app">
      <header className="topbar">
        <Brand sub="INSTRUMENT VIEWER" />
        <div className="row gap-xs" style={{ margin: "0 16px" }}>
          <button
            className={`btn sm ${viewMode === "doctor" ? "primary" : ""}`}
            onClick={() => setViewMode("doctor")}
          >
            🩺 Doctor / Clinical Mode
          </button>
          <button
            className={`btn sm ${viewMode === "mission" ? "primary" : ""}`}
            onClick={() => setViewMode("mission")}
          >
            🛰️ 3D Mission Scene
          </button>
        </div>
        <span className="grow" />
        <span className="sim-banner">SIMULATED DATA</span>
      </header>
      <main className="page wide">
        {error ? (
          <div className="center-screen" style={{ minHeight: "60vh" }}>
            <div className="panel" style={{ maxWidth: 460 }}>
              <div className="panel-body">
                <h2 style={{ marginBottom: 8 }}>This viewer link is not valid</h2>
                <ErrorBanner error={error} />
                <p className="muted">Viewer links expire automatically and can be revoked by the Test Operator. Ask for a new QR code.</p>
              </div>
            </div>
          </div>
        ) : sessionId && stream.detail ? (
          <>
            {viewMode === "doctor" ? (
              <DoctorExaminerConsole detail={stream.detail} store={stream.store} />
            ) : (
              <MissionView sessionId={sessionId} access={{ viewerToken: token }} />
            )}
            <p className="muted small" style={{ marginTop: 10 }}>
              Read-only access to this session only{expires ? `, valid until ${fmtDate(expires)}` : ""}. Camera and panel choices stay on this device.
            </p>
          </>
        ) : (
          <div className="empty">Opening the live session…</div>
        )}
      </main>
    </div>
  );
}

export function NotFound() {
  return (
    <div className="center-screen">
      <div style={{ textAlign: "center" }}>
        <Brand />
        <Banner kind="info">That page does not exist.</Banner>
        <Link to="/">Back to ASTRA</Link>
      </div>
    </div>
  );
}
