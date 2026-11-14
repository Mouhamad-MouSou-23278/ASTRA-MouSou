"""Login and account self-service. There is deliberately no registration endpoint."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..audit import audit
from ..db import get_db
from ..models import User, utcnow
from ..schemas import ChangePasswordIn, LoginIn, LoginOut, UserOut
from ..security import (
    clear_login_failures,
    create_access_token,
    get_current_user,
    hash_password,
    login_locked,
    register_login_failure,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=LoginOut)
def login(payload: LoginIn, db: Session = Depends(get_db)):
    username = payload.username.strip().lower()
    wait = login_locked(username)
    if wait:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS,
                            f"Too many failed attempts. Try again in {wait} s.")
    user = db.scalar(select(User).where(User.username == username))
    if user is None or not user.is_active or not verify_password(payload.password, user.password_hash):
        register_login_failure(username)
        audit(db, None, "auth.login_failed", "user", username, actor_name=username, actor_role="anonymous")
        db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid username or password")
    clear_login_failures(username)
    user.last_login_at = utcnow()
    audit(db, user, "auth.login", "user", user.id)
    db.commit()
    return LoginOut(access_token=create_access_token(user), user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.post("/change-password", status_code=204)
def change_password(payload: ChangePasswordIn, db: Session = Depends(get_db),
                    user: User = Depends(get_current_user)):
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect")
    account = db.get(User, user.id)
    account.password_hash = hash_password(payload.new_password)
    audit(db, user, "auth.change_password", "user", user.id)
    db.commit()
