import { useEffect, useRef } from "react";

export interface BenchmarkPointData {
  t: number;
  ground_truth: number;
  raw_observed: number | null;
  processed_output: number | null;
  residual: number | null;
  trust_score: number;
  flags: string[];
}

interface ChartProps {
  points: BenchmarkPointData[];
  sensorUnit: string;
}

export function TrustedDataChart({ points, sensorUnit }: ChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || points.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    // Layout: Top 60% = Signal (Truth vs Observed), Bottom 35% = Trust Score [0..1]
    const margin = { left: 55, right: 20, top: 20, bottom: 30 };
    const chartW = width - margin.left - margin.right;
    const splitY = height * 0.62;

    const sigH = splitY - margin.top;
    const trustH = height - splitY - margin.bottom - 10;
    const trustTop = splitY + 15;

    // Time domain min and max
    const tMin = points[0].t;
    const tMax = points[points.length - 1].t || 1.0;
    const getX = (t: number) =>
      margin.left + ((t - tMin) / (tMax - tMin || 1)) * chartW;

    // Signal domain min and max
    const allVals = points.flatMap((p) =>
      p.raw_observed !== null ? [p.ground_truth, p.raw_observed] : [p.ground_truth]
    );
    let vMin = Math.min(...allVals);
    let vMax = Math.max(...allVals);
    if (vMin === vMax) {
      vMin -= 1;
      vMax += 1;
    }
    const pad = (vMax - vMin) * 0.1;
    vMin -= pad;
    vMax += pad;

    const getSigY = (v: number) =>
      margin.top + (1.0 - (v - vMin) / (vMax - vMin || 1)) * sigH;

    const getTrustY = (s: number) =>
      trustTop + (1.0 - Math.max(0, Math.min(1, s))) * trustH;

    // Draw Background Grid
    ctx.strokeStyle = "#252b36";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = margin.top + (sigH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(margin.left, y);
      ctx.lineTo(width - margin.right, y);
      ctx.stroke();

      const val = vMax - ((vMax - vMin) / 4) * i;
      ctx.fillStyle = "#738094";
      ctx.font = "10px sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(val.toFixed(1), margin.left - 6, y + 3);
    }

    // Split Divider
    ctx.strokeStyle = "#384556";
    ctx.beginPath();
    ctx.moveTo(margin.left, splitY + 5);
    ctx.lineTo(width - margin.right, splitY + 5);
    ctx.stroke();

    // Trust Grid
    for (let s = 0.0; s <= 1.0; s += 0.5) {
      const y = getTrustY(s);
      ctx.strokeStyle = "#252b36";
      ctx.beginPath();
      ctx.moveTo(margin.left, y);
      ctx.lineTo(width - margin.right, y);
      ctx.stroke();

      ctx.fillStyle = "#738094";
      ctx.textAlign = "right";
      ctx.fillText(`${(s * 100).toFixed(0)}%`, margin.left - 6, y + 3);
    }

    // Draw Ground Truth Curve (Green)
    ctx.strokeStyle = "#34d399";
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach((p, idx) => {
      const x = getX(p.t);
      const y = getSigY(p.ground_truth);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Draw Raw Observed Curve (Cyan / Blue)
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    let started = false;
    points.forEach((p) => {
      if (p.raw_observed === null) {
        started = false;
        return;
      }
      const x = getX(p.t);
      const y = getSigY(p.raw_observed);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

    // Draw Trust Score Curve (Purple)
    ctx.strokeStyle = "#a78bfa";
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach((p, idx) => {
      const x = getX(p.t);
      const y = getTrustY(p.trust_score);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Highlight any Disconnect or Spike events
    points.forEach((p) => {
      if (p.flags.length > 0) {
        const x = getX(p.t);
        ctx.fillStyle = p.flags.includes("DISCONNECTED") ? "#f43f5e" : "#fbbf24";
        ctx.beginPath();
        ctx.arc(x, trustTop + 4, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // X Axis Labels (Time in seconds)
    ctx.fillStyle = "#738094";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    for (let i = 0; i <= 5; i++) {
      const t = tMin + ((tMax - tMin) / 5) * i;
      const x = getX(t);
      ctx.fillText(`${t.toFixed(0)}s`, x, height - 10);
    }

    // Legend
    ctx.textAlign = "left";
    ctx.font = "11px sans-serif";

    ctx.fillStyle = "#34d399";
    ctx.fillRect(margin.left, 6, 10, 10);
    ctx.fillStyle = "#e2e8f0";
    ctx.fillText(`Ground Truth (${sensorUnit})`, margin.left + 14, 15);

    ctx.fillStyle = "#38bdf8";
    ctx.fillRect(margin.left + 160, 6, 10, 10);
    ctx.fillStyle = "#e2e8f0";
    ctx.fillText("Simulated Sensor Telemetry", margin.left + 174, 15);

    ctx.fillStyle = "#a78bfa";
    ctx.fillRect(margin.left + 350, 6, 10, 10);
    ctx.fillStyle = "#e2e8f0";
    ctx.fillText("Trust Score (TDL)", margin.left + 364, 15);
  }, [points, sensorUnit]);

  return (
    <div style={{ background: "#11141a", borderRadius: 6, padding: 8 }}>
      <canvas
        ref={canvasRef}
        width={720}
        height={320}
        style={{ width: "100%", height: "auto", display: "block" }}
      />
    </div>
  );
}
