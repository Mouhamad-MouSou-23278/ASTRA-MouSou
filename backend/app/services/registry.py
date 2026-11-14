"""Bridges the database catalogue and the simulation engine.

`build_snapshot` freezes everything a session needs (active sensors with their
default simulation profile, enabled medical rules, world, astronaut, medical
knowledge). The engine is always built from a snapshot, never from live
tables, so a session is reproducible even if the catalogue is edited later.
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from astra_sim import (
    AstronautParams,
    EngineConfig,
    HeightField,
    MedicalRule,
    RuleClause,
    SensorProfile,
    SensorSpec,
    SimulationPlan,
    Waypoint as SimWaypoint,
    World,
)

from ..config import get_settings
from ..models import (
    AstronautProfile,
    MedicalCondition,
    Sensor,
    SystemConfig,
    WarningRule,
    Waypoint,
)
from ..seed_data import LANDER

DT = 0.5
SPEEDS = (0.5, 1.0, 2.0, 4.0, 8.0, 16.0)

PROFILE_FIELDS = (
    "baseline", "bias", "noise_std", "drift_per_min", "spike_probability", "spike_magnitude",
    "stuck_probability", "stuck_duration_s", "dropout_probability", "dropout_duration_s",
)


def get_config(db: Session, key: str, default: Any = None) -> Any:
    row = db.get(SystemConfig, key)
    return default if row is None else row.value


@lru_cache
def load_heightfield() -> Optional[HeightField]:
    terrain_dir = Path(get_settings().terrain_dir)
    try:
        return HeightField.load(terrain_dir)
    except (OSError, ValueError, KeyError):
        return None


def default_profile(sensor: Sensor):
    for p in sensor.profiles:
        if p.is_default:
            return p
    return None


def active_sensors(db: Session) -> list[Sensor]:
    return list(
        db.scalars(
            select(Sensor).where(Sensor.status == "active")
            .options(selectinload(Sensor.profiles)).order_by(Sensor.id)
        )
    )


def world_dict(db: Session) -> dict:
    return {
        "lander": dict(LANDER),
        "waypoints": [
            {"key": w.key, "name": w.name, "kind": w.kind, "x": w.x, "y": w.y,
             "route_order": w.route_order}
            for w in db.scalars(select(Waypoint).order_by(Waypoint.id))
        ],
    }


def world_from_dict(data: dict) -> World:
    lander = data["lander"]
    return World(
        lander_x=lander["x"], lander_y=lander["y"], hatch_heading=lander["hatch_heading"],
        waypoints={
            w["key"]: SimWaypoint(w["key"], w["name"], w["x"], w["y"], w.get("kind", "route"))
            for w in data["waypoints"]
        },
        heightfield=load_heightfield(),
    )


def build_snapshot(db: Session, astronaut_id: Optional[int]) -> dict:
    astronaut = db.get(AstronautProfile, astronaut_id) if astronaut_id else None
    if astronaut is None:
        astronaut = db.scalar(select(AstronautProfile).order_by(AstronautProfile.id))

    sensors = []
    for s in active_sensors(db):
        prof = default_profile(s)
        sensors.append({
            "key": s.key, "name": s.name, "category": s.category, "unit": s.unit,
            "channel": s.channel, "min_valid": s.min_valid, "max_valid": s.max_valid,
            "accuracy": s.accuracy, "max_rate_per_min": s.max_rate_per_min,
            "resolution": s.resolution, "version": s.version,
            "profile_name": prof.name if prof else None,
            "profile": {f: getattr(prof, f) for f in PROFILE_FIELDS} if prof else {},
        })

    conditions = list(
        db.scalars(
            select(MedicalCondition).options(
                selectinload(MedicalCondition.symptoms),
                selectinload(MedicalCondition.sources),
                selectinload(MedicalCondition.indicators),
                selectinload(MedicalCondition.recommendations),
            )
        )
    )
    by_id = {c.id: c for c in conditions}

    def recs(cond: MedicalCondition, audience: str) -> list[str]:
        return [r.text for r in cond.recommendations if r.audience == audience]

    rules = []
    for r in db.scalars(select(WarningRule).where(WarningRule.enabled.is_(True)).order_by(WarningRule.id)):
        cond = by_id.get(r.condition_id) if r.condition_id else None
        rules.append({
            "key": r.key, "name": r.name, "severity": r.severity, "logic": r.logic,
            "clauses": r.clauses, "sustain_s": r.sustain_s, "clear_after_s": r.clear_after_s,
            "require_good_quality": r.require_good_quality, "message": r.message,
            "rationale": r.rationale, "version": r.version,
            "condition_key": cond.key if cond else None,
            "condition_name": cond.name if cond else None,
            "recommendations": recs(cond, "astronaut") if cond else [],
        })

    knowledge = {
        c.key: {
            "name": c.name, "description": c.description, "mechanism": c.mechanism,
            "hrp_risk": c.hrp_risk,
            "symptoms": [s.name for s in c.symptoms],
            "indicators": [{"sensor_key": i.sensor_key, "direction": i.direction, "note": i.note}
                           for i in c.indicators],
            "recommendations": {"astronaut": recs(c, "astronaut"),
                                "flight_surgeon": recs(c, "flight_surgeon")},
            "sources": [{"title": s.title, "organization": s.organization, "url": s.url}
                        for s in c.sources],
        }
        for c in conditions
    }

    return {
        "dt": DT,
        "astronaut": {
            "id": astronaut.id, "callsign": astronaut.callsign, "full_name": astronaut.full_name,
            "age": astronaut.age, "mass_kg": astronaut.mass_kg, "resting_hr": astronaut.resting_hr,
            "baseline_core_temp_c": astronaut.baseline_core_temp_c, "vo2max": astronaut.vo2max,
            "health_history": astronaut.health_history, "is_synthetic": True,
        } if astronaut else None,
        "world": world_dict(db),
        "sensors": sensors,
        "rules": rules,
        "knowledge": knowledge,
    }


def sensor_specs(snapshot: dict) -> list[SensorSpec]:
    return [
        SensorSpec(
            key=s["key"], name=s["name"], category=s["category"], unit=s["unit"],
            channel=s["channel"], min_valid=s["min_valid"], max_valid=s["max_valid"],
            accuracy=s["accuracy"], max_rate_per_min=s["max_rate_per_min"],
            resolution=s["resolution"], profile=SensorProfile(**s["profile"]),
        )
        for s in snapshot["sensors"]
    ]


def medical_rules(snapshot: dict) -> list[MedicalRule]:
    return [
        MedicalRule(
            key=r["key"], name=r["name"], severity=r["severity"], logic=r["logic"],
            clauses=tuple(
                RuleClause(c["sensor_key"], c["operator"], float(c["threshold"]),
                           c.get("aggregation", "last"), float(c.get("window_s", 30.0)))
                for c in r["clauses"]
            ),
            sustain_s=r["sustain_s"], clear_after_s=r["clear_after_s"],
            require_good_quality=r["require_good_quality"],
            condition_key=r["condition_key"], condition_name=r["condition_name"],
            message=r["message"], recommendations=tuple(r["recommendations"]),
        )
        for r in snapshot["rules"]
    ]


def engine_config(snapshot: dict, plan: SimulationPlan) -> EngineConfig:
    a = snapshot.get("astronaut") or {}
    astronaut = AstronautParams(
        callsign=a.get("callsign", "ARES-1"), mass_kg=a.get("mass_kg", 80.0),
        resting_hr=a.get("resting_hr", 62.0),
        baseline_core_temp_c=a.get("baseline_core_temp_c", 37.0), vo2max=a.get("vo2max", 48.0),
    )
    return EngineConfig(
        plan=plan, world=world_from_dict(snapshot["world"]), astronaut=astronaut,
        sensors=sensor_specs(snapshot), rules=medical_rules(snapshot), dt=snapshot.get("dt", DT),
    )


def sensor_meta(snapshot: dict) -> list[dict]:
    """What a client needs to label and scale telemetry."""
    return [
        {k: s[k] for k in ("key", "name", "category", "unit", "channel", "min_valid", "max_valid")}
        for s in snapshot["sensors"]
    ]
