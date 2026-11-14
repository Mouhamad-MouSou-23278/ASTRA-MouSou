"""Authentication, server-side RBAC and viewer (QR) tokens.

There is no public registration: only an admin can create accounts. Every
protected route declares the roles it accepts through `require_roles`, so the
permission model lives on the server, never in the UI.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Callable, Optional

import jwt
from fastapi import Depends, Header, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import get_settings
from .db import get_db
from .models import SimSession, User, ViewerToken, utcnow

ALGORITHM = "HS256"
STAFF_ROLES = ("admin", "physical", "medical", "operator", "viewer")

_SCRYPT_N, _SCRYPT_R, _SCRYPT_P = 2**14, 8, 1
_bearer = HTTPBearer(auto_error=False)


# ----------------------------------------------------------------- passwords
def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=_SCRYPT_N, r=_SCRYPT_R,
                            p=_SCRYPT_P, dklen=32)
    return "scrypt${}${}${}${}${}".format(
        _SCRYPT_N, _SCRYPT_R, _SCRYPT_P,
        base64.b64encode(salt).decode(), base64.b64encode(digest).decode(),
    )


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, n, r, p, salt_b64, digest_b64 = stored.split("$")
        if scheme != "scrypt":
            return False
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(digest_b64)
        digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=int(n), r=int(r), p=int(p),
                                dklen=len(expected))
        return hmac.compare_digest(digest, expected)
    except (ValueError, TypeError):
        return False


# ------------------------------------------------------------ login throttle
_MAX_FAILURES = 6
_LOCK_SECONDS = 60
_failures: dict[str, tuple[int, float]] = {}


def login_locked(username: str) -> int:
    """Seconds the account is still locked for, or 0."""
    count, until = _failures.get(username, (0, 0.0))
    remaining = int(until - time.time())
    return remaining if count >= _MAX_FAILURES and remaining > 0 else 0


def register_login_failure(username: str) -> None:
    count, until = _failures.get(username, (0, 0.0))
    if until and until < time.time():
        count = 0
    count += 1
    _failures[username] = (count, time.time() + _LOCK_SECONDS)


def clear_login_failures(username: str) -> None:
    _failures.pop(username, None)


# ----------------------------------------------------------------------- JWT
def create_access_token(user: User) -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "role": user.role,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=settings.access_token_minutes)).timestamp()),
    }
    return jwt.encode(payload, settings.resolved_secret_key, algorithm=ALGORITHM)


def user_from_token(db: Session, token: str) -> Optional[User]:
    try:
        payload = jwt.decode(token, get_settings().resolved_secret_key, algorithms=[ALGORITHM])
        user_id = int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        return None
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        return None
    return user


def get_current_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    user = user_from_token(db, creds.credentials) if creds else None
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated",
                            headers={"WWW-Authenticate": "Bearer"})
    return user


def require_roles(*roles: str) -> Callable[..., User]:
    """Dependency factory: the caller must be an active user with one of `roles`."""

    def dependency(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                f"Role '{user.role}' is not permitted to perform this action",
            )
        return user

    return dependency


# -------------------------------------------------------------- viewer tokens
def new_viewer_token() -> tuple[str, str]:
    """Returns (plain token shown once, hash stored in the database)."""
    plain = secrets.token_urlsafe(24)
    return plain, hash_viewer_token(plain)


def hash_viewer_token(plain: str) -> str:
    return hashlib.sha256(plain.encode("utf-8")).hexdigest()


def resolve_viewer_token(db: Session, plain: str, touch: bool = False) -> Optional[ViewerToken]:
    if not plain or len(plain) > 200:
        return None
    row = db.scalar(select(ViewerToken).where(ViewerToken.token_hash == hash_viewer_token(plain)))
    if row is None or row.revoked_at is not None or row.expires_at <= utcnow():
        return None
    if touch:
        row.last_used_at = utcnow()
        row.use_count += 1
        db.commit()
    return row


@dataclass
class Principal:
    """Who is acting on a session: a logged-in user or a QR viewer token holder."""

    kind: str                       # "user" | "viewer"
    name: str
    role: str
    user: Optional[User] = None
    token_id: Optional[int] = None

    @property
    def can_control(self) -> bool:
        return self.kind == "user" and self.role == "operator"


def principal_for_session(
    db: Session, session_id: str, bearer: Optional[str], viewer_token: Optional[str]
) -> Optional[Principal]:
    """Resolve access to one session. Viewer tokens are scoped to their own session."""
    if bearer:
        user = user_from_token(db, bearer)
        if user is not None and user.role in STAFF_ROLES:
            return Principal("user", user.username, user.role, user=user)
    if viewer_token:
        row = resolve_viewer_token(db, viewer_token)
        if row is not None and row.session_id == session_id:
            return Principal("viewer", row.label or "Instrument viewer", "viewer", token_id=row.id)
    return None


def session_principal(
    session_id: str,
    creds: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    x_viewer_token: Optional[str] = Header(None),
    viewer_token: Optional[str] = Query(None),
    db: Session = Depends(get_db),
) -> Principal:
    if db.get(SimSession, session_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    principal = principal_for_session(
        db, session_id, creds.credentials if creds else None, x_viewer_token or viewer_token
    )
    if principal is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authorised for this session")
    return principal
