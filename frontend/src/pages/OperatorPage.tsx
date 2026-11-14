import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Layout } from "../components/Layout";
import { Banner, Chip, Confirm, ErrorBanner, Field, Modal, fmtClock, fmtDate, useAction, useLoad } from "../components/ui";
import { ApiError, api } from "../lib/api";
import type { Plan, PlanPreview, SessionDetail, SessionState, SessionSummary, TimelineData, WorldData } from "../lib/types";
import { MissionView, SessionStatusBar } from "../mission/MissionView";
import { useStoreVersion, type SessionStore } from "../mission/store";

interface Scenario { id: number; key: string; name: string; prompt: string; is_default: boolean }
interface Astronaut { id: number; callsign: string; full_name: string }

// ------------------------------------------------------------------ path map
/** Top-down route preview drawn over the real HiRISE orthoimage (north up). */
export function PathMap({ world, timeline }: { world: WorldData; timeline: TimelineData }) {
  const view = useMemo(() => {
    const pts: [number, number][] = [...timeline.path, [world.lander.x, world.lander.y]];
    for (const s of timeline.segments) if (s.waypoint) pts.push(s.to);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y] of pts) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    const size = Math.min(512, Math.max(maxX - minX, maxY - minY, 60) + 70);
    const cx = Math.max(-256 + size / 2, Math.min(256 - size / 2, (minX + maxX) / 2));
    const cy = Math.max(-256 + size / 2, Math.min(256 - size / 2, (minY + maxY) / 2));
    return { x0: cx - size / 2, y0: cy + size / 2, size };
  }, [world, timeline]);
  // SVG user units are metres; y is flipped because north is up.
  const P = (x: number, y: number) => `${x - view.x0},${view.y0 - y}`;
  const unit = view.size / 100;
  const used = new Set(timeline.segments.map((s) => s.waypoint));
  const scale = view.size > 250 ? 100 : view.size > 120 ? 50 : 20;
  return (
    <svg className="map" viewBox={`0 0 ${view.size} ${view.size}`} role="img" aria-label="Planned route on the Jezero terrain">
      <image href="/terrain/near_ortho.jpg" x={-256 - view.x0} y={view.y0 - 256} width={512} height={512}
        preserveAspectRatio="none" style={{ filter: "sepia(0.75) saturate(1.5) hue-rotate(-18deg) brightness(0.85)" }} />
      <polyline points={timeline.path.map(([x, y]) => P(x, y)).join(" ")} fill="none" stroke="#4dc9f0"
        strokeWidth={unit * 0.9} strokeDasharray={`${unit * 2.2} ${unit * 1.4}`} strokeLinejoin="round" />
      {world.waypoints.map((w) => {
        const on = used.has(w.key);
        const color = w.kind === "sample_site" ? "#ff8a3d" : on ? "#4dc9f0" : "#b8c0c9";
        const [px, py] = P(w.x, w.y).split(",").map(Number);
        if (px < 0 || py < 0 || px > view.size || py > view.size) return null;
        return (
          <g key={w.key} opacity={on ? 1 : 0.6}>
            {w.kind === "sample_site" && <circle cx={px} cy={py} r={unit * 3} fill="none" stroke={color} strokeWidth={unit * 0.5} />}
            <circle cx={px} cy={py} r={unit * 1.3} fill={color} stroke="#0b0e13" strokeWidth={unit * 0.3} />
            {/* labels on the right side of the map are anchored to their end so they never clip */}
            <text x={px + unit * (px > view.size * 0.6 ? -2.2 : 2.2)} y={py - unit * 1.6} fontSize={unit * 3.3} fill="#fff"
              textAnchor={px > view.size * 0.6 ? "end" : "start"} stroke="#0b0e13" strokeWidth={unit * 0.7}
              paintOrder="stroke" fontWeight={600}>{w.name}</text>
          </g>
        );
      })}
      {(() => {
        const [lx, ly] = P(world.lander.x, world.lander.y).split(",").map(Number);
        return (
          <g>
            <rect x={lx - unit * 1.8} y={ly - unit * 1.8} width={unit * 3.6} height={unit * 3.6} fill="#c9a13a" stroke="#0b0e13" strokeWidth={unit * 0.3} transform={`rotate(45 ${lx} ${ly})`} />
            <text x={lx + unit * 3} y={ly + unit * 4.5} fontSize={unit * 3.3} fill="#fff" stroke="#0b0e13" strokeWidth={unit * 0.7} paintOrder="stroke" fontWeight={600}>Lander</text>
          </g>
        );
      })()}
      <g transform={`translate(${unit * 4}, ${view.size - unit * 5})`}>
        <rect width={scale} height={unit * 0.8} fill="#fff" stroke="#0b0e13" strokeWidth={unit * 0.2} />
        <text y={-unit * 1.2} fontSize={unit * 3} fill="#fff" stroke="#0b0e13" strokeWidth={unit * 0.6} paintOrder="stroke">{scale} m</text>
      </g>
      <g transform={`translate(${view.size - unit * 6}, ${unit * 9})`}>
        <path d={`M0 ${-unit * 5} L${unit * 1.8} ${unit * 1.5} L0 0 L${-unit * 1.8} ${unit * 1.5} Z`} fill="#fff" stroke="#0b0e13" strokeWidth={unit * 0.3} />
        <text y={unit * 5.2} textAnchor="middle" fontSize={unit * 3.2} fill="#fff" stroke="#0b0e13" strokeWidth={unit * 0.6} paintOrder="stroke">N</text>
      </g>
    </svg>
  );
}

export function PlanSteps({ timeline }: { timeline: TimelineData }) {
  return (
    <div>
      {timeline.segments.map((s) => (
        <div className="step" key={s.step_id}>
          <span className="t">{fmtClock(s.t_start)}</span>
          <span><b>{s.action.replace(/_/g, " ")}</b> — {s.label} <span className="muted">({(s.t_end - s.t_start).toFixed(0)} s)</span></span>
        </div>
      ))}
      {timeline.overlays.map((o) => (
        <div className="step overlay" key={o.step_id}>
          <span className="t">{fmtClock(o.t_start)}</span>
          <span><b>{o.action.replace(/_/g, " ")}</b> — {o.label} <span className="muted">(until {o.t_end === null ? "mission end" : fmtClock(o.t_end)})</span></span>
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------- planner + list
export function OperatorPage() {
  const navigate = useNavigate();
  const scenarios = useLoad(() => api<Scenario[]>("/scenarios"));
  const astronauts = useLoad(() => api<Astronaut[]>("/astronauts"));
  const world = useLoad(() => api<WorldData>("/world"));
  const sessions = useLoad(() => api<SessionSummary[]>("/sessions"));
  const [prompt, setPrompt] = useState("");
  const [seed, setSeed] = useState("");
  const [astronautId, setAstronautId] = useState<number | "">("");
  const [name, setName] = useState("");
  const [preview, setPreview] = useState<PlanPreview | null>(null);
  const [json, setJson] = useState("");
  const [editJson, setEditJson] = useState(false);
  const [deleting, setDeleting] = useState<SessionSummary | null>(null);
  const gen = useAction();
  const create = useAction();

  useEffect(() => {
    const def = scenarios.data?.find((s) => s.is_default);
    if (def && !prompt) { setPrompt(def.prompt); setName(def.name); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenarios.data]);

  useEffect(() => {
    if (!sessions.data?.some((s) => s.status === "running")) return;
    const id = window.setInterval(() => void sessions.reload(), 3000);
    return () => window.clearInterval(id);
  }, [sessions.data, sessions.reload]);

  const accept = (p: PlanPreview | undefined) => {
    if (!p) return;
    setPreview(p);
    if (p.plan) setJson(JSON.stringify(p.plan, null, 2));
  };

  const generate = () => gen.run(async () => {
    setEditJson(false);
    accept(await api<PlanPreview>("/plans/generate", { body: { prompt, seed: seed === "" ? null : Number(seed) } }));
  });

  const validate = () => gen.run(async () => {
    let plan: Plan;
    try { plan = JSON.parse(json); } catch (e) { throw new Error(`Plan JSON is not valid JSON: ${(e as Error).message}`); }
    const p = await api<PlanPreview>("/plans/validate", { body: { plan } });
    accept({ ...p, notes: ["Edited by the operator and re-validated by the strict plan validator."] });
  });

  const confirm = () => create.run(async () => {
    if (!preview?.plan) return;
    const d = await api<SessionDetail>("/sessions", {
      body: { name: name.trim() || preview.plan.title, prompt, plan: preview.plan, plan_source: preview.source,
              planner_notes: preview.notes, astronaut_id: astronautId === "" ? null : astronautId },
    });
    navigate(`/operator/session/${d.session.id}`);
  });

  return (
    <Layout>
      <div className="page-head"><h1>Test console</h1><span className="muted">Describe a use test, review the generated plan, then run it.</span></div>
      <section className="panel" style={{ marginBottom: 14 }}>
        <div className="panel-head"><h3>1 · Describe the test</h3></div>
        <div className="panel-body col">
          <ErrorBanner error={scenarios.error ?? astronauts.error ?? world.error} />
          <div className="form-grid">
            <Field label="Scenario template">
              <select value="" onChange={(e) => {
                const s = scenarios.data?.find((x) => String(x.id) === e.target.value);
                if (s) { setPrompt(s.prompt); setName(s.name); setPreview(null); }
              }}>
                <option value="">Load a seeded scenario…</option>
                {scenarios.data?.map((s) => <option key={s.id} value={s.id}>{s.name}{s.is_default ? " (default)" : ""}</option>)}
              </select>
            </Field>
            <Field label="Astronaut (synthetic profile)">
              <select value={astronautId} onChange={(e) => setAstronautId(e.target.value === "" ? "" : Number(e.target.value))}>
                <option value="">Default ({astronauts.data?.[0]?.callsign ?? "—"})</option>
                {astronauts.data?.map((a) => <option key={a.id} value={a.id}>{a.callsign} — {a.full_name}</option>)}
              </select>
            </Field>
            <Field label="Random seed" help="Same seed + same plan = identical run. Empty uses the prompt or the system default.">
              <input type="number" min={0} value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="auto" />
            </Field>
          </div>
          <Field label="Natural-language test scenario">
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={5} maxLength={2000}
              placeholder="e.g. The astronaut exits the lander, walks to Waypoint Alpha and collects a soil sample while radiation rises…" />
          </Field>
          <div className="row">
            <button className="btn primary" disabled={gen.busy || prompt.trim().length < 3} onClick={generate}>
              {gen.busy ? "Generating…" : "Generate plan"}
            </button>
            <span className="muted small">The plan is validated data. The AI never executes code.</span>
          </div>
          <ErrorBanner error={gen.error} />
        </div>
      </section>

      {preview && (
        <section className="panel" style={{ marginBottom: 14 }}>
          <div className="panel-head">
            <h3>2 · Review the plan</h3>
            <Chip kind={preview.valid ? "ok" : "critical"}>{preview.valid ? "valid" : "invalid"}</Chip>
            <Chip>{preview.source}</Chip>
            <button className="btn sm ghost right" onClick={() => setEditJson((v) => !v)}>{editJson ? "Hide" : "Edit"} plan JSON</button>
          </div>
          <div className="panel-body">
            {!preview.valid && (
              <Banner kind="error">This plan cannot run:<ul>{preview.problems.map((p, i) => <li key={i}>{p}</li>)}</ul></Banner>
            )}
            {preview.notes.length > 0 && (
              <Banner kind="info">How the prompt was interpreted:<ul>{preview.notes.map((n, i) => <li key={i}>{n}</li>)}</ul></Banner>
            )}
            {editJson && (
              <div className="col" style={{ marginBottom: 12 }}>
                <textarea className="code" value={json} onChange={(e) => setJson(e.target.value)} spellCheck={false} aria-label="Plan JSON" />
                <div className="row"><button className="btn" disabled={gen.busy} onClick={validate}>Validate edited plan</button>
                  <span className="muted small">Unknown actions or fields are rejected by the server.</span></div>
              </div>
            )}
            {preview.timeline && world.data && (
              <div className="plan-grid">
                <div>
                  <div className="stats">
                    <div className="stat card"><span className="label">Duration</span><b>{fmtClock(preview.timeline.duration_s)}</b></div>
                    <div className="stat card"><span className="label">Traverse</span><b>{preview.timeline.distance_m.toFixed(0)} m</b></div>
                    <div className="stat card"><span className="label">Seed</span><b>{preview.plan?.seed}</b></div>
                    <div className="stat card"><span className="label">Events</span><b>{preview.timeline.overlays.length}</b></div>
                  </div>
                  <PlanSteps timeline={preview.timeline} />
                </div>
                <PathMap world={world.data} timeline={preview.timeline} />
              </div>
            )}
            {preview.valid && (
              <div className="row" style={{ marginTop: 14 }}>
                <div style={{ width: 320, maxWidth: "100%" }}>
                  <Field label="Session name"><input value={name} onChange={(e) => setName(e.target.value)} maxLength={160} /></Field>
                </div>
                <button className="btn primary" style={{ alignSelf: "flex-end" }} disabled={create.busy} onClick={confirm}>
                  Confirm plan &amp; create session
                </button>
              </div>
            )}
            <ErrorBanner error={create.error} problems={create.error instanceof ApiError ? create.error.problems : undefined} />
          </div>
        </section>
      )}

      <section className="panel">
        <div className="panel-head"><h3>Sessions</h3><button className="btn sm ghost right" onClick={() => void sessions.reload()}>Refresh</button></div>
        <div className="panel-body">
          <ErrorBanner error={sessions.error} />
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Status</th><th>Mission time</th><th>Seed</th><th>Plan</th><th>Created</th><th /></tr></thead>
              <tbody>
                {sessions.data?.map((s) => (
                  <tr key={s.id}>
                    <td><Link to={`/operator/session/${s.id}`}>{s.name}</Link></td>
                    <td><Chip kind={s.status}>{s.status}</Chip></td>
                    <td className="num">{fmtClock(s.sim_time)} / {fmtClock(s.duration_s)}</td>
                    <td className="num">{s.seed}</td>
                    <td className="muted small">{s.plan_source}</td>
                    <td className="muted small">{fmtDate(s.created_at)} · {s.created_by}</td>
                    <td className="actions">
                      <Link className="btn sm" to={`/operator/session/${s.id}`}>Open</Link>
                      <button className="btn sm danger" disabled={s.status === "running" || s.status === "paused"} onClick={() => setDeleting(s)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {sessions.data?.length === 0 && <div className="empty">No sessions yet. Generate a plan above to create one.</div>}
        </div>
      </section>
      {deleting && (
        <Confirm danger title="Delete session" confirmLabel="Delete"
          message={<>Delete <b>{deleting.name}</b> with its telemetry, events and viewer links?</>}
          onClose={() => setDeleting(null)}
          onConfirm={async () => { await api(`/sessions/${deleting.id}`, { method: "DELETE" }); await sessions.reload(); }} />
      )}
    </Layout>
  );
}

// ----------------------------------------------------------- session console
interface ViewerToken { id: number; label: string; created_by: string; expires_at: string; use_count: number; state: string }
interface CreatedToken extends ViewerToken { token: string; url: string; qr_svg: string }

function QrModal({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const tokens = useLoad(() => api<ViewerToken[]>(`/sessions/${sessionId}/viewer-tokens`), [sessionId]);
  const [label, setLabel] = useState("Judges");
  const [ttl, setTtl] = useState("");
  const [created, setCreated] = useState<CreatedToken | null>(null);
  const [copied, setCopied] = useState(false);
  const act = useAction();
  const make = () => act.run(async () => {
    const res = await api<CreatedToken>(`/sessions/${sessionId}/viewer-tokens`, {
      body: { label, ttl_minutes: ttl === "" ? null : Number(ttl), base_url: window.location.origin },
    });
    setCreated(res);
    setCopied(false);
    await tokens.reload();
  });
  const revoke = (id: number) => act.run(async () => {
    await api(`/viewer-tokens/${id}`, { method: "DELETE" });
    if (created?.id === id) setCreated(null);
    await tokens.reload();
  });
  return (
    <Modal wide title="Instrument Viewer access (QR)" onClose={onClose}>
      <ErrorBanner error={act.error ?? tokens.error} />
      <p className="muted small">
        A viewer link is read-only, limited to this session, expires automatically and can be revoked at any time.
        Viewers can change their own camera and panels; they cannot control the simulation.
      </p>
      <div className="row" style={{ alignItems: "flex-end", marginBottom: 14 }}>
        <div style={{ width: 200 }}><Field label="Label"><input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} /></Field></div>
        <div style={{ width: 170 }}><Field label="Valid for (minutes)"><input type="number" min={1} max={1440} value={ttl} onChange={(e) => setTtl(e.target.value)} placeholder="system default" /></Field></div>
        <button className="btn primary" disabled={act.busy} onClick={make}>Generate QR code</button>
      </div>
      {created && (
        <div className="row gap-lg" style={{ alignItems: "flex-start", marginBottom: 16 }}>
          {/* The SVG is produced by our own backend from a URL it built; it contains only path data. */}
          <div className="qr" dangerouslySetInnerHTML={{ __html: created.qr_svg }} />
          <div className="col grow">
            <span className="label">Scan with a phone on the same network</span>
            <code style={{ overflowWrap: "anywhere" }}>{created.url}</code>
            <div className="row">
              <button className="btn sm" onClick={() => navigator.clipboard?.writeText(created.url).then(() => setCopied(true))}>{copied ? "Copied" : "Copy link"}</button>
              <a className="btn sm" href={created.url} target="_blank" rel="noreferrer">Open viewer</a>
            </div>
            <span className="muted small">Expires {fmtDate(created.expires_at)}. The token is shown only now; it is stored hashed.</span>
            {created.url.includes("//localhost") || created.url.includes("//127.0.0.1")
              ? <Banner kind="warn">No LAN address was detected, so this link only works on this computer. Set <code>public_base_url</code> in the admin configuration.</Banner>
              : null}
          </div>
        </div>
      )}
      <div className="label" style={{ marginBottom: 6 }}>Issued links</div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Label</th><th>State</th><th>Expires</th><th>Opened</th><th>By</th><th /></tr></thead>
          <tbody>
            {tokens.data?.map((t) => (
              <tr key={t.id}>
                <td>{t.label || "—"}</td><td><Chip kind={t.state}>{t.state}</Chip></td>
                <td className="small">{fmtDate(t.expires_at)}</td><td className="num">{t.use_count}×</td><td className="small muted">{t.created_by}</td>
                <td className="actions">{t.state === "active" && <button className="btn sm danger" disabled={act.busy} onClick={() => revoke(t.id)}>Revoke</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {tokens.data?.length === 0 && <div className="empty">No viewer links yet.</div>}
    </Modal>
  );
}

function Controls({ detail, store }: { detail: SessionDetail; store: SessionStore }) {
  useStoreVersion(store, 250);
  const act = useAction();
  const [qr, setQr] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const s = store.state ?? detail.session;
  const send = (action: string, speed?: number) => act.run(async () => {
    store.applyState(await api<SessionState>(`/sessions/${detail.session.id}/control`, { body: { action, speed: speed ?? null } }));
  });
  const active = s.status === "running" || s.status === "paused";
  return (
    <>
      <div className="page-head">
        <SessionStatusBar detail={detail} store={store} />
        <div className="controls">
          {s.status === "planned" && <button className="btn primary" disabled={act.busy} onClick={() => send("start")}>▶ Start</button>}
          {s.status === "running" && <button className="btn" disabled={act.busy} onClick={() => send("pause")}>❚❚ Pause</button>}
          {s.status === "paused" && <button className="btn primary" disabled={act.busy} onClick={() => send("resume")}>▶ Resume</button>}
          {s.status !== "planned" && (
            <button className="btn" disabled={act.busy} onClick={() => (active ? setConfirmRestart(true) : send("restart"))}>⟲ Restart</button>
          )}
          <button className="btn danger" disabled={act.busy || !active} onClick={() => send("stop")}>■ Stop</button>
          <label className="row small muted">Speed
            <select value={s.speed} disabled={act.busy} onChange={(e) => send("set_speed", Number(e.target.value))} style={{ width: "auto" }}>
              {detail.speeds.map((v) => <option key={v} value={v}>{v}×</option>)}
            </select>
          </label>
          <button className="btn" onClick={() => setQr(true)}>▦ Viewer QR</button>
        </div>
      </div>
      <ErrorBanner error={act.error} />
      {qr && <QrModal sessionId={detail.session.id} onClose={() => setQr(false)} />}
      {confirmRestart && (
        <Confirm title="Restart simulation" confirmLabel="Restart"
          message="The current run stops and the plan replays from T+00:00 with the same seed, producing identical data."
          onClose={() => setConfirmRestart(false)} onConfirm={() => send("restart")} />
      )}
    </>
  );
}

export function OperatorSessionPage() {
  const { id } = useParams();
  return (
    <Layout wide>
      <div className="small" style={{ marginBottom: 8 }}><Link to="/operator">← Test console</Link></div>
      {id && <MissionView sessionId={id} header={(ctx) => <Controls {...ctx} />} />}
    </Layout>
  );
}
