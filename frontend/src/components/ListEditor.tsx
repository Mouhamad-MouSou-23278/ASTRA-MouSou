export type ListField = {
  key: string;
  label: string;
  type?: "text" | "number" | "select";
  options?: { value: string; label: string }[];
  width?: string;
  placeholder?: string;
};

/** Editor for a small array of flat objects (rule clauses, indicators, health history…). */
export function ListEditor<T extends Record<string, any>>({ label, items, onChange, fields, empty, addLabel, help }: {
  label: string; items: T[]; onChange: (items: T[]) => void; fields: ListField[]; empty: T; addLabel: string; help?: string;
}) {
  const update = (i: number, key: string, value: unknown) =>
    onChange(items.map((it, j) => (j === i ? { ...it, [key]: value } : it)));
  return (
    <div className="span-all">
      <div className="row" style={{ marginBottom: 6 }}>
        <span className="label">{label}</span>
        {help && <span className="faint small">{help}</span>}
        <button type="button" className="btn sm right" onClick={() => onChange([...items, { ...empty }])}>+ {addLabel}</button>
      </div>
      {items.length === 0 && <div className="muted small">None.</div>}
      {items.map((item, i) => (
        <div className="row" key={i} style={{ marginBottom: 6, alignItems: "flex-end", flexWrap: "nowrap" }}>
          {fields.map((f) => (
            <label className="field" key={f.key} style={{ flex: f.width ? `0 0 ${f.width}` : 1 }}>
              {i === 0 && <span>{f.label}</span>}
              {f.type === "select" ? (
                <select value={item[f.key] ?? ""} onChange={(e) => update(i, f.key, e.target.value)} aria-label={f.label}>
                  {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : (
                <input type={f.type === "number" ? "number" : "text"} step="any" value={item[f.key] ?? ""} aria-label={f.label}
                  placeholder={f.placeholder}
                  onChange={(e) => update(i, f.key, f.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)} />
              )}
            </label>
          ))}
          <button type="button" className="btn sm danger" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label={`Remove ${label} ${i + 1}`}>✕</button>
        </div>
      ))}
    </div>
  );
}
