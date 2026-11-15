# NASA Space Apps Challenge 2026 — Project Title & Executive Summary

## 1. Project Identifiers

- **Project Title**: ASTRA: Trustworthy Astronaut Health Monitoring & Mars Mission Simulation
- **Arabic Title**: منصة أسترا: المراقبة الصحية الموثوقة لرواد الفضاء ودعم القرار دون اتصال
- **Team Name**: Gravity Brains (ASTRA Pioneers)
- **Challenge Track**: Human Spaceflight & Deep Space Planetary Exploration
- **Challenge Topic**: "Create Health Monitoring Software for Astronauts on Space Missions"
- **NASA Gap Reference**: NASA Human Research Roadmap Medical-701 & Med10 (Earth-Independent Medical Operations - EIMO)
- **Target Environments**: Mars Transit (Microgravity) & Mars Surface — Jezero Crater (0.38G)
- **Standards Compliance**: NASA-STD-3001 Vol 1 Rev C, NASA-STD-3001 Vol 2 Rev F (July 2026), EVA-EXP-0034, IEC 60751

---

## 2. High-Impact Elevator Pitch (30 Seconds)

> During deep-space exploration to Mars, the 22-minute speed-of-light communication delay prevents real-time medical intervention from Earth Mission Control. If an astronaut’s pulse oximeter detaches or experiences motion noise, a traditional telemetry system might trigger an unwarranted emergency oxygen flush — endangering the mission. 
> 
> **ASTRA** solves this challenge through a multi-tier trust architecture: a deterministic **Trusted Data Layer (TDL)** that differentiates physical sensor faults from genuine medical crises, an **18-feature Random Forest clinical triage model** trained on 10,000 synthetic NASA EVA records with **95.15% accuracy**, and an authentic **3D Jezero Crater Mars simulation** driven by NASA HiRISE elevation data. ASTRA empowers astronauts with autonomous, offline-capable clinical decision support when Earth is out of reach.

---

## 3. Executive Summary

### The Challenge
On a 3-year journey to Mars, crew health monitoring is threatened by severe spaceflight hazards: microgravity fluid shifts, cephalad venous thrombosis, ambient spacecraft hypercapnia, cosmic radiation storms, and extreme suit thermal cycling. In deep space, two critical engineering bottlenecks emerge:
1. **The 22-Minute Comms Blackout**: Round-trip communication latency between Earth and Mars ranges from 6 to 44 minutes, rendering terrestrial telemedicine impossible during acute emergencies.
2. **Sensor Vulnerability in Harsh Environments**: Spaceflight sensors (ECG electrodes, optical PPG probes, RTD temperature leads) frequently suffer impedance spikes, motion artifacts, and sweat-induced detachment. In automated systems, false alarms cause alert fatigue or dangerous unneeded countermeasures.

### The ASTRA Solution
ASTRA provides an autonomous, local-first health monitoring and decision-support platform designed for deep-space missions:

1. **Deterministic Trusted Data Layer (TDL)**:
   - Evaluates sensor fidelity using Gaussian likelihood scoring, temporal derivative gating, and cross-sensor physiological plausibility checks.
   - Suppresses sensor detachment false alarms while ensuring true emergencies (such as sudden hypoxia or cardiac arrhythmias) trigger immediate countermeasures.
2. **Clinical Decision Engine & Machine Learning Triage**:
   - An 18-feature Random Forest classifier that categorizes patient status, outputs confidence probabilities, and maps symptoms directly to NASA-STD-3001 treatment protocols.
   - Pre-simulation predictive risk scoring to assess astronaut vulnerability prior to EVA egress.
3. **Physical Sensor Engineering Lab**:
   - Anatomically mapped 3D spacesuit sensor visualization enabling engineers to inspect sensor placements, noise envelopes, and transducer calibration curves.
4. **Doctor & Examiner Mobile QR Pairing**:
   - Real-time mobile tablet/smartphone pairing allowing examiners to inject natural-language scenarios directly into the live telemetry stream.
5. **Authentic 3D Mars Operations**:
   - High-fidelity interactive 3D Jezero Crater topography rendered from authentic NASA HiRISE stereo Digital Elevation Models (`ESP_045994_1985`) and featuring 3D flight hardware (Perseverance rover, Ingenuity helicopter).
