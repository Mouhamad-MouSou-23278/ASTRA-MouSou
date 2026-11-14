// Shapes exchanged with the ASTRA backend (see backend/app/schemas.py and astra_sim/engine.py).

export type Role = "admin" | "physical" | "medical" | "operator" | "viewer";

export interface User {
  id: number;
  username: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
}

export type QualityStatus = "good" | "suspect" | "bad" | "missing";
/** [value | null, quality status, quality flags] */
export type SensorReading = [number | null, QualityStatus, string[]];

export interface SensorMeta {
  key: string;
  name: string;
  category: "physiological" | "spacesuit" | "environmental";
  unit: string;
  channel: string | null;
  min_valid: number;
  max_valid: number;
}

export interface Evidence {
  sensor_key: string;
  sensor_name: string;
  unit: string;
  aggregation: string;
  window_s: number;
  operator: string;
  threshold: number;
  value: number | null;
  result: boolean | null;
  reason: string;
}

export interface Warning {
  id: string;
  kind: "medical" | "data_quality";
  key: string;
  severity: "advisory" | "caution" | "warning" | "critical" | "info";
  message: string;
  raised_at: number;
  cleared_at: number | null;
  name?: string;
  condition_name?: string | null;
  recommendations?: string[];
  evidence?: Evidence[];
  sensor_key?: string;
  sensor_name?: string;
}

export interface RuleStatus {
  key: string;
  name: string;
  severity: string;
  state: "inactive" | "pending" | "active" | "inhibited" | "warming_up";
  inhibited_by: string[];
  clauses: Evidence[];
}

export interface SimEvent {
  id?: number | string;
  t: number;
  type: string;
  label?: string;
  message?: string;
  action?: string;
  step_id?: string;
  warning?: Warning;
  rule_name?: string;
  sensors?: string[];
  by?: string;
}

export interface AstronautState {
  x: number;
  y: number;
  heading: number;
  pose: string;
  pose_t: number;
  speed: number;
  egress: number;
  outside: boolean;
  hatch_open: number;
}

export interface ActiveCondition {
  step_id: string;
  action: string;
  label: string;
  intensity: number;
  since: number;
}

export interface Frame {
  seq: number;
  t: number;
  activity: { step_id: string; action: string; label: string; index: number; progress: number } | null;
  astronaut: AstronautState;
  truth: Record<string, number>;
  sensors: Record<string, SensorReading>;
  conditions: {
    external_heat_w: number;
    cooling_efficiency: number;
    radiation_multiplier: number;
    active: ActiveCondition[];
  };
  warnings: { medical: Warning[]; data_quality: Warning[] };
  rules: RuleStatus[];
  events: SimEvent[];
  done: boolean;
}

export interface SessionState {
  id: string;
  name: string;
  status: "planned" | "running" | "paused" | "completed" | "stopped" | "aborted";
  speed: number;
  run: number;
  sim_time: number;
  duration_s: number;
  end_reason: string;
}

export interface SessionSummary extends SessionState {
  prompt: string;
  plan: Plan;
  plan_source: string;
  planner_notes: string[];
  seed: number;
  created_by: string;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
}

export interface Segment {
  step_id: string;
  action: string;
  index: number;
  label: string;
  t_start: number;
  t_end: number;
  from: [number, number];
  to: [number, number];
  waypoint: string | null;
  distance_m: number;
}

export interface Overlay {
  step_id: string;
  action: string;
  label: string;
  t_start: number;
  t_end: number | null;
  ramp_s: number;
  params: Record<string, unknown>;
}

export interface TimelineData {
  duration_s: number;
  activity_end_s: number;
  distance_m: number;
  path: [number, number][];
  segments: Segment[];
  overlays: Overlay[];
}

export interface WorldData {
  lander: { x: number; y: number; hatch_heading: number };
  waypoints: { key: string; name: string; kind: string; x: number; y: number; route_order?: number | null }[];
}

export interface RuleInfo {
  key: string;
  name: string;
  severity: string;
  logic: string;
  clauses: { sensor_key: string; aggregation?: string; window_s?: number; operator: string; threshold: number }[];
  condition_name: string | null;
}

export interface SessionDetail {
  label: string;
  session: SessionSummary;
  timeline: TimelineData;
  world: WorldData;
  sensors: SensorMeta[];
  rules: RuleInfo[];
  astronaut: { callsign: string | null; full_name: string | null; is_synthetic: boolean };
  access: { kind: "user" | "viewer"; role: string; name: string; can_control: boolean };
  speeds: number[];
}

export interface Plan {
  version: number;
  title: string;
  seed: number;
  steps: Record<string, unknown>[];
}

export interface PlanPreview {
  valid: boolean;
  problems: string[];
  plan: Plan | null;
  source: string;
  notes: string[];
  timeline: TimelineData | null;
}

export interface History {
  t: number[];
  sensors: Record<string, { v: (number | null)[]; q: number[] }>;
  truth: Record<string, number[]>;
  trail: [number, number][];
}

export type StreamMessage =
  | { type: "hello" | "reset"; session: SessionState; history: History; events: SimEvent[]; frame: Frame | null }
  | { type: "frames"; run: number; frames: Frame[] }
  | { type: "state"; session: SessionState }
  | { type: "notice"; level: string; message: string }
  | { type: "ping" | "overflow" };

export interface SystemInfo {
  app: string;
  version: string;
  label: string;
  ai: { configured: string; active: string; llm_available: boolean; detail: string };
  speech: { mode: "browser" | "server"; provider: string; detail: string };
  terrain_available: boolean;
  speeds: number[];
  database: string;
}

export interface TerrainMeta {
  label: string;
  site: { name: string; lat_deg: number; lon_deg_east: number; elevation_m_mola: number };
  near: { file: string; n: number; size_m: number; min_m: number; max_m: number; texture: string };
  far: { file: string; n: number; size_m: number; min_m: number; max_m: number; texture: string };
}
