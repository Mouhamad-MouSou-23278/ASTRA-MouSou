# NASA Space Apps Challenge 2026 — NASA Data & Scientific References

> [!IMPORTANT]
> **Prototype Data Disclosure**: All physiological telemetry generated during runtime simulations and contained in the 10,000-sample training dataset is **synthetically modeled** based on published NASA physiological literature. ASTRA contains **no real patient or astronaut protected health information (PHI)**.

---

## 1. NASA Resources & Open Science Data Citations

| ID | Resource Title | Primary Agency / Repository | Scientific Usage in ASTRA |
|---|---|---|---|
| **res_1** | **Spaceflight Standard Measures (SSM)** | NASA Human Research Program (HRP) / LSDA ([lsda.jsc.nasa.gov](https://lsda.jsc.nasa.gov)) | Guided the 18-dimensional feature vector definitions, healthy baseline bounds, and longitudinal cardiovascular metrics (Hardy et al., *npj Microgravity* 2025). |
| **res_2** | **NASA Human Research Roadmap (HRR)** | NASA HRP ([humanresearchroadmap.nasa.gov](https://humanresearchroadmap.nasa.gov)) | Core challenge grounding: specifically addresses Gap **Medical-701** and Gap **Med10** (Earth-Independent Medical Operations - EIMO). |
| **res_3** | **NASA Open Science Data Repository (OSDR / GeneLab)** | NASA Ames Research Center ([osdr.nasa.gov](https://osdr.nasa.gov)) | Consulted for biological spaceflight stress biomarkers and radiation effects. |
| **res_4** | **NASA-STD-3001 Volumes 1 & 2** | NASA Technical Standards System ([standards.nasa.gov](https://standards.nasa.gov)) | Volume 1 Revision C (Crew Health) & Volume 2 Revision F (July 2026): Vital signs thresholds, hypoxia limits, EVA environmental limits, and hypercapnia countermeasures. |
| **res_5** | **In-Flight Venous Thromboembolism Clinical Studies** | New England Journal of Medicine & JAMA Network Open | Clinical basis for Scenarios #16 and #17: Internal Jugular Vein (IJV) flow stasis, retrograde flow, and thrombosis aboard the ISS (Auñón-Chancellor et al., 2020; Marshall-Goebel et al., 2019). |
| **res_6** | **Mars Science Laboratory (MSL/RAD) Surface Radiation** | NASA Planetary Data System (PDS) | Curiosity rover ground radiation dataset calibrating surface galactic cosmic ray (GCR) and solar particle event (SPE) dose rate modeling (Hassler et al., *Science* 2014). |
| **res_7** | **NASA HiRISE Stereo Digital Terrain Model** | NASA / USGS Astrogeology / Univ. of Arizona ([uahirise.org](https://www.uahirise.org/dtm/dtm.php?ID=ESP_045994_1985)) | 1 m/pixel high-resolution 3D topography (`DTM 045994_1985`) for the Jezero Crater Perseverance rover landing site rendering. |
| **res_8** | **Radi-N2 Neutron Field Study on ISS** | Canadian Space Agency (CSA) & NASA ([asc-csa.gc.ca](https://www.asc-csa.gc.ca)) | Physics modeling of superheated bubble dosimeters and neutron dose equivalent calculation. |

---

## 2. Spaceflight Technical Standards Referenced

- **EVA-EXP-0034**: Exploration Extravehicular Activity Avionics Standards (sensor data interfaces and umbilical constraints).
- **IEC 60751**: Industrial platinum resistance thermometers and Callendar–Van Dusen equations for Pt100/Pt1000 RTD sensors.
- **Beer–Lambert Law**: Dual-wavelength (660 nm / 940 nm) optical absorption modeling for pulse oximetry.
