import type { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { HOME, useAuth } from "../lib/auth";
import type { Role } from "../lib/types";
import { Chip } from "./ui";

const NAV: Record<Role, { to: string; label: string }[]> = {
  admin: [
    { to: "/admin", label: "Administration" },
    { to: "/physical", label: "Sensors (review)" },
    { to: "/medical", label: "Medical (review)" },
    { to: "/sessions", label: "Sessions" },
  ],
  physical: [
    { to: "/physical", label: "Sensor registry" },
    { to: "/medical", label: "Medical (read-only)" },
  ],
  medical: [
    { to: "/medical", label: "Medical knowledge" },
    { to: "/physical", label: "Sensors (read-only)" },
  ],
  operator: [
    { to: "/operator", label: "Test console" },
    { to: "/physical", label: "Sensors" },
    { to: "/medical", label: "Medical rules" },
  ],
  viewer: [{ to: "/sessions", label: "Sessions" }],
};

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  physical: "Physical Team",
  medical: "Medical Team",
  operator: "Test Operator",
  viewer: "Instrument Viewer",
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
  const navigate = useNavigate();
  if (!user) return null;
  return (
    <div className="app">
      <header className="topbar">
        <NavLink to={HOME[user.role]} style={{ color: "inherit", textDecoration: "none" }}>
          <Brand sub="MISSION CONTROL" />
        </NavLink>
        <nav className="nav grow" aria-label="Main">
          {NAV[user.role].map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => (isActive ? "active" : "")}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <span className="sim-banner" title="Every value in ASTRA is produced by a simulation">SIMULATED DATA</span>
        <div className="userbox">
          <span className="who muted">{user.full_name || user.username}</span>
          <Chip kind="role">{ROLE_LABEL[user.role]}</Chip>
          <button className="btn sm" onClick={() => { logout(); navigate("/login"); }}>Sign out</button>
        </div>
      </header>
      <main className={`page ${wide ? "wide" : ""}`}>{children}</main>
    </div>
  );
}
