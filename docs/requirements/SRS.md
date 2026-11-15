# ASTRA — Software Requirements Specification (SRS)
**Standard**: IEEE 830 / ISO/IEC/IEEE 29148 Compliant Structure  
**Project**: Autonomous Spaceflight Telemetry & Reliability Architecture (ASTRA)  
**Version**: 1.0.0-Release  
**Author**: Gravity Brains / ASTRA Pioneers Engineering & Medical Team  
**Compliance**: NASA-STD-3001 Vol 1 Rev C & Vol 2 Rev F; EVA-EXP-0034  

---

## 1. Introduction

### 1.1 Purpose
This Software Requirements Specification (SRS) provides a comprehensive, verifiable technical specification for the ASTRA system. It specifies functional requirements, non-functional performance and security boundaries, data schemas, external interfaces, and acceptance criteria for evaluation by NASA Space Apps 2026 juries and flight software engineers.

### 1.2 Scope
ASTRA is an autonomous spaceflight telemetry, sensor physics, and clinical decision-support platform designed for deep-space planetary surface exploration (specifically Mars Jezero Crater EVA missions). The system provides local sensor configuration, hardware fault simulation, real-time Trusted Data Layer (TDL) verification, offline machine learning clinical triage, and interactive 3D geospatial mission simulation.

### 1.3 Definitions, Acronyms, and Abbreviations
- **ADC**: Analog-to-Digital Converter
- **EIMO**: Earth-Independent Medical Operations (NASA Human Research Program)
- **EVA**: Extravehicular Activity (spacewalk on Martian surface)
- **GCR**: Galactic Cosmic Radiation
- **HRR**: NASA Human Research Roadmap
- **IJV**: Internal Jugular Vein (site of spaceflight-induced venous thrombosis)
- **LCVG**: Liquid Cooling and Ventilation Garment
- **LOS**: Loss of Signal (communication blackout)
- **PPG**: Photoplethysmography (optical pulse oximetry)
- **RBAC**: Role-Based Access Control
- **RTD**: Resistance Temperature Detector (Pt100 / Pt1000)
- **SANS**: Spaceflight-Associated Neuro-ocular Syndrome
- **SPE**: Solar Particle Event
- **TDL**: Trusted Data Layer
- **TMR**: Triple Modular Redundancy

### 1.4 References
1. NASA-STD-3001 Vol 1 Rev C: *Crew Health* (2024).
2. NASA-STD-3001 Vol 2 Rev F: *Human Factors, Habitability, and Environmental Health* (July 2026).
3. EVA-EXP-0034: *Exploration Extravehicular Activity System Technical Standards*.
4. IEC 60751: *Industrial Platinum Resistance Thermometers and Platinum Temperature Sensors*.
5. Hassler et al., *Science* 343(6169):1244791 (2014): *Mars Science Laboratory RAD Radiation Measurements*.

---

## 2. Overall Description

### 2.1 Product Perspective
ASTRA operates as a self-contained, offline-first client-server software suite. The backend (FastAPI, Python 3.11) serves both RESTful/WebSocket APIs and the pre-compiled single-page application (React 18, Three.js). The platform is engineered to function entirely inside a spacecraft LAN without public internet connectivity.

### 2.2 User Classes and Characteristics
1. **Admin (`admin`)**: Responsible for user lifecycle, audit trail review, system configuration, and emergency stop release.
2. **Physical Team (`physical`)**: Instrumentation engineers managing sensor definitions, physical specifications, calibration curves, failure signatures, and physics benchmarks.
3. **Medical Team (`medical`)**: Flight surgeons and aerospace physicians managing clinical conditions, warning thresholds, recommendations, clinical datasets, and ML model retraining.
4. **Test Operator (`operator`)**: Mission directors generating simulation scenarios, starting/pausing/seeking runs, injecting real-time sensor faults, and generating viewer QR tokens.
5. **Viewer (`viewer`)**: Evaluators, judges, or crew members monitoring real-time vital signs and 3D terrain feeds via read-only, session-scoped access tokens.

### 2.3 Operating Constraints
- **Zero-Network Operation**: All core decision-support features, TDL verification, physics models, ML classification, and 3D terrain rendering must function with zero network access.
- **Deterministic Replay**: Given an identical random seed, simulation scenarios must generate bit-identical telemetry outputs across different execution environments.
- **Sub-Second Latency**: Real-time telemetry streaming and TDL verification must compute in $< 50\text{ ms}$ per tick to support 10 Hz telemetry feeds.

---

## 3. Functional Requirements

### 3.1 Authentication & System Administration (AUTH & ADMIN)

| Req ID | Description | Priority | Role | Implementation Status | Related Test ID |
|---|---|---|---|---|---|
| **FR-AUTH-001** | The system shall authenticate users via username and password using scrypt key derivation ($N=16384, r=8, p=1$) and issue HMAC-SHA256 JWT tokens. | HIGH | All | **IMPLEMENTED** | `test_api.py::test_login_*` |
| **FR-AUTH-002** | The system shall prohibit public self-registration; all accounts must be provisioned by an authenticated Admin. | HIGH | Admin | **IMPLEMENTED** | `test_api.py::test_login_rejects_bad_credentials` |
| **FR-AUTH-003** | The system shall enforce server-side RBAC on all routes via `require_roles` dependencies. | HIGH | All | **IMPLEMENTED** | `test_api.py::test_rbac_matrix` |
| **FR-ADMIN-001** | The system shall provide full CRUD operations for User accounts including username, role, full name, and active status. | HIGH | Admin | **IMPLEMENTED** | `test_api.py::test_admin_users_*` |
| **FR-ADMIN-002** | The system shall record immutable audit log entries for all security, configuration, and data modification actions. | MEDIUM | Admin | **IMPLEMENTED** | `test_api.py::test_admin_users_config_and_audit` |
| **FR-ADMIN-003** | The system shall provide a hard Emergency Stop (`POST /api/admin/emergency-stop`) that halts all active simulations and locks the platform until explicitly released by an Admin. | HIGH | Admin | **IMPLEMENTED** | `test_api.py::test_emergency_stop_*` |

### 3.2 Physical Sensor Engineering Lab (PHYS & SENSOR)

| Req ID | Description | Priority | Role | Implementation Status | Related Test ID |
|---|---|---|---|---|---|
| **FR-SENSOR-001** | The system shall provide a Sensor Registry with full CRUD, semantic versioning, and immutable snapshot history. | HIGH | Physical | **IMPLEMENTED** | `test_api.py::test_sensor_lifecycle_*` |
| **FR-SENSOR-002** | The system shall support custom technical specifications per sensor (sampling rate, excitation voltage, accuracy ±%, Callendar-Van Dusen coefficients). | HIGH | Physical | **IMPLEMENTED** | `test_physical_lab.py::test_sensor_create_*` |
| **FR-SENSOR-003** | The system shall simulate physical RTD temperature transducers using the Callendar-Van Dusen equation $R(T) = R_0 (1 + AT + BT^2)$. | HIGH | Physical | **IMPLEMENTED** | `test_physical_lab_mvp.py::test_physics_model_rtd_*` |
| **FR-SENSOR-004** | The system shall simulate piezoresistive pressure transducers using Wheatstone bridge transfer functions $\frac{\Delta V}{V_{in}} = S \cdot P$. | HIGH | Physical | **IMPLEMENTED** | `test_physical_lab_mvp.py::test_physics_model_piezoresistive_*` |
| **FR-SENSOR-005** | The system shall simulate radiation dosimeters incorporating baseline GCR background and acute SPE particle flux. | HIGH | Physical | **IMPLEMENTED** | `test_physical_lab_mvp.py::test_physics_model_radiation_*` |
| **FR-SENSOR-006** | The system shall inject discrete physical error models: Disconnect, Spike, Stuck Value, Gaussian Noise Burst, and Calibration Drift. | HIGH | Physical / Operator | **IMPLEMENTED** | `test_engine.py::test_each_fault_raises_*` |
| **FR-PHYS-001** | The system shall provide a Physical Engineering AI Agent capable of checking sensor specifications against NASA-STD-3001 and EVA-EXP-0034 standards. | MEDIUM | Physical | **IMPLEMENTED** | `test_physical_lab_mvp.py::test_physical_ai_agent_*` |

### 3.3 Medical Knowledge Base & ML Triage (MED & TRUST)

| Req ID | Description | Priority | Role | Implementation Status | Related Test ID |
|---|---|---|---|---|---|
| **FR-MED-001** | The system shall maintain spaceflight clinical conditions, associated symptoms, and indicator thresholds grounded in NASA-STD-3001. | HIGH | Medical | **IMPLEMENTED** | `test_api.py::test_medical_rules_*` |
| **FR-MED-002** | The system shall maintain an immutable catalog of NASA scientific sources with DOIs and provenance metadata. | MEDIUM | Medical | **IMPLEMENTED** | `test_api.py::test_medical_rules_*` |
| **FR-MED-003** | The system shall track the lifecycle, calibration dates, and operating hours for 7 spaceflight instruments with automated maintenance warnings. | HIGH | Medical | **IMPLEMENTED** | `test_medical_endpoints.py::test_get_instruments_*` |
| **FR-MED-004** | The system shall calculate pre-EVA predictive clinical risk scores ($[0.0, 1.0]$) based on astronaut resting vitals, EVA duration, and metabolic workload. | HIGH | Medical | **IMPLEMENTED** | `test_medical_endpoints.py::test_pre_sim_risk_*` |
| **FR-TRUST-001** | The Trusted Data Layer shall execute boundary validation, checking if readings fall within physical transducer ranges. | HIGH | System | **IMPLEMENTED** | `test_engine.py::test_sensor_fault_*` |
| **FR-TRUST-002** | The Trusted Data Layer shall execute rate-of-change validation, detecting physiologically implausible derivatives ($|\frac{\Delta v}{\Delta t}| > \text{max\_rate}$). | HIGH | System | **IMPLEMENTED** | `test_engine.py::test_each_fault_raises_*` |
| **FR-TRUST-003** | The Trusted Data Layer shall execute cross-sensor physiological consensus (e.g., verifying SpO2 drops against heart rate and respiration). | HIGH | System | **IMPLEMENTED** | `test_medical_ml.py::test_ml_triage_false_alarm_*` |
| **FR-TRUST-004** | The system shall inhibit medical warning rules while the associated sensor's trust score indicates an active hardware fault ($T < 0.4$). | HIGH | System | **IMPLEMENTED** | `test_engine.py::test_medical_rule_is_inhibited_*` |
| **FR-MED-005** | The ML Decision Engine shall classify telemetry frames into 8 clinical states using an 18-feature Random Forest with $\ge 90\%$ accuracy. | HIGH | Medical | **IMPLEMENTED** | `test_medical_ml.py::test_ml_engine_training_*` |
| **FR-MED-006** | The system shall support on-demand ML model retraining on updated EVA telemetry datasets via `POST /api/medical/ml-retrain`. | MEDIUM | Medical | **IMPLEMENTED** | `test_api.py::test_medical_rules_*` |

### 3.4 Mission Simulation & Operator Console (SIM & VIEW)

| Req ID | Description | Priority | Role | Implementation Status | Related Test ID |
|---|---|---|---|---|---|
| **FR-SIM-001** | The system shall execute deterministic simulation scenarios with bit-identical repeatability across identical seeds. | HIGH | Operator | **IMPLEMENTED** | `test_engine.py::test_same_seed_is_bit_identical` |
| **FR-SIM-002** | The system shall stream real-time telemetry frames via WebSocket (`/api/sessions/{id}/ws`) at configurable playback speeds (1x to 10x). | HIGH | Operator / Viewer | **IMPLEMENTED** | `test_api.py::test_full_session_flow_*` |
| **FR-SIM-003** | The system shall support start, pause, resume, seek, and abort controls on active simulation sessions. | HIGH | Operator | **IMPLEMENTED** | `test_api.py::test_full_session_flow_*` |
| **FR-SIM-004** | The system shall render a 3D WebGL Mars terrain representing Jezero Crater using authentic NASA HiRISE stereo elevation data. | HIGH | Operator / Viewer | **IMPLEMENTED** | Frontend build verification |
| **FR-SIM-005** | The system shall generate session-scoped, read-only viewer QR tokens allowing judges and examiners to pair mobile devices without credentials. | HIGH | Operator | **IMPLEMENTED** | `test_api.py::test_viewer_tokens_*` |
| **FR-VIEW-001** | The Viewer interface shall display real-time vital signs charts, TDL confidence bands, and 3D EVA astronaut positions via `X-Viewer-Token`. | HIGH | Viewer | **IMPLEMENTED** | `test_api.py::test_viewer_tokens_*` |

### 3.5 AI Integration & Fallback (AI)

| Req ID | Description | Priority | Role | Implementation Status | Related Test ID |
|---|---|---|---|---|---|
| **FR-AI-001** | The system shall convert natural language scenario prompts into validated, bounded simulation plans. | HIGH | Operator | **IMPLEMENTED** | `test_planner_assistant.py::test_default_prompt_*` |
| **FR-AI-002** | The system shall provide an in-mission ASTRA AI Chat Assistant answering questions based strictly on telemetry and public state. | HIGH | Operator | **IMPLEMENTED** | `test_planner_assistant.py::test_astra_chat_*` |
| **FR-AI-003** | The AI assistant shall have ZERO access to simulation ground truth; it may only inspect filtered, noisy telemetry. | HIGH | System | **IMPLEMENTED** | `test_planner_assistant.py::test_assistant_context_contains_no_ground_truth` |
| **FR-AI-004** | If an external LLM provider fails, times out, or is unconfigured, the system shall automatically fall back to the deterministic local engine. | HIGH | System | **IMPLEMENTED** | `test_planner_assistant.py::test_malicious_or_invalid_llm_output_*` |

---

## 4. Non-Functional Requirements

### 4.1 Security & Integrity
- **NFR-SEC-001**: All passwords shall be hashed using scrypt ($N=16384, r=8, p=1$) with a unique 16-byte cryptographically secure salt.
- **NFR-SEC-002**: JWT tokens shall be signed with HMAC-SHA256 using an auto-generated 48-byte key or `ASTRA_SECRET_KEY`.
- **NFR-SEC-003**: Rate limiting shall throttle failed login attempts per IP to prevent brute-force attacks.
- **NFR-SEC-004**: Viewer tokens shall be restricted to `GET` operations on `/api/sessions/{id}` and `/api/sessions/{id}/ws`.

### 4.2 Reliability & Fault Tolerance
- **NFR-REL-001**: Telemetry streaming shall maintain deterministic bit-identical repeatability for identical seeds ($S \in \mathbb{N}$).
- **NFR-REL-002**: Unhandled exceptions in sensor physics models shall not crash the simulation server; faults shall default to safe, marked states.
- **NFR-REL-003**: In-flight sessions interrupted by a server restart shall be marked as `interrupted` upon startup and cleanly recovered.

### 4.3 Performance
- **NFR-PERF-001**: The ML Decision Engine shall execute single-frame clinical triage in $< 1.0\text{ ms}$ on standard CPU hardware.
- **NFR-PERF-002**: WebSocket telemetry broadcast latency from the backend simulation loop to connected clients shall not exceed $20\text{ ms}$.
- **NFR-PERF-003**: The 3D Three.js WebGL canvas shall maintain $\ge 45\text{ FPS}$ on standard integrated graphics hardware.

### 4.4 Portability & Usability
- **NFR-PORT-001**: The system shall run natively on Windows 10/11, macOS, and Linux, and deploy via Docker Compose.
- **NFR-USE-001**: The user interface shall provide full English and Arabic localization with dynamic bidirectional (LTR/RTL) rendering.
- **NFR-USE-002**: The interface shall support 4 distinct visual aerospace themes (Mission Control, Mars Sunrise, Deep Space, Polar Ice).

---

## 5. Acceptance Criteria (MVP Verification)

1. **AC-01 (RBAC Security)**: Any attempt by a `physical` user to create a medical condition or an `operator` to create an admin account shall return HTTP 403 Forbidden.
2. **AC-02 (TDL Anomaly Isolation)**: When an SpO2 sensor fault is injected during a nominal simulation, the system shall raise a `DATA_QUALITY` warning, lower the sensor trust score to $< 0.3$, and inhibit clinical hypoxia alarms.
3. **AC-03 (True Clinical Emergency)**: When ground truth hypoxia is simulated with an intact sensor, the system shall raise a clinical `CRITICAL` hypoxia warning within 3 simulation seconds.
4. **AC-04 (Offline Operation)**: With all network adapters disabled, the application shall boot, run full simulations, execute ML triage, and render 3D Jezero Crater terrain without error.
5. **AC-05 (Automated Test Suite)**: All 97 automated tests across `backend/tests/` shall execute and pass with 0 failures.
