"""HTTP + WebSocket API: authentication, server-side RBAC, role workflows, full mission flow."""
from __future__ import annotations

import time

import pytest
from fastapi.testclient import TestClient

from app.seed_data import DEFAULT_PROMPT, DEMO_USERS

PASSWORDS = {username: password for username, _, _, password in DEMO_USERS}

SHORT_PLAN = {"version": 1, "title": "Short test", "seed": 11, "steps": [
    {"id": "a1", "action": "OPEN_HATCH", "duration_s": 2},
    {"id": "a2", "action": "ASTRONAUT_EXIT", "duration_s": 5},
    {"id": "a3", "action": "WAIT", "duration_s": 3},
]}   # 10 s of activity + 20 s tail = 30 simulated seconds


@pytest.fixture(scope="module")
def client(seeded_db):
    from app.main import app

    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def auth(client):
    tokens = {}
    for role in PASSWORDS:
        r = client.post("/api/auth/login", json={"username": role, "password": PASSWORDS[role]})
        assert r.status_code == 200, r.text
        assert r.json()["user"]["role"] == role
        tokens[role] = {"Authorization": f"Bearer {r.json()['access_token']}"}
    return tokens


def new_session(client, auth, plan=SHORT_PLAN, name="API test") -> str:
    r = client.post("/api/sessions", headers=auth["operator"],
                    json={"name": name, "prompt": "", "plan": plan, "plan_source": "manual"})
    assert r.status_code == 201, r.text
    return r.json()["session"]["id"]


def control(client, auth, sid, action, role="operator", **extra):
    return client.post(f"/api/sessions/{sid}/control", headers=auth[role], json={"action": action, **extra})


def wait_status(client, auth, sid, wanted, timeout=20.0) -> dict:
    deadline = time.time() + timeout
    while time.time() < deadline:
        s = client.get(f"/api/sessions/{sid}", headers=auth["operator"]).json()["session"]
        if s["status"] == wanted:
            return s
        time.sleep(0.1)
    raise AssertionError(f"session never reached '{wanted}' (last: {s['status']} at {s['sim_time']})")


# ------------------------------------------------------------------------ auth
def test_login_rejects_bad_credentials_and_there_is_no_registration(client):
    assert client.post("/api/auth/login", json={"username": "admin", "password": "wrong"}).status_code == 401
    assert client.post("/api/auth/register", json={"username": "x", "password": "y"}).status_code in (404, 405)
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/sensors").status_code == 401


def test_me_returns_the_logged_in_user(client, auth):
    for role, headers in auth.items():
        assert client.get("/api/auth/me", headers=headers).json()["role"] == role


# ------------------------------------------------------------------------ RBAC
SENSOR = {"key": "rbac_probe", "name": "Probe", "category": "spacesuit", "unit": "V",
          "channel": None, "min_valid": 0, "max_valid": 10}
RULE = {"key": "rbac_rule", "name": "Probe rule",
        "clauses": [{"sensor_key": "heart_rate", "operator": ">", "threshold": 200}]}


@pytest.mark.parametrize("role,method,path,body,expected", [
    # Physical Team cannot edit medical data
    ("physical", "post", "/api/rules", RULE, 403),
    ("physical", "post", "/api/conditions", {"key": "c_x", "name": "X"}, 403),
    ("physical", "post", "/api/astronauts", {}, 403),
    # Medical Team cannot edit physical sensors
    ("medical", "post", "/api/sensors", SENSOR, 403),
    ("medical", "post", "/api/failure-signatures", {}, 403),
    ("medical", "post", "/api/custom-fields", {}, 403),
    # Admin reviews but does not edit either catalogue
    ("admin", "post", "/api/sensors", SENSOR, 403),
    ("admin", "post", "/api/rules", RULE, 403),
    # Only the admin manages users, config, audit, emergency stop
    ("operator", "get", "/api/admin/users", None, 403),
    ("physical", "get", "/api/admin/audit", None, 403),
    ("medical", "put", "/api/admin/config/ai_mode", {"value": "auto"}, 403),
    ("operator", "post", "/api/admin/emergency-stop", {"reason": "test"}, 403),
    # Only the operator plans and creates sessions
    ("viewer", "post", "/api/plans/generate", {"prompt": "walk"}, 403),
    ("medical", "post", "/api/sessions", {"name": "x", "plan": SHORT_PLAN}, 403),
    ("admin", "post", "/api/plans/generate", {"prompt": "walk"}, 403),
    # The viewer role is read-only
    ("viewer", "get", "/api/sensors", None, 403),
    ("viewer", "get", "/api/sessions", None, 200),
    # Everyone on the catalogue read list can read
    ("operator", "get", "/api/sensors", None, 200),
    ("admin", "get", "/api/rules", None, 200),
    ("medical", "get", "/api/sensors", None, 200),
    ("physical", "get", "/api/conditions", None, 200),
])
def test_rbac_matrix(client, auth, role, method, path, body, expected):
    kwargs = {"headers": auth[role]}
    if body is not None:
        kwargs["json"] = body
    assert getattr(client, method)(path, **kwargs).status_code == expected


# -------------------------------------------------------------- physical team
def test_sensor_lifecycle_versioning_and_custom_fields(client, auth):
    h = auth["physical"]
    body = {"key": "glove_temp", "name": "Glove temperature", "category": "spacesuit", "unit": "degC",
            "channel": None, "min_valid": -50, "max_valid": 60, "accuracy": 0.2, "max_rate_per_min": 5,
            "custom_fields": {"manufacturer": "ACME Labs", "redundancy": "dual"}}
    r = client.post("/api/sensors", headers=h, json=body)
    assert r.status_code == 201, r.text
    sensor = r.json()
    sid = sensor["id"]
    assert sensor["status"] == "draft" and sensor["version"] == 1
    assert sensor["profiles"][0]["is_default"] and sensor["profiles"][0]["noise_std"] == 0.2
    assert client.post("/api/sensors", headers=h, json=body).status_code == 409        # duplicate key

    # Custom fields are validated against their definitions.
    assert client.put(f"/api/sensors/{sid}", headers=h,
                      json={**body, "custom_fields": {"redundancy": "quadruple"}}).status_code == 422
    assert client.put(f"/api/sensors/{sid}", headers=h,
                      json={**body, "custom_fields": {"not_defined": 1}}).status_code == 422
    assert client.post("/api/sensors", headers=h, json={**body, "key": "x2", "channel": "nope"}).status_code == 422
    assert client.post("/api/sensors", headers=h,
                       json={**body, "key": "x3", "min_valid": 5, "max_valid": 1}).status_code == 422

    r = client.put(f"/api/sensors/{sid}", headers=h, json={**body, "name": "Glove temp v2", "change_note": "rename"})
    assert r.status_code == 200 and r.json()["version"] == 2

    # No channel and no baseline: cannot be simulated, so it cannot be activated.
    r = client.post(f"/api/sensors/{sid}/status", headers=h, json={"status": "active"})
    assert r.status_code == 409 and "baseline" in r.json()["detail"]
    pid = sensor["profiles"][0]["id"]
    assert client.put(f"/api/profiles/{pid}", headers=h,
                      json={"name": "nominal", "is_default": True, "baseline": 24.0, "noise_std": 0.2}).status_code == 200
    r = client.post(f"/api/sensors/{sid}/status", headers=h, json={"status": "active"})
    assert r.status_code == 200 and r.json()["status"] == "active" and r.json()["version"] == 3

    assert client.post(f"/api/sensors/{sid}/status", headers=h, json={"status": "draft"}).status_code == 409
    assert client.delete(f"/api/sensors/{sid}", headers=h).status_code == 409         # only drafts
    assert client.delete(f"/api/profiles/{pid}", headers=h).status_code == 409        # default profile

    # A second profile can become the default.
    r = client.post(f"/api/sensors/{sid}/profiles", headers=h,
                    json={"name": "noisy", "is_default": True, "baseline": 24.0, "noise_std": 1.0})
    assert r.status_code == 201
    profiles = client.get(f"/api/sensors/{sid}", headers=h).json()["profiles"]
    assert [p["name"] for p in profiles if p["is_default"]] == ["noisy"]

    audited = {a["action"] for a in client.get("/api/admin/audit?limit=100&username=physical",
                                                headers=auth["admin"]).json()}
    assert {"sensor.create", "sensor.update", "sensor.status", "profile.create", "profile.update"} <= audited

    versions = client.get(f"/api/sensors/{sid}/versions", headers=h).json()
    assert [v["version"] for v in versions] == [3, 2, 1]
    assert versions[0]["snapshot"]["status"] == "active" and versions[1]["change_note"] == "rename"

    # The new baseline-driven sensor is simulated in the next session.
    sess = client.get(f"/api/sessions/{new_session(client, auth)}", headers=auth["operator"]).json()
    assert "glove_temp" in [s["key"] for s in sess["sensors"]]

    assert client.post(f"/api/sensors/{sid}/status", headers=h, json={"status": "archived"}).status_code == 200
    assert client.put(f"/api/sensors/{sid}", headers=h, json=body).status_code == 409  # archived is read-only
    sess = client.get(f"/api/sessions/{new_session(client, auth)}", headers=auth["operator"]).json()
    assert "glove_temp" not in [s["key"] for s in sess["sensors"]]


def test_failure_signature_and_custom_field_crud(client, auth):
    h = auth["physical"]
    r = client.post("/api/failure-signatures", headers=h, json={
        "key": "connector_wiggle", "name": "Connector wiggle", "fault_type": "disconnect",
        "default_duration_s": 5, "keywords": ["wiggle"]})
    assert r.status_code == 201
    fid = r.json()["id"]
    assert client.post("/api/failure-signatures", headers=h, json={
        "key": "bad_type", "name": "x", "fault_type": "explode"}).status_code == 422
    assert client.delete(f"/api/failure-signatures/{fid}", headers=h).status_code == 204
    r = client.post("/api/custom-fields", headers=h, json={"key": "mass_g", "label": "Mass", "data_type": "number", "unit": "g"})
    assert r.status_code == 201
    assert client.post("/api/custom-fields", headers=h, json={"key": "e", "label": "E", "data_type": "enum"}).status_code == 422
    assert client.delete(f"/api/custom-fields/{r.json()['id']}", headers=h).status_code == 204
    assert len(client.get("/api/channels", headers=h).json()) >= 15


# --------------------------------------------------------------- medical team
def test_medical_rules_conditions_and_dataset_import(client, auth):
    h = auth["medical"]
    assert client.post("/api/rules", headers=h, json={**RULE, "key": "ghost_rule", "clauses": [
        {"sensor_key": "no_such_sensor", "operator": ">", "threshold": 1}]}).status_code == 422
    r = client.post("/api/rules", headers=h, json={
        "key": "bradycardia", "name": "Low heart rate", "severity": "caution",
        "clauses": [{"sensor_key": "heart_rate", "aggregation": "mean", "window_s": 30,
                     "operator": "<", "threshold": 40}]})
    assert r.status_code == 201, r.text
    rid = r.json()["id"]
    r = client.put(f"/api/rules/{rid}", headers=h, json={
        "key": "bradycardia", "name": "Low heart rate", "severity": "warning", "enabled": False,
        "clauses": [{"sensor_key": "heart_rate", "operator": "<", "threshold": 38}]})
    assert r.json()["version"] == 2 and r.json()["severity"] == "warning"

    conditions = client.get("/api/conditions", headers=h).json()
    heat = next(c for c in conditions if c["key"] == "heat_strain")
    assert heat["symptoms"] and heat["indicators"] and heat["recommendations"] and heat["sources"]
    assert {r_["key"] for r_ in heat["rules"]} == {"heat_strain_caution", "heat_strain_warning"}
    urls = {s["url"] for s in client.get("/api/sources", headers=h).json()}
    assert {"https://humanresearchroadmap.nasa.gov/evidence/", "https://osdr.nasa.gov/bio/repo/",
            "https://www.nasa.gov/hrp/risks/"} <= urls

    symptom_ids = [s["id"] for s in client.get("/api/symptoms", headers=h).json()][:2]
    r = client.post("/api/conditions", headers=h, json={
        "key": "dehydration", "name": "Dehydration", "symptom_ids": symptom_ids,
        "indicators": [{"sensor_key": "heart_rate", "direction": "rising"}]})
    assert r.status_code == 201 and len(r.json()["symptoms"]) == 2
    cid = r.json()["id"]
    assert client.post("/api/conditions", headers=h, json={
        "key": "bad_ind", "name": "x", "indicators": [{"sensor_key": "ghost", "direction": "high"}]}).status_code == 422
    assert client.post("/api/recommendations", headers=h, json={
        "condition_id": cid, "text": "Drink water from the in-suit bag."}).status_code == 201
    assert client.delete(f"/api/conditions/{cid}", headers=h).status_code == 204

    csv_bytes = b"subject,day,core_temp_c,note\nS1,1,36.9,ok\nS1,2,37.2,\nS2,1,37.0,ok\n"
    r = client.post("/api/datasets", headers=h, files={"file": ("heat.csv", csv_bytes, "text/csv")},
                    data={"name": "Synthetic heat trial", "is_synthetic": "true"})
    assert r.status_code == 201, r.text
    ds = r.json()
    assert ds["record_count"] == 3 and ds["file_format"] == "csv" and ds["is_synthetic"] is True
    assert {c["name"]: c["type"] for c in ds["columns"]}["core_temp_c"] == "number"
    assert next(c for c in ds["columns"] if c["name"] == "note")["non_null"] == 2
    r = client.post("/api/datasets", headers=h, files={"file": ("d.json", b'{"rows":[{"a":1},{"a":2}]}', "application/json")},
                    data={"name": "JSON set"})
    assert r.status_code == 201 and r.json()["record_count"] == 2
    assert client.post("/api/datasets", headers=h, files={"file": ("x.exe", b"MZ", "application/octet-stream")},
                       data={"name": "bad"}).status_code == 422

    r = client.post("/api/astronauts", headers=h, json={
        "callsign": "ARES-9", "full_name": "Test Pilot (synthetic)", "age": 35, "mass_kg": 70,
        "height_cm": 175, "resting_hr": 60})
    assert r.status_code == 201 and r.json()["is_synthetic"] is True
    assert client.delete(f"/api/astronauts/{r.json()['id']}", headers=h).status_code == 204
    assert client.delete(f"/api/rules/{rid}", headers=h).status_code == 204
    audited = {a["action"] for a in client.get("/api/admin/audit?limit=100&username=medical",
                                                headers=auth["admin"]).json()}
    assert {"rule.create", "rule.update", "rule.delete", "condition.create", "dataset.import",
            "astronaut.create"} <= audited


# ----------------------------------------------------------------------- admin
def test_admin_users_config_and_audit(client, auth):
    h = auth["admin"]
    r = client.post("/api/admin/users", headers=h, json={
        "username": "judge1", "full_name": "Judge One", "role": "viewer", "password": "a-long-password"})
    assert r.status_code == 201
    uid = r.json()["id"]
    assert client.post("/api/admin/users", headers=h, json={
        "username": "judge1", "role": "viewer", "password": "a-long-password"}).status_code == 409
    assert client.post("/api/admin/users", headers=h, json={
        "username": "weak", "role": "viewer", "password": "short"}).status_code == 422
    assert client.post("/api/auth/login", json={"username": "judge1", "password": "a-long-password"}).status_code == 200
    assert client.patch(f"/api/admin/users/{uid}", headers=h, json={"role": "medical"}).json()["role"] == "medical"
    assert client.post(f"/api/admin/users/{uid}/reset-password", headers=h, json={"password": "another-long-one"}).status_code == 204
    client.patch(f"/api/admin/users/{uid}", headers=h, json={"is_active": False})
    assert client.post("/api/auth/login", json={"username": "judge1", "password": "another-long-one"}).status_code == 401

    admin_id = client.get("/api/auth/me", headers=h).json()["id"]
    assert client.patch(f"/api/admin/users/{admin_id}", headers=h, json={"is_active": False}).status_code == 409

    assert client.put("/api/admin/config/default_speed", headers=h, json={"value": 3}).status_code == 422
    assert client.put("/api/admin/config/viewer_token_ttl_minutes", headers=h, json={"value": 0}).status_code == 422
    assert client.put("/api/admin/config/ai_mode", headers=h, json={"value": "magic"}).status_code == 422
    assert client.put("/api/admin/config/default_speed", headers=h, json={"value": 16}).json()["value"] == 16
    assert client.put("/api/admin/config/no_such_key", headers=h, json={"value": 1}).status_code == 404

    actions = [a["action"] for a in client.get("/api/admin/audit?limit=500", headers=h).json()]
    for expected in ("auth.login", "auth.login_failed", "user.create", "user.update",
                     "user.reset_password", "config.update"):
        assert expected in actions, expected
    overview = client.get("/api/admin/overview", headers=h).json()
    assert overview["sensors"]["active"] >= 17 and overview["users"]["by_role"]["admin"] == 1


# -------------------------------------------------------------------- mission
def test_plan_generation_and_validation_endpoints(client, auth):
    h = auth["operator"]
    r = client.post("/api/plans/generate", headers=h, json={"prompt": DEFAULT_PROMPT, "seed": 99}).json()
    assert r["valid"] and r["plan"]["seed"] == 99 and r["timeline"]["distance_m"] > 100
    assert len(r["timeline"]["path"]) >= 4
    bad = {"version": 1, "title": "bad", "seed": 1, "steps": [{"id": "a", "action": "KNEEL"}]}
    v = client.post("/api/plans/validate", headers=h, json={"plan": bad}).json()
    assert v["valid"] is False and "surface" in v["problems"][0]
    assert client.post("/api/sessions", headers=h, json={"name": "bad", "plan": bad}).status_code == 422


def test_full_session_flow_stream_controls_and_determinism(client, auth):
    sid = new_session(client, auth)
    detail = client.get(f"/api/sessions/{sid}", headers=auth["operator"]).json()
    assert detail["label"] == "SIMULATED DATA" and detail["access"]["can_control"] is True
    assert detail["session"]["status"] == "planned" and detail["session"]["speed"] == 16   # admin default above
    token = auth["operator"]["Authorization"].split()[1]

    assert control(client, auth, sid, "pause").status_code == 409
    assert control(client, auth, sid, "start", role="viewer").status_code == 403
    assert control(client, auth, sid, "start", role="admin").status_code == 403        # admin may only stop
    assert control(client, auth, sid, "set_speed", speed=3).status_code == 422

    with client.websocket_connect(f"/api/ws/sessions/{sid}?token={token}") as ws:
        hello = ws.receive_json()
        assert hello["type"] == "hello" and hello["session"]["status"] == "planned" and hello["frame"] is None
        assert control(client, auth, sid, "start").json()["status"] == "running"
        first_run: dict[int, dict] = {}
        got_reset = False
        while len(first_run) < 12:
            msg = ws.receive_json()
            got_reset |= msg["type"] == "reset"
            if msg["type"] == "frames":
                assert msg["run"] == 1
                first_run.update({f["seq"]: f for f in msg["frames"]})
        assert got_reset
        frame = first_run[4]
        assert set(frame) >= {"t", "truth", "sensors", "warnings", "rules", "astronaut", "conditions"}
        assert set(frame["warnings"]) == {"medical", "data_quality"}
        assert frame["sensors"]["heart_rate"][1] == "good"
        ws.send_text('{"action":"stop"}')      # inbound messages are ignored: the stream is read-only

        assert control(client, auth, sid, "pause").json()["status"] == "paused"
        paused_at = client.get(f"/api/sessions/{sid}", headers=auth["operator"]).json()["session"]["sim_time"]
        time.sleep(0.4)
        assert client.get(f"/api/sessions/{sid}", headers=auth["operator"]).json()["session"]["sim_time"] == paused_at
        assert control(client, auth, sid, "resume").json()["status"] == "running"

    done = wait_status(client, auth, sid, "completed")
    assert done["sim_time"] == 30.0 and done["run"] == 1

    # Restart replays the frozen snapshot with the same seed: frames are identical.
    with client.websocket_connect(f"/api/ws/sessions/{sid}?token={token}") as ws:
        hello = ws.receive_json()
        assert hello["session"]["status"] == "completed" and len(hello["history"]["t"]) == 30
        assert control(client, auth, sid, "restart").json()["run"] == 2
        second_run: dict[int, dict] = {}
        while len(second_run) < 12:
            msg = ws.receive_json()
            if msg["type"] == "frames" and msg["run"] == 2:
                second_run.update({f["seq"]: f for f in msg["frames"]})
    for seq in range(1, 11):
        assert first_run[seq] == second_run[seq]

    assert control(client, auth, sid, "stop").json()["status"] == "stopped"
    assert control(client, auth, sid, "resume").status_code == 409
    assert client.delete(f"/api/sessions/{sid}", headers=auth["operator"]).status_code == 204
    assert client.get(f"/api/sessions/{sid}", headers=auth["operator"]).status_code == 404


def test_viewer_tokens_are_session_scoped_read_only_and_revocable(client, auth):
    sid = new_session(client, auth, name="Viewer A")
    other = new_session(client, auth, name="Viewer B")
    h = auth["operator"]
    assert client.post(f"/api/sessions/{sid}/viewer-tokens", headers=auth["viewer"], json={}).status_code == 403
    r = client.post(f"/api/sessions/{sid}/viewer-tokens", headers=h,
                    json={"label": "Judges", "ttl_minutes": 5, "base_url": "http://192.168.1.50:8000"})
    assert r.status_code == 201, r.text
    created = r.json()
    token = created["token"]
    assert created["url"] == f"http://192.168.1.50:8000/view/{token}"
    assert created["qr_svg"].lstrip().startswith("<?xml") and "<svg" in created["qr_svg"]
    assert created["state"] == "active"

    assert client.get(f"/api/viewer/resolve?token={token}").json()["session_id"] == sid
    vh = {"X-Viewer-Token": token}
    detail = client.get(f"/api/sessions/{sid}", headers=vh).json()
    assert detail["access"] == {"kind": "viewer", "role": "viewer", "name": "Judges", "can_control": False}
    # Scoped to its own session, and it grants nothing else.
    assert client.get(f"/api/sessions/{other}", headers=vh).status_code == 401
    assert client.get("/api/sessions", headers=vh).status_code == 401
    assert client.get("/api/sensors", headers=vh).status_code == 401
    assert client.post(f"/api/sessions/{sid}/control", headers=vh, json={"action": "start"}).status_code == 401
    assert client.post(f"/api/sessions/{sid}/viewer-tokens", headers=vh, json={}).status_code == 401
    # It can chat with ASTRA and watch the stream.
    assert client.post(f"/api/sessions/{sid}/chat", headers=vh, json={"message": "status"}).status_code == 200
    with client.websocket_connect(f"/api/ws/sessions/{sid}?viewer_token={token}") as ws:
        assert ws.receive_json()["type"] == "hello"
    with pytest.raises(Exception):
        with client.websocket_connect(f"/api/ws/sessions/{other}?viewer_token={token}") as ws:
            ws.receive_json()
    with pytest.raises(Exception):
        with client.websocket_connect(f"/api/ws/sessions/{sid}") as ws:
            ws.receive_json()

    tokens = client.get(f"/api/sessions/{sid}/viewer-tokens", headers=h).json()
    assert tokens[0]["use_count"] >= 1 and "token" not in tokens[0] and "token_hash" not in tokens[0]
    assert client.delete(f"/api/viewer-tokens/{created['id']}", headers=h).status_code == 204
    assert client.get(f"/api/viewer/resolve?token={token}").status_code == 401
    assert client.get(f"/api/sessions/{sid}", headers=vh).status_code == 401
    assert client.get(f"/api/sessions/{sid}/viewer-tokens", headers=h).json()[0]["state"] == "revoked"
    assert client.get("/api/viewer/resolve?token=not-a-real-token-123").status_code == 401


def test_astra_chat_uses_live_context(client, auth):
    r = client.post("/api/plans/generate", headers=auth["operator"], json={"prompt": DEFAULT_PROMPT}).json()
    sid = client.post("/api/sessions", headers=auth["operator"], json={
        "name": "Chat", "prompt": DEFAULT_PROMPT, "plan": r["plan"], "plan_source": r["source"]}).json()["session"]["id"]
    h = auth["operator"]
    early = client.post(f"/api/sessions/{sid}/chat", headers=h, json={"message": "Why is my temperature rising?"}).json()
    assert "not produced telemetry yet" in early["reply"] and early["provider"] == "local-deterministic"
    control(client, auth, sid, "start")
    deadline = time.time() + 30
    while time.time() < deadline:
        if client.get(f"/api/sessions/{sid}", headers=h).json()["session"]["sim_time"] >= 285:
            break
        time.sleep(0.2)
    control(client, auth, sid, "pause")
    time.sleep(1.1)
    answer = client.post(f"/api/sessions/{sid}/chat", headers=h,
                         json={"message": "ASTRA, why is my body temperature increasing?"}).json()
    assert "thermal stress event" in answer["reply"] and "independent" in answer["reply"]
    assert answer["label"] == "SIMULATED DATA" and answer["sim_time"] >= 285
    history = client.get(f"/api/sessions/{sid}/chat", headers=h).json()
    assert [m["role"] for m in history] == ["user", "assistant", "user", "assistant"]
    warnings = client.get(f"/api/sessions/{sid}/warnings", headers=h).json()
    assert {"radiation_dose_rate_elevated", "heat_strain_caution"} <= {w["key"] for w in warnings}
    assert client.post(f"/api/voice/tts", headers=h, json={"text": "hello"}).status_code == 503   # browser speech
    control(client, auth, sid, "stop")


def test_emergency_stop_aborts_and_locks_until_admin_releases(client, auth):
    sid = new_session(client, auth, plan={**SHORT_PLAN, "steps": [
        *SHORT_PLAN["steps"][:2], {"id": "a3", "action": "WAIT", "duration_s": 600}]})
    client.put("/api/admin/config/default_speed", headers=auth["admin"], json={"value": 1})
    control(client, auth, sid, "set_speed", speed=1)
    assert control(client, auth, sid, "start").status_code == 200
    r = client.post("/api/admin/emergency-stop", headers=auth["admin"], json={"reason": "safety drill"})
    assert r.status_code == 200 and sid in r.json()["stopped"] and r.json()["simulation_lock"] is True
    s = client.get(f"/api/sessions/{sid}", headers=auth["operator"]).json()["session"]
    assert s["status"] == "aborted" and "safety drill" in s["end_reason"]
    assert control(client, auth, sid, "restart").status_code == 423
    assert control(client, auth, new_session(client, auth), "start").status_code == 423
    assert client.post("/api/admin/simulation-lock", headers=auth["admin"], json={"locked": False}).status_code == 200
    assert control(client, auth, sid, "restart").status_code == 200
    assert control(client, auth, sid, "stop", role="admin").json()["status"] == "stopped"   # admin override
    audit_actions = [a["action"] for a in client.get("/api/admin/audit?limit=50", headers=auth["admin"]).json()]
    assert "simulation.emergency_stop" in audit_actions and "simulation.unlock" in audit_actions
