/**
 * ASTRA Bilingual Internationalization (English & Arabic - إنجليزي وعربي).
 * Provides clinical, telemetry, aerospace engineering, and mission terms
 * for international exhibitions, jury demonstrations, and clinical evaluation.
 */
import { useEffect, useState } from "react";

export type Language = "en" | "ar";

export const DICTIONARY = {
  // Navigation & General
  app_title: { en: "ASTRA — Mars Mission & Astronaut Health", ar: "أسترا — مراقبة صحة رواد الفضاء ومحاكاة مهمة المريخ" },
  physical_lab: { en: "Physical Sensor Lab", ar: "مختبر هندسة المستشعرات الفيزيائية" },
  medical_team: { en: "Medical & Health Team", ar: "الفريق الطبي وصحة الرواد" },
  operator_console: { en: "Mission Control Console", ar: "لوحة تحكم مشغل المهمة" },
  admin_console: { en: "Administration Console", ar: "لوحة الإدارة والتحكم" },
  sessions_view: { en: "Simulation Sessions", ar: "جلسات المحاكاة" },
  simulated_data: { en: "SIMULATED DATA", ar: "بيانات محاكاة علمية" },
  dr_qr_access: { en: "🩺 Dr / Examiner Mobile Access (QR)", ar: "🩺 وصول الطبيب / الممتحن عبر الجوال (QR)" },
  language_toggle: { en: "العربية", ar: "English" },
  theme_selector: { en: "Theme", ar: "المظهر" },
  sign_out: { en: "Sign out", ar: "تسجيل الخروج" },
  sign_in: { en: "Sign in", ar: "تسجيل الدخول" },
  username: { en: "Username", ar: "اسم المستخدم" },
  password: { en: "Password", ar: "كلمة المرور" },
  role: { en: "Role", ar: "الدور الوظيفي" },
  fullscreen: { en: "Fullscreen Presentation", ar: "عرض ملء الشاشة" },
  exit_fullscreen: { en: "Exit Fullscreen", ar: "إنهاء ملء الشاشة" },

  // Mars 3D HUD & Environment
  weather_clear: { en: "☀️ Clear Sol", ar: "☀️ سماء صافية" },
  weather_haze: { en: "🌫️ Dust Haze", ar: "🌫️ غبار ظهيرة" },
  weather_storm: { en: "🌪️ Jezero Dust Storm", ar: "🌪️ عاصفة ترابية بجيزيرو" },
  overlay_contours: { en: "📐 HiRISE Contours", ar: "📐 خطوط كفاف التضاريس" },
  overlay_instruments: { en: "🛰️ NASA Instruments", ar: "🛰️ أجهزة ناسا العلمية" },
  camera_third: { en: "3rd Person", ar: "منظور خارجي" },
  camera_first: { en: "1st Person (Helmet)", ar: "منظور الخوذة" },
  camera_overview: { en: "Orbital Overview", ar: "منظور مداري شامل" },
  camera_closeup: { en: "Biomedical Close-up", ar: "لقطة حيوية مقربة" },
  camera_rover: { en: "Perseverance Mast", ar: "كاميرا مركبة بيرسيفيرنس" },
  camera_ingenuity: { en: "Ingenuity Helicopter", ar: "مروحية إنجينويتي" },

  // Clinical & Doctor Console
  dr_console_title: { en: "Autonomous Flight Surgeon & Examiner Console", ar: "لوحة طبيب الطيران الذاتي واستشاري الطاقم" },
  comm_blackout_title: { en: "EARTH COMM BLACKOUT (LOS)", ar: "انقطاع الاتصال مع الأرض (فقدان الإشارة)" },
  comm_blackout_desc: {
    en: "Communication latency is 14m 22s. Autonomous AI Flight Surgeon is managing crew vital triage under NASA-STD-3001.",
    ar: "فارق إشارة الاتصال 14 دقيقة و22 ثانية. نظام طبيب الطيران الذكائي المستقل يتولى الفرز والتشخيص الطبي وفق معايير ناسا.",
  },
  live_ecg: { en: "Real-Time Lead-II Electrocardiogram (ECG)", ar: "تخطيط كهربية القلب الحي (ECG Lead-II)" },
  vital_signs: { en: "Astronaut Vital Signs", ar: "العلامات الحيوية لرائد الفضاء" },
  heart_rate: { en: "Heart Rate", ar: "معدل نبضات القلب" },
  spo2: { en: "Blood Oxygen (SpO2)", ar: "تشبع الأكسجين في الدم" },
  core_temp: { en: "Core Temperature", ar: "درجة الحرارة المركزية" },
  resp_rate: { en: "Respiration Rate", ar: "معدل التنفس" },
  suit_pressure: { en: "Spacesuit Pressure", ar: "ضغط بذلة الفضاء" },
  inspired_co2: { en: "Inspired CO2", ar: "ثاني أكسيد الكربون المستنشق" },
  radiation_rate: { en: "Ionizing Radiation", ar: "الإشعاع المؤين" },
  custom_scenario_title: { en: "🩺 Custom Clinical Scenario Injection", ar: "🩺 إدخال سيناريو طبي مخصص للممتحن" },
  custom_scenario_placeholder: {
    en: "Doctor / Examiner: Write scenario here (e.g. 'Simulate acute SpO2 drop to 78% during sample collection while suit pressure is nominal')...",
    ar: "للطبيب أو الممتحن: اكتب السيناريو هنا (مثال: 'محاكاة هبوط أكسجين حاد إلى 78% أثناء جمع العينات مع بقاء ضغط البذلة طبيعياً')...",
  },
  send_to_ai: { en: "🤖 Send to ASTRA AI", ar: "🤖 إرسال إلى ذكاء أسترا" },
  execute_scenario: { en: "▶ Execute Scenario", ar: "▶ تطبيق السيناريو بالمحاكاة" },
  scenario_history: { en: "Recent Scenario Injections", ar: "سجل السيناريوهات المدخلة مؤخراً" },
  ai_interpretation: { en: "AI Clinical Interpretation & Safety Analysis", ar: "تفسير الذكاء الاصطناعي والتحليل السريري" },

  // Trusted Data Layer (TDL) & ML
  tdl_title: { en: "Trusted Data Layer (TDL) Integrity", ar: "طبقة البيانات الموثوقة وسلامة المستشعرات" },
  tdl_trust_score: { en: "Sensor Trust Score", ar: "درجة موثوقية المستشعر" },
  tdl_status_good: { en: "HIGH INTEGRITY (VALIDATED)", ar: "موثوقية عالية (بيانات سليمة)" },
  tdl_status_suspect: { en: "DEGRADED (HIGH RESIDUAL)", ar: "موثوقية منخفضة (انحراف مرتفع)" },
  tdl_status_bad: { en: "FAULT DETECTED (SUPPRESSED)", ar: "عطل مكتشف (تم عزل الإشارة)" },
  ml_decision_title: { en: "Machine Learning Autonomous Triage", ar: "قرار الفرز الطبي للذكاء الاصطناعي" },
  confidence: { en: "Confidence", ar: "نسبة الثقة" },
  false_alarm_prevented: { en: "False Alarm Prevented (Sensor Artifact)", ar: "تم منع إنذار خاطئ (خلل بمستشعر)" },
  emergency_protocol: { en: "Emergency Countermeasure Protocol", ar: "بروتوكول التدخل العلاجي الطارئ" },
  pipeline_title: { en: "End-to-End Sensor ➔ TDL ➔ ML Decision Pipeline", ar: "مسار المعالجة: المستشعر ➔ طبقة الموثوقية ➔ قرار الذكاء الاصطناعي" },
  run_all_tests: { en: "▶ Run All 20 TDL Test Cases", ar: "▶ تشغيل كافة حالات الاختبار العشرين" },
  running_tests: { en: "Running Verification...", ar: "جاري الفحص السريري..." },
  test_mode: { en: "Interactive Test Mode", ar: "نمط الاختبار التفاعلي" },
  tests_passed: { en: "Tests Passed", ar: "الاختبارات الناجحة" },
  false_alarms_suppressed: { en: "False Alarms Suppressed", ar: "إنذارات كاذبة تم إخمادها" },

  // Physical Engineering Lab
  sensors_title: { en: "Flight Sensor Catalogue & Transducers", ar: "دليل مستشعرات ومحولات الطيران الفضائي" },
  sensor_name: { en: "Sensor Name", ar: "اسم المستشعر" },
  sensor_key: { en: "Telemetry Key", ar: "رمز القياس" },
  sensor_unit: { en: "Unit", ar: "الوحدة" },
  sensor_status: { en: "Status", ar: "الحالة" },
  sensor_category: { en: "Category", ar: "التصنيف" },
  profiles_title: { en: "Simulation Profiles", ar: "ملفات المحاكاة" },
  custom_fields_title: { en: "Technical Specifications", ar: "المواصفات الفنية المخصصة" },
  sensor_placement: { en: "3D Sensor Anatomical Placement", ar: "الموضع التشريحي ثلاثي الأبعاد للمستشعر" },
  ai_sensor_assistant: { en: "Physical Engineering AI Assistant", ar: "مساعد الذكاء الاصطناعي لهندسة المستشعرات" },

  // Medical Team & Instruments
  conditions_title: { en: "NASA Clinical Conditions", ar: "الحالات الطبية المعتمدة بناسا" },
  warning_rules_title: { en: "Warning Rules & Thresholds", ar: "قواعد الإنذار وحدود العتبات" },
  recommendations_title: { en: "Clinical Recommendations", ar: "التوصيات والبروتوكولات السريرية" },
  sources_title: { en: "NASA Scientific Sources & Provenance", ar: "المصادر والمراجع العلمية لناسا" },
  datasets_title: { en: "Telemetry Datasets (10k+ Samples)", ar: "مجموعات البيانات (10 آلاف عينة+)" },
  astronaut_profiles_title: { en: "Astronaut Physiological Profiles", ar: "الملفات الفسيولوجية لرواد الفضاء" },
  instrument_history_title: { en: "NASA Flight Instruments Lifecycle & Calibration", ar: "سجل أجهزة ناسا ومعايرتها ودورات حياتها" },
  pre_sim_title: { en: "Pre-EVA Predictive Medical Risk Assessment", ar: "التقييم التنبؤي لمخاطر رائد الفضاء قبل السير" },
  medical_tests_title: { en: "NASA Historical Simulation Test Scenarios", ar: "سيناريوهات الاختبار التاريخية لمحاكاة ناسا" },

  // Operator Console
  scenario_prompt_title: { en: "Natural Language Mission Scenario", ar: "سيناريو المهمة باللغة الطبيعية" },
  generate_plan: { en: "Generate Plan", ar: "توليد الخطة" },
  confirm_plan: { en: "Confirm Plan & Create Session", ar: "تأكيد الخطة وإنشاء الجلسة" },
  start_session: { en: "Start Simulation", ar: "بدء المحاكاة" },
  pause_session: { en: "Pause", ar: "إيقاف مؤقت" },
  stop_session: { en: "Stop", ar: "إيقاف" },
  restart_session: { en: "Restart", ar: "إعادة البدء" },
  playback_speed: { en: "Speed", ar: "السرعة" },
  viewer_qr: { en: "📱 Viewer QR", ar: "📱 رمز الاستجابة السريعة (QR)" },
  ask_astra: { en: "Ask ASTRA AI Assistant...", ar: "اسأل المساعد الذكي أسترا..." },
  voice_input: { en: "Voice Input", ar: "إدخال صوتي" },
  speak_answers: { en: "Speak answers", ar: "نطق الإجابات صوتياً" },

  // Common Actions
  save: { en: "Save", ar: "حفظ" },
  cancel: { en: "Cancel", ar: "إلغاء" },
  edit: { en: "Edit", ar: "تعديل" },
  delete_btn: { en: "Delete", ar: "حذف" },
  create_new: { en: "Create New", ar: "إنشاء جديد" },
  details: { en: "Details", ar: "التفاصيل" },
  refresh: { en: "Refresh", ar: "تحديث" },
  close: { en: "Close", ar: "إغلاق" },
  back: { en: "Back", ar: "رجوع" },
  loading: { en: "Loading...", ar: "جاري التحميل..." },
  error_label: { en: "Error", ar: "خطأ" },
  success_label: { en: "Success", ar: "تم بنجاح" },
};

let currentLang: Language = (localStorage.getItem("astra_lang") as Language) || "en";
const listeners = new Set<(lang: Language) => void>();

export function getLanguage(): Language {
  return currentLang;
}

export function setLanguage(lang: Language): void {
  currentLang = lang;
  localStorage.setItem("astra_lang", lang);
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  document.documentElement.lang = lang;
  listeners.forEach((cb) => cb(lang));
}

export function t(key: keyof typeof DICTIONARY): string {
  const entry = DICTIONARY[key];
  if (!entry) return key;
  return entry[currentLang] || entry.en;
}

export function useLanguage(): [Language, (lang: Language) => void] {
  const [lang, setLangState] = useState<Language>(currentLang);

  useEffect(() => {
    // Set initial dir
    document.documentElement.dir = currentLang === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = currentLang;

    const handler = (l: Language) => setLangState(l);
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, []);

  const change = (newLang: Language) => {
    setLanguage(newLang);
  };

  return [lang, change];
}
