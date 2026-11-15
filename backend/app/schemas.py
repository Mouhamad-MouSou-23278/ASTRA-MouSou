"""Request/response schemas. Every write path is validated here before touching the DB."""
from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, PlainSerializer, model_validator

from astra_sim import AGGREGATIONS, CHANNELS, FAULT_TYPES

UTC = Annotated[datetime, PlainSerializer(lambda d: d.isoformat(timespec="seconds") + "Z")]

Role = Literal["admin", "physical", "medical", "operator", "viewer"]
Category = str
SensorStatus = Literal["draft", "active", "archived"]
Severity = Literal["advisory", "caution", "warning", "critical"]
FaultType = Literal["spike", "drift", "stuck", "disconnect", "noise_burst", "bias"]
Aggregation = Literal["last", "mean", "min", "max", "slope_per_min", "delta"]
assert set(FaultType.__args__) == set(FAULT_TYPES) and set(Aggregation.__args__) == set(AGGREGATIONS)

KEY = r"^[a-z][a-z0-9_]{1,58}$"
UPPER_KEY = r"^[A-Z][A-Z0-9_]{1,58}$"


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


# ------------------------------------------------------------------- platform
class LoginIn(Strict):
    username: str = Field(min_length=1, max_length=60)
    password: str = Field(min_length=1, max_length=200)


class UserOut(ORM):
    id: int
    username: str
    full_name: str
    role: str
    is_active: bool
    created_at: UTC
    last_login_at: Optional[UTC]


class LoginOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class UserCreate(Strict):
    username: str = Field(pattern=r"^[a-z0-9][a-z0-9_.\-]{2,39}$")
    full_name: str = Field("", max_length=120)
    role: Role
    password: str = Field(min_length=8, max_length=200)


class UserUpdate(Strict):
    full_name: Optional[str] = Field(None, max_length=120)
    role: Optional[Role] = None
    is_active: Optional[bool] = None


class PasswordIn(Strict):
    password: str = Field(min_length=8, max_length=200)


class ChangePasswordIn(Strict):
    current_password: str = Field(min_length=1, max_length=200)
    new_password: str = Field(min_length=8, max_length=200)


class ConfigOut(ORM):
    key: str
    value: Any
    description: str
    updated_by: str
    updated_at: UTC


class ConfigUpdate(Strict):
    value: Any


class AuditOut(ORM):
    id: int
    ts: UTC
    username: str
    role: str
    action: str
    entity_type: str
    entity_id: str
    detail: dict[str, Any]


class EmergencyStopIn(Strict):
    reason: str = Field(min_length=3, max_length=200)


class LockIn(Strict):
    locked: bool


# ------------------------------------------------------------------- physical
class ProfileIn(Strict):
    name: str = Field("nominal", min_length=1, max_length=80)
    is_default: bool = True
    baseline: Optional[float] = None
    bias: float = 0.0
    noise_std: float = Field(0.0, ge=0)
    drift_per_min: float = 0.0
    spike_probability: float = Field(0.0, ge=0, le=1)
    spike_magnitude: float = 0.0
    stuck_probability: float = Field(0.0, ge=0, le=1)
    stuck_duration_s: float = Field(10.0, ge=0.5, le=3600)
    dropout_probability: float = Field(0.0, ge=0, le=1)
    dropout_duration_s: float = Field(5.0, ge=0.5, le=3600)
    notes: str = Field("", max_length=300)


class ProfileOut(ORM):
    id: int
    sensor_id: int
    name: str
    is_default: bool
    baseline: Optional[float]
    bias: float
    noise_std: float
    drift_per_min: float
    spike_probability: float
    spike_magnitude: float
    stuck_probability: float
    stuck_duration_s: float
    dropout_probability: float
    dropout_duration_s: float
    notes: str


class ElectricalSpecs(Strict):
    voltage_v: Optional[float] = None
    voltage_min_v: Optional[float] = None
    voltage_max_v: Optional[float] = None
    current_ma: Optional[float] = None
    power_mw: Optional[float] = None


class PhysicalDimensions(Strict):
    length_mm: Optional[float] = None
    width_mm: Optional[float] = None
    height_mm: Optional[float] = None
    weight_g: Optional[float] = None
    housing_material: Optional[str] = Field(None, max_length=120)


class OperatingEnvelope(Strict):
    temp_min_c: Optional[float] = None
    temp_max_c: Optional[float] = None
    pressure_min_kpa: Optional[float] = None
    pressure_max_kpa: Optional[float] = None


class MetrologySpecs(Strict):
    measurement_type: Optional[str] = Field(None, max_length=80)
    precision: Optional[float] = None
    sensitivity: Optional[float] = None
    response_time_s: Optional[float] = None
    sampling_frequency_hz: Optional[float] = None
    calibration_interval_days: Optional[int] = None
    expected_lifetime_hours: Optional[int] = None


class TechnicalSpecs(Strict):
    electrical: Optional[ElectricalSpecs] = Field(default_factory=ElectricalSpecs)
    physical: Optional[PhysicalDimensions] = Field(default_factory=PhysicalDimensions)
    operating_envelope: Optional[OperatingEnvelope] = Field(default_factory=OperatingEnvelope)
    metrology: Optional[MetrologySpecs] = Field(default_factory=MetrologySpecs)
    extra: dict[str, Any] = Field(default_factory=dict)


class _SensorCore(Strict):
    name: str = Field(min_length=1, max_length=120)
    category: Category = Field(min_length=1, max_length=60)
    sensor_family: str = Field("generic", max_length=60)
    manufacturer: str = Field("", max_length=120)
    model_number: str = Field("", max_length=80)
    tags: list[str] = Field(default_factory=list, max_length=50)
    unit: str = Field("", max_length=30)
    channel: Optional[str] = None
    description: str = Field("", max_length=2000)
    min_valid: float
    max_valid: float
    accuracy: float = Field(0.0, ge=0)
    max_rate_per_min: float = Field(0.0, ge=0)
    resolution: float = Field(0.0, ge=0)
    technical_specs: dict[str, Any] = Field(default_factory=dict)
    custom_fields: dict[str, Any] = Field(default_factory=dict)
    change_note: str = Field("", max_length=300)

    @model_validator(mode="after")
    def _check(self):
        if self.max_valid <= self.min_valid:
            raise ValueError("max_valid must be greater than min_valid")
        if self.channel is not None and self.channel not in CHANNELS:
            raise ValueError(
                f"unknown ground-truth channel '{self.channel}'; see GET /api/channels"
            )
        return self


class SensorCreate(_SensorCore):
    key: str = Field(pattern=KEY)


class SensorUpdate(_SensorCore):
    # A sensor key is immutable (rules and plans refer to it). Clients may echo
    # it back, but it must match the stored key.
    key: Optional[str] = None


class SensorDuplicateIn(Strict):
    new_key: Optional[str] = Field(None, pattern=KEY)
    new_name: Optional[str] = Field(None, min_length=1, max_length=120)
    change_note: str = Field("Duplicated sensor", max_length=300)


class SensorStatusIn(Strict):
    status: SensorStatus
    change_note: str = Field("", max_length=300)


class SensorOut(ORM):
    id: int
    key: str
    name: str
    category: str
    sensor_family: str = "generic"
    manufacturer: str = ""
    model_number: str = ""
    tags: list[str] = Field(default_factory=list)
    unit: str
    channel: Optional[str]
    description: str
    min_valid: float
    max_valid: float
    accuracy: float
    max_rate_per_min: float
    resolution: float
    status: str
    version: int
    technical_specs: dict[str, Any] = Field(default_factory=dict)
    custom_fields: dict[str, Any]
    updated_at: UTC
    updated_by: str
    profiles: list[ProfileOut]


class SensorVersionOut(ORM):
    id: int
    version: int
    snapshot: dict[str, Any]
    change_note: str
    changed_by: str
    changed_at: UTC


class CustomFieldIn(Strict):
    key: str = Field(pattern=KEY)
    label: str = Field(min_length=1, max_length=120)
    data_type: Literal["string", "number", "boolean", "enum"]
    options: list[str] = Field(default_factory=list, max_length=30)
    required: bool = False
    category: Optional[Category] = None
    unit: str = Field("", max_length=30)
    description: str = Field("", max_length=300)

    @model_validator(mode="after")
    def _check(self):
        if self.data_type == "enum" and not self.options:
            raise ValueError("enum fields need at least one option")
        return self


class CustomFieldOut(ORM):
    id: int
    key: str
    label: str
    data_type: str
    options: list[str]
    required: bool
    category: Optional[str]
    unit: str
    description: str


class FailureSignatureIn(Strict):
    key: str = Field(pattern=KEY)
    name: str = Field(min_length=1, max_length=120)
    fault_type: FaultType
    description: str = Field("", max_length=2000)
    default_magnitude: Optional[float] = None
    default_duration_s: float = Field(20.0, ge=1, le=3600)
    expected_flag: str = Field("", max_length=40)
    keywords: list[str] = Field(default_factory=list, max_length=20)


class FailureSignatureOut(ORM):
    id: int
    key: str
    name: str
    fault_type: str
    description: str
    default_magnitude: Optional[float]
    default_duration_s: float
    expected_flag: str
    keywords: list[str]


# -------------------------------------------------------------------- medical
class SymptomIn(Strict):
    key: str = Field(pattern=KEY)
    name: str = Field(min_length=1, max_length=120)
    description: str = Field("", max_length=400)


class SymptomOut(ORM):
    id: int
    key: str
    name: str
    description: str


class IndicatorIn(Strict):
    sensor_key: str = Field(min_length=1, max_length=60)
    direction: Literal["rising", "falling", "high", "low"]
    note: str = Field("", max_length=300)


class IndicatorOut(ORM):
    id: int
    sensor_key: str
    direction: str
    note: str


class RecommendationIn(Strict):
    condition_id: int
    audience: Literal["astronaut", "flight_surgeon"] = "astronaut"
    priority: int = Field(1, ge=1, le=9)
    text: str = Field(min_length=3, max_length=500)


class RecommendationOut(ORM):
    id: int
    condition_id: int
    audience: str
    priority: int
    text: str


class SourceIn(Strict):
    key: str = Field(pattern=KEY)
    title: str = Field(min_length=1, max_length=300)
    organization: str = Field("", max_length=160)
    url: str = Field("", max_length=500)
    source_type: Literal[
        "evidence_report", "risk_page", "data_repository", "dataset", "paper", "reference"
    ] = "reference"
    citation: str = Field("", max_length=2000)
    notes: str = Field("", max_length=2000)

    @model_validator(mode="after")
    def _check(self):
        if self.url and not self.url.startswith(("https://", "http://")):
            raise ValueError("url must start with http:// or https://")
        return self


class SourceOut(ORM):
    id: int
    key: str
    title: str
    organization: str
    url: str
    source_type: str
    citation: str
    notes: str


class DatasetOut(ORM):
    id: int
    source_id: Optional[int]
    name: str
    description: str
    file_format: str
    original_filename: str
    checksum_sha256: str
    record_count: int
    columns: list[dict[str, Any]]
    sample_rows: list[dict[str, Any]]
    is_synthetic: bool
    imported_by: str
    imported_at: UTC


class RuleBrief(ORM):
    id: int
    key: str
    name: str
    severity: str
    enabled: bool


class ConditionIn(Strict):
    key: str = Field(pattern=KEY)
    name: str = Field(min_length=1, max_length=160)
    description: str = Field("", max_length=4000)
    hrp_risk: str = Field("", max_length=300)
    mechanism: str = Field("", max_length=4000)
    symptom_ids: list[int] = Field(default_factory=list, max_length=40)
    source_ids: list[int] = Field(default_factory=list, max_length=40)
    indicators: list[IndicatorIn] = Field(default_factory=list, max_length=20)


class ConditionOut(ORM):
    id: int
    key: str
    name: str
    description: str
    hrp_risk: str
    mechanism: str
    updated_at: UTC
    updated_by: str
    symptoms: list[SymptomOut]
    sources: list[SourceOut]
    indicators: list[IndicatorOut]
    recommendations: list[RecommendationOut]
    rules: list[RuleBrief]


class ClauseIn(Strict):
    sensor_key: str = Field(min_length=1, max_length=60)
    operator: Literal[">", ">=", "<", "<="]
    threshold: float
    aggregation: Aggregation = "last"
    window_s: float = Field(30.0, ge=1, le=600)


class RuleIn(Strict):
    key: str = Field(pattern=KEY)
    name: str = Field(min_length=1, max_length=160)
    condition_id: Optional[int] = None
    severity: Severity = "caution"
    logic: Literal["all", "any"] = "all"
    clauses: list[ClauseIn] = Field(min_length=1, max_length=6)
    sustain_s: float = Field(10.0, ge=0, le=600)
    clear_after_s: float = Field(30.0, ge=0, le=600)
    require_good_quality: bool = True
    message: str = Field("", max_length=400)
    rationale: str = Field("", max_length=4000)
    enabled: bool = True


class RuleOut(ORM):
    id: int
    key: str
    name: str
    condition_id: Optional[int]
    severity: str
    logic: str
    clauses: list[dict[str, Any]]
    sustain_s: float
    clear_after_s: float
    require_good_quality: bool
    message: str
    rationale: str
    enabled: bool
    version: int
    updated_at: UTC
    updated_by: str


class HealthEvent(Strict):
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    event: str = Field(min_length=1, max_length=200)
    notes: str = Field("", max_length=500)


class AstronautIn(Strict):
    callsign: str = Field(pattern=r"^[A-Z0-9][A-Z0-9\-]{1,38}$")
    full_name: str = Field(min_length=1, max_length=120)
    age: int = Field(ge=18, le=75)
    sex: str = Field("", max_length=10)
    mass_kg: float = Field(ge=40, le=130)
    height_cm: float = Field(ge=140, le=210)
    resting_hr: float = Field(ge=35, le=100)
    baseline_core_temp_c: float = Field(37.0, ge=36.0, le=37.6)
    vo2max: float = Field(45.0, ge=20, le=80)
    health_history: list[HealthEvent] = Field(default_factory=list, max_length=50)
    notes: str = Field("", max_length=2000)


class AstronautOut(ORM):
    id: int
    callsign: str
    full_name: str
    age: int
    sex: str
    mass_kg: float
    height_cm: float
    resting_hr: float
    baseline_core_temp_c: float
    vo2max: float
    health_history: list[dict[str, Any]]
    notes: str
    is_synthetic: bool


# -------------------------------------------------------------------- mission
class WaypointOut(ORM):
    id: int
    key: str
    name: str
    kind: str
    x: float
    y: float
    route_order: Optional[int]
    description: str


class ScenarioOut(ORM):
    id: int
    key: str
    name: str
    prompt: str
    is_default: bool


class PlanGenerateIn(Strict):
    prompt: str = Field(min_length=3, max_length=2000)
    seed: Optional[int] = Field(None, ge=0, le=2**31 - 1)


class PlanValidateIn(BaseModel):
    plan: dict[str, Any]


class PlanPreviewOut(BaseModel):
    valid: bool
    problems: list[str]
    plan: Optional[dict[str, Any]]
    source: str
    notes: list[str]
    timeline: Optional[dict[str, Any]]


class SessionCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    prompt: str = Field("", max_length=2000)
    plan: dict[str, Any]
    plan_source: str = Field("manual", max_length=40)
    planner_notes: list[str] = Field(default_factory=list, max_length=40)
    astronaut_id: Optional[int] = None


class SessionOut(ORM):
    id: str
    name: str
    prompt: str
    plan: dict[str, Any]
    plan_source: str
    planner_notes: list[str]
    seed: int
    status: str
    speed: float
    run: int
    sim_time: float
    duration_s: float
    astronaut_id: Optional[int]
    created_by: str
    created_at: UTC
    started_at: Optional[UTC]
    ended_at: Optional[UTC]
    end_reason: str


class ControlIn(Strict):
    action: Literal["start", "pause", "resume", "restart", "stop", "set_speed"]
    speed: Optional[float] = None


class ViewerTokenCreateIn(Strict):
    ttl_minutes: Optional[int] = Field(None, ge=1, le=1440)
    label: str = Field("", max_length=80)
    base_url: Optional[str] = Field(None, max_length=200)


class ViewerTokenOut(ORM):
    id: int
    session_id: str
    label: str
    created_by: str
    created_at: UTC
    expires_at: UTC
    revoked_at: Optional[UTC]
    last_used_at: Optional[UTC]
    use_count: int
    state: str = "active"


class ViewerTokenCreated(ViewerTokenOut):
    token: str
    url: str
    qr_svg: str


class ChatIn(Strict):
    message: str = Field(min_length=1, max_length=1000)


class ChatMessageOut(ORM):
    id: int
    role: str
    author: str
    content: str
    provider: str
    sim_time: float
    created_at: UTC
