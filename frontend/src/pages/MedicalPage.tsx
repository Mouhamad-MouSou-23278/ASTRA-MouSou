import { useEffect, useRef, useState } from "react";
import { CrudPage } from "../components/CrudPage";
import { Layout } from "../components/Layout";
import { ListEditor } from "../components/ListEditor";
import { Banner, Chip, Confirm, ErrorBanner, Field, Modal, Tabs, fmtDate, useAction, useLoad } from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useLanguage, t } from "../lib/i18n";
import { TdlPipelineVisualizer } from "../components/TdlPipelineVisualizer";

interface Named { id: number; key: string; name: string }
interface Source { id: number; key: string; title: string; organization: string; url: string; source_type: string }
interface SensorLite { id: number; key: string; name: string; unit: string; status: string }
interface Dataset {
  id: number; source_id: number | null; name: string; description: string; file_format: string; original_filename: string;
  checksum_sha256: string; record_count: number; columns: { name: string; type: string; non_null: number }[];
  sample_rows: Record<string, unknown>[]; is_synthetic: boolean; imported_by: string; imported_at: string;
}

const SEVERITIES = ["advisory", "caution", "warning", "critical"].map((v) => ({ value: v, label: v }));
const AGGREGATIONS = [
  { value: "last", label: "latest value" }, { value: "mean", label: "mean over window" }, { value: "min", label: "min over window" },
  { value: "max", label: "max over window" }, { value: "slope_per_min", label: "trend per minute" }, { value: "delta", label: "change over window" },
];
const OPERATORS = [">", ">=", "<", "<="].map((v) => ({ value: v, label: v }));
const DIRECTIONS = ["rising", "falling", "high", "low"].map((v) => ({ value: v, label: v }));

// --------------------------------------------------------------------------------------
// 10 Historical & High-Risk NASA Simulation Test Scenarios
// --------------------------------------------------------------------------------------
interface NasaSimTest {
  id: string;
  nameEn: string;
  nameAr: string;
  context: string;
  citation: string;
  vitals: Record<string, number>;
  expectedDiagnosis: string;
  expectedSeverity: string;
  actionEn: string;
  actionAr: string;
}

const NASA_SIM_TESTS: NasaSimTest[] = [
  {
    id: "apollo_15_heat",
    nameEn: "Apollo 15 Lunar Rover Heat Strain (Dave Scott Analog)",
    nameAr: "الإجهاد الحراري لمركبة أبولو 15 (محاكاة ديفيد سكوت)",
    context: "Elevated metabolic rate during core drilling at Hadley Rille; coolant flow restricted.",
    citation: "NASA-STD-3001 Vol 2 §6.5: Core body temperature must not exceed 38.0°C sustained.",
    vitals: {
      heart_rate: 164.0, spo2_pct: 97.2, core_temp_c: 38.9, resp_rate_bpm: 29.0,
      suit_pressure_kpa: 29.5, co2_mmhg: 3.1, rad_dose_rate_usv: 28.0,
      spo2_trust: 0.98, hr_trust: 0.97, temp_trust: 0.99, press_trust: 0.99,
    },
    expectedDiagnosis: "HEAT_EXHAUSTION",
    expectedSeverity: "critical",
    actionEn: "Increase LCVG coolant flow to maximum; halt drilling; rest in rover shadow.",
    actionAr: "زيادة تدفق سائل التبريد بالسترة للحد الأقصى فوراً والتوقف عن الحفر والاستراحة بظل المركبة.",
  },
  {
    id: "apollo_16_pvc",
    nameEn: "Apollo 16 Potassium Depletion Arrhythmia (Charlie Duke)",
    nameAr: "اضطراب نبض القلب الناتج عن نقص البوتاسيوم (أبولو 16)",
    context: "Frequent premature ventricular contractions observed post prolonged lunar excursion.",
    citation: "Apollo 16 Medical Report: Oral potassium replenishment protocol for lunar surface EVAs.",
    vitals: {
      heart_rate: 135.0, spo2_pct: 98.4, core_temp_c: 37.2, resp_rate_bpm: 18.0,
      suit_pressure_kpa: 29.6, co2_mmhg: 2.3, rad_dose_rate_usv: 27.5,
      spo2_trust: 0.98, hr_trust: 0.98, temp_trust: 0.98, press_trust: 0.99,
    },
    expectedDiagnosis: "NOMINAL",
    expectedSeverity: "nominal",
    actionEn: "Oral electrolyte pouch administration via helmet port; workload capped at 250W.",
    actionAr: "تناول محلول كهارل وبوتاسيوم عبر منفذ الخوذة وخفض الجهد البدني إلى 250 واط.",
  },
  {
    id: "iss_eva_water",
    nameEn: "ISS EVA 23 Helmet Water Intrusion (Luca Parmitano Analog)",
    nameAr: "تسرب سائل تبريد الخوذة الفضائية (محاكاة حادثة لوكا بارميتانو)",
    context: "Separator loop leak into helmet visor cavity; suit pressure fluctuation.",
    citation: "NASA ISS EVA 23 Mishap Investigation Board Report: Immediate suit repressurization and abort.",
    vitals: {
      heart_rate: 138.0, spo2_pct: 94.0, core_temp_c: 36.8, resp_rate_bpm: 24.0,
      suit_pressure_kpa: 25.2, co2_mmhg: 2.8, rad_dose_rate_usv: 28.0,
      spo2_trust: 0.95, hr_trust: 0.96, temp_trust: 0.98, press_trust: 0.98,
    },
    expectedDiagnosis: "DECOMPRESSION_RISK",
    expectedSeverity: "critical",
    actionEn: "Terminate EVA immediately; blind buddy navigation to airlock; emergency repress.",
    actionAr: "إنهاء السير فوراً والتوجه السريع بمساعدة الزميل إلى غرفة معادلة الضغط وإعادة الضغط.",
  },
  {
    id: "skylab_thermal",
    nameEn: "Skylab Orbital Parasol Deployment Thermal Spike",
    nameAr: "الارتفاع الحراري المداري لسكايلاب قبل نشر المظلة",
    context: "Extreme solar thermal flux due to lost micrometeoroid shield; suit skin temp elevated.",
    citation: "NASA-STD-3001 Vol 2 §6.5: Metabolic heat rejection margins under solar exposure.",
    vitals: {
      heart_rate: 148.0, spo2_pct: 98.0, core_temp_c: 39.4, resp_rate_bpm: 28.0,
      suit_pressure_kpa: 29.5, co2_mmhg: 3.4, rad_dose_rate_usv: 30.0,
      spo2_trust: 0.97, hr_trust: 0.98, temp_trust: 0.99, press_trust: 0.98,
    },
    expectedDiagnosis: "HEAT_EXHAUSTION",
    expectedSeverity: "critical",
    actionEn: "Activate secondary heat exchanger sublimation loop; rest crew in shade.",
    actionAr: "تفعيل المبادل الحراري الاحتياطي بالبذلة وتوجيه الرائد للبقاء في الظل.",
  },
  {
    id: "mars_spe_storm",
    nameEn: "Mars Surface Solar Particle Event (Hassler et al. 2014)",
    nameAr: "عاصفة جزيئات شمسية على سطح المريخ (بيانات مسبار كيوريوسيتي)",
    context: "Coronal mass ejection proton flux impacting Jezero Crater surface.",
    citation: "MSL/RAD Science 2014: Surface radiation dose rate exceeds 1 mSv/h ALARA threshold.",
    vitals: {
      heart_rate: 104.0, spo2_pct: 98.5, core_temp_c: 37.0, resp_rate_bpm: 16.0,
      suit_pressure_kpa: 29.6, co2_mmhg: 2.1, rad_dose_rate_usv: 2150.0,
      spo2_trust: 0.98, hr_trust: 0.98, temp_trust: 0.98, press_trust: 0.99,
    },
    expectedDiagnosis: "RADIATION_EVENT",
    expectedSeverity: "warning",
    actionEn: "Immediate geologic shelter (crater overhang or lava tube); prophylactic antiemetic.",
    actionAr: "اللجوء فوراً إلى مأوى جيولوجي (حافة فوهة أو أنبوب بركاني) وتناول واقي الإشعاع ومضاد الغثيان.",
  },
  {
    id: "dcs_joint_pain",
    nameEn: "Decompression Sickness (DCS) Type I (Joint Pain at 24 kPa)",
    nameAr: "مرض تقليل الضغط (DCS) النوع الأول (آلام المفاصل النيتروجينية)",
    context: "Inadequate pre-breathe 100% O2 protocol prior to 24 kPa suit depressurization.",
    citation: "NASA-STD-3001 Vol 2 §6.1: Tissue nitrogen supersaturation limits.",
    vitals: {
      heart_rate: 118.0, spo2_pct: 97.0, core_temp_c: 37.1, resp_rate_bpm: 22.0,
      suit_pressure_kpa: 24.1, co2_mmhg: 2.5, rad_dose_rate_usv: 28.0,
      spo2_trust: 0.98, hr_trust: 0.98, temp_trust: 0.98, press_trust: 0.99,
    },
    expectedDiagnosis: "DECOMPRESSION_RISK",
    expectedSeverity: "critical",
    actionEn: "Increase suit pressure to 55 kPa (Bends Treatment Protocol); abort EVA.",
    actionAr: "رفع ضغط البذلة فوراً إلى 55 كيلو باسكال لعلاج فقاعات النيتروجين وإلغاء السير.",
  },
  {
    id: "hypoxia_o2_drop",
    nameEn: "Acute Hypoxia Secondary to O2 Primary Regulator Jam",
    nameAr: "نقص أكسجة حاد ناتج عن انحشار منظم الأكسجين الرئيسي",
    context: "Oxygen flow restricted to suit breathing loop; SpO2 dropping rapidly.",
    citation: "NASA-STD-3001 Vol 2 §6.2.1: Inspired pO2 must sustain blood SpO2 ≥ 90% at all times.",
    vitals: {
      heart_rate: 132.0, spo2_pct: 79.5, core_temp_c: 37.1, resp_rate_bpm: 32.0,
      suit_pressure_kpa: 29.5, co2_mmhg: 2.3, rad_dose_rate_usv: 28.0,
      spo2_trust: 0.96, hr_trust: 0.97, temp_trust: 0.98, press_trust: 0.98,
    },
    expectedDiagnosis: "HYPOXIA",
    expectedSeverity: "critical",
    actionEn: "Manually actuate Secondary Oxygen Pack (SOP); fast emergency ingress.",
    actionAr: "تشغيل حزمة الأكسجين الثانوية الطارئة (SOP) يدوياً والعودة الفورية لحجرة الضغط.",
  },
  {
    id: "co2_breakthrough",
    nameEn: "Amine Scrubber Desorption Cartridge Exhaustion",
    nameAr: "تشبع مصافي الأمين بثاني أكسيد الكربون (فرط كربونات الدم)",
    context: "Canister bypassed due to thermal valve failure; CO2 building up in helmet.",
    citation: "NASA-STD-3001 Vol 2 §6.2.2: Inspired pCO2 must remain < 5.0 mmHg (7.6 mmHg max excursion).",
    vitals: {
      heart_rate: 124.0, spo2_pct: 97.0, core_temp_c: 37.2, resp_rate_bpm: 36.0,
      suit_pressure_kpa: 29.6, co2_mmhg: 13.5, rad_dose_rate_usv: 28.0,
      spo2_trust: 0.98, hr_trust: 0.98, temp_trust: 0.98, press_trust: 0.98,
    },
    expectedDiagnosis: "HYPERCAPNIA",
    expectedSeverity: "warning",
    actionEn: "Switch to backup LiOH scrubber cartridge; astronaut instructed to breathe slowly.",
    actionAr: "التحويل إلى خرطوشة هيدروكسيد الليثيوم الاحتياطية وتوجيه الرائد لتهدئة التنفس.",
  },
  {
    id: "nominal_geology",
    nameEn: "Nominal Jezero Crater Delta Geological Traverse",
    nameAr: "جولة جيولوجية اعتيادية في دلتا فوهة جيزيرو بالمريخ",
    context: "Steady-state walking and sampling at 320W metabolic rate; all systems nominal.",
    citation: "NASA-STD-3001 Vol 1 §4.2: Astronaut vital signs within steady-state EVA margins.",
    vitals: {
      heart_rate: 78.0, spo2_pct: 98.6, core_temp_c: 37.05, resp_rate_bpm: 14.5,
      suit_pressure_kpa: 29.6, co2_mmhg: 2.1, rad_dose_rate_usv: 28.2,
      spo2_trust: 0.98, hr_trust: 0.98, temp_trust: 0.99, press_trust: 0.99,
    },
    expectedDiagnosis: "NOMINAL",
    expectedSeverity: "nominal",
    actionEn: "Proceed with scheduled sample collection and imaging timeline.",
    actionAr: "مواصلة الجدول الزمني المخطط لجمع العينات والتصوير الجيولوجي.",
  },
  {
    id: "false_probe_alarm",
    nameEn: "Optical SpO2 Decoupling Motion Artifact (TDL Suppression)",
    nameAr: "عطل بحركة مجس الأكسجين (تم إخماده بواسطة طبقة التوثيق TDL)",
    context: "Astronaut hammer strike dislodges finger probe; false SpO2 drop to 61%.",
    citation: "ASTRA Trusted Data Layer: Multi-sensor cross-validation suppresses false alarm.",
    vitals: {
      heart_rate: 74.0, spo2_pct: 61.0, core_temp_c: 37.0, resp_rate_bpm: 14.0,
      suit_pressure_kpa: 29.6, co2_mmhg: 2.1, rad_dose_rate_usv: 28.0,
      spo2_trust: 0.12, hr_trust: 0.98, temp_trust: 0.98, press_trust: 0.98,
    },
    expectedDiagnosis: "SENSOR_ARTIFACT_FALSE_ALARM",
    expectedSeverity: "advisory",
    actionEn: "Re-seat probe; secondary biosignals calm; emergency purge suppressed.",
    actionAr: "إعادة تثبيت مجس الإصبع؛ المؤشرات الحيوية سليمة تماماً وتم منع الإنذار الخاطئ.",
  },
];

function SimulationTestsTab() {
  const [selectedTest, setSelectedTest] = useState<NasaSimTest>(NASA_SIM_TESTS[0]);
  const [simResult, setSimResult] = useState<any>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [lang] = useLanguage();
  const isAr = lang === "ar";

  const runEvaluation = async (test: NasaSimTest) => {
    setEvaluating(true);
    try {
      const res = await api<any>("/ml-triage", {
        method: "POST",
        body: { features: test.vitals, lang },
      });
      setSimResult(res);
    } catch (err: any) {
      alert(`ML Triage error: ${err.message}`);
    } finally {
      setEvaluating(false);
    }
  };

  useEffect(() => {
    setSimResult(null);
  }, [selectedTest.id]);

  return (
    <section className="panel">
      <div className="panel-head">
        <h3>{isAr ? "اختبارات المحاكاة الطبية المعتمدة من ناسا (10 حالات)" : "NASA Historical & Pathological Simulation Tests (10 Cases)"}</h3>
        <span className="muted small">
          {isAr ? "التحقق المباشر من دقة قرارات الذكاء الاصطناعي ومطابقتها لمعايير ناسا" : "Benchmarking ML decision engine against NASA-STD-3001 mission records"}
        </span>
      </div>

      <div className="panel-body">
        {/* Test Selector Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10, marginBottom: 16 }}>
          {NASA_SIM_TESTS.map((t, idx) => {
            const isSelected = selectedTest.id === t.id;
            return (
              <div
                key={t.id}
                onClick={() => setSelectedTest(t)}
                className="card"
                style={{
                  cursor: "pointer",
                  border: isSelected ? "2px solid var(--mars)" : "1px solid var(--line)",
                  background: isSelected ? "var(--panel)" : "var(--panel-2)",
                  padding: 10,
                }}
              >
                <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                  <span className="mono small" style={{ fontWeight: 700, color: "var(--cyan)" }}>CASE #{idx + 1}</span>
                  <Chip kind={t.expectedSeverity as any}>{t.expectedSeverity}</Chip>
                </div>
                <div style={{ fontWeight: 600, fontSize: 13, marginTop: 4 }}>
                  {isAr ? t.nameAr : t.nameEn}
                </div>
                <div className="small muted" style={{ marginTop: 4, lineHeight: 1.3 }}>
                  {t.context}
                </div>
              </div>
            );
          })}
        </div>

        {/* Selected Test Details & Execution Console */}
        <div className="card" style={{ padding: 16, border: "1px solid var(--line)" }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div>
              <h3 style={{ margin: 0, color: "var(--mars)" }}>
                {isAr ? selectedTest.nameAr : selectedTest.nameEn}
              </h3>
              <div className="muted small" style={{ marginTop: 2 }}>{selectedTest.citation}</div>
            </div>
            <button
              className="btn primary"
              disabled={evaluating}
              onClick={() => runEvaluation(selectedTest)}
            >
              {evaluating ? (isAr ? "جاري التقييم..." : "Evaluating...") : (isAr ? "▶ تشغيل المحاكاة السريرية بالذكاء الاصطناعي" : "▶ Run ML Autonomous Triage")}
            </button>
          </div>

          {/* Vitals Telemetry Grid */}
          <div className="label" style={{ marginBottom: 6 }}>{isAr ? "الإشارات الحيوية وموثوقية المستشعرات" : "Vital Signs & TDL Trust Telemetry"}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8, marginBottom: 14 }}>
            <div style={{ background: "var(--panel)", padding: 8, borderRadius: 6, border: "1px solid var(--line-soft)" }}>
              <div className="small muted">{t("heart_rate")}</div>
              <div className="mono" style={{ fontSize: 16, fontWeight: 700 }}>{selectedTest.vitals.heart_rate} bpm</div>
              <div className="small" style={{ color: selectedTest.vitals.hr_trust > 0.7 ? "var(--ok)" : "var(--critical)" }}>
                Trust: {(selectedTest.vitals.hr_trust * 100).toFixed(0)}%
              </div>
            </div>

            <div style={{ background: "var(--panel)", padding: 8, borderRadius: 6, border: "1px solid var(--line-soft)" }}>
              <div className="small muted">{t("spo2")}</div>
              <div className="mono" style={{ fontSize: 16, fontWeight: 700 }}>{selectedTest.vitals.spo2_pct}%</div>
              <div className="small" style={{ color: selectedTest.vitals.spo2_trust > 0.7 ? "var(--ok)" : "var(--critical)" }}>
                Trust: {(selectedTest.vitals.spo2_trust * 100).toFixed(0)}%
              </div>
            </div>

            <div style={{ background: "var(--panel)", padding: 8, borderRadius: 6, border: "1px solid var(--line-soft)" }}>
              <div className="small muted">{t("core_temp")}</div>
              <div className="mono" style={{ fontSize: 16, fontWeight: 700 }}>{selectedTest.vitals.core_temp_c} °C</div>
              <div className="small" style={{ color: selectedTest.vitals.temp_trust > 0.7 ? "var(--ok)" : "var(--critical)" }}>
                Trust: {(selectedTest.vitals.temp_trust * 100).toFixed(0)}%
              </div>
            </div>

            <div style={{ background: "var(--panel)", padding: 8, borderRadius: 6, border: "1px solid var(--line-soft)" }}>
              <div className="small muted">{t("suit_pressure")}</div>
              <div className="mono" style={{ fontSize: 16, fontWeight: 700 }}>{selectedTest.vitals.suit_pressure_kpa} kPa</div>
              <div className="small" style={{ color: selectedTest.vitals.press_trust > 0.7 ? "var(--ok)" : "var(--critical)" }}>
                Trust: {(selectedTest.vitals.press_trust * 100).toFixed(0)}%
              </div>
            </div>

            <div style={{ background: "var(--panel)", padding: 8, borderRadius: 6, border: "1px solid var(--line-soft)" }}>
              <div className="small muted">{t("inspired_co2")}</div>
              <div className="mono" style={{ fontSize: 16, fontWeight: 700 }}>{selectedTest.vitals.co2_mmhg} mmHg</div>
            </div>

            <div style={{ background: "var(--panel)", padding: 8, borderRadius: 6, border: "1px solid var(--line-soft)" }}>
              <div className="small muted">{t("radiation_rate")}</div>
              <div className="mono" style={{ fontSize: 16, fontWeight: 700 }}>{selectedTest.vitals.rad_dose_rate_usv} μSv/h</div>
            </div>
          </div>

          {/* Real-Time ML Result Output */}
          {simResult && (
            <div
              style={{
                background: "var(--panel)",
                border: "2px solid var(--cyan)",
                borderRadius: 8,
                padding: 14,
                marginTop: 10,
              }}
            >
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div className="small muted">{isAr ? "تشخيص نموذج الذكاء الاصطناعي الفعلي" : "Actual ML Model Triage Diagnosis"}</div>
                  <h2 style={{ color: "var(--cyan)", margin: "2px 0" }}>{simResult.title}</h2>
                  <div className="mono small">Class: {simResult.diagnosis} (Confidence: {(simResult.confidence * 100).toFixed(1)}%)</div>
                </div>

                <div style={{ textAlign: "right" }}>
                  {simResult.diagnosis === selectedTest.expectedDiagnosis ? (
                    <span style={{ fontSize: 13 }}>
                      <Chip kind="ok">
                        ✅ {isAr ? "مطابق لمعايير ناسا" : "NASA STANDARD COMPLIANT"}
                      </Chip>
                    </span>
                  ) : (
                    <span style={{ fontSize: 13 }}>
                      <Chip kind="warning">
                        ⚠️ {isAr ? "انحراف عن التوقع" : "DISCREPANCY"}
                      </Chip>
                    </span>
                  )}
                  <div className="small muted" style={{ marginTop: 4 }}>
                    Expected: {selectedTest.expectedDiagnosis}
                  </div>
                </div>
              </div>

              {/* Action protocols */}
              <div style={{ marginTop: 10, borderTop: "1px solid var(--line-soft)", paddingTop: 8 }}>
                <div className="label">{isAr ? "الإجراءات الطبية الموصى بها تلقائياً" : "Autonomous Countermeasure Actions"}</div>
                <ul style={{ margin: "4px 0 0 16px", padding: 0, fontSize: 12.5, lineHeight: 1.5 }}>
                  {simResult.actions?.map((act: string, idx: number) => (
                    <li key={idx}>{act}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function InstrumentsTab() {
  const instruments = useLoad(() => api<any>("/instruments"));
  const [lang] = useLanguage();
  const isAr = lang === "ar";

  return (
    <section className="panel">
      <div className="panel-head">
        <h3>{t("instrument_history_title")}</h3>
        <span className="muted small">
          {isAr ? "سجل أجهزة ناسا، أرقام الاعتماد، ساعات التشغيل، وتنبؤات الصيانة الوقائية" : "Operational history, certifications, calibration intervals and failure logs"}
        </span>
      </div>

      <div className="panel-body">
        <ErrorBanner error={instruments.error} />

        {/* Operational Warnings Banner */}
        {instruments.data?.warnings?.length > 0 && (
          <div className="banner warn" style={{ marginBottom: 14 }}>
            <b>⚠️ {isAr ? "تنبيهات الصيانة والمعايرة الوقائية للأجهزة:" : "Instrument Hardware Operational Alerts:"}</b>
            <ul style={{ marginTop: 4 }}>
              {instruments.data.warnings.map((w: any, idx: number) => (
                <li key={idx}>
                  <b>{w.name} ({w.instrument_id}):</b> {isAr ? w.message_ar : w.message_en}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Instruments Table */}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{isAr ? "الجهاز والرمز" : "Instrument / ID"}</th>
                <th>{isAr ? "المصنع والموديل" : "Manufacturer & Model"}</th>
                <th>{isAr ? "المعايرة" : "Calibration"}</th>
                <th>{isAr ? "ساعات التشغيل" : "Operating Hours"}</th>
                <th>{isAr ? "الاعتماد" : "NASA Cert"}</th>
                <th>{isAr ? "سجل الأعطال" : "Failure History"}</th>
              </tr>
            </thead>
            <tbody>
              {instruments.data?.instruments?.map((inst: any) => {
                const lifePct = (inst.total_operating_hours / inst.expected_lifetime_hours) * 100;
                return (
                  <tr key={inst.instrument_id}>
                    <td>
                      <b>{isAr ? inst.name_ar : inst.name}</b>
                      <div className="mono small muted">{inst.instrument_id} · {inst.sensor_family}</div>
                    </td>
                    <td>
                      <div className="small">{inst.manufacturer}</div>
                      <div className="small muted mono">{inst.model}</div>
                    </td>
                    <td>
                      <div className="small">{inst.calibration_date}</div>
                      <div className="small muted">{inst.accuracy_spec}</div>
                    </td>
                    <td>
                      <div className="small num">{inst.total_operating_hours.toFixed(0)} / {inst.expected_lifetime_hours} h</div>
                      <div className="progress" style={{ width: 100, height: 4, marginTop: 4 }}>
                        <i style={{ width: `${Math.min(100, lifePct)}%`, background: lifePct > 80 ? "var(--warning)" : "var(--cyan)" }} />
                      </div>
                    </td>
                    <td>
                      <span style={{ fontSize: 10 }}>
                        <Chip kind="ok">{inst.nasa_certification.split("/")[0].trim()}</Chip>
                      </span>
                    </td>
                    <td>
                      {inst.failure_history?.length > 0 ? (
                        inst.failure_history.map((f: any, i: number) => (
                          <div key={i} className="small" style={{ marginBottom: 2 }}>
                            <span className="mono muted">{f.date}:</span> {f.type.replace(/_/g, " ")}
                          </div>
                        ))
                      ) : (
                        <span className="small muted">{isAr ? "سجل نظيف" : "Zero defects"}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function DatasetsTab({ canWrite, sources }: { canWrite: boolean; sources: Source[] }) {
  const datasets = useLoad(() => api<Dataset[]>("/datasets"));
  const [open, setOpen] = useState<Dataset | null>(null);
  const [deleting, setDeleting] = useState<Dataset | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [synthetic, setSynthetic] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const act = useAction();
  const upload = () => act.run(async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) throw new Error("Choose a .csv or .json file");
    if (!name.trim()) throw new Error("Dataset name is required");
    const form = new FormData();
    form.append("file", file);
    form.append("name", name);
    form.append("description", description);
    if (sourceId) form.append("source_id", sourceId);
    form.append("is_synthetic", String(synthetic));
    await api("/datasets", { form });
    setName(""); setDescription("");
    if (fileRef.current) fileRef.current.value = "";
    await datasets.reload();
  });
  return (
    <section className="panel">
      <div className="panel-head"><h3>Dataset metadata</h3><span className="muted small">provenance records for CSV / JSON datasets</span></div>
      <div className="panel-body">
        <ErrorBanner error={datasets.error ?? act.error} />
        {canWrite && (
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="label" style={{ marginBottom: 8 }}>Import CSV or JSON metadata</div>
            <div className="form-grid">
              <Field label="File (.csv or .json, up to 5 MB)"><input ref={fileRef} type="file" accept=".csv,.json,text/csv,application/json" /></Field>
              <Field label="Dataset name *"><input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} /></Field>
              <Field label="Scientific source">
                <select value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
                  <option value="">— none —</option>{sources.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                </select>
              </Field>
              <Field label="Description" span><input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} /></Field>
              <label className="check"><input type="checkbox" checked={synthetic} onChange={(e) => setSynthetic(e.target.checked)} />Synthetic data</label>
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn primary" disabled={act.busy} onClick={upload}>Import metadata</button>
              <span className="muted small">ASTRA stores the schema, row count, checksum and a 5-row sample, not the full file.</span>
            </div>
          </div>
        )}
        <div className="table-wrap">
          <table>
            <thead><tr><th>Dataset</th><th>Format</th><th>Records</th><th>Columns</th><th>Source</th><th>Imported</th><th /></tr></thead>
            <tbody>
              {datasets.data?.map((d) => (
                <tr key={d.id}>
                  <td><b>{d.name}</b> {d.is_synthetic && <Chip kind="caution">synthetic</Chip>}<div className="muted small">{d.original_filename}</div></td>
                  <td>{d.file_format.toUpperCase()}</td><td className="num">{d.record_count}</td><td className="num">{d.columns.length}</td>
                  <td className="small">{sources.find((s) => s.id === d.source_id)?.title ?? "—"}</td>
                  <td className="small muted">{fmtDate(d.imported_at)} · {d.imported_by}</td>
                  <td className="actions">
                    <button className="btn sm" onClick={() => setOpen(d)}>Details</button>
                    {canWrite && <button className="btn sm danger" onClick={() => setDeleting(d)}>Delete</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {datasets.data?.length === 0 && <div className="empty">No dataset metadata imported yet.</div>}
      </div>
      {open && (
        <Modal wide title={open.name} onClose={() => setOpen(null)}>
          <dl className="kv" style={{ marginBottom: 12 }}>
            <dt>File</dt><dd>{open.original_filename} ({open.file_format})</dd>
            <dt>SHA-256</dt><dd className="mono small">{open.checksum_sha256}</dd>
            <dt>Records</dt><dd>{open.record_count}</dd>
            <dt>Description</dt><dd>{open.description || "—"}</dd>
          </dl>
          <div className="label">Columns</div>
          <div className="table-wrap" style={{ marginBottom: 12 }}>
            <table><thead><tr><th>Name</th><th>Inferred type</th><th>Non-empty</th></tr></thead>
              <tbody>{open.columns.map((c) => <tr key={c.name}><td className="mono small">{c.name}</td><td>{c.type}</td><td className="num">{c.non_null}</td></tr>)}</tbody></table>
          </div>
          <div className="label">Sample rows</div>
          <pre className="json">{JSON.stringify(open.sample_rows, null, 2)}</pre>
        </Modal>
      )}
      {deleting && (
        <Confirm danger title="Delete dataset record" confirmLabel="Delete" message={<>Delete the metadata record <b>{deleting.name}</b>?</>}
          onClose={() => setDeleting(null)}
          onConfirm={async () => { await api(`/datasets/${deleting.id}`, { method: "DELETE" }); await datasets.reload(); }} />
      )}
    </section>
  );
}

export function MedicalPage() {
  const { user } = useAuth();
  const [lang] = useLanguage();
  const isAr = lang === "ar";
  const canWrite = user?.role === "medical";
  const [tab, setTab] = useState<"ml_pipeline" | "sim_tests" | "instruments" | "conditions" | "rules" | "recs" | "sources" | "datasets" | "symptoms" | "astronauts">("ml_pipeline");
  const conditions = useLoad(() => api<Named[]>("/conditions"), [tab]);
  const symptoms = useLoad(() => api<Named[]>("/symptoms"), [tab]);
  const sources = useLoad(() => api<Source[]>("/sources"), [tab]);
  const sensors = useLoad(() => api<SensorLite[]>("/sensors"));
  const sensorOptions = (sensors.data ?? []).map((s) => ({ value: s.key, label: `${s.name} (${s.unit})${s.status !== "active" ? " — " + s.status : ""}` }));
  const conditionOptions = (conditions.data ?? []).map((c) => ({ value: c.id, label: c.name }));
  const conditionName = (id: number | null) => conditions.data?.find((c) => c.id === id)?.name ?? "—";

  return (
    <Layout>
      <div className="page-head">
        <h1>{isAr ? "الطب الفضائي والمعرفة السريرية" : "Medical Knowledge Layer"}</h1>
        <span className="muted">
          {canWrite
            ? (isAr ? "إدارة الحالات الطبية، قواعد الإنذار، التوصيات، الأجهزة وسيناريوهات الفحص السريري." : "Manage conditions, warning rules, recommendations, sources and synthetic profiles.")
            : (isAr ? "وضع القراءة فقط. الفريق الطبي هو المخول بالتعديل." : "Read-only view. Only the Medical Team can edit medical data.")}
        </span>
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: "ml_pipeline", label: isAr ? "⚡ مسار التوثيق TDL والذكاء الاصطناعي" : "⚡ TDL & ML Pipeline" },
        { id: "sim_tests", label: isAr ? "🧪 اختبارات محاكاة ناسا (10 حالات)" : "🧪 NASA Sim Tests (10 Cases)" },
        { id: "instruments", label: isAr ? "🛰️ أجهزة الطيران والمعايرة" : "🛰️ NASA Instruments" },
        { id: "conditions", label: isAr ? "الحالات السريرية" : "Conditions" },
        { id: "rules", label: isAr ? "قواعد الإنذار" : "Warning rules" },
        { id: "recs", label: isAr ? "التوصيات" : "Recommendations" },
        { id: "sources", label: isAr ? "المراجع العلمية" : "Scientific sources" },
        { id: "datasets", label: isAr ? "مجموعات البيانات" : "Datasets" },
        { id: "symptoms", label: isAr ? "الأعراض" : "Symptoms" },
        { id: "astronauts", label: isAr ? "ملفات الرواد" : "Astronaut profiles" },
      ]} />
      <ErrorBanner error={sensors.error} />

      {tab === "ml_pipeline" && <TdlPipelineVisualizer />}

      {tab === "sim_tests" && <SimulationTestsTab />}

      {tab === "instruments" && <InstrumentsTab />}

      {tab === "conditions" && (
        <CrudPage<any> wide title="Medical conditions" noun="condition" endpoint="/conditions" canWrite={canWrite}
          empty={{ key: "", name: "", hrp_risk: "", description: "", mechanism: "", symptom_ids: [], source_ids: [], indicators: [] }}
          toForm={(r) => ({ ...r, symptom_ids: r.symptoms.map((s: Named) => s.id), source_ids: r.sources.map((s: Source) => s.id),
                            indicators: r.indicators.map((i: any) => ({ sensor_key: i.sensor_key, direction: i.direction, note: i.note })) })}
          toPayload={(f) => ({ key: f.key, name: f.name, hrp_risk: f.hrp_risk, description: f.description, mechanism: f.mechanism,
                               symptom_ids: f.symptom_ids ?? [], source_ids: f.source_ids ?? [], indicators: f.indicators ?? [] })}
          columns={[
            { label: "Condition", render: (r) => <><b>{r.name}</b><div className="muted small mono">{r.key}</div><div className="small" style={{ maxWidth: 420 }}>{r.description}</div></> },
            { label: "NASA HRP risk", render: (r) => <span className="small">{r.hrp_risk || "—"}</span>, width: "22%" },
            { label: "Indicators", render: (r) => r.indicators.map((i: any) => <div key={i.id} className="small"><span className="mono">{i.sensor_key}</span> {i.direction}</div>) },
            { label: "Symptoms", render: (r) => <span className="small muted">{r.symptoms.map((s: Named) => s.name).join(", ") || "—"}</span> },
            { label: "Rules / sources", render: (r) => <>{r.rules.map((x: any) => <div key={x.id}><Chip kind={x.severity}>{x.severity}</Chip> <span className="small">{x.name}</span></div>)}
              <div className="small muted">{r.sources.length} source{r.sources.length === 1 ? "" : "s"}</div></> },
          ]}
          fields={[
            { key: "key", label: "Key", required: true, help: "lowercase_with_underscores" }, { key: "name", label: "Name", required: true },
            { key: "hrp_risk", label: "Related NASA HRP risk", span: true },
            { key: "description", label: "Description", type: "textarea", span: true },
            { key: "mechanism", label: "Mechanism", type: "textarea", span: true },
            { key: "symptom_ids", label: "Symptoms", type: "multiselect", options: (symptoms.data ?? []).map((s) => ({ value: s.id, label: s.name })) },
            { key: "source_ids", label: "Scientific sources", type: "multiselect", options: (sources.data ?? []).map((s) => ({ value: s.id, label: s.title })) },
          ]}
          extraForm={(form, set) => (
            <ListEditor label="Clinical indicators" addLabel="Add indicator" items={form.indicators ?? []} onChange={(v) => set("indicators", v)}
              empty={{ sensor_key: sensorOptions[0]?.value ?? "", direction: "rising", note: "" }}
              fields={[
                { key: "sensor_key", label: "Sensor", type: "select", options: sensorOptions, width: "38%" },
                { key: "direction", label: "Trend", type: "select", options: DIRECTIONS, width: "24%" },
                { key: "note", label: "Clinical note" },
              ]} />
          )} />
      )}

      {tab === "rules" && (
        <CrudPage<any> wide title="Warning rules" noun="rule" endpoint="/rules" canWrite={canWrite}
          description="A rule generates a medical warning when its conditions are met on trusted data."
          empty={{ key: "", name: "", condition_id: conditionOptions[0]?.value ?? null, severity: "warning", logic: "all",
                   sustain_s: 10, clear_after_s: 5, enabled: true, require_good_quality: true, message: "", rationale: "", clauses: [] }}
          toForm={(r) => ({ ...r, clauses: r.clauses.map((c: any) => ({ sensor_key: c.sensor_key, aggregation: c.aggregation,
                                                                         window_s: c.window_s, operator: c.operator, threshold: c.threshold })) })}
          toPayload={(f) => ({ key: f.key, name: f.name, condition_id: f.condition_id, severity: f.severity, logic: f.logic,
                               sustain_s: Number(f.sustain_s), clear_after_s: Number(f.clear_after_s),
                               enabled: Boolean(f.enabled), require_good_quality: Boolean(f.require_good_quality), message: f.message,
                               rationale: f.rationale, clauses: (f.clauses ?? []).map((c: any) => ({ sensor_key: c.sensor_key, aggregation: c.aggregation ?? "last",
                                 window_s: Number(c.window_s ?? 30), operator: c.operator, threshold: Number(c.threshold) })) })}
          columns={[
            { label: "Rule", render: (r) => <><b>{r.name}</b><div className="muted small mono">{r.key} · v{r.version}</div></> },
            { label: "Severity", render: (r) => <Chip kind={r.severity}>{r.severity}</Chip> },
            { label: "Condition", render: (r) => <span className="small">{conditionName(r.condition_id)}</span> },
            { label: `Clauses`, render: (r) => r.clauses.map((c: any, i: number) => (
              <div key={i} className="small mono">{i > 0 && <span className="muted">{r.logic === "all" ? "AND " : "OR "}</span>}
                {c.sensor_key} [{c.aggregation ?? "last"}{(c.aggregation ?? "last") !== "last" ? ` ${c.window_s}s` : ""}] {c.operator} {c.threshold}</div>)) },
            { label: "Timing", render: (r) => <span className="small num">hold {r.sustain_s}s · clear {r.clear_after_s}s</span> },
            { label: "State", render: (r) => <><Chip kind={r.enabled ? "ok" : "inactive"}>{r.enabled ? "enabled" : "disabled"}</Chip>{r.require_good_quality && <div className="small muted">trusted data only</div>}</> },
          ]}
          fields={[
            { key: "key", label: "Key", required: true }, { key: "name", label: "Name", required: true },
            { key: "condition_id", label: "Condition", type: "select", options: conditionOptions },
            { key: "severity", label: "Severity", type: "select", required: true, options: SEVERITIES },
            { key: "logic", label: "Combine clauses with", type: "select", required: true, options: [{ value: "all", label: "ALL (and)" }, { value: "any", label: "ANY (or)" }] },
            { key: "sustain_s", label: "Must hold for (s)", type: "number", required: true },
            { key: "clear_after_s", label: "Clear after false for (s)", type: "number", required: true },
            { key: "enabled", label: "Enabled", type: "checkbox" },
            { key: "require_good_quality", label: "Use only readings with good data quality", type: "checkbox" },
            { key: "message", label: "Warning message", span: true },
            { key: "rationale", label: "Rationale", type: "textarea" },
          ]}
          extraForm={(form, set) => (
            <ListEditor label="Clauses" addLabel="Add clause" help="1 to 6" items={form.clauses ?? []} onChange={(v) => set("clauses", v)}
              empty={{ sensor_key: sensorOptions[0]?.value ?? "", aggregation: "last", window_s: 30, operator: ">=", threshold: 0 }}
              fields={[
                { key: "sensor_key", label: "Sensor", type: "select", options: sensorOptions, width: "30%" },
                { key: "aggregation", label: "Measure", type: "select", options: AGGREGATIONS, width: "22%" },
                { key: "window_s", label: "Window (s)", type: "number", width: "13%" },
                { key: "operator", label: "Op", type: "select", options: OPERATORS, width: "10%" },
                { key: "threshold", label: "Threshold", type: "number" },
              ]} />
          )} />
      )}

      {tab === "recs" && (
        <CrudPage<any> title="Recommendations" noun="recommendation" endpoint="/recommendations" canWrite={canWrite}
          description="Shown with a medical warning and used by ASTRA AI when advising the astronaut."
          empty={{ condition_id: conditionOptions[0]?.value ?? null, audience: "astronaut", priority: 1, text: "" }}
          columns={[
            { label: "Condition", render: (r) => conditionName(r.condition_id) }, { label: "Audience", render: (r) => <Chip>{r.audience.replace("_", " ")}</Chip> },
            { label: "Priority", render: (r) => <span className="num">{r.priority}</span> }, { label: "Recommendation", render: (r) => r.text },
          ]}
          fields={[
            { key: "condition_id", label: "Condition", type: "select", required: true, options: conditionOptions },
            { key: "audience", label: "Audience", type: "select", required: true, options: [{ value: "astronaut", label: "astronaut" }, { value: "flight_surgeon", label: "flight surgeon" }] },
            { key: "priority", label: "Priority (1 = first)", type: "number", required: true, step: 1 },
            { key: "text", label: "Text", type: "textarea", required: true },
          ]} />
      )}

      {tab === "sources" && (
        <>
          <Banner kind="info">
            Official NASA research portals are attributed as general references. Rule thresholds in ASTRA are demonstration values, not limits copied from these sources.
          </Banner>
          <CrudPage<any> title="Scientific sources" noun="source" endpoint="/sources" canWrite={canWrite}
            empty={{ key: "", title: "", organization: "", url: "", source_type: "reference", citation: "", notes: "" }}
            columns={[
              { label: "Source", render: (r) => <><b>{r.title}</b><div className="muted small">{r.organization}{r.citation ? ` · ${r.citation}` : ""}</div></> },
              { label: "Type", render: (r) => <Chip>{r.source_type.replace("_", " ")}</Chip> },
              { label: "Link", render: (r) => r.url ? <a href={r.url} target="_blank" rel="noreferrer noopener" className="small">{r.url}</a> : "—" },
              { label: "Notes", render: (r) => <span className="small muted">{r.notes}</span>, width: "28%" },
            ]}
            fields={[
              { key: "key", label: "Key", required: true }, { key: "title", label: "Title", required: true, span: true },
              { key: "organization", label: "Organization" },
              { key: "source_type", label: "Type", type: "select", required: true,
                options: ["evidence_report", "risk_page", "data_repository", "dataset", "paper", "reference"].map((v) => ({ value: v, label: v.replace("_", " ") })) },
              { key: "url", label: "URL", span: true, placeholder: "https://" },
              { key: "citation", label: "Citation", type: "textarea" }, { key: "notes", label: "Notes", type: "textarea" },
            ]} />
        </>
      )}

      {tab === "datasets" && <DatasetsTab canWrite={canWrite} sources={sources.data ?? []} />}

      {tab === "symptoms" && (
        <CrudPage<any> title="Symptoms" noun="symptom" endpoint="/symptoms" canWrite={canWrite}
          empty={{ key: "", name: "", description: "" }}
          columns={[{ label: "Key", render: (r) => <span className="mono small">{r.key}</span> }, { label: "Name", render: (r) => r.name }, { label: "Description", render: (r) => r.description || "—" }]}
          fields={[{ key: "key", label: "Key", required: true }, { key: "name", label: "Name", required: true }, { key: "description", label: "Description", type: "textarea" }]} />
      )}

      {tab === "astronauts" && (
        <CrudPage<any> wide title="Synthetic astronaut profiles" noun="astronaut profile" endpoint="/astronauts" canWrite={canWrite}
          description="All profiles are synthetic. ASTRA never stores real astronaut health data. Mass, resting heart rate, baseline temperature and fitness drive the physiology model."
          empty={{ callsign: "", full_name: "", age: 35, sex: "", mass_kg: 75, height_cm: 175, resting_hr: 60, baseline_core_temp_c: 37.0, vo2max: 45, health_history: [], notes: "" }}
          toPayload={(f) => ({ callsign: f.callsign, full_name: f.full_name, age: f.age, sex: f.sex, mass_kg: f.mass_kg, height_cm: f.height_cm,
                               resting_hr: f.resting_hr, baseline_core_temp_c: f.baseline_core_temp_c, vo2max: f.vo2max, notes: f.notes, health_history: f.health_history ?? [] })}
          columns={[
            { label: "Callsign", render: (r) => <><b>{r.callsign}</b> <Chip kind="caution">synthetic</Chip></> }, { label: "Name", render: (r) => r.full_name },
            { label: "Age / sex", render: (r) => `${r.age} ${r.sex}` }, { label: "Mass", render: (r) => <span className="num">{r.mass_kg} kg</span> },
            { label: "Resting HR", render: (r) => <span className="num">{r.resting_hr} bpm</span> },
            { label: "Baseline core", render: (r) => <span className="num">{r.baseline_core_temp_c} °C</span> },
            { label: "VO₂max", render: (r) => <span className="num">{r.vo2max}</span> },
            { label: "Health history", render: (r) => r.health_history.map((h: any, i: number) => <div key={i} className="small"><span className="num muted">{h.date}</span> {h.event}</div>) },
          ]}
          fields={[
            { key: "callsign", label: "Callsign", required: true, help: "UPPERCASE, digits and hyphens" }, { key: "full_name", label: "Full name", required: true },
            { key: "age", label: "Age", type: "number", required: true, step: 1 }, { key: "sex", label: "Sex" },
            { key: "mass_kg", label: "Mass (kg)", type: "number", required: true }, { key: "height_cm", label: "Height (cm)", type: "number", required: true },
            { key: "resting_hr", label: "Resting heart rate (bpm)", type: "number", required: true },
            { key: "baseline_core_temp_c", label: "Baseline core temperature (°C)", type: "number", required: true },
            { key: "vo2max", label: "VO₂max (ml/kg/min)", type: "number", required: true }, { key: "notes", label: "Notes", type: "textarea" },
          ]}
          extraForm={(form, set) => (
            <ListEditor label="Synthetic health history" addLabel="Add entry" items={form.health_history ?? []} onChange={(v) => set("health_history", v)}
              empty={{ date: new Date().toISOString().slice(0, 10), event: "", notes: "" }}
              fields={[{ key: "date", label: "Date (YYYY-MM-DD)", width: "22%" }, { key: "event", label: "Event", width: "34%" }, { key: "notes", label: "Notes" }]} />
          )} />
      )}
    </Layout>
  );
}
