# ASTRA — Operational Use Cases & Workflow Specifications
**Project**: ASTRA (Autonomous Spaceflight Telemetry & Reliability Architecture)  
**Track**: NASA Space Apps Challenge 2026  
**Audience**: System Architects, Test Operators, Flight Surgeons, and Evaluation Judges  

---

## 1. Overview of Key Actors

1. **Admin (`admin`)**: Responsible for user lifecycle, security audit, emergency stops, and system configuration.
2. **Physical Team Engineer (`physical`)**: Instrumentation engineer designing, calibrating, and benchmarking spaceflight transducers.
3. **Flight Surgeon / Medical Officer (`medical`)**: Medical lead evaluating crew clinical readiness, setting alarm rules, and supervising ML decision models.
4. **Mission Test Operator (`operator`)**: Flight controller staging mission scenarios, controlling simulations, and coordinating EVA events.
5. **Viewer / Competition Evaluator (`viewer`)**: Mobile or desktop observer monitoring telemetry without administrative credentials.

---

## 2. Core Operational Use Cases

### UC-01: Pulse Oximeter Cable Slip & False Alarm Suppression
- **Actor**: Mission Test Operator & Trusted Data Layer (Automated)
- **Primary Goal**: Prevent a false emergency EVA abort when a spacesuit finger probe detaches during rock sampling.
- **Preconditions**:
  1. Operator is logged in and starts Scenario: *"Geological Core Sampling at Delta Scarp"*.
  2. Baseline vitals: Heart Rate $72\text{ bpm}$, SpO2 $98\%$, Core Temp $37.0^\circ\text{C}$, Suit Pressure $29.6\text{ kPa}$.
- **Main Success Flow**:
  1. At simulation step $T+04:12$, the physical error model injects a **Disconnect** on telemetry channel `spo2_pct`.
  2. The raw sensor reading plummets from $98\%$ to $0\%$ (open circuit).
  3. **TDL Layer 1 (Boundary Check)** flags value $0\%$ as below the physical physiological lower bound ($\text{min\_valid} = 50\%$).
  4. **TDL Layer 3 (Cross-Consensus)** evaluates associated physiological channels:
     - Heart rate remains steady at $74\text{ bpm}$ (no tachycardia).
     - Respiration rate remains nominal at $14\text{ breaths/min}$ (no hyperventilation).
     - Suit oxygen partial pressure is nominal at $29.5\text{ kPa}$.
  5. The TDL computes an SpO2 Trust Score $T = 0.12$ (untrusted).
  6. The system raises an **Instrument Fault Alert**: *"PPO-001 Pulse Oximeter Disconnect / Cable Detached"*.
  7. The system **inhibits** the clinical Medical Rule `CRIT-HYPOXIA-001` (preventing an unwarranted emergency EVA abort).
  8. The operator HUD displays the SpO2 value in amber italics with a strikethrough, accompanied by the warning: *"Sensor Untrusted — Clinical Alarm Suppressed"*.
- **Alternative Flow (True Hypoxia)**:
  - If SpO2 drops to $82\%$ and is accompanied by Heart Rate $> 125\text{ bpm}$, Respiration $> 26\text{ bpm}$, and $T \ge 0.90$, the TDL confirms ground-truth hypoxia and immediately triggers an emergency secondary oxygen pack actuation.
- **Expected Outcome**: Astronaut does not abandon the mission; life-support consumables are conserved.

---

### UC-02: Acute Spacesuit Hyperthermia & Automated Cooling Intervention
- **Actor**: Medical Team & Astronaut (Simulated)
- **Primary Goal**: Detect true heat exhaustion during steep crater rim ascent and actuate active LCVG cooling.
- **Preconditions**:
  1. Astronaut is performing high-workload EVA ($480\text{ Watts}$ metabolic rate).
  2. Platinum RTD temperature sensor `core_temp_c` is active ($T = 0.98$).
- **Main Success Flow**:
  1. Over 15 simulation minutes, `core_temp_c` climbs steadily at $+0.12^\circ\text{C/min}$, reaching $39.2^\circ\text{C}$.
  2. Heart rate rises synchronously to $148\text{ bpm}$ (congruent cardiovascular response).
  3. TDL confirms all three verification layers:
     - Bounds check: $39.2^\circ\text{C}$ is within physical transducer range ($30–45^\circ\text{C}$).
     - Rate-of-change check: Derivative does not exceed maximum physical slew ($0.5^\circ\text{C/min}$).
     - Cross-consensus check: Elevated HR and respiration corroborate thermal stress.
  4. Overall sensor trust score is computed at $T = 0.96$.
  5. The Medical ML Decision Engine triages the frame as **`HEAT_EXHAUSTION`** with confidence $0.94$.
  6. The system triggers Medical Warning Rule `WARN-TEMP-HIGH`: *"Astronaut Core Temperature Critical ($39.2^\circ\text{C}$)"*.
  7. Recommended Action dispatched to suit controller: *"Command LCVG Chilled Water Loop to Maximum (HIGH Flow)"*.
- **Expected Outcome**: Suit cooling valve increases flow; core temperature stabilizes and prevents heat stroke syncope.

---

### UC-03: Natural Language Plan Generation & Offline Execution
- **Actor**: Mission Test Operator
- **Primary Goal**: Author an EVA mission scenario in plain English/Arabic and convert it into a deterministic simulation plan.
- **Preconditions**: Operator is authenticated and opens `/operator`.
- **Main Flow**:
  1. Operator inputs the prompt:  
     *"Conduct an EVA traverse to Jezero Delta Scarp, pace moderate, return to airlock before sunset, inject radiation spike at waypoint 2."*
  2. Operator clicks **Generate Plan**.
  3. Backend `planner.py` invokes the configured AI engine (or falls back automatically to the deterministic offline planner).
  4. The engine constructs a 7-step bounded mission schema:
     - Step 1: `OPEN_HATCH` (Airlock egress)
     - Step 2: `WALK` (Navigate to Waypoint 1: Delta Crater Rim)
     - Step 3: `INSPECT` (Measure radiation background; trigger configured dosimeter spike)
     - Step 4: `WALK` (Traverse to Waypoint 2: Delta Scarp)
     - Step 5: `SAMPLE` (Collect regolith sample)
     - Step 6: `WALK` (Return traverse to Hab Airlock)
     - Step 7: `CLOSE_HATCH` (Ingress and repressurize)
  5. Operator reviews the plan step boundaries, clicks **Confirm Plan**, and creates a simulation session.
  6. Operator clicks **Start Simulation**.
- **Expected Outcome**: Mission executes deterministically across Three.js 3D Jezero Crater terrain with real-time HUD metrics.

---

### UC-04: Doctor / Examiner Mobile QR Session Pairing
- **Actor**: Evaluation Judge or Remote Flight Surgeon
- **Primary Goal**: Monitor live telemetry on an external smartphone without entering passwords or modifying mission state.
- **Preconditions**: Operator has an active session running on the workstation.
- **Main Flow**:
  1. Operator clicks **🩺 Dr / Examiner QR** on the Operator console.
  2. System generates a secure, random 32-byte session token (`ViewerToken`) scoped exclusively to the active session ID.
  3. Operator console displays a high-resolution QR code encoding the session URL (e.g., `http://192.168.1.10:8000/sessions/4?token=vt_...`).
  4. Evaluator scans the QR code with their smartphone camera.
  5. Mobile browser opens the ASTRA Viewer interface directly.
  6. Server validates the token and establishes a WebSocket telemetry stream (`/api/sessions/4/ws?token=...`).
  7. Evaluator observes real-time ECG rhythms, vital charts, and 3D astronaut position on Mars.
  8. Evaluator uses the Doctor Examiner console to inject a real-time clinical prompt: *"Hypoxia during ascent"*.
  9. Mobile console verifies the resulting TDL triage and cooling/oxygen response in real time.
- **Expected Outcome**: Effortless demonstration evaluation with zero configuration.

---

### UC-05: Emergency Stop & Hard System Lock
- **Actor**: Mission Administrator (`admin`)
- **Primary Goal**: Immediately abort an errant simulation and prevent unauthorized restarts until safety verification.
- **Preconditions**: A simulation is running on the workstation.
- **Main Flow**:
  1. An anomalous condition is observed.
  2. Admin navigates to `/admin` or clicks the global **EMERGENCY STOP** button.
  3. Backend receives `POST /api/admin/emergency-stop`.
  4. Server-side session manager immediately aborts the active session, sets state to `aborted`, and activates a global hardware lock flag `emergency_stop_active = true`.
  5. Operator controls are disabled; any subsequent session start attempt returns HTTP 423 Locked.
  6. System records an immutable Audit Log entry: *"Emergency stop initiated by admin"*.
  7. Admin reviews diagnostic telemetry and clicks **Release Emergency Stop**.
  8. Normal operations are safely restored.
- **Expected Outcome**: Critical safety containment guaranteed at the architectural level.
