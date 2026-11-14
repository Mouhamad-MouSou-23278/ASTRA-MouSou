"""Physical Team: sensor registry, custom fields, simulation profiles, failure signatures."""
from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from astra_sim import CHANNELS

from ..audit import audit
from ..db import get_db
from ..models import (
    CustomFieldDef,
    FailureSignature,
    Sensor,
    SensorVersion,
    SimulationProfile,
    User,
)
from ..schemas import (
    CustomFieldIn,
    CustomFieldOut,
    FailureSignatureIn,
    FailureSignatureOut,
    ProfileIn,
    ProfileOut,
    SensorCreate,
    SensorOut,
    SensorStatusIn,
    SensorUpdate,
    SensorVersionOut,
)
from ..security import require_roles
from ..seed import sensor_snapshot
from .common import CATALOG_READ, PHYSICAL_WRITE, commit_or_409, get_or_404, register_crud

router = APIRouter(tags=["physical"])
reader = require_roles(*CATALOG_READ)
writer = require_roles(*PHYSICAL_WRITE)

# Lifecycle: Draft -> Active -> Archived (an archived sensor can be reworked as a draft).
TRANSITIONS = {
    "draft": ("active", "archived"),
    "active": ("archived",),
    "archived": ("draft",),
}


@router.get("/channels")
def list_channels(_: User = Depends(reader)):
    """Ground-truth channels a sensor can observe."""
    return [{"key": c.key, "name": c.name, "unit": c.unit, "category": c.category,
             "description": c.description} for c in CHANNELS.values()]


# ------------------------------------------------------------- custom fields
def validate_custom_fields(db: Session, category: str, values: dict[str, Any],
                           enforce_required: bool) -> dict[str, Any]:
    defs = {d.key: d for d in db.scalars(select(CustomFieldDef))
            if d.category is None or d.category == category}
    problems = []
    clean: dict[str, Any] = {}
    for key, value in values.items():
        d = defs.get(key)
        if d is None:
            problems.append(f"'{key}' is not a defined custom field for {category} sensors")
            continue
        if value is None or value == "":
            continue
        if d.data_type == "number":
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                problems.append(f"'{key}' must be a number")
                continue
        elif d.data_type == "boolean":
            if not isinstance(value, bool):
                problems.append(f"'{key}' must be true or false")
                continue
        elif d.data_type == "enum":
            if value not in d.options:
                problems.append(f"'{key}' must be one of {d.options}")
                continue
        elif not isinstance(value, str) or len(value) > 300:
            problems.append(f"'{key}' must be text of at most 300 characters")
            continue
        clean[key] = value
    if enforce_required:
        for key, d in defs.items():
            if d.required and key not in clean:
                problems.append(f"required custom field '{key}' ({d.label}) is missing")
    if problems:
        raise HTTPException(422, "; ".join(problems))
    return clean


def _strip_field_from_sensors(db: Session, field: CustomFieldDef) -> None:
    for sensor in db.scalars(select(Sensor)):
        if field.key in (sensor.custom_fields or {}):
            sensor.custom_fields = {k: v for k, v in sensor.custom_fields.items() if k != field.key}


register_crud(router, "/custom-fields", CustomFieldDef, CustomFieldIn, CustomFieldOut,
              entity="custom_field", read_roles=CATALOG_READ, write_roles=PHYSICAL_WRITE,
              order_by=CustomFieldDef.id, before_delete=_strip_field_from_sensors)

register_crud(router, "/failure-signatures", FailureSignature, FailureSignatureIn, FailureSignatureOut,
              entity="failure_signature", read_roles=CATALOG_READ, write_roles=PHYSICAL_WRITE,
              order_by=FailureSignature.id)


# ------------------------------------------------------------------- sensors
def _load(db: Session, sensor_id: int) -> Sensor:
    sensor = db.scalar(select(Sensor).where(Sensor.id == sensor_id).options(selectinload(Sensor.profiles)))
    if sensor is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sensor not found")
    return sensor


def _record_version(db: Session, sensor: Sensor, user: User, note: str) -> None:
    sensor.version += 1
    sensor.updated_by = user.username
    db.add(SensorVersion(sensor_id=sensor.id, version=sensor.version, snapshot=sensor_snapshot(sensor),
                         change_note=note, changed_by=user.username))


@router.get("/sensors", response_model=list[SensorOut])
def list_sensors(status_filter: Optional[str] = None, db: Session = Depends(get_db),
                 _: User = Depends(reader)):
    stmt = select(Sensor).options(selectinload(Sensor.profiles)).order_by(Sensor.category, Sensor.id)
    if status_filter:
        stmt = stmt.where(Sensor.status == status_filter)
    return list(db.scalars(stmt))


@router.get("/sensors/{sensor_id}", response_model=SensorOut)
def get_sensor(sensor_id: int, db: Session = Depends(get_db), _: User = Depends(reader)):
    return _load(db, sensor_id)


@router.post("/sensors", response_model=SensorOut, status_code=201)
def create_sensor(payload: SensorCreate, db: Session = Depends(get_db), user: User = Depends(writer)):
    if db.scalar(select(Sensor).where(Sensor.key == payload.key)):
        raise HTTPException(status.HTTP_409_CONFLICT, f"Sensor key '{payload.key}' already exists")
    data = payload.model_dump(exclude={"change_note"})
    data["custom_fields"] = validate_custom_fields(db, payload.category, payload.custom_fields, False)
    sensor = Sensor(**data, status="draft", version=1, updated_by=user.username)
    # Every sensor starts with a nominal profile whose noise matches its datasheet accuracy.
    sensor.profiles.append(SimulationProfile(name="nominal", is_default=True, noise_std=payload.accuracy))
    db.add(sensor)
    db.flush()
    db.add(SensorVersion(sensor_id=sensor.id, version=1, snapshot=sensor_snapshot(sensor),
                         change_note=payload.change_note or "Created as draft", changed_by=user.username))
    audit(db, user, "sensor.create", "sensor", sensor.id, {"key": sensor.key})
    commit_or_409(db, "Sensor")
    return _load(db, sensor.id)


@router.put("/sensors/{sensor_id}", response_model=SensorOut)
def update_sensor(sensor_id: int, payload: SensorUpdate, db: Session = Depends(get_db),
                  user: User = Depends(writer)):
    sensor = _load(db, sensor_id)
    if sensor.status == "archived":
        raise HTTPException(status.HTTP_409_CONFLICT, "Archived sensors are read-only; move to draft first")
    if payload.key is not None and payload.key != sensor.key:
        raise HTTPException(422, "A sensor key cannot be changed")
    data = payload.model_dump(exclude={"change_note", "key"})
    data["custom_fields"] = validate_custom_fields(db, payload.category, payload.custom_fields,
                                                   sensor.status == "active")
    for key, value in data.items():
        setattr(sensor, key, value)
    _record_version(db, sensor, user, payload.change_note or "Updated")
    audit(db, user, "sensor.update", "sensor", sensor.id, {"key": sensor.key, "version": sensor.version})
    commit_or_409(db, "Sensor")
    return _load(db, sensor.id)


@router.post("/sensors/{sensor_id}/status", response_model=SensorOut)
def set_sensor_status(sensor_id: int, payload: SensorStatusIn, db: Session = Depends(get_db),
                      user: User = Depends(writer)):
    sensor = _load(db, sensor_id)
    if payload.status == sensor.status:
        return sensor
    if payload.status not in TRANSITIONS[sensor.status]:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Cannot move a sensor from {sensor.status} to {payload.status} "
            f"(allowed: {', '.join(TRANSITIONS[sensor.status])})",
        )
    if payload.status == "active":
        default = next((p for p in sensor.profiles if p.is_default), None)
        if default is None:
            raise HTTPException(status.HTTP_409_CONFLICT, "A default simulation profile is required to activate")
        if sensor.channel is None and default.baseline is None:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "A sensor with no ground-truth channel needs a baseline in its default profile",
            )
        validate_custom_fields(db, sensor.category, sensor.custom_fields or {}, True)
    previous = sensor.status
    sensor.status = payload.status
    _record_version(db, sensor, user, payload.change_note or f"Status: {previous} -> {payload.status}")
    audit(db, user, "sensor.status", "sensor", sensor.id, {"from": previous, "to": payload.status})
    db.commit()
    return _load(db, sensor.id)


@router.delete("/sensors/{sensor_id}", status_code=204)
def delete_sensor(sensor_id: int, db: Session = Depends(get_db), user: User = Depends(writer)):
    sensor = _load(db, sensor_id)
    if sensor.status != "draft":
        raise HTTPException(status.HTTP_409_CONFLICT,
                            "Only draft sensors can be deleted; archive active sensors instead")
    db.delete(sensor)
    audit(db, user, "sensor.delete", "sensor", sensor_id, {"key": sensor.key})
    db.commit()


@router.get("/sensors/{sensor_id}/versions", response_model=list[SensorVersionOut])
def sensor_versions(sensor_id: int, db: Session = Depends(get_db), _: User = Depends(reader)):
    get_or_404(db, Sensor, sensor_id, "Sensor")
    return list(db.scalars(select(SensorVersion).where(SensorVersion.sensor_id == sensor_id)
                           .order_by(SensorVersion.version.desc())))


# ------------------------------------------------------------------ profiles
def _set_default(sensor: Sensor, chosen: SimulationProfile) -> None:
    for p in sensor.profiles:
        p.is_default = p is chosen


@router.post("/sensors/{sensor_id}/profiles", response_model=ProfileOut, status_code=201)
def create_profile(sensor_id: int, payload: ProfileIn, db: Session = Depends(get_db),
                   user: User = Depends(writer)):
    sensor = _load(db, sensor_id)
    if any(p.name == payload.name for p in sensor.profiles):
        raise HTTPException(status.HTTP_409_CONFLICT, f"Profile '{payload.name}' already exists")
    profile = SimulationProfile(**payload.model_dump())
    sensor.profiles.append(profile)
    if payload.is_default or len(sensor.profiles) == 1:
        _set_default(sensor, profile)
    db.flush()
    audit(db, user, "profile.create", "simulation_profile", profile.id, {"sensor": sensor.key})
    commit_or_409(db, "Profile")
    return profile


@router.put("/profiles/{profile_id}", response_model=ProfileOut)
def update_profile(profile_id: int, payload: ProfileIn, db: Session = Depends(get_db),
                   user: User = Depends(writer)):
    profile = get_or_404(db, SimulationProfile, profile_id, "Profile")
    sensor = _load(db, profile.sensor_id)
    profile = next(p for p in sensor.profiles if p.id == profile_id)
    if any(p.name == payload.name and p.id != profile_id for p in sensor.profiles):
        raise HTTPException(status.HTTP_409_CONFLICT, f"Profile '{payload.name}' already exists")
    was_default = profile.is_default
    for key, value in payload.model_dump().items():
        setattr(profile, key, value)
    if payload.is_default:
        _set_default(sensor, profile)
    elif was_default:
        # A sensor must always keep exactly one default profile.
        profile.is_default = True
    audit(db, user, "profile.update", "simulation_profile", profile.id, {"sensor": sensor.key})
    commit_or_409(db, "Profile")
    return profile


@router.delete("/profiles/{profile_id}", status_code=204)
def delete_profile(profile_id: int, db: Session = Depends(get_db), user: User = Depends(writer)):
    profile = get_or_404(db, SimulationProfile, profile_id, "Profile")
    if profile.is_default:
        raise HTTPException(status.HTTP_409_CONFLICT,
                            "The default profile cannot be deleted; make another profile the default first")
    db.delete(profile)
    audit(db, user, "profile.delete", "simulation_profile", profile_id)
    db.commit()
