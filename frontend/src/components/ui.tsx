import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { errorText } from "../lib/api";

export function fmtClock(t: number): string {
  const s = Math.max(0, Math.round(t));
  const m = Math.floor(s / 60);
  return `T+${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function fmtNum(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return v.toFixed(digits);
}

/** Decimal places that suit a sensor's range. */
export function digitsFor(unit: string, value: number | null): number {
  if (unit === "degC" || unit === "kPa" || unit === "mmHg") return 2;
  if (unit === "bpm" || unit === "W" || unit === "Pa") return 0;
  if (value !== null && Math.abs(value) >= 100) return 0;
  return 1;
}

export const UNIT_LABEL: Record<string, string> = { degC: "°C", "uSv/h": "µSv/h", uSv: "µSv" };
export const unitLabel = (u: string) => UNIT_LABEL[u] ?? u;

export function Chip({ kind, children }: { kind?: string; children: ReactNode }) {
  return <span className={`chip ${kind ?? ""}`}>{children}</span>;
}

export function Banner({ kind = "error", children }: { kind?: "error" | "info" | "ok" | "warn"; children: ReactNode }) {
  return <div className={`banner ${kind}`} role={kind === "error" ? "alert" : "status"}>{children}</div>;
}

export function ErrorBanner({ error, problems }: { error: unknown; problems?: string[] }) {
  if (!error) return null;
  return (
    <Banner kind="error">
      {errorText(error)}
      {problems && problems.length > 1 && (
        <ul>{problems.map((p, i) => <li key={i}>{p}</li>)}</ul>
      )}
    </Banner>
  );
}

export function Modal({ title, onClose, children, footer, wide }: {
  title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn ghost sm right" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, help, children, span }: { label: string; help?: string; children: ReactNode; span?: boolean }) {
  return (
    <label className={`field ${span ? "span-all" : ""}`}>
      <span>{label}</span>
      {children}
      {help && <span className="help">{help}</span>}
    </label>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: {
  tabs: { id: T; label: string }[]; value: T; onChange: (id: T) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id}
          className={`tab ${value === t.id ? "active" : ""}`} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** Load data on mount / when deps change; exposes reload and error state. */
export function useLoad<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const reload = useCallback(() => {
    const mine = ++seq.current;
    setLoading(true);
    return loader()
      .then((d) => { if (mine === seq.current) { setData(d); setError(null); } })
      .catch((e) => { if (mine === seq.current) setError(e); })
      .finally(() => { if (mine === seq.current) setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { void reload(); }, [reload]);
  return { data, error, loading, reload, setData };
}

/** Run an async action with busy + error state. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(e);
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, run, clear: () => setError(null) };
}

export function Confirm({ title, message, confirmLabel = "Confirm", danger, onConfirm, onClose }: {
  title: string; message: ReactNode; confirmLabel?: string; danger?: boolean;
  onConfirm: () => void | Promise<void>; onClose: () => void;
}) {
  const { busy, error, run } = useAction();
  return (
    <Modal title={title} onClose={onClose} footer={
      <>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className={`btn ${danger ? "solid-danger" : "primary"}`} disabled={busy}
          onClick={() => run(async () => { await onConfirm(); onClose(); })}>
          {confirmLabel}
        </button>
      </>
    }>
      <ErrorBanner error={error} />
      <div>{message}</div>
    </Modal>
  );
}
