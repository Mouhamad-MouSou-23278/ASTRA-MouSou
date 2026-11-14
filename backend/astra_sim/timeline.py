"""Compile a validated plan into an absolute, deterministic timeline."""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Iterable, Optional

from .plan import (
    ACTIVITY_ACTIONS,
    MAX_PLAN_DURATION_S,
    PlanError,
    SimulationPlan,
    Trigger,
)
from .util import angle_diff, heading_deg
from .world import World

TAIL_S = 20.0            # the simulation keeps running this long after the last activity
TURN_RATE_DEG_S = 60.0   # how fast the astronaut pivots before walking


@dataclass(frozen=True)
class Segment:
    """One activity step with resolved times and geometry."""

    step_id: str
    action: str
    index: int
    t_start: float
    t_end: float
    x0: float
    y0: float
    x1: float
    y1: float
    heading0: float
    heading1: float
    label: str
    turn_s: float = 0.0
    speed: float = 0.0
    waypoint: Optional[str] = None
    distance_m: float = 0.0

    @property
    def duration(self) -> float:
        return self.t_end - self.t_start


@dataclass(frozen=True)
class Overlay:
    """One environmental/fault event with resolved times."""

    step_id: str
    action: str
    t_start: float
    t_end: float
    ramp_s: float
    params: dict
    label: str


@dataclass
class Timeline:
    segments: list[Segment]
    overlays: list[Overlay]
    activity_end_s: float
    duration_s: float
    path: list[tuple[float, float]] = field(default_factory=list)
    distance_m: float = 0.0

    def to_dict(self) -> dict:
        return {
            "duration_s": round(self.duration_s, 2),
            "activity_end_s": round(self.activity_end_s, 2),
            "distance_m": round(self.distance_m, 1),
            "path": [[round(x, 2), round(y, 2)] for x, y in self.path],
            "segments": [
                {
                    "step_id": s.step_id, "action": s.action, "index": s.index, "label": s.label,
                    "t_start": round(s.t_start, 2), "t_end": round(s.t_end, 2),
                    "from": [round(s.x0, 2), round(s.y0, 2)], "to": [round(s.x1, 2), round(s.y1, 2)],
                    "waypoint": s.waypoint, "distance_m": round(s.distance_m, 1),
                }
                for s in self.segments
            ],
            "overlays": [
                {
                    "step_id": o.step_id, "action": o.action, "label": o.label,
                    "t_start": round(o.t_start, 2),
                    # None = lasts until the end of the mission (JSON has no infinity)
                    "t_end": None if math.isinf(o.t_end) else round(o.t_end, 2),
                    "ramp_s": o.ramp_s, "params": o.params,
                }
                for o in self.overlays
            ],
        }


def compile_plan(plan: SimulationPlan, world: World, sensor_keys: Iterable[str]) -> Timeline:
    """Resolve every step to absolute times/positions, or raise PlanError.

    Enforces the physical state machine (hatch must be open before egress, the
    astronaut must be standing on the surface to walk, kneeling to collect a
    sample, ...) so an invalid sequence is rejected before anything runs.
    """
    problems: list[str] = []
    known_sensors = set(sensor_keys)

    ids = [s.id for s in plan.steps]
    dupes = sorted({i for i in ids if ids.count(i) > 1})
    if dupes:
        problems.append(f"duplicate step ids: {', '.join(dupes)}")

    segments: list[Segment] = []
    t = 0.0
    door_x, door_y = world.door
    x, y = door_x, door_y
    heading = world.hatch_heading
    hatch_open = False
    outside = False
    kneeling = False
    path: list[tuple[float, float]] = []
    distance = 0.0

    for step in plan.steps:
        if step.action not in ACTIVITY_ACTIONS:
            continue
        idx = len(segments)
        a = step.action
        x1, y1, h1 = x, y, heading
        turn_s = speed = dist = 0.0
        waypoint = None
        duration = getattr(step, "duration_s", 0.0)

        if a == "OPEN_HATCH":
            if hatch_open:
                problems.append(f"{step.id}: hatch is already open")
            hatch_open = True
            label = "Open lander hatch"
        elif a == "ASTRONAUT_EXIT":
            if not hatch_open:
                problems.append(f"{step.id}: OPEN_HATCH must come before ASTRONAUT_EXIT")
            if outside:
                problems.append(f"{step.id}: astronaut is already outside")
            outside = True
            x1, y1 = world.ramp_foot
            dist = math.hypot(x1 - x, y1 - y)
            label = "Exit lander down the egress ramp"
            path.extend([(x, y), (x1, y1)])
        elif a == "WALK_TO_WAYPOINT":
            if not outside:
                problems.append(f"{step.id}: astronaut must exit the lander before walking")
            if kneeling:
                problems.append(f"{step.id}: astronaut must STAND_UP before walking")
            wp = world.waypoints.get(step.waypoint)
            if wp is None:
                problems.append(
                    f"{step.id}: unknown waypoint '{step.waypoint}' "
                    f"(known: {', '.join(sorted(world.waypoints))})"
                )
                continue
            waypoint = wp.key
            x1, y1 = wp.x, wp.y
            dist = math.hypot(x1 - x, y1 - y)
            if dist < 0.5:
                problems.append(f"{step.id}: astronaut is already at waypoint '{wp.key}'")
                continue
            h1 = heading_deg(x1 - x, y1 - y)
            turn_s = abs(angle_diff(heading, h1)) / TURN_RATE_DEG_S
            speed = step.speed_mps
            duration = turn_s + dist / speed
            label = f"Walk to {wp.name} ({dist:.0f} m)"
            if not path:
                path.append((x, y))
            path.append((x1, y1))
        elif a == "KNEEL":
            if not outside:
                problems.append(f"{step.id}: astronaut must be on the surface to kneel")
            if kneeling:
                problems.append(f"{step.id}: astronaut is already kneeling")
            kneeling = True
            label = "Kneel down"
        elif a == "COLLECT_SOIL_SAMPLE":
            if not kneeling:
                problems.append(f"{step.id}: KNEEL must come before COLLECT_SOIL_SAMPLE")
            label = "Collect soil sample"
        elif a == "STAND_UP":
            if not kneeling:
                problems.append(f"{step.id}: astronaut is not kneeling")
            kneeling = False
            label = "Stand up"
        else:  # WAIT
            label = f"Hold position ({duration:.0f} s)"

        segments.append(
            Segment(
                step_id=step.id, action=a, index=idx, t_start=t, t_end=t + duration,
                x0=x, y0=y, x1=x1, y1=y1, heading0=heading, heading1=h1, label=label,
                turn_s=turn_s, speed=speed, waypoint=waypoint, distance_m=dist,
            )
        )
        distance += dist
        t += duration
        x, y, heading = x1, y1, h1

    if not segments and not problems:
        problems.append("plan has no activity steps (only environmental events)")

    activity_end = t
    by_id = {s.step_id: s for s in segments}

    def resolve(step_id: str, trig: Trigger) -> Optional[float]:
        if trig.at == "time":
            return trig.t_s
        if not trig.step:
            problems.append(f"{step_id}: trigger '{trig.at}' needs a 'step' id")
            return None
        seg = by_id.get(trig.step)
        if seg is None:
            problems.append(f"{step_id}: trigger references unknown activity step '{trig.step}'")
            return None
        return (seg.t_start if trig.at == "step_start" else seg.t_end) + trig.offset_s

    overlays: list[Overlay] = []
    for step in plan.steps:
        a = step.action
        if a in ACTIVITY_ACTIONS:
            continue
        t0 = resolve(step.id, step.trigger)
        if t0 is None:
            continue
        ramp = getattr(step, "ramp_s", 0.0)
        dur = step.duration_s
        t1 = t0 + dur if dur is not None else math.inf
        if a == "THERMAL_LOAD_CHANGE":
            if step.external_heat_w == 0.0 and step.cooling_efficiency == 1.0:
                problems.append(f"{step.id}: thermal event changes nothing")
            params = {"external_heat_w": step.external_heat_w,
                      "cooling_efficiency": step.cooling_efficiency}
            label = (f"Thermal load {step.external_heat_w:+.0f} W, "
                     f"cooling at {step.cooling_efficiency * 100:.0f}%")
        elif a == "RADIATION_EXPOSURE_CHANGE":
            params = {"dose_rate_multiplier": step.dose_rate_multiplier}
            label = f"Radiation dose rate x{step.dose_rate_multiplier:g}"
        else:  # SENSOR_FAULT_INJECTION
            if step.sensor_key not in known_sensors:
                problems.append(f"{step.id}: unknown or inactive sensor '{step.sensor_key}'")
                continue
            params = {"sensor_key": step.sensor_key, "fault": step.fault,
                      "magnitude": step.magnitude}
            label = f"Inject '{step.fault}' fault on sensor {step.sensor_key}"
        if t0 > activity_end + TAIL_S:
            problems.append(f"{step.id}: starts at {t0:.0f} s, after the mission ends")
        overlays.append(Overlay(step.id, a, t0, t1, ramp, params, label))

    duration_s = activity_end + TAIL_S
    if duration_s > MAX_PLAN_DURATION_S:
        problems.append(
            f"plan lasts {duration_s:.0f} s; the maximum is {MAX_PLAN_DURATION_S:.0f} s"
        )
    if problems:
        raise PlanError(problems)

    overlays.sort(key=lambda o: (o.t_start, o.step_id))
    return Timeline(segments, overlays, activity_end, duration_s, path, distance)
