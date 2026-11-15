# ASTRA — Minimum Viable Product (MVP) Specification & Feature Matrix
**Project**: ASTRA (Autonomous Spaceflight Telemetry & Reliability Architecture)  
**Submission**: NASA Space Apps Challenge 2026  
**Status**: Consolidate & Audited MVP Release  

---

## 1. MVP Purpose & Scope

The ASTRA MVP demonstrates an autonomous, local-first health monitoring and decision-support system capable of operating under the extreme communication constraints of a human Mars surface mission.

This document classifies every system capability into:
- **IMPLEMENTED**: Fully written, integrated, and verified by automated tests.
- **SIMULATED**: Built as a software simulation model representing physical reality.
- **PARTIALLY IMPLEMENTED**: Functional with known boundaries or non-critical limitations.
- **PLANNED**: Architecturally designed for future post-hackathon phases.
- **EXPLICITLY EXCLUDED**: Outside the current prototype scope.

---

## 2. Feature Implementation Matrix

| Module | Feature / Capability | Classification | Verification / Evidence |
|---|---|---|---|
| **Security** | JWT Authentication with scrypt password derivation | **IMPLEMENTED** | `test_api.py::test_login_*` |
| **Security** | 5-Role Server-Side RBAC (`admin`, `physical`, `medical`, `operator`, `viewer`) | **IMPLEMENTED** | `test_api.py::test_rbac_matrix` |
| **Security** | Emergency Stop with Admin Release Lock | **IMPLEMENTED** | `test_api.py::test_emergency_stop_*` |
| **Security** | Immutable Security & System Audit Trail | **IMPLEMENTED** | `test_api.py::test_admin_users_config_and_audit` |
| **Physical** | Sensor Catalog CRUD with Versioning & Snapshots | **IMPLEMENTED** | `test_api.py::test_sensor_lifecycle_*` |
| **Physical** | Metrological Specs (accuracy, range, resolution, sampling rate) | **IMPLEMENTED** | `test_physical_lab.py::test_sensor_create_*` |
| **Physical** | RTD Platinum Thermometry (Callendar-Van Dusen equation) | **SIMULATED** | `test_physical_lab_mvp.py::test_physics_model_rtd_*` |
| **Physical** | Piezoresistive Pressure Transducer Model | **SIMULATED** | `test_physical_lab_mvp.py::test_physics_model_piezoresistive_*` |
| **Physical** | Radiation PIN Diode & Radi-N2 Dosimeter Model | **SIMULATED** | `test_physical_lab_mvp.py::test_physics_model_radiation_*` |
| **Physical** | Sensor Error Models (Disconnect, Spike, Stuck, Noise, Drift) | **SIMULATED** | `test_engine.py::test_each_fault_raises_*` |
| **Physical** | 3D Spacesuit Anatomical Sensor Placement Canvas | **IMPLEMENTED** | `frontend/src/components/SensorPlacementCanvas.tsx` |
| **Physical** | Physical Engineering AI Assistant with Catalog Grounding | **IMPLEMENTED** | `test_physical_lab_mvp.py::test_physical_ai_agent_*` |
| **Medical** | Medical Conditions, Symptoms & Indicators Catalog | **IMPLEMENTED** | `test_api.py::test_medical_rules_*` |
| **Medical** | NASA Scientific Sources Catalog with Provenance & DOIs | **IMPLEMENTED** | `test_api.py::test_medical_rules_*` |
| **Medical** | 7 NASA Flight Instruments Lifecycle & Maintenance Tracking | **IMPLEMENTED** | `test_medical_endpoints.py::test_get_instruments_*` |
| **Medical** | Pre-EVA Predictive Medical Risk Score Calculation | **IMPLEMENTED** | `test_medical_endpoints.py::test_pre_sim_risk_*` |
| **Trust Layer**| Layer 1: Boundary & Range Verification | **IMPLEMENTED** | `test_engine.py::test_sensor_fault_*` |
| **Trust Layer**| Layer 2: Derivative & Rate-of-Change Verification | **IMPLEMENTED** | `test_engine.py::test_each_fault_raises_*` |
| **Trust Layer**| Layer 3: Cross-Sensor Physiological Consensus | **IMPLEMENTED** | `test_medical_ml.py::test_ml_triage_false_alarm_*` |
| **Trust Layer**| False Alarm Suppression (Inhibits Clinical Warnings on Fault) | **IMPLEMENTED** | `test_engine.py::test_medical_rule_is_inhibited_*` |
| **ML Engine** | 18-Feature Random Forest Clinical Classifier | **IMPLEMENTED** | `test_medical_ml.py::test_ml_engine_training_*` |
| **ML Engine** | Sub-millisecond Offline Inference ($< 1\text{ ms}$) | **IMPLEMENTED** | `test_medical_endpoints.py::test_ml_triage_*` |
| **ML Engine** | On-Demand Model Retraining from CSV Datasets | **IMPLEMENTED** | `test_api.py::test_medical_rules_*` |
| **Simulation** | Natural Language Mission Plan Generation | **IMPLEMENTED** | `test_planner_assistant.py::test_default_prompt_*` |
| **Simulation** | Seed-Reproducible Deterministic Physics Engine | **IMPLEMENTED** | `test_engine.py::test_same_seed_is_bit_identical` |
| **Simulation** | Real-Time Telemetry Streaming via WebSocket | **IMPLEMENTED** | `test_api.py::test_full_session_flow_*` |
| **Simulation** | Simulation Controls (Start, Pause, Resume, Stop, Seek, Speeds) | **IMPLEMENTED** | `test_api.py::test_full_session_flow_*` |
| **Graphics** | 3D Mars Jezero Crater Terrain from HiRISE Elevation Data | **IMPLEMENTED** | `frontend/src/mission/MarsScene.ts` |
| **Graphics** | Perseverance Rover, Ingenuity Helicopter & Suit 3D Models | **IMPLEMENTED** | `frontend/src/mission/MarsScene.ts` |
| **Doctor/QR** | Session-Scoped QR Pairing for Mobile Devices | **IMPLEMENTED** | `test_api.py::test_viewer_tokens_*` |
| **Doctor/QR** | Real-Time Mobile Doctor Clinical Injection Console | **IMPLEMENTED** | `frontend/src/components/DoctorExaminerConsole.tsx` |
| **UI/UX** | Bilingual English / Arabic Localization with Dynamic RTL | **IMPLEMENTED** | `frontend/src/lib/i18n.ts` |
| **UI/UX** | 4 Visual Aerospace Themes (Mission Control, Mars, Deep Space, Polar) | **IMPLEMENTED** | `frontend/src/lib/themes.ts` |
| **AI Assistant**| Natural Language ASTRA Chat Assistant (Telemetry Scoped) | **IMPLEMENTED** | `test_planner_assistant.py::test_astra_chat_*` |
| **AI Fallback** | Deterministic Offline Planner & Explainer (Zero Network) | **IMPLEMENTED** | `test_planner_assistant.py::test_malicious_or_invalid_*` |
| **Speech** | Web Speech API Speech-to-Text & Text-to-Speech | **IMPLEMENTED** | `frontend/src/mission/ChatPanel.tsx` |
| **HIL** | Hardware-in-the-Loop Microcontroller Serial Interface | **PLANNED** | Scheduled for Post-2026 Phase |
| **Live Bio** | Real Human Live Biometric Sensor Streaming | **EXPLICITLY EXCLUDED** | Out of hackathon scope (simulated data used) |
| **Medical Dev**| Clinical Diagnostic Certification (FDA / CE-MDR) | **EXPLICITLY EXCLUDED** | Prototype / Decision Support only |

---

## 3. MoSCoW Prioritization for Hackathon Submission

### 3.1 Must-Have (All 100% Implemented & Passing)
- Deterministic simulation engine with seed reproducibility.
- Full 5-role server-side RBAC with JWT authentication.
- Trusted Data Layer: 3-tier validation (bounds, rate, cross-sensor consensus).
- Medical ML Random Forest with false alarm suppression.
- Physical sensor catalog with specification management.
- Real-time WebSocket telemetry streaming.
- Complete documentation suite and verified test pipeline (97/97 tests pass).

### 3.2 Should-Have (All 100% Implemented)
- 3D Mars Jezero Crater visualization with authentic NASA HiRISE terrain.
- Doctor / Examiner mobile QR code session pairing.
- Bilingual English / Arabic localization with dynamic RTL layout.
- 4 aerospace visual themes with instant switching.
- Natural language scenario planning with bounded safety schemas.
- Instrument lifecycle, operating hours, and calibration tracking.

### 3.3 Could-Have / Optional (Implemented in ASTRA)
- Multi-provider LLM support (OpenRouter free models, Groq, Gemini, Claude, local Ollama).
- Speech synthesis and voice input via Web Speech API.
- 20-case interactive TDL verification suite in frontend.

### 3.4 Won't-Have for Hackathon Release (Explicitly Deferred)
- FDA/CE-MDR clinical certification.
- Direct hardware serial bus (UART/CAN bus) connection to physical spacesuit hardware.
- Real astronaut personal health information (PHI) ingestion.
