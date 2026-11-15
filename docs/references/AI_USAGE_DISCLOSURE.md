# ASTRA — AI Usage Disclosure

> [!NOTE]
> This document discloses all uses of Artificial Intelligence in the ASTRA project, both at runtime (within the application) and during development. This is required for NASA Space Apps Challenge 2026 compliance.

## 1. Runtime AI Features (In-Application)

### 1.1 LLM-Powered Features

| Feature | Provider | Fallback | Status |
|---|---|---|---|
| **AI Medical Explainer** | Configurable (OpenRouter / Groq / Gemini / Anthropic / OpenAI-compatible) | Local deterministic engine | IMPLEMENTED |
| **AI Engineering Chat** (Physical Lab) | Same as above | Local deterministic engine | IMPLEMENTED |
| **Natural-Language Scenario Injection** | Same as above | Local keyword-based parser | IMPLEMENTED |
| **Mission Activity Planner** | Same as above | Local deterministic planner | IMPLEMENTED |

**Key design principle**: Every AI-powered feature has a **fully deterministic offline fallback**. ASTRA operates completely without any API key or internet connection. The local engine provides rule-based explanations and responses calibrated against NASA-STD-3001 protocols.

**LLM providers supported** (all free tiers available):
- **OpenRouter** (recommended): Llama 3.3 70B, Gemini Flash, Mistral 7B — free models
- **Groq**: Llama 3.3 70B Versatile — free tier
- **Google Gemini**: Gemini 1.5 Flash — free tier
- **Anthropic**: Claude (paid)
- **OpenAI-compatible**: Any local or remote endpoint (Ollama, LM Studio, vLLM)

### 1.2 Machine Learning Model

| Component | Type | Training Data | Accuracy | Status |
|---|---|---|---|---|
| **Clinical Triage Classifier** | Random Forest (scikit-learn compatible) | 10,000 synthetic EVA telemetry records | 95.15% validation | IMPLEMENTED |

**Details:**
- **18 input features**: heart_rate, spo2_pct, systolic_bp, diastolic_bp, temperature_c, respiration_rate, etco2_mmhg, pain_score, gcs_total, radiation_msv_h, suit_pressure_kpa, o2_flow_lpm, battery_pct, suit_temp_c, co2_ppm, humidity_pct, emg_fatigue_index, eeg_alertness_index.
- **Output**: Medical triage classification with confidence scores and recommended NASA protocols.
- **Training**: Offline, on synthetic data calibrated to published NASA physiological ranges.
- The training dataset (`data/nasa_eva_medical_telemetry.csv`) is **synthetically generated**, not sourced from real astronaut records.

### 1.3 Trusted Data Layer (Deterministic — NOT AI)

The Trusted Data Layer (TDL) is **entirely deterministic** and uses mathematical methods:
- Gaussian likelihood scoring
- Rate-of-change derivative filters
- Multi-sensor cross-correlation and divergence detection
- Statistical outlier gating

The TDL does **not** use machine learning, neural networks, or LLMs. It is a physics-based validation pipeline.

---

## 2. AI Tools Used During Development

The following AI tools were used during the engineering, documentation, and testing phases of the project:

| Tool | Purpose | Scope |
|---|---|---|
| **Google Antigravity (Gemini / Claude models)** | Code review, documentation generation, test creation, repository consolidation | Development tooling only — not part of the runtime application |
| **LLM-assisted code generation** | Portions of documentation, test scaffolding, and configuration files were drafted with AI assistance and then reviewed and verified by the team | Development tooling only |

> [!IMPORTANT]
> All AI-generated content during development was **reviewed, verified, and validated** against the actual codebase. No AI-generated claims about features, test results, or NASA data were accepted without evidence-based verification.

---

## 3. What Is NOT AI-Powered

To avoid misrepresentation, the following core components are **entirely deterministic** and do not use AI:

| Component | Method |
|---|---|
| Sensor data validation (TDL) | Mathematical Gaussian likelihood + rate-of-change filters |
| Authentication & RBAC | Standard JWT + bcrypt password hashing |
| WebSocket telemetry streaming | Deterministic state machine simulation |
| 3D Mars visualization | Three.js rendering of NASA HiRISE elevation data |
| QR code generation | Standard QR encoding library |
| Database operations | Standard SQL (SQLAlchemy ORM) |
| Emergency stop / countermeasures | Rule-based threshold triggers |

---

## 4. Ethical Considerations

- ASTRA is a **prototype demonstration**, not a certified medical device.
- AI-generated medical explanations include disclaimers that they are for demonstration purposes.
- The system is designed for **decision support**, not autonomous medical treatment.
- All simulated data is clearly labeled as `SIMULATED DATA` in the application header.
- The local deterministic fallback ensures the system never depends on external AI services for core safety functionality.
