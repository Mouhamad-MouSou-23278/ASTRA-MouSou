"""Generate high-fidelity NASA EVA Medical & Planetary Sensor Telemetry Dataset.

Grounded in:
- NASA-STD-3001 (Space Flight Human-System Standard)
- EVA-EXP-0034 (Exploration EVA System Technical Standard)
- MSL/RAD Radiation Measurements (Hassler et al., 2014)
- Spaceflight Human Performance & Decompression Profiles

Produces data/nasa_eva_medical_telemetry.csv with both normal, pathological, and
sensor fault artifact conditions for training and validating the ASTRA Medical ML engine.
"""
import csv
import math
import os
import random

NUM_SAMPLES = 1200
OUTPUT_FILE = os.path.join(os.path.dirname(__file__), "..", "data", "nasa_eva_medical_telemetry.csv")

random.seed(42)

CLASSES = [
    "NOMINAL",
    "HEAT_EXHAUSTION",
    "HYPOXIA",
    "HYPERCAPNIA",
    "DECOMPRESSION_RISK",
    "RADIATION_EVENT",
    "SENSOR_ARTIFACT_FALSE_ALARM",
]

rows = []

for i in range(NUM_SAMPLES):
    t = i * 5.0  # 5-second intervals
    cls = random.choice(CLASSES)

    # Base nominal physiological state
    hr = random.gauss(72, 6)
    spo2 = random.gauss(98.5, 0.8)
    core_temp = random.gauss(37.0, 0.15)
    resp_rate = random.gauss(14, 2)
    suit_press = random.gauss(29.6, 0.3)
    co2 = random.gauss(2.1, 0.4)
    rad_rate = random.gauss(28.0, 2.5)

    # Default high sensor trust scores
    spo2_trust = random.uniform(0.92, 0.99)
    hr_trust = random.uniform(0.91, 0.99)
    temp_trust = random.uniform(0.94, 0.99)
    press_trust = random.uniform(0.95, 0.99)

    if cls == "NOMINAL":
        pass  # Nominal baseline

    elif cls == "HEAT_EXHAUSTION":
        # Elevated metabolic workload, failing LCVG (Liquid Cooling and Ventilation Garment)
        core_temp = random.uniform(38.3, 39.8)
        hr = random.uniform(125, 165)
        resp_rate = random.uniform(22, 32)
        spo2 = random.uniform(96, 99)

    elif cls == "HYPOXIA":
        # Primary O2 regulator flow restriction
        spo2 = random.uniform(78.0, 89.0)
        hr = random.uniform(115, 150)
        resp_rate = random.uniform(24, 35)

    elif cls == "HYPERCAPNIA":
        # Amine bed / LiOH scrubber breakthrough
        co2 = random.uniform(7.8, 14.5)
        resp_rate = random.uniform(26, 38)
        hr = random.uniform(105, 135)

    elif cls == "DECOMPRESSION_RISK":
        # Micrometeorite puncture or wrist seal breach
        suit_press = random.uniform(18.0, 26.5)
        hr = random.uniform(110, 160)
        resp_rate = random.uniform(22, 30)

    elif cls == "RADIATION_EVENT":
        # Solar Particle Event (SPE) or high galactic cosmic ray spike
        rad_rate = random.uniform(450.0, 2500.0)
        # Prodromal acute radiation symptoms at extreme doses
        if rad_rate > 1500:
            hr += random.uniform(10, 25)

    elif cls == "SENSOR_ARTIFACT_FALSE_ALARM":
        # Physical sensor fault (motion artifact, loose lead, stuck transducer, optical dropout)
        fault_type = random.choice(["spo2_drop", "hr_spike", "temp_drift", "pressure_stuck"])
        if fault_type == "spo2_drop":
            spo2 = random.uniform(60.0, 75.0)  # looks like fatal hypoxia!
            spo2_trust = random.uniform(0.05, 0.35)  # but TDL detected bad optical perfusion / dropout!
            # Patient's actual physiology is totally calm
            hr = random.gauss(70, 5)
            resp_rate = random.gauss(14, 1.5)
        elif fault_type == "hr_spike":
            hr = random.uniform(185, 230)  # looks like ventricular tachycardia!
            hr_trust = random.uniform(0.10, 0.38)  # but TDL detected 60Hz EMI / electrode disconnect!
            resp_rate = random.gauss(14, 1.5)
            spo2 = random.gauss(98, 0.5)
        elif fault_type == "temp_drift":
            core_temp = random.uniform(41.0, 44.0)  # lethal hyperthermia!
            temp_trust = random.uniform(0.12, 0.30)  # TDL detected out-of-range sensor drift!
            hr = random.gauss(72, 5)
        elif fault_type == "pressure_stuck":
            suit_press = 0.0  # complete depressurization!
            press_trust = 0.05  # TDL detected transducer disconnect!
            hr = random.gauss(74, 6)

    # Clamp bounds to physical reality
    spo2 = max(50.0, min(100.0, spo2))
    hr = max(30.0, min(250.0, hr))
    core_temp = max(33.0, min(45.0, core_temp))
    resp_rate = max(6.0, min(50.0, resp_rate))
    suit_press = max(0.0, min(40.0, suit_press))
    co2 = max(0.1, min(25.0, co2))
    rad_rate = max(10.0, min(10000.0, rad_rate))

    rows.append({
        "timestamp_s": round(t, 1),
        "heart_rate": round(hr, 1),
        "spo2_pct": round(spo2, 1),
        "core_temp_c": round(core_temp, 2),
        "resp_rate_bpm": round(resp_rate, 1),
        "suit_pressure_kpa": round(suit_press, 2),
        "co2_mmhg": round(co2, 2),
        "rad_dose_rate_usv": round(rad_rate, 1),
        "spo2_trust": round(spo2_trust, 3),
        "hr_trust": round(hr_trust, 3),
        "temp_trust": round(temp_trust, 3),
        "press_trust": round(press_trust, 3),
        "target_diagnosis": cls,
    })

os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
with open(OUTPUT_FILE, "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
    writer.writeheader()
    writer.writerows(rows)

print(f"Successfully generated {len(rows)} samples in {OUTPUT_FILE}")
