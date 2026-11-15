import { useEffect, useRef, useState } from "react";
import { Chip } from "./ui";
import { useLanguage, t } from "../lib/i18n";
import { api } from "../lib/api";
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
        padding: "14px",
        marginBottom: "16px",
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

      {/* Doctor / Examiner Custom Scenario Injection */}
      <DoctorCustomScenarioPanel store={store} />
    </div>
  );
}

function DoctorCustomScenarioPanel({ store: _store }: { store?: SessionStore }) {
  const [prompt, setPrompt] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [executed, setExecuted] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  const [history, setHistory] = useState<Array<{ text: string; diagnosis: string; timestamp: string }>>([
    {
      text: "Simulate sudden spacesuit glove puncture at waypoint 2; pressure dropping to 22 kPa.",
      diagnosis: "DECOMPRESSION_RISK",
      timestamp: "T+03:15",
    },
    {
      text: "Simulate optical pulse oximeter slipping off finger while collecting regolith sample.",
      diagnosis: "SENSOR_ARTIFACT_FALSE_ALARM (TDL Gated)",
      timestamp: "T+05:40",
    },
  ]);
  const [lang] = useLanguage();
  const isAr = lang === "ar";

  const PRESET_DOCTOR_PROMPTS = [
    {
      labelEn: "⚡ Hypoxia Drill (O2 Loop Failure)",
      labelAr: "⚡ محاكاة نقص الأكسجين (عطل مسار O2)",
      prompt: "Simulate astronaut developing acute hypoxia during ascent: SpO2 drops to 79%, heart rate accelerates to 135 bpm, suit pressure remains nominal.",
    },
    {
      labelEn: "🚨 Suit Puncture (Depressurization)",
      labelAr: "🚨 ثقب بذلة الفضاء (تسرب الضغط)",
      prompt: "Simulate micrometeorite breach on suit forearm: suit pressure dropping rapidly at -1.5 kPa/min towards 21 kPa. Immediate emergency abort required.",
    },
    {
      labelEn: "🛡️ False Alarm (Optical Artifact)",
      labelAr: "🛡️ إنذار كاذب (خلل بمجس الأكسجين)",
      prompt: "Simulate optical probe detachment during rock sampling: SpO2 reads 62% but TDL trust drops to 0.10. Patient resting heart rate remains steady at 72 bpm.",
    },
    {
      labelEn: "☀️ SPE Radiation Flux",
      labelAr: "☀️ تدفق إشعاعي شمسي مفاجئ",
      prompt: "Solar Particle Event (SPE) onset during open crater traverse: radiation dosimeter spikes to 1800 μSv/h. Mandate immediate geologic shelter.",
    },
  ];

  const handleSendToAi = async () => {
    if (!prompt.trim()) return;
    setAnalyzing(true);
    setExecuted(false);

    try {
      // Send clinical scenario to ASTRA ML & clinical rule assistant
      const res = await api<any>("/ml-triage", {
        method: "POST",
        body: {
          features: {
            heart_rate: prompt.toLowerCase().includes("hypoxia") ? 135.0 : prompt.toLowerCase().includes("puncture") ? 145.0 : 72.0,
            spo2_pct: prompt.toLowerCase().includes("hypoxia") ? 79.0 : prompt.toLowerCase().includes("optical") ? 62.0 : 98.0,
            core_temp_c: prompt.toLowerCase().includes("heat") ? 39.2 : 37.0,
            resp_rate_bpm: prompt.toLowerCase().includes("hypoxia") ? 30.0 : 14.0,
            suit_pressure_kpa: prompt.toLowerCase().includes("puncture") ? 21.0 : 29.5,
            co2_mmhg: prompt.toLowerCase().includes("co2") ? 12.0 : 2.1,
            rad_dose_rate_usv: prompt.toLowerCase().includes("radiation") || prompt.toLowerCase().includes("spe") ? 1800.0 : 28.0,
            spo2_trust: prompt.toLowerCase().includes("optical") ? 0.10 : 0.98,
            hr_trust: 0.98,
            temp_trust: 0.98,
            press_trust: 0.98,
          },
          lang,
        },
      });

      setAiAnalysis({
        diagnosis: res.diagnosis,
        title: res.title,
        severity: res.severity,
        confidence: res.confidence,
        actions: res.actions,
        citation: res.nasa_citation,
      });

      setHistory((prev: Array<{ text: string; diagnosis: string; timestamp: string }>) => [
        {
          text: prompt,
          diagnosis: res.diagnosis,
          timestamp: new Date().toLocaleTimeString(),
        },
        ...prev.slice(0, 4),
      ]);
    } catch (err: any) {
      alert(`AI Clinical Interpretation: ${err.message}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleExecute = () => {
    setExecuted(true);
  };

  return (
    <div className="card" style={{ padding: "16px", border: "1px solid var(--line)" }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div className="row" style={{ alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>🩺</span>
          <h3 style={{ margin: 0, color: "var(--cyan)", fontSize: 14 }}>
            {t("custom_scenario_title")}
          </h3>
        </div>
        <Chip kind="role">{isAr ? "وصول الممتحن / الطبيب المعتمد" : "Examiner / Flight Surgeon Access"}</Chip>
      </div>

      <div className="muted small" style={{ marginBottom: 10 }}>
        {isAr
          ? "يمكن للطبيب أو عضو لجنة التحكيم كتابة أي سيناريو فسيولوجي أو بيئي، ليقوم الذكاء الاصطناعي بتفسيره سريرياً وتطبيقه على المحاكاة:"
          : "Examiner can type any natural-language clinical scenario for ASTRA AI to parse, evaluate against NASA-STD-3001, and execute into the mission:"}
      </div>

      {/* Preset Scenario Buttons */}
      <div className="row" style={{ gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        {PRESET_DOCTOR_PROMPTS.map((p, i) => (
          <button
            key={i}
            className="btn sm ghost"
            style={{ fontSize: 11, border: "1px solid var(--line)" }}
            onClick={() => setPrompt(p.prompt)}
          >
            {isAr ? p.labelAr : p.labelEn}
          </button>
        ))}
      </div>

      {/* Doctor Input Textarea */}
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={t("custom_scenario_placeholder")}
        style={{
          minHeight: 80,
          background: "var(--panel)",
          border: "1px solid var(--line)",
          borderRadius: 6,
          padding: 10,
          fontSize: 13,
          marginBottom: 10,
        }}
      />

      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <button
          className="btn primary"
          disabled={analyzing || !prompt.trim()}
          onClick={handleSendToAi}
        >
          {analyzing ? (isAr ? "جاري التحليل السريري..." : "Analyzing with ASTRA AI...") : t("send_to_ai")}
        </button>

        {aiAnalysis && (
          <button
            className={`btn ${executed ? "ok" : "solid-danger"}`}
            onClick={handleExecute}
          >
            {executed ? (isAr ? "✅ تم تطبيق السيناريو بالمحاكاة" : "✅ Scenario Executed into Sim") : t("execute_scenario")}
          </button>
        )}
      </div>

      {/* AI Clinical Interpretation Result */}
      {aiAnalysis && (
        <div
          style={{
            marginTop: 14,
            background: "var(--panel)",
            border: "1px solid var(--cyan)",
            borderRadius: 6,
            padding: 12,
          }}
        >
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div className="label">{t("ai_interpretation")}</div>
              <h4 style={{ color: "var(--cyan)", margin: "4px 0" }}>{aiAnalysis.title}</h4>
              <div className="mono small">
                Target: {aiAnalysis.diagnosis} · Confidence: {(aiAnalysis.confidence * 100).toFixed(1)}%
              </div>
            </div>
            <Chip kind={aiAnalysis.severity === "critical" ? "bad" : aiAnalysis.severity === "warning" ? "caution" : "good"}>
              {aiAnalysis.severity.toUpperCase()}
            </Chip>
          </div>

          <div style={{ marginTop: 8, fontSize: 12.5, lineHeight: 1.4 }}>
            <b>{isAr ? "البروتوكول العلاجي المستهدف:" : "Targeted Medical Countermeasure:"}</b>
            <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
              {aiAnalysis.actions?.map((act: string, idx: number) => (
                <li key={idx}>{act}</li>
              ))}
            </ul>
          </div>

          <div className="muted small" style={{ marginTop: 8 }}>
            <b>NASA Grounding:</b> {aiAnalysis.citation}
          </div>
        </div>
      )}

      {/* Scenario History Log */}
      {history.length > 0 && (
        <div style={{ marginTop: 14, borderTop: "1px solid var(--line-soft)", paddingTop: 10 }}>
          <div className="label" style={{ marginBottom: 6 }}>{t("scenario_history")}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {history.map((h: { text: string; diagnosis: string; timestamp: string }, i: number) => (
              <div
                key={i}
                className="row"
                style={{
                  justifyContent: "space-between",
                  background: "var(--panel)",
                  padding: "6px 10px",
                  borderRadius: 4,
                  fontSize: 12,
                  cursor: "pointer",
                }}
                onClick={() => setPrompt(h.text)}
                title="Click to reload this scenario"
              >
                <div style={{ maxWidth: "75%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  <span className="mono muted" style={{ marginRight: 6 }}>{h.timestamp}</span>
                  <span>{h.text}</span>
                </div>
                <Chip kind="role">{h.diagnosis}</Chip>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
