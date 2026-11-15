"""Comprehensive End-to-End Tests for Physical Sensor Engineering Lab MVP.

Covers:
- Dynamic I/O port contracts
- 3D physical placement & coordinate transformations
- Deterministic Physics Transducer Models (RTD, Pressure, Radiation)
- Parameterized Error Pipeline (Noise, Drift, Stuck, Dropout, Spikes, Quantization)
- Trusted Data Layer (TDL) residuals and explainable Trust Score calculations
- Benchmark simulation execution & metrics (MAE, RMSE, Availability)
- Sensor Import & Export (JSON and CSV formats with schema validation)
- Physical AI Agent tool proposals, NASA-STD-3001 compliance, and safe approval workflows
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.seed_data import DEMO_USERS
from astra_sim.error_models import apply_error_pipeline
from astra_sim.physics_models import get_physics_model
from astra_sim.tdl import compute_benchmark_metrics, compute_instantaneous_trust
from astra_sim.util import stable_rng

PASSWORDS = {username: password for username, _, _, password in DEMO_USERS}


@pytest.fixture(scope="module")
def client(seeded_db):
    from app.main import app

    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def auth(client):
    tokens = {}
    for role in PASSWORDS:
        r = client.post(
            "/api/auth/login",
            json={"username": role, "password": PASSWORDS[role]},
        )
        assert r.status_code == 200, r.text
        tokens[role] = {"Authorization": f"Bearer {r.json()['access_token']}"}
    return tokens


# ----------------------------------------------------------- Physics Unit Tests
def test_physics_model_rtd_callendar_van_dusen():
    model = get_physics_model("rtd_temperature")
    assert model is not None

    # At 0 degC, Pt100 nominal resistance is exactly 100.0 ohms
    out_0, state_0 = model.evaluate(
        {"temperature": 0.0}, {"r0_ohms": 100.0, "tau_seconds": 0.001}, 0.5, {}
    )
    assert abs(out_0["resistance_ohms"] - 100.0) < 1e-3
    assert abs(out_0["temperature_c"] - 0.0) < 1e-3

    # At 100 degC, Pt100 standard resistance is ~138.51 ohms (IEC 60751)
    out_100, _ = model.evaluate(
        {"temperature": 100.0},
        {"r0_ohms": 100.0, "tau_seconds": 0.001},
        0.5,
        {"t_sensor": 100.0},
    )
    assert abs(out_100["resistance_ohms"] - 138.51) < 0.1
    assert abs(out_100["temperature_c"] - 100.0) < 0.1


def test_physics_model_piezoresistive_pressure():
    model = get_physics_model("piezoresistive_pressure")
    assert model is not None

    # Normal spacesuit pressure ~34.0 kPa
    out, state = model.evaluate(
        {"pressure": 34.0, "temperature": 25.0},
        {"sensitivity_mv_v_kpa": 1.5, "v_supply_v": 5.0, "t0_c": 25.0},
        0.5,
        {},
    )
    # Expected bridge mV = 5.0 V * 1.5 mV/V/kPa * 34 kPa = 255.0 mV
    assert abs(out["bridge_voltage_mv"] - 255.0) < 1.0
    assert abs(out["pressure_kpa"] - 34.0) < 0.1


def test_physics_model_radiation_dosimeter():
    model = get_physics_model("silicon_dosimeter")
    assert model is not None

    # MSL/RAD baseline ~27.9 uSv/h
    out_1, state_1 = model.evaluate(
        {"dose_rate": 27.9, "temperature": 20.0},
        {"sensitivity_pa_per_usv_h": 0.5, "leakage_current_base_pa": 2.0},
        1.0,
        {},
    )
    assert out_1["dose_rate_usv_h"] == 27.9
    # photocurrent = 27.9 * 0.5 = 13.95 pA + leakage 2.0 = 15.95 pA
    assert abs(out_1["ionization_current_pa"] - 15.95) < 0.1
    # After 3600 seconds, cumulative dose increases by exactly 27.9 uSv
    _, state_hour = model.evaluate(
        {"dose_rate": 27.9},
        {"sensitivity_pa_per_usv_h": 0.5},
        3600.0,
        {"cum_dose_usv": 0.0},
    )
    assert abs(state_hour["cum_dose_usv"] - 27.9) < 1e-3


# ------------------------------------------------------------- Error Pipeline Tests
def test_error_pipeline_and_determinism():
    rng_1 = stable_rng(1234, "test_error")
    rng_2 = stable_rng(1234, "test_error")

    configs = [
        {"error_type": "bias_offset", "enabled": True, "parameters": {"bias": 2.5}},
        {
            "error_type": "linear_drift",
            "enabled": True,
            "parameters": {"drift_per_min": 6.0},
        },
        {
            "error_type": "gaussian_noise",
            "enabled": True,
            "parameters": {"noise_std": 0.2},
        },
    ]

    val1, flags1, state1 = apply_error_pipeline(
        37.0, 10.0, 1.0, configs, {}, rng_1
    )
    val2, flags2, state2 = apply_error_pipeline(
        37.0, 10.0, 1.0, configs, {}, rng_2
    )

    # Determinism assertion
    assert val1 == val2
    assert flags1 == flags2
    assert "DRIFT" in flags1


def test_trusted_data_layer_metrics():
    # Ideal match
    res_ideal, trust_ideal = compute_instantaneous_trust(37.0, 37.0, 0.1, [])
    assert res_ideal == 0.0
    assert trust_ideal == 1.0

    # Disconnected
    res_disc, trust_disc = compute_instantaneous_trust(
        37.0, None, 0.1, ["DISCONNECTED"]
    )
    assert res_disc is None
    assert trust_disc == 0.0

    # Stuck
    res_stuck, trust_stuck = compute_instantaneous_trust(
        37.0, 37.0, 0.1, ["STUCK"]
    )
    assert trust_stuck == 0.15

    # Aggregate metric calculations
    pts = [
        {"residual": 0.1, "trust_score": 0.95},
        {"residual": -0.2, "trust_score": 0.85},
        {"residual": 0.0, "trust_score": 1.0},
        {"residual": None, "trust_score": 0.0},
    ]
    metrics = compute_benchmark_metrics(pts)
    assert metrics["availability_pct"] == 75.0
    assert abs(metrics["mae"] - 0.1) < 1e-3


# ----------------------------------------------------------- API Lab Endpoints
def test_sensor_lab_details_and_update(client, auth):
    h = auth["physical"]

    # 1. Fetch existing sensor (from seed or M1)
    sensors = client.get("/api/sensors", headers=h).json()
    sensor = sensors[0]
    sid = sensor["id"]

    # 2. Update with I/O contract, 3D placement, physics binding, and error models
    payload = {
        "io_contract": {
            "inputs": [
                {
                    "port_key": "in_temp",
                    "name": "Target Skin Temperature",
                    "data_type": "float",
                    "unit": "degC",
                    "source_channel": "core_temp_c",
                    "expected_min": -20.0,
                    "expected_max": 60.0,
                    "required": True,
                }
            ],
            "outputs": [
                {
                    "port_key": "out_temp_cal",
                    "name": "Calibrated Temperature",
                    "data_type": "float",
                    "unit": "degC",
                    "precision_digits": 3,
                    "nominal_accuracy": 0.05,
                }
            ],
        },
        "placement_data": {
            "parent_body": "astronaut_torso",
            "mount_point": "chest_center",
            "pos_x": 0.05,
            "pos_y": 0.42,
            "pos_z": 0.19,
            "rot_x": 0.0,
            "rot_y": 0.0,
            "rot_z": 0.0,
            "scale": 1.0,
            "asset_type": "primitive",
            "primitive_shape": "box",
            "color_hex": "#ffaa00",
            "dimensions_mm": [30.0, 20.0, 8.0],
        },
        "physics_config": {
            "model_key": "rtd_temperature",
            "model_version": "1.0",
            "parameters": {"r0_ohms": 100.0, "tau_seconds": 0.3},
            "enabled": True,
        },
        "error_configs": [
            {
                "error_type": "gaussian_noise",
                "enabled": True,
                "parameters": {"noise_std": 0.05},
            },
            {
                "error_type": "linear_drift",
                "enabled": True,
                "parameters": {"drift_per_min": 0.1},
            },
        ],
        "change_note": "Configured comprehensive engineering laboratory bindings",
    }
    r = client.put(f"/api/physical-lab/sensors/{sid}/details", headers=h, json=payload)
    assert r.status_code == 200, r.text
    res = r.json()
    assert len(res["io_contract"]["inputs"]) == 1
    assert res["io_contract"]["inputs"][0]["port_key"] == "in_temp"
    assert res["placement_data"]["parent_body"] == "astronaut_torso"
    assert res["placement_data"]["primitive_shape"] == "box"
    assert res["physics_config"]["model_key"] == "rtd_temperature"
    assert len(res["error_configs"]) == 2


def test_sensor_benchmark_simulation_execution(client, auth):
    h = auth["physical"]
    sensors = client.get("/api/sensors", headers=h).json()
    sid = sensors[0]["id"]

    req = {
        "duration_s": 20.0,
        "dt": 0.5,
        "seed": 99,
        "ambient_temp_c": -25.0,
        "ambient_pressure_pa": 735.0,
        "radiation_dose_rate_usv_h": 27.9,
    }
    r = client.post(f"/api/physical-lab/sensors/{sid}/benchmark", headers=h, json=req)
    assert r.status_code == 200, r.text
    bench = r.json()
    assert bench["sensor_key"] == sensors[0]["key"]
    assert len(bench["points"]) == 40  # 20 s / 0.5 dt = 40 points
    assert "mae" in bench["metrics"]
    assert "rmse" in bench["metrics"]
    assert "mean_trust_score" in bench["metrics"]
    assert bench["metrics"]["mean_trust_score"] > 0.0


def test_import_export_sensors(client, auth):
    h = auth["physical"]

    # 1. Export as JSON
    r_exp = client.get("/api/physical-lab/export?export_format=json", headers=h)
    assert r_exp.status_code == 200
    exp_data = r_exp.json()
    assert exp_data["format"] == "json"
    assert len(exp_data["sensors"]) > 0

    # 2. Export as CSV
    r_csv = client.get("/api/physical-lab/export?export_format=csv", headers=h)
    assert r_csv.status_code == 200
    assert "key,name,category" in r_csv.json()["data"]

    # 3. Dry-run Import
    import_payload = {
        "dry_run": True,
        "sensors": [
            {
                "key": "imported_accel_x",
                "name": "EVA Spacesuit Wrist Accelerometer",
                "category": "spacesuit",
                "sensor_family": "inertial_imu",
                "manufacturer": "Honeywell Aerospace",
                "unit": "m/s2",
                "min_valid": -50.0,
                "max_valid": 50.0,
                "accuracy": 0.01,
            }
        ],
    }
    r_dry = client.post("/api/physical-lab/import", headers=h, json=import_payload)
    assert r_dry.status_code == 200
    assert r_dry.json()["dry_run"] is True
    assert r_dry.json()["count"] == 1

    # 4. Actual Import
    import_payload["dry_run"] = False
    r_act = client.post("/api/physical-lab/import", headers=h, json=import_payload)
    assert r_act.status_code == 200
    assert r_act.json()["count"] == 1

    # Check imported sensor exists in registry
    chk = client.get("/api/sensors?search=imported_accel_x", headers=h).json()
    assert any(s["key"] == "imported_accel_x" for s in chk)


def test_physical_ai_agent_compliance_and_proposal(client, auth):
    h = auth["physical"]

    # 1. Ask about NASA-STD-3001 compliance
    r = client.post(
        "/api/physical-lab/agent/chat",
        headers=h,
        json={"message": "Check compliance with NASA-STD-3001 for suit sensors"},
    )
    assert r.status_code == 200, r.text
    chat = r.json()
    assert "NASA-STD-3001" in chat["reply"]
    assert len(chat["citations"]) > 0

    # 2. Request a draft proposal for an optical pulse oximeter
    r2 = client.post(
        "/api/physical-lab/agent/chat",
        headers=h,
        json={"message": "Please propose a new sensor draft for an optical pulse oximeter"},
    )
    assert r2.status_code == 200, r2.text
    chat2 = r2.json()
    assert len(chat2["proposals"]) == 1
    proposal = chat2["proposals"][0]
    assert proposal["tool_name"] == "create_sensor_draft"
    assert proposal["requires_confirmation"] is True
    assert proposal["diff"]["status"]["after"] == "draft"

    # 3. Approve and apply the staged proposal
    approve_req = {
        "proposal_id": proposal["proposal_id"],
        "tool_name": proposal["tool_name"],
        "entity_key": proposal["entity_key"],
        "parameters": proposal["parameters"],
    }
    r_app = client.post(
        "/api/physical-lab/agent/approve-proposal", headers=h, json=approve_req
    )
    assert r_app.status_code == 200, r_app.text
    assert r_app.json()["success"] is True

    # 4. Verify newly created sensor exists as draft in DB
    created = client.get(f"/api/sensors?search={proposal['entity_key']}", headers=h).json()
    assert any(s["key"] == proposal["entity_key"] for s in created)
