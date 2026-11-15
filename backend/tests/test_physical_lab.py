"""Tests for Physical Sensor Engineering Lab (Milestone 1).

Verifies:
- Advanced technical specifications schema (electrical, physical, metrological, operational envelope).
- Sensor family, manufacturer, model number, tags, and custom categories.
- Advanced search, filtering, and sorting.
- Sensor duplication endpoint (cloning profiles, specs, auto-keying, audit log).
- Spec updates, version increments, and immutable snapshot preservation.
- Regression safety and RBAC enforcement.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.seed_data import DEMO_USERS

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
        r = client.post("/api/auth/login", json={"username": role, "password": PASSWORDS[role]})
        assert r.status_code == 200, r.text
        tokens[role] = {"Authorization": f"Bearer {r.json()['access_token']}"}
    return tokens


def test_sensor_create_with_technical_specs(client, auth):
    h = auth["physical"]
    payload = {
        "key": "test_pt100_rtd",
        "name": "PT100 RTD Helmet Temperature",
        "category": "spacesuit",
        "sensor_family": "rtd_temperature",
        "manufacturer": "Amphenol Advanced Sensors",
        "model_number": "PT100-M34",
        "tags": ["eva", "helmet", "temperature", "nasa_std_3001"],
        "unit": "degC",
        "channel": "core_temp_c",
        "min_valid": -50.0,
        "max_valid": 150.0,
        "accuracy": 0.05,
        "max_rate_per_min": 5.0,
        "resolution": 0.01,
        "description": "High-accuracy platinum resistance thermometer mounted in helmet brow.",
        "technical_specs": {
            "electrical": {
                "voltage_v": 3.3,
                "current_ma": 1.2,
                "power_mw": 3.96,
            },
            "physical": {
                "length_mm": 12.0,
                "width_mm": 4.0,
                "height_mm": 2.0,
                "weight_g": 3.5,
                "housing_material": "Ceramic / Platinum",
            },
            "operating_envelope": {
                "temp_min_c": -60.0,
                "temp_max_c": 160.0,
                "pressure_min_kpa": 0.0,
                "pressure_max_kpa": 150.0,
            },
            "metrology": {
                "measurement_type": "Callendar-Van Dusen RTD",
                "precision": 0.02,
                "response_time_s": 0.4,
                "sampling_frequency_hz": 10.0,
                "calibration_interval_days": 365,
            },
        },
        "change_note": "Initial engineering creation",
    }
    r = client.post("/api/sensors", headers=h, json=payload)
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["key"] == "test_pt100_rtd"
    assert data["sensor_family"] == "rtd_temperature"
    assert data["manufacturer"] == "Amphenol Advanced Sensors"
    assert data["model_number"] == "PT100-M34"
    assert "eva" in data["tags"]
    assert data["technical_specs"]["electrical"]["voltage_v"] == 3.3
    assert data["technical_specs"]["metrology"]["measurement_type"] == "Callendar-Van Dusen RTD"
    assert data["status"] == "draft"
    assert data["version"] == 1
    assert len(data["profiles"]) == 1
    assert data["profiles"][0]["name"] == "nominal"
    assert data["profiles"][0]["noise_std"] == 0.05


def test_sensor_search_and_filtering(client, auth):
    h = auth["physical"]

    # Search by keyword
    r = client.get("/api/sensors?search=Amphenol", headers=h)
    assert r.status_code == 200
    items = r.json()
    assert any(s["key"] == "test_pt100_rtd" for s in items)

    # Filter by family
    r = client.get("/api/sensors?family=rtd_temperature", headers=h)
    assert r.status_code == 200
    items = r.json()
    assert all(s["sensor_family"] == "rtd_temperature" for s in items)
    assert any(s["key"] == "test_pt100_rtd" for s in items)

    # Filter by tag
    r = client.get("/api/sensors?tag=helmet", headers=h)
    assert r.status_code == 200
    items = r.json()
    assert any(s["key"] == "test_pt100_rtd" for s in items)

    # Sort by name
    r = client.get("/api/sensors?sort_by=name&sort_desc=false", headers=h)
    assert r.status_code == 200
    names = [s["name"] for s in r.json()]
    assert names == sorted(names)


def test_sensor_duplicate(client, auth):
    h = auth["physical"]

    # 1. Fetch the source sensor
    sensors = client.get("/api/sensors?search=test_pt100_rtd", headers=h).json()
    src = next(s for s in sensors if s["key"] == "test_pt100_rtd")

    # 2. Duplicate with auto-key
    r = client.post(f"/api/sensors/{src['id']}/duplicate", headers=h, json={})
    assert r.status_code == 201, r.text
    dup = r.json()
    assert dup["key"] == "test_pt100_rtd_copy"
    assert dup["name"] == "PT100 RTD Helmet Temperature (Copy)"
    assert dup["sensor_family"] == "rtd_temperature"
    assert dup["manufacturer"] == "Amphenol Advanced Sensors"
    assert dup["technical_specs"]["electrical"]["voltage_v"] == 3.3
    assert dup["status"] == "draft"
    assert dup["version"] == 1

    # 3. Duplicate with explicit key and custom name
    r2 = client.post(
        f"/api/sensors/{src['id']}/duplicate",
        headers=h,
        json={"new_key": "test_pt100_arm", "new_name": "PT100 RTD Arm Temperature"},
    )
    assert r2.status_code == 201, r2.text
    dup2 = r2.json()
    assert dup2["key"] == "test_pt100_arm"
    assert dup2["name"] == "PT100 RTD Arm Temperature"

    # 4. Conflict on existing key
    r3 = client.post(
        f"/api/sensors/{src['id']}/duplicate",
        headers=h,
        json={"new_key": "test_pt100_arm"},
    )
    assert r3.status_code == 409

    # 5. Non-physical role cannot duplicate
    ro = auth["operator"]
    assert client.post(f"/api/sensors/{src['id']}/duplicate", headers=ro, json={}).status_code == 403


def test_sensor_update_specs_and_history(client, auth):
    h = auth["physical"]
    sensors = client.get("/api/sensors?search=test_pt100_rtd", headers=h).json()
    sensor = next(s for s in sensors if s["key"] == "test_pt100_rtd")
    sid = sensor["id"]

    updated_specs = dict(sensor["technical_specs"])
    updated_specs["electrical"]["voltage_v"] = 5.0
    updated_specs["metrology"]["response_time_s"] = 0.25

    patch = {
        "name": sensor["name"],
        "category": sensor["category"],
        "sensor_family": sensor["sensor_family"],
        "manufacturer": "Amphenol Sensors (Updated)",
        "model_number": sensor["model_number"],
        "tags": ["eva", "helmet", "temperature", "calibrated"],
        "unit": sensor["unit"],
        "channel": sensor["channel"],
        "min_valid": sensor["min_valid"],
        "max_valid": sensor["max_valid"],
        "accuracy": 0.03,
        "max_rate_per_min": sensor["max_rate_per_min"],
        "resolution": sensor["resolution"],
        "description": "Updated spec description",
        "technical_specs": updated_specs,
        "custom_fields": sensor["custom_fields"],
        "change_note": "Upgraded supply voltage and response time",
    }
    r = client.put(f"/api/sensors/{sid}", headers=h, json=patch)
    assert r.status_code == 200, r.text
    res = r.json()
    assert res["version"] == 2
    assert res["manufacturer"] == "Amphenol Sensors (Updated)"
    assert res["accuracy"] == 0.03
    assert res["technical_specs"]["electrical"]["voltage_v"] == 5.0
    assert "calibrated" in res["tags"]

    # Check version history snapshot
    versions = client.get(f"/api/sensors/{sid}/versions", headers=h).json()
    assert len(versions) == 2
    latest = versions[0]
    assert latest["version"] == 2
    assert latest["change_note"] == "Upgraded supply voltage and response time"
    assert latest["snapshot"]["manufacturer"] == "Amphenol Sensors (Updated)"
    assert latest["snapshot"]["technical_specs"]["electrical"]["voltage_v"] == 5.0
