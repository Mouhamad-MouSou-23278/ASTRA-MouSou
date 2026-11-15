import sys
import os

# Add backend directory to sys.path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

print("--- Testing API Endpoints ---")

# 1. Instruments
resp = client.get("/api/medical/instruments")
print(f"GET /api/medical/instruments: status={resp.status_code}, count={len(resp.json().get('instruments', []))}, warnings={len(resp.json().get('warnings', []))}")
assert resp.status_code == 200

# 2. Pre-simulation risk
payload = {
    "astronaut": {"resting_heart_rate": 72.0, "resting_core_temp": 37.0},
    "planned_eva_hours": 6.5,
    "expected_metabolic_watts": 350.0,
}
resp = client.post("/api/medical/pre-sim-risk", json=payload)
data = resp.json()
print(f"POST /api/medical/pre-sim-risk: status={resp.status_code}, overall_risk_score={data.get('overall_risk_score')}, risk_level={data.get('risk_level')}, guideline={data.get('nasa_guideline')}")
assert resp.status_code == 200
assert "overall_risk_score" in data

# 3. ML Triage
triage_payload = {
    "hr": 145.0,
    "spo2": 78.0,
    "core_temp_c": 37.1,
    "resp_rate": 28.0,
    "suit_pressure_psi": 4.3,
    "co2_mmhg": 4.0,
    "activity_level": "climbing",
    "hr_slope_per_min": 5.0,
    "spo2_slope_per_min": -8.0,
    "hr_spo2_divergence": 2.1,
    "tdl_trust_score": 0.95,
    "tdl_is_artifact": 0
}
resp = client.post("/api/medical/ml-triage", json=triage_payload)
print(f"POST /api/medical/ml-triage: status={resp.status_code}, diagnosis={resp.json().get('diagnosis')}, confidence={resp.json().get('confidence')}")
assert resp.status_code == 200

print("--- All Endpoint Checks Passed Successfully! ---")
