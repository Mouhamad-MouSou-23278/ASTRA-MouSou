"""Admin: users and roles, system configuration, audit log, global review, emergency stop."""
from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..audit import audit
from ..db import get_db
from ..models import (
    AstronautProfile,
    AuditLog,
    Dataset,
    MedicalCondition,
    ScientificSource,
    Sensor,
    SimSession,
    SystemConfig,
    User,
    ViewerToken,
    WarningRecord,
    WarningRule,
    utcnow,
)
from ..schemas import (
    AuditOut,
    ConfigOut,
    ConfigUpdate,
    EmergencyStopIn,
    LockIn,
    PasswordIn,
    UserCreate,
    UserOut,
    UserUpdate,
)
from ..security import hash_password, require_roles
from ..services import registry
from ..services.runtime import manager
from .common import commit_or_409, get_or_404

router = APIRouter(prefix="/admin", tags=["admin"])
admin_only = require_roles("admin")


# --------------------------------------------------------------------- users
@router.get("/users", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db), _: User = Depends(admin_only)):
    return list(db.scalars(select(User).order_by(User.id)))


@router.post("/users", response_model=UserOut, status_code=201)
def create_user(payload: UserCreate, db: Session = Depends(get_db), admin: User = Depends(admin_only)):
    if db.scalar(select(User).where(User.username == payload.username)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Username already exists")
    user = User(username=payload.username, full_name=payload.full_name, role=payload.role,
                password_hash=hash_password(payload.password))
    db.add(user)
    db.flush()
    audit(db, admin, "user.create", "user", user.id, {"username": user.username, "role": user.role})
    commit_or_409(db, "User")
    return user


def _active_admins(db: Session) -> int:
    return db.scalar(select(func.count()).select_from(User).where(
        User.role == "admin", User.is_active.is_(True))) or 0


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(user_id: int, payload: UserUpdate, db: Session = Depends(get_db),
                admin: User = Depends(admin_only)):
    user = get_or_404(db, User, user_id, "User")
    changes = payload.model_dump(exclude_unset=True, exclude_none=True)
    losing_admin = user.role == "admin" and user.is_active and (
        changes.get("role", "admin") != "admin" or changes.get("is_active") is False)
    if losing_admin and _active_admins(db) <= 1:
        raise HTTPException(status.HTTP_409_CONFLICT, "The last active administrator cannot be removed")
    before = {k: getattr(user, k) for k in changes}
    for key, value in changes.items():
        setattr(user, key, value)
    audit(db, admin, "user.update", "user", user.id, {"before": before, "after": changes})
    db.commit()
    return user


@router.post("/users/{user_id}/reset-password", status_code=204)
def reset_password(user_id: int, payload: PasswordIn, db: Session = Depends(get_db),
                   admin: User = Depends(admin_only)):
    user = get_or_404(db, User, user_id, "User")
    user.password_hash = hash_password(payload.password)
    audit(db, admin, "user.reset_password", "user", user.id)
    db.commit()


# -------------------------------------------------------------------- config
def _validate_config(key: str, value: Any) -> Any:
    def fail(msg: str):
        raise HTTPException(422, f"{key}: {msg}")

    if key == "simulation_lock":
        if not isinstance(value, bool):
            fail("must be true or false")
    elif key in ("viewer_token_ttl_minutes", "telemetry_persist_interval_s", "default_seed"):
        lo, hi = {"viewer_token_ttl_minutes": (1, 1440), "telemetry_persist_interval_s": (1, 10),
                  "default_seed": (0, 2**31 - 1)}[key]
        if isinstance(value, bool) or not isinstance(value, int) or not lo <= value <= hi:
            fail(f"must be an integer between {lo} and {hi}")
    elif key == "default_speed":
        if isinstance(value, bool) or not isinstance(value, (int, float)) or float(value) not in registry.SPEEDS:
            fail(f"must be one of {list(registry.SPEEDS)}")
    elif key == "ai_mode":
        if value not in ("auto", "local_only"):
            fail("must be 'auto' or 'local_only'")
    elif key == "public_base_url":
        if not isinstance(value, str) or len(value) > 200 or (
                value and not value.startswith(("http://", "https://"))):
            fail("must be empty or start with http:// or https://")
        value = value.rstrip("/")
    return value


@router.get("/config", response_model=list[ConfigOut])
def list_config(db: Session = Depends(get_db), _: User = Depends(admin_only)):
    return list(db.scalars(select(SystemConfig).order_by(SystemConfig.key)))


@router.put("/config/{key}", response_model=ConfigOut)
def set_config(key: str, payload: ConfigUpdate, db: Session = Depends(get_db),
               admin: User = Depends(admin_only)):
    row = get_or_404(db, SystemConfig, key, "Config key")
    value = _validate_config(key, payload.value)
    audit(db, admin, "config.update", "config", key, {"before": row.value, "after": value})
    row.value = value
    row.updated_by = admin.username
    row.updated_at = utcnow()
    db.commit()
    return row


# --------------------------------------------------------------------- audit
@router.get("/audit", response_model=list[AuditOut])
def list_audit(
    db: Session = Depends(get_db), _: User = Depends(admin_only),
    limit: int = Query(100, ge=1, le=500), offset: int = Query(0, ge=0),
    action: Optional[str] = Query(None, max_length=60),
    username: Optional[str] = Query(None, max_length=60),
):
    stmt = select(AuditLog).order_by(AuditLog.id.desc())
    if action:
        stmt = stmt.where(AuditLog.action.like(f"{action}%"))
    if username:
        stmt = stmt.where(AuditLog.username == username)
    return list(db.scalars(stmt.limit(limit).offset(offset)))


# ------------------------------------------------------------ global review
@router.get("/overview")
def overview(db: Session = Depends(get_db), _: User = Depends(admin_only)):
    def count(model, *where) -> int:
        stmt = select(func.count()).select_from(model)
        for w in where:
            stmt = stmt.where(w)
        return db.scalar(stmt) or 0

    now = utcnow()
    return {
        "users": {"total": count(User), "active": count(User, User.is_active.is_(True)),
                  "by_role": dict(db.execute(select(User.role, func.count()).group_by(User.role)).all())},
        "sensors": dict(db.execute(select(Sensor.status, func.count()).group_by(Sensor.status)).all()),
        "medical": {"conditions": count(MedicalCondition), "rules": count(WarningRule),
                    "rules_enabled": count(WarningRule, WarningRule.enabled.is_(True)),
                    "sources": count(ScientificSource), "datasets": count(Dataset),
                    "astronauts": count(AstronautProfile)},
        "sessions": dict(db.execute(select(SimSession.status, func.count()).group_by(SimSession.status)).all()),
        "warnings": dict(db.execute(select(WarningRecord.kind, func.count()).group_by(WarningRecord.kind)).all()),
        "viewer_tokens_active": count(ViewerToken, ViewerToken.revoked_at.is_(None),
                                      ViewerToken.expires_at > now),
        "running_now": [s.state() for s in manager.live.values() if s.status in ("running", "paused")],
        "simulation_lock": bool(registry.get_config(db, "simulation_lock", False)),
    }


# ------------------------------------------------------------ emergency stop
@router.post("/emergency-stop")
async def emergency_stop(payload: EmergencyStopIn, db: Session = Depends(get_db),
                         admin: User = Depends(admin_only)):
    """Abort every running or paused simulation and lock new starts."""
    stopped = await manager.emergency_stop(payload.reason, admin.username)
    lock = db.get(SystemConfig, "simulation_lock")
    lock.value = True
    lock.updated_by = admin.username
    lock.updated_at = utcnow()
    audit(db, admin, "simulation.emergency_stop", "session", ",".join(stopped),
          {"reason": payload.reason, "stopped": stopped})
    db.commit()
    return {"stopped": stopped, "simulation_lock": True}


@router.post("/simulation-lock")
def set_lock(payload: LockIn, db: Session = Depends(get_db), admin: User = Depends(admin_only)):
    lock = db.get(SystemConfig, "simulation_lock")
    lock.value = payload.locked
    lock.updated_by = admin.username
    lock.updated_at = utcnow()
    audit(db, admin, "simulation.lock" if payload.locked else "simulation.unlock", "config", "simulation_lock")
    db.commit()
    return {"simulation_lock": payload.locked}
