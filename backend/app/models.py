"""Relational schema for ASTRA.

Grouped by owner:
    platform     users, audit log, system configuration
    physical     sensors, versions, custom field definitions, simulation profiles, failure signatures
    medical      conditions, symptoms, indicators, warning rules, recommendations, sources, datasets, astronauts
    mission      waypoints, scenarios, sessions, events, telemetry, warnings, viewer tokens, chat

Timestamps are stored as naive UTC so behaviour is identical on SQLite and PostgreSQL.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Table,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


ROLES = ("admin", "physical", "medical", "operator", "viewer")
SENSOR_CATEGORIES = ("physiological", "spacesuit", "environmental")
SENSOR_STATUSES = ("draft", "active", "archived")
SESSION_STATUSES = ("planned", "running", "paused", "completed", "stopped", "aborted")


# ------------------------------------------------------------------ platform
class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(60), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(120), default="")
    role: Mapped[str] = mapped_column(String(20), index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    ts: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    user_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    username: Mapped[str] = mapped_column(String(60), default="system")
    role: Mapped[str] = mapped_column(String(20), default="system")
    action: Mapped[str] = mapped_column(String(60), index=True)
    entity_type: Mapped[str] = mapped_column(String(60), default="")
    entity_id: Mapped[str] = mapped_column(String(80), default="")
    detail: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class SystemConfig(Base):
    __tablename__ = "system_config"

    key: Mapped[str] = mapped_column(String(60), primary_key=True)
    value: Mapped[Any] = mapped_column(JSON)
    description: Mapped[str] = mapped_column(String(300), default="")
    updated_by: Mapped[str] = mapped_column(String(60), default="system")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


# ------------------------------------------------------------------ physical
class Sensor(Base):
    __tablename__ = "sensors"

    id: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(60), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    category: Mapped[str] = mapped_column(String(40), index=True)
    sensor_family: Mapped[str] = mapped_column(String(60), default="generic")
    manufacturer: Mapped[str] = mapped_column(String(120), default="")
    model_number: Mapped[str] = mapped_column(String(80), default="")
    tags: Mapped[list[str]] = mapped_column(JSON, default=list)
    unit: Mapped[str] = mapped_column(String(30), default="")
    channel: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    description: Mapped[str] = mapped_column(Text, default="")
    min_valid: Mapped[float] = mapped_column(Float)
    max_valid: Mapped[float] = mapped_column(Float)
    accuracy: Mapped[float] = mapped_column(Float, default=0.0)
    max_rate_per_min: Mapped[float] = mapped_column(Float, default=0.0)
    resolution: Mapped[float] = mapped_column(Float, default=0.0)
    status: Mapped[str] = mapped_column(String(20), default="draft", index=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    technical_specs: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    custom_fields: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)
    updated_by: Mapped[str] = mapped_column(String(60), default="system")

    profiles: Mapped[list["SimulationProfile"]] = relationship(
        back_populates="sensor", cascade="all, delete-orphan", order_by="SimulationProfile.id"
    )
    versions: Mapped[list["SensorVersion"]] = relationship(
        back_populates="sensor", cascade="all, delete-orphan", order_by="SensorVersion.version.desc()"
    )


class SensorVersion(Base):
    __tablename__ = "sensor_versions"
    __table_args__ = (UniqueConstraint("sensor_id", "version"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    sensor_id: Mapped[int] = mapped_column(ForeignKey("sensors.id", ondelete="CASCADE"), index=True)
    version: Mapped[int] = mapped_column(Integer)
    snapshot: Mapped[dict[str, Any]] = mapped_column(JSON)
    change_note: Mapped[str] = mapped_column(String(300), default="")
    changed_by: Mapped[str] = mapped_column(String(60), default="system")
    changed_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    sensor: Mapped[Sensor] = relationship(back_populates="versions")


class CustomFieldDef(Base):
    __tablename__ = "custom_field_defs"

    id: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(60), unique=True)
    label: Mapped[str] = mapped_column(String(120))
    data_type: Mapped[str] = mapped_column(String(20))        # string | number | boolean | enum
    options: Mapped[list[str]] = mapped_column(JSON, default=list)
    required: Mapped[bool] = mapped_column(Boolean, default=False)
    category: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # None = all
    unit: Mapped[str] = mapped_column(String(30), default="")
    description: Mapped[str] = mapped_column(String(300), default="")


class SimulationProfile(Base):
    __tablename__ = "simulation_profiles"
    __table_args__ = (UniqueConstraint("sensor_id", "name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    sensor_id: Mapped[int] = mapped_column(ForeignKey("sensors.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(80), default="nominal")
    is_default: Mapped[bool] = mapped_column(Boolean, default=True)
    baseline: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    bias: Mapped[float] = mapped_column(Float, default=0.0)
    noise_std: Mapped[float] = mapped_column(Float, default=0.0)
    drift_per_min: Mapped[float] = mapped_column(Float, default=0.0)
    spike_probability: Mapped[float] = mapped_column(Float, default=0.0)
    spike_magnitude: Mapped[float] = mapped_column(Float, default=0.0)
    stuck_probability: Mapped[float] = mapped_column(Float, default=0.0)
    stuck_duration_s: Mapped[float] = mapped_column(Float, default=10.0)
    dropout_probability: Mapped[float] = mapped_column(Float, default=0.0)
    dropout_duration_s: Mapped[float] = mapped_column(Float, default=5.0)
    notes: Mapped[str] = mapped_column(String(300), default="")

    sensor: Mapped[Sensor] = relationship(back_populates="profiles")


class FailureSignature(Base):
    __tablename__ = "failure_signatures"

    id: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(60), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    fault_type: Mapped[str] = mapped_column(String(20))       # one of astra_sim.FAULT_TYPES
    description: Mapped[str] = mapped_column(Text, default="")
    default_magnitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    default_duration_s: Mapped[float] = mapped_column(Float, default=20.0)
    expected_flag: Mapped[str] = mapped_column(String(40), default="")
    keywords: Mapped[list[str]] = mapped_column(JSON, default=list)


# ------------------------------------------------------------------- medical
condition_symptoms = Table(
    "condition_symptoms",
    Base.metadata,
    Column("condition_id", ForeignKey("medical_conditions.id", ondelete="CASCADE"), primary_key=True),
    Column("symptom_id", ForeignKey("symptoms.id", ondelete="CASCADE"), primary_key=True),
)

condition_sources = Table(
    "condition_sources",
    Base.metadata,
    Column("condition_id", ForeignKey("medical_conditions.id", ondelete="CASCADE"), primary_key=True),
    Column("source_id", ForeignKey("scientific_sources.id", ondelete="CASCADE"), primary_key=True),
)


class Symptom(Base):
    __tablename__ = "symptoms"

    id: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(60), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(String(400), default="")


class MedicalCondition(Base):
    __tablename__ = "medical_conditions"

    id: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(60), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text, default="")
    hrp_risk: Mapped[str] = mapped_column(String(300), default="")
    mechanism: Mapped[str] = mapped_column(Text, default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)
    updated_by: Mapped[str] = mapped_column(String(60), default="system")

    symptoms: Mapped[list[Symptom]] = relationship(secondary=condition_symptoms, order_by="Symptom.name")
    sources: Mapped[list["ScientificSource"]] = relationship(
        secondary=condition_sources, order_by="ScientificSource.title"
    )
    indicators: Mapped[list["ConditionIndicator"]] = relationship(
        back_populates="condition", cascade="all, delete-orphan", order_by="ConditionIndicator.id"
    )
    rules: Mapped[list["WarningRule"]] = relationship(back_populates="condition")
    recommendations: Mapped[list["Recommendation"]] = relationship(
        back_populates="condition", cascade="all, delete-orphan", order_by="Recommendation.priority"
    )


class ConditionIndicator(Base):
    __tablename__ = "condition_indicators"

    id: Mapped[int] = mapped_column(primary_key=True)
    condition_id: Mapped[int] = mapped_column(
        ForeignKey("medical_conditions.id", ondelete="CASCADE"), index=True
    )
    sensor_key: Mapped[str] = mapped_column(String(60))
    direction: Mapped[str] = mapped_column(String(20))      # rising | falling | high | low
    note: Mapped[str] = mapped_column(String(300), default="")

    condition: Mapped[MedicalCondition] = relationship(back_populates="indicators")


class WarningRule(Base):
    __tablename__ = "warning_rules"

    id: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(60), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(160))
    condition_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("medical_conditions.id", ondelete="SET NULL"), nullable=True
    )
    severity: Mapped[str] = mapped_column(String(20), default="caution")
    logic: Mapped[str] = mapped_column(String(5), default="all")
    clauses: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    sustain_s: Mapped[float] = mapped_column(Float, default=10.0)
    clear_after_s: Mapped[float] = mapped_column(Float, default=30.0)
    require_good_quality: Mapped[bool] = mapped_column(Boolean, default=True)
    message: Mapped[str] = mapped_column(String(400), default="")
    rationale: Mapped[str] = mapped_column(Text, default="")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)
    updated_by: Mapped[str] = mapped_column(String(60), default="system")

    condition: Mapped[Optional[MedicalCondition]] = relationship(back_populates="rules")


class Recommendation(Base):
    __tablename__ = "recommendations"

    id: Mapped[int] = mapped_column(primary_key=True)
    condition_id: Mapped[int] = mapped_column(
        ForeignKey("medical_conditions.id", ondelete="CASCADE"), index=True
    )
    audience: Mapped[str] = mapped_column(String(20), default="astronaut")  # astronaut | flight_surgeon
    priority: Mapped[int] = mapped_column(Integer, default=1)
    text: Mapped[str] = mapped_column(String(500))

    condition: Mapped[MedicalCondition] = relationship(back_populates="recommendations")


class ScientificSource(Base):
    __tablename__ = "scientific_sources"

    id: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(60), unique=True)
    title: Mapped[str] = mapped_column(String(300))
    organization: Mapped[str] = mapped_column(String(160), default="")
    url: Mapped[str] = mapped_column(String(500), default="")
    source_type: Mapped[str] = mapped_column(String(30), default="reference")
    citation: Mapped[str] = mapped_column(Text, default="")
    notes: Mapped[str] = mapped_column(Text, default="")

    datasets: Mapped[list["Dataset"]] = relationship(back_populates="source")


class Dataset(Base):
    __tablename__ = "datasets"

    id: Mapped[int] = mapped_column(primary_key=True)
    source_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("scientific_sources.id", ondelete="SET NULL"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    file_format: Mapped[str] = mapped_column(String(10))
    original_filename: Mapped[str] = mapped_column(String(255), default="")
    checksum_sha256: Mapped[str] = mapped_column(String(64), default="")
    record_count: Mapped[int] = mapped_column(Integer, default=0)
    columns: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    sample_rows: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    is_synthetic: Mapped[bool] = mapped_column(Boolean, default=False)
    imported_by: Mapped[str] = mapped_column(String(60), default="system")
    imported_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    source: Mapped[Optional[ScientificSource]] = relationship(back_populates="datasets")


class AstronautProfile(Base):
    __tablename__ = "astronaut_profiles"

    id: Mapped[int] = mapped_column(primary_key=True)
    callsign: Mapped[str] = mapped_column(String(40), unique=True)
    full_name: Mapped[str] = mapped_column(String(120))
    age: Mapped[int] = mapped_column(Integer)
    sex: Mapped[str] = mapped_column(String(10), default="")
    mass_kg: Mapped[float] = mapped_column(Float)
    height_cm: Mapped[float] = mapped_column(Float)
    resting_hr: Mapped[float] = mapped_column(Float)
    baseline_core_temp_c: Mapped[float] = mapped_column(Float, default=37.0)
    vo2max: Mapped[float] = mapped_column(Float, default=45.0)
    health_history: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    notes: Mapped[str] = mapped_column(Text, default="")
    is_synthetic: Mapped[bool] = mapped_column(Boolean, default=True)


# ------------------------------------------------------------------- mission
class Waypoint(Base):
    __tablename__ = "waypoints"

    id: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(60), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    kind: Mapped[str] = mapped_column(String(20), default="route")  # route | sample_site | poi
    x: Mapped[float] = mapped_column(Float)   # metres east of the landing site
    y: Mapped[float] = mapped_column(Float)   # metres north of the landing site
    route_order: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    description: Mapped[str] = mapped_column(String(300), default="")


class Scenario(Base):
    __tablename__ = "scenarios"

    id: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(60), unique=True)
    name: Mapped[str] = mapped_column(String(160))
    prompt: Mapped[str] = mapped_column(Text)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)


class SimSession(Base):
    __tablename__ = "sim_sessions"

    id: Mapped[str] = mapped_column(String(16), primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    prompt: Mapped[str] = mapped_column(Text, default="")
    plan: Mapped[dict[str, Any]] = mapped_column(JSON)
    plan_source: Mapped[str] = mapped_column(String(40), default="deterministic")
    planner_notes: Mapped[list[str]] = mapped_column(JSON, default=list)
    # Frozen copy of everything the engine needs (sensors, profiles, rules, world,
    # astronaut). Restart replays this snapshot, so later registry edits cannot
    # change an existing session.
    config_snapshot: Mapped[dict[str, Any]] = mapped_column(JSON)
    seed: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default="planned", index=True)
    speed: Mapped[float] = mapped_column(Float, default=1.0)
    run: Mapped[int] = mapped_column(Integer, default=0)
    sim_time: Mapped[float] = mapped_column(Float, default=0.0)
    duration_s: Mapped[float] = mapped_column(Float, default=0.0)
    astronaut_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("astronaut_profiles.id", ondelete="SET NULL"), nullable=True
    )
    created_by: Mapped[str] = mapped_column(String(60), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    end_reason: Mapped[str] = mapped_column(String(200), default="")


class SessionEvent(Base):
    __tablename__ = "session_events"
    __table_args__ = (Index("ix_session_events_lookup", "session_id", "run", "sim_time"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[str] = mapped_column(ForeignKey("sim_sessions.id", ondelete="CASCADE"))
    run: Mapped[int] = mapped_column(Integer)
    sim_time: Mapped[float] = mapped_column(Float)
    type: Mapped[str] = mapped_column(String(40))
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class TelemetryFrame(Base):
    """One persisted frame per simulated second (sensor output + ground truth)."""

    __tablename__ = "telemetry_frames"
    __table_args__ = (Index("ix_telemetry_lookup", "session_id", "run", "sim_time"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[str] = mapped_column(ForeignKey("sim_sessions.id", ondelete="CASCADE"))
    run: Mapped[int] = mapped_column(Integer)
    sim_time: Mapped[float] = mapped_column(Float)
    data: Mapped[dict[str, Any]] = mapped_column(JSON)


class WarningRecord(Base):
    __tablename__ = "warning_records"
    __table_args__ = (
        UniqueConstraint("session_id", "run", "uid"),
        Index("ix_warning_lookup", "session_id", "run"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[str] = mapped_column(ForeignKey("sim_sessions.id", ondelete="CASCADE"))
    run: Mapped[int] = mapped_column(Integer)
    uid: Mapped[str] = mapped_column(String(120))
    kind: Mapped[str] = mapped_column(String(20))            # medical | data_quality
    key: Mapped[str] = mapped_column(String(60))
    sensor_key: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    severity: Mapped[str] = mapped_column(String(20))
    message: Mapped[str] = mapped_column(String(500))
    raised_at: Mapped[float] = mapped_column(Float)
    cleared_at: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    detail: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class ViewerToken(Base):
    __tablename__ = "viewer_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[str] = mapped_column(
        ForeignKey("sim_sessions.id", ondelete="CASCADE"), index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    label: Mapped[str] = mapped_column(String(80), default="")
    created_by: Mapped[str] = mapped_column(String(60))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    last_used_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    use_count: Mapped[int] = mapped_column(Integer, default=0)


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[str] = mapped_column(
        ForeignKey("sim_sessions.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[str] = mapped_column(String(12))            # user | assistant
    author: Mapped[str] = mapped_column(String(60), default="")
    content: Mapped[str] = mapped_column(Text)
    provider: Mapped[str] = mapped_column(String(60), default="")
    sim_time: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
