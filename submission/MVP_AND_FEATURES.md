# NASA Space Apps Challenge 2026 — MVP & Feature Classification Matrix

## 1. Feature Implementation Status Matrix

Every feature in ASTRA has been audited and classified according to actual codebase evidence:

| Capability / Module | Implementation Status | Technical Mechanism & Evidence |
|---|---|---|
| **Trusted Data Layer (TDL)** | **IMPLEMENTED** | Mathematical Gaussian likelihood scoring, temporal derivative gating, and cross-sensor physiological plausibility checks in `backend/app/services/trust_layer.py`. Covered by 19 unit tests. |
| **20 Mars Simulation Scenarios** | **IMPLEMENTED** | 20 pre-configured historical and contingency scenarios covering Apollo 15, ISS EVA 23, SPE, and hyperthermia in `backend/app/services/simulation.py`. |
| **Automated TDL Batch Runner** | **IMPLEMENTED** | Automated runner executing all 20 scenarios sequentially with pass/fail scoring and residual metrics in `frontend/src/components/TdlPipelineTestbench.tsx`. |
| **18-Feature Clinical ML Triage** | **IMPLEMENTED** | Random Forest classifier trained on 10,000 synthetic records with 95.15% validation accuracy. Served via `/api/medical/ml-triage`. |
| **Pre-Simulation Risk Engine** | **IMPLEMENTED** | Composite multi-system risk evaluator assessing baseline vitals before EVA egress. Served via `/api/medical/pre-sim-risk`. |
| **NASA Clinical Instruments** | **IMPLEMENTED** | Lifecycle management for Mars 2020 instruments (MOXIE, PIXL, SHERLOC, SuperCam, Mastcam-Z, RIMFAX, MEDA). Served via `/api/medical/instruments`. |
| **Physical Sensor Engineering Lab** | **IMPLEMENTED** | 3D spacesuit sensor placement canvas, Callendar–Van Dusen Pt100 RTD calibration curves, and noise models in `frontend/src/components/PhysicalLab/`. |
| **Doctor / Examiner Mobile QR** | **IMPLEMENTED** | Encrypted session QR code pairing with natural language scenario injection via `/api/simulation/inject-scenario`. |
| **3D Mars Jezero Crater View** | **IMPLEMENTED** | Three.js rendering of NASA HiRISE stereo DTM elevation (`ESP_045994_1985`) with 3D Perseverance rover and Ingenuity helicopter models. |
| **5 Tactical Themes** | **IMPLEMENTED** | Mission Dark, NASA Blue, Mars Sunrise, Arctic Light, and Nebula Purple switchable in top navigation bar. |
| **Bilingual i18n (English & Arabic)** | **IMPLEMENTED** | Full bilingual dictionary with native RTL typography and localized NASA clinical action protocols. |
| **Role-Based Access Control (RBAC)**| **IMPLEMENTED** | 5 authenticated roles (`admin`, `physical`, `medical`, `operator`, `viewer`) with JWT authorization and bcrypt password security. |
| **AI LLM Explainer & Fallback** | **IMPLEMENTED** | Multi-provider LLM support (OpenRouter, Groq, Gemini, Anthropic) with **100% offline deterministic local engine fallback**. |
| **Live Telemetry WebSocket Stream** | **SIMULATED** | Real-time continuous streaming of synthetic physiological telemetry governed by mission state machine. |
| **Synthetic EVA Dataset** | **SIMULATED** | 10,000 synthetic records (`data/nasa_eva_medical_telemetry.csv`) calibrated to published NASA-STD-3001 ranges. |
| **Clinical Efficacy Proof** | **NOT IMPLEMENTED / PLANNED** | ASTRA is an engineering prototype for decision support, **not** an FDA/CE certified medical device. |

---

## 2. MoSCoW Prioritization Alignment

### Must Have (Delivered in Core MVP)
- Real-time physiological telemetry monitoring with dynamic threshold alerts.
- Deterministic Trusted Data Layer preventing false alarms from sensor detachment or motion noise.
- Pre-configured simulation scenarios validating historical spaceflight anomalies.
- Full offline operation capability with zero network requirements.
- Role-based security ensuring proper access segregation.

### Should Have (Delivered in v2.5.0-Audited)
- 18-feature Random Forest clinical triage with confidence scores and NASA-STD-3001 protocols.
- High-fidelity 3D Mars Jezero Crater environment built from real NASA HiRISE DTM data.
- Doctor mobile QR code pairing with natural language scenario injection.
- Complete English and Arabic bilingual localization (i18n).
- Physical Sensor Engineering Lab with 3D spacesuit sensor mapping.

### Could Have (Delivered in v2.5.0-Audited)
- 5 tactical lighting themes for diverse operational environments.
- Automated 20-scenario batch testbench with real-time pass/fail scoreboard.
- Free-tier online LLM connectivity with seamless deterministic offline fallback.

### Won't Have (Out of Scope for Hackathon Prototype)
- Direct hardware serial bus connection to certified spaceflight bio-sensors.
- Formal clinical trial validation on human patients (prohibited without IRB / regulatory certification).
- Deep-space avionics radiation-hardened FPGA synthesis.
