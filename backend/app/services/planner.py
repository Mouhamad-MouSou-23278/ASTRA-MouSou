"""Natural-language scenario -> strict simulation plan.

Two generators share one validator:

    LLM generator            asks the configured provider for plan JSON
    deterministic generator  keyword/regex interpreter, always available offline

Whatever produced the JSON, it is only ever *data*: it must satisfy the
`SimulationPlan` schema and compile against the world and the active sensor
registry. An LLM cannot make ASTRA run code; an invalid LLM answer is discarded
and the deterministic generator is used instead.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Optional

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from astra_sim import LANDER_RAMP_KEY, PlanError, SimulationPlan, compile_plan

from ..models import FailureSignature, Scenario
from . import registry
from .llm import LLMError, get_llm


@dataclass
class PlanResult:
    plan: Optional[dict] = None
    source: str = "deterministic"
    notes: list[str] = field(default_factory=list)
    problems: list[str] = field(default_factory=list)
    timeline: Optional[dict] = None

    @property
    def valid(self) -> bool:
        return self.plan is not None and not self.problems


@dataclass
class PlannerContext:
    world: dict
    sensors: list[dict]          # active sensors: key, name
    signatures: list[dict]       # failure signatures
    default_seed: int
    scenarios: list[tuple[str, str]]   # (name, prompt)


def load_context(db: Session) -> PlannerContext:
    return PlannerContext(
        world=registry.world_dict(db),
        sensors=[{"key": s.key, "name": s.name} for s in registry.active_sensors(db)],
        signatures=[
            {"key": f.key, "name": f.name, "fault_type": f.fault_type,
             "default_magnitude": f.default_magnitude, "default_duration_s": f.default_duration_s,
             "keywords": f.keywords}
            for f in db.scalars(select(FailureSignature).order_by(FailureSignature.id))
        ],
        default_seed=int(registry.get_config(db, "default_seed", 2026)),
        scenarios=[(s.name, s.prompt) for s in db.scalars(select(Scenario))],
    )


# ------------------------------------------------------------------ validation
def validate_plan(plan_dict: dict, ctx: PlannerContext) -> PlanResult:
    """Schema-validate and compile a plan. Never raises."""
    result = PlanResult()
    try:
        plan = SimulationPlan.model_validate(plan_dict)
    except ValidationError as exc:
        result.problems = [
            f"{'.'.join(str(p) for p in e['loc']) or 'plan'}: {e['msg']}" for e in exc.errors()[:12]
        ]
        return result
    try:
        timeline = compile_plan(plan, registry.world_from_dict(ctx.world), [s["key"] for s in ctx.sensors])
    except PlanError as exc:
        result.problems = exc.problems
        return result
    result.plan = plan.model_dump(mode="json", exclude_none=True)
    result.timeline = timeline.to_dict()
    return result


# --------------------------------------------------------- deterministic parser
_SENSOR_ALIASES = {
    "core_temp": ["core temperature", "core body temperature", "body temperature", "core temp"],
    "skin_temp": ["skin temperature", "skin temp"],
    "heart_rate": ["heart rate", "heartrate", "ecg", "pulse"],
    "respiration_rate": ["respiration", "breathing rate", "respiratory rate"],
    "spo2": ["spo2", "oxygen saturation", "pulse oximeter"],
    "suit_pressure": ["suit pressure"],
    "o2_tank": ["oxygen tank", "o2 tank", "oxygen supply"],
    "ppco2": ["co2", "carbon dioxide"],
    "rad_dose_rate": ["radiation sensor", "dose rate", "radiation detector"],
    "rad_dose_cum": ["dosimeter"],
    "ext_temp": ["external temperature", "outside temperature", "air temperature"],
    "lcg_outlet_temp": ["cooling garment", "coolant temperature", "lcg"],
    "battery": ["battery"],
    "wind_speed": ["wind"],
}
_DURATION = r"(\d+(?:\.\d+)?)\s*(seconds?|secs?|s|minutes?|mins?|m)\b"


def _seconds(value: str, unit: str) -> float:
    return float(value) * (60.0 if unit.startswith("m") else 1.0)


def _find_all(text: str, phrase: str) -> list[int]:
    return [m.start() for m in re.finditer(r"(?<![a-z0-9])" + re.escape(phrase) + r"(?![a-z0-9])", text)]


def deterministic_plan(prompt: str, ctx: PlannerContext, seed: Optional[int]) -> tuple[dict, list[str]]:
    text = " " + re.sub(r"\s+", " ", prompt.lower()) + " "
    notes: list[str] = []

    def has(*phrases: str) -> bool:
        return any(p in text for p in phrases)

    # ---- seed / pace --------------------------------------------------------
    if seed is None:
        m = re.search(r"\bseed\s*(?:=|:|of|is)?\s*(\d{1,9})\b", text)
        seed = int(m.group(1)) if m else ctx.default_seed
    speed = 0.8
    m = re.search(r"(\d+(?:\.\d+)?)\s*m/s", text)
    if m:
        speed = min(1.6, max(0.2, float(m.group(1))))
        notes.append(f"Walking speed set to {speed:g} m/s from the prompt.")
    elif has("slowly", "slow pace", "carefully"):
        speed = 0.55
        notes.append("Slow walking pace (0.55 m/s).")
    elif has("quickly", "fast", "brisk", "hurr"):
        speed = 1.1
        notes.append("Brisk walking pace (1.1 m/s).")

    # ---- destinations in order of first mention -----------------------------
    waypoints = ctx.world["waypoints"]
    route = [w for w in sorted(waypoints, key=lambda w: (w["route_order"] is None, w["route_order"] or 0))
             if w["route_order"] is not None]
    sample_sites = [w for w in waypoints if w["kind"] == "sample_site"]
    mentions: list[tuple[int, list[str], str]] = []   # (position, waypoint keys, why)

    for w in waypoints:
        phrases = {w["name"].lower(), w["key"].lower().replace("_", " ")}
        hits = [p for ph in phrases for p in _find_all(text, ph)]
        if hits:
            mentions.append((min(hits), [w["key"]], f"'{w['name']}' named in the prompt"))
    for phrase in ("defined route", "planned route", "along the route", "along a route",
                   "follow the route", "the route", "a route"):
        hits = _find_all(text, phrase)
        if hits and route:
            mentions.append((min(hits), [w["key"] for w in route], "the defined route"))
            break
    for phrase in ("marked mars surface area", "marked surface area", "marked area", "sample site",
                   "sampling site", "sampling area", "collection site", "marked site"):
        hits = _find_all(text, phrase)
        if hits and sample_sites:
            mentions.append((min(hits), [sample_sites[0]["key"]], "the marked sampling area"))
            break

    sampling = bool(re.search(r"\b(collect\w*|scoop\w*|dig\w*|gather\w*|sampling)\b", text)) or has(
        "soil sample", "take a sample", "takes a sample", "regolith sample")
    kneel = sampling or has("kneel", "crouch", "squat")
    wants_walk = has(" walk", "traverse", "go to", "goes to", "move to", "moves to", "hike",
                     "explore", "reach")

    destinations: list[str] = []
    for _, keys, _why in sorted(mentions, key=lambda m: m[0]):
        for key in keys:
            if key not in destinations:
                destinations.append(key)
    if sampling and sample_sites and not any(
        k in destinations for k in (w["key"] for w in sample_sites)
    ):
        destinations.append(sample_sites[0]["key"])
        notes.append(f"Sampling requested without a location; using {sample_sites[0]['name']}.")
    if not destinations and wants_walk and route:
        destinations = [w["key"] for w in route]
        notes.append("No destination named; using the default route.")
    names = {w["key"]: w["name"] for w in waypoints}
    if destinations:
        notes.append("Route: lander ramp -> " + " -> ".join(names[k] for k in destinations) + ".")

    # ---- activity steps ------------------------------------------------------
    steps: list[dict] = []
    stay_inside = has("stay inside", "remain inside", "stays inside", "remains inside")
    steps.append({"id": "a1", "action": "OPEN_HATCH"})
    if not stay_inside:
        steps.append({"id": "a2", "action": "ASTRONAUT_EXIT"})
    counter = len(steps)

    def add(action: str, **kw) -> str:
        nonlocal counter
        counter += 1
        step_id = f"a{counter}"
        steps.append({"id": step_id, "action": action, **kw})
        return step_id

    sample_keys = {w["key"] for w in sample_sites}
    task_at = next((k for k in destinations if k in sample_keys), destinations[-1] if destinations else None)
    walk_ids: list[str] = []
    wait_id: Optional[str] = None

    collect_s = 75.0
    m = re.search(r"(?:collect|sampl|scoop|dig)\w*[^.;]{0,60}?\bfor\s+" + _DURATION, text)
    if m:
        collect_s = min(600.0, max(10.0, _seconds(m.group(1), m.group(2))))
    wait_s = None
    m = re.search(r"\b(?:wait|waits|waiting|hold|holds|pause|pauses|rest|rests)\b[^.;]{0,30}?" + _DURATION, text)
    if m:
        wait_s = min(1800.0, max(1.0, _seconds(m.group(1), m.group(2))))

    def do_task() -> None:
        nonlocal wait_id
        if stay_inside:
            return
        if kneel:
            add("KNEEL")
            if sampling:
                add("COLLECT_SOIL_SAMPLE", duration_s=collect_s)
            add("STAND_UP")
            if sampling:
                notes.append(f"Soil sample collection lasts {collect_s:.0f} s, then the astronaut stands up.")
        if wait_s is not None:
            wait_id = add("WAIT", duration_s=wait_s)

    if not stay_inside:
        if not destinations:
            do_task()
        for key in destinations:
            walk_ids.append(add("WALK_TO_WAYPOINT", waypoint=key, speed_mps=speed))
            if key == task_at:
                do_task()
        if has("return to the lander", "returns to the lander", "return to lander", "back to the lander",
               "walk back", "walks back", "go back", "goes back", "return to base", "and returns"):
            if destinations:
                walk_ids.append(add("WALK_TO_WAYPOINT", waypoint=LANDER_RAMP_KEY, speed_mps=speed))
                notes.append("Return walk to the lander ramp added.")
    elif wait_s is not None:
        wait_id = add("WAIT", duration_s=wait_s)

    # ---- overlay events ------------------------------------------------------
    events = 0

    def trigger(preferred_walk: int, offset: float, fallback_t: float) -> dict:
        if walk_ids:
            step = walk_ids[min(preferred_walk, len(walk_ids) - 1)]
            return {"at": "step_start", "step": step, "offset_s": offset}
        return {"at": "time", "t_s": fallback_t}

    def intensity(window: str) -> str:
        if re.search(r"\b(severe|extreme|major|strong|intense|dangerous)\b", window):
            return "severe"
        if re.search(r"\b(slight|mild|minor|small|light)\b", window):
            return "mild"
        return "moderate"

    def window_around(pos: int, before: int = 70, after: int = 90) -> str:
        return text[max(0, pos - before): pos + after]

    whole = has("throughout", "entire mission", "whole mission", "until the end", "for the rest")

    rad = re.search(r"radiation|solar particle|solar storm|solar flare", text)
    if rad:
        win = window_around(rad.start())
        level = intensity(win)
        mult = {"mild": 5.0, "moderate": 12.0, "severe": 40.0}[level]
        m = re.search(r"(\d+(?:\.\d+)?)\s*(?:x|times|fold|-fold)\b|\bx\s*(\d+(?:\.\d+)?)", win)
        if m:
            mult = min(500.0, max(0.1, float(m.group(1) or m.group(2))))
        events += 1
        step = {"id": f"e{events}", "action": "RADIATION_EXPOSURE_CHANGE",
                "trigger": trigger(1, 5.0, 30.0), "dose_rate_multiplier": mult, "ramp_s": 40.0}
        if not whole:
            step["duration_s"] = 150.0
        steps.append(step)
        notes.append(f"Radiation: dose rate x{mult:g} ({level}), independent of the thermal event.")

    thermal = re.search(r"thermal|heat stress|heat load|overheat|cooling (?:fail|loop|degrad|loss)", text)
    if thermal:
        win = window_around(thermal.start())
        level = intensity(win)
        heat, eff = {"mild": (350.0, 0.55), "moderate": (600.0, 0.3), "severe": (800.0, 0.2)}[level]
        if re.search(r"cooling (?:fail|loop|degrad|loss)", text):
            heat, eff = 250.0, 0.15
        events += 1
        steps.append({"id": f"e{events}", "action": "THERMAL_LOAD_CHANGE",
                      "trigger": trigger(0, 15.0, 20.0), "external_heat_w": heat,
                      "cooling_efficiency": eff, "ramp_s": 30.0})
        notes.append(
            f"Thermal stress: +{heat:.0f} W external load, suit cooling at {eff * 100:.0f}% ({level}), "
            "independent of the radiation event."
        )

    # sensor faults: pair each fault keyword with the nearest sensor mention
    sensor_hits: list[tuple[int, str]] = []
    active = {s["key"]: s["name"] for s in ctx.sensors}
    for key, name in active.items():
        phrases = {key.replace("_", " "), re.sub(r"\s*\(.*?\)", "", name).lower()}
        phrases.update(_SENSOR_ALIASES.get(key, []))
        for ph in phrases:
            sensor_hits.extend((p, key) for p in _find_all(text, ph))
    fault_hits: list[tuple[int, dict]] = []
    for sig in ctx.signatures:
        for kw in sig["keywords"]:
            fault_hits.extend((p, sig) for p in _find_all(text, kw.lower()))
    seen: set[tuple[str, str]] = set()
    fault_index = 0
    for pos, sig in sorted(fault_hits, key=lambda h: h[0]):
        after = [(p - pos, k) for p, k in sensor_hits if 0 <= p - pos <= 90]
        before = [(pos - p, k) for p, k in sensor_hits if 0 < pos - p <= 70]
        choice = min(after, default=None) or min(before, default=None)
        if choice is None:
            continue
        sensor_key = choice[1]
        if (sensor_key, sig["fault_type"]) in seen:
            continue
        seen.add((sensor_key, sig["fault_type"]))
        duration = sig["default_duration_s"]
        m = re.search(r"\bfor\s+" + _DURATION, text[pos: pos + 110])
        if m:
            duration = min(3600.0, max(1.0, _seconds(m.group(1), m.group(2))))
        if wait_id:
            trig = {"at": "step_start", "step": wait_id, "offset_s": 5.0 + 12.0 * fault_index}
        else:
            trig = trigger(0, 20.0 + 12.0 * fault_index, 15.0 + 12.0 * fault_index)
        events += 1
        step = {"id": f"e{events}", "action": "SENSOR_FAULT_INJECTION", "trigger": trig,
                "sensor_key": sensor_key, "fault": sig["fault_type"], "duration_s": duration}
        if sig["default_magnitude"] is not None:
            step["magnitude"] = sig["default_magnitude"]
        steps.append(step)
        fault_index += 1
        notes.append(f"Sensor fault: '{sig['name']}' on {active[sensor_key]} for {duration:.0f} s.")
    if fault_hits and not fault_index and has("fault", "inject", "malfunction", "sensor fail"):
        notes.append("A sensor fault was mentioned but no active sensor could be identified; none injected.")

    title = next((name for name, p in ctx.scenarios if p.strip().lower() == prompt.strip().lower()), None)
    if title is None:
        title = (prompt.strip().split(".")[0] or "Custom scenario")[:100]
    notes.insert(0, "Interpreted by the deterministic offline planner.")
    return {"version": 1, "title": title, "seed": seed, "steps": steps}, notes


# ----------------------------------------------------------------- LLM planner
def _llm_system_prompt(ctx: PlannerContext) -> str:
    waypoints = "\n".join(
        f"- {w['key']}: {w['name']} ({w['kind']}, x={w['x']:.0f} m east, y={w['y']:.0f} m north)"
        for w in ctx.world["waypoints"]
    )
    sensors = "\n".join(f"- {s['key']}: {s['name']}" for s in ctx.sensors)
    return f"""You convert a mission test description into a simulation plan for ASTRA, a Mars surface EVA simulator.
Reply with one JSON object and nothing else. It is validated strictly; unknown fields are rejected.

Plan shape: {{"version": 1, "title": string, "seed": integer, "steps": [step, ...]}}
Every step has a unique "id" (letters, digits, _ or -) and an "action".

Activity steps run one after another, in list order:
- OPEN_HATCH {{duration_s 2-120}}
- ASTRONAUT_EXIT {{duration_s 5-300}}  (requires OPEN_HATCH first)
- WALK_TO_WAYPOINT {{waypoint: key, speed_mps 0.2-1.6}}  (requires being outside and standing)
- KNEEL {{duration_s 2-30}}
- COLLECT_SOIL_SAMPLE {{duration_s 10-600}}  (requires KNEEL first)
- STAND_UP {{duration_s 2-30}}  (required before walking again)
- WAIT {{duration_s 1-1800}}

Condition steps overlay the activities and need a "trigger":
{{"at": "time", "t_s": seconds}} or {{"at": "step_start" | "step_end", "step": activity step id, "offset_s": seconds}}
- THERMAL_LOAD_CHANGE {{trigger, external_heat_w -400..1200, cooling_efficiency 0.05..1, ramp_s, duration_s optional}}
- RADIATION_EXPOSURE_CHANGE {{trigger, dose_rate_multiplier 0.1..500, ramp_s, duration_s optional}}
- SENSOR_FAULT_INJECTION {{trigger, sensor_key, fault: spike|drift|stuck|disconnect|noise_burst|bias, magnitude optional, duration_s 1-3600}}

The astronaut starts inside the landed lander. "{LANDER_RAMP_KEY}" is the waypoint at the foot of the lander ramp.
Radiation and thermal stress are independent: never model one as causing the other.
A moderate thermal stress event is about external_heat_w 600 with cooling_efficiency 0.3.
Use seed {ctx.default_seed} unless the description gives one.

Waypoints:
{waypoints}

Active sensors:
{sensors}"""


def _extract_json(text: str) -> dict:
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("no JSON object in the model output")
    data = json.loads(text[start: end + 1])
    if not isinstance(data, dict):
        raise ValueError("model output is not a JSON object")
    return data


def generate_plan(db: Session, prompt: str, seed: Optional[int] = None) -> PlanResult:
    ctx = load_context(db)
    llm_notes: list[str] = []
    llm = get_llm() if registry.get_config(db, "ai_mode", "auto") != "local_only" else None
    if llm is not None:
        try:
            data = _extract_json(llm.complete(_llm_system_prompt(ctx), [{"role": "user", "content": prompt}]))
            if seed is not None:
                data["seed"] = seed
            result = validate_plan(data, ctx)
            if result.valid:
                result.source = f"llm:{llm.name}"
                result.notes = [f"Generated by {llm.name} and accepted by the strict plan validator."]
                return result
            llm_notes.append(
                "The LLM plan failed validation (" + "; ".join(result.problems[:3]) +
                "); the deterministic planner was used instead."
            )
        except (LLMError, ValueError) as exc:
            llm_notes.append(f"LLM planner unavailable ({exc}); the deterministic planner was used instead.")

    plan_dict, notes = deterministic_plan(prompt, ctx, seed)
    result = validate_plan(plan_dict, ctx)
    result.source = "deterministic"
    result.notes = llm_notes + notes
    if not result.valid and result.plan is None:
        result.plan = None
    return result
