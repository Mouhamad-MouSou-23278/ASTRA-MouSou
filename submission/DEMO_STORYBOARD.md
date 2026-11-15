# NASA Space Apps Challenge 2026 — Demonstration Storyboard & Pitch Deck

This document outlines the **30-Second Video Pitch Storyboard** and the **7-Slide Presentation Deck** for jury evaluation.

---

## 1. 30-Second Video Pitch Storyboard

| Time | Visual on Screen | Spoken Audio / Narration | Key Takeaway |
|---|---|---|---|
| **00:00 - 00:05** | Dramatic 3D view of Mars Jezero Crater and Perseverance Rover. Comm delay graphic: "Earth ↔ Mars: 22 Min Delay". | *"On Mars, you are 22 light-minutes from Earth. If a medical crisis strikes, Houston cannot save you in time."* | The Problem: 22-minute communication latency barrier. |
| **00:05 - 00:12** | Telemetry HUD shows SpO2 diving to 64%. Traditional system flashes Red Alarm: "EMERGENCY OXYGEN FLUSH". ASTRA TDL activates: Trust drops to 0.16; flags "MOTION ARTIFACT". | *"Worse, space is brutal on sensors. A slipping probe mimics suffocation. In a naive system, an emergency oxygen purge wastes critical suit consumables."* | The Dilemma: Sensor false alarms endanger missions. |
| **00:12 - 00:20** | Split screen: TDL mathematical curves + 18-Feature Random Forest ML triage classifying true hypoxia vs false alarm with 95.15% accuracy. | *"Enter ASTRA. Our deterministic Trusted Data Layer weeds out sensor noise, while our 18-feature clinical ML engine diagnoses true emergencies in milliseconds."* | The Solution: TDL + Clinical ML Triage. |
| **00:20 - 00:26** | Operator holds up smartphone, scans QR code on monitor, types "EVA heat stroke", and watches real-time LCVG cooling countermeasure trigger. | *"Doctors can inject real-time scenarios from any phone via QR. Works 100% offline, bilingual in English and Arabic."* | Key Features: Mobile QR pairing, offline-first, bilingual. |
| **00:26 - 00:30** | ASTRA logo, Gravity Brains team badge, NASA Space Apps 2026 logo, and GitHub repository URL. | *"ASTRA: Trustworthy health monitoring for humanity's next giant leap. Built for Mars."* | Call to Action / Impact. |

---

## 2. 7-Slide Pitch Deck Structure

### Slide 1: Title & Challenge Hook
- **Title**: ASTRA — Trustworthy Astronaut Health Monitoring & Mars Mission Simulation
- **Team**: Gravity Brains (ASTRA Pioneers) — NASA Space Apps Challenge 2026
- **Hook**: How do astronauts manage life-threatening medical emergencies when Earth is 22 minutes away?

### Slide 2: The Core Problem — Comms Latency & Sensor Vulnerability
- Earth-Mars speed-of-light delay (6–44 min round-trip).
- Extreme EVA environment causes sensor detachment, thermal lag, and motion artifacts.
- The False Alarm Trap: alert fatigue or catastrophic consumable depletion.

### Slide 3: The Innovation — Trusted Data Layer (TDL)
- Deterministic 3-stage physics and mathematical verification pipeline:
  1. Biological rate-of-change velocity gating.
  2. Dynamic Gaussian likelihood scoring.
  3. Multi-sensor cross-divergence (e.g., SpO2 drop without heart rate response = probe artifact).
- Result: 100% false alarm suppression across 20 audited spaceflight scenarios.

### Slide 4: Clinical Decision Support & 18-Feature ML Triage
- Random Forest model trained on 10,000 synthetic EVA telemetry records (95.15% accuracy).
- Direct mapping to NASA-STD-3001 clinical countermeasures.
- Pre-simulation predictive risk engine for astronaut EVA clearance.

### Slide 5: Physical Lab & Doctor Mobile QR Pairing
- 3D spacesuit anatomical sensor mapping with Callendar–Van Dusen Pt100 RTD curves.
- Instant zero-install mobile pairing via QR code.
- Natural-language emergency scenario injection for training and testing.

### Slide 6: Authentic 3D Mars Operations & Inclusivity
- Three.js 3D Jezero Crater topography derived from authentic NASA HiRISE stereo DTM (`ESP_045994_1985`).
- 3D models of Perseverance rover and Ingenuity helicopter.
- Full English and Arabic (RTL) bilingual support + 5 tactical lighting themes.

### Slide 7: Verification, Open-Source Release & Road Ahead
- 97 automated backend tests passing with 100% success rate.
- TypeScript static type verification & clean production Vite build.
- 100% offline-capable, containerized with Docker, ready for public GitHub release.
- Compliance with NASA Human Research Roadmap (EIMO Gaps Medical-701 & Med10).
