# Changelog

All notable changes to the **ASTRA** platform are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.5.0-Audited] - 2026-11-15

### Added
- **Full Bilingual Support (i18n)**: Seamless one-click English and Arabic (RTL) interface with translated clinical protocols and HUD indicators.
- **5 Tactical Themes**: Mission Dark (OLED), NASA Blue (Deep Space), Mars Sunrise (Ochre), Arctic Light (Medical), and Nebula Purple.
- **TDL 20-Scenario Batch Testbench**: Automated runner for all 20 NASA Mars simulation use cases with real-time pass/fail scoreboard.
- **Medical Machine Learning Suite**:
  - 18-dimensional Random Forest classifier trained on 10,000 synthetic NASA EVA telemetry records with 95.15% validation accuracy.
  - NASA Clinical Flight Instruments lifecycle management (MOXIE, PIXL, SHERLOC, SuperCam, Mastcam-Z, RIMFAX, MEDA).
  - Pre-simulation predictive risk scoring endpoint (`/api/medical/pre-sim-risk`).
- **Physical Sensor Engineering Lab**: Interactive 3D spacesuit sensor placement, transducer calibration curves, failure signatures, and engineering chat.
- **Doctor / Examiner Mobile QR Pairing**: Instant mobile tablet/phone pairing via QR code with natural-language medical scenario injection.
- **NASA Space Apps 2026 Submission Package**: Complete SRS, architecture diagrams, test reports, and submission materials.
- **GitHub Actions CI Workflow**: Automated pipeline executing pytest test suite and TypeScript production builds on every push/PR.
- **5 New Backend Integration Tests**: Expanded automated test suite to 97 passing tests (`test_medical_endpoints.py`).

### Changed
- **Consolidated Git Topology**: Clean non-fast-forward merge of `feature/physical-engineering-lab` into canonical `master`.
- **Repository Structure Restructuring**: Cleaned duplicate files, moved team research archive to `docs/references/team_research/`, and unified all guides under `docs/`.
- **Enhanced `.gitignore`**: Hardened protection preventing accidental commit of local virtual environments, coverage metrics, and API credentials.

### Fixed
- **API Key Sanitization**: Sanitized placeholder keys in draft `.env.example` to ensure zero credentials are committed.
- **Capnometer ID Consistency**: Corrected instrument identifier mismatch (`CO2-001`).
- **Medical ML Triage Feature Mapping**: Aligned full feature payload schema with clinical classifier model expectations.

### Security
- Verified strict zero-secrets policy across the entire Git history via commit pattern scanning.
- Documented role-based access control (RBAC) boundaries for 5 distinct operational roles.

---

## [2.0.0] - 2026-11-14

### Added
- **High-Fidelity 3D Mars Surface Visualization**: Built on authentic NASA HiRISE stereo DTM elevation (`DTEEC_045994_1985`) for Jezero Crater.
- **3D NASA Rover & Helicopter Models**: Perseverance rover with articulated robotic arm and Ingenuity helicopter.
- **Trusted Data Layer (TDL)**: Deterministic multi-stage sensor verification pipeline using Gaussian likelihood scoring and temporal derivative filters.
- **20 Mission Simulation Scenarios**: Covering historical spaceflight anomalies (Apollo 15 arrhythmia, ISS EVA 23 water intrusion, acute SPE).

---

## [1.0.0] - 2026-11-14

### Added
- Initial project scaffolding with FastAPI backend, SQLite persistence, and React 18 frontend.
- Basic telemetry generation and WebSocket streaming state machine.
- JWT authentication and initial seed data.
