"""The deterministic simulation engine.

One call to `SimulationEngine.step()` advances simulated time by `dt` and runs
the three strictly separated layers in order:

    1. Ground truth     physics.GroundTruthModel   (driven by plan + seed)
    2. Sensor output    sensors.SensorModel        (truth + noise/faults)
    3. Analytical       quality (data quality) -> rules (medical warnings)

Layer 3 receives layer 2 output only. Given the same EngineConfig the engine
produces a bit-identical sequence of frames, so Restart replays a session
exactly. The engine has no I/O, no clock and no framework imports.
"""
from __future__ import annotations

import math
from collections import deque
from dataclasses import dataclass, field
from typing import Optional

from .physics import ActivityInput, AstronautParams, GroundTruthModel, OverlayInput
from .plan import SimulationPlan
from .quality import (
    DataQualityAssessor,
    QualityMonitor,
    RawSample,
    RuleBasedQualityAssessor,
)
from .rules import MedicalRule, RuleEngine, TrustedSample
from .sensors import Fault, SensorModel, SensorSpec
from .timeline import Overlay, Segment, Timeline, compile_plan
from .util import angle_diff
from .world import World

RAW_WINDOW_S = 90.0       # raw history kept for the quality assessor
SERIES_WINDOW_S = 620.0   # trusted history kept for rule windows


@dataclass
class EngineConfig:
    plan: SimulationPlan
    world: World
    astronaut: AstronautParams = field(default_factory=AstronautParams)
    sensors: list[SensorSpec] = field(default_factory=list)
    rules: list[MedicalRule] = field(default_factory=list)
    dt: float = 0.5
    assessor: Optional[DataQualityAssessor] = None


def _r(value: Optional[float], digits: int = 4) -> Optional[float]:
    return None if value is None else round(value, digits)


class SimulationEngine:
    def __init__(self, cfg: EngineConfig) -> None:
        self.cfg = cfg
        self.dt = cfg.dt
        self.timeline: Timeline = compile_plan(cfg.plan, cfg.world, [s.key for s in cfg.sensors])
        seed = cfg.plan.seed
        self._truth = GroundTruthModel(cfg.astronaut, seed)
        self._sensors = {s.key: SensorModel(s, seed) for s in cfg.sensors}
        for ov in self.timeline.overlays:
            if ov.action == "SENSOR_FAULT_INJECTION":
                self._sensors[ov.params["sensor_key"]].add_fault(
                    Fault(ov.step_id, ov.params["fault"], ov.t_start, ov.t_end, ov.params["magnitude"])
                )
        self.assessor: DataQualityAssessor = cfg.assessor or RuleBasedQualityAssessor()
        self._monitor = QualityMonitor()
        self._rules = RuleEngine(cfg.rules, cfg.sensors, cfg.dt)
        raw_len = int(math.ceil(RAW_WINDOW_S / cfg.dt))
        series_len = int(math.ceil(SERIES_WINDOW_S / cfg.dt))
        self._raw: dict[str, deque[RawSample]] = {k: deque(maxlen=raw_len) for k in self._sensors}
        self._series: dict[str, deque[TrustedSample]] = {
            k: deque(maxlen=series_len) for k in self._sensors
        }

        # Posture bookkeeping per segment (is the astronaut outside / kneeling before it?)
        self._outside_before: list[bool] = []
        self._kneel_before: list[bool] = []
        outside = kneeling = False
        for seg in self.timeline.segments:
            self._outside_before.append(outside)
            self._kneel_before.append(kneeling)
            if seg.action == "ASTRONAUT_EXIT":
                outside = True
            elif seg.action == "KNEEL":
                kneeling = True
            elif seg.action == "STAND_UP":
                kneeling = False
        self._outside_end, self._kneel_end = outside, kneeling

        self.seq = 0
        self.t = 0.0
        self._seg_idx = -1
        self._mission_complete = False
        self._ov_started: set[str] = set()
        self._ov_ended: set[str] = set()
        self._event_seq = 0

    # ------------------------------------------------------------------ state
    @property
    def finished(self) -> bool:
        return self.t >= self.timeline.duration_s - 1e-9

    def _event(self, events: list[dict], type_: str, **payload) -> None:
        self._event_seq += 1
        events.append({"id": self._event_seq, "t": self.t, "type": type_, **payload})

    # --------------------------------------------------------------- layer 1a
    def _activity(self, t: float, events: list[dict]) -> tuple[ActivityInput, dict, Optional[dict]]:
        segs = self.timeline.segments
        idx = self._seg_idx
        while idx + 1 < len(segs) and t >= segs[idx + 1].t_start:
            if idx >= 0:
                self._event(events, "STEP_COMPLETED", step_id=segs[idx].step_id,
                            action=segs[idx].action, label=segs[idx].label)
            idx += 1
            self._event(events, "STEP_STARTED", step_id=segs[idx].step_id,
                        action=segs[idx].action, label=segs[idx].label)
        self._seg_idx = idx

        if idx >= 0 and t >= segs[idx].t_end and idx == len(segs) - 1:
            if not self._mission_complete:
                self._mission_complete = True
                self._event(events, "STEP_COMPLETED", step_id=segs[idx].step_id,
                            action=segs[idx].action, label=segs[idx].label)
                self._event(events, "MISSION_COMPLETE", label="All planned activities complete")
            last = segs[-1]
            outside, kneeling = self._outside_end, self._kneel_end
            pose = "kneeling" if kneeling else ("idle" if outside else "inside")
            astro = self._astro(last.x1, last.y1, last.heading1, pose, 1.0, 0.0,
                                1.0 if outside else 0.0, outside)
            return ActivityInput("IDLE", 0.0, 0.0, outside), astro, None

        seg: Segment = segs[idx]
        outside = self._outside_before[idx]
        kneeling = self._kneel_before[idx]
        progress = min(1.0, max(0.0, (t - seg.t_start) / seg.duration))
        x, y, heading = seg.x0, seg.y0, seg.heading0
        egress = 1.0 if outside else 0.0
        speed = 0.0
        act = ActivityInput(seg.action, 0.0, 0.0, outside)
        pose, pose_t = "idle", progress
        a = seg.action

        if a == "OPEN_HATCH":
            pose = "inside"
        elif a == "ASTRONAUT_EXIT":
            pose, egress = "egress", progress
            x = seg.x0 + (seg.x1 - seg.x0) * progress
            y = seg.y0 + (seg.y1 - seg.y0) * progress
            speed = seg.distance_m / seg.duration
            act.outside = True
        elif a == "WALK_TO_WAYPOINT":
            elapsed = t - seg.t_start
            if elapsed < seg.turn_s:
                pose = "turn"
                pose_t = elapsed / seg.turn_s
                heading = (seg.heading0 + angle_diff(seg.heading0, seg.heading1) * pose_t) % 360.0
                act.action = "TURN"
            else:
                pose = "walk"
                frac = min(1.0, (elapsed - seg.turn_s) / max(seg.duration - seg.turn_s, 1e-9))
                pose_t = frac
                x = seg.x0 + (seg.x1 - seg.x0) * frac
                y = seg.y0 + (seg.y1 - seg.y0) * frac
                heading = seg.heading1
                speed = seg.speed
                act = ActivityInput("WALK", speed, self.cfg.world.grade(x, y, heading), True)
        elif a == "KNEEL":
            pose = "kneel_down"
        elif a == "COLLECT_SOIL_SAMPLE":
            pose = "collect"
        elif a == "STAND_UP":
            pose = "stand_up"
        else:  # WAIT
            pose = "kneeling" if kneeling else ("idle" if outside else "inside")

        astro = self._astro(x, y, heading, pose, pose_t, speed, egress, outside or a == "ASTRONAUT_EXIT")
        activity = {"step_id": seg.step_id, "action": a, "label": seg.label,
                    "index": seg.index, "progress": round(progress, 4)}
        return act, astro, activity

    def _astro(self, x, y, heading, pose, pose_t, speed, egress, outside) -> dict:
        hatch = 0.0
        segs = self.timeline.segments
        for seg in segs:
            if seg.action == "OPEN_HATCH":
                hatch = min(1.0, max(0.0, (self.t - seg.t_start) / seg.duration))
                break
        return {"x": round(x, 3), "y": round(y, 3), "heading": round(heading, 2), "pose": pose,
                "pose_t": round(pose_t, 4), "speed": round(speed, 3), "egress": round(egress, 4),
                "outside": outside, "hatch_open": round(hatch, 3)}

    # --------------------------------------------------------------- layer 1b
    @staticmethod
    def _intensity(ov: Overlay, t: float) -> float:
        if t < ov.t_start:
            return 0.0
        rise = 1.0 if ov.ramp_s <= 0 else min(1.0, (t - ov.t_start) / ov.ramp_s)
        if t < ov.t_end:
            return rise
        if ov.ramp_s <= 0:
            return 0.0
        return max(0.0, 1.0 - (t - ov.t_end) / ov.ramp_s)

    def _overlays(self, t: float, events: list[dict]) -> tuple[OverlayInput, dict]:
        inp = OverlayInput()
        active = []
        for ov in self.timeline.overlays:
            if t >= ov.t_start and ov.step_id not in self._ov_started:
                self._ov_started.add(ov.step_id)
                self._event(events, "CONDITION_STARTED", step_id=ov.step_id, action=ov.action,
                            label=ov.label, params=ov.params)
            if t >= ov.t_end and ov.step_id not in self._ov_ended:
                self._ov_ended.add(ov.step_id)
                self._event(events, "CONDITION_ENDED", step_id=ov.step_id, action=ov.action,
                            label=ov.label)
            f = self._intensity(ov, t)
            if f <= 0.0:
                continue
            if ov.action == "THERMAL_LOAD_CHANGE":
                inp.external_heat_w += f * ov.params["external_heat_w"]
                inp.cooling_efficiency *= 1.0 - f * (1.0 - ov.params["cooling_efficiency"])
            elif ov.action == "RADIATION_EXPOSURE_CHANGE":
                inp.radiation_multiplier *= 1.0 + f * (ov.params["dose_rate_multiplier"] - 1.0)
            active.append({"step_id": ov.step_id, "action": ov.action, "label": ov.label,
                           "intensity": round(f, 3), "since": ov.t_start})
        summary = {
            "external_heat_w": round(inp.external_heat_w, 2),
            "cooling_efficiency": round(inp.cooling_efficiency, 4),
            "radiation_multiplier": round(inp.radiation_multiplier, 4),
            "active": active,
        }
        return inp, summary

    # ------------------------------------------------------------------- step
    def step(self) -> dict:
        """Advance one tick and return the frame for the new time."""
        self.seq += 1
        self.t = round(self.seq * self.dt, 6)
        t, dt = self.t, self.dt
        events: list[dict] = []

        # Layer 1 - ground truth
        act, astro, activity = self._activity(t, events)
        overlay_in, conditions = self._overlays(t, events)
        truth = self._truth.step(dt, act, overlay_in)

        # Layer 2 - sensor output
        readings: dict[str, Optional[float]] = {}
        for key, model in self._sensors.items():
            channel = model.spec.channel
            readings[key] = model.sample(t, dt, truth.get(channel) if channel else None)

        # Layer 3a - data quality (sees sensor output only)
        sensors_out: dict[str, list] = {}
        for key, model in self._sensors.items():
            self._raw[key].append(RawSample(t, readings[key]))
        for key, model in self._sensors.items():
            qa = self.assessor.assess(model.spec, self._raw[key], self._raw)
            for ev in self._monitor.update(t, model.spec, qa):
                self._event(events, ev["type"], warning=ev["warning"])
            self._series[key].append(TrustedSample(t, readings[key], qa.status))
            sensors_out[key] = [_r(readings[key]), qa.status, list(qa.flags)]

        # Layer 3b - medical rules (trusted sensor output only)
        rule_events, rule_status = self._rules.evaluate(t, self._series)
        for ev in rule_events:
            payload = {k: v for k, v in ev.items() if k != "type"}
            self._event(events, ev["type"], **payload)

        return {
            "seq": self.seq,
            "t": t,
            "activity": activity,
            "astronaut": astro,
            "truth": {k: _r(v) for k, v in truth.items()},
            "sensors": sensors_out,
            "conditions": conditions,
            "warnings": {
                "medical": self._rules.active_warnings,
                "data_quality": [dict(w) for w in self._monitor.active.values()],
            },
            "rules": rule_status,
            "events": events,
            "done": self.finished,
        }
