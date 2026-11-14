import { useMemo, useState } from "react";
import { Chip, digitsFor, fmtClock, fmtNum, unitLabel } from "../components/ui";
import type { SessionDetail, SimEvent, Warning } from "../lib/types";
import { LineChart } from "./Chart";
import { useStoreVersion, type SessionStore } from "./store";

/** Compact display of a computed rule value (precision follows magnitude). */
const smart = (v: number | null): string =>
  v === null ? "—" : Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2);

const CATEGORIES: { id: string; label: string }[] = [
  { id: "physiological", label: "Physiological" },
  { id: "spacesuit", label: "Spacesuit" },
  { id: "environmental", label: "Environmental" },
];

// ------------------------------------------------------------------ telemetry
export function TelemetryPanel({ detail, store }: { detail: SessionDetail; store: SessionStore }) {
  const version = useStoreVersion(store, 400);
  const available = detail.sensors.map((s) => s.key);
  const [pinned, setPinned] = useState<string[]>(() =>
    ["core_temp", "heart_rate", "rad_dose_rate"].filter((k) => available.includes(k)));
  const [showTruth, setShowTruth] = useState(true);
  const [windowS, setWindowS] = useState<number | undefined>(undefined);
  const frame = store.frame;

  const thresholds = useMemo(() => {
    const out: Record<string, { value: number; label: string }[]> = {};
    for (const rule of detail.rules) {
      for (const c of rule.clauses) {
        const agg = c.aggregation ?? "last";
        if (agg === "slope_per_min" || agg === "delta") continue;
        (out[c.sensor_key] ??= []).push({ value: c.threshold, label: `${rule.severity} ${c.operator} ${c.threshold}` });
      }
    }
    return out;
  }, [detail.rules]);

  const toggle = (key: string) =>
    setPinned((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key].slice(-4)));

  return (
    <section className="panel tele">
      <div className="panel-head">
        <h3>Telemetry</h3>
        <span className="muted small">sensor output · {detail.sensors.length} active sensors</span>
        <div className="row right">
          <label className="check small"><input type="checkbox" checked={showTruth} onChange={(e) => setShowTruth(e.target.checked)} />show simulation ground truth</label>
          <select value={windowS ?? ""} onChange={(e) => setWindowS(e.target.value ? Number(e.target.value) : undefined)}
            style={{ width: "auto", padding: "3px 6px" }} aria-label="Chart time window">
            <option value="">whole run</option>
            <option value="120">last 2 min</option>
            <option value="300">last 5 min</option>
          </select>
        </div>
      </div>
      <div className="panel-body">
        <div className="focus-grid">
          {pinned.map((key) => {
            const meta = detail.sensors.find((s) => s.key === key);
            if (!meta) return null;
            const reading = frame?.sensors[key];
            const s = store.series[key];
            const truth = showTruth && meta.channel ? store.truth[meta.channel] : undefined;
            const value = reading?.[0] ?? null;
            return (
              <div className="chart-card" key={key}>
                <div className="chart-head">
                  <span className={`dot ${reading?.[1] ?? ""}`} title={`data quality: ${reading?.[1] ?? "no data"}`} />
                  <b>{meta.name}</b>
                  <span className="val right">{fmtNum(value, digitsFor(meta.unit, value))}</span>
                  <span className="muted small">{unitLabel(meta.unit)}</span>
                </div>
                <LineChart version={version} windowS={windowS}
                  series={{ t: store.t, v: s?.v ?? [], q: s?.q, truth, thresholds: thresholds[key] }} />
                <div className="legend">
                  <span><i style={{ borderColor: "#4dc9f0" }} />sensor output</span>
                  {truth && <span><i style={{ borderColor: "#8a97a8", borderTopStyle: "dashed" }} />ground truth</span>}
                  {thresholds[key] && <span><i style={{ borderColor: "#ff7a3d", borderTopStyle: "dashed" }} />rule threshold</span>}
                  {reading && reading[2].length > 0 && <Chip kind="dq">{reading[2].join(" · ").replace(/_/g, " ")}</Chip>}
                </div>
              </div>
            );
          })}
        </div>
        {CATEGORIES.map((cat) => {
          const sensors = detail.sensors.filter((s) => s.category === cat.id);
          if (!sensors.length) return null;
          return (
            <div key={cat.id}>
              <div className="label cat-title">{cat.label}</div>
              <div className="sensor-grid">
                {sensors.map((meta) => {
                  const reading = frame?.sensors[meta.key];
                  const value = reading?.[0] ?? null;
                  const quality = reading?.[1] ?? "none";
                  const s = store.series[meta.key];
                  return (
                    <button key={meta.key} className={`sensor q-${quality} ${pinned.includes(meta.key) ? "pinned" : ""}`}
                      onClick={() => toggle(meta.key)} aria-pressed={pinned.includes(meta.key)}
                      title={`${meta.name} — data quality: ${quality}${reading?.[2].length ? " (" + reading[2].join(", ") + ")" : ""}. Click to ${pinned.includes(meta.key) ? "unpin" : "pin"} the chart.`}>
                      <div className="name"><span className={`dot ${quality}`} /><span>{meta.name}</span></div>
                      <div className="val">
                        {quality === "missing" ? "NO DATA" : fmtNum(value, digitsFor(meta.unit, value))}
                        <small>{unitLabel(meta.unit)}</small>
                      </div>
                      <LineChart spark version={version} windowS={180} series={{ t: store.t, v: s?.v ?? [], q: s?.q }} />
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------- warnings
function MedicalCard({ w }: { w: Warning }) {
  return (
    <div className={`warn-card ${w.severity}`}>
      <div className="row">
        <Chip kind={w.severity}>{w.severity}</Chip>
        <h4 className="grow">{w.name}</h4>
        <span className="muted small num">{fmtClock(w.raised_at)}</span>
      </div>
      <div className="small" style={{ marginTop: 4 }}>{w.message}</div>
      {w.evidence && w.evidence.length > 0 && (
        <ul>
          {w.evidence.map((e, i) => (
            <li key={i}>
              {e.sensor_name} ({e.aggregation.replace(/_/g, " ")}): <b className="num">{smart(e.value)}</b> {unitLabel(e.unit)} · limit {e.operator} {e.threshold}
            </li>
          ))}
        </ul>
      )}
      {w.recommendations && w.recommendations.length > 0 && (
        <div className="small" style={{ marginTop: 6 }}>
          <span className="label">Recommended</span>
          <ul>{w.recommendations.map((r, i) => <li key={i} style={{ color: "var(--text)" }}>{r}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

/**
 * Medical warnings and data-quality warnings are separate lists with separate
 * colours and wording: one is about the astronaut, the other about the sensors.
 */
export function WarningsPanel({ store }: { store: SessionStore }) {
  useStoreVersion(store, 300);
  const frame = store.frame;
  const medical = frame?.warnings.medical ?? [];
  const quality = frame?.warnings.data_quality ?? [];
  const rules = frame?.rules ?? [];
  const [showRules, setShowRules] = useState(false);
  const inhibited = rules.filter((r) => r.state === "inhibited");
  return (
    <section className="panel warn-panel" style={{ flex: "1 1 46%" }}>
      <div className="panel-head">
        <h3>Warnings</h3>
        {medical.length > 0 && <Chip kind="warning">{medical.length} medical</Chip>}
        {quality.length > 0 && <Chip kind="dq">{quality.length} data quality</Chip>}
        <button className="btn sm ghost right" onClick={() => setShowRules((v) => !v)} aria-expanded={showRules}>
          {showRules ? "Hide" : "Show"} rule monitor
        </button>
      </div>
      <div className="panel-body">
        <div className="kind-title medical"><span className="label" style={{ color: "inherit" }}>Medical warnings</span><span className="muted small">physiological rules met</span></div>
        {medical.length === 0 && <div className="muted small" style={{ marginBottom: 10 }}>None active.</div>}
        {medical.map((w) => <MedicalCard key={w.id} w={w} />)}

        <div className="kind-title quality" style={{ marginTop: 12 }}><span className="label" style={{ color: "inherit" }}>Data quality warnings</span><span className="muted small">sensor problems, not medical findings</span></div>
        {quality.length === 0 && <div className="muted small">All sensors trusted.</div>}
        {quality.map((w) => (
          <div key={w.id} className="warn-card dq">
            <div className="row">
              <Chip kind="dq">{w.key.replace(/_/g, " ")}</Chip>
              <span className="grow small">{w.message}</span>
              <span className="muted small num">{fmtClock(w.raised_at)}</span>
            </div>
          </div>
        ))}
        {inhibited.map((r) => (
          <div key={r.key} className="warn-card dq">
            <div className="small">
              Rule <b>{r.name}</b> is <b>inhibited</b>: it will not be evaluated on untrusted data from {r.inhibited_by.join(", ")}.
            </div>
          </div>
        ))}

        {showRules && (
          <div style={{ marginTop: 12 }}>
            <div className="label" style={{ marginBottom: 4 }}>Medical rule monitor</div>
            {rules.length === 0 && <div className="muted small">Starts with the simulation.</div>}
            {rules.map((r) => (
              <div className="rule-row" key={r.key} title={r.clauses.map((c) => `${c.sensor_name} ${c.aggregation} = ${c.value ?? "?"} (limit ${c.operator} ${c.threshold})${c.reason ? " — " + c.reason : ""}`).join("\n")}>
                <Chip kind={r.state === "active" ? r.severity : r.state}>{r.state.replace("_", " ")}</Chip>
                <span className="grow">{r.name}</span>
                <span className="muted small num">
                  {r.clauses.map((c) => smart(c.value)).join(" · ")}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------- timeline
const ACTION_COLOR: Record<string, string> = {
  OPEN_HATCH: "#6b7a8c", ASTRONAUT_EXIT: "#7c8da1", WALK_TO_WAYPOINT: "#4dc9f0", KNEEL: "#c08a5a",
  COLLECT_SOIL_SAMPLE: "#e2733c", STAND_UP: "#c08a5a", WAIT: "#566475",
};
const OVERLAY_COLOR: Record<string, string> = {
  THERMAL_LOAD_CHANGE: "#ff7a3d", RADIATION_EXPOSURE_CHANGE: "#5aa7ff", SENSOR_FAULT_INJECTION: "#b394ff",
};

function eventClass(e: SimEvent): string {
  if (e.type.startsWith("MEDICAL")) return "medical";
  if (e.type.startsWith("DQ") || e.type === "RULE_INHIBITED") return "dq";
  if (e.type.startsWith("CONDITION")) return "condition";
  if (e.type === "CONTROL") return "control";
  return "";
}

function eventText(e: SimEvent): string {
  switch (e.type) {
    case "STEP_STARTED": return `▶ ${e.label}`;
    case "STEP_COMPLETED": return `✓ ${e.label}`;
    case "CONDITION_STARTED": return `Scenario event started: ${e.label}`;
    case "CONDITION_ENDED": return `Scenario event ended: ${e.label}`;
    case "MEDICAL_WARNING_RAISED": return `MEDICAL ${e.warning?.severity?.toUpperCase()}: ${e.warning?.name}`;
    case "MEDICAL_WARNING_CLEARED": return `Medical warning cleared: ${e.warning?.name}`;
    case "DQ_WARNING_RAISED": return `DATA QUALITY: ${e.warning?.message}`;
    case "DQ_WARNING_CLEARED": return `Data quality restored: ${e.warning?.sensor_name} (${e.warning?.key?.replace(/_/g, " ").toLowerCase()})`;
    case "RULE_INHIBITED": return e.message ?? "Rule inhibited";
    case "MISSION_COMPLETE": return "★ All planned activities complete";
    default: return e.label ?? e.message ?? e.type;
  }
}

export function TimelinePanel({ detail, store }: { detail: SessionDetail; store: SessionStore }) {
  useStoreVersion(store, 400);
  const tl = detail.timeline;
  const now = store.frame?.t ?? store.state?.sim_time ?? 0;
  const W = 1000, rowH = 16, lanes = [...new Set(tl.overlays.map((o) => o.action))];
  const H = 30 + lanes.length * (rowH + 4) + 18;
  const X = (t: number) => (t / tl.duration_s) * W;
  const events = useMemo(
    () => store.events.filter((e) => e.type !== "STEP_COMPLETED").slice(-160).reverse(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store.events.length, store.epoch],
  );
  const marks = store.events.filter((e) => e.type === "MEDICAL_WARNING_RAISED" || e.type === "DQ_WARNING_RAISED");

  return (
    <section className="panel time">
      <div className="panel-head">
        <h3>Mission timeline</h3>
        <span className="muted small">{tl.segments.length} activities · {tl.distance_m.toFixed(0)} m traverse · planned {fmtClock(tl.duration_s)}</span>
      </div>
      <div className="panel-body">
        <svg className="gantt" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ height: H }} role="img"
          aria-label="Planned activities and scenario events over mission time">
          {tl.segments.map((s) => (
            <g key={s.step_id}>
              <rect x={X(s.t_start)} y={4} width={Math.max(1, X(s.t_end) - X(s.t_start) - 1)} height={22} rx={2}
                fill={ACTION_COLOR[s.action] ?? "#566475"} opacity={now >= s.t_end ? 0.95 : now >= s.t_start ? 0.8 : 0.35}>
                <title>{`${s.label}  ${fmtClock(s.t_start)} – ${fmtClock(s.t_end)}`}</title>
              </rect>
            </g>
          ))}
          {tl.overlays.map((o) => {
            const lane = lanes.indexOf(o.action);
            const end = o.t_end ?? tl.duration_s;
            return (
              <rect key={o.step_id} x={X(o.t_start)} y={30 + lane * (rowH + 4)} width={Math.max(2, X(Math.min(end, tl.duration_s)) - X(o.t_start))}
                height={rowH} rx={2} fill={OVERLAY_COLOR[o.action] ?? "#888"} opacity={0.55}>
                <title>{`${o.label}  ${fmtClock(o.t_start)} – ${o.t_end === null ? "end" : fmtClock(o.t_end)}`}</title>
              </rect>
            );
          })}
          {marks.map((e, i) => (
            <path key={i} d={`M ${X(e.t)} 0 l 5 -0 l -5 8 l -5 -8 z`} transform="translate(0,0)"
              fill={e.type.startsWith("MEDICAL") ? "#ff7a3d" : "#b394ff"}>
              <title>{eventText(e)} at {fmtClock(e.t)}</title>
            </path>
          ))}
          <line x1={X(now)} x2={X(now)} y1={0} y2={H - 16} stroke="#fff" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="legend" style={{ margin: "2px 0 10px" }}>
          <span><i style={{ borderColor: "#4dc9f0", borderTopWidth: 6 }} />walk</span>
          <span><i style={{ borderColor: "#e2733c", borderTopWidth: 6 }} />sample collection</span>
          {lanes.includes("THERMAL_LOAD_CHANGE") && <span><i style={{ borderColor: "#ff7a3d", borderTopWidth: 6 }} />thermal stress event</span>}
          {lanes.includes("RADIATION_EXPOSURE_CHANGE") && <span><i style={{ borderColor: "#5aa7ff", borderTopWidth: 6 }} />radiation event (independent)</span>}
          {lanes.includes("SENSOR_FAULT_INJECTION") && <span><i style={{ borderColor: "#b394ff", borderTopWidth: 6 }} />injected sensor fault</span>}
          <span>▼ warning raised</span>
        </div>
        <div className="event-log" aria-live="polite">
          {events.length === 0 && <div className="muted small">Events appear here once the simulation starts.</div>}
          {events.map((e, i) => (
            <div key={`${e.id ?? i}-${e.t}-${e.type}`} className={`event ${eventClass(e)}`}>
              <span className="t">{fmtClock(e.t)}</span>
              <span>{eventText(e)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
