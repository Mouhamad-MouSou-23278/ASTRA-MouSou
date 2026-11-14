"""Natural-language planner and ASTRA assistant (local deterministic paths + LLM fallback)."""
from __future__ import annotations

import json

from app.models import SimSession
from app.seed_data import DEFAULT_PROMPT, SCENARIOS
from app.services import assistant, planner, registry
from app.services.llm import LLMError
from app.services.runtime import LiveSession
from astra_sim import SimulationPlan


def actions(plan: dict) -> list[str]:
    return [s["action"] for s in plan["steps"]]


# ---------------------------------------------------------------------- planner
def test_default_prompt_becomes_the_expected_plan(default_plan):
    assert default_plan.source == "deterministic"
    acts = actions(default_plan.plan)
    assert acts[:5] == ["OPEN_HATCH", "ASTRONAUT_EXIT", "WALK_TO_WAYPOINT", "WALK_TO_WAYPOINT", "WALK_TO_WAYPOINT"]
    assert acts[5:8] == ["KNEEL", "COLLECT_SOIL_SAMPLE", "STAND_UP"]
    assert sorted(acts[8:]) == ["RADIATION_EXPOSURE_CHANGE", "THERMAL_LOAD_CHANGE"]
    walks = [s["waypoint"] for s in default_plan.plan["steps"] if s["action"] == "WALK_TO_WAYPOINT"]
    assert walks == ["WP_ALPHA", "WP_BRAVO", "SAMPLE_SITE_1"]
    assert any("independent" in n for n in default_plan.notes)


def test_fault_drill_prompt_injects_the_named_faults(db):
    prompt = next(p for key, _, p, _ in SCENARIOS if key == "sensor_fault_drill")
    result = planner.generate_plan(db, prompt)
    assert result.valid, result.problems
    faults = {(s["sensor_key"], s["fault"], s["duration_s"])
              for s in result.plan["steps"] if s["action"] == "SENSOR_FAULT_INJECTION"}
    assert ("core_temp", "disconnect", 30.0) in faults
    assert any(f[0] == "heart_rate" and f[1] == "spike" for f in faults)
    wait = next(s for s in result.plan["steps"] if s["action"] == "WAIT")
    assert wait["duration_s"] == 60
    assert "THERMAL_LOAD_CHANGE" not in actions(result.plan)


def test_seed_pace_and_return_are_read_from_the_prompt(db):
    result = planner.generate_plan(
        db, "Walk quickly to Waypoint Bravo, then return to the lander. Use seed 42.")
    assert result.valid, result.problems
    assert result.plan["seed"] == 42
    walks = [s for s in result.plan["steps"] if s["action"] == "WALK_TO_WAYPOINT"]
    assert [w["waypoint"] for w in walks] == ["WP_BRAVO", "LANDER_RAMP"]
    assert all(w["speed_mps"] == 1.1 for w in walks)


def test_vague_prompt_still_yields_a_valid_plan(db):
    result = planner.generate_plan(db, "hello there")
    assert result.valid
    assert actions(result.plan) == ["OPEN_HATCH", "ASTRONAUT_EXIT"]


class FakeLLM:
    name = "fake:test"

    def __init__(self, reply):
        self.reply = reply
        self.calls = 0

    def complete(self, system, messages):
        self.calls += 1
        if isinstance(self.reply, Exception):
            raise self.reply
        return self.reply


def test_valid_llm_plan_is_accepted(db, monkeypatch):
    plan = {"version": 1, "title": "LLM plan", "seed": 5, "steps": [
        {"id": "s1", "action": "OPEN_HATCH"}, {"id": "s2", "action": "ASTRONAUT_EXIT"},
        {"id": "s3", "action": "WALK_TO_WAYPOINT", "waypoint": "WP_ALPHA", "speed_mps": 0.7}]}
    llm = FakeLLM("Here is the plan:\n```json\n" + json.dumps(plan) + "\n```")
    monkeypatch.setattr(planner, "get_llm", lambda: llm)
    result = planner.generate_plan(db, "walk to alpha")
    assert result.valid and result.source == "llm:fake:test" and llm.calls == 1
    assert result.plan["title"] == "LLM plan"


def test_malicious_or_invalid_llm_output_falls_back_to_deterministic(db, monkeypatch):
    evil = {"version": 1, "title": "x", "seed": 1, "steps": [
        {"id": "s1", "action": "EXECUTE_PYTHON", "code": "__import__('os').system('whoami')"}]}
    for reply in (json.dumps(evil), "I cannot help with that.", LLMError("offline")):
        monkeypatch.setattr(planner, "get_llm", lambda reply=reply: FakeLLM(reply))
        result = planner.generate_plan(db, DEFAULT_PROMPT)
        assert result.valid and result.source == "deterministic"
        assert "EXECUTE_PYTHON" not in actions(result.plan)
        assert any("deterministic planner was used instead" in n for n in result.notes)


def test_ai_mode_local_only_never_calls_the_llm(db, monkeypatch):
    from app.models import SystemConfig

    llm = FakeLLM("{}")
    monkeypatch.setattr(planner, "get_llm", lambda: llm)
    db.get(SystemConfig, "ai_mode").value = "local_only"
    db.commit()
    try:
        assert planner.generate_plan(db, DEFAULT_PROMPT).source == "deterministic"
        assert llm.calls == 0
    finally:
        db.get(SystemConfig, "ai_mode").value = "auto"
        db.commit()


# -------------------------------------------------------------------- assistant
def live_at(snapshot, plan_dict, until: float) -> LiveSession:
    row = SimSession(id="testsession", name="Test", prompt="", plan=plan_dict, config_snapshot=snapshot,
                     seed=plan_dict["seed"], status="running", speed=1.0, run=1, sim_time=0.0,
                     end_reason="")
    live = LiveSession(row)
    live.reset_engine()
    while live.engine.t < until:
        live.ingest(live.engine.step())
    return live


def test_assistant_context_contains_no_ground_truth(default_snapshot, default_plan):
    live = live_at(default_snapshot, default_plan.plan, 200)
    ctx = assistant.build_context(live)
    blob = json.dumps(ctx)
    assert '"truth"' not in blob
    # Every reported value is the sensor output of the latest frame, not the true state.
    last = live.last_frame
    for key, entry in ctx["sensors"].items():
        assert entry["value"] == last["sensors"][key][0]
    assert ctx["data_label"] == "SIMULATED DATA"


def test_why_is_body_temperature_increasing(default_snapshot, default_plan):
    live = live_at(default_snapshot, default_plan.plan, 290)
    ctx = assistant.build_context(live)
    reply = assistant.local_answer("ASTRA, why is my body temperature increasing?", ctx)
    core = ctx["sensors"]["core_temp"]["value"]
    assert f"{core:.2f}" in reply                       # quotes the displayed reading exactly
    assert "rising" in reply
    assert "thermal stress event" in reply
    assert "cooling garment" in reply
    assert "independent" in reply and "does not raise body temperature" in reply
    assert "Heat strain" in reply                       # the active medical rule is named
    assert "Simulated data" in reply


def test_radiation_answer_states_independence(default_snapshot, default_plan):
    live = live_at(default_snapshot, default_plan.plan, 200)
    reply = assistant.local_answer("Tell me about the radiation level", assistant.build_context(live))
    assert "microsieverts per hour" in reply
    assert "independent of thermal stress" in reply
    assert "does not change body temperature" in reply


def test_untrusted_sensor_is_not_interpreted_medically(default_snapshot):
    plan = SimulationPlan.model_validate({"version": 1, "title": "t", "seed": 3, "steps": [
        {"id": "a1", "action": "OPEN_HATCH"}, {"id": "a2", "action": "ASTRONAUT_EXIT"},
        {"id": "a3", "action": "WAIT", "duration_s": 120},
        {"id": "f1", "action": "SENSOR_FAULT_INJECTION", "trigger": {"at": "time", "t_s": 50},
         "sensor_key": "core_temp", "fault": "disconnect", "duration_s": 60}]})
    live = live_at(default_snapshot, plan.model_dump(mode="json", exclude_none=True), 80)
    ctx = assistant.build_context(live)
    reply = assistant.local_answer("why is my temperature changing?", ctx)
    assert "not trusted" in reply and "disconnected" in reply
    quality = assistant.local_answer("is the sensor data reliable?", ctx)
    assert "sensor problems, not medical findings" in quality


def test_llm_failure_falls_back_to_local_explainer(default_snapshot, default_plan):
    live = live_at(default_snapshot, default_plan.plan, 120)
    ctx = assistant.build_context(live)
    out = assistant.answer(ctx, "status?", [], FakeLLM(LLMError("timeout")))
    assert out["provider"] == assistant.LOCAL_NAME and out["fallback"] is True
    assert "timeout" in out["note"]
    ok = assistant.answer(ctx, "status?", [], FakeLLM("All nominal."))
    assert ok == {"reply": "All nominal.", "provider": "fake:test", "fallback": False, "note": ""}
    assert registry.DT == 0.5
