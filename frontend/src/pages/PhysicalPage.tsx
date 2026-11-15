import { useState } from "react";
import { CrudPage, FormFields, missingRequired, type FieldDef } from "../components/CrudPage";
import { Layout } from "../components/Layout";
import { Banner, Chip, Confirm, ErrorBanner, Field, Modal, Tabs, fmtDate, useAction, useLoad } from "../components/ui";
import { SensorPlacementCanvas } from "../components/SensorPlacementCanvas";
import { TrustedDataChart } from "../components/TrustedDataChart";
import { PhysicalAgentChat } from "../components/PhysicalAgentChat";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

interface Profile {
  id: number; sensor_id: number; name: string; is_default: boolean; baseline: number | null; bias: number; noise_std: number;
  drift_per_min: number; spike_probability: number; spike_magnitude: number; stuck_probability: number; stuck_duration_s: number;
  dropout_probability: number; dropout_duration_s: number; notes: string;
}
interface Sensor {
  id: number; key: string; name: string; category: string; sensor_family?: string;
  manufacturer?: string; model_number?: string; tags?: string[]; unit: string; channel: string | null; description: string;
  min_valid: number; max_valid: number; accuracy: number; max_rate_per_min: number; resolution: number; status: string;
  version: number; technical_specs?: Record<string, any>; custom_fields: Record<string, unknown>; updated_at: string; updated_by: string; profiles: Profile[];
}
interface CustomField {
  id: number; key: string; label: string; data_type: string; options: string[]; required: boolean; category: string | null; unit: string; description: string;
}
interface Channel { key: string; name: string; unit: string; category: string; description: string }
interface Version { id: number; version: number; snapshot: Record<string, unknown>; change_note: string; changed_by: string; changed_at: string }

const CATEGORY_OPTIONS = ["physiological", "spacesuit", "environmental"].map((c) => ({ value: c, label: c }));
const FAULT_OPTIONS = ["spike", "drift", "stuck", "disconnect", "noise_burst", "bias"].map((c) => ({ value: c, label: c.replace("_", " ") }));
const NEXT_STATUS: Record<string, { to: string; label: string }[]> = {
  draft: [{ to: "active", label: "Activate" }, { to: "archived", label: "Archive" }],
  active: [{ to: "archived", label: "Archive" }],
  archived: [{ to: "draft", label: "Back to draft" }],
};

const PROFILE_FIELDS: FieldDef[] = [
  { key: "name", label: "Profile name", required: true },
  { key: "is_default", label: "Default profile", type: "checkbox", help: "used by new simulation sessions" },
  { key: "baseline", label: "Baseline", type: "number", nullable: true, help: "True value for sensors with no physics channel" },
  { key: "bias", label: "Bias (offset)", type: "number" },
  { key: "noise_std", label: "Noise σ", type: "number" },
  { key: "drift_per_min", label: "Drift per minute", type: "number" },
  { key: "spike_probability", label: "Spike probability / s", type: "number", help: "0–1" },
  { key: "spike_magnitude", label: "Spike magnitude", type: "number" },
  { key: "stuck_probability", label: "Stuck probability / s", type: "number", help: "0–1" },
  { key: "stuck_duration_s", label: "Stuck duration (s)", type: "number" },
  { key: "dropout_probability", label: "Disconnect probability / s", type: "number", help: "0–1" },
  { key: "dropout_duration_s", label: "Disconnect duration (s)", type: "number" },
  { key: "notes", label: "Notes", type: "textarea" },
];
const EMPTY_PROFILE = { name: "", is_default: false, baseline: null, bias: 0, noise_std: 0, drift_per_min: 0, spike_probability: 0,
  spike_magnitude: 0, stuck_probability: 0, stuck_duration_s: 10, dropout_probability: 0, dropout_duration_s: 5, notes: "" };

function ProfilesModal({ sensor, canWrite, onClose, onChanged }: { sensor: Sensor; canWrite: boolean; onClose: () => void; onChanged: () => Promise<unknown> }) {
  const [editing, setEditing] = useState<{ id: number | null; form: Record<string, any> } | null>(null);
  const act = useAction();
  const save = () => act.run(async () => {
    if (!editing) return;
    const missing = missingRequired(PROFILE_FIELDS, editing.form);
    if (missing) throw new Error(missing);
    const body: Record<string, unknown> = {};
    for (const f of PROFILE_FIELDS) body[f.key] = editing.form[f.key];
    if (editing.id === null) await api(`/sensors/${sensor.id}/profiles`, { body });
    else await api(`/profiles/${editing.id}`, { method: "PUT", body });
    setEditing(null);
    await onChanged();
  });
  const remove = (p: Profile) => act.run(async () => { await api(`/profiles/${p.id}`, { method: "DELETE" }); await onChanged(); });
  return (
    <Modal wide title={`Simulation profiles — ${sensor.name}`} onClose={onClose}>
      <ErrorBanner error={act.error} />
      <p className="muted small">
        A profile defines how the simulated sensor misbehaves: noise, drift, spikes, stuck values and disconnections.
        The default profile is frozen into each new session. Faults can also be injected per test from the scenario prompt.
      </p>
      {!editing && (
        <>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Profile</th><th>Baseline</th><th>Noise σ</th><th>Drift/min</th><th>Spikes</th><th>Stuck</th><th>Disconnects</th><th /></tr></thead>
              <tbody>
                {sensor.profiles.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name} {p.is_default && <Chip kind="ok">default</Chip>}<div className="muted small">{p.notes}</div></td>
                    <td className="num">{p.baseline ?? "—"}</td><td className="num">{p.noise_std}</td><td className="num">{p.drift_per_min}</td>
                    <td className="num">{p.spike_probability ? `${p.spike_probability}/s × ${p.spike_magnitude}` : "—"}</td>
                    <td className="num">{p.stuck_probability ? `${p.stuck_probability}/s · ${p.stuck_duration_s}s` : "—"}</td>
                    <td className="num">{p.dropout_probability ? `${p.dropout_probability}/s · ${p.dropout_duration_s}s` : "—"}</td>
                    <td className="actions">
                      {canWrite && <>
                        <button className="btn sm" onClick={() => setEditing({ id: p.id, form: { ...p } })}>Edit</button>
                        <button className="btn sm danger" disabled={p.is_default || act.busy} title={p.is_default ? "Make another profile the default first" : ""} onClick={() => remove(p)}>Delete</button>
                      </>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canWrite && <button className="btn primary sm" style={{ marginTop: 10 }} onClick={() => setEditing({ id: null, form: { ...EMPTY_PROFILE } })}>+ New profile</button>}
        </>
      )}
      {editing && (
        <>
          <div className="form-grid">
            <FormFields fields={PROFILE_FIELDS} form={editing.form} set={(k, v) => setEditing((e) => e && { ...e, form: { ...e.form, [k]: v } })} />
          </div>
          <div className="row" style={{ marginTop: 12, justifyContent: "flex-end" }}>
            <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn primary" disabled={act.busy} onClick={save}>Save profile</button>
          </div>
        </>
      )}
    </Modal>
  );
}

function VersionsModal({ sensor, onClose }: { sensor: Sensor; onClose: () => void }) {
  const versions = useLoad(() => api<Version[]>(`/sensors/${sensor.id}/versions`), [sensor.id]);
  return (
    <Modal wide title={`Version history — ${sensor.name}`} onClose={onClose}>
      <ErrorBanner error={versions.error} />
      {versions.data?.map((v) => (
        <details key={v.id} className="card" style={{ marginBottom: 8 }}>
          <summary style={{ cursor: "pointer" }}>
            <b>v{v.version}</b> · {v.change_note || "—"} <span className="muted small">· {v.changed_by} · {fmtDate(v.changed_at)}</span>
            <Chip kind={String(v.snapshot.status)}>{String(v.snapshot.status)}</Chip>
          </summary>
          <pre className="json" style={{ marginTop: 8 }}>{JSON.stringify(v.snapshot, null, 2)}</pre>
        </details>
      ))}
    </Modal>
  );
}

function SensorsTab({ canWrite }: { canWrite: boolean }) {
  const sensors = useLoad(() => api<Sensor[]>("/sensors"));
  const channels = useLoad(() => api<Channel[]>("/channels"));
  const customDefs = useLoad(() => api<CustomField[]>("/custom-fields"));
  const [editing, setEditing] = useState<{ id: number | null; form: Record<string, any> } | null>(null);
  const [profilesFor, setProfilesFor] = useState<number | null>(null);
  const [versionsFor, setVersionsFor] = useState<Sensor | null>(null);
  const [deleting, setDeleting] = useState<Sensor | null>(null);
  const [filter, setFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [search, setSearch] = useState("");
  const [activeFormTab, setActiveFormTab] = useState<"general" | "specs" | "custom">("general");
  const save = useAction();
  const act = useAction();

  const fields: FieldDef[] = [
    { key: "key", label: "Key", required: true, lockOnEdit: true, help: "lowercase_with_underscores; immutable (rules and plans refer to it)" },
    { key: "name", label: "Name", required: true },
    { key: "category", label: "Category", type: "select", required: true, options: CATEGORY_OPTIONS },
    { key: "sensor_family", label: "Sensor family", help: "e.g. rtd_temperature, piezoresistive_pressure, dosimeter, oximeter" },
    { key: "manufacturer", label: "Manufacturer", placeholder: "e.g. Amphenol, Honeywell, NASA JPL" },
    { key: "model_number", label: "Model number", placeholder: "e.g. PT100-M34" },
    { key: "tags", label: "Tags", type: "tags", placeholder: "eva, helmet, temperature, nasa_std_3001" },
    { key: "unit", label: "Unit" },
    { key: "channel", label: "Ground-truth channel", type: "select", help: "What the sensor observes. Empty = constant baseline from its profile.",
      options: (channels.data ?? []).map((c) => ({ value: c.key, label: `${c.name} (${c.unit})` })) },
    { key: "min_valid", label: "Valid range min", type: "number", required: true },
    { key: "max_valid", label: "Valid range max", type: "number", required: true },
    { key: "accuracy", label: "Datasheet accuracy (1σ)", type: "number", help: "Used by data-quality checks" },
    { key: "max_rate_per_min", label: "Max plausible change / min", type: "number", help: "Faster trends are flagged as drift" },
    { key: "resolution", label: "Resolution (step)", type: "number" },
    { key: "description", label: "Description", type: "textarea" },
    { key: "change_note", label: "Change note", span: true, placeholder: "Why is this version being created?" },
  ];
  const empty = {
    key: "", name: "", category: "physiological", sensor_family: "generic", manufacturer: "", model_number: "",
    tags: [], unit: "", channel: null, min_valid: 0, max_valid: 100, accuracy: 0,
    max_rate_per_min: 0, resolution: 0, description: "", change_note: "", technical_specs: {}, custom_fields: {},
  };

  const set = (k: string, v: unknown) => setEditing((e) => e && { ...e, form: { ...e.form, [k]: v } });
  const setCustom = (k: string, v: unknown) =>
    setEditing((e) => e && { ...e, form: { ...e.form, custom_fields: { ...e.form.custom_fields, [k]: v } } });

  const setNestedSpec = (section: string, k: string, v: unknown) => {
    setEditing((e) => {
      if (!e) return null;
      const specs = { ...(e.form.technical_specs || {}) };
      specs[section] = { ...(specs[section] || {}), [k]: v === "" ? null : v };
      return { ...e, form: { ...e.form, technical_specs: specs } };
    });
  };

  const submit = () => save.run(async () => {
    if (!editing) return;
    const missing = missingRequired(fields, editing.form);
    if (missing) throw new Error(missing);
    const body: Record<string, unknown> = {
      custom_fields: editing.form.custom_fields ?? {},
      technical_specs: editing.form.technical_specs ?? {},
      tags: editing.form.tags ?? [],
      sensor_family: editing.form.sensor_family || "generic",
      manufacturer: editing.form.manufacturer || "",
      model_number: editing.form.model_number || "",
    };
    for (const f of fields) body[f.key] = editing.form[f.key];
    if (editing.id === null) await api("/sensors", { body });
    else await api(`/sensors/${editing.id}`, { method: "PUT", body });
    setEditing(null);
    await sensors.reload();
  });
  const transition = (s: Sensor, to: string) => act.run(async () => {
    await api(`/sensors/${s.id}/status`, { body: { status: to } });
    await sensors.reload();
  });
  const duplicate = (s: Sensor) => act.run(async () => {
    await api(`/sensors/${s.id}/duplicate`, { body: {} });
    await sensors.reload();
  });

  const rows = (sensors.data ?? []).filter((s) => {
    if (filter && s.status !== filter) return false;
    if (categoryFilter && s.category !== categoryFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const inName = (s.name || "").toLowerCase().includes(q);
      const inKey = (s.key || "").toLowerCase().includes(q);
      const inDesc = (s.description || "").toLowerCase().includes(q);
      const inMfr = (s.manufacturer || "").toLowerCase().includes(q);
      const inMod = (s.model_number || "").toLowerCase().includes(q);
      const inFam = (s.sensor_family || "").toLowerCase().includes(q);
      const inTags = (s.tags || []).some((t) => t.toLowerCase().includes(q));
      if (!inName && !inKey && !inDesc && !inMfr && !inMod && !inFam && !inTags) return false;
    }
    return true;
  });

  const applicable = (customDefs.data ?? []).filter((d) => !d.category || d.category === editing?.form.category);
  const profilesSensor = sensors.data?.find((s) => s.id === profilesFor) ?? null;

  return (
    <section className="panel">
      <div className="panel-head" style={{ flexWrap: "wrap", gap: 8 }}>
        <h3>Sensor registry</h3>
        <input
          type="search"
          placeholder="Search sensors, models, tags..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: "220px", padding: "4px 8px" }}
          aria-label="Search sensors"
        />
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} style={{ width: "auto", padding: "3px 6px" }} aria-label="Filter by category">
          <option value="">all categories</option>
          {CATEGORY_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: "auto", padding: "3px 6px" }} aria-label="Filter by status">
          <option value="">all statuses</option><option value="draft">draft</option><option value="active">active</option><option value="archived">archived</option>
        </select>
        {canWrite
          ? <button className="btn primary sm right" onClick={() => { save.clear(); setActiveFormTab("general"); setEditing({ id: null, form: { ...empty } }); }}>+ New sensor</button>
          : <span className="chip right">read-only</span>}
      </div>
      <div className="panel-body">
        <p className="muted small">
          Lifecycle: Draft → Active → Archived. Only <b>active</b> sensors are simulated. Every edit and status change creates a new version.
        </p>
        <ErrorBanner error={sensors.error ?? act.error} />
        <div className="table-wrap">
          <table>
            <thead><tr><th>Sensor</th><th>Category & Family</th><th>Observes</th><th>Valid range</th><th>Accuracy</th><th>Status</th><th>Default profile</th><th /></tr></thead>
            <tbody>
              {rows.map((s) => {
                const def = s.profiles.find((p) => p.is_default);
                return (
                  <tr key={s.id}>
                    <td>
                      <b>{s.name}</b>
                      <div className="muted small mono">{s.key} · v{s.version}</div>
                      {(s.manufacturer || s.model_number) && (
                        <div className="muted small" style={{ fontStyle: "italic" }}>
                          {s.manufacturer} {s.model_number ? `(${s.model_number})` : ""}
                        </div>
                      )}
                      {s.tags && s.tags.length > 0 && (
                        <div style={{ marginTop: 2, display: "flex", gap: 3, flexWrap: "wrap" }}>
                          {s.tags.slice(0, 3).map((t) => (
                            <span key={t} className="chip" style={{ fontSize: "0.68rem", padding: "0px 4px" }}>{t}</span>
                          ))}
                          {s.tags.length > 3 && <span className="muted small">+{s.tags.length - 3}</span>}
                        </div>
                      )}
                    </td>
                    <td>
                      <div>{s.category}</div>
                      {s.sensor_family && s.sensor_family !== "generic" && (
                        <div className="muted small mono">{s.sensor_family}</div>
                      )}
                    </td>
                    <td className="small">{s.channel ?? <span className="muted">constant baseline</span>}</td>
                    <td className="num">{s.min_valid} … {s.max_valid} {s.unit}</td>
                    <td className="num">±{s.accuracy}</td>
                    <td><Chip kind={s.status}>{s.status}</Chip></td>
                    <td className="small">{def ? `${def.name} (σ ${def.noise_std})` : <span className="muted">none</span>}</td>
                    <td className="actions">
                      <button className="btn sm" onClick={() => setProfilesFor(s.id)}>Profiles ({s.profiles.length})</button>
                      <button className="btn sm" onClick={() => setVersionsFor(s)}>History</button>
                      {canWrite && <>
                        <button className="btn sm" disabled={act.busy} onClick={() => duplicate(s)} title="Duplicate sensor as new draft">Duplicate</button>
                        <button className="btn sm" disabled={s.status === "archived"} onClick={() => { save.clear(); setActiveFormTab("general"); setEditing({ id: s.id, form: { ...s, change_note: "" } }); }}>Edit</button>
                        {NEXT_STATUS[s.status].map((n) => (
                          <button key={n.to} className="btn sm" disabled={act.busy} onClick={() => transition(s, n.to)}>{n.label}</button>
                        ))}
                        {s.status === "draft" && <button className="btn sm danger" onClick={() => setDeleting(s)}>Delete</button>}
                      </>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {sensors.data && rows.length === 0 && <div className="empty">No sensors match.</div>}
      </div>

      {editing && (
        <Modal wide title={editing.id === null ? "New sensor (draft)" : `Edit sensor — ${editing.form.name || editing.form.key}`} onClose={() => setEditing(null)}
          footer={<><button className="btn" onClick={() => setEditing(null)}>Cancel</button><button className="btn primary" disabled={save.busy} onClick={submit}>Save sensor</button></>}>
          <ErrorBanner error={save.error} />
          
          <Tabs value={activeFormTab} onChange={setActiveFormTab} tabs={[
            { id: "general", label: "General & Channels" },
            { id: "specs", label: "Technical Specifications" },
            { id: "custom", label: `Custom Fields (${applicable.length})` },
          ]} />

          {activeFormTab === "general" && (
            <div className="form-grid" style={{ marginTop: 12 }}>
              <FormFields fields={fields} form={editing.form} set={set} editing={editing.id !== null} />
            </div>
          )}

          {activeFormTab === "specs" && (
            <div style={{ marginTop: 12 }}>
              <div className="panel" style={{ marginBottom: 12, padding: 12 }}>
                <h4 style={{ margin: "0 0 8px" }}>Electrical Specifications</h4>
                <div className="form-grid">
                  <Field label="Supply Voltage (V)">
                    <input type="number" step="any" value={editing.form.technical_specs?.electrical?.voltage_v ?? ""} onChange={(e) => setNestedSpec("electrical", "voltage_v", e.target.value === "" ? null : Number(e.target.value))} />
                  </Field>
                  <Field label="Current Consumption (mA)">
                    <input type="number" step="any" value={editing.form.technical_specs?.electrical?.current_ma ?? ""} onChange={(e) => setNestedSpec("electrical", "current_ma", e.target.value === "" ? null : Number(e.target.value))} />
                  </Field>
                  <Field label="Power (mW)">
                    <input type="number" step="any" value={editing.form.technical_specs?.electrical?.power_mw ?? ""} onChange={(e) => setNestedSpec("electrical", "power_mw", e.target.value === "" ? null : Number(e.target.value))} />
                  </Field>
                </div>
              </div>

              <div className="panel" style={{ marginBottom: 12, padding: 12 }}>
                <h4 style={{ margin: "0 0 8px" }}>Physical Dimensions & Material</h4>
                <div className="form-grid">
                  <Field label="Length (mm)">
                    <input type="number" step="any" value={editing.form.technical_specs?.physical?.length_mm ?? ""} onChange={(e) => setNestedSpec("physical", "length_mm", e.target.value === "" ? null : Number(e.target.value))} />
                  </Field>
                  <Field label="Width (mm)">
                    <input type="number" step="any" value={editing.form.technical_specs?.physical?.width_mm ?? ""} onChange={(e) => setNestedSpec("physical", "width_mm", e.target.value === "" ? null : Number(e.target.value))} />
                  </Field>
                  <Field label="Height (mm)">
                    <input type="number" step="any" value={editing.form.technical_specs?.physical?.height_mm ?? ""} onChange={(e) => setNestedSpec("physical", "height_mm", e.target.value === "" ? null : Number(e.target.value))} />
                  </Field>
                  <Field label="Weight (g)">
                    <input type="number" step="any" value={editing.form.technical_specs?.physical?.weight_g ?? ""} onChange={(e) => setNestedSpec("physical", "weight_g", e.target.value === "" ? null : Number(e.target.value))} />
                  </Field>
                  <Field label="Housing Material" span>
                    <input value={editing.form.technical_specs?.physical?.housing_material ?? ""} placeholder="e.g. Anodized Aluminum 6061-T6, PEEK" onChange={(e) => setNestedSpec("physical", "housing_material", e.target.value)} />
                  </Field>
                </div>
              </div>

              <div className="panel" style={{ marginBottom: 12, padding: 12 }}>
                <h4 style={{ margin: "0 0 8px" }}>Operating Envelope</h4>
                <div className="form-grid">
                  <Field label="Min Operating Temp (°C)">
                    <input type="number" step="any" value={editing.form.technical_specs?.operating_envelope?.temp_min_c ?? ""} onChange={(e) => setNestedSpec("operating_envelope", "temp_min_c", e.target.value === "" ? null : Number(e.target.value))} />
                  </Field>
                  <Field label="Max Operating Temp (°C)">
                    <input type="number" step="any" value={editing.form.technical_specs?.operating_envelope?.temp_max_c ?? ""} onChange={(e) => setNestedSpec("operating_envelope", "temp_max_c", e.target.value === "" ? null : Number(e.target.value))} />
                  </Field>
                  <Field label="Min Operating Pressure (kPa)">
                    <input type="number" step="any" value={editing.form.technical_specs?.operating_envelope?.pressure_min_kpa ?? ""} onChange={(e) => setNestedSpec("operating_envelope", "pressure_min_kpa", e.target.value === "" ? null : Number(e.target.value))} />
                  </Field>
                  <Field label="Max Operating Pressure (kPa)">
                    <input type="number" step="any" value={editing.form.technical_specs?.operating_envelope?.pressure_max_kpa ?? ""} onChange={(e) => setNestedSpec("operating_envelope", "pressure_max_kpa", e.target.value === "" ? null : Number(e.target.value))} />
                  </Field>
                </div>
              </div>

              <div className="panel" style={{ padding: 12 }}>
                <h4 style={{ margin: "0 0 8px" }}>Metrology & Calibration</h4>
                <div className="form-grid">
                  <Field label="Measurement Type">
                    <input value={editing.form.technical_specs?.metrology?.measurement_type ?? ""} placeholder="e.g. Callendar-Van Dusen RTD" onChange={(e) => setNestedSpec("metrology", "measurement_type", e.target.value)} />
                  </Field>
                  <Field label="Precision">
                    <input type="number" step="any" value={editing.form.technical_specs?.metrology?.precision ?? ""} onChange={(e) => setNestedSpec("metrology", "precision", e.target.value === "" ? null : Number(e.target.value))} />
                  </Field>
                  <Field label="Response Time (s)">
                    <input type="number" step="any" value={editing.form.technical_specs?.metrology?.response_time_s ?? ""} onChange={(e) => setNestedSpec("metrology", "response_time_s", e.target.value === "" ? null : Number(e.target.value))} />
                  </Field>
                  <Field label="Sampling Frequency (Hz)">
                    <input type="number" step="any" value={editing.form.technical_specs?.metrology?.sampling_frequency_hz ?? ""} onChange={(e) => setNestedSpec("metrology", "sampling_frequency_hz", e.target.value === "" ? null : Number(e.target.value))} />
                  </Field>
                  <Field label="Calibration Interval (days)">
                    <input type="number" step="1" value={editing.form.technical_specs?.metrology?.calibration_interval_days ?? ""} onChange={(e) => setNestedSpec("metrology", "calibration_interval_days", e.target.value === "" ? null : Number(e.target.value))} />
                  </Field>
                </div>
              </div>
            </div>
          )}

          {activeFormTab === "custom" && (
            <div style={{ marginTop: 12 }}>
              {applicable.length === 0 && <div className="muted small">No custom fields are defined for this category.</div>}
              <div className="form-grid">
                {applicable.map((d) => {
                  const value = editing.form.custom_fields?.[d.key];
                  const label = `${d.label}${d.required ? " *" : ""}${d.unit ? ` (${d.unit})` : ""}`;
                  if (d.data_type === "boolean") {
                    return <label key={d.key} className="check"><input type="checkbox" checked={!!value} onChange={(e) => setCustom(d.key, e.target.checked)} />{label}</label>;
                  }
                  return (
                    <Field key={d.key} label={label} help={d.description}>
                      {d.data_type === "enum" ? (
                        <select value={(value as string) ?? ""} onChange={(e) => setCustom(d.key, e.target.value || null)}>
                          <option value="">—</option>{d.options.map((o) => <option key={o}>{o}</option>)}
                        </select>
                      ) : d.data_type === "number" ? (
                        <input type="number" step="any" value={(value as number) ?? ""} onChange={(e) => setCustom(d.key, e.target.value === "" ? null : Number(e.target.value))} />
                      ) : (
                        <input value={(value as string) ?? ""} onChange={(e) => setCustom(d.key, e.target.value)} />
                      )}
                    </Field>
                  );
                })}
              </div>
            </div>
          )}
        </Modal>
      )}
      {profilesSensor && <ProfilesModal sensor={profilesSensor} canWrite={canWrite} onClose={() => setProfilesFor(null)} onChanged={sensors.reload} />}
      {versionsFor && <VersionsModal sensor={versionsFor} onClose={() => setVersionsFor(null)} />}
      {deleting && (
        <Confirm danger title="Delete draft sensor" confirmLabel="Delete" message={<>Delete draft <b>{deleting.name}</b>?</>}
          onClose={() => setDeleting(null)}
          onConfirm={async () => { await api(`/sensors/${deleting.id}`, { method: "DELETE" }); await sensors.reload(); }} />
      )}
    </section>
  );
}

function WorkbenchTab({ canWrite }: { canWrite: boolean }) {
  const sensors = useLoad(() => api<Sensor[]>("/sensors"));
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [subTab, setSubTab] = useState<"3d" | "io" | "physics" | "errors">("3d");

  const sensor = sensors.data?.find((s) => s.id === (selectedId ?? sensors.data?.[0]?.id)) ?? null;
  const labData = useLoad(
    () => (sensor ? api<any>(`/physical-lab/sensors/${sensor.id}/details`) : Promise.resolve(null)),
    [sensor?.id]
  );
  const [form, setForm] = useState<any>(null);
  const save = useAction();

  // Initialize form when labData loads
  if (labData.data && (!form || form.sensor_id !== labData.data.id)) {
    setForm({
      sensor_id: labData.data.id,
      placement_data: { ...labData.data.placement_data },
      io_contract: {
        inputs: [...(labData.data.io_contract?.inputs || [])],
        outputs: [...(labData.data.io_contract?.outputs || [])],
      },
      physics_config: { ...labData.data.physics_config },
      error_configs: [...(labData.data.error_configs || [])],
    });
  }

  const setPlacement = (k: string, v: any) => {
    setForm((f: any) => f && { ...f, placement_data: { ...f.placement_data, [k]: v } });
  };

  const setPhysicsParam = (k: string, v: any) => {
    setForm((f: any) => f && {
      ...f,
      physics_config: {
        ...f.physics_config,
        parameters: { ...(f.physics_config.parameters || {}), [k]: v },
      },
    });
  };

  const toggleError = (errType: string) => {
    setForm((f: any) => {
      if (!f) return null;
      const existing = f.error_configs.find((e: any) => e.error_type === errType);
      let updated;
      if (existing) {
        updated = f.error_configs.map((e: any) =>
          e.error_type === errType ? { ...e, enabled: !e.enabled } : e
        );
      } else {
        updated = [...f.error_configs, { error_type: errType, enabled: true, parameters: {} }];
      }
      return { ...f, error_configs: updated };
    });
  };

  const isErrorEnabled = (errType: string) => {
    return form?.error_configs?.some((e: any) => e.error_type === errType && e.enabled) ?? false;
  };

  const setErrorParam = (errType: string, k: string, v: any) => {
    setForm((f: any) => {
      if (!f) return null;
      const updated = f.error_configs.map((e: any) => {
        if (e.error_type !== errType) return e;
        return { ...e, parameters: { ...(e.parameters || {}), [k]: v } };
      });
      return { ...f, error_configs: updated };
    });
  };

  const submit = () => save.run(async () => {
    if (!sensor || !form) return;
    await api(`/physical-lab/sensors/${sensor.id}/details`, {
      method: "PUT",
      body: {
        placement_data: form.placement_data,
        io_contract: form.io_contract,
        physics_config: form.physics_config,
        error_configs: form.error_configs,
      },
    });
    await labData.reload();
  });

  const p = form?.placement_data || {};

  return (
    <section className="panel">
      <div className="panel-head" style={{ flexWrap: "wrap", gap: 10 }}>
        <h3>Engineering Laboratory Workbench</h3>
        <select
          value={sensor?.id ?? ""}
          onChange={(e) => setSelectedId(Number(e.target.value))}
          style={{ width: "auto", minWidth: 220 }}
          aria-label="Select sensor"
        >
          {sensors.data?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.key})
            </option>
          ))}
        </select>
        {canWrite && (
          <button className="btn primary sm right" disabled={save.busy || !form} onClick={submit}>
            {save.busy ? "Saving..." : "Save Lab Configuration"}
          </button>
        )}
      </div>

      <div className="panel-body">
        <ErrorBanner error={sensors.error || labData.error || save.error} />
        {!sensor && <div className="empty">No sensors available.</div>}

        {sensor && form && (
          <>
            <div style={{ marginBottom: 12 }}>
              <Tabs
                value={subTab}
                onChange={setSubTab}
                tabs={[
                  { id: "3d", label: "3D Physical Placement" },
                  { id: "io", label: `I/O Contracts (${form.io_contract.inputs.length} in / ${form.io_contract.outputs.length} out)` },
                  { id: "physics", label: "Physics Transducer Model" },
                  { id: "errors", label: `Error Simulation (${form.error_configs.filter((e: any) => e.enabled).length} active)` },
                ]}
              />
            </div>

            {subTab === "3d" && (
              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16 }}>
                <div>
                  <SensorPlacementCanvas
                    parentBody={p.parent_body || "astronaut_torso"}
                    shape={p.primitive_shape || "cylinder"}
                    colorHex={p.color_hex || "#3a86ff"}
                    posX={Number(p.pos_x || 0)}
                    posY={Number(p.pos_y || 0)}
                    posZ={Number(p.pos_z || 0)}
                    rotX={Number(p.rot_x || 0)}
                    rotY={Number(p.rot_y || 0)}
                    rotZ={Number(p.rot_z || 0)}
                    scale={Number(p.scale || 1.0)}
                  />
                </div>
                <div className="form-grid">
                  <Field label="Mount Parent Body" span>
                    <select value={p.parent_body || "astronaut_torso"} disabled={!canWrite} onChange={(e) => setPlacement("parent_body", e.target.value)}>
                      <option value="astronaut_torso">Astronaut Torso (HUT)</option>
                      <option value="astronaut_head">Astronaut Helmet / Visor</option>
                      <option value="astronaut_backpack">Life Support Backpack (PLSS)</option>
                      <option value="astronaut_arm_left">Left Arm / Forearm</option>
                      <option value="astronaut_arm_right">Right Arm / Biosensor Cuff</option>
                      <option value="astronaut_leg_left">Left Thigh / Boot</option>
                      <option value="astronaut_leg_right">Right Thigh / Boot</option>
                      <option value="lander_exterior">Lander Exterior Mast</option>
                      <option value="weather_station">Surface Environmental Station</option>
                    </select>
                  </Field>
                  <Field label="3D Primitive Shape">
                    <select value={p.primitive_shape || "cylinder"} disabled={!canWrite} onChange={(e) => setPlacement("primitive_shape", e.target.value)}>
                      <option value="cylinder">Cylinder (Probe / Transducer)</option>
                      <option value="box">Box (Surface Pack)</option>
                      <option value="sphere">Sphere (Omnidirectional Detector)</option>
                      <option value="capsule">Capsule (Biomedical Pill/Lead)</option>
                      <option value="disc">Disc (Electrode / Optical Pad)</option>
                    </select>
                  </Field>
                  <Field label="Highlight Color">
                    <input type="color" value={p.color_hex || "#3a86ff"} disabled={!canWrite} onChange={(e) => setPlacement("color_hex", e.target.value)} />
                  </Field>
                  <Field label="Position Offset X (m)">
                    <input type="number" step="0.01" value={p.pos_x ?? 0} disabled={!canWrite} onChange={(e) => setPlacement("pos_x", Number(e.target.value))} />
                  </Field>
                  <Field label="Position Offset Y (m)">
                    <input type="number" step="0.01" value={p.pos_y ?? 0} disabled={!canWrite} onChange={(e) => setPlacement("pos_y", Number(e.target.value))} />
                  </Field>
                  <Field label="Position Offset Z (m)">
                    <input type="number" step="0.01" value={p.pos_z ?? 0} disabled={!canWrite} onChange={(e) => setPlacement("pos_z", Number(e.target.value))} />
                  </Field>
                  <Field label="Scale Multiplier">
                    <input type="number" step="0.1" min="0.1" max="5.0" value={p.scale ?? 1} disabled={!canWrite} onChange={(e) => setPlacement("scale", Number(e.target.value))} />
                  </Field>
                </div>
              </div>
            )}

            {subTab === "io" && (
              <div>
                <h4>Sensor Dynamic Input Ports</h4>
                <div className="table-wrap" style={{ marginBottom: 16 }}>
                  <table>
                    <thead><tr><th>Port Key</th><th>Name</th><th>Data Type</th><th>Unit</th><th>Source Channel</th><th>Expected Range</th><th /></tr></thead>
                    <tbody>
                      {form.io_contract.inputs.map((inp: any, idx: number) => (
                        <tr key={idx}>
                          <td className="mono small">{inp.port_key}</td>
                          <td>{inp.name}</td>
                          <td>{inp.data_type}</td>
                          <td>{inp.unit || "—"}</td>
                          <td className="mono small">{inp.source_channel || "—"}</td>
                          <td>{inp.expected_min ?? "—"} … {inp.expected_max ?? "—"}</td>
                          <td>
                            {canWrite && (
                              <button className="btn sm danger" onClick={() => {
                                const ins = form.io_contract.inputs.filter((_: any, i: number) => i !== idx);
                                setForm({ ...form, io_contract: { ...form.io_contract, inputs: ins } });
                              }}>Remove</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <h4>Sensor Dynamic Output Ports</h4>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Port Key</th><th>Name</th><th>Data Type</th><th>Unit</th><th>Precision</th><th>Nominal Accuracy</th><th /></tr></thead>
                    <tbody>
                      {form.io_contract.outputs.map((out: any, idx: number) => (
                        <tr key={idx}>
                          <td className="mono small">{out.port_key}</td>
                          <td>{out.name}</td>
                          <td>{out.data_type}</td>
                          <td>{out.unit || "—"}</td>
                          <td>{out.precision_digits} decimals</td>
                          <td>±{out.nominal_accuracy}</td>
                          <td>
                            {canWrite && (
                              <button className="btn sm danger" onClick={() => {
                                const outs = form.io_contract.outputs.filter((_: any, i: number) => i !== idx);
                                setForm({ ...form, io_contract: { ...form.io_contract, outputs: outs } });
                              }}>Remove</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {canWrite && (
                  <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
                    <button className="btn sm" onClick={() => {
                      const newIn = { port_key: `in_${Date.now().toString().slice(-4)}`, name: "Ambient Input", data_type: "float", unit: sensor.unit, source_channel: sensor.channel, required: true };
                      setForm({ ...form, io_contract: { ...form.io_contract, inputs: [...form.io_contract.inputs, newIn] } });
                    }}>+ Add Input Port</button>
                    <button className="btn sm" onClick={() => {
                      const newOut = { port_key: `out_${Date.now().toString().slice(-4)}`, name: "Calibrated Reading", data_type: "float", unit: sensor.unit, precision_digits: 2, nominal_accuracy: sensor.accuracy };
                      setForm({ ...form, io_contract: { ...form.io_contract, outputs: [...form.io_contract.outputs, newOut] } });
                    }}>+ Add Output Port</button>
                  </div>
                )}
              </div>
            )}

            {subTab === "physics" && (
              <div>
                <div className="form-grid" style={{ marginBottom: 16 }}>
                  <Field label="Active Physics Transducer Model" span>
                    <select
                      value={form.physics_config.model_key || "rtd_temperature"}
                      disabled={!canWrite}
                      onChange={(e) => setForm({ ...form, physics_config: { ...form.physics_config, model_key: e.target.value } })}
                    >
                      <option value="rtd_temperature">Callendar-Van Dusen RTD Platinum Thermometer (IEC 60751)</option>
                      <option value="piezoresistive_pressure">Piezoresistive Diaphragm Pressure Transducer (NASA SP-8088)</option>
                      <option value="silicon_dosimeter">Silicon PIN Diode Space Radiation Dosimeter (MSL/RAD)</option>
                    </select>
                  </Field>
                </div>

                {form.physics_config.model_key === "rtd_temperature" && (
                  <div className="form-grid">
                    <Field label="Nominal Resistance R0 (Ω)">
                      <input type="number" value={form.physics_config.parameters?.r0_ohms ?? 100.0} disabled={!canWrite} onChange={(e) => setPhysicsParam("r0_ohms", Number(e.target.value))} />
                    </Field>
                    <Field label="Thermal Time Constant τ (s)">
                      <input type="number" step="0.05" value={form.physics_config.parameters?.tau_seconds ?? 0.4} disabled={!canWrite} onChange={(e) => setPhysicsParam("tau_seconds", Number(e.target.value))} />
                    </Field>
                    <Field label="Bridge Supply Voltage (V)">
                      <input type="number" step="0.1" value={form.physics_config.parameters?.v_supply_v ?? 3.3} disabled={!canWrite} onChange={(e) => setPhysicsParam("v_supply_v", Number(e.target.value))} />
                    </Field>
                  </div>
                )}

                {form.physics_config.model_key === "piezoresistive_pressure" && (
                  <div className="form-grid">
                    <Field label="Bridge Sensitivity (mV/V/kPa)">
                      <input type="number" step="0.1" value={form.physics_config.parameters?.sensitivity_mv_v_kpa ?? 1.5} disabled={!canWrite} onChange={(e) => setPhysicsParam("sensitivity_mv_v_kpa", Number(e.target.value))} />
                    </Field>
                    <Field label="Supply Voltage (V)">
                      <input type="number" step="0.5" value={form.physics_config.parameters?.v_supply_v ?? 5.0} disabled={!canWrite} onChange={(e) => setPhysicsParam("v_supply_v", Number(e.target.value))} />
                    </Field>
                    <Field label="Temperature Coeff of Span (%/°C)">
                      <input type="number" step="0.01" value={form.physics_config.parameters?.tcs_pct_per_c ?? -0.15} disabled={!canWrite} onChange={(e) => setPhysicsParam("tcs_pct_per_c", Number(e.target.value))} />
                    </Field>
                  </div>
                )}

                {form.physics_config.model_key === "silicon_dosimeter" && (
                  <div className="form-grid">
                    <Field label="Ionization Sensitivity (pA / [μSv/h])">
                      <input type="number" step="0.05" value={form.physics_config.parameters?.sensitivity_pa_per_usv_h ?? 0.42} disabled={!canWrite} onChange={(e) => setPhysicsParam("sensitivity_pa_per_usv_h", Number(e.target.value))} />
                    </Field>
                    <Field label="Base Leakage Current (pA)">
                      <input type="number" step="0.1" value={form.physics_config.parameters?.leakage_current_base_pa ?? 2.5} disabled={!canWrite} onChange={(e) => setPhysicsParam("leakage_current_base_pa", Number(e.target.value))} />
                    </Field>
                  </div>
                )}
              </div>
            )}

            {subTab === "errors" && (
              <div>
                <p className="muted small">
                  Configure parameterized failure generators and noise models. All error streams draw from deterministic seeded PRNGs.
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div className="panel" style={{ padding: 12 }}>
                    <label className="check" style={{ fontWeight: "bold" }}>
                      <input type="checkbox" checked={isErrorEnabled("gaussian_noise")} disabled={!canWrite} onChange={() => toggleError("gaussian_noise")} />
                      Gaussian White Noise
                    </label>
                    <Field label="Noise σ" help="Standard deviation">
                      <input type="number" step="0.01" value={form.error_configs.find((e: any) => e.error_type === "gaussian_noise")?.parameters?.noise_std ?? sensor.accuracy} disabled={!canWrite || !isErrorEnabled("gaussian_noise")} onChange={(e) => setErrorParam("gaussian_noise", "noise_std", Number(e.target.value))} />
                    </Field>
                  </div>

                  <div className="panel" style={{ padding: 12 }}>
                    <label className="check" style={{ fontWeight: "bold" }}>
                      <input type="checkbox" checked={isErrorEnabled("linear_drift")} disabled={!canWrite} onChange={() => toggleError("linear_drift")} />
                      Metrological Linear Drift
                    </label>
                    <Field label="Drift rate per minute">
                      <input type="number" step="0.1" value={form.error_configs.find((e: any) => e.error_type === "linear_drift")?.parameters?.drift_per_min ?? 0.5} disabled={!canWrite || !isErrorEnabled("linear_drift")} onChange={(e) => setErrorParam("linear_drift", "drift_per_min", Number(e.target.value))} />
                    </Field>
                  </div>

                  <div className="panel" style={{ padding: 12 }}>
                    <label className="check" style={{ fontWeight: "bold" }}>
                      <input type="checkbox" checked={isErrorEnabled("bias_offset")} disabled={!canWrite} onChange={() => toggleError("bias_offset")} />
                      Systematic Calibration Offset (Bias)
                    </label>
                    <Field label="Offset bias magnitude">
                      <input type="number" step="0.1" value={form.error_configs.find((e: any) => e.error_type === "bias_offset")?.parameters?.bias ?? 1.5} disabled={!canWrite || !isErrorEnabled("bias_offset")} onChange={(e) => setErrorParam("bias_offset", "bias", Number(e.target.value))} />
                    </Field>
                  </div>

                  <div className="panel" style={{ padding: 12 }}>
                    <label className="check" style={{ fontWeight: "bold" }}>
                      <input type="checkbox" checked={isErrorEnabled("stuck_at")} disabled={!canWrite} onChange={() => toggleError("stuck_at")} />
                      Frozen / Stuck-at Value
                    </label>
                    <Field label="Stuck start time (s)">
                      <input type="number" step="1" value={form.error_configs.find((e: any) => e.error_type === "stuck_at")?.parameters?.t_start ?? 10.0} disabled={!canWrite || !isErrorEnabled("stuck_at")} onChange={(e) => setErrorParam("stuck_at", "t_start", Number(e.target.value))} />
                    </Field>
                  </div>

                  <div className="panel" style={{ padding: 12 }}>
                    <label className="check" style={{ fontWeight: "bold" }}>
                      <input type="checkbox" checked={isErrorEnabled("dropout")} disabled={!canWrite} onChange={() => toggleError("dropout")} />
                      Intermittent Signal Dropout
                    </label>
                    <Field label="Dropout duration (s)">
                      <input type="number" step="1" value={form.error_configs.find((e: any) => e.error_type === "dropout")?.parameters?.duration_s ?? 5.0} disabled={!canWrite || !isErrorEnabled("dropout")} onChange={(e) => setErrorParam("dropout", "duration_s", Number(e.target.value))} />
                    </Field>
                  </div>

                  <div className="panel" style={{ padding: 12 }}>
                    <label className="check" style={{ fontWeight: "bold" }}>
                      <input type="checkbox" checked={isErrorEnabled("spike")} disabled={!canWrite} onChange={() => toggleError("spike")} />
                      Transient Electrical / EMI Spike
                    </label>
                    <Field label="Spike magnitude">
                      <input type="number" step="1" value={form.error_configs.find((e: any) => e.error_type === "spike")?.parameters?.spike_magnitude ?? 8.0} disabled={!canWrite || !isErrorEnabled("spike")} onChange={(e) => setErrorParam("spike", "spike_magnitude", Number(e.target.value))} />
                    </Field>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function TrustedDataTab() {
  const sensors = useLoad(() => api<Sensor[]>("/sensors"));
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [duration, setDuration] = useState<number>(30);
  const [seed, setSeed] = useState<number>(42);
  const [benchmark, setBenchmark] = useState<any>(null);
  const runAct = useAction();

  const sensor = sensors.data?.find((s) => s.id === (selectedId ?? sensors.data?.[0]?.id)) ?? null;

  const runBenchmark = () => runAct.run(async () => {
    if (!sensor) return;
    const res = await api<any>(`/physical-lab/sensors/${sensor.id}/benchmark`, {
      body: { duration_s: duration, dt: 0.5, seed: seed },
    });
    setBenchmark(res);
  });

  return (
    <section className="panel">
      <div className="panel-head" style={{ flexWrap: "wrap", gap: 10 }}>
        <h3>Trusted Data Layer (TDL) & Benchmarks</h3>
        <select
          value={sensor?.id ?? ""}
          onChange={(e) => { setSelectedId(Number(e.target.value)); setBenchmark(null); }}
          style={{ width: "auto", minWidth: 220 }}
          aria-label="Select sensor"
        >
          {sensors.data?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.key})
            </option>
          ))}
        </select>
        <button className="btn primary sm right" disabled={runAct.busy || !sensor} onClick={runBenchmark}>
          {runAct.busy ? "Simulating..." : "▶ Run Benchmark Simulation"}
        </button>
      </div>

      <div className="panel-body">
        <ErrorBanner error={sensors.error || runAct.error} />
        <Banner kind="info">
          The <b>Trusted Data Layer (TDL)</b> computes instantaneous residuals between Ground Truth (Layer 1) and Simulated Telemetry (Layer 2) to derive an explainable Trust Score without leaking ground truth to operational dashboards.
        </Banner>

        <div style={{ display: "flex", gap: 16, alignItems: "center", margin: "12px 0 16px" }}>
          <label style={{ fontSize: "0.85rem", color: "#94a3b8" }}>
            Duration: <b>{duration}s</b>
            <input type="range" min="10" max="120" step="10" value={duration} onChange={(e) => setDuration(Number(e.target.value))} style={{ marginLeft: 8 }} />
          </label>
          <label style={{ fontSize: "0.85rem", color: "#94a3b8" }}>
            PRNG Seed:
            <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))} style={{ width: 80, marginLeft: 6, padding: "2px 6px" }} />
          </label>
        </div>

        {benchmark && (
          <>
            {/* KPI Metric Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 16 }}>
              <div className="card" style={{ padding: 10, textAlign: "center" }}>
                <div className="muted small">Mean Abs Error (MAE)</div>
                <div style={{ fontSize: "1.25rem", fontWeight: "bold", color: "#38bdf8" }}>{benchmark.metrics.mae} {sensor?.unit}</div>
              </div>
              <div className="card" style={{ padding: 10, textAlign: "center" }}>
                <div className="muted small">Root Mean Sq (RMSE)</div>
                <div style={{ fontSize: "1.25rem", fontWeight: "bold", color: "#818cf8" }}>{benchmark.metrics.rmse} {sensor?.unit}</div>
              </div>
              <div className="card" style={{ padding: 10, textAlign: "center" }}>
                <div className="muted small">Max Error</div>
                <div style={{ fontSize: "1.25rem", fontWeight: "bold", color: "#fb7185" }}>{benchmark.metrics.max_abs_error} {sensor?.unit}</div>
              </div>
              <div className="card" style={{ padding: 10, textAlign: "center" }}>
                <div className="muted small">Mean Trust Score</div>
                <div style={{ fontSize: "1.25rem", fontWeight: "bold", color: "#a78bfa" }}>{(benchmark.metrics.mean_trust_score * 100).toFixed(1)}%</div>
              </div>
              <div className="card" style={{ padding: 10, textAlign: "center" }}>
                <div className="muted small">Telemetry Availability</div>
                <div style={{ fontSize: "1.25rem", fontWeight: "bold", color: "#34d399" }}>{benchmark.metrics.availability_pct}%</div>
              </div>
            </div>

            {/* Canvas Chart */}
            <TrustedDataChart points={benchmark.points} sensorUnit={sensor?.unit || ""} />
          </>
        )}

        {!benchmark && !runAct.busy && (
          <div className="empty" style={{ padding: 30 }}>
            Click <b>Run Benchmark Simulation</b> above to evaluate physical transducer response and calculate TDL metrics.
          </div>
        )}
      </div>
    </section>
  );
}

function ImportExportTab({ canWrite }: { canWrite: boolean }) {
  const sensors = useLoad(() => api<Sensor[]>("/sensors"));
  const [importText, setImportText] = useState("");
  const [dryRun, setDryRun] = useState(true);
  const [importResult, setImportResult] = useState<any>(null);
  const act = useAction();

  const handleExportJSON = async () => {
    const res = await api<any>("/physical-lab/export?export_format=json");
    const blob = new Blob([JSON.stringify(res.sensors, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "astra_sensor_catalogue.json";
    a.click();
  };

  const handleExportCSV = async () => {
    const res = await api<any>("/physical-lab/export?export_format=csv");
    const blob = new Blob([res.data], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "astra_sensor_catalogue.csv";
    a.click();
  };

  const handleImport = () => act.run(async () => {
    setImportResult(null);
    let body: any = { dry_run: dryRun };
    const trimmed = importText.trim();
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      const parsed = JSON.parse(trimmed);
      body.sensors = Array.isArray(parsed) ? parsed : [parsed];
    } else {
      body.csv_data = trimmed;
    }
    const res = await api<any>("/physical-lab/import", { body });
    setImportResult(res);
    if (!dryRun) await sensors.reload();
  });

  return (
    <section className="panel">
      <div className="panel-head">
        <h3>Sensor Import & Export</h3>
      </div>
      <div className="panel-body">
        <ErrorBanner error={act.error} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 20 }}>
          <div className="panel" style={{ padding: 14 }}>
            <h4>Export Catalog</h4>
            <p className="muted small">
              Download the active sensor engineering catalog in JSON or CSV format.
            </p>
            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button className="btn" onClick={handleExportJSON}>📥 Export JSON</button>
              <button className="btn" onClick={handleExportCSV}>📥 Export CSV</button>
            </div>
          </div>

          <div className="panel" style={{ padding: 14 }}>
            <h4>Import Sensors</h4>
            <p className="muted small">
              Paste sensor definitions in JSON array or CSV format. Supports dry-run validation before committing.
            </p>
            <textarea
              rows={6}
              placeholder='[ { "key": "custom_pt100", "name": "Custom RTD", "category": "spacesuit", "min_valid": -50, "max_valid": 150, "accuracy": 0.05 } ]'
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              style={{ width: "100%", fontFamily: "monospace", fontSize: "0.8rem", marginBottom: 10 }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label className="check">
                <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
                Dry run only (validate without saving)
              </label>
              {canWrite && (
                <button className="btn primary" disabled={act.busy || !importText.trim()} onClick={handleImport}>
                  {act.busy ? "Validating..." : dryRun ? "Validate Input" : "Commit Import"}
                </button>
              )}
            </div>

            {importResult && (
              <div style={{ marginTop: 12, padding: 10, background: "#13231a", border: "1px solid #10b981", borderRadius: 6 }}>
                <b style={{ color: "#34d399" }}>
                  {importResult.dry_run ? "✅ Validation Passed (Dry Run)" : "✅ Successfully Imported"}
                </b>
                <div className="small muted">
                  Validated {importResult.count} sensor(s): <code>{importResult.keys.join(", ")}</code>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function PhysicalAgentTab() {
  const sensors = useLoad(() => api<Sensor[]>("/sensors"));
  const [selectedKey, setSelectedKey] = useState<string>("");

  return (
    <section className="panel">
      <div className="panel-head" style={{ flexWrap: "wrap", gap: 10 }}>
        <h3>Physical AI Engineering Agent</h3>
        <select
          value={selectedKey}
          onChange={(e) => setSelectedKey(e.target.value)}
          style={{ width: "auto", minWidth: 220 }}
          aria-label="Sensor context"
        >
          <option value="">(No specific sensor context)</option>
          {sensors.data?.map((s) => (
            <option key={s.id} value={s.key}>
              Context: {s.name} ({s.key})
            </option>
          ))}
        </select>
      </div>
      <div className="panel-body">
        <PhysicalAgentChat selectedSensorKey={selectedKey} onSensorCreated={sensors.reload} />
      </div>
    </section>
  );
}

function ChannelsTab() {
  const channels = useLoad(() => api<Channel[]>("/channels"));
  return (
    <section className="panel">
      <div className="panel-head"><h3>Ground-truth channels</h3><span className="muted small">what the simulation engine computes; sensors observe these</span></div>
      <div className="panel-body">
        <ErrorBanner error={channels.error} />
        <Banner kind="info">
          Three strictly separated layers: <b>simulation ground truth</b> (these channels) → <b>sensor output</b> (truth plus the
          sensor's noise and faults) → <b>analytical output</b> (data-quality checks, then medical rules on trusted readings only).
        </Banner>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Channel</th><th>Name</th><th>Unit</th><th>Category</th><th>Model</th></tr></thead>
            <tbody>{channels.data?.map((c) => (
              <tr key={c.key}><td className="mono small">{c.key}</td><td>{c.name}</td><td>{c.unit}</td><td>{c.category}</td><td className="muted small">{c.description}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export function PhysicalPage() {
  const { user } = useAuth();
  const canWrite = user?.role === "physical";
  const [tab, setTab] = useState<
    "sensors" | "workbench" | "tdl" | "agent" | "io" | "fields" | "faults" | "channels"
  >("sensors");

  return (
    <Layout>
      <div className="page-head">
        <h1>Physical Sensor Engineering & Simulation Laboratory</h1>
        <span className="muted">
          {canWrite
            ? "Create, calibrate, simulate, and inspect physical sensors with 3D placement, physics transducers, error models, and the Trusted Data Layer."
            : "Read-only engineering view. Only the Physical Team can edit sensors and simulation models."}
        </span>
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "sensors", label: "Sensor Registry" },
          { id: "workbench", label: "Lab Workbench (3D & Models)" },
          { id: "tdl", label: "Trusted Data (TDL)" },
          { id: "agent", label: "Physical AI Agent" },
          { id: "io", label: "Import / Export" },
          { id: "fields", label: "Custom fields" },
          { id: "faults", label: "Failure signatures" },
          { id: "channels", label: "Ground-truth channels" },
        ]}
      />
      {tab === "sensors" && <SensorsTab canWrite={canWrite} />}
      {tab === "workbench" && <WorkbenchTab canWrite={canWrite} />}
      {tab === "tdl" && <TrustedDataTab />}
      {tab === "agent" && <PhysicalAgentTab />}
      {tab === "io" && <ImportExportTab canWrite={canWrite} />}
      {tab === "fields" && (
        <CrudPage<any>
          title="Custom field definitions"
          noun="custom field"
          endpoint="/custom-fields"
          canWrite={canWrite}
          description="Extra, validated attributes that sensors can carry beyond the core relational columns."
          empty={{
            key: "",
            label: "",
            data_type: "string",
            options: [],
            required: false,
            category: null,
            unit: "",
            description: "",
          }}
          columns={[
            {
              label: "Key",
              render: (r) => <span className="mono small">{r.key}</span>,
            },
            { label: "Label", render: (r) => r.label },
            {
              label: "Type",
              render: (r) => (
                <>
                  {r.data_type}
                  {r.options.length ? (
                    <span className="muted small">
                      {" "}
                      · {r.options.join(" / ")}
                    </span>
                  ) : null}
                </>
              ),
            },
            {
              label: "Applies to",
              render: (r) => r.category ?? "all categories",
            },
            {
              label: "Required",
              render: (r) =>
                r.required ? (
                  <Chip kind="caution">required to activate</Chip>
                ) : (
                  "optional"
                ),
            },
          ]}
          fields={[
            {
              key: "key",
              label: "Key",
              required: true,
              help: "lowercase_with_underscores",
            },
            { key: "label", label: "Label", required: true },
            {
              key: "data_type",
              label: "Type",
              type: "select",
              required: true,
              options: ["string", "number", "boolean", "enum"].map((v) => ({
                value: v,
                label: v,
              })),
            },
            { key: "options", label: "Options (enum only)", type: "tags" },
            {
              key: "category",
              label: "Applies to category",
              type: "select",
              options: CATEGORY_OPTIONS,
              help: "Empty = all categories",
            },
            { key: "unit", label: "Unit" },
            {
              key: "required",
              label: "Required to activate a sensor",
              type: "checkbox",
            },
            { key: "description", label: "Description", type: "textarea" },
          ]}
        />
      )}
      {tab === "faults" && (
        <CrudPage<any>
          title="Failure signatures"
          noun="failure signature"
          endpoint="/failure-signatures"
          canWrite={canWrite}
          description="Named fault patterns. When a test prompt mentions one of the keywords next to a sensor, the planner injects this fault into that sensor."
          empty={{
            key: "",
            name: "",
            fault_type: "spike",
            description: "",
            default_magnitude: null,
            default_duration_s: 20,
            expected_flag: "",
            keywords: [],
          }}
          columns={[
            {
              label: "Signature",
              render: (r) => (
                <>
                  <b>{r.name}</b>
                  <div className="muted small mono">{r.key}</div>
                </>
              ),
            },
            {
              label: "Fault",
              render: (r) => <Chip kind="dq">{r.fault_type.replace("_", " ")}</Chip>,
            },
            {
              label: "Default",
              render: (r) => (
                <span className="num">
                  {r.default_duration_s}s
                  {r.default_magnitude !== null ? ` · ${r.default_magnitude}` : ""}
                </span>
              ),
            },
            {
              label: "Expected detection",
              render: (r) =>
                r.expected_flag ? (
                  <span className="mono small">{r.expected_flag}</span>
                ) : (
                  <span className="muted small">
                    not detectable by single-sensor checks
                  </span>
                ),
            },
            {
              label: "Prompt keywords",
              render: (r) => (
                <span className="small muted">{r.keywords.join(", ")}</span>
              ),
            },
          ]}
          fields={[
            { key: "key", label: "Key", required: true },
            { key: "name", label: "Name", required: true },
            {
              key: "fault_type",
              label: "Fault type",
              type: "select",
              required: true,
              options: FAULT_OPTIONS,
            },
            {
              key: "default_magnitude",
              label: "Default magnitude",
              type: "number",
              nullable: true,
              help: "Empty = derived from the sensor's range",
            },
            {
              key: "default_duration_s",
              label: "Default duration (s)",
              type: "number",
              required: true,
            },
            { key: "expected_flag", label: "Expected data-quality flag" },
            {
              key: "keywords",
              label: "Prompt keywords",
              type: "tags",
              span: true,
            },
            { key: "description", label: "Description", type: "textarea" },
          ]}
        />
      )}
      {tab === "channels" && <ChannelsTab />}
    </Layout>
  );
}
