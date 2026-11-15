# ASTRA — Scientific Sources, Citations & Claim Traceability Matrix

> **NASA Space Apps Challenge 2026**: Create Health Monitoring Software for Astronauts on Space Missions  
> **Team**: Gravity Brains (ASTRA Pioneers)  
> **Document Purpose**: Complete verification of scientific literature, standards, datasets, and claim-to-evidence mapping for the ASTRA platform presentation (`ASTRA_NASA_SpaceApps_2026.pptx`).

---

## 1. Official NASA & CSA Challenge Resources

The five mandatory resources defined by the NASA Space Apps Challenge resource page are cataloged below, along with their scientific content and role in ASTRA:

| Resource Title | Agency / Publisher | Official URL | Role in ASTRA Architecture |
|---|---|---|---|
| **1. 5 Hazards of Human Spaceflight** | NASA Human Research Program | [nasa.gov/hrp/hazards](https://www.nasa.gov/hrp/hazards/) | Establishes the multi-hazard framework (Radiation, Isolation, Distance, Altered Gravity, Hostile Environments); guides ASTRA's environmental context inputs (Slide 2, Slide 7). |
| **2. Risks of Human Spaceflight** | NASA Human Research Program | [nasa.gov/hrp/risks](https://www.nasa.gov/hrp/risks/) | Identifies specific physiological failure modes and justifies solving NASA Gap Medical-701 & Med10 (Earth-Independent Medical Operations) (Slide 2, Slide 5). |
| **3. Ongoing HRP Research in Space** | NASA Human Research Program | [nasa.gov/hrp/ongoing-hrp-research](https://www.nasa.gov/hrp/ongoing-hrp-research/) | Informs longitudinal health indicators, exercise countermeasure monitoring, and baseline vital sign variability (Slide 3, Slide 7). |
| **4. Monitoring Radiation for Astronaut Health** | Canadian Space Agency (CSA) | [asc-csa.gc.ca/eng/news/articles/2026/2026-02-26-monitoring-radiation-astronaut-health.asp](https://www.asc-csa.gc.ca/eng/news/articles/2026/2026-02-26-monitoring-radiation-astronaut-health.asp) | Calibrates dosimeter physics modeling, acute solar particle event thresholds (> 5 mSv/h), and bubble detector simulation (Slide 4, Slide 6). |
| **5. Why Do We Conduct Science Experiments in Space?** | Canadian Space Agency (CSA) | [asc-csa.gc.ca/eng/iss/science/why-do-we-conduct-science-experiments-in-space.asp](https://www.asc-csa.gc.ca/eng/iss/science/why-do-we-conduct-science-experiments-in-space.asp) | Provides scientific rationale for cephalad fluid shift dynamics, cardiovascular deconditioning, and microgravity bone/muscle loss (Slide 2, Slide 6). |

---

## 2. Technical Standards & Authentic Datasets

| Resource / Standard | Source Authority | Reference / DOI | Usage in ASTRA |
|---|---|---|---|
| **NASA-STD-3001 Vol 1 Rev C** | NASA Technical Standards System | NASA Technical Standard (Crew Health) | Establishes medical thresholds, clinical hypoxia protocols, and alert limits (DEMO-RULE-01). |
| **NASA-STD-3001 Vol 2 Rev F** | NASA Technical Standards System | NASA Technical Standard (Human Factors & Habitability) | Informs environmental ranges: cabin/suit pressure, CO2 limits, and thermal cooling requirements. |
| **HiRISE Stereo DTM (045994_1985)** | NASA / JPL / USGS / Univ. of Arizona | [uahirise.org DTM 045994_1985](https://www.uahirise.org/dtm/dtm.php?ID=ESP_045994_1985) | Authentic 1 m/pixel 3D terrain elevation for Jezero Crater Mars exploration visualization (Slide 6). |
| **MSL/RAD Surface Radiation Data** | NASA Planetary Data System | Hassler et al., *Science* (2014) 343:1244791 | Surface dose rate baseline calibration (0.64–0.67 mSv/day) at Mars surface. |
| **In-Flight Venous Thrombosis Studies** | NEJM & JAMA Network Open | Auñón-Chancellor et al., *NEJM* (2020); Marshall-Goebel et al., *JAMA* (2019) | Clinical justification for jugular vein flow stasis and Doppler ultrasound simulation scenarios. |
| **NASA Open Science Data Repository (OSDR)** | NASA Ames Research Center | [science.nasa.gov/biological-physical/data/osdr/](https://science.nasa.gov/biological-physical/data/osdr/) | Reviewed as a scientific resource. **Explicit Disclaimer**: No claim of model training on OSDR continuous telemetry is made. |

---

## 3. Claim-to-Evidence Traceability Matrix

| Slide | Specific Claim Made in Presentation | Authoritative Source / Standard | Implementation Verification in Codebase | Evidence Status |
|---|---|---|---|---|
| **Slide 1** | ASTRA is an offline-capable health monitoring prototype for Mars missions. | NASA Human Research Roadmap (EIMO Gaps Med-701 & Med10) | Verified in `backend/app/main.py`, zero external network requirements in local mode. | **VERIFIED IMPLEMENTED** |
| **Slide 2** | Earth-Mars comms latency is 6 to 44 minutes round-trip. | Celestial mechanics / NASA Deep Space Network specifications | Integrated into communication delay models in `backend/astra_sim/`. | **VERIFIED FACT** |
| **Slide 2** | Physical sensors suffer cold vasoconstriction and motion artifacts in space suits. | NASA EVA Bioinstrumentation Technical Reports & Team Research | Modeled in `backend/astra_sim/physics_models/` and verified in tests. | **VERIFIED IMPLEMENTED** |
| **Slide 3** | ASTRA uses a 3-layer architecture: Data, Trust Layer, and Protocol Decision Support. | ASTRA System Architecture Specification | Documented and implemented across `backend/app/services/`. | **VERIFIED IMPLEMENTED** |
| **Slide 3** | 18-Feature Random Forest classifier achieves 95.15% validation accuracy. | ML model training logs on 10,000 synthetic records | Verified in `backend/app/services/medical_ml.py` and `test_medical_ml.py`. | **VERIFIED (SYNTHETIC DATA)** |
| **Slide 4** | The Trust Layer uses Gaussian likelihood and temporal derivative gating to reject artifacts. | Mathematical formulation: $T = \exp(-\Delta x^2 / 2\sigma^2)$ | Verified in `backend/app/services/trust_layer.py` and 19 unit tests. | **VERIFIED IMPLEMENTED** |
| **Slide 5** | AI/ML decisions are strictly governed by fixed rules and cannot override safety bounds. | System safety architecture | Boundary rules in `backend/app/services/rules.py` override probabilistic outputs. | **VERIFIED IMPLEMENTED** |
| **Slide 5** | Rule DEMO-RULE-01 executes NASA-STD-3001 Vol 1 Rev C Hypoxia protocols. | NASA-STD-3001 Vol 1 Rev C, Section 6.2 | Implemented in `backend/app/services/simulation.py` (Scenario #2). | **VERIFIED IMPLEMENTED** |
| **Slide 6** | Jezero Crater 3D terrain is rendered from authentic NASA HiRISE stereo DTM. | NASA HiRISE DTM `ESP_045994_1985` | Terrain assets stored in `backend/assets/terrain/` and rendered via Three.js. | **VERIFIED IMPLEMENTED** |
| **Slide 6** | Mobile QR pairing allows natural-language scenario injection on local Wi-Fi. | WebSockets + Session QR tokens | Verified in `test_api_auth_rbac.py` and `test_planner_assistant.py`. | **VERIFIED IMPLEMENTED** |
| **Slide 7** | ASTRA passes 97 automated tests with 100% success rate. | Pytest test execution logs | 97 passed in 124.7s on Python 3.11 (`backend/tests/`). | **VERIFIED QUALITY GATE** |
| **Slide 7** | ASTRA is an engineering decision-support prototype, NOT an FDA/CE medical device. | Regulatory disclaimer | Explicitly stated across all documentation and slide notes. | **VERIFIED DISCLAIMER** |

---

## 4. Explicit Negative Disclaimers (What ASTRA Does NOT Claim)

To preserve scientific integrity during jury evaluation, ASTRA strictly enforces the following negative claims:
1. **No Medical Device Certification**: ASTRA is not certified by the FDA, EMA, or any national health agency as a medical device for terrestrial clinical diagnosis.
2. **No NASA Endorsement**: ASTRA was developed by Team Gravity Brains as an independent submission for the NASA Space Apps Challenge 2026. No official NASA endorsement, flight qualification, or procurement contract is claimed.
3. **Synthetic Telemetry Disclosure**: All real-time telemetry streams and machine learning training datasets (`data/nasa_eva_medical_telemetry.csv`) are mathematically modeled and synthetically generated based on NASA literature. No actual astronaut protected health information (PHI) was acquired or exposed.
4. **No Training on OSDR Telemetry**: NASA OSDR was thoroughly reviewed as an open science resource; ASTRA does not falsely claim to have trained deep neural networks on continuous wearable OSDR data.
5. **No Unconstrained AI**: Large Language Models in ASTRA are used solely for explanatory natural language interaction and always fall back to a deterministic offline engine. AI never has authority to invent unapproved clinical protocols.
