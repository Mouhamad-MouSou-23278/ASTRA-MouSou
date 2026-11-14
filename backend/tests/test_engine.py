"""Simulation engine: determinism, layer separation, scientific constraints, data quality."""
from __future__ import annotations

import copy
import hashlib
import json

import pytest
from pydantic import ValidationError

from app.services import registry
from astra_sim import (
    PlanError,
    QualityAssessment,
    SimulationEngine,
    SimulationPlan,
    compile_plan,
)

BASE_STEPS = [
    {"id": "a1", "action": "OPEN_HATCH"},
    {"id": "a2", "action": "ASTRONAUT_EXIT"},
    {"id": "a3", "action": "WALK_TO_WAYPOINT", "waypoint": "WP_ALPHA"},
    {"id": "a4", "action": "WAIT", "duration_s": 150},
]
THERMAL = {"id": "e1", "action": "THERMAL_LOAD_CHANGE", "trigger": {"at": "time", "t_s": 20},
           "external_heat_w": 700, "cooling_efficiency": 0.25, "ramp_s": 20}
RADIATION = {"id": "e2", "action": "RADIATION_EXPOSURE_CHANGE", "trigger": {"at": "time", "t_s": 40},
             "dose_rate_multiplier": 20, "ramp_s": 20}


def make_plan(extra=(), seed=7, steps=BASE_STEPS) -> SimulationPlan:
    return SimulationPlan.model_validate(
        {"version": 1, "title": "test", "seed": seed, "steps": [*steps, *extra]})


def run(snapshot, plan, assessor=None) -> list[dict]:
    cfg = registry.engine_config(snapshot, plan)
    cfg.assessor = assessor
    engine = SimulationEngine(cfg)
    frames = []
    while not engine.finished:
        frames.append(engine.step())
    return frames


def digest(frames) -> str:
    return hashlib.sha256(json.dumps(frames, sort_keys=True).encode()).hexdigest()


def events(frames, type_prefix="") -> list[dict]:
    return [e for f in frames for e in f["events"] if e["type"].startswith(type_prefix)]


def fault(sensor, kind, t=60, duration=40, magnitude=None) -> dict:
    step = {"id": f"f_{kind}", "action": "SENSOR_FAULT_INJECTION", "trigger": {"at": "time", "t_s": t},
            "sensor_key": sensor, "fault": kind, "duration_s": duration}
    if magnitude is not None:
        step["magnitude"] = magnitude
    return step


# ------------------------------------------------------------- reproducibility
def test_same_seed_is_bit_identical(default_snapshot):
    plan = make_plan([THERMAL, RADIATION, fault("heart_rate", "spike")])
    assert digest(run(default_snapshot, plan)) == digest(run(default_snapshot, plan))


def test_different_seed_differs(default_snapshot):
    assert digest(run(default_snapshot, make_plan(seed=1))) != digest(run(default_snapshot, make_plan(seed=2)))


# ------------------------------------------------------- scientific constraint
THERMAL_CHANNELS = ("core_temp_c", "skin_temp_c", "heart_rate_bpm", "respiration_rate_bpm",
                    "suit_gas_temp_c", "lcg_outlet_temp_c", "metabolic_rate_w", "spo2_pct")


def test_radiation_never_changes_thermal_or_vital_truth(default_snapshot):
    """Radiation and thermal stress are independent: adding a radiation event must
    leave every thermal and physiological ground-truth channel bit-identical."""
    with_rad = run(default_snapshot, make_plan([THERMAL, RADIATION]))
    without = run(default_snapshot, make_plan([THERMAL]))
    for a, b in zip(with_rad, without):
        for ch in THERMAL_CHANNELS:
            assert a["truth"][ch] == b["truth"][ch], (ch, a["t"])
    assert max(f["truth"]["rad_dose_rate_usv_h"] for f in with_rad) > 400
    assert max(f["truth"]["rad_dose_rate_usv_h"] for f in without) < 40


def test_thermal_never_changes_radiation_truth(default_snapshot):
    with_heat = run(default_snapshot, make_plan([THERMAL, RADIATION]))
    without = run(default_snapshot, make_plan([RADIATION]))
    for a, b in zip(with_heat, without):
        assert a["truth"]["rad_dose_rate_usv_h"] == b["truth"]["rad_dose_rate_usv_h"]
        assert a["truth"]["rad_dose_cum_usv"] == b["truth"]["rad_dose_cum_usv"]
    assert with_heat[-1]["truth"]["core_temp_c"] > without[-1]["truth"]["core_temp_c"] + 0.3


# ------------------------------------------------------------ default scenario
def test_default_scenario_end_to_end(default_snapshot, default_plan):
    frames = run(default_snapshot, SimulationPlan.model_validate(default_plan.plan))
    raised = {e["warning"]["key"]: e["t"] for e in events(frames, "MEDICAL_WARNING_RAISED")}
    assert "radiation_dose_rate_elevated" in raised
    assert "heat_strain_caution" in raised
    # The heat warning arrives while the astronaut is collecting the sample.
    collect = next(s for s in default_plan.timeline["segments"] if s["action"] == "COLLECT_SOIL_SAMPLE")
    assert collect["t_start"] <= raised["heat_strain_caution"] <= collect["t_end"]
    # The radiation advisory is raised (and later cleared) independently of the heat warning.
    assert raised["radiation_dose_rate_elevated"] < raised["heat_strain_caution"]
    assert any(e["warning"]["key"] == "radiation_dose_rate_elevated"
               for e in events(frames, "MEDICAL_WARNING_CLEARED"))
    # A healthy sensor suite produces no data-quality warnings at all.
    assert events(frames, "DQ_WARNING") == []
    poses = {f["astronaut"]["pose"] for f in frames}
    assert {"inside", "egress", "turn", "walk", "kneel_down", "collect", "stand_up", "idle"} <= poses


@pytest.mark.parametrize("seed", [1, 2, 3, 4, 5])
def test_no_false_data_quality_warnings_across_seeds(default_snapshot, default_plan, seed):
    plan = copy.deepcopy(default_plan.plan)
    plan["seed"] = seed
    frames = run(default_snapshot, SimulationPlan.model_validate(plan))
    assert events(frames, "DQ_WARNING") == []
    assert "heat_strain_caution" in {e["warning"]["key"] for e in events(frames, "MEDICAL_WARNING_RAISED")}


# ------------------------------------------------------------ layer separation
def test_sensor_fault_does_not_touch_ground_truth(default_snapshot):
    clean = run(default_snapshot, make_plan([THERMAL]))
    faulty = run(default_snapshot, make_plan([THERMAL, fault("core_temp", "disconnect"),
                                              fault("heart_rate", "spike", t=70)]))
    assert [f["truth"] for f in clean] == [f["truth"] for f in faulty]
    assert [f["sensors"]["core_temp"] for f in clean] != [f["sensors"]["core_temp"] for f in faulty]


@pytest.mark.parametrize("kind,flag", [
    ("disconnect", "DISCONNECTED"), ("spike", "SPIKE"), ("stuck", "STUCK"),
    ("noise_burst", "EXCESS_NOISE"), ("drift", "IMPLAUSIBLE_TREND"),
])
def test_each_fault_raises_its_data_quality_warning_not_a_medical_one(default_snapshot, kind, flag):
    frames = run(default_snapshot, make_plan([fault("core_temp", kind, t=60, duration=90)]))
    dq = events(frames, "DQ_WARNING_RAISED")
    assert flag in {e["warning"]["key"] for e in dq}
    assert all(e["warning"]["sensor_key"] == "core_temp" for e in dq)
    assert all(e["warning"]["kind"] == "data_quality" for e in dq)
    assert events(frames, "MEDICAL_WARNING") == []      # a sensor fault is never a medical finding


def test_spike_into_alarm_range_cannot_trigger_medical_rule(default_snapshot):
    """Spikes push core_temp readings far above the 38.0 degC limit, but the
    readings are flagged bad and excluded from medical evidence."""
    frames = run(default_snapshot, make_plan([fault("core_temp", "spike", t=60, duration=120, magnitude=3.0)]))
    assert max(f["sensors"]["core_temp"][0] or 0 for f in frames) > 39.0
    assert events(frames, "MEDICAL_WARNING") == []


def test_medical_rule_is_inhibited_while_its_sensor_is_untrusted(default_snapshot):
    steps = [*BASE_STEPS[:3], {"id": "a4", "action": "WAIT", "duration_s": 260}]
    baseline = run(default_snapshot, make_plan([THERMAL], steps=steps))
    raised_at = next(e["t"] for e in events(baseline, "MEDICAL_WARNING_RAISED")
                     if e["warning"]["key"] == "heat_strain_caution")
    # Disconnect the core temperature sensor across the moment the rule would fire.
    start = raised_at - 20
    frames = run(default_snapshot, make_plan(
        [THERMAL, fault("core_temp", "disconnect", t=start, duration=60)], steps=steps))
    heat = [e for e in events(frames, "MEDICAL_WARNING_RAISED") if e["warning"]["key"] == "heat_strain_caution"]
    assert all(e["t"] >= start + 60 for e in heat)        # never raised on missing data
    assert heat and heat[0]["t"] <= start + 60 + 30, "the rule fires soon after trusted data returns"
    inhibited = events(frames, "RULE_INHIBITED")
    assert any(e["rule_key"] == "heat_strain_caution" and "core_temp" in e["sensors"] for e in inhibited)
    states = {r["state"] for f in frames for r in f["rules"] if r["key"] == "heat_strain_caution"}
    assert "inhibited" in states


def test_data_quality_assessor_is_pluggable(default_snapshot):
    """The engine accepts any object implementing the DataQualityAssessor interface
    (the seam for a future ML trust layer) and never hands it ground truth."""
    seen_types = set()

    class DistrustEverything:
        name = "test-distrust"

        def assess(self, sensor, samples, context):
            seen_types.add(type(samples[-1]).__name__)
            assert not hasattr(samples[-1], "truth")
            return QualityAssessment("bad", ("OUT_OF_RANGE",), 0.0)

    frames = run(default_snapshot, make_plan([THERMAL]), assessor=DistrustEverything())
    assert seen_types == {"RawSample"}
    assert events(frames, "MEDICAL_WARNING") == []
    assert all(v[1] == "bad" for v in frames[-1]["sensors"].values())


# ------------------------------------------------------------- plan validation
def world(snapshot):
    return registry.world_from_dict(snapshot["world"])


@pytest.mark.parametrize("steps,expected", [
    ([{"id": "a1", "action": "ASTRONAUT_EXIT"}], "OPEN_HATCH must come before"),
    ([{"id": "a1", "action": "OPEN_HATCH"}, {"id": "a2", "action": "WALK_TO_WAYPOINT", "waypoint": "WP_ALPHA"}],
     "must exit the lander"),
    ([*BASE_STEPS[:2], {"id": "a3", "action": "COLLECT_SOIL_SAMPLE"}], "KNEEL must come before"),
    ([*BASE_STEPS[:2], {"id": "a3", "action": "WALK_TO_WAYPOINT", "waypoint": "OLYMPUS_MONS"}], "unknown waypoint"),
    ([*BASE_STEPS[:2], {"id": "a3", "action": "KNEEL"},
      {"id": "a4", "action": "WALK_TO_WAYPOINT", "waypoint": "WP_ALPHA"}], "STAND_UP before walking"),
    ([*BASE_STEPS[:2], fault("no_such_sensor", "spike")], "unknown or inactive sensor"),
    ([*BASE_STEPS[:2], {"id": "a1", "action": "WAIT", "duration_s": 5}], "duplicate step ids"),
])
def test_unexecutable_plans_are_rejected(default_snapshot, steps, expected):
    plan = make_plan(steps=steps)
    with pytest.raises(PlanError) as err:
        compile_plan(plan, world(default_snapshot), [s["key"] for s in default_snapshot["sensors"]])
    assert expected in str(err.value)


@pytest.mark.parametrize("bad_step", [
    {"id": "x", "action": "RUN_SHELL", "command": "rm -rf /"},                      # unknown action
    {"id": "x", "action": "WAIT", "duration_s": 5, "exec": "import os"},            # unknown field
    {"id": "x", "action": "WAIT", "duration_s": 10**9},                             # out of bounds
    {"id": "x; drop table", "action": "WAIT", "duration_s": 5},                     # bad id
    {"id": "x", "action": "RADIATION_EXPOSURE_CHANGE", "trigger": {"at": "time"}, "dose_rate_multiplier": 1e9},
])
def test_schema_rejects_anything_that_is_not_a_known_bounded_step(bad_step):
    with pytest.raises(ValidationError):
        SimulationPlan.model_validate({"version": 1, "title": "t", "seed": 1, "steps": [bad_step]})
