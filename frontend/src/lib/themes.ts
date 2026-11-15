/**
 * ASTRA Multi-Theme System
 *
 * Provides 5 distinct, high-contrast, mission-tailored themes:
 * 1. Mission Dark   — Deep space mission control telemetry (default)
 * 2. NASA Blue       — High-contrast Artemis/Apollo command console
 * 3. Mars Sunrise    — Warm Martian regolith & atmospheric solar tones
 * 4. Arctic Light    — Clean, high-luminance clinical examination laboratory
 * 5. Nebula Purple   — Deep cosmic ultraviolet & cybernetic telemetry
 */
import { useEffect, useState } from "react";

export type ThemeId = "mission-dark" | "nasa-blue" | "mars-sunrise" | "arctic-light" | "nebula-purple";

export interface ThemeDefinition {
  id: ThemeId;
  nameEn: string;
  nameAr: string;
  previewColor: string;
  colorScheme: "dark" | "light";
  vars: Record<string, string>;
}

export const THEMES: ThemeDefinition[] = [
  {
    id: "mission-dark",
    nameEn: "Mission Dark",
    nameAr: "المهمة المظلمة",
    previewColor: "#e2733c",
    colorScheme: "dark",
    vars: {
      "--bg": "#080b10",
      "--bg-2": "#0d1219",
      "--panel": "#111821",
      "--panel-2": "#172029",
      "--line": "#243040",
      "--line-soft": "#1b2531",
      "--text": "#e7edf4",
      "--muted": "#8a97a8",
      "--faint": "#5d6a7b",
      "--mars": "#e2733c",
      "--mars-dim": "#7a3d1f",
      "--cyan": "#4dc9f0",
      "--ok": "#3fb97a",
      "--advisory": "#5aa7ff",
      "--caution": "#f2b632",
      "--warning": "#ff7a3d",
      "--critical": "#ff4d5e",
      "--dq": "#b394ff",
      "--truth": "#8a97a8",
    },
  },
  {
    id: "nasa-blue",
    nameEn: "NASA Artemis Blue",
    nameAr: "أزرق ناسا (أرتميس)",
    previewColor: "#38bdf8",
    colorScheme: "dark",
    vars: {
      "--bg": "#060f1e",
      "--bg-2": "#0a172e",
      "--panel": "#0f2140",
      "--panel-2": "#162e58",
      "--line": "#1e4078",
      "--line-soft": "#16315c",
      "--text": "#ecf4ff",
      "--muted": "#8ca7cc",
      "--faint": "#5a7599",
      "--mars": "#38bdf8",
      "--mars-dim": "#0369a1",
      "--cyan": "#67e8f9",
      "--ok": "#34d399",
      "--advisory": "#60a5fa",
      "--caution": "#fbbf24",
      "--warning": "#f97316",
      "--critical": "#ef4444",
      "--dq": "#c084fc",
      "--truth": "#93c5fd",
    },
  },
  {
    id: "mars-sunrise",
    nameEn: "Martian Sunrise",
    nameAr: "شروق المريخ",
    previewColor: "#ff6b35",
    colorScheme: "dark",
    vars: {
      "--bg": "#140c08",
      "--bg-2": "#1f120c",
      "--panel": "#291811",
      "--panel-2": "#382218",
      "--line": "#543324",
      "--line-soft": "#3f261b",
      "--text": "#fdf3eb",
      "--muted": "#b89481",
      "--faint": "#826353",
      "--mars": "#ff6b35",
      "--mars-dim": "#9c3b17",
      "--cyan": "#fbb040",
      "--ok": "#4ade80",
      "--advisory": "#67e8f9",
      "--caution": "#fbbf24",
      "--warning": "#f97316",
      "--critical": "#f43f5e",
      "--dq": "#d8b4fe",
      "--truth": "#fca5a5",
    },
  },
  {
    id: "arctic-light",
    nameEn: "Laboratory Daylight",
    nameAr: "نهاري طبي عالي الوضوح",
    previewColor: "#0284c7",
    colorScheme: "light",
    vars: {
      "--bg": "#f0f4f9",
      "--bg-2": "#e2e9f3",
      "--panel": "#ffffff",
      "--panel-2": "#f5f8fc",
      "--line": "#cbd5e1",
      "--line-soft": "#e2e8f0",
      "--text": "#0f172a",
      "--muted": "#475569",
      "--faint": "#64748b",
      "--mars": "#d95822",
      "--mars-dim": "#ea7d4e",
      "--cyan": "#0284c7",
      "--ok": "#16a34a",
      "--advisory": "#2563eb",
      "--caution": "#d97706",
      "--warning": "#ea580c",
      "--critical": "#dc2626",
      "--dq": "#7c3aed",
      "--truth": "#64748b",
    },
  },
  {
    id: "nebula-purple",
    nameEn: "Cosmic Nebula",
    nameAr: "سديم الفضاء الكوني",
    previewColor: "#a855f7",
    colorScheme: "dark",
    vars: {
      "--bg": "#090614",
      "--bg-2": "#100c22",
      "--panel": "#171233",
      "--panel-2": "#231c4b",
      "--line": "#3b2e78",
      "--line-soft": "#2b2259",
      "--text": "#f4efff",
      "--muted": "#a695d1",
      "--faint": "#716099",
      "--mars": "#a855f7",
      "--mars-dim": "#6b21a8",
      "--cyan": "#38bdf8",
      "--ok": "#34d399",
      "--advisory": "#818cf8",
      "--caution": "#fbbf24",
      "--warning": "#fb923c",
      "--critical": "#f43f5e",
      "--dq": "#e879f9",
      "--truth": "#c084fc",
    },
  },
];

let currentThemeId: ThemeId = (localStorage.getItem("astra_theme") as ThemeId) || "mission-dark";
const listeners = new Set<(theme: ThemeId) => void>();

export function applyTheme(id: ThemeId): void {
  const theme = THEMES.find((t) => t.id === id) || THEMES[0];
  currentThemeId = theme.id;
  localStorage.setItem("astra_theme", theme.id);

  const root = document.documentElement;
  root.dataset.theme = theme.id;
  root.style.colorScheme = theme.colorScheme;

  for (const [key, val] of Object.entries(theme.vars)) {
    root.style.setProperty(key, val);
  }

  listeners.forEach((cb) => cb(theme.id));
}

export function getTheme(): ThemeId {
  return currentThemeId;
}

export function useTheme(): [ThemeId, (id: ThemeId) => void] {
  const [themeId, setThemeId] = useState<ThemeId>(currentThemeId);

  useEffect(() => {
    // Apply initial stored theme
    applyTheme(currentThemeId);

    const handler = (newId: ThemeId) => setThemeId(newId);
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, []);

  return [themeId, applyTheme];
}
