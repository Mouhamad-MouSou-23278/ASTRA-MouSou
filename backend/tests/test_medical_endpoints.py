"""Automated integration tests for Medical API endpoints and NASA Flight Instruments."""
import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_get_instruments_returns_full_registry():
    resp = client.get("/api/medical/instruments")
    assert resp.status_code == 200
    data = resp.json()
    assert "instruments" in data
    assert "warnings" in data
    instruments = data["instruments"]
    assert len(instruments) >= 7
    # Verify flight-critical instruments exist
    inst_ids = {inst["instrument_id"] for inst in instruments}
    assert "PPO-001" in inst_ids  # Pulse Oximeter
    assert "ECG-001" in inst_ids  # ECG
    assert "RAD-001" in inst_ids  # Dosimeter
    assert "CO2-001" in inst_ids  # Capnometer (CO2 sensor)


def test_pre_sim_risk_assessment_low_risk():
    payload = {
        "astronaut": {"resting_heart_rate": 65.0, "resting_core_temp": 36.8},
        "planned_eva_hours": 4.0,
        "expected_metabolic_watts": 280.0,
    }
    resp = client.post("/api/medical/pre-sim-risk", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["risk_level"] == "LOW"
    assert data["overall_risk_score"] < 0.25
    assert "NASA-STD-3001" in data["nasa_guideline"]


def test_pre_sim_risk_assessment_elevated_risk():
    payload = {
        "astronaut": {"resting_heart_rate": 88.0, "resting_core_temp": 37.8},
        "planned_eva_hours": 8.5,
        "expected_metabolic_watts": 520.0,
    }
    resp = client.post("/api/medical/pre-sim-risk", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["risk_level"] in ("MODERATE", "HIGH")
    assert data["overall_risk_score"] >= 0.25
    assert len(data["risk_factors"]) >= 2
    assert data["recommended_lcvg_cooling_rate"] == "HIGH"


def test_ml_triage_api_endpoint():
    triage_payload = {
        "heart_rate": 140.0,
        "spo2_pct": 97.0,
        "core_temp_c": 39.5,
        "resp_rate_bpm": 28.0,
        "suit_pressure_kpa": 29.5,
        "co2_mmhg": 3.5,
        "rad_dose_rate_usv": 28.0,
        "spo2_trust": 0.95,
        "hr_trust": 0.95,
        "temp_trust": 0.95,
        "press_trust": 0.98,
    }
    resp = client.post("/api/medical/ml-triage", json=triage_payload)
    assert resp.status_code == 200
    data = resp.json()
    assert "diagnosis" in data
    assert "confidence" in data
    assert "actions" in data
    assert data["diagnosis"] == "HEAT_EXHAUSTION"


def test_ml_model_metadata_endpoint():
    resp = client.get("/api/medical/ml-model")
    assert resp.status_code == 200
    data = resp.json()
    assert "accuracy" in data
    assert data["accuracy"] >= 0.90
    assert "feature_importances" in data
    assert len(data["feature_importances"]) >= 11
