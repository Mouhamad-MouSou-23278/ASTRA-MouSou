import { useState, type ReactNode } from "react";
import { api } from "../lib/api";
import { Confirm, ErrorBanner, Field, Modal, useAction, useLoad } from "./ui";

export type FieldDef = {
  key: string;
  label: string;
  type?: "text" | "textarea" | "number" | "select" | "checkbox" | "tags" | "multiselect";
  options?: { value: string | number; label: string }[];
  required?: boolean;
  help?: string;
  /** number fields: empty input is sent as null */
  nullable?: boolean;
  step?: number | "any";
  span?: boolean;
  lockOnEdit?: boolean;
  placeholder?: string;
};

export type Column<T> = { label: string; render: (row: T) => ReactNode; width?: string };

type Row = Record<string, any> & { id: number };

interface Props<T extends Row> {
  title: string;
  description?: ReactNode;
  endpoint: string;
  columns: Column<T>[];
  fields: FieldDef[];
  canWrite: boolean;
  empty: Record<string, unknown>;
  noun: string;
  /** Map a loaded row to form values (defaults to the row itself). */
  toForm?: (row: T) => Record<string, unknown>;
  /** Final adjustments to the payload before it is sent. */
  toPayload?: (form: Record<string, any>) => Record<string, unknown>;
  rowActions?: (row: T, reload: () => void) => ReactNode;
  extraForm?: (form: Record<string, any>, set: (key: string, value: unknown) => void) => ReactNode;
  wide?: boolean;
}

export function FormFields({ fields, form, set, editing, disabled }: {
  fields: FieldDef[]; form: Record<string, any>; set: (key: string, value: unknown) => void;
  editing?: boolean; disabled?: boolean;
}) {
  return (
    <>
      {fields.map((f) => {
        const value = form[f.key];
        const off = disabled || (editing && f.lockOnEdit);
        const type = f.type ?? "text";
        if (type === "checkbox") {
          return (
            <label key={f.key} className={`check ${f.span ? "span-all" : ""}`}>
              <input type="checkbox" checked={!!value} disabled={off} onChange={(e) => set(f.key, e.target.checked)} />
              {f.label}
              {f.help && <span className="faint small">— {f.help}</span>}
            </label>
          );
        }
        return (
          <Field key={f.key} label={f.label + (f.required ? " *" : "")} help={f.help} span={f.span || type === "textarea"}>
            {type === "textarea" ? (
              <textarea value={value ?? ""} disabled={off} placeholder={f.placeholder}
                onChange={(e) => set(f.key, e.target.value)} />
            ) : type === "select" ? (
              <select value={value ?? ""} disabled={off}
                onChange={(e) => {
                  const opt = f.options?.find((o) => String(o.value) === e.target.value);
                  set(f.key, e.target.value === "" ? null : opt ? opt.value : e.target.value);
                }}>
                {!f.required && <option value="">—</option>}
                {f.options?.map((o) => <option key={String(o.value)} value={o.value}>{o.label}</option>)}
              </select>
            ) : type === "multiselect" ? (
              <select multiple size={Math.min(8, Math.max(3, f.options?.length ?? 3))} disabled={off}
                value={(value ?? []).map(String)}
                onChange={(e) => set(f.key, Array.from(e.target.selectedOptions).map((o) => {
                  const opt = f.options?.find((x) => String(x.value) === o.value);
                  return opt ? opt.value : o.value;
                }))}>
                {f.options?.map((o) => <option key={String(o.value)} value={o.value}>{o.label}</option>)}
              </select>
            ) : type === "tags" ? (
              <input value={(value ?? []).join(", ")} disabled={off} placeholder={f.placeholder ?? "comma, separated"}
                onChange={(e) => set(f.key, e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} />
            ) : type === "number" ? (
              <input type="number" step={f.step ?? "any"} value={value ?? ""} disabled={off} placeholder={f.placeholder}
                onChange={(e) => set(f.key, e.target.value === "" ? (f.nullable ? null : "") : Number(e.target.value))} />
            ) : (
              <input value={value ?? ""} disabled={off} placeholder={f.placeholder}
                onChange={(e) => set(f.key, e.target.value)} />
            )}
          </Field>
        );
      })}
    </>
  );
}

/** Validate required fields client-side for a friendlier message; the server re-validates everything. */
export function missingRequired(fields: FieldDef[], form: Record<string, any>): string | null {
  for (const f of fields) {
    const v = form[f.key];
    if (f.required && (v === "" || v === null || v === undefined)) return `${f.label} is required`;
  }
  return null;
}

export function CrudPage<T extends Row>(props: Props<T>) {
  const { data, error, loading, reload } = useLoad<T[]>(() => api<T[]>(props.endpoint), [props.endpoint]);
  const [editing, setEditing] = useState<{ id: number | null; form: Record<string, any> } | null>(null);
  const [deleting, setDeleting] = useState<T | null>(null);
  const save = useAction();

  const open = (row: T | null) => {
    save.clear();
    setEditing({ id: row?.id ?? null, form: row ? (props.toForm ? props.toForm(row) : { ...row }) : { ...props.empty } });
  };
  const set = (key: string, value: unknown) =>
    setEditing((e) => (e ? { ...e, form: { ...e.form, [key]: value } } : e));

  const submit = () =>
    save.run(async () => {
      if (!editing) return;
      const missing = missingRequired(props.fields, editing.form);
      if (missing) throw new Error(missing);
      const picked: Record<string, unknown> = {};
      for (const f of props.fields) picked[f.key] = editing.form[f.key];
      const payload = props.toPayload ? props.toPayload({ ...editing.form, ...picked }) : picked;
      if (editing.id === null) await api(props.endpoint, { method: "POST", body: payload });
      else await api(`${props.endpoint}/${editing.id}`, { method: "PUT", body: payload });
      setEditing(null);
      await reload();
    });

  return (
    <section className="panel">
      <div className="panel-head">
        <h3>{props.title}</h3>
        <span className="muted small">{data ? `${data.length} record${data.length === 1 ? "" : "s"}` : ""}</span>
        {props.canWrite ? (
          <button className="btn primary sm right" onClick={() => open(null)}>+ New {props.noun}</button>
        ) : (
          <span className="chip right">read-only</span>
        )}
      </div>
      <div className="panel-body">
        {props.description && <p className="muted small">{props.description}</p>}
        <ErrorBanner error={error} />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {props.columns.map((c) => <th key={c.label} style={{ width: c.width }}>{c.label}</th>)}
                <th />
              </tr>
            </thead>
            <tbody>
              {data?.map((row) => (
                <tr key={row.id}>
                  {props.columns.map((c) => <td key={c.label}>{c.render(row)}</td>)}
                  <td className="actions">
                    {props.rowActions?.(row, reload)}
                    {props.canWrite && (
                      <>
                        <button className="btn sm" onClick={() => open(row)}>Edit</button>
                        <button className="btn sm danger" onClick={() => setDeleting(row)}>Delete</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && data?.length === 0 && <div className="empty">No {props.noun}s yet.</div>}
        {loading && !data && <div className="empty">Loading…</div>}
      </div>

      {editing && (
        <Modal wide={props.wide} title={`${editing.id === null ? "New" : "Edit"} ${props.noun}`} onClose={() => setEditing(null)}
          footer={
            <>
              <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn primary" disabled={save.busy} onClick={submit}>Save</button>
            </>
          }>
          <ErrorBanner error={save.error} />
          <div className="form-grid">
            <FormFields fields={props.fields} form={editing.form} set={set} editing={editing.id !== null} />
            {props.extraForm?.(editing.form, set)}
          </div>
        </Modal>
      )}
      {deleting && (
        <Confirm danger title={`Delete ${props.noun}`} confirmLabel="Delete"
          message={<>Delete <b>{String(deleting.name ?? deleting.key ?? deleting.title ?? deleting.callsign ?? deleting.id)}</b>? This cannot be undone.</>}
          onClose={() => setDeleting(null)}
          onConfirm={async () => { await api(`${props.endpoint}/${deleting.id}`, { method: "DELETE" }); await reload(); }} />
      )}
    </section>
  );
}
