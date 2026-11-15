"""Medical Team: conditions, symptoms, indicators, warning rules, recommendations,
scientific sources, dataset metadata imports and synthetic astronaut profiles."""
from __future__ import annotations

import csv
import hashlib
import io
import json
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..audit import audit
from ..db import get_db
from ..models import (
    AstronautProfile,
    ConditionIndicator,
    Dataset,
    MedicalCondition,
    Recommendation,
    ScientificSource,
    Sensor,
    Symptom,
    User,
    WarningRule,
)
from ..schemas import (
    AstronautIn,
    AstronautOut,
    ConditionIn,
    ConditionOut,
    DatasetOut,
    RecommendationIn,
    RecommendationOut,
    RuleIn,
    RuleOut,
    SourceIn,
    SourceOut,
    SymptomIn,
    SymptomOut,
)
from ..security import require_roles
from .common import CATALOG_READ, MEDICAL_WRITE, commit_or_409, get_or_404, register_crud

router = APIRouter(tags=["medical"])
reader = require_roles(*CATALOG_READ)
writer = require_roles(*MEDICAL_WRITE)

MAX_DATASET_BYTES = 5 * 1024 * 1024


def _unknown_sensors(db: Session, keys: set[str]) -> list[str]:
    known = set(db.scalars(select(Sensor.key)))
    return sorted(keys - known)


# ------------------------------------------------- simple catalogues (CRUD)
register_crud(router, "/symptoms", Symptom, SymptomIn, SymptomOut, entity="symptom",
              read_roles=CATALOG_READ, write_roles=MEDICAL_WRITE, order_by=Symptom.name)

register_crud(router, "/sources", ScientificSource, SourceIn, SourceOut, entity="source",
              read_roles=CATALOG_READ, write_roles=MEDICAL_WRITE, order_by=ScientificSource.id)


def _recommendation_values(db: Session, payload: BaseModel, existing: Optional[Any]) -> dict:
    get_or_404(db, MedicalCondition, payload.condition_id, "Condition")  # type: ignore[attr-defined]
    return payload.model_dump()


register_crud(router, "/recommendations", Recommendation, RecommendationIn, RecommendationOut,
              entity="recommendation", read_roles=CATALOG_READ, write_roles=MEDICAL_WRITE,
              order_by=Recommendation.id, validate=_recommendation_values)


def _astronaut_values(db: Session, payload: BaseModel, existing: Optional[Any]) -> dict:
    data = payload.model_dump()
    data["is_synthetic"] = True      # ASTRA never stores real astronaut health data
    return data


register_crud(router, "/astronauts", AstronautProfile, AstronautIn, AstronautOut, entity="astronaut",
              read_roles=CATALOG_READ, write_roles=MEDICAL_WRITE, order_by=AstronautProfile.id,
              validate=_astronaut_values)


# ---------------------------------------------------------------- conditions
_CONDITION_LOAD = (
    selectinload(MedicalCondition.symptoms), selectinload(MedicalCondition.sources),
    selectinload(MedicalCondition.indicators), selectinload(MedicalCondition.recommendations),
    selectinload(MedicalCondition.rules),
)


def _condition(db: Session, condition_id: int) -> MedicalCondition:
    cond = db.scalar(select(MedicalCondition).where(MedicalCondition.id == condition_id)
                     .options(*_CONDITION_LOAD))
    if cond is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Condition not found")
    return cond


def _apply_condition(db: Session, cond: MedicalCondition, payload: ConditionIn, user: User) -> None:
    unknown = _unknown_sensors(db, {i.sensor_key for i in payload.indicators})
    if unknown:
        raise HTTPException(422,
                            f"Indicators reference unknown sensors: {', '.join(unknown)}")
    symptoms = list(db.scalars(select(Symptom).where(Symptom.id.in_(payload.symptom_ids)))) \
        if payload.symptom_ids else []
    sources = list(db.scalars(select(ScientificSource).where(ScientificSource.id.in_(payload.source_ids)))) \
        if payload.source_ids else []
    if len(symptoms) != len(set(payload.symptom_ids)) or len(sources) != len(set(payload.source_ids)):
        raise HTTPException(422, "Unknown symptom or source id")
    for field in ("key", "name", "description", "hrp_risk", "mechanism"):
        setattr(cond, field, getattr(payload, field))
    cond.symptoms = symptoms
    cond.sources = sources
    cond.indicators = [ConditionIndicator(**i.model_dump()) for i in payload.indicators]
    cond.updated_by = user.username


@router.get("/conditions", response_model=list[ConditionOut])
def list_conditions(db: Session = Depends(get_db), _: User = Depends(reader)):
    return list(db.scalars(select(MedicalCondition).options(*_CONDITION_LOAD).order_by(MedicalCondition.id)))


@router.post("/conditions", response_model=ConditionOut, status_code=201)
def create_condition(payload: ConditionIn, db: Session = Depends(get_db), user: User = Depends(writer)):
    if db.scalar(select(MedicalCondition).where(MedicalCondition.key == payload.key)):
        raise HTTPException(status.HTTP_409_CONFLICT, f"Condition key '{payload.key}' already exists")
    cond = MedicalCondition()
    _apply_condition(db, cond, payload, user)
    db.add(cond)
    db.flush()
    audit(db, user, "condition.create", "condition", cond.id, {"key": cond.key})
    commit_or_409(db, "Condition")
    return _condition(db, cond.id)


@router.put("/conditions/{condition_id}", response_model=ConditionOut)
def update_condition(condition_id: int, payload: ConditionIn, db: Session = Depends(get_db),
                     user: User = Depends(writer)):
    cond = _condition(db, condition_id)
    _apply_condition(db, cond, payload, user)
    audit(db, user, "condition.update", "condition", cond.id, {"key": cond.key})
    commit_or_409(db, "Condition")
    db.expire_all()
    return _condition(db, condition_id)


@router.delete("/conditions/{condition_id}", status_code=204)
def delete_condition(condition_id: int, db: Session = Depends(get_db), user: User = Depends(writer)):
    cond = _condition(db, condition_id)
    for rule in cond.rules:
        rule.condition_id = None
    db.delete(cond)
    audit(db, user, "condition.delete", "condition", condition_id, {"key": cond.key})
    db.commit()


# --------------------------------------------------------------------- rules
def _check_rule(db: Session, payload: RuleIn) -> None:
    unknown = _unknown_sensors(db, {c.sensor_key for c in payload.clauses})
    if unknown:
        raise HTTPException(422,
                            f"Rule references unknown sensors: {', '.join(unknown)}")
    if payload.condition_id is not None:
        get_or_404(db, MedicalCondition, payload.condition_id, "Condition")


@router.get("/rules", response_model=list[RuleOut])
def list_rules(db: Session = Depends(get_db), _: User = Depends(reader)):
    return list(db.scalars(select(WarningRule).order_by(WarningRule.id)))


@router.post("/rules", response_model=RuleOut, status_code=201)
def create_rule(payload: RuleIn, db: Session = Depends(get_db), user: User = Depends(writer)):
    _check_rule(db, payload)
    if db.scalar(select(WarningRule).where(WarningRule.key == payload.key)):
        raise HTTPException(status.HTTP_409_CONFLICT, f"Rule key '{payload.key}' already exists")
    rule = WarningRule(**payload.model_dump(), updated_by=user.username)
    db.add(rule)
    db.flush()
    audit(db, user, "rule.create", "warning_rule", rule.id, {"key": rule.key})
    commit_or_409(db, "Rule")
    return rule


@router.put("/rules/{rule_id}", response_model=RuleOut)
def update_rule(rule_id: int, payload: RuleIn, db: Session = Depends(get_db), user: User = Depends(writer)):
    rule = get_or_404(db, WarningRule, rule_id, "Rule")
    _check_rule(db, payload)
    for key, value in payload.model_dump().items():
        setattr(rule, key, value)
    rule.version += 1
    rule.updated_by = user.username
    audit(db, user, "rule.update", "warning_rule", rule.id, {"key": rule.key, "version": rule.version})
    commit_or_409(db, "Rule")
    return rule


@router.delete("/rules/{rule_id}", status_code=204)
def delete_rule(rule_id: int, db: Session = Depends(get_db), user: User = Depends(writer)):
    rule = get_or_404(db, WarningRule, rule_id, "Rule")
    db.delete(rule)
    audit(db, user, "rule.delete", "warning_rule", rule_id, {"key": rule.key})
    db.commit()


# ------------------------------------------------------------------ datasets
def _infer_type(values: list[Any]) -> str:
    kinds = set()
    for v in values:
        if v is None or v == "":
            continue
        if isinstance(v, bool):
            kinds.add("boolean")
        elif isinstance(v, (int, float)):
            kinds.add("number")
        elif isinstance(v, str):
            try:
                float(v)
                kinds.add("number")
            except ValueError:
                kinds.add("boolean" if v.strip().lower() in ("true", "false") else "string")
        else:
            kinds.add("object")
    if not kinds:
        return "empty"
    return kinds.pop() if len(kinds) == 1 else "mixed"


def _parse_dataset(raw: bytes, filename: str) -> tuple[str, list[dict]]:
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise HTTPException(422, "File must be UTF-8 text") from exc
    lower = filename.lower()
    if lower.endswith(".json"):
        try:
            data = json.loads(text)
        except json.JSONDecodeError as exc:
            raise HTTPException(422, f"Invalid JSON: {exc.msg}") from exc
        if isinstance(data, dict):
            data = next((v for v in data.values() if isinstance(v, list)), [data])
        if not isinstance(data, list) or not all(isinstance(r, dict) for r in data):
            raise HTTPException(422,
                                "JSON must be an array of objects (or an object containing one)")
        return "json", data
    if lower.endswith(".csv"):
        try:
            dialect = csv.Sniffer().sniff(text[:4096], delimiters=",;\t")
        except csv.Error:
            dialect = csv.excel
        reader_ = csv.DictReader(io.StringIO(text), dialect=dialect)
        if not reader_.fieldnames:
            raise HTTPException(422, "CSV has no header row")
        return "csv", [dict(row) for row in reader_]
    raise HTTPException(422, "Only .csv and .json files are supported")


@router.get("/datasets", response_model=list[DatasetOut])
def list_datasets(db: Session = Depends(get_db), _: User = Depends(reader)):
    return list(db.scalars(select(Dataset).order_by(Dataset.id.desc())))


@router.post("/datasets", response_model=DatasetOut, status_code=201)
async def import_dataset(
    file: UploadFile = File(...),
    name: str = Form(..., min_length=1, max_length=200),
    description: str = Form("", max_length=2000),
    source_id: Optional[int] = Form(None),
    is_synthetic: bool = Form(False),
    db: Session = Depends(get_db),
    user: User = Depends(writer),
):
    """Import dataset *metadata*: schema, row count, checksum and a 5-row sample."""
    raw = await file.read(MAX_DATASET_BYTES + 1)
    if len(raw) > MAX_DATASET_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "File is larger than 5 MB")
    if not raw:
        raise HTTPException(422, "File is empty")
    if source_id is not None:
        get_or_404(db, ScientificSource, source_id, "Source")
    fmt, rows = _parse_dataset(raw, file.filename or "")
    names: list[str] = []
    for row in rows[:2000]:
        for key in row:
            if key not in names:
                names.append(str(key))
    columns = [
        {"name": n, "type": _infer_type([r.get(n) for r in rows[:500]]),
         "non_null": sum(1 for r in rows if r.get(n) not in (None, ""))}
        for n in names[:200]
    ]
    dataset = Dataset(
        source_id=source_id, name=name.strip(), description=description.strip(), file_format=fmt,
        original_filename=(file.filename or "")[:255], checksum_sha256=hashlib.sha256(raw).hexdigest(),
        record_count=len(rows), columns=columns,
        sample_rows=json.loads(json.dumps(rows[:5], default=str)),
        is_synthetic=is_synthetic, imported_by=user.username,
    )
    db.add(dataset)
    db.flush()
    audit(db, user, "dataset.import", "dataset", dataset.id,
          {"name": dataset.name, "records": dataset.record_count, "format": fmt})
    db.commit()
    return dataset


@router.delete("/datasets/{dataset_id}", status_code=204)
def delete_dataset(dataset_id: int, db: Session = Depends(get_db), user: User = Depends(writer)):
    dataset = get_or_404(db, Dataset, dataset_id, "Dataset")
    db.delete(dataset)
    audit(db, user, "dataset.delete", "dataset", dataset_id, {"name": dataset.name})
    db.commit()


# ------------------------------------------------------------------ ML Decision Engine
@router.get("/ml-model")
@router.get("/medical/ml-model")
def get_ml_model_status():
    """Return status and performance metrics of the ASTRA Medical ML engine."""
    from ..services.ml_medical import get_medical_ml_engine
    ml = get_medical_ml_engine()
    return {
        "trained": ml.is_trained,
        "accuracy": ml.accuracy,
        "n_trees": len(ml.trees),
        "feature_importances": ml.feature_importances,
        "feature_names": ml.feature_names,
    }


@router.post("/ml-retrain")
@router.post("/medical/ml-retrain")
def retrain_ml_model(_: User = Depends(writer)):
    """Retrain the Medical ML Random Forest on the latest telemetry dataset."""
    from ..services.ml_medical import get_medical_ml_engine
    ml = get_medical_ml_engine()
    res = ml.train_from_csv()
    return res


@router.post("/ml-triage")
@router.post("/medical/ml-triage")
def perform_ml_triage(payload: dict[str, Any]):
    """Evaluate real-time vital signs and TDL trust scores through the ML Decision Engine."""
    from ..services.ml_medical import get_medical_ml_engine
    ml = get_medical_ml_engine()
    features = payload.get("features", payload)
    comm_loss = bool(payload.get("comm_loss", False))
    lang = str(payload.get("lang", "en"))
    return ml.predict_triage(features, comm_loss=comm_loss, lang=lang)


@router.get("/instruments")
@router.get("/medical/instruments")
def get_instruments():
    """Return NASA instrument registry with calibration and maintenance histories."""
    from ..services.ml_medical import get_instrument_registry, get_instrument_warnings
    return {
        "instruments": get_instrument_registry(),
        "warnings": get_instrument_warnings(),
    }


@router.post("/pre-sim-risk")
@router.post("/medical/pre-sim-risk")
def calculate_pre_sim_risk(payload: dict[str, Any]):
    """Calculate predictive medical risk before starting Mars surface EVA walk."""
    from ..services.ml_medical import predict_pre_simulation
    astronaut = payload.get("astronaut", {})
    eva_hours = float(payload.get("planned_eva_hours", payload.get("eva_duration_hours", 6.0)))
    metabolic_w = float(payload.get("expected_metabolic_watts", 350.0))
    lang = str(payload.get("lang", "en"))
    return predict_pre_simulation(astronaut, planned_eva_hours=eva_hours, expected_metabolic_watts=metabolic_w, lang=lang)


