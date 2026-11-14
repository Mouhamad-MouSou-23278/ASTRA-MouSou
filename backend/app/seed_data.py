"""Demo catalogue seeded into an empty database.

Everything here is editable afterwards through the role dashboards. All
astronaut profiles are synthetic. Rule thresholds are *demonstration values*
chosen so the default scenario is instructive; they are not clinical limits
taken from the cited NASA portals, which are attributed as general references.
"""
from __future__ import annotations

DEMO_USERS = [
    # username, full name, role, password
    ("admin", "System Administrator", "admin", "astra-admin-2026"),
    ("physical", "Physical Sensor Team", "physical", "astra-physical-2026"),
    ("medical", "Medical Knowledge Team", "medical", "astra-medical-2026"),
    ("operator", "Test Operator", "operator", "astra-operator-2026"),
    ("viewer", "Instrument Viewer", "viewer", "astra-viewer-2026"),
]

SYSTEM_CONFIG = [
    ("viewer_token_ttl_minutes", 120, "Default lifetime of QR viewer tokens (minutes, 1-1440)."),
    ("default_speed", 4, "Initial playback speed of new sessions (0.5, 1, 2, 4, 8 or 16)."),
    ("simulation_lock", False, "When true no simulation can start or resume (set by emergency stop)."),
    ("public_base_url", "", "Base URL encoded into QR codes. Empty = auto-detect the LAN address."),
    ("ai_mode", "auto", "auto = configured LLM provider with local fallback; local_only = always the deterministic local assistant."),
    ("telemetry_persist_interval_s", 1, "Simulated seconds between persisted telemetry frames (1-10)."),
    ("default_seed", 2026, "Random seed used when a prompt does not specify one."),
]

CUSTOM_FIELDS = [
    # key, label, type, options, required, category, unit, description
    ("manufacturer", "Manufacturer", "string", [], False, None, "", "Hardware vendor or lab that built the unit."),
    ("placement", "Body / suit placement", "string", [], False, None, "", "Where the sensor is mounted."),
    ("redundancy", "Redundancy level", "enum", ["none", "dual", "triple"], False, None, "", "Number of independent units."),
    ("calibration_interval_days", "Calibration interval", "number", [], False, None, "days", "Days between calibrations."),
    ("flight_qualified", "Flight qualified", "boolean", [], False, None, "", "Passed qualification testing."),
]

# key, name, category, unit, channel, min, max, accuracy, max_rate/min, resolution, noise_std, custom
SENSORS = [
    ("heart_rate", "Heart rate (ECG)", "physiological", "bpm", "heart_rate_bpm", 30, 220, 1.0, 160, 1.0, 0.8,
     {"placement": "Chest harness", "redundancy": "dual", "flight_qualified": True}),
    ("respiration_rate", "Respiration rate", "physiological", "breaths/min", "respiration_rate_bpm", 4, 60, 0.5, 30, 0.1, 0.4,
     {"placement": "Chest band"}),
    ("spo2", "Blood oxygen saturation (SpO2)", "physiological", "%", "spo2_pct", 70, 101, 0.5, 8, 0.1, 0.3,
     {"placement": "Ear lobe"}),
    ("core_temp", "Core body temperature", "physiological", "degC", "core_temp_c", 34, 42, 0.05, 0.25, 0.01, 0.03,
     {"placement": "Ingestible telemetry capsule", "redundancy": "none", "calibration_interval_days": 1}),
    ("skin_temp", "Mean skin temperature", "physiological", "degC", "skin_temp_c", 20, 42, 0.1, 4.0, 0.01, 0.06,
     {"placement": "4-site thermistor array"}),
    ("metabolic_rate", "Metabolic rate (estimated)", "physiological", "W", "metabolic_rate_w", 50, 900, 8.0, 900, 1.0, 6.0,
     {"placement": "Derived from O2 use and CO2 production"}),
    ("suit_pressure", "Suit internal pressure", "spacesuit", "kPa", "suit_pressure_kpa", 20, 40, 0.05, 2, 0.01, 0.03,
     {"redundancy": "triple", "flight_qualified": True}),
    ("o2_tank", "Primary O2 remaining", "spacesuit", "%", "o2_tank_pct", 0, 100, 0.2, 2, 0.1, 0.15,
     {"redundancy": "dual"}),
    ("ppco2", "Helmet CO2 partial pressure", "spacesuit", "mmHg", "ppco2_mmhg", 0, 20, 0.1, 3, 0.01, 0.06,
     {"placement": "Helmet vent return"}),
    ("suit_gas_temp", "Suit internal gas temperature", "spacesuit", "degC", "suit_gas_temp_c", 0, 45, 0.1, 5, 0.01, 0.05,
     {}),
    ("lcg_outlet_temp", "Cooling garment outlet temperature", "spacesuit", "degC", "lcg_outlet_temp_c", 0, 45, 0.1, 15, 0.01, 0.05,
     {"placement": "Liquid cooling garment return line"}),
    ("battery", "Suit battery", "spacesuit", "%", "battery_pct", 0, 100, 0.5, 2, 1.0, 0.2,
     {}),
    ("rad_dose_cum", "Personal dosimeter (cumulative dose)", "spacesuit", "uSv", "rad_dose_cum_usv", 0, 100000, 0.02, 50, 0.01, 0.01,
     {"placement": "Chest, under outer garment"}),
    ("ext_temp", "External air temperature", "environmental", "degC", "ext_temp_c", -130, 40, 0.3, 6, 0.1, 0.2,
     {"placement": "Lander mast"}),
    ("ext_pressure", "External pressure", "environmental", "Pa", "ext_pressure_pa", 400, 1200, 2.0, 30, 0.1, 1.0,
     {"placement": "Lander mast"}),
    ("wind_speed", "Wind speed", "environmental", "m/s", "wind_speed_ms", 0, 60, 0.3, 30, 0.1, 0.2,
     {"placement": "Lander mast"}),
    ("rad_dose_rate", "Radiation dose rate", "environmental", "uSv/h", "rad_dose_rate_usv_h", 0, 50000, 1.5, 20000, 0.1, 1.0,
     {"placement": "Lander deck radiation assessment detector"}),
]

# Extra (non-default) profiles that the Physical Team can switch to.
EXTRA_PROFILES = [
    ("heart_rate", {"name": "motion-artifact", "is_default": False, "noise_std": 1.5,
                    "spike_probability": 0.02, "spike_magnitude": 35.0,
                    "notes": "Electrode motion artifacts during vigorous arm work."}),
    ("core_temp", {"name": "weak-telemetry", "is_default": False, "noise_std": 0.05,
                   "dropout_probability": 0.01, "dropout_duration_s": 8.0,
                   "notes": "Intermittent capsule telemetry link."}),
]

# key, name, fault_type, description, magnitude, duration_s, expected_flag, keywords
FAILURE_SIGNATURES = [
    ("link_dropout", "Telemetry link dropout", "disconnect",
     "Sensor stops reporting: connector fault or wireless link loss.", None, 20.0, "DISCONNECTED",
     ["disconnect", "disconnected", "disconnection", "dropout", "link loss", "lost signal", "signal loss"]),
    ("motion_artifact_spikes", "Motion-artifact spikes", "spike",
     "Isolated large jumps caused by electrode or cable motion.", None, 20.0, "SPIKE",
     ["spike", "spikes", "artifact", "glitch"]),
    ("thermistor_drift", "Sensor drift", "drift",
     "Slow monotonic offset growth (ageing, thermal gradient, reference loss).", None, 120.0,
     "IMPLAUSIBLE_TREND", ["drift", "drifting"]),
    ("frozen_adc", "Frozen / stuck output", "stuck",
     "Output freezes at the last value (ADC or firmware hang).", None, 30.0, "STUCK",
     ["stuck", "frozen", "freeze", "freezes"]),
    ("emi_noise_burst", "EMI noise burst", "noise_burst",
     "Noise far above the datasheet accuracy (electromagnetic interference).", None, 20.0,
     "EXCESS_NOISE", ["noise", "noisy", "interference", "emi"]),
    ("calibration_offset", "Calibration offset (bias)", "bias",
     "Constant offset. Not detectable by single-sensor checks; it needs a redundant sensor "
     "or the future ML trust layer, which is why the DataQualityAssessor interface exists.",
     None, 60.0, "", ["bias", "offset", "miscalibrated", "miscalibration"]),
]

SYMPTOMS = [
    ("headache", "Headache", ""),
    ("dizziness", "Dizziness / light-headedness", ""),
    ("nausea", "Nausea", ""),
    ("fatigue", "Unusual fatigue", ""),
    ("profuse_sweating", "Profuse sweating", ""),
    ("palpitations", "Racing heart / palpitations", ""),
    ("shortness_of_breath", "Shortness of breath", ""),
    ("confusion", "Confusion or slowed thinking", ""),
    ("muscle_cramps", "Muscle cramps", ""),
    ("visual_disturbance", "Visual disturbance", ""),
    ("joint_pain", "Joint pain", ""),
    ("tingling", "Tingling of fingers or lips", ""),
]

_PORTAL_NOTE = ("Official NASA portal, attributed as a general reference. ASTRA's rule "
                "thresholds are demonstration values and are not copied from this source.")

SOURCES = [
    ("nasa_hrp_evidence", "NASA Human Research Program - Evidence Reports", "NASA Human Research Program",
     "https://humanresearchroadmap.nasa.gov/evidence/", "evidence_report", "", _PORTAL_NOTE),
    ("nasa_hrp_risks", "NASA Human Research Program - Human Spaceflight Risks", "NASA Human Research Program",
     "https://www.nasa.gov/hrp/risks/", "risk_page", "", _PORTAL_NOTE),
    ("nasa_osdr", "NASA Open Science Data Repository (OSDR)", "NASA",
     "https://osdr.nasa.gov/bio/repo/", "data_repository", "", _PORTAL_NOTE),
    ("msl_rad_surface_2014",
     "Mars' Surface Radiation Environment Measured with the Mars Science Laboratory's Curiosity Rover",
     "MSL/RAD science team", "https://doi.org/10.1126/science.1244797", "paper",
     "Hassler, D. M., et al. (2014). Science, 343(6169), 1244797.",
     "Basis for the simulated baseline surface dose-equivalent rate (~0.67 mSv/day)."),
    ("hirise_dtm_jezero", "HiRISE Digital Terrain Model DTEEC_045994_1985_046060_1985 (Jezero Crater)",
     "NASA/JPL-Caltech/University of Arizona", "https://www.uahirise.org/dtm/ESP_045994_1985", "dataset",
     "", "Real topography used for the 3D scene. See docs/DATA_PROVENANCE.md."),
]

# key, name, hrp_risk, description, mechanism, symptoms, sources, indicators[(sensor, direction, note)]
CONDITIONS = [
    ("heat_strain", "Exertional heat strain",
     "Risk of Injury and Compromised Performance Due to EVA Operations",
     "Body heat is stored faster than the suit can remove it, so core temperature climbs.",
     "Core temperature rises when metabolic heat plus external heat load exceeds the heat the "
     "liquid cooling garment removes. Heart rate rises with thermal strain. This is a thermal "
     "balance problem and is unrelated to radiation exposure.",
     ["profuse_sweating", "fatigue", "dizziness", "headache", "nausea", "palpitations", "muscle_cramps"],
     ["nasa_hrp_evidence", "nasa_hrp_risks"],
     [("core_temp", "rising", "Primary indicator: sustained rise above baseline."),
      ("lcg_outlet_temp", "high", "Coolant returns warm when cooling is saturated or degraded."),
      ("skin_temp", "rising", "Skin warms as heat rejection falls."),
      ("heart_rate", "rising", "Roughly 30 bpm per degC of core temperature rise.")]),
    ("radiation_exposure", "Elevated space radiation exposure",
     "Risk of Radiation Carcinogenesis",
     "Ambient dose rate is above the normal Mars surface background, for example during a "
     "solar particle event.",
     "Radiation is managed as cumulative dose against exposure limits. At the dose rates "
     "simulated here it produces no immediate change in body temperature, heart rate or any "
     "other vital sign; it is independent of thermal stress.",
     [],
     ["nasa_hrp_evidence", "nasa_hrp_risks", "msl_rad_surface_2014", "nasa_osdr"],
     [("rad_dose_rate", "high", "Dose rate well above the ~28 uSv/h surface background."),
      ("rad_dose_cum", "rising", "Cumulative EVA dose accumulates faster.")]),
    ("cardiovascular_strain", "Excessive cardiovascular strain",
     "Risk of Cardiovascular Adaptations Contributing to Adverse Mission Performance and Health Outcomes",
     "Heart rate is sustained near maximal levels.",
     "Sustained very high heart rate from workload and/or heat strain reduces work capacity.",
     ["palpitations", "shortness_of_breath", "fatigue", "dizziness"],
     ["nasa_hrp_evidence", "nasa_hrp_risks"],
     [("heart_rate", "high", "Sustained mean heart rate above the configured limit.")]),
    ("hypoxia", "Hypoxia",
     "Risk of Reduced Crew Health and Performance Due to Hypobaric Hypoxia",
     "Blood oxygen saturation is below the safe range.",
     "Insufficient oxygen delivery, e.g. from low suit oxygen partial pressure.",
     ["confusion", "visual_disturbance", "shortness_of_breath", "tingling", "headache"],
     ["nasa_hrp_evidence", "nasa_hrp_risks"],
     [("spo2", "low", "Sustained oxygen saturation below the configured limit.")]),
    ("hypercapnia", "CO2 retention (hypercapnia)",
     "Risk of Injury and Compromised Performance Due to EVA Operations",
     "Carbon dioxide is accumulating in the helmet.",
     "CO2 washout cannot keep up with production at the current workload, or the scrubber is degraded.",
     ["headache", "shortness_of_breath", "confusion", "fatigue"],
     ["nasa_hrp_evidence", "nasa_hrp_risks"],
     [("ppco2", "high", "Helmet CO2 partial pressure above the configured limit.")]),
    ("decompression", "Suit pressure loss / decompression sickness risk",
     "Risk of Decompression Sickness",
     "Suit pressure has fallen below the regulated band.",
     "Loss of suit pressure reduces oxygen partial pressure and can cause decompression sickness.",
     ["joint_pain", "tingling", "confusion", "shortness_of_breath"],
     ["nasa_hrp_evidence", "nasa_hrp_risks"],
     [("suit_pressure", "low", "Suit pressure below the regulated band.")]),
]

# condition_key, audience, priority, text
RECOMMENDATIONS = [
    ("heat_strain", "astronaut", 1, "Stop strenuous work and rest in place to cut metabolic heat."),
    ("heat_strain", "astronaut", 2, "Set suit cooling to maximum and check coolant flow."),
    ("heat_strain", "astronaut", 3, "If core temperature keeps rising, start back to the lander."),
    ("heat_strain", "flight_surgeon", 1, "Track core temperature trend and heart rate; consider terminating the EVA if the rise continues."),
    ("radiation_exposure", "astronaut", 1, "Shorten surface time and return to the lander shelter."),
    ("radiation_exposure", "astronaut", 2, "Report the cumulative dosimeter reading at ingress."),
    ("radiation_exposure", "flight_surgeon", 1, "Log the EVA dose against exposure limits. No acute symptoms are expected at this dose rate."),
    ("cardiovascular_strain", "astronaut", 1, "Slow down or pause until heart rate recovers."),
    ("cardiovascular_strain", "flight_surgeon", 1, "Check for concurrent heat strain before resuming the task."),
    ("hypoxia", "astronaut", 1, "Stop activity, check oxygen supply and suit pressure, and prepare to return."),
    ("hypoxia", "flight_surgeon", 1, "Confirm with a second indicator before declaring an emergency."),
    ("hypercapnia", "astronaut", 1, "Reduce workload and increase helmet ventilation flow."),
    ("hypercapnia", "flight_surgeon", 1, "Watch for headache or confusion; consider early termination."),
    ("decompression", "astronaut", 1, "Return to the lander immediately and check for suit leaks."),
    ("decompression", "flight_surgeon", 1, "Prepare the decompression sickness treatment protocol."),
]

_DEMO = " Demonstration threshold, configurable by the Medical Team."

# key, name, condition, severity, logic, clauses, sustain_s, clear_after_s, message, rationale
RULES = [
    ("heat_strain_caution", "Heat strain - rising core temperature", "heat_strain", "caution", "all",
     [{"sensor_key": "core_temp", "aggregation": "last", "window_s": 30, "operator": ">=", "threshold": 37.5},
      {"sensor_key": "core_temp", "aggregation": "slope_per_min", "window_s": 120, "operator": ">=", "threshold": 0.05},
      {"sensor_key": "lcg_outlet_temp", "aggregation": "mean", "window_s": 30, "operator": ">=", "threshold": 20.0}],
     10, 30,
     "Core temperature is elevated and still rising while the cooling garment is saturated.",
     "Three independent signals must agree: an elevated core temperature, a sustained upward "
     "trend, and warm coolant return (the suit is not rejecting enough heat)." + _DEMO),
    ("heat_strain_warning", "Heat strain - high core temperature", "heat_strain", "warning", "all",
     [{"sensor_key": "core_temp", "aggregation": "last", "window_s": 30, "operator": ">=", "threshold": 38.0},
      {"sensor_key": "heart_rate", "aggregation": "mean", "window_s": 30, "operator": ">=", "threshold": 120}],
     10, 30,
     "Core temperature has reached 38 degC with an elevated heart rate.",
     "High core temperature confirmed by cardiovascular response." + _DEMO),
    ("radiation_dose_rate_elevated", "Radiation - elevated dose rate", "radiation_exposure", "advisory", "all",
     [{"sensor_key": "rad_dose_rate", "aggregation": "mean", "window_s": 20, "operator": ">=", "threshold": 150}],
     10, 20,
     "Ambient radiation dose rate is several times the Mars surface background.",
     "Dose rate above ~5x the nominal surface background of ~28 uSv/h. Managed as cumulative "
     "exposure; it does not affect body temperature." + _DEMO),
    ("radiation_dose_rate_high", "Radiation - high dose rate", "radiation_exposure", "warning", "all",
     [{"sensor_key": "rad_dose_rate", "aggregation": "mean", "window_s": 20, "operator": ">=", "threshold": 2000}],
     10, 20,
     "Ambient radiation dose rate is very high; seek shelter.",
     "Dose rate consistent with a strong solar particle event." + _DEMO),
    ("tachycardia_sustained", "Sustained very high heart rate", "cardiovascular_strain", "caution", "all",
     [{"sensor_key": "heart_rate", "aggregation": "mean", "window_s": 60, "operator": ">=", "threshold": 160}],
     15, 30,
     "Heart rate has stayed above 160 bpm.", "Sustained near-maximal heart rate." + _DEMO),
    ("hypoxemia", "Low blood oxygen saturation", "hypoxia", "warning", "all",
     [{"sensor_key": "spo2", "aggregation": "mean", "window_s": 30, "operator": "<", "threshold": 92}],
     10, 30,
     "Blood oxygen saturation is below 92%.", "Sustained desaturation." + _DEMO),
    ("hypercapnia_caution", "Elevated helmet CO2", "hypercapnia", "caution", "all",
     [{"sensor_key": "ppco2", "aggregation": "mean", "window_s": 60, "operator": ">=", "threshold": 6.0}],
     15, 30,
     "Helmet CO2 partial pressure is above 6 mmHg.", "CO2 washout is insufficient." + _DEMO),
    ("suit_pressure_low", "Low suit pressure", "decompression", "critical", "all",
     [{"sensor_key": "suit_pressure", "aggregation": "mean", "window_s": 10, "operator": "<", "threshold": 26.0}],
     3, 20,
     "Suit pressure is below the regulated band.", "Possible suit leak." + _DEMO),
]

ASTRONAUTS = [
    {"callsign": "ARES-1", "full_name": "Cmdr. Lina Haddad (synthetic)", "age": 38, "sex": "F",
     "mass_kg": 64.0, "height_cm": 168.0, "resting_hr": 58.0, "baseline_core_temp_c": 36.9, "vo2max": 50.0,
     "notes": "Synthetic profile for demonstration. Not a real person.",
     "health_history": [
         {"date": "2025-03-12", "event": "Pre-flight medical certification", "notes": "No restrictions."},
         {"date": "2025-09-04", "event": "Heat acclimation protocol", "notes": "Completed 10-day protocol."},
         {"date": "2026-02-18", "event": "EVA suit fit check", "notes": "Minor shoulder mobility restriction, resolved."},
     ]},
    {"callsign": "ARES-2", "full_name": "Dr. Marcus Oyelaran (synthetic)", "age": 44, "sex": "M",
     "mass_kg": 82.0, "height_cm": 181.0, "resting_hr": 62.0, "baseline_core_temp_c": 37.0, "vo2max": 46.0,
     "notes": "Synthetic profile for demonstration. Not a real person.",
     "health_history": [
         {"date": "2025-03-14", "event": "Pre-flight medical certification", "notes": "No restrictions."},
         {"date": "2025-11-20", "event": "Exercise tolerance test", "notes": "Mild exertional heat intolerance noted."},
     ]},
]

# Lander pose and waypoints on the real Jezero terrain (metres east/north of the site).
LANDER = {"x": 0.0, "y": 0.0, "hatch_heading": 90.0}
WAYPOINTS = [
    ("WP_ALPHA", "Waypoint Alpha", "route", 55.0, 20.0, 1, "First route marker, east-north-east of the lander."),
    ("WP_BRAVO", "Waypoint Bravo", "route", 105.0, 48.0, 2, "Second route marker on the smooth plain."),
    ("SAMPLE_SITE_1", "Sample Site 1", "sample_site", 140.0, 70.0, 3,
     "Marked sampling area on level ground beside a small depression."),
    ("CRATER_RIM", "Crater Rim", "poi", 150.0, 92.0, None, "Edge of the small depression north-east of the route."),
    ("RIDGE_FIELD", "Ridge Field", "poi", -110.0, 40.0, None, "Aeolian ridges west of the lander."),
]

DEFAULT_PROMPT = (
    "Simulate an astronaut exiting the lander, walking along a defined route, reaching a marked "
    "Mars surface area, kneeling down, and collecting a soil sample. During the mission, introduce "
    "increased environmental radiation exposure and an independent thermal stress event. Simulate "
    "appropriate changes in relevant sensor readings, generate a medical warning when the "
    "configured rule is met, and allow the astronaut to ask ASTRA why the body temperature is "
    "increasing."
)

SCENARIOS = [
    ("mars_surface_walk", "Mars Surface Walk", DEFAULT_PROMPT, True),
    ("sensor_fault_drill", "Sensor fault drill",
     "The astronaut exits the lander and walks to Waypoint Alpha, then waits for 60 seconds. "
     "Inject a disconnect fault on the core temperature sensor for 30 seconds and spikes on the "
     "heart rate sensor, so the team can check that data quality warnings stay separate from "
     "medical warnings.", False),
    ("nominal_sample_collection", "Nominal sample collection",
     "Astronaut exits the lander, walks the route to the sample site, kneels, collects a soil "
     "sample for 90 seconds, stands up and returns to the lander. No anomalies.", False),
]
