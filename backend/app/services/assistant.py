"""ASTRA AI - context-aware mission assistant.

The assistant explains what the monitoring pipeline is showing. Its context is
built from *sensor output and analytical output only* (never ground truth), plus
the scripted scenario events and the medical knowledge base. It therefore cannot
quote a value the dashboards do not show.

Two back ends share the same context:
    LLM provider (optional)    natural-language answer grounded in the context
    local explainer (default)  deterministic templates over the same numbers
If the LLM is missing, slow or fails, the local explainer answers instead.
"""
from __future__ import annotations

import json
import re
from typing import Optional

from astra_sim.util import linear_slope

from ..config import DATA_LABEL
from .llm import LLMError, LLMProvider
from .runtime import LiveSession

LOCAL_NAME = "local-deterministic"

SYSTEM_PROMPT = """You are ASTRA, the onboard health-monitoring assistant for an astronaut on a simulated Mars surface walk.
You are speaking with the astronaut or with mission staff watching the same session.

Ground rules:
- Use only the readings, trends, warnings and events in the LIVE CONTEXT JSON. Never invent or estimate a number that is not there. If something is not in the context, say you do not have it.
- Explain causes plainly: say what the sensors show, which scripted scenario event or activity explains it, and what the configured medical rule is reacting to.
- Radiation exposure and thermal stress are independent. Never say or imply that radiation is raising body temperature or any other vital sign.
- Keep data-quality problems (disconnected, spike, stuck, drift, noise) separate from medical warnings. If a sensor's quality is not "good", say its reading is not trusted rather than interpreting it medically.
- When you give advice, use the recommendations in the context and name the knowledge-base source if one is listed.
- All data is simulated; say so briefly when giving health guidance. You support the crew and flight surgeon and do not replace them.
- Answer in natural spoken English, in at most about 120 words, with no markdown, headings or bullet lists. Use the same units as the context and write temperatures as degrees Celsius."""


def _mmss(t: float) -> str:
    t = max(0, int(round(t)))
    return f"T+{t // 60:02d}:{t % 60:02d}"


def _trusted(frames: list[dict], key: str, since: float, limit: int = 0) -> list[tuple[float, float]]:
    """Trusted (quality == good) readings of one sensor from sensor output."""
    out = []
    for f in frames:
        if f["t"] < since:
            continue
        v, q, _ = f["sensors"].get(key, (None, "missing", []))
        if v is not None and q == "good":
            out.append((f["t"], v))
            if limit and len(out) >= limit:
                break
    return out


def build_context(live: LiveSession) -> dict:
    """Snapshot of what the monitoring pipeline currently knows (no ground truth)."""
    frames = list(live.frames)
    last = frames[-1] if frames else None
    now = last["t"] if last else 0.0
    sensors = {}
    for meta in live.snapshot["sensors"]:
        key = meta["key"]
        entry = {"name": meta["name"], "unit": meta["unit"], "category": meta["category"]}
        if last:
            v, q, flags = last["sensors"].get(key, (None, "missing", []))
            entry.update({"value": v, "quality": q, "quality_flags": flags})
            base = _trusted(frames, key, 0.0, limit=40)
            if base:
                baseline = sum(v for _, v in base) / len(base)
                entry["baseline"] = round(baseline, 3)
                if v is not None and q == "good":
                    entry["change_from_baseline"] = round(v - baseline, 3)
            recent = _trusted(frames[-200:], key, now - 60.0)
            if len(recent) >= 20:
                slope = linear_slope(recent)
                if slope is not None:
                    entry["trend_per_min"] = round(slope * 60.0, 4)
            run = _trusted(frames, key, 0.0)
            if run:
                entry["min"] = round(min(v for _, v in run), 3)
                entry["max"] = round(max(v for _, v in run), 3)
        sensors[key] = entry

    knowledge = live.snapshot.get("knowledge", {})
    medical, relevant = [], set()
    if last:
        for w in last["warnings"]["medical"]:
            medical.append({
                "rule": w["name"], "severity": w["severity"], "message": w["message"],
                "raised_at": _mmss(w["raised_at"]), "condition": w.get("condition_name"),
                "evidence": [
                    {"sensor": e["sensor_name"], "measure": e["aggregation"], "value": e["value"],
                     "limit": f"{e['operator']} {e['threshold']}", "unit": e["unit"]}
                    for e in w.get("evidence", [])
                ],
                "recommendations": w.get("recommendations", []),
            })
            if w.get("condition_key"):
                relevant.add(w["condition_key"])
    for key in ("heat_strain", "radiation_exposure"):
        if key in knowledge:
            relevant.add(key)

    events = []
    for ev in live.events:
        if ev["type"] in ("CONDITION_STARTED", "CONDITION_ENDED", "STEP_STARTED", "MISSION_COMPLETE",
                          "RULE_INHIBITED", "CONTROL"):
            events.append({"time": _mmss(ev["t"]), "type": ev["type"],
                           "what": ev.get("label") or ev.get("message", "")})
        elif "WARNING" in ev["type"]:
            w = ev["warning"]
            events.append({"time": _mmss(ev["t"]), "type": ev["type"],
                           "what": f"{w['kind']}: {w['message']}"})

    astronaut = live.snapshot.get("astronaut") or {}
    return {
        "data_label": DATA_LABEL,
        "session": {"name": live.name, "status": live.status, "mission_time": _mmss(now),
                    "planned_duration": _mmss(live.duration_s), "playback_speed": live.speed},
        "astronaut": {"callsign": astronaut.get("callsign"), "synthetic_profile": True,
                      "resting_heart_rate": astronaut.get("resting_hr"),
                      "baseline_core_temp": astronaut.get("baseline_core_temp_c")},
        "current_activity": (last or {}).get("activity"),
        "position_m": {"east": last["astronaut"]["x"], "north": last["astronaut"]["y"]} if last else None,
        "sensors": sensors,
        "active_medical_warnings": medical,
        "active_data_quality_warnings": [
            {"sensor": w["sensor_name"], "problem": w["key"], "message": w["message"],
             "since": _mmss(w["raised_at"])}
            for w in (last["warnings"]["data_quality"] if last else [])
        ],
        "rule_monitor": [
            {"rule": r["name"], "state": r["state"], "inhibited_by": r["inhibited_by"]}
            for r in (last["rules"] if last else [])
        ],
        "active_scenario_conditions": [
            {"what": c["label"], "since": _mmss(c["since"]), "kind": c["action"]}
            for c in (last["conditions"]["active"] if last else [])
        ],
        "timeline": events[-25:],
        "mission_plan": [
            {"step": s.label, "from": _mmss(s.t_start), "to": _mmss(s.t_end)} for s in live.timeline.segments
        ],
        "medical_knowledge": {k: knowledge[k] for k in sorted(relevant) if k in knowledge},
    }


# ----------------------------------------------------------- local explainer
_INTENTS: list[tuple[str, tuple[str, ...]]] = [
    ("temperature", ("temperature", "temp ", "temp?", "hot", "heat", "overheat", "warm", "thermal", "fever", "sweat")),
    ("radiation", ("radiation", "dose", "dosimeter", "solar", "sievert")),
    ("heart", ("heart", "pulse", "bpm", "cardiac")),
    ("breathing", ("breath", "respir", "oxygen", "o2", "spo2", "co2")),
    ("quality", ("data quality", "sensor", "fault", "trust", "reliable", "disconnect", "spike", "drift", "stuck")),
    ("action", ("what should", "should i", "what do i do", "recommend", "advice", "advise", "what now", "what can i do")),
    ("warning", ("warning", "alert", "alarm", "caution", "advisory")),
    ("suit", ("suit", "pressure", "battery", "cooling", "coolant", "tank")),
    ("mission", ("mission", "plan", "where am i", "location", "progress", "how long", "remaining", "task", "waypoint", "next")),
    ("status", ("status", "how am i", "am i ok", "okay", "vitals", "summary", "report", "overview", "doing")),
    ("help", ("help", "what can you", "who are you")),
]


def _intent(question: str) -> str:
    q = " " + question.lower().strip() + " "
    scores = {name: sum(1 for kw in kws if kw in q) for name, kws in _INTENTS}
    best = max(scores, key=lambda k: scores[k])
    return best if scores[best] > 0 else "status"


def _val(ctx: dict, key: str, digits: int = 1) -> Optional[str]:
    s = ctx["sensors"].get(key)
    if not s or s.get("value") is None:
        return None
    unit = {"degC": "degrees Celsius", "uSv/h": "microsieverts per hour", "uSv": "microsieverts",
            "bpm": "beats per minute", "%": "percent"}.get(s["unit"], s["unit"])
    return f"{s['value']:.{digits}f} {unit}"


def _untrusted(ctx: dict, key: str) -> Optional[str]:
    s = ctx["sensors"].get(key)
    if s and s.get("quality") not in (None, "good"):
        flags = ", ".join(s.get("quality_flags") or []) or s["quality"]
        return (f"The {s['name']} reading is currently not trusted ({flags.lower().replace('_', ' ')}), "
                "so I will not interpret it medically until the data quality recovers.")
    return None


def _condition_started(ctx: dict, kind: str) -> Optional[dict]:
    return next((c for c in ctx["active_scenario_conditions"] if c["kind"] == kind), None)


def _warning_for(ctx: dict, word: str) -> Optional[dict]:
    return next((w for w in ctx["active_medical_warnings"]
                 if word in (w.get("condition") or "").lower() or word in w["rule"].lower()), None)


def _sources(ctx: dict, condition_key: str) -> str:
    srcs = ctx["medical_knowledge"].get(condition_key, {}).get("sources", [])
    return f" Reference: {srcs[0]['title']}." if srcs else ""


def _recs(ctx: dict, condition_key: str, warning: Optional[dict]) -> str:
    recs = (warning or {}).get("recommendations") or ctx["medical_knowledge"].get(
        condition_key, {}).get("recommendations", {}).get("astronaut", [])
    return " Recommended: " + " ".join(recs[:2]) if recs else ""


def _radiation_note(ctx: dict) -> str:
    rate = ctx["sensors"].get("rad_dose_rate", {})
    elevated = _condition_started(ctx, "RADIATION_EXPOSURE_CHANGE") or _warning_for(ctx, "radiation")
    if elevated and rate.get("value") is not None:
        return (f" The radiation dose rate is also elevated at {_val(ctx, 'rad_dose_rate', 0)}, but that is a "
                "separate, independent factor: short-term radiation exposure does not raise body temperature.")
    return ""


def _temperature(ctx: dict) -> str:
    bad = _untrusted(ctx, "core_temp")
    if bad:
        return bad
    core = ctx["sensors"].get("core_temp", {})
    if core.get("value") is None:
        return "I do not have a core temperature reading yet."
    trend = core.get("trend_per_min")
    delta = core.get("change_from_baseline")
    parts = [f"Your core temperature is {_val(ctx, 'core_temp', 2)}"]
    if delta is not None:
        parts[0] += f", {abs(delta):.2f} degrees {'above' if delta >= 0 else 'below'} your baseline"
    if trend is None:
        parts[0] += "."
    elif trend > 0.03:
        parts[0] += f", and it is rising at about {trend:.2f} degrees per minute."
    elif trend < -0.03:
        parts[0] += f", and it is falling at about {abs(trend):.2f} degrees per minute."
    else:
        parts[0] += ", and it is steady."

    rising = (trend or 0) > 0.03 or (delta or 0) > 0.3
    thermal = _condition_started(ctx, "THERMAL_LOAD_CHANGE")
    if rising:
        lcg, skin = ctx["sensors"].get("lcg_outlet_temp", {}), ctx["sensors"].get("skin_temp", {})
        evidence = []
        if lcg.get("value") is not None and lcg.get("quality") == "good" and (lcg.get("change_from_baseline") or 0) > 2:
            evidence.append(f"the cooling garment coolant is returning at {_val(ctx, 'lcg_outlet_temp')}, "
                            f"well above its {lcg['baseline']:.1f} degree baseline")
        if skin.get("value") is not None and skin.get("quality") == "good" and (skin.get("change_from_baseline") or 0) > 1:
            evidence.append(f"skin temperature is up to {_val(ctx, 'skin_temp')}")
        if evidence:
            parts.append("The sensors show why: " + " and ".join(evidence) +
                         ", so the suit is removing less heat than your body and the environment are adding.")
        if thermal:
            parts.append(f"In this scenario a thermal stress event began at {thermal['since']} "
                         f"({thermal['what'].lower()}).")
        met = ctx["sensors"].get("metabolic_rate", {})
        act = ctx.get("current_activity") or {}
        if met.get("value") is not None and met["value"] > 200:
            doing = f" while you {act['label'].lower()}" if act.get("label") else ""
            parts.append(f"Your own workload adds about {met['value']:.0f} watts of metabolic heat{doing}.")
        parts.append(_radiation_note(ctx).strip())
    warning = _warning_for(ctx, "heat")
    if warning:
        parts.append(f"The medical rule '{warning['rule']}' has been active since {warning['raised_at']}.")
    if rising or warning:
        parts.append((_recs(ctx, "heat_strain", warning) + _sources(ctx, "heat_strain")).strip())
    elif not thermal:
        parts.append("No heat strain rule is active.")
    return " ".join(p for p in parts if p)


def _radiation(ctx: dict) -> str:
    bad = _untrusted(ctx, "rad_dose_rate")
    if bad:
        return bad
    rate = ctx["sensors"].get("rad_dose_rate", {})
    if rate.get("value") is None:
        return "I do not have a radiation dose rate reading yet."
    parts = [f"The ambient radiation dose rate is {_val(ctx, 'rad_dose_rate', 0)}"]
    if rate.get("baseline"):
        ratio = rate["value"] / max(rate["baseline"], 1e-6)
        parts[0] += (f", about {ratio:.0f} times the {rate['baseline']:.0f} baseline." if ratio > 1.5
                     else ", close to the normal Mars surface background.")
    else:
        parts[0] += "."
    cum = _val(ctx, "rad_dose_cum", 1)
    if cum:
        parts.append(f"Your cumulative dose for this walk is {cum}.")
    event = _condition_started(ctx, "RADIATION_EXPOSURE_CHANGE")
    if event:
        parts.append(f"A radiation exposure event in this scenario began at {event['since']}.")
    warning = _warning_for(ctx, "radiation")
    if warning:
        parts.append(f"The rule '{warning['rule']}' has been active since {warning['raised_at']}.")
    parts.append("Radiation is tracked as cumulative exposure and does not change body temperature "
                 "or heart rate in the short term; it is independent of thermal stress.")
    if warning or event:
        parts.append((_recs(ctx, "radiation_exposure", warning) + _sources(ctx, "radiation_exposure")).strip())
    return " ".join(p for p in parts if p)


def _heart(ctx: dict) -> str:
    bad = _untrusted(ctx, "heart_rate")
    if bad:
        return bad
    hr = ctx["sensors"].get("heart_rate", {})
    if hr.get("value") is None:
        return "I do not have a heart rate reading yet."
    parts = [f"Your heart rate is {hr['value']:.0f} beats per minute"]
    if hr.get("baseline"):
        parts[0] += f", compared with {hr['baseline']:.0f} at the start."
    else:
        parts[0] += "."
    act = ctx.get("current_activity") or {}
    met = ctx["sensors"].get("metabolic_rate", {})
    if met.get("value") is not None and met["value"] > 180:
        parts.append(f"Most of that is workload: about {met['value']:.0f} watts"
                     + (f" during '{act['label']}'." if act.get("label") else "."))
    core = ctx["sensors"].get("core_temp", {})
    if (core.get("change_from_baseline") or 0) > 0.3 and core.get("quality") == "good":
        parts.append(f"Heat strain adds to it: core temperature is {core['change_from_baseline']:.2f} degrees "
                     "above baseline, and heart rate rises with core temperature.")
    parts.append(_radiation_note(ctx).replace("raise body temperature", "raise heart rate or body temperature").strip())
    if not _warning_for(ctx, "heart") and not _warning_for(ctx, "cardio"):
        parts.append("No cardiovascular rule is active.")
    return " ".join(p for p in parts if p)


def _breathing(ctx: dict) -> str:
    bits = []
    for key, label, digits in (("spo2", "blood oxygen saturation", 1), ("respiration_rate", "respiration rate", 0),
                               ("ppco2", "helmet carbon dioxide", 1), ("o2_tank", "primary oxygen remaining", 1)):
        bad = _untrusted(ctx, key)
        value = _val(ctx, key, digits)
        if bad:
            bits.append(bad)
        elif value:
            bits.append(f"{label} is {value}")
    if not bits:
        return "I do not have breathing or oxygen readings yet."
    active = [w["rule"] for w in ctx["active_medical_warnings"]
              if any(k in w["rule"].lower() for k in ("oxygen", "co2", "hypox"))]
    tail = (f" Active rule: {', '.join(active)}." if active else " No oxygen or carbon dioxide rule is active.")
    return "Here is your breathing picture: " + "; ".join(bits) + "." + tail


def _suit(ctx: dict) -> str:
    bits = []
    for key, label, digits in (("suit_pressure", "suit pressure", 1), ("o2_tank", "primary oxygen", 1),
                               ("battery", "battery", 0), ("lcg_outlet_temp", "coolant return temperature", 1),
                               ("suit_gas_temp", "suit internal temperature", 1)):
        value = _val(ctx, key, digits)
        if value and not _untrusted(ctx, key):
            bits.append(f"{label} {value}")
    lcg = ctx["sensors"].get("lcg_outlet_temp", {})
    extra = ""
    if (lcg.get("change_from_baseline") or 0) > 2:
        extra = (" The coolant is returning much warmer than at the start, which means suit cooling is "
                 "saturated or degraded.")
    return ("Suit status: " + ", ".join(bits) + "." + extra) if bits else "I do not have suit readings yet."


def _quality(ctx: dict) -> str:
    dq = ctx["active_data_quality_warnings"]
    inhibited = [r for r in ctx["rule_monitor"] if r["state"] == "inhibited"]
    if not dq and not inhibited:
        return ("All active sensors currently pass the data quality checks: no disconnections, spikes, "
                "stuck values, excess noise or implausible trends.")
    parts = []
    if dq:
        parts.append("Data quality warnings are active: " + " ".join(
            f"{w['message']} Since {w['since']}." for w in dq[:4]))
    if inhibited:
        parts.append("Because of that I am not evaluating " + ", ".join(
            f"'{r['rule']}'" for r in inhibited[:3]) +
            " on untrusted data. These are sensor problems, not medical findings.")
    else:
        parts.append("These are sensor problems, not medical findings.")
    return " ".join(parts)


def _warnings(ctx: dict) -> str:
    med, dq = ctx["active_medical_warnings"], ctx["active_data_quality_warnings"]
    if not med and not dq:
        return "There are no active medical or data quality warnings right now."
    parts = []
    for w in med[:3]:
        ev = "; ".join(f"{e['sensor']} {e['measure'].replace('_', ' ')} is {e['value']} {e['unit']} "
                       f"against a limit of {e['limit']}" for e in w["evidence"] if e["value"] is not None)
        parts.append(f"Medical {w['severity']}: {w['message']} It has been active since {w['raised_at']}"
                     + (f" because {ev}." if ev else "."))
    if dq:
        parts.append("Separately, data quality: " + " ".join(w["message"] for w in dq[:3]))
    return " ".join(parts)


def _action(ctx: dict) -> str:
    med = ctx["active_medical_warnings"]
    if not med:
        return ("No medical warning is active, so continue the planned task and keep monitoring. "
                "I will tell you if a configured rule is met.")
    order = {"critical": 0, "warning": 1, "caution": 2, "advisory": 3}
    top = sorted(med, key=lambda w: order.get(w["severity"], 9))[0]
    recs = " ".join(top["recommendations"][:3]) or "Follow the flight surgeon's guidance."
    return (f"The most important item is '{top['rule']}' ({top['severity']}). {recs} "
            "This is simulated guidance and does not replace the flight surgeon.")


def _mission(ctx: dict) -> str:
    act = ctx.get("current_activity")
    s = ctx["session"]
    parts = [f"Mission time is {s['mission_time']} of a planned {s['planned_duration']}; the session is {s['status']}."]
    if act:
        parts.append(f"Current step: {act['label']}, {act['progress'] * 100:.0f} percent complete.")
        plan = ctx["mission_plan"]
        idx = act.get("index", -1)
        if 0 <= idx < len(plan) - 1:
            parts.append(f"Next: {plan[idx + 1]['step']}.")
    pos = ctx.get("position_m")
    if pos:
        parts.append(f"You are {abs(pos['east']):.0f} metres {'east' if pos['east'] >= 0 else 'west'} and "
                     f"{abs(pos['north']):.0f} metres {'north' if pos['north'] >= 0 else 'south'} of the lander.")
    return " ".join(parts)


def _status(ctx: dict) -> str:
    bits = []
    for key, label, digits in (("heart_rate", "heart rate", 0), ("core_temp", "core temperature", 2),
                               ("spo2", "oxygen saturation", 1), ("suit_pressure", "suit pressure", 1)):
        value = _val(ctx, key, digits)
        if value and not _untrusted(ctx, key):
            bits.append(f"{label} {value}")
    if not bits:
        return "The simulation has not produced telemetry yet. Start the session and ask me again."
    med, dq = ctx["active_medical_warnings"], ctx["active_data_quality_warnings"]
    tail = (f" Active medical warnings: {', '.join(w['rule'] for w in med)}." if med
            else " No medical warnings are active.")
    if dq:
        tail += f" {len(dq)} data quality warning{'s' if len(dq) != 1 else ''} active."
    return f"At {ctx['session']['mission_time']}: " + ", ".join(bits) + "." + tail


_HELP = ("I am ASTRA, your health monitoring assistant. Ask me why a reading is changing, for example "
         "why your body temperature is increasing, about radiation, heart rate, oxygen, suit status, "
         "active warnings, sensor data quality, what you should do, or mission progress.")

_HANDLERS = {
    "temperature": _temperature, "radiation": _radiation, "heart": _heart, "breathing": _breathing,
    "quality": _quality, "action": _action, "warning": _warnings, "suit": _suit, "mission": _mission,
    "status": _status, "help": lambda ctx: _HELP,
}


def local_answer(question: str, ctx: dict) -> str:
    if not ctx["sensors"] or all(s.get("value") is None and "quality" not in s for s in ctx["sensors"].values()):
        intent = _intent(question)
        if intent not in ("help", "mission"):
            return "The simulation has not produced telemetry yet. Start the session and ask me again."
    text = _HANDLERS[_intent(question)](ctx)
    text = re.sub(r"\s+", " ", text).strip()
    return f"{text} ({DATA_LABEL.capitalize()}.)"


# ------------------------------------------------------------------ dispatch
def answer(ctx: dict, question: str, history: list[dict[str, str]],
           llm: Optional[LLMProvider]) -> dict:
    """Answer from a context built by `build_context`.

    Blocking (the LLM call can take seconds): run it in a worker thread. Build
    the context on the event loop first, because it reads live session buffers.
    Never raises.
    """
    note = ""
    if llm is not None:
        try:
            messages = [m for m in history[-6:] if m["role"] in ("user", "assistant")]
            while messages and messages[0]["role"] != "user":
                messages.pop(0)
            messages.append({
                "role": "user",
                "content": "LIVE CONTEXT (JSON):\n" + json.dumps(ctx, separators=(",", ":"), sort_keys=True)
                           + "\n\nQUESTION: " + question,
            })
            return {"reply": llm.complete(SYSTEM_PROMPT, messages), "provider": llm.name,
                    "fallback": False, "note": ""}
        except LLMError as exc:
            note = f"LLM unavailable ({exc}); answered by the local explainer."
    return {"reply": local_answer(question, ctx), "provider": LOCAL_NAME,
            "fallback": llm is not None, "note": note}
