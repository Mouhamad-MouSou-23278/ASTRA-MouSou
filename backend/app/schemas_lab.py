"""Pydantic schemas for the ASTRA Physical Sensor Engineering & Simulation Laboratory.

Supports:
- Dynamic I/O port contracts
- 3D physical placement and visual primitive representations
- Physics model bindings and parameters
- Mars environmental couplings and sensitivity transfer functions
- Parameterized error models
- Benchmark simulation execution and Trusted Data Layer metrics
- Physical AI Agent proposals and tool interactions
"""
from __future__ import annotations

from typing import Annotated, Any, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field, PlainSerializer

KEY = r"^[a-z][a-z0-9_]{1,58}$"


class LabStrict(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


# ------------------------------------------------------------- I/O Contracts
class InputPortDef(LabStrict):
    port_key: str = Field(pattern=KEY)
    name: str = Field(min_length=1, max_length=120)
    data_type: Literal["float", "integer", "boolean", "vector3"] = "float"
    unit: str = Field("", max_length=30)
    source_channel: Optional[str] = Field(None, max_length=60)
    expected_min: Optional[float] = None
    expected_max: Optional[float] = None
    default_val: Optional[float] = None
    required: bool = True


class OutputPortDef(LabStrict):
    port_key: str = Field(pattern=KEY)
    name: str = Field(min_length=1, max_length=120)
    data_type: Literal["float", "integer", "boolean", "vector3"] = "float"
    unit: str = Field("", max_length=30)
    expected_min: Optional[float] = None
    expected_max: Optional[float] = None
    precision_digits: int = Field(2, ge=0, le=8)
    nominal_accuracy: float = Field(0.0, ge=0)
    nominal_resolution: float = Field(0.0, ge=0)


class IOContract(LabStrict):
    inputs: list[InputPortDef] = Field(default_factory=list)
    outputs: list[OutputPortDef] = Field(default_factory=list)


# -------------------------------------------------------------- 3D Placement
ParentBody = Literal[
    "astronaut_torso",
    "astronaut_head",
    "astronaut_backpack",
    "astronaut_arm_left",
    "astronaut_arm_right",
    "astronaut_leg_left",
    "astronaut_leg_right",
    "lander_exterior",
    "weather_station",
]

PrimitiveShape = Literal["cylinder", "box", "sphere", "capsule", "disc"]


class PlacementConfig(LabStrict):
    parent_body: ParentBody = "astronaut_torso"
    mount_point: str = Field("chest_center", max_length=80)
    pos_x: float = 0.0
    pos_y: float = 0.0
    pos_z: float = 0.0
    rot_x: float = 0.0
    rot_y: float = 0.0
    rot_z: float = 0.0
    scale: float = Field(1.0, ge=0.01, le=100.0)
    asset_type: Literal["primitive", "mesh_asset"] = "primitive"
    primitive_shape: PrimitiveShape = "cylinder"
    color_hex: str = Field("#3a86ff", pattern=r"^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")
    dimensions_mm: list[float] = Field(default_factory=lambda: [20.0, 20.0, 10.0])


# ----------------------------------------------------------- Physics Binding
class PhysicsBinding(LabStrict):
    model_key: str = Field("rtd_temperature", max_length=60)
    model_version: str = Field("1.0", max_length=20)
    parameters: dict[str, Any] = Field(default_factory=dict)
    enabled: bool = True


# ------------------------------------------------ Environmental Sensitivity
class EnvironmentalSensitivity(LabStrict):
    factor_key: str = Field(min_length=1, max_length=60)
    factor_name: str = Field(min_length=1, max_length=120)
    sensitivity_coeff: float = 0.0
    threshold_low: Optional[float] = None
    threshold_high: Optional[float] = None
    effect_type: Literal[
        "bias_shift", "gain_error", "noise_amplification", "stuck_at_extreme"
    ] = "bias_shift"


# ----------------------------------------------------- Error Model Config
class ErrorModelConfig(LabStrict):
    error_type: Literal[
        "gaussian_noise",
        "linear_drift",
        "bias_offset",
        "stuck_at",
        "dropout",
        "spike",
        "quantization",
    ]
    enabled: bool = True
    parameters: dict[str, Any] = Field(default_factory=dict)


# --------------------------------------------------------- Lab State Update
class SensorLabUpdate(LabStrict):
    io_contract: Optional[IOContract] = None
    placement_data: Optional[PlacementConfig] = None
    physics_config: Optional[PhysicsBinding] = None
    error_configs: Optional[list[ErrorModelConfig]] = None
    environmental_sensitivities: Optional[list[EnvironmentalSensitivity]] = None
    change_note: str = Field("Updated laboratory configuration", max_length=300)


# ------------------------------------------------------- Benchmark / TDL
class BenchmarkRequest(LabStrict):
    duration_s: float = Field(30.0, ge=5.0, le=300.0)
    dt: float = Field(0.5, ge=0.1, le=2.0)
    seed: int = 42
    ambient_temp_c: float = -27.0
    ambient_pressure_pa: float = 735.0
    radiation_dose_rate_usv_h: float = 27.9
    dust_deposition_rate: float = 0.0


class BenchmarkPoint(LabStrict):
    t: float
    ground_truth: float
    raw_observed: Optional[float]
    processed_output: Optional[float]
    residual: Optional[float]
    trust_score: float
    flags: list[str] = Field(default_factory=list)


class BenchmarkResult(LabStrict):
    sensor_key: str
    duration_s: float
    dt: float
    points: list[BenchmarkPoint]
    metrics: dict[str, float]


# ----------------------------------------------------- Physical AI Agent
class AgentChatRequest(LabStrict):
    message: str = Field(min_length=1, max_length=4000)
    context_sensor_key: Optional[str] = None
    history: list[dict[str, str]] = Field(default_factory=list)


class AgentToolProposal(LabStrict):
    proposal_id: str
    tool_name: str
    entity_key: str
    description: str
    parameters: dict[str, Any]
    diff: dict[str, Any]
    requires_confirmation: bool = True


class AgentChatResponse(LabStrict):
    reply: str
    proposals: list[AgentToolProposal] = Field(default_factory=list)
    citations: list[dict[str, str]] = Field(default_factory=list)
    provider_info: str = "ASTRA Physical Engineering AI Agent"


class ApproveProposalRequest(LabStrict):
    proposal_id: str
    tool_name: str
    entity_key: str
    parameters: dict[str, Any]
