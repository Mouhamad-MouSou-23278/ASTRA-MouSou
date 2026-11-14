"""Automated tests for ASTRA Medical ML Decision Engine and Triage endpoints."""
import pytest
from app.services.ml_medical import get_medical_ml_engine


def test_ml_engine_training_and_accuracy():
    ml = get_medical_ml_engine()
    res = ml.train_from_csv()
    assert res["trained"] is True
    assert res["accuracy"] >= 0.90
    assert len(res["feature_importances"]) > 0


def test_ml_triage_false_alarm_suppression():
    ml = get_medical_ml_engine()
    # SpO2 drops severely to 65% BUT SpO2 trust is low (0.15) and other vitals are normal
    triage = ml.predict_triage({
        "heart_rate": 72.0,
        "spo2_pct": 65.0,
        "core_temp_c": 37.0,
        "resp_rate_bpm": 14.0,
        "suit_pressure_kpa": 29.6,
        "co2_mmhg": 2.0,
        "rad_dose_rate_usv": 28.0,
        "spo2_trust": 0.15,
        "hr_trust": 0.98,
        "temp_trust": 0.98,
        "press_trust": 0.98,
    })
    assert triage["diagnosis"] == "SENSOR_ARTIFACT_FALSE_ALARM"
    assert triage["confidence"] > 0.50
    assert "False Alarm Prevented" in triage["title"]


def test_ml_triage_true_hypoxia_detection():
    ml = get_medical_ml_engine()
    # SpO2 drops to 82% AND SpO2 trust is high (0.95), heart rate & resp elevated
    triage = ml.predict_triage({
        "heart_rate": 125.0,
        "spo2_pct": 82.0,
        "core_temp_c": 37.1,
        "resp_rate_bpm": 28.0,
        "suit_pressure_kpa": 29.5,
        "co2_mmhg": 2.2,
        "rad_dose_rate_usv": 28.0,
        "spo2_trust": 0.95,
        "hr_trust": 0.95,
        "temp_trust": 0.98,
        "press_trust": 0.98,
    })
    assert triage["diagnosis"] == "HYPOXIA"
    assert triage["severity"] == "critical"
    assert any("Secondary Oxygen Pack" in act for act in triage["actions"])


def test_ml_triage_arabic_translation():
    ml = get_medical_ml_engine()
    triage = ml.predict_triage({
        "heart_rate": 140.0,
        "spo2_pct": 98.0,
        "core_temp_c": 39.2,
        "resp_rate_bpm": 26.0,
        "suit_pressure_kpa": 29.5,
        "co2_mmhg": 2.1,
        "rad_dose_rate_usv": 28.0,
        "spo2_trust": 0.95,
        "hr_trust": 0.95,
        "temp_trust": 0.95,
        "press_trust": 0.98,
    }, lang="ar")
    assert triage["diagnosis"] == "HEAT_EXHAUSTION"
    assert "حرار" in triage["title"]  # Arabic title contains حرارة
    assert any("تبريد" in act for act in triage["actions"])  # Cooling in Arabic
