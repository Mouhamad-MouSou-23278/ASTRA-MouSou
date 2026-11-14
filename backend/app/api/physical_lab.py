"""Physical Sensor Engineering & Simulation Laboratory API routes.

Provides:
- Complete engineering state (I/O contracts, 3D placement, physics models, error models)
- Benchmark simulation execution & Trusted Data Layer evaluation
- Sensor import and export (JSON & CSV)
- Physical AI Agent chat and approved proposal execution
"""
from __future__ import annotations

import csv
import io
import json
import math
import random
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from astra_sim import CHANNELS
from astra_sim.error_models import apply_error_pipeline, list_available_error_models
from astra_sim.physics_models import get_physics_model, list_physics_models
from astra_sim.tdl import compute_benchmark_metrics, compute_instantaneous_trust
from astra_sim.util import stable_rng

from ..audit import audit
from ..db import get_db
from ..models import Sensor, SensorVersion, SimulationProfile, User
from ..schemas_lab import (
    AgentChatRequest,
    AgentChatResponse,
    ApproveProposalRequest,
    BenchmarkPoint,
    BenchmarkRequest,
    BenchmarkResult,
    SensorLabUpdate,
)
from ..security import require_roles
from ..seed import sensor_snapshot
from ..services.physical_agent import PhysicalAIAgent
from .common import CATALOG_READ, PHYSICAL_WRITE, commit_or_409, get_or_404

router = APIRouter(prefix="/physical-lab", tags=["physical-lab"])
reader = require_roles(*CATALOG_READ)
writer = require_roles(*PHYSICAL_WRITE)


def _load_sensor(db: Session, sensor_id: int) -> Sensor:
    sensor = db.scalar(
        select(Sensor)
        .where(Sensor.id == sensor_id)
        .options(selectinload(Sensor.profiles))
    )
    if sensor is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sensor not found")
    return sensor


# --------------------------------------------------- Sensor Lab Configuration
@router.get("/sensors/{sensor_id}/details")
def get_sensor_lab_details(
    sensor_id: int, db: Session = Depends(get_db), _: User = Depends(reader)
):
    s = _load_sensor(db, sensor_id)
    return {
        "id": s.id,
        "key": s.key,
        "name": s.name,
        "category": s.category,
        "sensor_family": s.sensor_family,
        "manufacturer": s.manufacturer,
        "model_number": s.model_number,
        "tags": s.tags or [],
        "unit": s.unit,
        "channel": s.channel,
        "min_valid": s.min_valid,
        "max_valid": s.max_valid,
        "accuracy": s.accuracy,
        "max_rate_per_min": s.max_rate_per_min,
        "resolution": s.resolution,
        "status": s.status,
        "version": s.version,
        "technical_specs": s.technical_specs or {},
        "io_contract": s.io_contract or {"inputs": [], "outputs": []},
        "placement_data": s.placement_data
        or {
            "parent_body": "astronaut_torso",
            "mount_point": "chest_center",
            "pos_x": 0.0,
            "pos_y": 0.0,
            "pos_z": 0.0,
            "rot_x": 0.0,
            "rot_y": 0.0,
            "rot_z": 0.0,
            "scale": 1.0,
            "asset_type": "primitive",
            "primitive_shape": "cylinder",
            "color_hex": "#3a86ff",
            "dimensions_mm": [20.0, 20.0, 10.0],
        },
        "physics_config": s.physics_config
        or {
            "model_key": "rtd_temperature",
            "model_version": "1.0",
            "parameters": {},
            "enabled": True,
        },
        "error_configs": s.error_configs or [],
        "environmental_sensitivities": s.environmental_sensitivities or [],
        "custom_fields": s.custom_fields or {},
        "updated_at": s.updated_at.isoformat() + "Z",
        "updated_by": s.updated_by,
        "profiles": [
            {"id": p.id, "name": p.name, "is_default": p.is_default, "noise_std": p.noise_std}
            for p in s.profiles
        ],
    }


@router.put("/sensors/{sensor_id}/details")
def update_sensor_lab_details(
    sensor_id: int,
    payload: SensorLabUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(writer),
):
    s = _load_sensor(db, sensor_id)
    if s.status == "archived":
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Archived sensors are read-only; return to draft first",
        )

    if payload.io_contract is not None:
        s.io_contract = payload.io_contract.model_dump()
    if payload.placement_data is not None:
        s.placement_data = payload.placement_data.model_dump()
    if payload.physics_config is not None:
        s.physics_config = payload.physics_config.model_dump()
    if payload.error_configs is not None:
        s.error_configs = [e.model_dump() for e in payload.error_configs]
    if payload.environmental_sensitivities is not None:
        s.environmental_sensitivities = [
            es.model_dump() for es in payload.environmental_sensitivities
        ]

    s.version += 1
    s.updated_by = user.username
    db.add(
        SensorVersion(
            sensor_id=s.id,
            version=s.version,
            snapshot=sensor_snapshot(s),
            change_note=payload.change_note or "Updated laboratory parameters",
            changed_by=user.username,
        )
    )
    audit(
        db,
        user,
        "sensor.lab_update",
        "sensor",
        s.id,
        {"key": s.key, "version": s.version},
    )
    commit_or_409(db, "Sensor")
    return get_sensor_lab_details(s.id, db, user)


# --------------------------------------------- Benchmark & Trusted Data Layer
@router.post("/sensors/{sensor_id}/benchmark", response_model=BenchmarkResult)
def run_sensor_benchmark(
    sensor_id: int,
    req: BenchmarkRequest,
    db: Session = Depends(get_db),
    _: User = Depends(reader),
):
    s = _load_sensor(db, sensor_id)
    rng = stable_rng(req.seed, f"benchmark:{s.key}")

    # Determine baseline ground-truth target
    channel_key = s.channel
    base_val = (
        37.0
        if "temp" in s.key
        else (
            34.0
            if "press" in s.key
            else (
                75.0
                if "heart" in s.key
                else (98.0 if "spo2" in s.key else (s.min_valid + s.max_valid) / 2.0)
            )
        )
    )

    # Active physics model
    p_cfg = s.physics_config or {}
    model_key = p_cfg.get("model_key", "rtd_temperature")
    model = (
        get_physics_model(model_key) if p_cfg.get("enabled", True) else None
    )
    model_params = p_cfg.get("parameters", {})
    physics_state: dict[str, Any] = {}

    # Active error models
    error_configs = s.error_configs or []
    if not error_configs:
        # Default nominal error from datasheet accuracy
        error_configs = [
            {
                "error_type": "gaussian_noise",
                "enabled": True,
                "parameters": {"noise_std": max(s.accuracy, 1e-4)},
            }
        ]

    error_state: dict[str, Any] = {}
    points: list[BenchmarkPoint] = []
    t = 0.0
    steps = int(req.duration_s / req.dt)

    for i in range(steps):
        # Ground-truth variation with small plausible excursion
        wobble = 0.5 * math.sin(t * 0.2) + 0.2 * math.cos(t * 0.7)
        ground_truth = base_val + wobble

        # 1. Physics Transducer Model evaluation
        if model:
            phys_inputs = {
                "temperature": ground_truth,
                "pressure": ground_truth,
                "dose_rate": req.radiation_dose_rate_usv_h,
            }
            phys_out, physics_state = model.evaluate(
                phys_inputs, model_params, req.dt, physics_state
            )
            # Pick primary reading
            raw_transducer_val = (
                phys_out.get("temperature_c")
                or phys_out.get("pressure_kpa")
                or phys_out.get("dose_rate_usv_h")
                or ground_truth
            )
        else:
            raw_transducer_val = ground_truth

        # 2. Error Model Pipeline
        corrupted_val, active_flags, error_state = apply_error_pipeline(
            raw_transducer_val, t, req.dt, error_configs, error_state, rng
        )

        # 3. Trusted Data Layer Evaluation
        residual, trust_score = compute_instantaneous_trust(
            ground_truth, corrupted_val, max(s.accuracy, 1e-4), active_flags
        )

        points.append(
            BenchmarkPoint(
                t=round(t, 2),
                ground_truth=round(ground_truth, 4),
                raw_observed=(
                    round(corrupted_val, 4) if corrupted_val is not None else None
                ),
                processed_output=(
                    round(corrupted_val, 4) if corrupted_val is not None else None
                ),
                residual=round(residual, 4) if residual is not None else None,
                trust_score=trust_score,
                flags=active_flags,
            )
        )
        t += req.dt

    metrics = compute_benchmark_metrics([p.model_dump() for p in points])
    return BenchmarkResult(
        sensor_key=s.key,
        duration_s=req.duration_s,
        dt=req.dt,
        points=points,
        metrics=metrics,
    )


# -------------------------------------------------- Model & Error Registries
@router.get("/physics-models")
def get_available_physics_models(_: User = Depends(reader)):
    return list_physics_models()


@router.get("/error-models")
def get_available_error_models(_: User = Depends(reader)):
    return list_available_error_models()


# ----------------------------------------------------------- Import / Export
@router.post("/import")
def import_sensors(
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    user: User = Depends(writer),
):
    """Import sensors from structured JSON list or CSV string with dry-run validation."""
    items = payload.get("sensors", [])
    csv_text = payload.get("csv_data")

    if csv_text:
        reader = csv.DictReader(io.StringIO(csv_text.strip()))
        items = list(reader)

    if not items:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "No sensor data found to import"
        )

    dry_run = payload.get("dry_run", False)
    imported = []
    errors = []

    for idx, item in enumerate(items):
        key = item.get("key", "").strip()
        name = item.get("name", "").strip()
        category = item.get("category", "physiological").strip()

        if not key or not name:
            errors.append(f"Row {idx+1}: 'key' and 'name' are mandatory")
            continue

        if db.scalar(select(Sensor).where(Sensor.key == key)):
            errors.append(f"Row {idx+1}: Sensor key '{key}' already exists")
            continue

        try:
            min_val = float(item.get("min_valid", 0.0))
            max_val = float(item.get("max_valid", 100.0))
            if max_val <= min_val:
                errors.append(f"Row {idx+1}: max_valid must be greater than min_valid")
                continue
            accuracy = float(item.get("accuracy", 0.0))
        except ValueError:
            errors.append(f"Row {idx+1}: numeric parsing error for bounds/accuracy")
            continue

        sensor = Sensor(
            key=key,
            name=name,
            category=category,
            sensor_family=item.get("sensor_family", "generic"),
            manufacturer=item.get("manufacturer", ""),
            model_number=item.get("model_number", ""),
            tags=item.get("tags") if isinstance(item.get("tags"), list) else [],
            unit=item.get("unit", ""),
            channel=item.get("channel"),
            min_valid=min_val,
            max_valid=max_val,
            accuracy=accuracy,
            max_rate_per_min=float(item.get("max_rate_per_min", 0.0)),
            resolution=float(item.get("resolution", 0.0)),
            description=item.get("description", ""),
            status="draft",
            version=1,
            technical_specs=item.get("technical_specs", {}),
            io_contract=item.get("io_contract", {"inputs": [], "outputs": []}),
            placement_data=item.get("placement_data", {}),
            physics_config=item.get("physics_config", {}),
            error_configs=item.get("error_configs", []),
            updated_by=user.username,
        )
        sensor.profiles.append(
            SimulationProfile(name="nominal", is_default=True, noise_std=accuracy)
        )
        imported.append(sensor)

    if errors:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, {"errors": errors}
        )

    if not dry_run:
        for s in imported:
            db.add(s)
            db.flush()
            db.add(
                SensorVersion(
                    sensor_id=s.id,
                    version=1,
                    snapshot=sensor_snapshot(s),
                    change_note="Imported via Physical Lab",
                    changed_by=user.username,
                )
            )
        audit(
            db,
            user,
            "sensor.import",
            "sensor",
            "batch",
            {"count": len(imported)},
        )
        db.commit()

    return {
        "status": "success",
        "dry_run": dry_run,
        "count": len(imported),
        "keys": [s.key for s in imported],
    }


@router.get("/export")
def export_sensors(
    export_format: Literal["json", "csv"] = "json",
    category: Optional[str] = None,
    db: Session = Depends(get_db),
    _: User = Depends(reader),
):
    stmt = select(Sensor).order_by(Sensor.category, Sensor.id)
    if category:
        stmt = stmt.where(Sensor.category == category)
    sensors = list(db.scalars(stmt))

    if export_format == "csv":
        output = io.StringIO()
        fieldnames = [
            "key",
            "name",
            "category",
            "sensor_family",
            "manufacturer",
            "model_number",
            "unit",
            "channel",
            "min_valid",
            "max_valid",
            "accuracy",
            "status",
            "version",
        ]
        writer = csv.DictWriter(output, fieldnames=fieldnames)
        writer.writeheader()
        for s in sensors:
            writer.writerow({f: getattr(s, f) for f in fieldnames})
        return {"format": "csv", "data": output.getvalue()}

    # JSON export
    data = []
    for s in sensors:
        snap = sensor_snapshot(s)
        data.append(snap)
    return {"format": "json", "count": len(data), "sensors": data}


# ----------------------------------------------------- Physical AI Agent
@router.post("/agent/chat", response_model=AgentChatResponse)
def physical_agent_chat(
    req: AgentChatRequest,
    db: Session = Depends(get_db),
    user: User = Depends(reader),
):
    agent = PhysicalAIAgent(db, user)
    return agent.process_message(
        req.message, req.context_sensor_key, req.history
    )


@router.post("/agent/approve-proposal")
def physical_agent_approve_proposal(
    req: ApproveProposalRequest,
    db: Session = Depends(get_db),
    user: User = Depends(writer),
):
    agent = PhysicalAIAgent(db, user)
    result = agent.execute_proposal(
        req.tool_name, req.entity_key, req.parameters
    )
    if not result.get("success"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, result.get("message"))
    audit(
        db,
        user,
        "agent.approve_proposal",
        "sensor",
        req.entity_key,
        {"tool": req.tool_name, "proposal_id": req.proposal_id},
    )
    return result
