"""Mission: plan generation, sessions, playback control, live stream, QR viewer tokens, ASTRA AI."""
from __future__ import annotations

import asyncio
import io
import secrets
import socket
import time
from datetime import timedelta
from typing import Optional
from urllib.parse import urlsplit, urlunsplit

import qrcode
import qrcode.image.svg
from fastapi import (
    APIRouter,
    Depends,
    File,
    Header,
    HTTPException,
    Query,
    Request,
    Response,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..audit import audit
from ..config import DATA_LABEL, get_settings
from ..db import SessionLocal, get_db
from ..models import (
    AstronautProfile,
    ChatMessage,
    Scenario,
    SimSession,
    User,
    ViewerToken,
    WarningRecord,
    Waypoint,
    utcnow,
)
from ..schemas import (
    ChatIn,
    ChatMessageOut,
    ControlIn,
    PlanGenerateIn,
    PlanPreviewOut,
    PlanValidateIn,
    ScenarioOut,
    SessionCreateIn,
    SessionOut,
    ViewerTokenCreated,
    ViewerTokenCreateIn,
    ViewerTokenOut,
    WaypointOut,
)
from ..security import (
    Principal,
    new_viewer_token,
    principal_for_session,
    require_roles,
    resolve_viewer_token,
    session_principal,
    user_from_token,
)
from ..services import assistant, planner, registry
from ..services.llm import get_llm
from ..services.runtime import ControlError, manager
from ..services.voice import SpeechError, get_speech
from .common import STAFF, get_or_404

router = APIRouter(tags=["mission"])
operator = require_roles("operator")
staff = require_roles(*STAFF)
_bearer = HTTPBearer(auto_error=False)


# ------------------------------------------------------------ reference data
@router.get("/waypoints", response_model=list[WaypointOut])
def list_waypoints(db: Session = Depends(get_db), _: User = Depends(staff)):
    return list(db.scalars(select(Waypoint).order_by(Waypoint.id)))


@router.get("/scenarios", response_model=list[ScenarioOut])
def list_scenarios(db: Session = Depends(get_db), _: User = Depends(staff)):
    return list(db.scalars(select(Scenario).order_by(Scenario.is_default.desc(), Scenario.id)))


@router.get("/world")
def get_world(db: Session = Depends(get_db), _: User = Depends(staff)):
    return registry.world_dict(db)


# --------------------------------------------------------------------- plans
def _preview(result: planner.PlanResult) -> PlanPreviewOut:
    return PlanPreviewOut(valid=result.valid, problems=result.problems, plan=result.plan,
                          source=result.source, notes=result.notes, timeline=result.timeline)


@router.post("/plans/generate", response_model=PlanPreviewOut)
def generate_plan(payload: PlanGenerateIn, db: Session = Depends(get_db), user: User = Depends(operator)):
    """Natural-language scenario -> validated plan (LLM if configured, else deterministic)."""
    result = planner.generate_plan(db, payload.prompt, payload.seed)
    audit(db, user, "plan.generate", "plan", "", {"source": result.source, "valid": result.valid})
    db.commit()
    return _preview(result)


@router.post("/plans/validate", response_model=PlanPreviewOut)
def validate_plan(payload: PlanValidateIn, db: Session = Depends(get_db), _: User = Depends(operator)):
    result = planner.validate_plan(payload.plan, planner.load_context(db))
    result.source = "manual"
    return _preview(result)


# ------------------------------------------------------------------ sessions
def _detail(db: Session, row: SimSession, principal: Principal) -> dict:
    live = manager.get(row.id)
    snap = row.config_snapshot
    session = SessionOut.model_validate(row).model_dump(mode="json")
    session.update({k: v for k, v in live.state().items() if k in ("status", "speed", "run", "sim_time", "end_reason")})
    astronaut = snap.get("astronaut") or {}
    return {
        "label": DATA_LABEL,
        "session": session,
        "timeline": live.timeline.to_dict(),
        "world": snap["world"],
        "sensors": registry.sensor_meta(snap),
        "rules": [{"key": r["key"], "name": r["name"], "severity": r["severity"], "logic": r["logic"],
                   "clauses": r["clauses"], "condition_name": r["condition_name"]} for r in snap["rules"]],
        "astronaut": {"callsign": astronaut.get("callsign"), "full_name": astronaut.get("full_name"),
                      "is_synthetic": True},
        "access": {"kind": principal.kind, "role": principal.role, "name": principal.name,
                   "can_control": principal.can_control},
        "speeds": list(registry.SPEEDS),
    }


@router.post("/sessions", status_code=201)
def create_session(payload: SessionCreateIn, db: Session = Depends(get_db), user: User = Depends(operator)):
    """Confirm a previewed plan. Freezes the catalogue into the session snapshot."""
    result = planner.validate_plan(payload.plan, planner.load_context(db))
    if not result.valid:
        raise HTTPException(422,
                            {"message": "Plan is not valid", "problems": result.problems})
    if payload.astronaut_id is not None:
        get_or_404(db, AstronautProfile, payload.astronaut_id, "Astronaut")
    snapshot = registry.build_snapshot(db, payload.astronaut_id)
    if not snapshot["sensors"]:
        raise HTTPException(status.HTTP_409_CONFLICT, "No active sensors: activate sensors before simulating")
    speed = float(registry.get_config(db, "default_speed", 4))
    row = SimSession(
        id=secrets.token_hex(6), name=payload.name.strip(), prompt=payload.prompt,
        plan=result.plan, plan_source=payload.plan_source, planner_notes=payload.planner_notes,
        config_snapshot=snapshot, seed=result.plan["seed"], status="planned",
        speed=speed if speed in registry.SPEEDS else 1.0,
        duration_s=result.timeline["duration_s"],
        astronaut_id=(snapshot["astronaut"] or {}).get("id"), created_by=user.username,
    )
    db.add(row)
    audit(db, user, "session.create", "session", row.id, {"name": row.name, "seed": row.seed})
    db.commit()
    return _detail(db, row, Principal("user", user.username, user.role, user=user))


@router.get("/sessions", response_model=list[SessionOut])
def list_sessions(db: Session = Depends(get_db), _: User = Depends(staff),
                  limit: int = Query(50, ge=1, le=200)):
    rows = list(db.scalars(select(SimSession).order_by(SimSession.created_at.desc()).limit(limit)))
    out = []
    for row in rows:
        item = SessionOut.model_validate(row)
        live = manager.live.get(row.id)
        if live is not None:   # the in-memory runtime is authoritative for live values
            item = item.model_copy(update={"status": live.status, "speed": live.speed,
                                           "sim_time": live.sim_time, "run": live.run})
        out.append(item)
    return out


@router.get("/sessions/{session_id}")
def get_session(session_id: str, db: Session = Depends(get_db),
                principal: Principal = Depends(session_principal)):
    return _detail(db, db.get(SimSession, session_id), principal)


@router.delete("/sessions/{session_id}", status_code=204)
def delete_session(session_id: str, db: Session = Depends(get_db),
                   user: User = Depends(require_roles("operator", "admin"))):
    row = get_or_404(db, SimSession, session_id, "Session")
    live = manager.live.get(session_id)
    if live is not None and live.status in ("running", "paused"):
        raise HTTPException(status.HTTP_409_CONFLICT, "Stop the simulation before deleting the session")
    manager.forget(session_id)
    db.delete(row)
    audit(db, user, "session.delete", "session", session_id, {"name": row.name})
    db.commit()


@router.post("/sessions/{session_id}/control")
async def control_session(session_id: str, payload: ControlIn, db: Session = Depends(get_db),
                          user: User = Depends(require_roles("operator", "admin"))):
    """Playback control. Operators have full control; an admin may only stop (override)."""
    if user.role == "admin" and payload.action != "stop":
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            "Administrators can only stop a simulation (use emergency stop for all)")
    get_or_404(db, SimSession, session_id, "Session")
    locked = bool(registry.get_config(db, "simulation_lock", False))
    try:
        live = await manager.control(session_id, payload.action, payload.speed, user.username, locked)
    except ControlError as exc:
        raise HTTPException(exc.status_code, exc.message) from exc
    audit(db, user, f"session.{payload.action}", "session", session_id,
          {"speed": payload.speed} if payload.action == "set_speed" else {})
    db.commit()
    return live.state()


@router.get("/sessions/{session_id}/warnings")
def session_warnings(session_id: str, db: Session = Depends(get_db),
                     principal: Principal = Depends(session_principal)):
    """Persisted warning history (raised and cleared) for the current run."""
    row = db.get(SimSession, session_id)
    records = db.scalars(select(WarningRecord).where(
        WarningRecord.session_id == session_id, WarningRecord.run == row.run
    ).order_by(WarningRecord.raised_at))
    return [r.detail for r in records]


# -------------------------------------------------------------- viewer / QR
def _lan_ip() -> Optional[str]:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("10.255.255.255", 1))   # no packet is sent for UDP connect
            ip = s.getsockname()[0]
        return None if ip.startswith("127.") else ip
    except OSError:
        return None


def _viewer_base_url(db: Session, request: Request, override: Optional[str]) -> str:
    """URL a phone on the same network can open. localhost is swapped for the LAN address."""
    # An explicitly configured public URL wins (required in Docker, where the server
    # cannot see the host's LAN address); otherwise use the origin the operator is on.
    base = (registry.get_config(db, "public_base_url", "") or get_settings().public_base_url
            or override or request.headers.get("origin") or str(request.base_url))
    if not base.startswith(("http://", "https://")):
        raise HTTPException(422, "base_url must start with http:// or https://")
    parts = urlsplit(base)
    if parts.hostname in ("localhost", "127.0.0.1", "::1"):
        ip = _lan_ip()
        if ip:
            netloc = f"{ip}:{parts.port}" if parts.port else ip
            parts = parts._replace(netloc=netloc)
    return urlunsplit((parts.scheme, parts.netloc, "", "", "")).rstrip("/")


def _token_state(row: ViewerToken) -> str:
    if row.revoked_at is not None:
        return "revoked"
    return "expired" if row.expires_at <= utcnow() else "active"


def _token_out(row: ViewerToken) -> ViewerTokenOut:
    return ViewerTokenOut.model_validate(row).model_copy(update={"state": _token_state(row)})


@router.post("/sessions/{session_id}/viewer-tokens", response_model=ViewerTokenCreated, status_code=201)
def create_viewer_token(session_id: str, payload: ViewerTokenCreateIn, request: Request,
                        db: Session = Depends(get_db),
                        user: User = Depends(require_roles("operator", "admin"))):
    """Issue an expiring, revocable, session-scoped read-only token and its QR code."""
    get_or_404(db, SimSession, session_id, "Session")
    ttl = payload.ttl_minutes or int(registry.get_config(db, "viewer_token_ttl_minutes", 120))
    plain, token_hash = new_viewer_token()
    row = ViewerToken(session_id=session_id, token_hash=token_hash, label=payload.label.strip(),
                      created_by=user.username, expires_at=utcnow() + timedelta(minutes=ttl))
    db.add(row)
    db.flush()
    url = f"{_viewer_base_url(db, request, payload.base_url)}/view/{plain}"
    image = qrcode.make(url, image_factory=qrcode.image.svg.SvgPathImage, box_size=10, border=2)
    buffer = io.BytesIO()
    image.save(buffer)
    audit(db, user, "viewer_token.create", "viewer_token", row.id,
          {"session": session_id, "ttl_minutes": ttl, "label": row.label})
    db.commit()
    return ViewerTokenCreated(**_token_out(row).model_dump(), token=plain, url=url,
                              qr_svg=buffer.getvalue().decode("utf-8"))


@router.get("/sessions/{session_id}/viewer-tokens", response_model=list[ViewerTokenOut])
def list_viewer_tokens(session_id: str, db: Session = Depends(get_db),
                       _: User = Depends(require_roles("operator", "admin"))):
    rows = db.scalars(select(ViewerToken).where(ViewerToken.session_id == session_id)
                      .order_by(ViewerToken.id.desc()))
    return [_token_out(r) for r in rows]


@router.delete("/viewer-tokens/{token_id}", status_code=204)
def revoke_viewer_token(token_id: int, db: Session = Depends(get_db),
                        user: User = Depends(require_roles("operator", "admin"))):
    row = get_or_404(db, ViewerToken, token_id, "Viewer token")
    if row.revoked_at is None:
        row.revoked_at = utcnow()
        audit(db, user, "viewer_token.revoke", "viewer_token", row.id, {"session": row.session_id})
        db.commit()


@router.get("/viewer/resolve")
def resolve_viewer(token: str = Query(..., min_length=10, max_length=200), db: Session = Depends(get_db)):
    """Exchange a QR token for the id of the one session it may watch."""
    row = resolve_viewer_token(db, token, touch=True)
    if row is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "This viewer link is invalid, expired or revoked")
    return {"session_id": row.session_id, "label": row.label,
            "expires_at": row.expires_at.isoformat(timespec="seconds") + "Z"}


# ---------------------------------------------------------------- ASTRA chat
_last_chat: dict[str, float] = {}


def _author(principal: Principal) -> str:
    return principal.name if principal.kind == "user" else f"viewer:{principal.token_id}"


@router.post("/sessions/{session_id}/chat")
async def chat(session_id: str, payload: ChatIn, db: Session = Depends(get_db),
               principal: Principal = Depends(session_principal)):
    author = _author(principal)
    now = time.monotonic()
    if now - _last_chat.get(author, 0.0) < 1.0:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Please wait a moment before asking again")
    _last_chat[author] = now

    live = manager.get(session_id)
    history = [
        {"role": m.role, "content": m.content}
        for m in reversed(list(db.scalars(
            select(ChatMessage).where(ChatMessage.session_id == session_id, ChatMessage.author == author)
            .order_by(ChatMessage.id.desc()).limit(6))))
    ]
    llm = get_llm() if registry.get_config(db, "ai_mode", "auto") != "local_only" else None
    context = assistant.build_context(live)          # reads live buffers: stays on the event loop
    result = await asyncio.to_thread(assistant.answer, context, payload.message, history, llm)

    db.add(ChatMessage(session_id=session_id, role="user", author=author, content=payload.message,
                       sim_time=live.sim_time))
    db.add(ChatMessage(session_id=session_id, role="assistant", author=author, content=result["reply"],
                       provider=result["provider"], sim_time=live.sim_time))
    db.commit()
    return {**result, "sim_time": live.sim_time, "label": DATA_LABEL}


@router.get("/sessions/{session_id}/chat", response_model=list[ChatMessageOut])
def chat_history(session_id: str, db: Session = Depends(get_db),
                 principal: Principal = Depends(session_principal)):
    return list(db.scalars(
        select(ChatMessage).where(ChatMessage.session_id == session_id,
                                  ChatMessage.author == _author(principal))
        .order_by(ChatMessage.id).limit(200)))


# --------------------------------------------------------------------- voice
def any_principal(creds: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
                  x_viewer_token: Optional[str] = Header(None), db: Session = Depends(get_db)) -> None:
    if creds and user_from_token(db, creds.credentials):
        return
    if x_viewer_token and resolve_viewer_token(db, x_viewer_token):
        return
    raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")


class TTSIn(BaseModel):
    text: str = Field(min_length=1, max_length=1200)


@router.post("/voice/stt")
async def speech_to_text(file: UploadFile = File(...), _: None = Depends(any_principal)):
    provider = get_speech()
    if provider is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE,
                            "No server speech provider configured; use browser speech recognition")
    audio = await file.read(10 * 1024 * 1024 + 1)
    if not audio or len(audio) > 10 * 1024 * 1024:
        raise HTTPException(422, "Audio must be between 1 byte and 10 MB")
    try:
        text = await asyncio.to_thread(provider.transcribe, audio, file.filename or "", file.content_type or "")
    except SpeechError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc
    return {"text": text, "provider": provider.name}


@router.post("/voice/tts")
async def text_to_speech(payload: TTSIn, _: None = Depends(any_principal)):
    provider = get_speech()
    if provider is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE,
                            "No server speech provider configured; use browser speech synthesis")
    try:
        audio, media_type = await asyncio.to_thread(provider.synthesize, payload.text)
    except SpeechError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc
    return Response(content=audio, media_type=media_type)


# ----------------------------------------------------------------- live feed
@router.websocket("/ws/sessions/{session_id}")
async def session_stream(ws: WebSocket, session_id: str, token: Optional[str] = None,
                         viewer_token: Optional[str] = None):
    """Read-only live stream. Inbound messages are ignored: nothing a client
    sends here can alter the authoritative simulation state."""
    with SessionLocal() as db:
        principal = (principal_for_session(db, session_id, token, viewer_token)
                     if db.get(SimSession, session_id) else None)
    if principal is None:
        await ws.close(code=4401)
        return
    live = manager.get(session_id)
    if live is None:
        await ws.close(code=4404)
        return
    await ws.accept()
    queue = live.subscribe()

    async def drain_inbound() -> None:
        try:
            while True:
                await ws.receive_text()
        except (WebSocketDisconnect, RuntimeError):
            pass

    inbound = asyncio.create_task(drain_inbound())
    last_auth_check = time.monotonic()
    try:
        await ws.send_json(live.hello())
        while not inbound.done():
            try:
                message = await asyncio.wait_for(queue.get(), timeout=5.0)
            except asyncio.TimeoutError:
                message = {"type": "ping"}
            if message.get("type") == "overflow":
                live.unsubscribe(queue)
                queue = live.subscribe()
                message = live.hello()
            await ws.send_json(message)
            if principal.kind == "viewer" and time.monotonic() - last_auth_check > 5.0:
                last_auth_check = time.monotonic()
                with SessionLocal() as db:
                    if resolve_viewer_token(db, viewer_token or "") is None:
                        await ws.send_json({"type": "notice", "level": "critical",
                                            "message": "This viewer link has expired or was revoked."})
                        await ws.close(code=4401)
                        return
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        live.unsubscribe(queue)
        inbound.cancel()
