Project Deployment Notice
Demo Preview: You can test and review the live version of the project here:
👉 https://astra-mousou.onrender.com

# ASTRA — Autonomous Astronaut Health Monitoring & Mars Mission Simulation


ASTRA is a mission-critical platform providing **real-time autonomous astronaut health monitoring, 3D Mars surface operations, an AI medical decision engine, and a multi-stage Trusted Data Layer (TDL)**. Operating on authentic **NASA Jezero Crater HiRISE topography** and compliant with **NASA-STD-3001** space flight standards, ASTRA resolves the 14-to-22 minute Earth-Mars communication blackout through deterministic edge simulation, machine learning triage, and autonomous life-support countermeasures.

---

## 🚀 Key Upgrades & Highlights

1. **Authentic Mars 3D Simulation & NASA Instruments**:
   - Built on real **HiRISE stereo DTM elevation** (`DTEEC_045994_1985`) and 1 m/px orthorectified imagery at the Mars 2020 *Octavia E. Butler* Perseverance landing site.
   - Interactive 3D models of Mars 2020 flight instruments: **MOXIE**, **PIXL**, **SHERLOC**, **SuperCam**, **Mastcam-Z**, **RIMFAX**, **MEDA**, and **MSL/RAD**.
2. **Medical Machine Learning & 10,000-Sample NASA Dataset**:
   - 18-dimensional Random Forest classifier trained on 10,000 NASA EVA telemetry records (`data/nasa_eva_medical_telemetry.csv`) with **95.15% validation accuracy**.
   - Integrates temporal derivatives, heart rate/SpO2 cross-sensor divergence, and pre-simulation predictive risk scoring.
3. **5 Mission Themes**:
   - Quick-toggle themes via top navigation: **Mission Dark** (Tactical OLED), **NASA Blue** (Deep Space), **Mars Sunrise** (Martian Ochre), **Arctic Light** (Clean Medical), and **Nebula Purple** (Cosmic).
4. **Full Arabic & English Bilingual Support (i18n)**:
   - Seamless one-click switch between English and العربية with native Right-to-Left (RTL) typography, clinical terms, and translated NASA action protocols.
5. **Free LLM API Integration & Zero-Key Fallback**:
   - Ready-to-use support for **OpenRouter** (Free models: `meta-llama/llama-3.3-70b-instruct:free`, etc.), **Groq**, and **Google Gemini** free tiers.
   - Full offline deterministic fallback engine: no internet or API key required to run complete simulations and AI chats.
6. **Physical Engineering Lab**:
   - Interactive 3D spacesuit sensor placement canvas with anatomically accurate suit nodes, glowing pulse transducers, umbilical conduits, and helmet visor reflections.
   - AI engineering chat with direct programmatic access to live sensor specifications and noise models.
7. **Trusted Data Layer (TDL) & 20 Simulation Use Cases**:
   - Mathematical Gaussian likelihood scoring, rate-of-change filters, and multi-sensor fusion to eliminate false alarms from sensor detachment or thermal drift.
   - Automated **Batch Test Runner** running all 20 NASA scenarios with a live scoreboard.
8. **Doctor / Examiner Mobile QR & Natural-Language Scenario Injection**:
   - QR code pairing for phones and tablets on the same Wi-Fi.
   - Doctor Console allows examiners to input natural language medical scenarios (e.g. *"Astronaut develops severe ventricular arrhythmia while climbing"*); ASTRA's clinical engine interprets the scenario, matches NASA protocols, and executes it into the simulation.
9. **Fullscreen Presentation Mode & Smooth UI/UX**:
   - One-click / `F11` theater presentation mode with Bezier-interpolated telemetry curves and neon glow underlays.

---

## 🛠️ Quick Start Guide

### Prerequisites
- **Python 3.11+**
- **Node.js 20+**
- Works on Windows, macOS, and Linux out-of-the-box.

### Option A: Windows (PowerShell)
```powershell
# Clone or open the repository, then run the automated launch script:
powershell -ExecutionPolicy Bypass -File scripts\start.ps1
```
*The script automatically sets up the Python virtual environment (`backend\.venv`), installs dependencies, builds the frontend bundle, and serves the platform at <http://localhost:8000>.*

### Option B: macOS / Linux
```bash
# 1. Backend environment setup
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.txt

# 2. Frontend build
cd frontend && npm install && npm run build && cd ..

# 3. Start unified server
cd backend && .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
```

---

## 🔑 Free LLM API Keys Setup (OpenRouter, Groq, Gemini)

ASTRA works completely **offline without any API key** using its local deterministic explainer. To enable deep conversational reasoning with live LLMs for free:

### 1. OpenRouter (Recommended - Free Model Included)
- **Get Free Key**: Sign up at [https://openrouter.ai/](https://openrouter.ai/) and generate a free API key at [https://openrouter.ai/keys](https://openrouter.ai/keys).
- **Configure in `.env`**:
  ```ini
  ASTRA_LLM_PROVIDER=openrouter
  OPENROUTER_API_KEY=sk-or-v1-your-free-key-here
  OPENROUTER_MODEL=meta-llama/llama-3.3-70b-instruct:free
  ```
  *(Other free OpenRouter models: `google/gemini-2.0-flash-exp:free`, `mistralai/mistral-7b-instruct:free`)*.

### 2. Groq (High Speed Free Tier)
- **Get Free Key**: Sign up at [https://console.groq.com/](https://console.groq.com/) and create a key.
- **Configure in `.env`**:
  ```ini
  ASTRA_LLM_PROVIDER=openai_compatible
  OPENAI_COMPATIBLE_BASE_URL=https://api.groq.com/openai/v1
  OPENAI_COMPATIBLE_API_KEY=gsk_your-groq-key-here
  OPENAI_COMPATIBLE_MODEL=llama-3.3-70b-versatile
  ```

### 3. Google Gemini (Free Tier)
- **Get Free Key**: Generate a key at [Google AI Studio](https://aistudio.google.com/apikey).
- **Configure in `.env`**:
  ```ini
  ASTRA_LLM_PROVIDER=openai_compatible
  OPENAI_COMPATIBLE_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
  OPENAI_COMPATIBLE_API_KEY=AIzaSyYourGeminiApiKey
  OPENAI_COMPATIBLE_MODEL=gemini-1.5-flash
  ```

---

## 🌐 Deployment: Local Network vs. Remote Network

### Scenario A: Same Local Network (Demo & Exam Presentation)
To present the platform to examiners or let doctors scan the QR code using their phones on the **same Wi-Fi or LAN**:

1. Ensure the server binds to `0.0.0.0` (default in `scripts/start.ps1` and `uvicorn`).
2. Find your local machine's IP address:
   - **Windows**: Run `ipconfig` (e.g. `192.168.1.150`).
   - **macOS/Linux**: Run `ifconfig` or `ip a`.
3. In your `.env` file, specify:
   ```ini
   ASTRA_PUBLIC_BASE_URL=http://192.168.1.150:8000
   ```
4. **Firewall Note**: When prompted by Windows Defender or OS firewall, check **Allow on private networks**.
5. Launch ASTRA, log in as `operator`, open any session, and click **🩺 Dr / Examiner QR** or **Viewer QR**. Any phone connected to the same Wi-Fi can scan the code and instantly interact with the session.

### Scenario B: Different Networks / Over the Internet
When examiners or evaluators are in a **different network or location**, use secure tunneling:

#### Method 1: ngrok (Easiest & Instant)
```bash
# 1. Install ngrok from https://ngrok.com/
# 2. Expose port 8000 with HTTPS:
ngrok http 8000
```
- Copy the public forward URL (e.g., `https://astra-mars-demo.ngrok-free.app`).
- Set `ASTRA_PUBLIC_BASE_URL=https://astra-mars-demo.ngrok-free.app` in your `.env`.
- Anyone anywhere in the world can open the link or scan the generated QR codes.

#### Method 2: LocalTunnel (No Account Needed)
```bash
npx localtunnel --port 8000
```

#### Method 3: Docker Deployment
```bash
cp .env.example .env
docker compose up --build -d
```

---

## 👥 Seed Demo Accounts

The database comes pre-seeded with 5 role-based accounts (one-click login buttons available on the login page):

| Role | Username | Password | Capabilities |
|:---|:---|:---|:---|
| **Admin** | `admin` | `astra-admin-2026` | User RBAC management, audit log, configuration, global emergency stop |
| **Physical Team** | `physical` | `astra-physical-2026` | 3D spacesuit sensor canvas, transducer calibration, failure signatures |
| **Medical Team** | `medical` | `astra-medical-2026` | 10 NASA simulation tests, flight instrument lifecycles, ML triage, pre-sim risk |
| **Test Operator** | `operator` | `astra-operator-2026` | Mission control, 3D Mars view, natural-language scenarios, QR code generation |
| **Instrument Viewer** | `viewer` | `astra-viewer-2026` | Read-only live telemetry stream for external observers |

---

## 📋 Comprehensive Presentation Walkthrough Script (for Jury & Examiners)

Follow this 5-stage walkthrough to showcase the entire platform during a live demonstration:

### Stage 1: Physical Engineering Sensor Lab
1. Sign in as **Physical Team** (`physical` / `astra-physical-2026`).
2. Switch language to **العربية** or **English** in the top bar to show bilingual RTL capability.
3. Switch theme to **NASA Blue** or **Mars Sunrise**.
4. Inspect the **3D Spacesuit Anatomy**: rotate the model to see the chest ECG nodes, helmet pulse oximeter, LCVG umbilical conduits, and glowing pulse indicators.
5. In the **AI Engineering Chat**, ask:
   *"What is the noise specification and sampling rate for the pulse oximeter?"*
   *Demonstrates*: The AI directly inspects the live sensor registry and returns exact technical specifications.

### Stage 2: Trusted Data Layer (TDL) 20-Scenario Test Runner
1. Click the **🧪 TDL Pipeline** navigation link.
2. Click **Scenario #1 (SpO2 Motion Artifact)**: show how the residual increases to 34%, the trust score drops to 0.16, and the system prevents an unnecessary emergency oxygen purge.
3. Click **Scenario #2 (True Hypoxia)**: show that when real hypoxia occurs, the trust score remains 0.94 and triggers an autonomous suit oxygen purge.
4. Click **▶ Run All 20 TDL Tests**: watch the automated runner execute all 20 physical and sensor fault scenarios and report 100% pass rate on the scoreboard.

### Stage 3: Medical Machine Learning & NASA Instrument History
1. Click the **🩺 Medical Team** navigation link.
2. Select the **🧪 NASA Sim Tests (10 Cases)** tab:
   - Select **Case 1: Apollo 15 Cardiac Arrhythmia** (David Scott / James Irwin).
   - Click **Run ML Triage Diagnosis**: observe the 18-feature Random Forest model predict `warning_arrhythmia` with high confidence and cite NASA-STD-3001 protocols.
   - Select **Case 3: ISS EVA 23 EMU Water Intrusion** (Luca Parmitano) to view sensor ambiguity resolution.
3. Select the **🛰️ NASA Instruments** tab:
   - Review operating hours, calibration dates, and failure logs for **MOXIE**, **PIXL**, **SHERLOC**, **SuperCam**, **Mastcam-Z**, **RIMFAX**, and **MEDA**.

### Stage 4: Doctor / Examiner Mobile QR Scenario Injection
1. Sign in as **Test Operator** (`operator` / `astra-operator-2026`).
2. Click **Start** on the mission playback bar.
3. Click **🩺 Dr / Examiner QR** in the top bar.
4. Scan the QR code with your smartphone (or open the link in a mobile preview tab).
5. On the phone, select **Doctor Mode** and inject a custom scenario:
   *"Astronaut experiences severe heat stroke after cooling line blockage while carrying rock samples."*
6. Click **Execute Into Simulation**: observe how the clinical rule interpreter translates the text into telemetry constraints and immediately triggers LCVG maximum cooling.

### Stage 5: Fullscreen 3D Mars EVA Experience
1. Press **⛶ Fullscreen** (or press `F11`) on the mission console.
2. Switch camera perspectives: **3rd Person**, **1st Person Helmet HUD**, **Overview HiRISE**, and **Close-up**.
3. Point out the authentic **Perseverance Rover 3D model** with SuperCam mast, robotic arm (PIXL & SHERLOC), and the Martian terrain sampled from actual NASA orbiter data.

---

## 📚 Technical Documentation Directory

### Requirements & Specifications
- [**docs/PROJECT_OVERVIEW.md**](docs/PROJECT_OVERVIEW.md): Comprehensive system overview and feature status matrix.
- [**docs/requirements/SRS.md**](docs/requirements/SRS.md): Full IEEE 830 Software Requirements Specification with 30+ functional requirements.
- [**docs/requirements/MVP.md**](docs/requirements/MVP.md): MoSCoW prioritization and feature implementation classification.
- [**docs/requirements/PROBLEM_STATEMENT.md**](docs/requirements/PROBLEM_STATEMENT.md): Scientific rationale and deep-space telemetry challenges.
- [**docs/requirements/USE_CASES.md**](docs/requirements/USE_CASES.md): Detailed mission operational use cases.

### Architecture, Design & APIs
- [**docs/architecture/SYSTEM_ARCHITECTURE.md**](docs/architecture/SYSTEM_ARCHITECTURE.md): Complete architecture specification with Mermaid component and sequence diagrams.
- [**docs/architecture/DATABASE_DESIGN.md**](docs/architecture/DATABASE_DESIGN.md): Database data dictionary and entity-relationship models.
- [**docs/architecture/API_REFERENCE.md**](docs/architecture/API_REFERENCE.md): Full REST & WebSocket API reference with schemas and examples.
- [**docs/SECURITY_AND_PRIVACY.md**](docs/SECURITY_AND_PRIVACY.md): Cryptographic security, RBAC privileges, and data privacy policy.
- [**docs/TRUSTED_DATA_LAYER.md**](docs/TRUSTED_DATA_LAYER.md): Mathematical formulations for Gaussian trust scoring, rate derivative gates, and cross-sensor divergence.
- [**docs/MEDICAL_ML_GUIDE.md**](docs/MEDICAL_ML_GUIDE.md): Architecture of the 18-feature Random Forest classifier, 10,000 telemetry dataset, and pre-simulation risk API.
- [**docs/PHYSICAL_LAB_GUIDE.md**](docs/PHYSICAL_LAB_GUIDE.md): Engineering transducer calibration and failure injection guide.
- [**docs/20_SIMULATION_USE_CASES.md**](docs/20_SIMULATION_USE_CASES.md): Bilingual operational manual for all 20 simulation test cases.

### Deployment & Configuration
- [**docs/deployment/INSTALLATION.md**](docs/deployment/INSTALLATION.md): Step-by-step setup guide for Windows, macOS/Linux, and Docker.
- [**docs/deployment/ENVIRONMENT_CONFIGURATION.md**](docs/deployment/ENVIRONMENT_CONFIGURATION.md): Complete environment variable reference table.
- [**docs/deployment/DEPLOYMENT.md**](docs/deployment/DEPLOYMENT.md): Deployment modes, network setup, mobile QR pairing, and Docker configuration.

### Verification, Licenses & NASA Submission
- [**docs/testing/TEST_PLAN.md**](docs/testing/TEST_PLAN.md): Test pyramid, methodologies, and quality gates.
- [**docs/testing/TEST_REPORT.md**](docs/testing/TEST_REPORT.md): Automated test execution report (97/97 passed).
- [**docs/references/NASA_DATA_AND_REFERENCES.md**](docs/references/NASA_DATA_AND_REFERENCES.md): NASA open science datasets and standards citations.
- [**docs/references/AI_USAGE_DISCLOSURE.md**](docs/references/AI_USAGE_DISCLOSURE.md): Complete disclosure of runtime and development AI tools.
- [**docs/references/THIRD_PARTY_LICENSES.md**](docs/references/THIRD_PARTY_LICENSES.md): Full intellectual property and open-source license audit.
- [**submission/**](submission/): NASA Space Apps Challenge 2026 official submission materials.

---

## 🧪 Automated Test Verification

ASTRA features comprehensive unit, integration, and ML validation test suites:

```powershell
# Run backend pytest suite (97 tests)
backend\.venv\Scripts\python -m pytest backend/tests

# Run frontend TypeScript type-check and production build
npm --prefix frontend run build
```

*All 97 backend tests pass with 100% success rate, and the frontend builds cleanly with zero TypeScript errors.*

---

## ⚖️ Compliance & Safety Notice

ASTRA is an advanced research and engineering demonstration platform. Astronaut profiles are synthetic, physiological dynamics are spaceflight engineering approximations conforming to NASA-STD-3001, and simulated anomalies are modeled for technical demonstration. ASTRA is not certified as an operational medical device for Earth clinical practice.

---
## 📢 Demo Deployment

A live demo of the full ASTRA platform is publicly accessible at:

> **https://astra-mousou.onrender.com**

**Important note:** This demo is hosted on Render’s free tier and may experience cold‑starts or brief downtime after periods of inactivity. It is intended for evaluation and demonstration purposes only; do not rely on it for production‑grade reliability.

Feel free to explore the UI, run the simulation scenarios, and test the QR‑code workflow. For a more stable environment you can deploy the project yourself following the Netlify deployment guide in this repository.
---
