/**
 * ASTRA Bilingual Internationalization (English & Arabic - إنجليزي وعربي).
 * Provides clinical, telemetry, and mission terms for international exhibitions and demonstrations.
 */
import { useEffect, useState } from "react";

export type Language = "en" | "ar";

export const DICTIONARY = {
  // Navigation & General
  app_title: { en: "ASTRA — Mars Mission & Astronaut Health", ar: "أسترا — مراقبة صحة رواد الفضاء ومحاكاة مهمة المريخ" },
  physical_lab: { en: "Physical Sensor Lab", ar: "مختبر هندسة المستشعرات الفيزيائية" },
  medical_team: { en: "Medical & Health Team", ar: "الفريق الطبي وصحة الرواد" },
  operator_console: { en: "Mission Control Console", ar: "لوحة تحكم مشغل المهمة" },
  simulated_data: { en: "SIMULATED DATA", ar: "بيانات محاكاة علمية" },
  dr_qr_access: { en: "🩺 Dr / Examiner Mobile Access (QR)", ar: "🩺 وصول الطبيب / الممتحن عبر الجوال (QR)" },
  language_toggle: { en: "العربية", ar: "English" },

  // Mars 3D HUD
  weather_clear: { en: "☀️ Clear Sol", ar: "☀️ سماء صافية" },
  weather_haze: { en: "🌫️ Dust Haze", ar: "🌫️ غبار ظهيرة" },
  weather_storm: { en: "🌪️ Jezero Dust Storm", ar: "🌪️ عاصفة ترابية بجيزيرو" },
  overlay_contours: { en: "📐 HiRISE Contours", ar: "📐 خطوط كفاف التضاريس" },
  overlay_instruments: { en: "🛰️ NASA Instruments", ar: "🛰️ أجهزة ناسا العلمية" },

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
  pipeline_title: { en: "End-to-End Sensor -> TDL -> ML Decision Pipeline", ar: "مسار المعالجة: المستشعر -> طبقة الموثوقية -> قرار الذكاء الاصطناعي" },
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
