import { useEffect, useRef } from "react";

export interface ChartSeries {
  t: number[];
  v: (number | null)[];
  /** quality code per sample: 0 good, 1 suspect, 2 bad, 3 missing */
  q?: number[];
  truth?: number[];
  thresholds?: { value: number; label: string }[];
}

const COLORS = { line: "#4dc9f0", truth: "#8a97a8", grid: "#1f2a37", text: "#8a97a8", bad: "#ff4d5e", suspect: "#f2b632", missing: "#b394ff", threshold: "#ff7a3d" };

function niceRange(lo: number, hi: number): [number, number] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1];
  if (hi - lo < 1e-9) { const pad = Math.abs(lo) * 0.02 || 1; return [lo - pad, hi + pad]; }
  const pad = (hi - lo) * 0.12;
  return [lo - pad, hi + pad];
}

/**
 * Minimal canvas line chart for live telemetry.
 *   solid cyan   sensor output (gaps where the sensor reported nothing)
 *   dashed grey  simulation ground truth (optional)
 *   coloured dots untrusted samples, coloured by data-quality status
 *   dashed orange medical rule thresholds
 */
export function LineChart({ series, version, spark, windowS, height }: {
  series: ChartSeries; version: number; spark?: boolean; windowS?: number; height?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const { t, v, q, truth, thresholds } = series;
    const n = t.length;
    if (n < 2) {
      if (!spark) { ctx.fillStyle = COLORS.text; ctx.font = "12px system-ui"; ctx.fillText("Waiting for telemetry…", 8, h / 2); }
      return;
    }
    const tMax = t[n - 1];
    const tMin = windowS ? Math.max(t[0], tMax - windowS) : t[0];
    let start = 0;
    if (windowS) while (start < n - 2 && t[start] < tMin) start++;

    let lo = Infinity, hi = -Infinity;
    for (let i = start; i < n; i++) {
      const x = v[i];
      // Bad spikes are drawn as markers but excluded from the scale so they do not flatten the trace.
      if (x !== null && (!q || q[i] < 2)) { if (x < lo) lo = x; if (x > hi) hi = x; }
      if (truth && truth[i] !== undefined) { if (truth[i] < lo) lo = truth[i]; if (truth[i] > hi) hi = truth[i]; }
    }
    if (!spark && thresholds) {
      for (const th of thresholds) {
        const span = Math.max(hi - lo, 1e-6);
        if (th.value > lo - span * 1.5 && th.value < hi + span * 1.5) { lo = Math.min(lo, th.value); hi = Math.max(hi, th.value); }
      }
    }
    const [yMin, yMax] = niceRange(lo, hi);
    const padL = spark ? 0 : 44, padR = spark ? 0 : 6, padT = spark ? 2 : 6, padB = spark ? 2 : 18;
    const pw = w - padL - padR, ph = h - padT - padB;
    const X = (tt: number) => padL + ((tt - tMin) / Math.max(tMax - tMin, 1e-6)) * pw;
    const Y = (y: number) => padT + (1 - (y - yMin) / (yMax - yMin)) * ph;
    const clampY = (y: number) => Math.min(padT + ph, Math.max(padT, Y(y)));

    if (!spark) {
      ctx.strokeStyle = COLORS.grid;
      ctx.fillStyle = COLORS.text;
      ctx.font = "10px ui-monospace, Consolas, monospace";
      ctx.lineWidth = 1;
      for (let i = 0; i <= 3; i++) {
        const yv = yMin + ((yMax - yMin) * i) / 3;
        const yy = Y(yv);
        ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(w - padR, yy); ctx.stroke();
        const digits = Math.abs(yMax - yMin) < 2 ? 2 : Math.abs(yMax - yMin) < 20 ? 1 : 0;
        ctx.fillText(yv.toFixed(digits), 2, yy + 3);
      }
      const span = tMax - tMin;
      const stepT = span > 1200 ? 300 : span > 480 ? 120 : span > 180 ? 60 : 30;
      for (let tt = Math.ceil(tMin / stepT) * stepT; tt <= tMax; tt += stepT) {
        const xx = X(tt);
        ctx.beginPath(); ctx.moveTo(xx, padT); ctx.lineTo(xx, padT + ph); ctx.stroke();
        ctx.fillText(`${Math.floor(tt / 60)}:${String(Math.round(tt % 60)).padStart(2, "0")}`, xx - 10, h - 5);
      }
      if (thresholds) {
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = COLORS.threshold;
        ctx.fillStyle = COLORS.threshold;
        for (const th of thresholds) {
          if (th.value < yMin || th.value > yMax) continue;
          const yy = Y(th.value);
          ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(w - padR, yy); ctx.stroke();
          ctx.fillText(th.label, w - padR - ctx.measureText(th.label).width - 2, yy - 3);
        }
        ctx.setLineDash([]);
      }
    }

    // On long sessions draw every k-th point; the visual result is identical at this width.
    const stride = Math.max(1, Math.floor((n - start) / (pw * 1.5)));

    if (truth && !spark) {
      ctx.strokeStyle = COLORS.truth;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      let pen = false;
      for (let i = start; i < n; i += stride) {
        if (truth[i] === undefined) continue;
        if (pen) ctx.lineTo(X(t[i]), Y(truth[i])); else { ctx.moveTo(X(t[i]), Y(truth[i])); pen = true; }
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = spark ? 1.2 : 1.6;
    ctx.lineJoin = "round";
    ctx.beginPath();
    let pen = false;
    for (let i = start; i < n; i += stride) {
      const x = v[i];
      if (x === null || (q && q[i] >= 2)) { pen = false; continue; }   // gap: no trusted reading
      if (pen) ctx.lineTo(X(t[i]), Y(x)); else { ctx.moveTo(X(t[i]), Y(x)); pen = true; }
    }
    ctx.stroke();

    if (q) {
      for (let i = start; i < n; i++) {
        if (q[i] === 0) continue;
        ctx.fillStyle = q[i] === 1 ? COLORS.suspect : q[i] === 2 ? COLORS.bad : COLORS.missing;
        const x = v[i];
        const yy = x === null ? padT + ph - 2 : clampY(x);
        ctx.fillRect(X(t[i]) - 1.5, yy - 1.5, 3, 3);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, series.t.length, spark, windowS]);

  return <canvas ref={ref} style={height ? { height } : undefined} />;
}
