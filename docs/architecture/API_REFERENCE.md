# ASTRA — API Reference & Endpoints Specification
**Base URL**: `http://localhost:8000/api` (or configured host/port)  
**OpenAPI / Interactive Documentation**: `http://localhost:8000/api/docs` (Swagger UI)  
**Protocol**: HTTP/1.1 REST & WebSocket (RFC 6455)  
**Authentication**: Bearer JWT (`Authorization: Bearer <token>`) or Viewer Token (`X-Viewer-Token: <token>`)  

---

## 1. Authentication & System Endpoints (`auth.py` & `main.py`)

### 1.1 `POST /api/auth/login`
- **Purpose**: Authenticate user credentials and return a signed HMAC-SHA256 JWT access token.
- **Access**: Public (throttled by IP rate limiter).
- **Request Body**:
  ```json
  {
    "username": "operator",
    "password": "astra-operator-2026"
  }
  ```
- **Responses**:
  - `200 OK`: `{"access_token": "eyJhbGciOi...", "token_type": "Bearer", "role": "operator", "username": "operator", "full_name": "Test Operator"}`
  - `401 Unauthorized`: `{"detail": "Incorrect username or password"}`
  - `429 Too Many Requests`: `{"detail": "Too many failed login attempts"}`

### 1.2 `GET /api/auth/me`
- **Purpose**: Return profile information and assigned role for the authenticated caller.
- **Access**: Authenticated (`admin`, `physical`, `medical`, `operator`, `viewer`).
- **Responses**:
  - `200 OK`: `{"id": 4, "username": "operator", "role": "operator", "full_name": "Test Operator", "is_active": true}`

### 1.3 `GET /api/health`
- **Purpose**: Lightweight operational liveness probe for Docker and orchestration healthchecks.
- **Access**: Public.
- **Responses**:
  - `200 OK`: `{"status": "ok", "app": "ASTRA", "version": "1.0.0"}`

### 1.4 `GET /api/system/info`
- **Purpose**: Public runtime state used by the login screen and viewer interfaces.
- **Access**: Public.
- **Responses**:
  - `200 OK`:
    ```json
    {
      "app": "ASTRA",
      "version": "1.0.0",
      "label": "SIMULATED DATA",
      "ai": "ready",
      "speech": "ready",
      "terrain_available": true,
      "speeds": [1.0, 2.0, 5.0, 10.0],
      "database": "sqlite",
      "demo_login": true
    }
    ```

---

## 2. Administration Endpoints (`admin.py`)

### 2.1 `GET /api/admin/users`
- **Purpose**: List all system accounts.
- **Access**: `admin`.
- **Response**: `200 OK` `[{"id": 1, "username": "admin", "role": "admin", "is_active": true, ...}]`

### 2.2 `POST /api/admin/users`
- **Purpose**: Provision a new staff user account.
- **Access**: `admin`.
- **Request Body**: `{"username": "flight_doc", "role": "medical", "full_name": "Dr. Sarah", "password": "SecurePassword123"}`
- **Response**: `201 Created`

### 2.3 `POST /api/admin/emergency-stop`
- **Purpose**: Immediate hard system abort; halts all running sessions and locks controls.
- **Access**: `admin`.
- **Response**: `200 OK` `{"status": "emergency_stop_engaged", "aborted_sessions": 1}`

### 2.4 `POST /api/admin/release-stop`
- **Purpose**: Release the hard emergency stop lock to restore normal operation.
- **Access**: `admin`.
- **Response**: `200 OK` `{"status": "emergency_stop_released"}`

### 2.5 `GET /api/admin/audit`
- **Purpose**: Retrieve historical audit log entries with pagination.
- **Access**: `admin`.
- **Query Params**: `limit=100`, `offset=0`
- **Response**: `200 OK` `[{"id": 42, "ts": "2026-11-15T12:00:00", "username": "admin", "action": "user.create", ...}]`

---

## 3. Physical Sensor Lab Endpoints (`physical.py` & `physical_lab.py`)

### 3.1 `GET /api/sensors`
- **Purpose**: Retrieve the spaceflight sensor catalog.
- **Access**: `admin`, `physical`, `medical`, `operator`.
- **Query Params**: `category=physiological`, `status=active`
- **Response**: `200 OK` `[{"id": 1, "key": "spo2_pct", "name": "Pulse Oximeter", "unit": "%", "min_valid": 50.0, "max_valid": 100.0, ...}]`

### 3.2 `POST /api/sensors`
- **Purpose**: Create a new sensor telemetry channel definition with technical specifications.
- **Access**: `physical`.
- **Request Body**:
  ```json
  {
    "key": "skin_rtd_temp",
    "name": "Epidermal Pt1000 RTD Sensor",
    "category": "physiological",
    "unit": "°C",
    "min_valid": 25.0,
    "max_valid": 45.0,
    "accuracy": 0.05,
    "max_rate_per_min": 1.5,
    "technical_specs": {
      "r0": 1000.0,
      "a_coeff": 3.9083e-3,
      "b_coeff": -5.775e-7
    }
  }
  ```
- **Response**: `201 Created`

### 3.3 `POST /api/physical-lab/sensors/{id}/benchmark`
- **Purpose**: Run physics simulation benchmarks on a sensor across temperature extremes.
- **Access**: `physical`.
- **Response**: `200 OK` `{"sensor_key": "skin_rtd_temp", "rmse": 0.012, "non_linearity_pct": 0.04, "standard_compliance": "PASS"}`

### 3.4 `POST /api/physical-lab/ai-agent/chat`
- **Purpose**: Query the Physical Sensor Engineering AI assistant with live catalog context.
- **Access**: `physical`.
- **Request Body**: `{"message": "What is the noise specification for the Pulse Oximeter?"}`
- **Response**: `200 OK` `{"reply": "The PPO-001 Pulse Oximeter has an accuracy specification of ±2%...", "citations": ["NASA-STD-3001"]}`

---

## 4. Medical Decision Center Endpoints (`medical.py`)

### 4.1 `GET /api/medical/instruments`
- **Purpose**: Retrieve NASA flight instrument registry with calibration and maintenance warning histories.
- **Access**: Public / Authenticated.
- **Response**:
  ```json
  {
    "instruments": [
      {
        "instrument_id": "PPO-001",
        "name": "Pulse Oximeter Transducer",
        "current_status": "nominal",
        "total_operating_hours": 1420.5,
        "calibration_date": "2026-08-14"
      }
    ],
    "warnings": []
  }
  ```

### 4.2 `POST /api/medical/pre-sim-risk`
- **Purpose**: Calculate predictive crew medical risk score before an EVA walk.
- **Access**: Public / Authenticated.
- **Request Body**:
  ```json
  {
    "astronaut": {"resting_heart_rate": 72.0, "resting_core_temp": 37.0},
    "planned_eva_hours": 6.5,
    "expected_metabolic_watts": 350.0
  }
  ```
- **Response**: `200 OK`
  ```json
  {
    "overall_risk_score": 0.05,
    "risk_level": "LOW",
    "risk_factors": [],
    "recommended_lcvg_cooling_rate": "MEDIUM",
    "nasa_guideline": "NASA-STD-3001 Vol 1 §4.2.1: Pre-EVA crew clinical fitness assessment verified."
  }
  ```

### 4.3 `POST /api/medical/ml-triage`
- **Purpose**: Classify vital signs and TDL trust metrics through the 18-feature Random Forest engine.
- **Access**: Public / Authenticated.
- **Request Body**:
  ```json
  {
    "heart_rate": 140.0,
    "spo2_pct": 97.0,
    "core_temp_c": 39.5,
    "resp_rate_bpm": 28.0,
    "suit_pressure_kpa": 29.5,
    "co2_mmhg": 3.5,
    "rad_dose_rate_usv": 28.0,
    "spo2_trust": 0.95,
    "hr_trust": 0.95,
    "temp_trust": 0.95,
    "press_trust": 0.98
  }
  ```
- **Response**: `200 OK`
  ```json
  {
    "diagnosis": "HEAT_EXHAUSTION",
    "confidence": 0.92,
    "severity": "critical",
    "title": "Hyperthermia & Heat Exhaustion Alert",
    "actions": [
      "Command LCVG cooling loop to maximum (HIGH Flow)",
      "Halt strenuous physical exertion immediately",
      "Rest in shaded terrain or rover cabin"
    ]
  }
  ```

### 4.4 `GET /api/medical/ml-model`
- **Purpose**: Return current ML Decision Engine status, tree count, and feature importances.
- **Access**: Public / Authenticated.
- **Response**: `200 OK` `{"trained": true, "accuracy": 0.9515, "n_trees": 7, "feature_importances": {...}}`

### 4.5 `POST /api/medical/ml-retrain`
- **Purpose**: Retrain the Random Forest model on the updated telemetry dataset.
- **Access**: `medical`.
- **Response**: `200 OK` `{"trained": true, "accuracy": 0.9515, "samples": 10000}`

---

## 5. Mission Simulation & Telemetry Streaming (`mission.py`)

### 5.1 `POST /api/plans/generate`
- **Purpose**: Convert a natural language scenario prompt into a validated, bounded simulation plan.
- **Access**: `operator`.
- **Request Body**: `{"prompt": "Traverse to Delta Scarp, pace moderate, return before sunset."}`
- **Response**: `200 OK` `{"plan": {"name": "Delta Scarp Traverse", "steps": [...]}}`

### 5.2 `POST /api/sessions`
- **Purpose**: Create a new simulation session from a validated plan or scenario.
- **Access**: `operator`.
- **Request Body**: `{"scenario_id": 1, "seed": 42}`
- **Response**: `201 Created` `{"id": 3, "status": "planned", "seed": 42}`

### 5.3 `POST /api/sessions/{id}/control`
- **Purpose**: Dispatch state controls to an active simulation session.
- **Access**: `operator`.
- **Request Body**: `{"action": "start"}` (one of: `start`, `pause`, `resume`, `stop`, `seek`, `speed`)
- **Response**: `200 OK` `{"status": "running"}`

### 5.4 `POST /api/sessions/{id}/viewer-token`
- **Purpose**: Generate a session-scoped QR access token for mobile viewing.
- **Access**: `operator`.
- **Response**: `200 OK` `{"token": "vt_98ab71c...", "expires_at": "...", "url": "http://192.168.1.10:8000/sessions/3?token=vt_98ab71c..."}`

### 5.5 `WebSocket /api/sessions/{id}/ws`
- **Purpose**: Bidirectional real-time telemetry stream operating at 10 Hz.
- **Access**: Authenticated JWT or valid `token` query parameter.
- **Frame Schema**:
  ```json
  {
    "type": "telemetry",
    "mission_time_s": 245.5,
    "astronaut": {
      "heart_rate": 74.2,
      "spo2": 98.1,
      "core_temp": 37.05,
      "resp_rate": 14.1
    },
    "suit": {
      "suit_pressure": 29.58,
      "co2_partial_pressure": 2.1,
      "radiation_rate": 28.4
    },
    "trust": {
      "spo2_trust": 0.98,
      "hr_trust": 0.99,
      "temp_trust": 0.98,
      "is_artifact": false
    },
    "position": {"x": 142.5, "y": -84.2, "elevation": -2514.0},
    "active_warnings": []
  }
  ```
