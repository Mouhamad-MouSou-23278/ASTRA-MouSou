"""Shared API helpers: role groups, lookup helpers and a small CRUD route factory.

Note: this module must NOT use `from __future__ import annotations`. The CRUD
factory annotates route parameters with closure variables (`payload: schema_in`),
which FastAPI can only resolve when annotations are evaluated eagerly.
"""
from typing import Any, Callable, Optional, Sequence, Type

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..audit import audit
from ..db import get_db
from ..models import User
from ..security import require_roles

# Who may READ the catalogues. Writes are restricted to the owning team only:
# the Physical Team cannot edit medical data and the Medical Team cannot edit
# sensors; the admin reviews everything but edits neither.
CATALOG_READ = ("admin", "physical", "medical", "operator")
PHYSICAL_WRITE = ("physical",)
MEDICAL_WRITE = ("medical",)
STAFF = ("admin", "physical", "medical", "operator", "viewer")


def get_or_404(db: Session, model: Type, ident: Any, name: str = "Item"):
    obj = db.get(model, ident)
    if obj is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"{name} not found")
    return obj


def commit_or_409(db: Session, what: str = "Item") -> None:
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"{what} conflicts with an existing record (duplicate key?)"
        ) from exc


def register_crud(
    router: APIRouter,
    path: str,
    model: Type,
    schema_in: Type[BaseModel],
    schema_out: Type[BaseModel],
    *,
    entity: str,
    read_roles: Sequence[str],
    write_roles: Sequence[str],
    order_by: Any = None,
    validate: Optional[Callable[[Session, BaseModel, Optional[Any]], dict]] = None,
    before_delete: Optional[Callable[[Session, Any], None]] = None,
) -> None:
    """Register list/create/update/delete routes for a flat table.

    `validate(db, payload, existing)` may raise HTTPException and returns the
    column values to store (defaults to the payload fields).
    """

    def values_of(db: Session, payload: BaseModel, existing: Optional[Any]) -> dict:
        return validate(db, payload, existing) if validate else payload.model_dump()

    @router.get(path, response_model=list[schema_out], name=f"list_{entity}")
    def list_items(db: Session = Depends(get_db), _: User = Depends(require_roles(*read_roles))):
        stmt = select(model)
        if order_by is not None:
            stmt = stmt.order_by(order_by)
        return list(db.scalars(stmt))

    @router.post(path, response_model=schema_out, status_code=201, name=f"create_{entity}")
    def create_item(payload: schema_in, db: Session = Depends(get_db),  # type: ignore[valid-type]
                    user: User = Depends(require_roles(*write_roles))):
        obj = model(**values_of(db, payload, None))
        db.add(obj)
        try:
            db.flush()
        except IntegrityError as exc:
            db.rollback()
            raise HTTPException(status.HTTP_409_CONFLICT,
                                f"A {entity} with this key already exists") from exc
        audit(db, user, f"{entity}.create", entity, obj.id)
        commit_or_409(db, entity)
        db.refresh(obj)
        return obj

    @router.put(path + "/{item_id}", response_model=schema_out, name=f"update_{entity}")
    def update_item(item_id: int, payload: schema_in, db: Session = Depends(get_db),  # type: ignore[valid-type]
                    user: User = Depends(require_roles(*write_roles))):
        obj = get_or_404(db, model, item_id, entity)
        for key, value in values_of(db, payload, obj).items():
            setattr(obj, key, value)
        audit(db, user, f"{entity}.update", entity, obj.id)
        commit_or_409(db, entity)
        db.refresh(obj)
        return obj

    @router.delete(path + "/{item_id}", status_code=204, name=f"delete_{entity}")
    def delete_item(item_id: int, db: Session = Depends(get_db),
                    user: User = Depends(require_roles(*write_roles))):
        obj = get_or_404(db, model, item_id, entity)
        if before_delete:
            before_delete(db, obj)
        db.delete(obj)
        audit(db, user, f"{entity}.delete", entity, item_id)
        commit_or_409(db, entity)
