import { useRef, useState } from "react";
import { CrudPage } from "../components/CrudPage";
import { Layout } from "../components/Layout";
import { ListEditor } from "../components/ListEditor";
import { Banner, Chip, Confirm, ErrorBanner, Field, Modal, Tabs, fmtDate, useAction, useLoad } from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

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
  const canWrite = user?.role === "medical";
  const [tab, setTab] = useState<"ml_pipeline" | "conditions" | "rules" | "recs" | "sources" | "datasets" | "symptoms" | "astronauts">("ml_pipeline");
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
        <h1>Medical knowledge layer</h1>
        <span className="muted">{canWrite ? "Manage conditions, warning rules, recommendations, sources and synthetic profiles." : "Read-only view. Only the Medical Team can edit medical data."}</span>
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: "ml_pipeline", label: "⚡ TDL & ML Pipeline" },
        { id: "conditions", label: "Conditions" }, { id: "rules", label: "Warning rules" }, { id: "recs", label: "Recommendations" },
        { id: "sources", label: "Scientific sources" }, { id: "datasets", label: "Datasets" }, { id: "symptoms", label: "Symptoms" },
        { id: "astronauts", label: "Astronaut profiles" },
      ]} />
      <ErrorBanner error={sensors.error} />

      {tab === "ml_pipeline" && <TdlPipelineVisualizer />}

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
            { key: "description", label: "Description", type: "textarea" },
            { key: "mechanism", label: "Mechanism (used by ASTRA AI to explain why)", type: "textarea" },
            { key: "symptom_ids", label: "Symptoms (Ctrl/⌘-click for several)", type: "multiselect", options: (symptoms.data ?? []).map((s) => ({ value: s.id, label: s.name })) },
            { key: "source_ids", label: "Scientific sources", type: "multiselect", options: (sources.data ?? []).map((s) => ({ value: s.id, label: s.title })) },
          ]}
          extraForm={(form, set) => (
            <ListEditor label="Sensor indicators" addLabel="Add indicator" items={form.indicators ?? []} onChange={(v) => set("indicators", v)}
              empty={{ sensor_key: sensorOptions[0]?.value ?? "", direction: "rising", note: "" }}
              fields={[
                { key: "sensor_key", label: "Sensor", type: "select", options: sensorOptions, width: "34%" },
                { key: "direction", label: "Direction", type: "select", options: DIRECTIONS, width: "18%" },
                { key: "note", label: "Note" },
              ]} />
          )} />
      )}

      {tab === "rules" && (
        <CrudPage<any> wide title="Multi-sensor warning rules" noun="rule" endpoint="/rules" canWrite={canWrite}
          description={<>A rule raises a <b>medical</b> warning when its clauses hold on <b>trusted</b> sensor output for the sustain time.
            Readings flagged by data quality are never used as evidence; the rule is reported as inhibited instead. Changes apply to new sessions.</>}
          empty={{ key: "", name: "", condition_id: null, severity: "caution", logic: "all", sustain_s: 10, clear_after_s: 30, require_good_quality: true,
                   enabled: true, message: "", rationale: "", clauses: [{ sensor_key: sensorOptions[0]?.value ?? "", aggregation: "last", window_s: 30, operator: ">=", threshold: 0 }] }}
          toPayload={(f) => ({ key: f.key, name: f.name, condition_id: f.condition_id, severity: f.severity, logic: f.logic, sustain_s: f.sustain_s,
                               clear_after_s: f.clear_after_s, require_good_quality: f.require_good_quality, enabled: f.enabled, message: f.message,
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
