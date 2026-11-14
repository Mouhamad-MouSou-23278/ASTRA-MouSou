import { useEffect, useRef, useState } from "react";
import { fmtClock } from "../components/ui";
import type { SessionDetail, TerrainMeta } from "../lib/types";
import { MarsScene, type CameraMode, type Quality } from "./MarsScene";
import { useStoreVersion, type SessionStore } from "./store";

const CAMERAS: { id: CameraMode; label: string; title: string }[] = [
  { id: "third", label: "3rd person", title: "Follow behind the astronaut" },
  { id: "first", label: "1st person", title: "Helmet view" },
  { id: "overview", label: "Overview", title: "Whole route from above" },
  { id: "closeup", label: "Close-up", title: "Close view of the astronaut" },
];

function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

/** The live 3D Mars scene with its heads-up display. Camera choices are local to this browser. */
export function MarsCanvas({ detail, store }: { detail: SessionDetail; store: SessionStore }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<MarsScene | null>(null);
  const [mode, setMode] = useState<CameraMode>("third");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");
  const [terrain, setTerrain] = useState<TerrainMeta | null>(null);
  const [quality, setQuality] = useState<Quality>(() =>
    window.matchMedia("(max-width: 800px)").matches ? "low" : "high");
  const version = useStoreVersion(store, 250);

  // Build the scene once per session (and again if the quality level is changed).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!webglAvailable()) {
      setStatus("error");
      setMessage("This browser cannot create a WebGL context, so the 3D scene is unavailable. Telemetry, warnings and ASTRA still work.");
      return;
    }
    let scene: MarsScene | null = null;
    let cancelled = false;
    setStatus("loading");
    fetch("/terrain/terrain.json")
      .then((r) => { if (!r.ok) throw new Error("Terrain assets are missing on the server (run tools/terrain/build_terrain.py)."); return r.json(); })
      .then(async (meta: TerrainMeta) => {
        if (cancelled) return;
        setTerrain(meta);
        scene = new MarsScene(canvas, {
          terrain: meta, world: detail.world, timeline: detail.timeline, quality,
          onQuality: (q) => setQuality(q),
        });
        await scene.load();
        if (cancelled) { scene.dispose(); return; }
        sceneRef.current = scene;
        // Debugging aid: open the page with ?debug to inspect the scene from the console.
        if (new URLSearchParams(window.location.search).has("debug")) (window as any).__astraScene = scene;
        scene.setCamera(mode);
        if (store.frame) scene.setFrame(store.frame, store.state?.speed ?? 1);
        scene.setTrail(store.trail);
        setStatus("ready");
      })
      .catch((e: Error) => { if (!cancelled) { setStatus("error"); setMessage(e.message); } });
    const observer = new ResizeObserver(() => sceneRef.current?.resize());
    if (canvas.parentElement) observer.observe(canvas.parentElement);
    return () => {
      cancelled = true;
      observer.disconnect();
      sceneRef.current = null;
      scene?.dispose();
    };
    // `quality` is intentionally read once: an automatic downgrade must not rebuild the scene.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.session.id, store]);

  useEffect(() => { sceneRef.current?.setCamera(mode); }, [mode]);

  // Push new frames into the scene as they arrive (cheap: just swaps interpolation targets).
  const lastSeq = useRef(-1);
  const lastTrail = useRef(-1);
  const lastEpoch = useRef(-1);
  useEffect(() => {
    let raf = 0;
    const pump = () => {
      const scene = sceneRef.current;
      if (scene) {
        if (store.epoch !== lastEpoch.current) { lastEpoch.current = store.epoch; lastSeq.current = -1; lastTrail.current = -1; }
        const f = store.frame;
        if (f && f.seq !== lastSeq.current) { lastSeq.current = f.seq; scene.setFrame(f, store.state?.speed ?? 1); }
        if (store.trail.length !== lastTrail.current) { lastTrail.current = store.trail.length; scene.setTrail(store.trail); }
      }
      raf = requestAnimationFrame(pump);
    };
    raf = requestAnimationFrame(pump);
    return () => cancelAnimationFrame(raf);
  }, [store]);

  void version;
  const frame = store.frame;
  const a = frame?.astronaut;
  const elevation = a && terrain && sceneRef.current
    ? (sceneRef.current.groundElevation(a.x, a.y) ?? 0) + terrain.site.elevation_m_mola : null;
  const compass = a ? ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(a.heading / 45) % 8] : "";

  return (
    <div className="scene">
      <canvas ref={canvasRef} aria-label="Live 3D view of the Mars surface walk" />
      {status !== "ready" && (
        <div className="scene-msg">
          <div>
            <div className="label" style={{ color: "#f3e6dc" }}>{status === "loading" ? "Loading Jezero Crater terrain…" : "3D scene unavailable"}</div>
            {message && <p style={{ marginTop: 8, maxWidth: 520 }}>{message}</p>}
          </div>
        </div>
      )}
      <div className="hud tl">
        <div className="clock">{fmtClock(frame?.t ?? store.state?.sim_time ?? 0)}</div>
        <div className="activity">{frame?.activity?.label ?? (store.state?.status === "planned" ? "Awaiting start" : frame ? "Holding position" : "")}</div>
        {frame?.conditions.active.filter((c) => c.action !== "SENSOR_FAULT_INJECTION").map((c) => (
          <div key={c.step_id} className="small" style={{ color: "#ffe2b8" }}>● {c.label}</div>
        ))}
      </div>
      <div className="hud tr">
        <div className="cam-bar" role="group" aria-label="Camera">
          {CAMERAS.map((c) => (
            <button key={c.id} className={`btn sm ${mode === c.id ? "active" : ""}`} title={c.title}
              aria-pressed={mode === c.id} onClick={() => setMode(c.id)}>{c.label}</button>
          ))}
          <button className="btn sm" title="Reset this camera" onClick={() => sceneRef.current?.resetCamera()}>⟲</button>
        </div>
        <div className="small hint" style={{ marginTop: 6, color: "#f3e6dccc" }}>drag to look · scroll / pinch to zoom</div>
      </div>
      <div className="hud bl">
        {a && (
          <div className="small">
            {a.outside ? <>E {a.x.toFixed(1)} m · N {a.y.toFixed(1)} m · HDG {a.heading.toFixed(0)}° {compass}</> : "Inside lander"}
            {elevation !== null && <> · ELEV {elevation.toFixed(1)} m</>}
          </div>
        )}
        {terrain && (
          <div className="credit">
            Terrain: real HiRISE DTM<span className="credit-long">, {terrain.site.name} ({terrain.site.lat_deg.toFixed(4)}°N {terrain.site.lon_deg_east.toFixed(4)}°E)</span>
            {" "}· NASA/JPL-Caltech/Univ. of Arizona<span className="credit-long"> · rocks, vehicle and colour are procedural</span>
          </div>
        )}
      </div>
      <div className="hud br small">{quality === "low" && status === "ready" ? "performance mode" : ""}</div>
      <div className="watermark">SIMULATED DATA</div>
    </div>
  );
}
