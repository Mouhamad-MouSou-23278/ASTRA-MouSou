"""Idempotent database seeding with the demo catalogue."""
from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import seed_data as sd
from .config import get_settings
from .models import (
    AstronautProfile,
    ConditionIndicator,
    CustomFieldDef,
    FailureSignature,
    MedicalCondition,
    Recommendation,
    Scenario,
    ScientificSource,
    Sensor,
    SensorVersion,
    SimulationProfile,
    Symptom,
    SystemConfig,
    User,
    WarningRule,
    Waypoint,
)
from .security import hash_password

SENSOR_SNAPSHOT_FIELDS = (
    "key", "name", "category", "unit", "channel", "description", "min_valid", "max_valid",
    "accuracy", "max_rate_per_min", "resolution", "status", "custom_fields",
)


def sensor_snapshot(sensor: Sensor) -> dict:
    return {f: getattr(sensor, f) for f in SENSOR_SNAPSHOT_FIELDS}


def _empty(db: Session, model) -> bool:
    return (db.scalar(select(func.count()).select_from(model)) or 0) == 0


def seed(db: Session) -> bool:
    """Populate empty tables. Returns True if anything was inserted."""
    settings = get_settings()
    changed = False

    # System configuration keys are always ensured (new keys appear on upgrade).
    for key, value, description in sd.SYSTEM_CONFIG:
        if db.get(SystemConfig, key) is None:
            db.add(SystemConfig(key=key, value=value, description=description))
            changed = True

    if not settings.seed_demo_data:
        db.commit()
        return changed

    if _empty(db, User):
        for username, full_name, role, password in sd.DEMO_USERS:
            db.add(User(username=username, full_name=full_name, role=role,
                        password_hash=hash_password(settings.demo_password or password)))
        changed = True

    if _empty(db, CustomFieldDef):
        for key, label, data_type, options, required, category, unit, description in sd.CUSTOM_FIELDS:
            db.add(CustomFieldDef(key=key, label=label, data_type=data_type, options=options,
                                  required=required, category=category, unit=unit,
                                  description=description))
        changed = True

    if _empty(db, Sensor):
        by_key: dict[str, Sensor] = {}
        for (key, name, category, unit, channel, lo, hi, accuracy, max_rate, resolution, noise,
             custom) in sd.SENSORS:
            sensor = Sensor(key=key, name=name, category=category, unit=unit, channel=channel,
                            min_valid=lo, max_valid=hi, accuracy=accuracy, max_rate_per_min=max_rate,
                            resolution=resolution, status="active", version=1, custom_fields=custom)
            sensor.profiles.append(SimulationProfile(name="nominal", is_default=True, noise_std=noise))
            by_key[key] = sensor
            db.add(sensor)
        for key, extra in sd.EXTRA_PROFILES:
            by_key[key].profiles.append(SimulationProfile(**extra))
        db.flush()
        for sensor in by_key.values():
            db.add(SensorVersion(sensor_id=sensor.id, version=1, snapshot=sensor_snapshot(sensor),
                                 change_note="Initial seeded version"))
        changed = True

    if _empty(db, FailureSignature):
        for key, name, fault_type, description, magnitude, duration, flag, keywords in sd.FAILURE_SIGNATURES:
            db.add(FailureSignature(key=key, name=name, fault_type=fault_type, description=description,
                                    default_magnitude=magnitude, default_duration_s=duration,
                                    expected_flag=flag, keywords=keywords))
        changed = True

    if _empty(db, MedicalCondition):
        symptoms = {key: Symptom(key=key, name=name, description=desc) for key, name, desc in sd.SYMPTOMS}
        sources = {
            key: ScientificSource(key=key, title=title, organization=org, url=url,
                                  source_type=stype, citation=citation, notes=notes)
            for key, title, org, url, stype, citation, notes in sd.SOURCES
        }
        db.add_all(symptoms.values())
        db.add_all(sources.values())
        conditions: dict[str, MedicalCondition] = {}
        for key, name, hrp_risk, description, mechanism, sym, src, indicators in sd.CONDITIONS:
            cond = MedicalCondition(key=key, name=name, hrp_risk=hrp_risk, description=description,
                                    mechanism=mechanism)
            cond.symptoms = [symptoms[s] for s in sym]
            cond.sources = [sources[s] for s in src]
            cond.indicators = [ConditionIndicator(sensor_key=sk, direction=d, note=n)
                               for sk, d, n in indicators]
            conditions[key] = cond
            db.add(cond)
        db.flush()
        for cond_key, audience, priority, text in sd.RECOMMENDATIONS:
            db.add(Recommendation(condition_id=conditions[cond_key].id, audience=audience,
                                  priority=priority, text=text))
        for (key, name, cond_key, severity, logic, clauses, sustain, clear, message,
             rationale) in sd.RULES:
            db.add(WarningRule(key=key, name=name, condition_id=conditions[cond_key].id,
                               severity=severity, logic=logic, clauses=clauses, sustain_s=sustain,
                               clear_after_s=clear, message=message, rationale=rationale))
        changed = True

    if _empty(db, AstronautProfile):
        for data in sd.ASTRONAUTS:
            db.add(AstronautProfile(**data, is_synthetic=True))
        changed = True

    if _empty(db, Waypoint):
        for key, name, kind, x, y, order, description in sd.WAYPOINTS:
            db.add(Waypoint(key=key, name=name, kind=kind, x=x, y=y, route_order=order,
                            description=description))
        changed = True

    if _empty(db, Scenario):
        for key, name, prompt, is_default in sd.SCENARIOS:
            db.add(Scenario(key=key, name=name, prompt=prompt, is_default=is_default))
        changed = True

    db.commit()
    return changed
