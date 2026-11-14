import { useEffect, useRef } from "react";
import { Chip } from "./ui";
import { useLanguage } from "../lib/i18n";
import type { SessionDetail } from "../lib/types";
import type { SessionStore } from "../mission/store";

interface DoctorConsoleProps {
  detail?: SessionDetail;
  store: SessionStore;
  commBlackout?: boolean;
}

export function DoctorExaminerConsole({ detail: _detail, store, commBlackout = true }: DoctorConsoleProps) {
  const ecgCanvasRef = useRef<HTMLCanvasElement>(null);
  const [lang, setLang] = useLanguage();
  const isAr = lang === "ar";
  const frame = store.frame;

  // Extract vitals or defaults
  const hr = frame?.sensors["heart_rate"]?.[0] ?? 74;
  const spo2 = frame?.sensors["spo2"]?.[0] ?? 98.2;
  const coreTemp = frame?.sensors["core_temp"]?.[0] ?? 37.1;
  const suitPress = frame?.sensors["suit_pressure"]?.[0] ?? 29.5;
  const co2 = frame?.sensors["co2_level"]?.[0] ?? 2.1;
  const rad = frame?.sensors["rad_dose_rate"]?.[0] ?? 27.8;

  // Trust statuses from TDL
  const hrTrust = frame?.sensors["heart_rate"]?.[1] === "bad" ? 0.25 : 0.98;
  const spo2Trust = frame?.sensors["spo2"]?.[1] === "bad" ? 0.15 : 0.97;
  const tempTrust = frame?.sensors["core_temp"]?.[1] === "bad" ? 0.30 : 0.99;
  const pressTrust = frame?.sensors["suit_pressure"]?.[1] === "bad" ? 0.20 : 0.99;

  // Real-time ECG waveform synthesis
  useEffect(() => {
    const canvas = ecgCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let x = 0;
    const height = canvas.height;
    const width = canvas.width;
    const midY = height / 2;
    const buffer = new Float32Array(width).fill(midY);

    let phase = 0;

    const render = () => {
      // Calculate beat period based on current heart rate
      const bpm = Math.max(40, Math.min(220, hr));
      const freq = bpm / 60; // beats per second
      phase += freq * 0.04;

      // ECG P-Q-R-S-T math wave function
      const tInBeat = phase % 1.0;
      let wave = 0;

      if (tInBeat > 0.12 && tInBeat < 0.22) {
        // P-wave (atrial depolarization)
        wave = Math.sin((tInBeat - 0.12) * Math.PI * 10) * 12;
      } else if (tInBeat > 0.32 && tInBeat < 0.35) {
        // Q-dip
        wave = -8;
      } else if (tInBeat >= 0.35 && tInBeat < 0.40) {
        // R-spike (ventricular depolarization)
        wave = Math.sin((tInBeat - 0.35) * Math.PI * 20) * 48;
      } else if (tInBeat >= 0.40 && tInBeat < 0.44) {
        // S-dip
        wave = -16;
      } else if (tInBeat > 0.52 && tInBeat < 0.72) {
        // T-wave (ventricular repolarization)
        wave = Math.sin((tInBeat - 0.52) * Math.PI * 5) * 16;
      }

      // Add gentle baseline drift
      wave += Math.sin(phase * 0.2) * 2;

      const y = midY - wave;
      buffer[x] = y;

      // Draw trace
      ctx.fillStyle = "#0c1015";
      ctx.fillRect(0, 0, width, height);

      // Grid lines
      ctx.strokeStyle = "rgba(45, 68, 95, 0.25)";
      ctx.lineWidth = 1;
      for (let gx = 0; gx < width; gx += 25) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, height);
        ctx.stroke();
      }
      for (let gy = 0; gy < height; gy += 25) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(width, gy);
        ctx.stroke();
      }

      // ECG line trace
      ctx.strokeStyle = "#34d399";
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      for (let i = 0; i < width; i++) {
        if (i === 0) ctx.moveTo(i, buffer[i]);
        else ctx.lineTo(i, buffer[i]);
      }
      ctx.stroke();

      // Current scanhead cursor
      ctx.fillStyle = "#6ee7b7";
      ctx.fillRect(x, 0, 3, height);

      x = (x + 2) % width;
      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [hr]);

  // Determine current clinical diagnosis
  let diagnosis = "NOMINAL";
  let diagnosisTitleEn = "Nominal Physiological Equilibrium";
  let diagnosisTitleAr = "توازن فسيولوجي طبيعي ومستقر";
  let severity: "nominal" | "caution" | "warning" | "critical" = "nominal";
  let actionEn = "Continue nominal EVA timeline. Hydration and thermal balance verified.";
  let actionAr = "مواصلة نشاط السير الطبيعي. تم التحقق من توازن السوائل والحرارة.";

  if (suitPress < 27.0 && pressTrust > 0.6) {
    diagnosis = "DECOMPRESSION_RISK";
    diagnosisTitleEn = "Spacesuit Pressure Breach";
    diagnosisTitleAr = "تسرب ضغط بذلة الفضاء / خطر انخفاض الضغط";
    severity = "critical";
    actionEn = "Activate makeup gas injection. Immediate emergency ingress to airlock.";
    actionAr = "تفعيل حقن غاز التعويض بالبذلة والتوجه فوراً للدخول الطارئ إلى حجرة الضغط.";
  } else if (spo2 < 88.0 && spo2Trust > 0.6) {
    diagnosis = "HYPOXIA";
    diagnosisTitleEn = "Acute Hypoxia / Low Oxygen Saturation";
    diagnosisTitleAr = "نقص أكسجة حاد / انخفاض خطير بتشبع الأكسجين";
    severity = "critical";
    actionEn = "Switch spacesuit life support to Secondary Oxygen Pack (SOP).";
    actionAr = "تحويل نظام دعم الحياة إلى حزمة الأكسجين الثانوية (SOP) فوراً.";
  } else if (spo2 < 88.0 && spo2Trust <= 0.6) {
    diagnosis = "SENSOR_ARTIFACT";
    diagnosisTitleEn = "SpO2 Sensor Artifact (False Alarm Prevented)";
    diagnosisTitleAr = "خلل بمجس الأكسجين (تم منع إنذار خاطئ)";
    severity = "caution";
    actionEn = "TDL detected low optical trust. Secondary vitals normal; adjust finger probe.";
    actionAr = "طبقة البيانات الموثوقة رصدت خللاً بالمجس بينما النبض سليم. إعادة تثبيت المجس.";
  } else if (coreTemp > 38.3 && tempTrust > 0.6) {
    diagnosis = "HEAT_EXHAUSTION";
    diagnosisTitleEn = "Core Body Hyperthermia / Heat Exhaustion";
    diagnosisTitleAr = "إجهاد حراري مفرط / ارتفاع حرارة الجسم المركزية";
    severity = "warning";
    actionEn = "Increase LCVG liquid cooling garment flow to MAX; rest in shadow.";
    actionAr = "زيادة تبريد سترة التبريد السائل (LCVG) للحد الأقصى والاستراحة فوراً.";
  }

  return (
    <div className="panel" style={{ padding: "16px", border: "1px solid #2d3e52" }}>
      {/* Top Header with Language Switcher */}
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "18px", color: "#4dc9f0" }}>
            {isAr ? "🩺 وحدة الطبيب والممتحن السريرية الذاتية" : "🩺 Autonomous Flight Surgeon & Examiner Console"}
          </h2>
          <span className="muted small">
            {isAr ? "مراقبة مباشرة ومستقلة لحالة رائد الفضاء الطبية وفق معايير NASA-STD-3001" : "Real-time EVA physiological triage & sensor trust validation"}
          </span>
        </div>
        <button
          className="btn sm"
          style={{ padding: "4px 10px", fontWeight: "bold" }}
          onClick={() => setLang(isAr ? "en" : "ar")}
        >
          🌐 {isAr ? "English" : "العربية"}
        </button>
      </div>

      {/* Communication Blackout Banner */}
      {commBlackout && (
        <div style={{
          background: "#241618",
          border: "1px solid #8e2b2b",
          borderRadius: "6px",
          padding: "10px 14px",
          marginBottom: "14px",
          display: "flex",
          gap: "12px",
          alignItems: "center"
        }}>
          <span style={{ fontSize: "22px" }}>📡</span>
          <div>
            <div style={{ fontWeight: "bold", color: "#ff8080", fontSize: "13px" }}>
              {isAr ? "انقطاع الاتصال المباشر مع الأرض (LOS) — نظام طبيب الفضاء الذاتي نشط" : "EARTH COMMUNICATION BLACKOUT (LOS) — AUTONOMOUS FLIGHT SURGEON ACTIVE"}
            </div>
            <div className="small" style={{ color: "#d1a3a3", marginTop: "2px" }}>
              {isAr
                ? "تأخر إشارة الاتصال 14 دقيقة و22 ثانية. يتولى الذكاء الاصطناعي فرز المؤشرات وتوجيه طبيب الطاقم تلقائياً."
                : "Earth signal round-trip delay is 28m 44s. The onboard AI engine evaluates vitals and directs emergency interventions autonomously."}
            </div>
          </div>
        </div>
      )}

      {/* Live ECG Waveform Display */}
      <div style={{ background: "#0c1015", border: "1px solid #1f2b38", borderRadius: "6px", padding: "12px", marginBottom: "14px" }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
          <div className="row gap-xs" style={{ alignItems: "center" }}>
            <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: "#34d399" }} />
            <b style={{ fontSize: "12px", color: "#e2e8f0" }}>{isAr ? "تخطيط كهربية القلب الحي (Lead-II)" : "Real-Time Lead-II ECG Waveform"}</b>
          </div>
          <div className="small mono" style={{ color: "#34d399" }}>
            {hr.toFixed(0)} BPM · 25 mm/s · 10 mm/mV
          </div>
        </div>
        <canvas ref={ecgCanvasRef} width={620} height={110} style={{ width: "100%", height: "110px", display: "block" }} />
      </div>

      {/* Vitals Grid with Sensor Trust Indicators */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "10px", marginBottom: "14px" }}>
        {/* Heart Rate */}
        <div className="card" style={{ padding: "10px", background: "#131b24" }}>
          <div className="muted small">{isAr ? "نبض القلب" : "Heart Rate"}</div>
          <div className="row" style={{ alignItems: "baseline", gap: "4px", marginTop: "2px" }}>
            <span style={{ fontSize: "20px", fontWeight: "bold", color: hr > 120 ? "#ffb070" : "#ffffff" }}>{hr.toFixed(0)}</span>
            <span className="muted small">BPM</span>
          </div>
          <div className="small" style={{ marginTop: "4px", color: hrTrust > 0.7 ? "#34d399" : "#f87171" }}>
            TDL: {(hrTrust * 100).toFixed(0)}%
          </div>
        </div>

        {/* SpO2 */}
        <div className="card" style={{ padding: "10px", background: "#131b24" }}>
          <div className="muted small">{isAr ? "تشبع الأكسجين" : "SpO2"}</div>
          <div className="row" style={{ alignItems: "baseline", gap: "4px", marginTop: "2px" }}>
            <span style={{ fontSize: "20px", fontWeight: "bold", color: spo2 < 90 ? "#ff7a85" : "#ffffff" }}>{spo2.toFixed(1)}</span>
            <span className="muted small">%</span>
          </div>
          <div className="small" style={{ marginTop: "4px", color: spo2Trust > 0.7 ? "#34d399" : "#f87171" }}>
            TDL: {(spo2Trust * 100).toFixed(0)}%
          </div>
        </div>

        {/* Core Temp */}
        <div className="card" style={{ padding: "10px", background: "#131b24" }}>
          <div className="muted small">{isAr ? "الحرارة المركزية" : "Core Temp"}</div>
          <div className="row" style={{ alignItems: "baseline", gap: "4px", marginTop: "2px" }}>
            <span style={{ fontSize: "20px", fontWeight: "bold", color: coreTemp > 38.0 ? "#ffb070" : "#ffffff" }}>{coreTemp.toFixed(1)}</span>
            <span className="muted small">°C</span>
          </div>
          <div className="small" style={{ marginTop: "4px", color: tempTrust > 0.7 ? "#34d399" : "#f87171" }}>
            TDL: {(tempTrust * 100).toFixed(0)}%
          </div>
        </div>

        {/* Suit Pressure */}
        <div className="card" style={{ padding: "10px", background: "#131b24" }}>
          <div className="muted small">{isAr ? "ضغط البذلة" : "Suit Pressure"}</div>
          <div className="row" style={{ alignItems: "baseline", gap: "4px", marginTop: "2px" }}>
            <span style={{ fontSize: "20px", fontWeight: "bold", color: suitPress < 27.0 ? "#ff7a85" : "#ffffff" }}>{suitPress.toFixed(1)}</span>
            <span className="muted small">kPa</span>
          </div>
          <div className="small" style={{ marginTop: "4px", color: pressTrust > 0.7 ? "#34d399" : "#f87171" }}>
            TDL: {(pressTrust * 100).toFixed(0)}%
          </div>
        </div>

        {/* Inspired CO2 */}
        <div className="card" style={{ padding: "10px", background: "#131b24" }}>
          <div className="muted small">{isAr ? "CO2 المستنشق" : "Inspired CO2"}</div>
          <div className="row" style={{ alignItems: "baseline", gap: "4px", marginTop: "2px" }}>
            <span style={{ fontSize: "20px", fontWeight: "bold", color: co2 > 5.0 ? "#ffb070" : "#ffffff" }}>{co2.toFixed(1)}</span>
            <span className="muted small">mmHg</span>
          </div>
          <div className="small" style={{ marginTop: "4px", color: "#34d399" }}>
            NASA &lt; 5.0
          </div>
        </div>

        {/* Radiation Rate */}
        <div className="card" style={{ padding: "10px", background: "#131b24" }}>
          <div className="muted small">{isAr ? "معدل الإشعاع" : "Radiation Rate"}</div>
          <div className="row" style={{ alignItems: "baseline", gap: "4px", marginTop: "2px" }}>
            <span style={{ fontSize: "20px", fontWeight: "bold", color: rad > 100 ? "#ff7a85" : "#ffffff" }}>{rad.toFixed(1)}</span>
            <span className="muted small">μSv/h</span>
          </div>
          <div className="small" style={{ marginTop: "4px", color: "#8a97a8" }}>
            MSL/RAD
          </div>
        </div>
      </div>

      {/* AI Clinical Diagnosis Card */}
      <div style={{
        background: severity === "critical" ? "#2d1b1f" : severity === "warning" ? "#2b2216" : "#14201b",
        border: `1px solid ${severity === "critical" ? "#f87171" : severity === "warning" ? "#fbbf24" : "#34d399"}`,
        borderRadius: "6px",
        padding: "14px"
      }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div className="row gap-xs" style={{ alignItems: "center" }}>
            <span style={{ fontSize: "18px" }}>
              {severity === "critical" ? "🚨" : severity === "warning" ? "⚠️" : "✅"}
            </span>
            <b style={{ fontSize: "14px", color: severity === "critical" ? "#ff7a85" : severity === "warning" ? "#fcd34d" : "#6ee7b7" }}>
              {isAr ? diagnosisTitleAr : diagnosisTitleEn}
            </b>
            <span className="mono small" style={{ color: "#8a97a8" }}>[{diagnosis}]</span>
          </div>
          <Chip kind={severity === "critical" ? "bad" : severity === "warning" ? "caution" : "good"}>
            {severity.toUpperCase()}
          </Chip>
        </div>
        <div style={{ marginTop: "8px", fontSize: "13px", lineHeight: "1.4" }}>
          <b>{isAr ? "بروتوكول التدخل الطبي المعتمد:" : "Approved Clinical Countermeasure:"}</b>{" "}
          {isAr ? actionAr : actionEn}
        </div>
        <div className="muted small" style={{ marginTop: "8px" }}>
          <b>{isAr ? "مرجعية معايير ناسا:" : "NASA Standards Citation:"}</b> NASA-STD-3001 Vol 2 §6 (EVA Crew Survival Thresholds)
        </div>
      </div>
    </div>
  );
}
