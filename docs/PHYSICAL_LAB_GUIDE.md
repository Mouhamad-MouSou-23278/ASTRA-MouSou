# ASTRA Physical Sensor Engineering & Simulation Laboratory
## Complete Technical Documentation, Scientific Specifications & Testing Guide

---

## 1. Executive Overview

The **ASTRA Physical Sensor Engineering & Simulation Laboratory** transforms ASTRA’s Physical Team module into an extensible, scientifically grounded, AI-assisted engineering workspace. Rather than serving as a static telemetry registry, the laboratory provides an end-to-end environment for instrumentation engineers and biomedical researchers to design, place, simulate, calibrate, and verify physical sensors destined for planetary extravehicular activities (Mars EVAs).

### Key Architectural Standards Grounding
1. **NASA Space Apps Challenge 2026:** Designed for *"Create Health Monitoring Software for Astronauts on Space Missions"*, specifically addressing communication latency, autonomous crew operations, and multisensor reliability in harsh planetary environments.
2. **NASA-STD-3001 (Vols 1 & 2):** Space Flight Human-System Standards governing permissible EVA workloads, core body thermal regulation (caution at 37.5°C), heart rate limits (30–200 bpm), and spacesuit biosensor telemetry.
3. **EVA-EXP-0034:** Exploration Extravehicular Activity System Technical Standards specifying exploration spacesuit avionics, RS-485 wired telemetry buses, and radiation-hardened biosensor nodes.
4. **Mars Science Laboratory (MSL/RAD):** Surface ionizing radiation baseline rate of ~27.9 $\mu\text{Sv/h}$ (~0.67 mSv/day) based on Hassler et al. (2014).

---

## 2. Complete MVP Architecture & Feature Matrix

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        ASTRA Physical Engineering Laboratory                           │
│                                                                                        │
│  ┌───────────────────────┐  ┌────────────────────────┐  ┌───────────────────────────┐  │
│  │   Sensor Studio       │  │  3D Placement Studio    │  │ Physics & Error Sandbox   │  │
│  │  • Spec Editor        │  │  • Three.js Viewer      │  │ • Deterministic Models    │  │
│  │  • Dynamic I/O Ports  │  │  • Mounting Points      │  │ • Environmental Coupling  │  │
│  │  • Import/Export      │  │  • Coordinate Anchors   │  │ • Multi-Fault Injection   │  │
│  └───────────────────────┘  └────────────────────────┘  └───────────────────────────┘  │
│             ▲                           ▲                              ▲               │
│             │                           │                              │               │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐  │
│  │                        Physical AI Engineering Agent                             │  │
│  │  • Contextual Sensor Retrieval   • Spec Extraction   • Draft Proposal & Auditing │  │
│  │  • Tool-Based Safe Execution     • NASA Standard Citations (NASA-STD-3001)       │  │
│  └──────────────────────────────────────────────────────────────────────────────────┘  │
│                                         │                                              │
│                                         ▼                                              │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐  │
│  │                         Trusted Data Layer (TDL)                                 │  │
│  │  • Ground Truth vs. Observed     • Residual & Error Metrics (MAE, RMSE, Bias)    │  │
│  │  • Traceable Provenance Logs     • Explainable Trust Score Algorithm             │  │
│  └──────────────────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

| Component | Capabilities Delivered | Primary Files |
|---|---|---|
| **Flexible Sensor Management** | Custom categories, sensor families, manufacturer/model tracking, hierarchical tags, full lifecycle (Draft/Active/Archived), duplicate sensor with clone options, version snapshots. | `app/models.py`, `app/schemas.py`, `app/api/physical.py`, `PhysicalPage.tsx` |
| **Dynamic I/O Contracts** | Multi-port inputs (temperature, voltage, pressure) and multi-port outputs (calibrated values, raw mV, ionization current, status flags) with type/unit validation. | `app/schemas_lab.py`, `app/api/physical_lab.py`, `PhysicalPage.tsx` |
| **3D Placement Studio** | Interactive Three.js canvas anchoring sensors onto astronaut body nodes (torso/HUT, helmet, backpack/PLSS, limbs) and lander mast, with X/Y/Z position, orientation angles, and primitive fallback geometries (cylinder, box, sphere, capsule, disc). | `SensorPlacementCanvas.tsx`, `app/schemas_lab.py`, `PhysicalPage.tsx` |
| **Physics Transducer Engine** | Callendar-Van Dusen RTD Platinum Thermometer (IEC 60751), Piezoresistive Silicon Diaphragm Pressure Transducer (NASA SP-8088), Silicon PIN Diode Space Radiation Dosimeter (MSL/RAD). | `astra_sim/physics_models/` (`thermal.py`, `pressure.py`, `radiation.py`, `registry.py`) |
| **Error & Failure Sandbox** | Parameterized error pipeline: Gaussian white noise, linear/exponential drift, calibration bias offset, stuck-at-fault, intermittent dropouts, transient EMI spikes, and ADC quantization. | `astra_sim/error_models.py`, `app/api/physical_lab.py` |
| **Trusted Data Layer (TDL)** | Instantaneous residual calculation ($\epsilon = y_{obs} - y_{true}$), explainable Trust Score ($S_{trust} \in [0.0, 1.0]$), aggregate metrics (MAE, RMSE, Max Error, Availability). | `astra_sim/tdl.py`, `TrustedDataChart.tsx`, `app/api/physical_lab.py` |
| **Physical AI Agent** | Dedicated domain assistant with hosted cloud LLM integration (Gemini, Claude, OpenAI, Groq; local Ollama omitted), tool calling, compliance auditing against NASA-STD-3001, and staged diff proposal approval gating. | `app/services/physical_agent.py`, `app/services/llm.py`, `PhysicalAgentChat.tsx` |
| **Import & Export Engine** | JSON and CSV catalog export, batch import with dry-run schema validation, duplicate detection, and audit logging. | `app/api/physical_lab.py`, `PhysicalPage.tsx` |

---

## 3. Physics Simulation Models & Equations

### 3.1 Callendar-Van Dusen RTD Platinum Thermometer (`rtd_temperature`)
Standardized under **IEC 60751:2008**:
- For $T \ge 0^\circ\text{C}$:
  $$R(T) = R_0 \cdot \left(1 + A \cdot T + B \cdot T^2\right)$$
- For $T < 0^\circ\text{C}$:
  $$R(T) = R_0 \cdot \left(1 + A \cdot T + B \cdot T^2 + C \cdot (T - 100) \cdot T^3\right)$$
Where:
- $A = 3.9083 \times 10^{-3} \, ^\circ\text{C}^{-1}$
- $B = -5.7750 \times 10^{-7} \, ^\circ\text{C}^{-2}$
- $C = -4.1830 \times 10^{-12} \, ^\circ\text{C}^{-4}$
- $R_0 = 100.0 \, \Omega$ (Pt100) or $1000.0 \, \Omega$ (Pt1000)

**Dynamic Thermal Response Lag:**
$$\tau \frac{dT_{sensor}}{dt} + T_{sensor} = T_{env} \implies T_{sensor}(t + \Delta t) = T_{sensor}(t) + \left(1 - e^{-\Delta t / \tau}\right) \cdot \left(T_{env} - T_{sensor}(t)\right)$$

**Wheatstone Bridge Output (mV):**
$$V_{bridge} = V_{supply} \cdot \left(\frac{R(T)}{R(T) + R_{ref}} - \frac{R_0}{R_0 + R_{ref}}\right) \times 1000$$

---

### 3.2 Piezoresistive Bridge Pressure Transducer (`piezoresistive_pressure`)
Models silicon micromachined diaphragms under Mars atmospheric and spacesuit pressures:
$$V_{bridge}(P, T) = V_{supply} \cdot \left[S_0 \cdot P \cdot \left(1 + \alpha_{S} \cdot (T - T_0)\right) + V_{offset} + \alpha_{off} \cdot (T - T_0)\right]$$
Where:
- $S_0$: Bridge nominal sensitivity (mV/V/kPa)
- $\alpha_S$: Temperature coefficient of sensitivity (%/°C)
- $\alpha_{off}$: Temperature coefficient of offset (mV/°C)
- $T_0$: Reference calibration temperature ($25^\circ\text{C}$)

---

### 3.3 Silicon PIN Diode Space Radiation Dosimeter (`silicon_dosimeter`)
Grounded in **MSL/RAD surface measurements (Hassler et al., 2014)**:
- Ionization photocurrent:
  $$I_{photo} = \dot{D} \cdot K_{sens}$$
- Thermally generated leakage current:
  $$I_{leak}(T) = I_{0} \cdot 2.0^{(T - T_0) / T_{doubling}}$$
- Cumulative EVA dose integration:
  $$D_{cum}(t) = \int_0^t \frac{\dot{D}(\tau)}{3600} \, d\tau$$

---

## 4. Parameterized Error Simulation Pipeline

The error simulation pipeline executes deterministically via `apply_error_pipeline()` using PRNG streams keyed by `(seed, sensor_key, component)`:

1. **Calibration Bias Offset:** $y'(t) = y(t) + \Delta B$
2. **Linear / Exponential Drift:** $y'(t) = y(t) + \frac{r_{drift}}{60} \cdot t$ (flags `DRIFT`)
3. **Gaussian Noise:** $y'(t) = y(t) + \mathcal{N}(0, \sigma^2)$
4. **Stuck-at Fault:** $y'(t) = y(t_{start})$ for $t \in [t_{start}, t_{start} + \Delta t]$ (flags `STUCK`)
5. **Dropout / Disconnection:** Emits `None` (flags `DISCONNECTED`)
6. **Transient Spikes:** $y'(t) = y(t) \pm \Delta S$ (flags `SPIKE`)
7. **ADC Quantization:** $y'(t) = \Delta q \cdot \text{round}(y(t) / \Delta q)$

---

## 5. Trusted Data Layer (TDL) & Trust Score Formulation

The Trusted Data Layer evaluates measurement integrity in real time:

### Instantaneous Residual:
$$\epsilon(t) = y_{obs}(t) - y_{true}(t)$$

### Explainable Trust Score ($S_{trust} \in [0.0, 1.0]$):
$$S_{trust}(t) = W_{flag} \cdot \exp\left(-\frac{1}{2} \left(\frac{|\epsilon(t)|}{\sigma_{datasheet}}\right)^2\right)$$
Where:
- $W_{flag} = 0.0$ if disconnected or out-of-range
- $W_{flag} = 0.15$ if stuck
- $W_{flag} = 0.25$ if transient spike
- $W_{flag} = 0.55$ if excessive noise or drift

### Benchmark Aggregate Metrics:
- **Mean Absolute Error (MAE):** $\text{MAE} = \frac{1}{N} \sum_{i=1}^N |\epsilon_i|$
- **Root Mean Squared Error (RMSE):** $\text{RMSE} = \sqrt{\frac{1}{N} \sum_{i=1}^N \epsilon_i^2}$
- **Max Error:** $\max |\epsilon_i|$
- **Telemetry Availability (%):** $\frac{N_{valid}}{N_{total}} \times 100\%$

---

## 6. Physical AI Engineering Agent Architecture

### Provider Hierarchy (No Ollama):
1. **Google Gemini:** `gemini-1.5-flash`, `gemini-1.5-pro` via direct API key.
2. **Anthropic Claude:** `claude-3-5-sonnet`, `claude-3-opus` via Anthropic SDK.
3. **OpenAI / Azure:** `gpt-4o`, `gpt-4o-mini` via chat completions.
4. **Groq (Ultra-Low Latency):** `llama-3.3-70b-versatile` via Groq API.
5. **Deterministic Expert Fallback:** Works 100% offline with zero external dependencies.

### Safe Approval & Gating Mechanism:
The AI Agent can inspect and analyze sensors freely. When asked to create or modify a sensor, it generates a staged **`AgentToolProposal`** with a structured diff. The database mutation is persisted only when the user reviews the diff card and explicitly clicks **Approve & Apply to Catalog**.

---

## 7. Step-by-Step Testing & Verification Guide

### 7.1 Running the Automated Test Suite

```powershell
# Run the entire test suite (88 tests)
backend\.venv\Scripts\pytest backend\tests -v
```

**Expected Result:**
```
============================= 88 passed in 92.71s =============================
```

### 7.2 Building the Frontend Application

```powershell
npm --prefix frontend run build
```

**Expected Result:**
```
✓ built in ~2.3s
tsc --noEmit && vite build completed with 0 errors.
```

### 7.3 End-to-End Manual Testing in the Browser

1. **Start the application:**
   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\start.ps1
   ```
   Open `http://localhost:8000` and log in as **Physical Team** (`physical` / `astra-physical-2026`).

2. **Test 1: Sensor Registry & Duplication**
   - In the **Sensor Registry** tab, search for `"RTD"` or `"Helmet"`.
   - Click **Duplicate** on any sensor. Confirm that a new draft sensor is created with `(Copy)`.
   - Click **Edit** and inspect the **General**, **Technical Specifications**, and **Custom Fields** tabs.

3. **Test 2: 3D Placement Studio**
   - Click the **Lab Workbench** tab.
   - Select a sensor (e.g. `test_pt100_rtd`).
   - In the **3D Physical Placement** subtab, drag with the mouse to orbit the astronaut model.
   - Adjust the **Mount Parent Body** (e.g. Helmet, Backpack, Arm) and adjust the position sliders.
   - Observe the 3D primitive sensor highlight move in real time on the spacesuit.

4. **Test 3: Physics Models & Error Injection**
   - Under **Physics Transducer Model**, switch between Callendar-Van Dusen RTD and Piezoresistive Pressure.
   - Under **Error Simulation**, enable **Linear Drift** and **Transient Spikes**.
   - Click **Save Lab Configuration**.

5. **Test 4: Trusted Data Layer (TDL)**
   - Click the **Trusted Data (TDL)** tab.
   - Set Duration to `30s` and click **▶ Run Benchmark Simulation**.
   - Observe the interactive canvas chart showing Ground Truth (green) vs. Telemetry (cyan) vs. Trust Score (purple).
   - Review the MAE, RMSE, Max Error, Mean Trust Score, and Availability metrics cards.

6. **Test 5: Physical AI Agent & Safe Approval**
   - Click the **Physical AI Agent** tab.
   - Click the quick action pill: **🔬 Propose Pulse Oximeter**.
   - Inspect the generated **Proposed Mutation Card** with before/after diff.
   - Click **Approve & Apply to Catalog**.
   - Check the **Sensor Registry** tab to verify that `optical_spo2_finger` has been saved as a draft.

7. **Test 6: Import & Export**
   - Click the **Import / Export** tab.
   - Click **📥 Export JSON** or **📥 Export CSV** and verify the downloaded file.
   - Click **Validate Input (Dry Run)** with sample JSON to verify schema validation.
