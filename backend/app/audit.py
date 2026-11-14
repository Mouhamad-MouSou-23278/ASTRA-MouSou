"""Append-only audit trail for every state-changing action."""
from __future__ import annotations

from typing import Any, Optional

from sqlalchemy.orm import Session

from .models import AuditLog, User


def audit(
    db: Session,
    actor: Optional[User],
    action: str,
    entity_type: str = "",
    entity_id: Any = "",
    detail: Optional[dict] = None,
    *,
    actor_name: str = "system",
    actor_role: str = "system",
) -> None:
    """Add an audit row to the current transaction (caller commits)."""
    db.add(
        AuditLog(
            user_id=actor.id if actor else None,
            username=actor.username if actor else actor_name,
            role=actor.role if actor else actor_role,
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id),
            detail=detail or {},
        )
    )
