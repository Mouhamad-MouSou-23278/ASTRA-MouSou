# Trusted Data Layer (TDL) Architecture & Mathematical Specification
## طبقة موثوقية البيانات: الهيكل الهندسي، المعادلات الرياضية، وحالات الاختبار

---

## 1. Overview & Operational Problem
During human Mars extravehicular activity (EVA), astronauts operate under extreme environmental constraints:
- **Mars Surface Conditions**: Atmospheric pressure ~610 Pa (0.088 psi) of pure $\text{CO}_2$, ambient surface temperatures from $-125^\circ\text{C}$ to $+20^\circ\text{C}$, high cosmic/solar ionizing radiation flux (0.64 mGy/day background, up to 12.0 mSv/h during Solar Particle Events), and electrostatically charged, abrasive iron-oxide perchlorate dust.
- **Sensor Vulnerabilities**: Extreme thermal cycling induces junction drift in thermistors/RTDs; mechanical strain on umbilical harnesses causes open-circuit transient dropouts; astronaut vigorous locomotion introduces motion artifacts in optical pulse oximeters (photoplethysmography); and electromagnetic interference (EMI) from suit life support blowers introduces high-frequency noise.
- **Communication Blackout**: Earth-Mars round-trip signal delay is **14 to 22 minutes** ($c = 300,000 \text{ km/s}$, distance $0.5 \text{ to } 2.7 \text{ AU}$). A flight surgeon in Mission Control Houston cannot intervene in real-time during a medical emergency.
- **The Risk of False Positives**: An unverified SpO2 drop from 98% to 65% caused by a displaced optical cuff could trigger an automated high-pressure pure oxygen suit purge. This wastes critical consumables, risks hyperoxia, and distracts the crew during hazardous surface navigation.

**The Solution**: The **Trusted Data Layer (TDL)** sits between raw physical transducers and the Medical Machine Learning Classifier. It evaluates physical feasibility, rate-of-change, temporal consistency, and cross-sensor physiological correlations before passing telemetry to the decision engine.

---

## 2. Mathematical Formulations

### 2.1. Gaussian Likelihood Trust Scoring
For any physical observation $y_{\text{obs}}(t)$ with expected nominal/model value $\mu(t)$ and sensor measurement standard deviation $\sigma_{\text{spec}}$ (derived from instrument manufacturer specifications and calibration certificates):

$$\text{Residual: } r(t) = |y_{\text{obs}}(t) - \mu(t)|$$

The base Gaussian Trust Score $S_{\text{gauss}} \in [0.0, 1.0]$ is defined as:

$$S_{\text{gauss}}(t) = \exp\left( -0.5 \left( \frac{r(t)}{k \cdot \sigma_{\text{spec}}} \right)^2 \right)$$

where $k \ge 1.0$ is an adaptive tolerance factor dynamically scaled based on astronaut metabolic work rate:
$$k = 1.0 + \alpha \cdot \frac{\dot{Q}_{\text{metabolic}}}{\dot{Q}_{\text{max}}}$$

### 2.2. Rate-of-Change & Temporal Derivative Gate
Biological and physical state variables have finite physiological time constants. The first temporal derivative is evaluated against physical boundary thresholds:

$$\dot{y}(t) = \frac{y_{\text{obs}}(t) - y_{\text{obs}}(t - \Delta t)}{\Delta t}$$

If $|\dot{y}(t)| > \dot{y}_{\text{phys\_limit}}$, a gradient penalty factor $P_{\text{rate}} \in [0.1, 0.5]$ is applied:
$$S_{\text{rate}}(t) = \begin{cases} 
1.0 & \text{if } |\dot{y}(t)| \le \dot{y}_{\text{phys\_limit}} \\
\max\left(0.05, 1.0 - \beta \frac{|\dot{y}(t)| - \dot{y}_{\text{phys\_limit}}}{\dot{y}_{\text{phys\_limit}}}\right) & \text{if } |\dot{y}(t)| > \dot{y}_{\text{phys\_limit}}
\end{cases}$$

*Example*: Heart rate cannot change from 75 bpm to 195 bpm in $\Delta t = 1.0\text{ s}$ ($\dot{y} = 120\text{ bpm/s}$ exceeds physiological limit of $8\text{ bpm/s}$), immediately triggering an artifact alert.

### 2.3. Cross-Sensor Multi-Modal Fusion & Divergence Scoring
True physiological changes cause synchronized, cross-correlated changes across multiple independent sensor channels according to NASA-STD-3001 physiological models:
- **Hypoxia Coupling**: When true $\text{SpO}_2$ drops below $88\%$, human sympathetic response causes a compensatory increase in Heart Rate ($\text{HR} \uparrow$) and Respiration Rate ($\text{RR} \uparrow$).
- **Thermal Coupling**: Elevated core body temperature ($T_{\text{core}} > 38.0^\circ\text{C}$) must correlate with elevated metabolic expenditure ($\dot{Q} > 400\text{ W}$) and sweat production/LCVG heat rejection.

We define the Cross-Sensor Physiological Divergence Index ($D_{\text{cross}}$):

$$D_{\text{cross}}(\text{SpO}_2, \text{HR}) = \frac{\Delta \text{SpO}_2}{\sigma_{\text{SpO}_2}} - \gamma \cdot \frac{\Delta \text{HR}}{\sigma_{\text{HR}}}$$

If $\Delta \text{SpO}_2 = -35\%$ while $\Delta \text{HR} = 0$, $D_{\text{cross}}$ exceeds the divergence boundary, identifying the signal as an optical sensor detachment rather than clinical hypoxia.

### 2.4. Final Trust-Weighted Telemetry Vector
The final composite trust score for each telemetry channel $i$ is:

$$S_{\text{trust}}^{(i)}(t) = S_{\text{gauss}}^{(i)}(t) \cdot S_{\text{rate}}^{(i)}(t) \cdot \left(1.0 - \omega \cdot D_{\text{cross}}^{(i)}(t)\right)$$

The telemetry vector fed into the Machine Learning Medical Classifier is trust-weighted:

$$\mathbf{x}_{\text{ML}}(t) = \mathbf{y}_{\text{obs}}(t) \odot \mathbf{S}_{\text{trust}}(t)$$

When $S_{\text{trust}}^{(i)} < 0.40$, the channel is flagged as `COMPROMISED_UNTRUSTED`, suppressing false emergency responses and triggering instrument recalibration or crew repositioning prompts.

---

## 3. The 20 TDL Simulation Scenarios
ASTRA includes 20 comprehensive automated test scenarios validating the TDL pipeline:

| ID | Scenario Name | Target Sensor | Injected Fault / Phenomenon | Raw Value | TDL Decision | Trust Score | Safety / Clinical Action |
|:---|:---|:---|:---|:---|:---|:---|:---|
| **01** | SpO2 Optical Probe Slip | Optical Finger PPG | Motion artifact / displacement | 64% SpO2 | **FLAG_ARTIFACT** | 0.16 | Suppress O2 purge; prompt cuff reseat |
| **02** | True Severe Hypoxia | Optical Finger PPG | Real O2 supply line restriction | 78% SpO2 (HR 145) | **CONFIRM_EMERGENCY** | 0.94 | Emergency 100% O2 suit flood, abort EVA |
| **03** | RTD Wire Break / Open Circuit | Core Temp RTD | Leadwire severed on suit joint | -999.0°C | **HARDWARE_DISCONNECT**| 0.00 | Fallback to secondary ear thermistor |
| **04** | Genuine Hyperthermia | Dual Thermistor | LCVG chiller pump failure | 39.2°C (Metab 480W)| **CONFIRM_EMERGENCY** | 0.96 | Maximum cooling flow, abort to airlock |
| **05** | ECG Lead Detachment | Chest Electrodes | Adhesion failure from sweat | 0 bpm (Flatline) | **LEAD_OFF_DETECTED** | 0.05 | Suppress asystole alarm; switch to PPG pulse |
| **06** | True Ventricular Tachycardia| Chest Electrodes | Extreme cardiac strain (Apollo 15)| 188 bpm (Irregular) | **CONFIRM_EMERGENCY** | 0.93 | Immediate EVA abort, posture rest, beta-blocker |
| **07** | Suit Pressure Gauge Drift | Piezoresistive | Thermal zero-drift (-60°C) | 2.1 psi (Actual 4.3)| **DRIFT_DETECTED** | 0.32 | Recalibrate offset against backup gauge |
| **08** | Catastrophic Micrometeoroid | Piezoresistive | Rapid depressurization | 1.8 psi (dP/dt high)| **CONFIRM_BREACH** | 0.99 | Deploy secondary emergency O2 bottle |
| **09** | Capnometer Optical Condensation| NDIR CO2 Sensor | Water vapor fogging lens | 14.2 mmHg CO2 | **OPTICAL_FOGGING** | 0.22 | Activate sensor heating element |
| **10** | LiOH Canister Exhaustion | NDIR CO2 Sensor | Genuine metabolic CO2 buildup | 11.5 mmHg CO2 (Steady)| **CONFIRM_HYPERCAPNIA**| 0.95 | Switch to backup scrub canister, ingress |
| **11** | Accelerometer High-G Spike | MEMS Tri-axial | Glove tool collision with rock | 45.0 G (1 ms) | **SUPPRESS_TRANSIENT** | 0.10 | Filter noise spike; log mechanical shock |
| **12** | Uncontrolled Rover Roll | MEMS Tri-axial | Vehicle rollover in Jezero sand | Sustained 4.2 G roll | **VEHICLE_CRASH_ALERT**| 0.98 | Ingress beacon, notify mission control |
| **13** | Ambient Temp Sun/Shadow Thermal| Mars Ambient RTD | Fast shadow traversal (0° to -80°C)| -78.4°C | **VALID_ENVIRONMENTAL**| 0.91 | Engage glove & boot electrical heaters |
| **14** | Solar Particle Event (SPE) | MSL/RAD Silicon Diode| Solar flare coronal mass ejection | 11.8 mSv/h dose rate| **CONFIRM_SPE_EVENT** | 0.98 | Immediate EVA abort, enter rover storm shelter |
| **15** | Radiation Sensor Single-Event | MSL/RAD Silicon Diode| Heavy galactic ion latchup | Single clock 999 mSv | **SEU_CORRECTED** | 0.08 | Triple modular redundancy vote & reset |
| **16** | Glycol Pump Cavitation | Flow Turbine | Bubble intrusion in chiller loop | 0.0 L/min (Pump ON) | **CAVITATION_WARNING** | 0.40 | Cycle pump purge valve |
| **17** | Hydration Band Capacitive Bias| Skin Hydration | Hyper-sweating saline film bridge | 100% saturation | **ELECTROLYTE_BIAS** | 0.28 | Re-scale capacitive threshold |
| **18** | True Severe Dehydration | Skin Hydration | Prolonged EVA without drinking | 22% (HR high, Q low)| **CONFIRM_DEHYDRATION**| 0.92 | Command mandatory drink bag fluid intake |
| **19** | Metabolic Spirometry Divergence| Ultrasonic Flow | Saliva droplet deposition | 1100 W (Resting) | **MEASUREMENT_SPOOF** | 0.15 | Invalidate channel; fallback to HR model |
| **20** | Nominal EVA Walking | All Sensors Nominal | Standard science traverse | All within 1σ | **SYSTEM_NOMINAL_GREEN**| 0.99 | Continue mission plan nominal ops |

---

## 4. How to Run the TDL Tests in the ASTRA UI
1. Navigate to the **🧪 TDL Pipeline** tab in the main navigation (or visit `http://localhost:8000/tdl`).
2. **Interactive Single-Case Mode**: Click any scenario button (`#1` to `#20`) to preview sensor telemetry, fault injection, residual computation, and output confidence.
3. **Automated Batch Test Runner**: Click the **▶ Run All 20 TDL Tests** button. The engine steps through all 20 scenarios, runs the Gaussian & rate-check filters, evaluates the ML classification, and displays the **TDL Scoreboard** with pass/fail metrics.
