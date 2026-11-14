"""Authoritative live simulation runtime.

One `LiveSession` owns one engine and is the single source of truth for that
session's state. Clients (operators and QR viewers alike) only receive frames;
they can never change simulation state through the WebSocket. Controls arrive
through RBAC-protected REST calls and are applied here.

All LiveSession state is touched only from the event loop. Database writes are
batched and pushed to a worker thread so the loop never blocks on I/O.
"""
from __future__ import annotations

import asyncio
import logging
from collections import deque
from typing import Any, Optional

from sqlalchemy import delete, select, update

from astra_sim import SimulationEngine, SimulationPlan, compile_plan

from ..db import SessionLocal
from ..models import SessionEvent, SimSession, TelemetryFrame, WarningRecord, utcnow
from . import registry

log = logging.getLogger("astra.runtime")

FRAME_BUFFER = 9000          # frames kept in memory per session (75 min at 2 Hz)
EVENT_BUFFER = 3000
TICK_WALL_S = 0.05
FLUSH_WALL_S = 2.0
MAX_RUNNING = 4
QUEUE_SIZE = 256
QUALITY_CODE = {"good": 0, "suspect": 1, "bad": 2, "missing": 3}
FINAL_STATES = ("completed", "stopped", "aborted")


class ControlError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message


class LiveSession:
    def __init__(self, row: SimSession) -> None:
        self.id = row.id
        self.name = row.name
        self.snapshot: dict = row.config_snapshot
        self.plan = SimulationPlan.model_validate(row.plan)
        self.status: str = row.status
        self.speed: float = row.speed
        self.run: int = row.run
        self.sim_time: float = row.sim_time
        self.end_reason: str = row.end_reason
        self.timeline = compile_plan(
            self.plan, registry.world_from_dict(self.snapshot["world"]),
            [s["key"] for s in self.snapshot["sensors"]],
        )
        self.duration_s = self.timeline.duration_s
        self.engine: Optional[SimulationEngine] = None
        self.frames: deque[dict] = deque(maxlen=FRAME_BUFFER)
        self.events: deque[dict] = deque(maxlen=EVENT_BUFFER)
        self.subscribers: set[asyncio.Queue] = set()
        self.task: Optional[asyncio.Task] = None
        self.persist_stride = 2
        self._pending_frames: list[dict] = []
        self._pending_events: list[dict] = []
        self._pending_warnings: dict[str, dict] = {}

    # ------------------------------------------------------------- snapshots
    @property
    def last_frame(self) -> Optional[dict]:
        return self.frames[-1] if self.frames else None

    def state(self) -> dict:
        return {"id": self.id, "name": self.name, "status": self.status, "speed": self.speed,
                "run": self.run, "sim_time": self.sim_time, "duration_s": self.duration_s,
                "end_reason": self.end_reason}

    def history(self, stride: int = 2) -> dict:
        """Columnar history (about 1 Hz) for chart backfill."""
        frames = [f for f in self.frames if f["seq"] % stride == 0] or list(self.frames)
        keys = [s["key"] for s in self.snapshot["sensors"]]
        sensors = {k: {"v": [], "q": []} for k in keys}
        truth: dict[str, list] = {}
        for f in frames:
            for k in keys:
                v, q, _flags = f["sensors"].get(k, (None, "missing", []))
                sensors[k]["v"].append(v)
                sensors[k]["q"].append(QUALITY_CODE.get(q, 3))
            for ch, val in f["truth"].items():
                truth.setdefault(ch, []).append(val)
        return {
            "t": [f["t"] for f in frames],
            "sensors": sensors,
            "truth": truth,
            "trail": [[f["astronaut"]["x"], f["astronaut"]["y"]] for f in frames
                      if f["astronaut"]["outside"]],
        }

    def hello(self) -> dict:
        return {"type": "hello", "session": self.state(), "history": self.history(),
                "events": list(self.events), "frame": self.last_frame}

    # ------------------------------------------------------------- broadcast
    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=QUEUE_SIZE)
        self.subscribers.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        self.subscribers.discard(q)

    def broadcast(self, message: dict) -> None:
        for q in list(self.subscribers):
            try:
                q.put_nowait(message)
            except asyncio.QueueFull:
                # A client that cannot keep up is dropped; it reconnects and resyncs.
                self.subscribers.discard(q)
                try:
                    q.get_nowait()
                    q.put_nowait({"type": "overflow"})
                except (asyncio.QueueEmpty, asyncio.QueueFull):
                    pass

    # ----------------------------------------------------------------- engine
    def reset_engine(self) -> None:
        self.engine = SimulationEngine(registry.engine_config(self.snapshot, self.plan))
        self.frames.clear()
        self.events.clear()
        self._pending_frames.clear()
        self._pending_events.clear()
        self._pending_warnings.clear()
        self.sim_time = 0.0

    def add_event(self, type_: str, **payload: Any) -> dict:
        event = {"id": f"c{len(self.events) + 1}-{self.run}", "t": self.sim_time, "type": type_, **payload}
        self.events.append(event)
        self._pending_events.append(event)
        return event

    def ingest(self, frame: dict) -> None:
        self.frames.append(frame)
        self.sim_time = frame["t"]
        for ev in frame["events"]:
            self.events.append(ev)
            self._pending_events.append(ev)
            warning = ev.get("warning")
            if warning:
                self._pending_warnings[warning["id"]] = warning
        if frame["seq"] % self.persist_stride == 0:
            self._pending_frames.append(frame)

    def take_pending(self) -> tuple[list[dict], list[dict], list[dict]]:
        frames, events = self._pending_frames, self._pending_events
        warnings = list(self._pending_warnings.values())
        self._pending_frames, self._pending_events, self._pending_warnings = [], [], {}
        return frames, events, warnings


def _persist(session_id: str, run: int, frames: list[dict], events: list[dict],
             warnings: list[dict], state: Optional[dict]) -> None:
    """Blocking database write; runs in a worker thread."""
    with SessionLocal() as db:
        if frames:
            db.add_all([
                TelemetryFrame(session_id=session_id, run=run, sim_time=f["t"],
                               data={k: v for k, v in f.items() if k != "events"})
                for f in frames
            ])
        if events:
            db.add_all([
                SessionEvent(session_id=session_id, run=run, sim_time=e["t"], type=e["type"],
                             payload={k: v for k, v in e.items() if k not in ("t", "type")})
                for e in events
            ])
        for w in warnings:
            row = db.scalar(select(WarningRecord).where(
                WarningRecord.session_id == session_id, WarningRecord.run == run,
                WarningRecord.uid == w["id"]))
            if row is None:
                db.add(WarningRecord(
                    session_id=session_id, run=run, uid=w["id"], kind=w["kind"], key=w["key"],
                    sensor_key=w.get("sensor_key"), severity=w["severity"], message=w["message"],
                    raised_at=w["raised_at"], cleared_at=w.get("cleared_at"), detail=w))
            else:
                row.cleared_at = w.get("cleared_at")
                row.detail = w
        if state:
            db.execute(update(SimSession).where(SimSession.id == session_id).values(**state))
        db.commit()


class SessionManager:
    def __init__(self) -> None:
        self.live: dict[str, LiveSession] = {}

    # ------------------------------------------------------------- lifecycle
    def recover_after_restart(self) -> int:
        """Engine state does not survive a process restart; mark such sessions stopped."""
        with SessionLocal() as db:
            rows = list(db.scalars(select(SimSession).where(SimSession.status.in_(("running", "paused")))))
            for row in rows:
                row.status = "stopped"
                row.ended_at = utcnow()
                row.end_reason = "Interrupted by a server restart (use Restart to replay it)"
            db.commit()
            return len(rows)

    async def shutdown(self) -> None:
        for live in list(self.live.values()):
            await self._halt(live)
            await self._flush(live)

    def get(self, session_id: str) -> Optional[LiveSession]:
        """Return the live object for a session, loading persisted data if needed."""
        live = self.live.get(session_id)
        if live is not None:
            return live
        with SessionLocal() as db:
            row = db.get(SimSession, session_id)
            if row is None:
                return None
            live = LiveSession(row)
            live.persist_stride = self._stride(db)
            if row.run > 0:
                for rec in db.scalars(
                    select(TelemetryFrame).where(TelemetryFrame.session_id == session_id,
                                                 TelemetryFrame.run == row.run)
                    .order_by(TelemetryFrame.sim_time)
                ):
                    live.frames.append({**rec.data, "events": []})
                for ev in db.scalars(
                    select(SessionEvent).where(SessionEvent.session_id == session_id,
                                               SessionEvent.run == row.run)
                    .order_by(SessionEvent.sim_time, SessionEvent.id)
                ):
                    live.events.append({"t": ev.sim_time, "type": ev.type, **ev.payload})
        self.live[session_id] = live
        return live

    def forget(self, session_id: str) -> None:
        self.live.pop(session_id, None)

    @staticmethod
    def _stride(db) -> int:
        interval = registry.get_config(db, "telemetry_persist_interval_s", 1)
        try:
            return max(1, round(float(interval) / registry.DT))
        except (TypeError, ValueError):
            return 2

    # --------------------------------------------------------------- control
    def _running_count(self) -> int:
        return sum(1 for s in self.live.values() if s.status == "running")

    async def control(self, session_id: str, action: str, speed: Optional[float], actor: str,
                      locked: bool) -> LiveSession:
        live = self.get(session_id)
        if live is None:
            raise ControlError(404, "Session not found")

        if action == "set_speed":
            if speed not in registry.SPEEDS:
                raise ControlError(422, f"speed must be one of {list(registry.SPEEDS)}")
            live.speed = float(speed)
            live.add_event("CONTROL", action="set_speed", speed=live.speed, by=actor,
                           label=f"Speed set to {live.speed:g}x")
            await self._save_state(live, {"speed": live.speed})
            live.broadcast({"type": "state", "session": live.state()})
            return live

        starts = action in ("start", "resume", "restart")
        if starts and locked:
            raise ControlError(423, "Simulations are locked by an administrator (emergency stop)")
        if starts and live.status != "running" and self._running_count() >= MAX_RUNNING:
            raise ControlError(409, f"At most {MAX_RUNNING} simulations can run at once")

        if action == "start":
            if live.status != "planned":
                raise ControlError(409, f"Cannot start a session that is {live.status}; use restart")
            await self._begin(live, actor, "start")
        elif action == "restart":
            await self._halt(live)
            await self._flush(live)
            await self._begin(live, actor, "restart")
        elif action == "pause":
            if live.status != "running":
                raise ControlError(409, f"Cannot pause a session that is {live.status}")
            await self._halt(live)
            live.status = "paused"
            live.add_event("CONTROL", action="pause", by=actor, label="Paused")
            await self._flush(live, {"status": "paused", "sim_time": live.sim_time})
        elif action == "resume":
            if live.status != "paused" or live.engine is None:
                raise ControlError(409, f"Cannot resume a session that is {live.status}")
            live.status = "running"
            live.add_event("CONTROL", action="resume", by=actor, label="Resumed")
            await self._save_state(live, {"status": "running"})
            live.task = asyncio.create_task(self._run(live))
        elif action == "stop":
            if live.status not in ("running", "paused"):
                raise ControlError(409, f"Cannot stop a session that is {live.status}")
            await self._finish(live, "stopped", f"Stopped by {actor}")
        else:
            raise ControlError(422, f"Unknown action '{action}'")

        live.broadcast({"type": "state", "session": live.state()})
        return live

    async def emergency_stop(self, reason: str, actor: str) -> list[str]:
        stopped = []
        for live in list(self.live.values()):
            if live.status in ("running", "paused"):
                await self._finish(live, "aborted", f"Emergency stop by {actor}: {reason}")
                live.broadcast({"type": "notice", "level": "critical",
                                "message": f"EMERGENCY STOP by {actor}: {reason}"})
                live.broadcast({"type": "state", "session": live.state()})
                stopped.append(live.id)
        return stopped

    # -------------------------------------------------------------- internals
    async def _begin(self, live: LiveSession, actor: str, action: str) -> None:
        with SessionLocal() as db:
            live.persist_stride = self._stride(db)
            row = db.get(SimSession, live.id)
            live.run = row.run + 1
            # Only the latest run's telemetry is kept; events and warnings of older runs remain.
            db.execute(delete(TelemetryFrame).where(TelemetryFrame.session_id == live.id))
            row.run = live.run
            row.status = "running"
            row.sim_time = 0.0
            row.started_at = utcnow()
            row.ended_at = None
            row.end_reason = ""
            db.commit()
        live.reset_engine()
        live.status = "running"
        live.end_reason = ""
        live.add_event("CONTROL", action=action, by=actor, seed=live.plan.seed,
                       label=f"Simulation {'restarted' if action == 'restart' else 'started'} "
                             f"(run {live.run}, seed {live.plan.seed})")
        live.broadcast({**live.hello(), "type": "reset"})
        live.task = asyncio.create_task(self._run(live))

    async def _halt(self, live: LiveSession) -> None:
        task, live.task = live.task, None
        if task is not None and not task.done():
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass

    async def _finish(self, live: LiveSession, status: str, reason: str) -> None:
        await self._halt(live)
        live.status = status
        live.end_reason = reason
        live.add_event("CONTROL", action=status, label=reason)
        await self._flush(live, {"status": status, "sim_time": live.sim_time,
                                 "ended_at": utcnow(), "end_reason": reason})

    async def _save_state(self, live: LiveSession, state: dict) -> None:
        await asyncio.to_thread(_persist, live.id, live.run, [], [], [], state)

    async def _flush(self, live: LiveSession, state: Optional[dict] = None) -> None:
        frames, events, warnings = live.take_pending()
        if state is None and (frames or events or warnings):
            state = {"sim_time": live.sim_time}
        if frames or events or warnings or state:
            try:
                await asyncio.to_thread(_persist, live.id, live.run, frames, events, warnings, state)
            except Exception:  # persistence must never kill the simulation loop
                log.exception("failed to persist session %s", live.id)

    async def _run(self, live: LiveSession) -> None:
        loop = asyncio.get_running_loop()
        engine = live.engine
        assert engine is not None
        dt = engine.dt
        last = loop.time()
        last_flush = last
        debt = 0.0
        try:
            while live.status == "running":
                await asyncio.sleep(TICK_WALL_S)
                now = loop.time()
                # Cap the catch-up so a stalled host never causes a burst of ticks.
                debt = min(debt + (now - last) * live.speed, live.speed * 0.5 + dt)
                last = now
                batch = []
                while debt >= dt and not engine.finished:
                    frame = engine.step()
                    debt -= dt
                    live.ingest(frame)
                    batch.append(frame)
                if batch:
                    live.broadcast({"type": "frames", "run": live.run, "frames": batch})
                if engine.finished:
                    live.status = "completed"
                    live.end_reason = "Mission plan completed"
                    live.add_event("CONTROL", action="completed", label="Simulation completed")
                    await self._flush(live, {"status": "completed", "sim_time": live.sim_time,
                                             "ended_at": utcnow(), "end_reason": live.end_reason})
                    live.broadcast({"type": "state", "session": live.state()})
                    return
                if now - last_flush >= FLUSH_WALL_S:
                    last_flush = now
                    await self._flush(live)
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("simulation loop crashed for session %s", live.id)
            live.status = "aborted"
            live.end_reason = "Internal simulation error"
            await self._flush(live, {"status": "aborted", "sim_time": live.sim_time,
                                     "ended_at": utcnow(), "end_reason": live.end_reason})
            live.broadcast({"type": "state", "session": live.state()})


manager = SessionManager()
