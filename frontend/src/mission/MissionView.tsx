import { useEffect, useState, type ReactNode } from "react";
import { Banner, Chip, ErrorBanner, fmtClock } from "../components/ui";
import { api, type Access } from "../lib/api";
import type { SessionDetail, SystemInfo } from "../lib/types";
import { ChatPanel } from "./ChatPanel";
import { MarsCanvas } from "./MarsCanvas";
import { TelemetryPanel, TimelinePanel, WarningsPanel } from "./panels";
import { useSessionStream, useStoreVersion, type SessionStore } from "./store";

import { DoctorExaminerConsole } from "../components/DoctorExaminerConsole";
import { QrModal } from "../pages/OperatorPage";

type MobileTab = "doctor" | "telemetry" | "warnings" | "astra" | "timeline";

export function SessionStatusBar({ detail, store }: { detail: SessionDetail; store: SessionStore }) {
  useStoreVersion(store, 300);
  const s = store.state ?? detail.session;
  const pct = Math.min(100, (s.sim_time / Math.max(s.duration_s, 1)) * 100);
  return (
    <div className="grow" style={{ minWidth: 220 }}>
      <div className="row">
        <h1 style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "46ch" }}>{s.name}</h1>
        <Chip kind={s.status}>{s.status}</Chip>
        {!store.connected && <Chip kind="caution">reconnecting…</Chip>}
        <span className="clock-lg right">{fmtClock(s.sim_time)}</span>
        <span className="muted num">/ {fmtClock(s.duration_s)}</span>
      </div>
      <div className="progress" style={{ marginTop: 6 }} aria-hidden><i style={{ width: `${pct}%` }} /></div>
      <div className="muted small" style={{ marginTop: 4 }}>
        {detail.astronaut.callsign ? `${detail.astronaut.callsign} · ${detail.astronaut.full_name} · ` : ""}
        seed {detail.session.seed} · run {s.run} · {s.speed}× · plan: {detail.session.plan_source}
        {s.end_reason ? ` · ${s.end_reason}` : ""}
      </div>
    </div>
  );
}

/**
 * The shared live view used by the Test Operator console, the staff watch page
 * and the QR Instrument Viewer. It is strictly read-only: playback controls are
 * injected by the operator page through `header` and call RBAC-protected REST
 * endpoints. Camera, pinned charts and tabs are local view state.
 */
export function MissionView({ sessionId, access, header }: {
  sessionId: string;
  access?: Access;
  header?: (ctx: { detail: SessionDetail; store: SessionStore }) => ReactNode;
}) {
  const { detail, error, store } = useSessionStream(sessionId, access);
  const [tab, setTab] = useState<MobileTab>("warnings");
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [showQr, setShowQr] = useState(false);
  useStoreVersion(store, 500);

  useEffect(() => { api<SystemInfo>("/system/info").then(setInfo).catch(() => undefined); }, []);

  if (error) return <ErrorBanner error={error} />;
  if (!detail) return <div className="empty">Loading session…</div>;

  return (
    <>
      {header ? header({ detail, store }) : (
        <div className="page-head">
          <SessionStatusBar detail={detail} store={store} />
          <div className="row" style={{ marginLeft: 16 }}>
            <button className="btn sm primary" onClick={() => setShowQr(true)}>
              🩺 Dr / Examiner QR
            </button>
          </div>
        </div>
      )}
      {showQr && <QrModal sessionId={sessionId} onClose={() => setShowQr(false)} />}
      {store.notice && <div className="notice-bar" role="alert">{store.notice}</div>}
      {info && info.ai.configured !== "local" && !info.ai.llm_available && (
        <Banner kind="warn">ASTRA AI is running on the local deterministic explainer: {info.ai.detail}</Banner>
      )}
      <div className="mission" data-tab={tab}>
        <MarsCanvas detail={detail} store={store} />
        <div className="mobile-tabs" role="tablist">
          <button role="tab" aria-selected={tab === "doctor"} className={`tab ${tab === "doctor" ? "active" : ""}`} onClick={() => setTab("doctor")} style={{ color: "#34d399", fontWeight: "bold" }}>
            🩺 Doctor Mode
          </button>
          {(["warnings", "astra", "telemetry", "timeline"] as MobileTab[]).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className={`tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
              {t === "astra" ? "ASTRA AI" : t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        {tab === "doctor" ? (
          <div className="side" style={{ gridColumn: "span 2" }}>
            <DoctorExaminerConsole detail={detail} store={store} />
          </div>
        ) : (
          <>
            <div className="side">
              <WarningsPanel store={store} />
              <ChatPanel sessionId={sessionId} access={access} speech={info?.speech ?? null} />
            </div>
            <TelemetryPanel detail={detail} store={store} />
            <TimelinePanel detail={detail} store={store} />
          </>
        )}
      </div>
    </>
  );
}
