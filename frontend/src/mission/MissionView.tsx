import { useEffect, useState, type ReactNode } from "react";
import { Banner, Chip, ErrorBanner, fmtClock } from "../components/ui";
import { api, type Access } from "../lib/api";
import { useLanguage } from "../lib/i18n";
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

export function MissionView({ sessionId, access, header }: {
  sessionId: string;
  access?: Access;
  header?: (ctx: { detail: SessionDetail; store: SessionStore }) => ReactNode;
}) {
  const { detail, error, store } = useSessionStream(sessionId, access);
  const [tab, setTab] = useState<MobileTab>("warnings");
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [lang] = useLanguage();
  const isAr = lang === "ar";
  useStoreVersion(store, 500);

  useEffect(() => {
    api<SystemInfo>("/system/info").then(setInfo).catch(() => undefined);
  }, []);

  // Listen for fullscreen change events and F11 key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "F11") {
        e.preventDefault();
        setIsFullscreen((prev) => !prev);
      }
      if (e.key === "Escape" && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isFullscreen]);

  if (error) return <ErrorBanner error={error} />;
  if (!detail) return <div className="empty">Loading session…</div>;

  return (
    <>
      {header ? header({ detail, store }) : (
        <div className="page-head">
          <SessionStatusBar detail={detail} store={store} />
          <div className="row" style={{ marginLeft: 16, gap: 8 }}>
            <button className="btn sm primary" onClick={() => setShowQr(true)}>
              🩺 Dr / Examiner QR
            </button>
            <button
              className="btn sm"
              onClick={() => setIsFullscreen(!isFullscreen)}
              title={isAr ? "شاشة كاملة (F11)" : "Toggle Fullscreen Presentation (F11)"}
            >
              {isFullscreen ? "🗗 Exit Fullscreen" : "⛶ Fullscreen"}
            </button>
          </div>
        </div>
      )}

      {showQr && <QrModal sessionId={sessionId} onClose={() => setShowQr(false)} />}
      {store.notice && <div className="notice-bar" role="alert">{store.notice}</div>}
      {info && info.ai.configured !== "local" && !info.ai.llm_available && (
        <Banner kind="warn">ASTRA AI is running on the local deterministic explainer: {info.ai.detail}</Banner>
      )}

      <div className={`mission ${isFullscreen ? "mission-fullscreen" : ""}`} data-tab={tab}>
        <MarsCanvas detail={detail} store={store} />

        {/* Exit fullscreen button overlay */}
        {isFullscreen && (
          <button
            className="btn sm solid-danger"
            style={{
              position: "fixed",
              top: 14,
              right: 14,
              zIndex: 10000,
              boxShadow: "0 2px 10px rgba(0,0,0,0.8)",
            }}
            onClick={() => setIsFullscreen(false)}
          >
            ✕ {isAr ? "إنهاء ملء الشاشة (ESC)" : "Exit Fullscreen (ESC)"}
          </button>
        )}

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
