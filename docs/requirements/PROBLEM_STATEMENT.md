# ASTRA — Problem Statement & Scientific Rationale
**Project**: ASTRA (Autonomous Spaceflight Telemetry & Reliability Architecture)  
**Track**: NASA Space Apps Challenge 2026: *"Create Health Monitoring Software for Astronauts on Space Missions"*  
**Author**: Gravity Brains / ASTRA Pioneers Engineering & Medical Team  
**Grounded in**: NASA Human Research Roadmap (HRR) Gaps Medical-701 & Med10; NASA-STD-3001  

---

## 1. Background & Mission Context

As humanity prepares for long-duration deep-space exploration under the Artemis and Mars surface exploration architectures, mission operations will undergo a fundamental paradigm shift. In all human spaceflight history to date—Mercury, Gemini, Apollo, Skylab, the Space Shuttle, and the International Space Station (ISS)—astronauts have operated in low Earth orbit or lunar vicinity with continuous, near-instantaneous telemetry links to ground-based flight surgeons.

On a 500-day Mars surface exploration mission situated at Jezero Crater:
- **Orbital Distance**: Earth and Mars vary from 55 million kilometers (at perihelic opposition) to 401 million kilometers (at solar conjunction).
- **One-Way Latency**: Light-speed electromagnetic communications experience a propagation delay ranging from **3.1 minutes to 22.3 minutes** each way (**6.2 to 44.6 minutes round-trip**).
- **Solar Conjunction Blackouts**: During solar conjunction (~every 26 months), direct line-of-sight communication is entirely severed for approximately two continuous weeks due to solar plasma radio interference.

During these extended phases of Earth disconnection, crew survival depends entirely on **Earth-Independent Medical Operations (EIMO)**.

---

## 2. The Core Problem

When an astronaut conducts an Extravehicular Activity (EVA) on the surface of Mars, their life depends on continuous monitoring of physiological vitals (heart rate, SpO2, core body temperature, respiration rate) and spacesuit life-support telemetry (suit pressure, oxygen partial pressure, ambient CO2, cooling loop temperature, and radiation dose rate).

Under real spaceflight conditions, **sensor systems are vulnerable to physical distortion, mechanical failure, and severe environmental noise**. 

The fundamental problem is twofold:

1. **The Communication Latency Barrier**: Earth-based flight surgeons cannot provide real-time diagnosis or intervention during acute life-threatening emergencies. If an astronaut experiences an explosive decompression, acute hypoxia, or hyperthermia, waiting 30 minutes for a ground instruction is fatal.
2. **The Sensor Reliability Paradox**: Traditional medical monitoring software assumes that any numerical value received from an analog-to-digital converter represents physiological ground truth. In spaceflight, **a plausible value is NOT a valid value**. Mechanical motion, perspiration, temperature extremes, and microgravity fluid shifts produce signals that mimic lethal clinical pathologies.

---

## 3. Sensor Reliability Challenges in Spaceflight

Drawing from documented spaceflight clinical data (Apollo bioinstrumentation reports, Skylab operational medicine logs, and ISS biomedical telemetry):

### 3.1 Electrode Detachment & Sweating Artifacts (ECG)
- **Physical Mechanism**: Inside an EVA spacesuit, astronauts perform intense metabolic work (up to 450–500 Watts). Despite the Liquid Cooling and Ventilation Garment (LCVG), profuse perspiration accumulates on the thoracic epidermis.
- **Sensor Impact**: Silver/silver-chloride (Ag/AgCl) electrode paste hydrates and dissolves, causing contact impedance to surge from nominal $5\text{ k}\Omega$ to over $100\text{ k}\Omega$.
- **Pathological Mimicry**: Electrode movement against damp skin produces baseline wander and sharp electrical artifacts that algorithmic QRS detectors misclassify as Ventricular Tachycardia ($VT$) or Ventricular Fibrillation ($VF$).

### 3.2 Peripheral Vasoconstriction & Motion Artifacts (PPG / SpO2)
- **Physical Mechanism**: Martian ambient temperatures reach $-120^\circ\text{C}$. Even with heated spacesuit gloves, peripheral microvasculature constricts (vasoconstriction), drastically reducing the pulsatile arterial blood volume in the fingertip.
- **Sensor Impact**: Dual-wavelength optical photoplethysmography (660 nm / 940 nm) loses its AC pulsatile waveform. Vigorous hand grasping of Martian core drills or geological hammers shifts the probe optical path.
- **Pathological Mimicry**: The modulation ratio $R = \frac{(AC/DC)_{660}}{(AC/DC)_{940}}$ degrades, displaying a catastrophic drop in SpO2 from $98\%$ to $65\%$, mimicking fatal acute hypoxia.

### 3.3 Thermal Lag & Environmental Coupling (RTD Temperature Sensors)
- **Physical Mechanism**: Spacesuit layers transition through radical radiative environments (direct solar flux $+120^\circ\text{C}$ on the sunward side, $-125^\circ\text{C}$ in shadowed craters).
- **Sensor Impact**: Platinum Resistance Thermometers (Pt100 / Pt1000) experience thermal conduction lag across suit insulation. A broken sensor leadwire produces an immediate open-circuit reading ($-999^\circ\text{C}$ or infinity).
- **Pathological Mimicry**: A localized heating loop malfunction can cause severe hyperthermia while skin thermistors remain temporarily buffered by sweat evaporation.

### 3.4 Cosmic Radiation & Single-Event Upsets (SEU)
- **Physical Mechanism**: Galactic Cosmic Rays (GCR) and Solar Particle Events (SPE) bombard the Martian surface ($0.64–0.67\text{ mSv/day}$ baseline, surging to $>10\text{ mSv/h}$ during solar storms, as measured by Curiosity MSL/RAD).
- **Sensor Impact**: High-energy heavy ions striking ADC registers or microcontroller memories induce bit-flips, creating instantaneous signal spikes or freezing telemetry buffers ("stuck values").

---

## 4. Risks Associated with Inaccurate Sensor Readings

The consequences of unvalidated sensor data in spaceflight are asymmetrical and severe:

| Failure Mode | Raw Telemetry Output | Real Physical Condition | Operational Catastrophe |
|---|---|---|---|
| **False Positive Alarm** | SpO2 drops to 68%, HR jumps to 180 bpm due to cable strain. | Astronaut is physically healthy; sensor wire has slipped. | Mission commander aborts EVA prematurely, abandons scientific objectives, expends emergency oxygen consumables ($5,000+$ liters), risking secondary hazards. |
| **False Negative Silence** | Sensor buffer freezes on last nominal reading ($98\%$, $72\text{ bpm}$). | Life-support oxygen loop has failed; astronaut is rapidly deoxygenating. | Crew and onboard systems take no action; astronaut suffers hypoxic syncope, irreversible brain injury, or asphyxiation within 180 seconds. |
| **Masked Diagnosis** | Heart rate rises to 145 bpm during heavy drilling; SpO2 reads 97%. | Heat exhaustion and core hyperthermia ($39.2^\circ\text{C}$) developing under high metabolic load. | Treated as ordinary physical exertion rather than an impending heat stroke collapse. |

---

## 5. Limitations of Relying Exclusively on Earth-Based Assistance

| Aspect | Earth-Based Operations (LEO / ISS) | Deep Space Mars Operations (ASTRA Domain) |
|---|---|---|
| **Telemetry Delay** | $< 1\text{ second}$ (TDRSS Satellite constellation) | **14 to 22 minutes one-way** |
| **Diagnostic Authority** | Flight Surgeon at Mission Control Center | **Autonomous on-suit / onboard software** |
| **Consumable Resupply** | 4–8 hours via emergency Soyuz/Dragon de-orbit | **None for 26–36 months** |
| **Telemetry Bandwidth** | Continuous high-definition video + high-rate biometrics | **Constrained interplanetary DSN link; periodic blackouts** |
| **Crew Role** | Astronaut executes ground medical checklist | **Astronaut and software must act as sole clinician** |

---

## 6. ASTRA's Proposed Solution Architecture

ASTRA eliminates reliance on ground support while solving the sensor reliability paradox through a 3-pillar architectural approach:

```
[ Raw Transducer Telemetry ]
           │
           ▼
┌────────────────────────────────────────────────────────┐
│  PILLAR 1: TRUSTED DATA LAYER (TDL)                    │
│  - Layer 1: Boundary & Electrical Consistency Check   │
│  - Layer 2: Rate-of-Change & Derivative Plausibility  │
│  - Layer 3: Cross-Sensor Physiological Consensus       │
│  ==> Computes Trust Score T ∈ [0.0, 1.0]              │
└────────────────────────────────────────────────────────┘
           │
           ├─────────────────────────┐
           │ (T < 0.4: Suppress)     │ (T ≥ 0.7: Verified)
           ▼                         ▼
┌────────────────────────┐  ┌────────────────────────────┐
│ INSTRUMENT FAULT ALARM │  │ PILLAR 2: ML CLINICAL      │
│ "Pulse Ox Cable Slip   │  │ DECISION SUPPORT           │
│  Trust=0.16 — Suppress │  │ - 18-Feature Random Forest │
│  Medical Emergency"    │  │ - NASA-STD-3001 Compliance │
└────────────────────────┘  │ - Sub-ms Offline Inference│
                            └────────────────────────────┘
                                     │
                                     ▼
                            ┌────────────────────────────┐
                            │ PILLAR 3: CLOSED-LOOP      │
                            │ ACTIONS & SIMULATION       │
                            │ - Real-time LCVG Cooling   │
                            │ - Secondary O2 Valve Open  │
                            │ - Emergency Abort Lock     │
                            └────────────────────────────┘
```

1. **Deterministic Verification Before Medical Interpretation**: The Trusted Data Layer mathematically separates sensor health from human health. Medical warning rules are inhibited while a sensor's trust score indicates a hardware anomaly.
2. **Physiological Cross-Consensus**: A true drop in SpO2 is coupled with compensatory increases in heart rate and ventilation rate. A drop in SpO2 with a steady resting heart rate is rejected as an optical probe displacement.
3. **Offline Machine Learning with Deterministic Fallbacks**: Clinical triage runs locally via a lightweight Random Forest model, with a deterministic rules-based backup that operates without any neural network or network API.

---

## 7. Scope & Boundaries of the Prototype

- **Demonstration Scope**: ASTRA models astronaut vitals, spacesuit telemetry, sensor faults, and Mars surface navigation within a high-fidelity simulation environment.
- **Physical Accuracy**: Transducer equations reflect published metrological standards (IEC 60751, piezoresistive Wheatstone bridges, bubble dosimetry).
- **Clinical Accuracy**: Warning thresholds, metabolic workloads, and diagnostic protocols are directly mapped to **NASA-STD-3001 Vol 1 Rev C & Vol 2 Rev F**, **EVA-EXP-0034**, and published aerospace medical literature (NEJM, JAMA, npj Microgravity).
- **Prototype Status**: ASTRA is not a flight-certified system or FDA-approved medical device. It serves as an architectural proof-of-concept demonstrating how autonomous medical telemetry verification can be achieved for deep-space planetary missions.
