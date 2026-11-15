# ASTRA — Third-Party Licenses & Intellectual Property Inventory

> [!NOTE]
> This document tracks all open-source libraries, packages, fonts, 3D assets, and scientific datasets utilized by the ASTRA platform.
> **Project License Status**: The core ASTRA project license is currently **PENDING SELECTION / TO BE DETERMINED** by the Gravity Brains development team prior to public repository release. (Recommended candidates: MIT License or Apache 2.0).

---

## 1. Backend Runtime Dependencies (Python)

All backend Python dependencies are distributed under permissive open-source licenses:

| Package | Version Range | License | Primary Purpose | Repository / URL |
|---|---|---|---|---|
| **FastAPI** | `>=0.115,<1.0` | MIT | Web framework & API router | https://github.com/fastapi/fastapi |
| **Uvicorn** | `>=0.30` | BSD-3-Clause | ASGI web server | https://github.com/encode/uvicorn |
| **SQLAlchemy** | `>=2.0.30,<3.0` | MIT | ORM and database engine | https://github.com/sqlalchemy/sqlalchemy |
| **Pydantic** | `>=2.7,<3.0` | MIT | Data validation and settings management | https://github.com/pydantic/pydantic |
| **pydantic-settings** | `>=2.3` | MIT | Environment variable mapping | https://github.com/pydantic/pydantic-settings |
| **PyJWT** | `>=2.8` | MIT | JWT token encoding and signature validation | https://github.com/jpadilla/pyjwt |
| **python-multipart**| `>=0.0.9` | Apache 2.0 | Form data and file upload parsing | https://github.com/Kludex/python-multipart |
| **httpx** | `>=0.27` | BSD-3-Clause | Asynchronous HTTP client for external LLMs | https://github.com/encode/httpx |
| **qrcode** | `>=7.4` | BSD-3-Clause | QR code image generation for mobile pairing | https://github.com/lincolnloop/python-qrcode |
| **psycopg** | `>=3.1` | LGPL-3.0-or-later / BSD-3-Clause (binary wheel) | PostgreSQL driver | https://github.com/psycopg/psycopg |
| **anthropic** | `>=2.0` | MIT | Optional Anthropic Claude SDK | https://github.com/anthropics/anthropic-sdk-python |
| **pytest** | `>=8.0` | MIT | Unit and integration test framework | https://github.com/pytest-dev/pytest |

---

## 2. Frontend Dependencies (JavaScript / TypeScript / React)

| Package | Version Range | License | Primary Purpose |
|---|---|---|---|
| **React** | `^18.3.1` | MIT | Core UI component hierarchy |
| **React DOM** | `^18.3.1` | MIT | Virtual DOM rendering |
| **Three.js** | `^0.160.0` | MIT | 3D WebGL rendering engine (Jezero Crater & Rover) |
| **@react-three/fiber** | `^8.15.0` | MIT | React declarative wrapper for Three.js |
| **@react-three/drei** | `^9.90.0` | MIT | Helper cameras, shaders, and controls for Three.js |
| **Lucide React** | `^0.344.0` | MIT | Vector iconography |
| **Tailwind CSS** | `^3.4.1` | MIT | Utility-first CSS styling framework |
| **Vite** | `^5.1.4` | MIT | Build tool and fast HMR bundler |
| **TypeScript** | `^5.2.2` | Apache 2.0 | Static type safety and developer tooling |

---

## 3. NASA Data & Spacecraft 3D Models

| Asset / Dataset | Source / Attribution | Rights / License | Usage in ASTRA |
|---|---|---|---|
| **HiRISE Stereo DTM (ESP_045994_1985)** | NASA / JPL-Caltech / University of Arizona / USGS | Public Domain (U.S. Government Work - 17 U.S.C. § 105) | Jezero Crater 3D topography and heightmap |
| **Perseverance Rover 3D Model & Textures** | NASA / JPL-Caltech 3D Resources | Public Domain / NASA Guidelines on Media Usage | Interactive 3D visualization on Mars surface |
| **Ingenuity Mars Helicopter Model** | NASA / JPL-Caltech | Public Domain / NASA Guidelines on Media Usage | Aerial reconnaissance 3D visualization |
| **NASA-STD-3001 Volumes 1 & 2** | National Aeronautics and Space Administration | Public Domain (U.S. Gov Technical Standard) | Vital signs threshold calibration and medical protocols |
| **MSL/RAD Gale Crater Radiation Measurements** | Hassler et al. / NASA Planetary Data System | Open Scientific Publication / Open Access | Surface ionizing and GCR radiation model parameters |
| **Radi-N2 Study Data** | Canadian Space Agency (CSA) & NASA | Open Scientific Publication | Neutron bubble dosimeter physical simulation equations |

---

## 4. Fonts and Media Assets

| Asset | Source | License |
|---|---|---|
| **Inter Font Family** | Rasmus Andersson / Google Fonts | SIL Open Font License (OFL 1.1) |
| **JetBrains Mono** | JetBrains / Google Fonts | Apache 2.0 |
| **Noto Sans Arabic** | Google Fonts | SIL Open Font License (OFL 1.1) |

---

## 5. License Compliance Verification

1. All runtime libraries utilized in the production bundle carry permissive licenses (MIT, BSD-3-Clause, Apache 2.0).
2. No GPL-3.0 strictly copyleft libraries are linked into the proprietary application core (the psycopg binary wheel is distributed under LGPL-3.0/BSD with dynamic linking exceptions).
3. NASA media and planetary datasets are public domain works of the United States Government under 17 U.S.C. § 105, utilized in strict compliance with the NASA Media Usage Guidelines. No NASA endorsement of commercial products is claimed or implied.
