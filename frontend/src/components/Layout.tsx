import type { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { HOME, useAuth } from "../lib/auth";
import { useLanguage, t } from "../lib/i18n";
import { THEMES, useTheme, type ThemeId } from "../lib/themes";
import type { Role } from "../lib/types";
import { Chip } from "./ui";

const NAV: Record<Role, { to: string; labelEn: string; labelAr: string }[]> = {
  admin: [
    { to: "/admin", labelEn: "Administration", labelAr: "الإدارة" },
    { to: "/physical", labelEn: "Sensors (Review)", labelAr: "المستشعرات (مراجعة)" },
    { to: "/medical", labelEn: "Medical (Review)", labelAr: "الطبية (مراجعة)" },
    { to: "/sessions", labelEn: "Sessions", labelAr: "الجلسات" },
  ],
  physical: [
    { to: "/physical", labelEn: "Sensor Registry", labelAr: "دليل المستشعرات" },
    { to: "/medical", labelEn: "Medical (Read-only)", labelAr: "الطبية (للقراءة)" },
  ],
  medical: [
    { to: "/medical", labelEn: "Medical Knowledge & Tests", labelAr: "المعرفة الطبية والاختبارات" },
    { to: "/physical", labelEn: "Sensors (Read-only)", labelAr: "المستشعرات (للقراءة)" },
  ],
  operator: [
    { to: "/operator", labelEn: "Mission Console", labelAr: "لوحة التحكم" },
    { to: "/physical", labelEn: "Sensors", labelAr: "المستشعرات" },
    { to: "/medical", labelEn: "Medical Rules & Tests", labelAr: "القواعد الطبية" },
  ],
  viewer: [{ to: "/sessions", labelEn: "Sessions", labelAr: "الجلسات" }],
};

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  physical: "Physical Team",
  medical: "Medical Team",
  operator: "Test Operator",
  viewer: "Instrument Viewer",
};

export const ROLE_LABEL_BILINGUAL: Record<Role, { en: string; ar: string }> = {
  admin: { en: "Admin", ar: "مشرف النظام" },
  physical: { en: "Physical Team", ar: "فريق الفيزياء والمستشعرات" },
  medical: { en: "Medical Team", ar: "الفريق الطبي وطب الفضاء" },
  operator: { en: "Test Operator", ar: "مشغل الاختبارات والمحاكاة" },
  viewer: { en: "Instrument Viewer", ar: "مراقب الأجهزة" },
};

export function Brand({ sub }: { sub?: string }) {
  return (
    <div className="brand">
      <span className="brand-mark" aria-hidden />
      ASTRA
      {sub && <small>{sub}</small>}
    </div>
  );
}

export function Layout({ children, wide }: { children: ReactNode; wide?: boolean }) {
  const { user, logout } = useAuth();
  const [lang, setLang] = useLanguage();
  const [theme, setTheme] = useTheme();
  const navigate = useNavigate();

  if (!user) return null;
  const isAr = lang === "ar";

  return (
    <div className="app">
      <header className="topbar">
        <NavLink to={HOME[user.role]} style={{ color: "inherit", textDecoration: "none" }}>
          <Brand sub={isAr ? "مركز قيادة المهمة" : "MISSION CONTROL"} />
        </NavLink>

        <nav className="nav grow" aria-label="Main">
          {NAV[user.role].map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => (isActive ? "active" : "")}>
              {isAr ? n.labelAr : n.labelEn}
            </NavLink>
          ))}
        </nav>

        {/* Theme Selector */}
        <div className="row" style={{ alignItems: "center", gap: 6 }}>
          <span className="small muted" style={{ fontSize: 11 }}>🎨</span>
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value as ThemeId)}
            className="small"
            style={{
              padding: "3px 8px",
              height: 26,
              fontSize: 11,
              width: "auto",
              cursor: "pointer",
            }}
            title={isAr ? "تغيير المظهر" : "Select Theme"}
          >
            {THEMES.map((th) => (
              <option key={th.id} value={th.id}>
                {isAr ? th.nameAr : th.nameEn}
              </option>
            ))}
          </select>
        </div>

        {/* Bilingual Language Switcher */}
        <button
          className="btn sm"
          style={{
            fontWeight: 700,
            fontSize: 11.5,
            borderColor: "var(--line)",
            padding: "0 10px",
          }}
          onClick={() => setLang(isAr ? "en" : "ar")}
          title={isAr ? "Switch to English" : "التبديل إلى العربية"}
        >
          🌐 {isAr ? "English" : "العربية"}
        </button>

        <span className="sim-banner" title={isAr ? "جميع البيانات مولدة بمحاكاة علمية" : "Every value in ASTRA is produced by a simulation"}>
          {t("simulated_data")}
        </span>

        <div className="userbox">
          <span className="who muted">{user.full_name || user.username}</span>
          <Chip kind="role">{isAr ? ROLE_LABEL_BILINGUAL[user.role].ar : ROLE_LABEL_BILINGUAL[user.role].en}</Chip>
          <button className="btn sm" onClick={() => { logout(); navigate("/login"); }}>
            {t("sign_out")}
          </button>
        </div>
      </header>

      <main className={`page ${wide ? "wide" : ""}`}>{children}</main>
    </div>
  );
}
