import { useState } from "react";
import { Chip } from "./ui";
import { useLanguage } from "../lib/i18n";

interface PipelineState {
  scenarioId: string;
  scenarioNameEn: string;
  scenarioNameAr: string;
  sensorName: string;
  rawSignal: string;
  faultInjected: string;
  residual: number;
  threshold: number;
  trustScore: number;
  tdlVerdict: "VALIDATED" | "SUSPECT" | "SUPPRESSED_FAULT";
  mlDiagnosis: string;
  mlConfidence: number;
  mlOutcome: "FALSE_ALARM_PREVENTED" | "CRITICAL_ACTION_TRIGGERED" | "NOMINAL";
  clinicalActionEn: string;
  clinicalActionAr: string;
  nasaCitation: string;
}

const PRESET_SCENARIOS: PipelineState[] = [
  {
    scenarioId: "spo2_artifact",
    scenarioNameEn: "SpO2 Finger Probe Motion Artifact (Loose Sensor)",
    scenarioNameAr: "خلل بحركة مجس أكسجين الإصبع (مستشعر غير محكم)",
    sensorName: "Optical Pulse Oximeter (SpO2)",
    rawSignal: "SpO2 = 64.0% (Severe hypoxia indicated)",
    faultInjected: "Intermittent optical decoupling & motion artifact noise",
    residual: 34.0,
    threshold: 3.0,
    trustScore: 0.16,
    tdlVerdict: "SUPPRESSED_FAULT",
    mlDiagnosis: "SENSOR_ARTIFACT_FALSE_ALARM",
    mlConfidence: 0.88,
    mlOutcome: "FALSE_ALARM_PREVENTED",
    clinicalActionEn: "Astronaut instructed to re-seat optical finger cuff. Emergency SOP oxygen switch suppressed.",
    clinicalActionAr: "توجيه رائد الفضاء لإعادة تثبيت مشبك الإصبع. تم إيقاف التحويل الطارئ للأكسجين ومنع الهلع.",
    nasaCitation: "NASA-STD-3001 Vol 2 §6.2: Autonomous TDL prevents false oxygen purge aborts during EVA.",
  },
  {
    scenarioId: "true_hypoxia",
    scenarioNameEn: "True Acute Hypoxia (O2 Primary Loop Restriction)",
    scenarioNameAr: "نقص أكسجة حاد حقيقي (انسداد مسار الأكسجين الرئيسي)",
    sensorName: "Optical Pulse Oximeter (SpO2) + Chest Band",
    rawSignal: "SpO2 = 81.5%, HR = 128 bpm, Resp = 28 bpm",
    faultInjected: "None (Ground truth physical hypoxia)",
    residual: 0.8,
    threshold: 3.0,
    trustScore: 0.96,
    tdlVerdict: "VALIDATED",
    mlDiagnosis: "HYPOXIA",
    mlConfidence: 0.94,
    mlOutcome: "CRITICAL_ACTION_TRIGGERED",
    clinicalActionEn: "Autonomous SOP (Secondary Oxygen Pack) activation command issued; emergency ingress protocol active.",
    clinicalActionAr: "تفعيل حزمة الأكسجين الاحتياطية SOP فوراً وتوجيه رائد الفضاء للدخول الطارئ إلى حجرة الضغط.",
    nasaCitation: "NASA-STD-3001 Vol 2 §6.2.1: Blood oxygen saturation below 85% requires immediate SOP intervention.",
  },
  {
    scenarioId: "rtd_drift",
    scenarioNameEn: "Core Body RTD Thermal Resistance Drift",
    scenarioNameAr: "انحراف مقاومة مستشعر الحرارة المركزي (RTD)",
    sensorName: "Pt100 RTD Core Body Temperature Transducer",
    rawSignal: "T_core = 42.8°C (Apparent fatal hyperthermia)",
    faultInjected: "Continuous linear calibration drift (+0.12 Ω/min)",
    residual: 5.6,
    threshold: 0.5,
    trustScore: 0.21,
    tdlVerdict: "SUPPRESSED_FAULT",
    mlDiagnosis: "SENSOR_ARTIFACT_FALSE_ALARM",
    mlConfidence: 0.84,
    mlOutcome: "FALSE_ALARM_PREVENTED",
    clinicalActionEn: "Correlated with normal skin temp (36.8°C) and resting heart rate. Invasive cooling suppressed.",
    clinicalActionAr: "تمت المطابقة مع حرارة الجلد الطبيعية ونبض القلب المستقر. تم إلغاء التدخل التبريدي الحرج.",
    nasaCitation: "TDL Cross-Validation: IEC 60751 Callendar-Van Dusen curve bounds exceeded.",
  },
  {
    scenarioId: "decompression",
    scenarioNameEn: "Spacesuit Micrometeorite Puncture Breach",
    scenarioNameAr: "ثقب دقيق ببذلة الفضاء ناتج عن نيزك مجهري",
    sensorName: "Piezoresistive Diaphragm Suit Pressure Transducer",
    rawSignal: "P_suit = 22.4 kPa (Dropping at -1.4 kPa/min)",
    faultInjected: "None (Real pressure vessel depressurization)",
    residual: 0.4,
    threshold: 1.5,
    trustScore: 0.98,
    tdlVerdict: "VALIDATED",
    mlDiagnosis: "DECOMPRESSION_RISK",
    mlConfidence: 0.97,
    mlOutcome: "CRITICAL_ACTION_TRIGGERED",
    clinicalActionEn: "High-pressure makeup gas injected. 100% O2 pre-breathe purge and immediate abort.",
    clinicalActionAr: "حقن غاز التعويض عالي الضغط بالبذلة وبدء التنفس بأكسجين نقي بنسبة 100% وإلغاء المهمة فوراً.",
    nasaCitation: "NASA-STD-3001 Vol 2 §6.1.1: Suit pressure loss below 27 kPa mandates emergency repressurization.",
  },
  {
    scenarioId: "radiation_spe",
    scenarioNameEn: "Solar Particle Event (SPE) Radiation Spike",
    scenarioNameAr: "عاصفة إشعاعية شمسية مفاجئة (SPE)",
    sensorName: "Silicon PIN Diode Space Radiation Dosimeter",
    rawSignal: "Dose Rate = 1450.0 μSv/h (48× normal Mars background)",
    faultInjected: "None (Direct solar proton flux onto Mars surface)",
    residual: 18.0,
    threshold: 80.0,
    trustScore: 0.95,
    tdlVerdict: "VALIDATED",
    mlDiagnosis: "RADIATION_EVENT",
    mlConfidence: 0.96,
    mlOutcome: "CRITICAL_ACTION_TRIGGERED",
    clinicalActionEn: "Crew directed to immediate lava tube or crater overhang geologic shelter. Prophylactic antiemetic.",
    clinicalActionAr: "توجيه الطاقم للاحتماء فوراً بكهف بركاني أو حافة صخرية، وتناول واقي الإشعاع ومضاد الغثيان.",
    nasaCitation: "MSL/RAD & NASA-STD-3001 Vol 1 §4.3: Radiation exposure exceeds ALARA EVA threshold.",
  },
];

export function TdlPipelineVisualizer() {
  const [current, setCurrent] = useState<PipelineState>(PRESET_SCENARIOS[0]);
  const [lang] = useLanguage();
  const isAr = lang === "ar";

  return (
    <div className="card" style={{ padding: "16px", marginBottom: "18px", border: "1px solid #32445a" }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
        <div>
          <h3 style={{ margin: 0, color: "#4dc9f0", fontSize: "16px" }}>
            {isAr ? "⚡ مسار المعالجة المباشر: المستشعر ➔ طبقة الموثوقية (TDL) ➔ قرار الذكاء الاصطناعي" : "⚡ Live Pipeline: Physical Sensor ➔ Trusted Data Layer (TDL) ➔ ML Medical Decision"}
          </h3>
          <span className="muted small">
            {isAr ? "شاهد كيف تمنع خوارزميات الموثوقية الإنذارات الكاذبة وتتخذ القرارات الطبية في بيئة المريخ" : "Observe how sensor trust gating separates real clinical emergencies from transducer artifacts"}
          </span>
        </div>
        <div className="row gap-xs">
          {PRESET_SCENARIOS.map((sc) => (
            <button
              key={sc.scenarioId}
              className={`btn sm ${current.scenarioId === sc.scenarioId ? "primary" : ""}`}
              style={{ fontSize: "11px", padding: "3px 8px" }}
              onClick={() => setCurrent(sc)}
            >
              {isAr ? sc.scenarioNameAr.split(" ")[0] : sc.scenarioNameEn.split(" ")[0]}
            </button>
          ))}
        </div>
      </div>

      {/* Visual 5-Stage Diagram */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "8px", marginBottom: "14px" }}>
        {/* Stage 1: Physical Sensor */}
        <div style={{ background: "#151b23", border: "1px solid #2d3848", borderRadius: "6px", padding: "10px" }}>
          <div style={{ fontSize: "10px", color: "#8a97a8", fontWeight: "bold" }}>STAGE 1</div>
          <div style={{ fontWeight: 600, fontSize: "12px", color: "#e2e8f0", marginTop: "2px" }}>
            {isAr ? "المستشعر الفيزيائي" : "Physical Sensor"}
          </div>
          <div className="muted small" style={{ marginTop: "4px" }}>{current.sensorName}</div>
          <div style={{ marginTop: "6px", fontFamily: "monospace", fontSize: "11px", color: "#9fe8ff" }}>
            {current.rawSignal}
          </div>
        </div>

        {/* Stage 2: Fault Injection */}
        <div style={{ background: "#151b23", border: "1px solid #2d3848", borderRadius: "6px", padding: "10px" }}>
          <div style={{ fontSize: "10px", color: "#8a97a8", fontWeight: "bold" }}>STAGE 2</div>
          <div style={{ fontWeight: 600, fontSize: "12px", color: "#e2e8f0", marginTop: "2px" }}>
            {isAr ? "الخلل / الضوضاء" : "Disturbance / Noise"}
          </div>
          <div className="small" style={{ marginTop: "4px", color: current.faultInjected.startsWith("None") ? "#80e0a0" : "#ffb070" }}>
            {current.faultInjected}
          </div>
        </div>

        {/* Stage 3: Trusted Data Layer */}
        <div style={{
          background: "#151b23",
          border: `1px solid ${current.trustScore > 0.7 ? "#34d399" : "#f87171"}`,
          borderRadius: "6px",
          padding: "10px"
        }}>
          <div style={{ fontSize: "10px", color: "#8a97a8", fontWeight: "bold" }}>STAGE 3 (TDL)</div>
          <div style={{ fontWeight: 600, fontSize: "12px", color: "#e2e8f0", marginTop: "2px" }}>
            {isAr ? "طبقة الموثوقية" : "Trust Scoring"}
          </div>
          <div className="row" style={{ marginTop: "4px", justifyContent: "space-between" }}>
            <span className="small">Residual:</span>
            <span className="mono small">{current.residual}</span>
          </div>
          <div className="row" style={{ marginTop: "2px", justifyContent: "space-between" }}>
            <span className="small">Trust Score:</span>
            <b style={{ color: current.trustScore > 0.7 ? "#34d399" : "#f87171" }}>
              {(current.trustScore * 100).toFixed(0)}%
            </b>
          </div>
          <div style={{ marginTop: "6px" }}>
            <Chip kind={current.tdlVerdict === "VALIDATED" ? "good" : "bad"}>
              {current.tdlVerdict}
            </Chip>
          </div>
        </div>

        {/* Stage 4: ML Decision Engine */}
        <div style={{ background: "#151b23", border: "1px solid #2d3848", borderRadius: "6px", padding: "10px" }}>
          <div style={{ fontSize: "10px", color: "#8a97a8", fontWeight: "bold" }}>STAGE 4</div>
          <div style={{ fontWeight: 600, fontSize: "12px", color: "#e2e8f0", marginTop: "2px" }}>
            {isAr ? "قرار الذكاء الاصطناعي" : "ML Classification"}
          </div>
          <div style={{ marginTop: "4px", fontSize: "11px", fontWeight: "bold", color: "#c4b5fd" }}>
            {current.mlDiagnosis}
          </div>
          <div className="muted small" style={{ marginTop: "4px" }}>
            Confidence: {(current.mlConfidence * 100).toFixed(1)}%
          </div>
        </div>

        {/* Stage 5: Clinical Action */}
        <div style={{
          background: current.mlOutcome === "FALSE_ALARM_PREVENTED" ? "#1e2a22" : "#2d1b1f",
          border: `1px solid ${current.mlOutcome === "FALSE_ALARM_PREVENTED" ? "#34d399" : "#f87171"}`,
          borderRadius: "6px",
          padding: "10px"
        }}>
          <div style={{ fontSize: "10px", color: "#8a97a8", fontWeight: "bold" }}>STAGE 5</div>
          <div style={{
            fontWeight: 700,
            fontSize: "12px",
            color: current.mlOutcome === "FALSE_ALARM_PREVENTED" ? "#80e0a0" : "#ff7a85",
            marginTop: "2px"
          }}>
            {current.mlOutcome === "FALSE_ALARM_PREVENTED"
              ? (isAr ? "منع إنذار كاذب" : "False Alarm Suppressed")
              : (isAr ? "تدخل طبي طارئ" : "Emergency Action")}
          </div>
          <div className="small" style={{ marginTop: "4px", lineHeight: "1.3" }}>
            {isAr ? current.clinicalActionAr : current.clinicalActionEn}
          </div>
        </div>
      </div>

      {/* Citation footer */}
      <div className="muted small" style={{ borderTop: "1px solid #243042", paddingTop: "8px" }}>
        <b>NASA Standard Citation:</b> {current.nasaCitation}
      </div>
    </div>
  );
}
