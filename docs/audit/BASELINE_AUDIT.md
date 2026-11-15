# ASTRA — Baseline Engineering & Repository Audit
**Project**: ASTRA (Astronaut Health Monitoring & Mars Mission Simulation)  
**Team**: Gravity Brains / ASTRA Pioneers  
**Audit Date**: November 15, 2026  
**Auditor**: Senior Software Architect & Open-Source Release Engineer  

---

## 1. Executive Summary

This baseline audit documents the state of the ASTRA codebase prior to branch consolidation, repository cleanup, automated test expansion, and NASA Space Apps 2026 release preparation.

The repository represents an advanced, evidence-grounded prototype combining spaceflight physiological telemetry monitoring, sensor physics modeling, the Trusted Data Layer (TDL), machine learning clinical triage, and an interactive 3D Mars surface EVA simulation set in Jezero Crater.

All existing automated test suites, type checking, and production builds were executed and verified against the initial codebase.

---

## 2. Git Repository & Branch State

### 2.1 Branch & Tracking Topology
- **Active Working Branch**: `feature/physical-engineering-lab`
- **Canonical Release Branch**: `master` (commit `1db7dc2`)
- **Remote Tracking**: `origin/master` (synchronized with local `master` at `1db7dc2`)
- **Remote URL**: `https://github.com/Mouhamad-MouSou-23278/ASTRA-MouSou.git`

```text
* dfb257c (HEAD -> feature/physical-engineering-lab) feat(graphics): add high-fidelity NASA 3D models for Perseverance, Ingenuity, Sample Caching, and Jezero Crater dynamics
* 0bfda1b feat(medical, graphics): Mars simulation upgrade, TDL-ML clinical decision pipeline, bilingual English/Arabic, and 20 simulation use cases
* 9024335 docs(physical): add comprehensive Physical Sensor Engineering Lab manual and verification guide
* 7a32c34 feat(physical): complete Physical Sensor Engineering Lab MVP (M1-M12)
* fc69301 feat(physical): Milestone 1 - Flexible Sensor Management & Specification Engine
* 1db7dc2 (origin/master, master) chore: update gitignore for local environments
* 77ab3de a
```

### 2.2 Uncommitted Modifications (21 files)
At audit time, 21 tracked files contained active modifications:
- `.env.example` (Updated LLM provider documentation and API endpoints)
- `README.md` (Updated project overview and features)
- `backend/app/api/medical.py` (Extended ML triage, instruments registry, pre-sim risk endpoints)
- `backend/app/config.py` (Expanded LLM provider options: openrouter, groq, gemini)
- `backend/app/services/llm.py` (Implemented `OpenRouterProvider` with free model defaults)
- `backend/app/services/ml_medical.py` (Extended Random Forest to 18 features, instrument history, pre-sim risk)
- `backend/app/services/physical_agent.py` (LLM-augmented sensor querying with live catalog injection)
- `data/medical_ml_model.json` (Retrained Random Forest weights)
- `data/nasa_eva_medical_telemetry.csv` (Expanded synthetic EVA clinical dataset to 10,000+ rows)
- `frontend/src/components/DoctorExaminerConsole.tsx` (Enhanced doctor QR session console)
- `frontend/src/components/Layout.tsx` (Bilingual English/Arabic navigation & theme switcher)
- `frontend/src/components/SensorPlacementCanvas.tsx` (Interactive anatomical sensor mapping)
- `frontend/src/components/TdlPipelineVisualizer.tsx` (20-case automated test verification suite)
- `frontend/src/lib/i18n.ts` (Full bilingual dictionary and RTL support)
- `frontend/src/mission/Chart.tsx` (Real-time telemetry charting with TDL confidence intervals)
- `frontend/src/mission/MarsScene.ts` (HiRISE terrain, Perseverance rover, Ingenuity helicopter)
- `frontend/src/mission/MissionView.tsx` (HUD overlays, 1st person visor view, voice alerts)
- `frontend/src/pages/MedicalPage.tsx` (Doctor examiner tabs, instrument history, ML retraining)
- `frontend/src/pages/OperatorPage.tsx` (Simulation control improvements)
- `frontend/src/styles.css` (Bilingual typography, theme classes, responsive layouts)
- `tools/generate_medical_dataset.py` (Dataset generation script improvements)

### 2.3 Untracked Items
- `docs/DATA_SOURCES.md`
- `docs/MEDICAL_ML_GUIDE.md`
- `docs/PRESENTATION_GUIDE_AND_SCRIPT.md`
- `docs/TRUSTED_DATA_LAYER.md`
- `docs/presentation.html`
- `docs/team_config.json`
- `document/` (Duplicate directory containing older drafts and assets)
- `frontend/src/lib/themes.ts` (Theme definition file)
- `tools/verify_endpoints.py` (FastAPI TestClient verification script)
- `uploaded_materials/` (Source PDFs, CAD designs, and team research papers)

---

## 3. Critical Security Audit Findings

> [!CAUTION]
> **CRITICAL SECURITY ALERT — Uncommitted API Key Detected**:
> In `.env.example`, a live OpenRouter API key (`sk-or-v1-8e36...`) was placed in the working copy:
> ```env
> ASTRA_LLM_API_KEY=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
> // my key open route : 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
> ```
> **Audit Status**:
> 1. Verified via `git log -S "sk-"` that this credential has **never been committed** to Git history.
> 2. **Remediation Action Required**: Immediately sanitize `.env.example` before creating any commits or backups, and replace with `your_openrouter_api_key_here`.
> 3. Advise the key holder to revoke and rotate this key since it was placed in an uncommitted file.

---

## 4. Technology Stack & Framework Inventory

| Component | Framework / Technology | Version / Specification | Role in ASTRA |
|---|---|---|---|
| **Backend Runtime** | Python (CPython) | 3.11.9 (venv) / 3.14.0 (host) | Core server execution |
| **API Framework** | FastAPI | >= 0.115, < 1.0 | RESTful & WebSocket API endpoints |
| **ASGI Server** | Uvicorn (standard) | >= 0.30 | High-performance async server |
| **Database ORM** | SQLAlchemy | >= 2.0.30, < 3.0 | SQLite local / PostgreSQL in container |
| **Data Validation** | Pydantic & Pydantic-Settings | >= 2.7, < 3.0 | Schemas, settings, config validation |
| **Authentication** | PyJWT | >= 2.8 | Role-based HMAC JWT tokens |
| **Machine Learning** | Custom Pure-Python Random Forest | 18 features, Gini, 12 trees | Offline medical clinical triage engine |
| **Physics Modeling** | Custom Transducer Equations | Callendar-Van Dusen, Piezo, etc. | Ground-truth sensor error simulation |
| **Frontend Framework** | React | 18.3.1 | Single-Page Application (SPA) UI |
| **Build Tool** | Vite | 5.4.8 / 5.4.21 | Hot module replacement & production bundling |
| **Language** | TypeScript | 5.6.3 | Type-safe frontend codebase |
| **3D Graphics** | Three.js | 0.169.0 | WebGL Mars Jezero Crater & EVA simulation |
| **Routing** | React Router DOM | 6.26.2 | Client-side role-based routing |
| **E2E Testing** | Playwright Core | 1.48.2 | Headless browser smoke verification |
| **Internationalization** | Custom React Hook (`i18n.ts`) | Bilingual EN/AR | Full RTL/LTR localization |

---

## 5. Baseline Test Execution Results

Prior to any modifications, all available test pipelines were executed on the working tree:

### 5.1 Backend Pytest Suite
- **Command**: `.\backend\.venv\Scripts\pytest.exe -v backend/tests`
- **Result**: **92 PASSED, 0 FAILED** (98.70 seconds)
- **Breakdown**:
  - `test_api.py`: 32 tests (RBAC matrix, user roles, session streaming, sensors CRUD, viewer tokens) — **PASS**
  - `test_engine.py`: 31 tests (Determinism, ground truth independence, fault injection, plan validation) — **PASS**
  - `test_medical_ml.py`: 4 tests (Model training, triage accuracy, hypoxia detection, Arabic output) — **PASS**
  - `test_physical_lab.py`: 4 tests (Technical specs, search, filtering, sensor history) — **PASS**
  - `test_physical_lab_mvp.py`: 9 tests (RTD physics, piezoresistive pressure, dosimeter, TDL metrics, benchmarks) — **PASS**
  - `test_planner_assistant.py`: 12 tests (Natural language planning, LLM fallback, context boundaries) — **PASS**

### 5.2 Endpoint Verification Script
- **Command**: `.\backend\.venv\Scripts\python.exe tools/verify_endpoints.py`
- **Result**: **ALL 3 CHECKS PASSED**
  - `GET /api/medical/instruments`: Status 200 (7 instruments, 6 calibration warnings verified)
  - `POST /api/medical/pre-sim-risk`: Status 200 (Risk score 0.05, NASA-STD-3001 guideline verified)
  - `POST /api/medical/ml-triage`: Status 200 (Diagnosis `SENSOR_ARTIFACT_FALSE_ALARM`, confidence 0.867)

### 5.3 Frontend TypeScript Verification
- **Command**: `npm run typecheck` (`tsc --noEmit`)
- **Result**: **PASSED (0 type errors)**

### 5.4 Frontend Production Build
- **Command**: `npm run build` (`tsc --noEmit && vite build`)
- **Result**: **PASSED in 2.45s**
  - Output bundle: `dist/index.html` (0.89 kB), `dist/assets/index-BE09S6Hs.js` (268.70 kB), `dist/assets/three-B8e54nL7.js` (512.43 kB).

---

## 6. Structural & Duplication Analysis

During discovery, the following redundancies and structural anomalies were identified:
1. **`document/` vs `docs/`**:
   - `document/presentation.html` and `docs/presentation.html` are identical (SHA256 hash `98958AD8FB676C0368B6A87E85221CF23B0049B42767C0559867C...`).
   - `document/team_config.json` and `docs/team_config.json` are identical (SHA256 hash `074A245824FE6CA7C2146B2D5EBD4A9397738C...`).
   - `document/PRESENTATION_GUIDE_AND_SCRIPT.md` is an enhanced 14-section version of `docs/PRESENTATION_GUIDE_AND_SCRIPT.md`.
   - `document/assets` contains duplicate screenshots already in `docs/images`, plus two unique assets (`mars_terrain.jpg` and `solar_shell_infographic.png`).
   - **Resolution Plan**: Consolidate into canonical `docs/` structure (`docs/images`, `docs/presentation.html`, `docs/team_config.json`, `docs/PRESENTATION_GUIDE_AND_SCRIPT.md`), migrate unique assets, and retire `document/`.
2. **`backend/.venv_old`**:
   - Redundant duplicate virtual environment directory created during earlier environment setup.
   - **Resolution Plan**: Verify that `.venv` is active and clean, add to `.gitignore`, and remove `.venv_old`.
3. **`data/raw/`**:
   - Empty directory; needs a `.gitkeep` or documentation if intended for future raw data ingestion.
4. **`uploaded_materials/`**:
   - Contains 17 team research PDFs, PowerPoint presentations, and CAD specifications (totaling ~150 MB).
   - This research forms the scientific evidence base for the project (Dr. Sondos Hammoud's sensor report, Omar's solar helmet study, Radi-N2 study, etc.).
   - Must be preserved in references and documented in `docs/references/NASA_DATA_AND_REFERENCES.md`.

---

## 7. Baseline Conclusion

The ASTRA project is in an exceptionally strong technical condition:
- 100% of existing backend tests pass.
- Frontend builds and typechecks without warnings.
- Real-time simulation, Trusted Data Layer, ML Decision Engine, and 3D graphics are functional.
- The uncommitted modifications contain valuable, working features that must be safely preserved and committed.
- With secret sanitization, canonical consolidation into `master`, and comprehensive documentation, ASTRA is poised for a top-tier NASA Space Apps 2026 submission.
