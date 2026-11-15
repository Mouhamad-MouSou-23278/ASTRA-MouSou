# ASTRA — Project Overview
**System**: Autonomous Spaceflight Telemetry & Reliability Architecture  
**Concept**: Astronaut Health Monitoring & Mars Mission Simulation  
**Team**: Gravity Brains / ASTRA Pioneers  
**Target Event**: NASA Space Apps Challenge 2026  
**Track**: "Create Health Monitoring Software for Astronauts on Space Missions"  
**Classification**: Prototype / Flight Decision-Support Demonstration  

---

## 1. Executive Summary

ASTRA is an autonomous spaceflight telemetry, sensor physics, and clinical decision-support platform engineered specifically for deep-space planetary surface exploration. Designed around the operational constraints of human Mars missions—specifically prolonged extravehicular activity (EVA) in Jezero Crater—ASTRA bridges the 14- to 22-minute one-way communication latency with Earth by providing:

1. **Deterministic Telemetry Verification**: A multi-stage **Trusted Data Layer (TDL)** that separates sensor hardware faults from genuine clinical emergencies before clinical alarms trigger.
2. **Physics-Grounded Sensor Simulation**: Hardware transducer models (IEC 60751 RTD platinum thermometry, piezoresistive pressure, PIN diode/bubble radiation dosimeters) simulating realistic spaceflight failure modes (open-circuit, electrode detachment, drift, noise bursts, spikes).
3. **Machine Learning Clinical Triage**: An 18-feature Random Forest clinical decision engine trained on 10,000 synthetic NASA EVA telemetry records, achieving 95.15% validation accuracy with sub-millisecond offline inference.
4. **Interactive 3D Geospatial Simulation**: Authentic high-resolution topographic visualization of Jezero Crater derived from NASA HiRISE stereo digital terrain models (ESP_045994_1985), featuring the Perseverance rover, Ingenuity helicopter, and spacesuit anatomical sensor node mapping.
5. **Earth-Independent Decision Support**: Natural language mission planning, automated emergency stop, voice-enabled assistant with deterministic local fallback, doctor QR mobile pairing, and bilingual (English / العربية) operational interfaces.

> [!IMPORTANT]
> **Regulatory and Flight Qualification Disclaimer**:  
> ASTRA is a software prototype and decision-support concept developed for demonstration and engineering research purposes. It is **not** a certified medical device under FDA/CE-MDR standards and is **not** currently flight-qualified for active spaceflight operations. Sensor data and physiological records used within the platform are simulated.

---

## 2. Core Problem & Operational Context

### 2.1 The Speed-of-Light Latency Barrier
In low Earth orbit (LEO) aboard the International Space Station (ISS), Mission Control Houston (MCC) and the Flight Surgeon console maintain continuous, sub-second telemetry feeds and immediate audio communications. 

During human exploration of Mars:
- Orbital distance between Earth and Mars varies from **55 million km (0.37 AU)** at opposition to **401 million km (2.68 AU)** at superior conjunction.
- One-way radio propagation delay ranges from **3.1 minutes to 22.3 minutes** (round-trip: 6.2 to 44.6 minutes).
- Acute spaceflight medical emergencies—such as hypoxic loss of consciousness (< 60 seconds), rapid spacesuit depressurization (< 15 seconds), or malignant cardiac ventricular arrhythmias (< 4 minutes)—cannot await Earth-based triage.

### 2.2 The Sensor Reliability Paradox: "A Plausible Value is Not a Valid Value"
Spaceflight sensors operate under extreme physical duress:
- Rapid temperature swings on Mars (-125°C to +20°C) cause thermal expansion and resistance drift.
- Astronaut perspiration inside Liquid Cooling and Ventilation Garments (LCVG) elevates Ag/AgCl electrode impedance from 5 kΩ to over 100 kΩ.
- Microgravity fluid shifts (1.5–2.0 L cephalad) cause jugular vein distension and tissue edema, corrupting optical photoplethysmography (PPG).
- Sensor wire flexion at spacesuit joints causes intermittent disconnects and triboelectric spikes.

Traditional medical monitors treat any incoming numerical signal as ground truth. In deep space, an artifactual SpO2 reading of 65% caused by motion artifact can trigger an unnecessary emergency EVA abort, wasting critical life-support consumables. Conversely, genuine hypoxia masked by a stuck nominal sensor can cause fatal neurological damage.

ASTRA addresses this fundamental paradox through its **Trusted Data Layer (TDL)**.

---

## 3. System Architecture & High-Level Components

```
+-----------------------------------------------------------------------------------+
|                                 USER INTERFACES                                   |
|  [Admin Console]  [Physical Lab]  [Medical Console]  [Operator HUD]  [Viewer QR]  |
|            Bilingual Localization (EN / AR) | 4 Aerospace Themes                  |
+-----------------------------------------------------------------------------------+
                                       |
                                       v
+-----------------------------------------------------------------------------------+
|                             FASTAPI CORE BACKEND                                  |
|   - Server-Side Role-Based Access Control (RBAC: 5 Roles)                         |
|   - RESTful API Endpoints (/api/sensors, /api/medical, /api/sessions, etc.)       |
|   - WebSocket Telemetry Streaming (Deterministic Tick & Replay Engine)            |
+-----------------------------------------------------------------------------------+
           |                                  |                        |
           v                                  v                        v
+----------------------+           +--------------------+    +--------------------+
| SENSOR PHYSICS LAB   |           | TRUSTED DATA LAYER |    | ML DECISION ENGINE |
| - Callendar-VanDusen |           | - Bounds Checking  |    | - 18-Feature RF    |
| - Piezoresistive     | --------> | - Rate-of-Change   | -> | - 95.15% Accuracy  |
| - Bubble Dosimeter   |           | - Cross-Consensus  |    | - Sub-ms Offline   |
| - Error Injection    |           | - Dynamic Trust    |    | - Bilingual Triage |
+----------------------+           +--------------------+    +--------------------+
                                              |
                                              v
+-----------------------------------------------------------------------------------+
|                         SIMULATION & GEOSPATIAL VISUALIZATION                     |
|   - Three.js WebGL Engine with NASA HiRISE Jezero Crater Elevation Topography     |
|   - Perseverance Rover, Ingenuity Helicopter, and EVA Spacesuit 3D Models         |
|   - Real-Time Charting with TDL Confidence Interval Shading                       |
+-----------------------------------------------------------------------------------+
```

---

## 4. Key Subsystems

### 4.1 Physical Sensor Engineering Lab (`/physical`)
Provides spaceflight instrumentation engineers with end-to-end sensor configuration:
- **Comprehensive Sensor Registry**: Full CRUD operations for physiological, spacesuit, and environmental sensors with semantic versioning and changelog tracking.
- **Physical Specifications Engine**: Configurable metrology specs (operating range, sampling frequency, excitation voltage, accuracy ±%, Callendar-Van Dusen coefficients $A, B, C$, gauge factor, thermal sensitivity drift).
- **Physics-Based Error Injection**: Discrete mathematical error models simulating disconnection, spikes, stuck values, Gaussian noise bursts, and calibration drift.
- **Interactive Anatomical Canvas**: 3D spatial mapping of spacesuit bio-sensors across anatomical landmarks (headband, sternum, wrist, finger, LCVG core).
- **Physical AI Assistant**: In-context LLM engineering assistant capable of verifying specs against **NASA-STD-3001** and **EVA-EXP-0034**.

### 4.2 Medical Knowledge Base & ML Clinical Triage (`/medical`)
- **Clinical Conditions Catalog**: Curated spaceflight medical emergencies (hypoxia, heat exhaustion, decompression sickness, hypercapnia, radiation acute sickness, internal jugular vein thrombosis).
- **Trusted Data Layer (TDL)**: 3-tier mathematical verification pipeline calculating real-time trust metrics ($T \in [0.0, 1.0]$).
- **Random Forest Clinical Engine**: Pure-Python, zero-dependency 18-feature Random Forest classifier evaluating heart rate, SpO2, core temp, respiration, suit pressure, ambient CO2, radiation rate, temporal slopes, and sensor trust scores.
- **Flight Instruments Registry**: Lifecycle tracking for 7 spaceflight instruments (PPO-001, ECG-001, RTD-001, PRS-001, CO2-001, RAD-001, RSP-001) with operating hours, calibration intervals, and maintenance warnings.
- **Pre-EVA Predictive Risk Calculator**: Assesses astronaut fitness, planned EVA duration, and metabolic workload to predict pre-mission risk.

### 4.3 Mission Operator Console & 3D Simulation (`/operator`)
- **Natural Language Mission Planner**: Translates human prompts (e.g., *"Perform geological sampling at Delta Scarp with a pulse oximeter failure at step 4"*) into deterministic execution plans.
- **Interactive 3D Mars Surface View**: Authentic Jezero Crater terrain powered by HiRISE elevation data, complete with EVA rover navigation, 1st-person visor HUD, and day/night atmospheric lighting.
- **Doctor / Examiner Mobile QR Pairing**: Instant session pairing via QR code allowing a flight surgeon or competition judge to monitor telemetry and inject real-time clinical events from their smartphone.
- **Deterministic Simulation Engine**: Seed-reproducible physics updates with sub-millisecond precision, pause/resume, variable playback speeds (1x to 10x), and emergency abort lock.

---

## 5. Summary of Implemented Capabilities

| Subsystem | Feature | Status | Verification Method |
|---|---|---|---|
| **Security** | JWT Authentication with scrypt password hashing | **IMPLEMENTED** | `test_api.py::test_login_*` |
| **RBAC** | 5-Role Server-Side Authorization | **IMPLEMENTED** | `test_api.py::test_rbac_matrix` |
| **Physics** | Callendar-Van Dusen RTD platinum thermometry | **IMPLEMENTED** | `test_physical_lab_mvp.py::test_physics_model_rtd_*` |
| **Physics** | Piezoresistive pressure transducer equation | **IMPLEMENTED** | `test_physical_lab_mvp.py::test_physics_model_piezoresistive_*` |
| **Physics** | PIN Diode & Radi-N2 dosimeter physics | **IMPLEMENTED** | `test_physical_lab_mvp.py::test_physics_model_radiation_*` |
| **TDL** | 3-Layer Trust Calculation & False Alarm Suppression | **IMPLEMENTED** | `test_engine.py`, `test_medical_ml.py` |
| **ML Engine** | 18-Feature Random Forest (95.15% accuracy) | **IMPLEMENTED** | `test_medical_ml.py::test_ml_engine_*` |
| **AI Fallback** | Deterministic local planner + explainer (zero network) | **IMPLEMENTED** | `test_planner_assistant.py` |
| **3D Engine** | Three.js Jezero Crater HiRISE terrain visualization | **IMPLEMENTED** | Frontend production build |
| **QR Viewer** | Read-only session-scoped mobile pairing | **IMPLEMENTED** | `test_api.py::test_viewer_tokens_*` |
| **Localization** | Bilingual English / Arabic with dynamic RTL | **IMPLEMENTED** | `frontend/src/lib/i18n.ts` |
| **Emergency Stop**| Hard system abort with admin release lock | **IMPLEMENTED** | `test_api.py::test_emergency_stop_*` |

---

## 6. Future Roadmap

1. **Hardware-in-the-Loop (HIL) Bridge**: Serial/UART and MQTT protocol drivers connecting ASTRA directly to physical Arduino/STM32 microcontroller sensor testbenches.
2. **On-Suit Edge Deployment**: Compiling the TDL and ML triage engine to C99/Rust micro-binaries capable of running on radiation-hardened RAD750 or RISC-V flight avionics.
3. **NASA LSDA Live Synchronization**: Automated ingestion pipelines fetching telemetry datasets from the NASA Life Sciences Data Archive via NASA open APIs.
4. **Bioimpedance Hemodynamic Modeling**: Multi-frequency thoracic bioimpedance simulation to non-invasively detect internal jugular vein (IJV) flow stasis without ultrasound probe positioning.
