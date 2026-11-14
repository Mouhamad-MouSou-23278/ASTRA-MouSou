"""Strict, validated simulation plan schema.

A plan is *data*, never code. Whether it comes from an LLM, from the
deterministic natural-language fallback, or from a human editing JSON, it must
pass this schema (unknown fields are rejected, every number is bounded) and
then `timeline.compile_plan`, which checks it against the world and the active
sensor registry. Nothing in a plan can name a function, a file, or a command.
"""
from __future__ import annotations

from typing import Annotated, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field

ACTIVITY_ACTIONS = (
    "OPEN_HATCH",
    "ASTRONAUT_EXIT",
    "WALK_TO_WAYPOINT",
    "KNEEL",
    "COLLECT_SOIL_SAMPLE",
    "STAND_UP",
    "WAIT",
)
OVERLAY_ACTIONS = (
    "THERMAL_LOAD_CHANGE",
    "RADIATION_EXPOSURE_CHANGE",
    "SENSOR_FAULT_INJECTION",
)
ALL_ACTIONS = ACTIVITY_ACTIONS + OVERLAY_ACTIONS
FAULT_TYPES = ("spike", "drift", "stuck", "disconnect", "noise_burst", "bias")

MAX_PLAN_DURATION_S = 7200.0
_ID = r"^[A-Za-z0-9_\-]{1,40}$"


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Trigger(_Strict):
    """When an overlay event begins.

    at="time"        -> t_s seconds after mission start
    at="step_start"  -> offset_s after the referenced activity step starts
    at="step_end"    -> offset_s after the referenced activity step ends
    """

    at: Literal["time", "step_start", "step_end"] = "time"
    t_s: float = Field(0.0, ge=0, le=MAX_PLAN_DURATION_S)
    step: Optional[str] = Field(None, pattern=_ID)
    offset_s: float = Field(0.0, ge=0, le=3600)


class _Step(_Strict):
    id: str = Field(pattern=_ID)
    note: Optional[str] = Field(None, max_length=300)


class OpenHatch(_Step):
    action: Literal["OPEN_HATCH"]
    duration_s: float = Field(8.0, ge=2, le=120)


class AstronautExit(_Step):
    action: Literal["ASTRONAUT_EXIT"]
    duration_s: float = Field(25.0, ge=5, le=300)


class WalkToWaypoint(_Step):
    action: Literal["WALK_TO_WAYPOINT"]
    waypoint: str = Field(min_length=1, max_length=60)
    speed_mps: float = Field(0.8, ge=0.2, le=1.6)


class Kneel(_Step):
    action: Literal["KNEEL"]
    duration_s: float = Field(4.0, ge=2, le=30)


class CollectSoilSample(_Step):
    action: Literal["COLLECT_SOIL_SAMPLE"]
    duration_s: float = Field(60.0, ge=10, le=600)


class StandUp(_Step):
    action: Literal["STAND_UP"]
    duration_s: float = Field(4.0, ge=2, le=30)


class Wait(_Step):
    action: Literal["WAIT"]
    duration_s: float = Field(10.0, ge=1, le=1800)


class ThermalLoadChange(_Step):
    """Adds an external heat load and/or degrades suit cooling. Independent of radiation."""

    action: Literal["THERMAL_LOAD_CHANGE"]
    trigger: Trigger
    external_heat_w: float = Field(0.0, ge=-400, le=1200)
    cooling_efficiency: float = Field(1.0, ge=0.05, le=1.0)
    ramp_s: float = Field(30.0, ge=0, le=600)
    duration_s: Optional[float] = Field(None, ge=10, le=MAX_PLAN_DURATION_S)


class RadiationExposureChange(_Step):
    """Scales the ambient radiation dose rate. Independent of thermal state."""

    action: Literal["RADIATION_EXPOSURE_CHANGE"]
    trigger: Trigger
    dose_rate_multiplier: float = Field(ge=0.1, le=500)
    ramp_s: float = Field(30.0, ge=0, le=600)
    duration_s: Optional[float] = Field(None, ge=10, le=MAX_PLAN_DURATION_S)


class SensorFaultInjection(_Step):
    action: Literal["SENSOR_FAULT_INJECTION"]
    trigger: Trigger
    sensor_key: str = Field(min_length=1, max_length=60)
    fault: Literal["spike", "drift", "stuck", "disconnect", "noise_burst", "bias"]
    magnitude: Optional[float] = Field(None, ge=-1.0e6, le=1.0e6)
    duration_s: float = Field(20.0, ge=1, le=3600)


Step = Annotated[
    Union[
        OpenHatch,
        AstronautExit,
        WalkToWaypoint,
        Kneel,
        CollectSoilSample,
        StandUp,
        Wait,
        ThermalLoadChange,
        RadiationExposureChange,
        SensorFaultInjection,
    ],
    Field(discriminator="action"),
]


class SimulationPlan(_Strict):
    version: Literal[1] = 1
    title: str = Field(min_length=1, max_length=120)
    seed: int = Field(2026, ge=0, le=2**31 - 1)
    steps: list[Step] = Field(min_length=1, max_length=60)


class PlanError(ValueError):
    """Raised when a schema-valid plan is not executable in the given world."""

    def __init__(self, problems: list[str]) -> None:
        super().__init__("; ".join(problems))
        self.problems = problems
