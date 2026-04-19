"""Backend tests for TSplus Remote Action Engine (iteration 10)."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Read from frontend/.env
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL"):
                    BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
    except Exception:
        pass

ADMIN = {"email": "admin@windesk.cloud", "password": "Admin123!"}
USER = {"email": "usuario1@windesk.cloud", "password": "Demo123!"}


def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"login failed: {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_headers():
    return {"Authorization": f"Bearer {_login(ADMIN)}"}


@pytest.fixture(scope="module")
def user_headers():
    return {"Authorization": f"Bearer {_login(USER)}"}


# ── Workspaces: password sanitation ─────────────────────────────────────
class TestWorkspaceSanitization:
    def test_get_workspaces_admin_never_leaks_password(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/workspaces", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) >= 6
        for w in data:
            assert "rdp_password" not in w, f"leaked password in {w.get('id')}"
        # At least one ws should expose rdp_password_set boolean (admin)
        assert any("rdp_password_set" in w for w in data)

    def test_get_workspaces_user_no_password_and_no_flag(self, user_headers):
        r = requests.get(f"{BASE_URL}/api/workspaces", headers=user_headers, timeout=15)
        assert r.status_code == 200
        for w in r.json():
            assert "rdp_password" not in w
            # rdp_password_set is admin-only per code
            assert "rdp_password_set" not in w

    def test_put_workspace_sets_creds_and_preserves_password(self, admin_headers):
        wid = "ws-remote-desktop"
        # Set creds
        p1 = {"rdp_username": "TESTuser_it10", "rdp_password": "TESTpass_it10!",
              "rdp_domain": "WORKGROUPX", "launch_mode": "iframe"}
        r1 = requests.put(f"{BASE_URL}/api/workspaces/{wid}", json=p1,
                          headers=admin_headers, timeout=15)
        assert r1.status_code == 200, r1.text
        ws1 = r1.json()["workspace"]
        assert "rdp_password" not in ws1
        assert ws1.get("rdp_password_set") is True
        assert ws1.get("rdp_username") == "TESTuser_it10"
        assert ws1.get("rdp_domain") == "WORKGROUPX"

        # Omit password → should be preserved (password_set stays True)
        p2 = {"rdp_domain": "WORKGROUPY"}
        r2 = requests.put(f"{BASE_URL}/api/workspaces/{wid}", json=p2,
                          headers=admin_headers, timeout=15)
        assert r2.status_code == 200
        ws2 = r2.json()["workspace"]
        assert "rdp_password" not in ws2
        assert ws2.get("rdp_password_set") is True  # preserved
        assert ws2.get("rdp_domain") == "WORKGROUPY"
        assert ws2.get("rdp_username") == "TESTuser_it10"


# ── Launch autologon ──────────────────────────────────────────────────────
class TestLaunchAutologon:
    def test_launch_autologon_missing_creds_returns_400(self, user_headers, admin_headers):
        # Use a ws without creds: ws-1panel (not an rdp target)
        wid = "ws-1panel"
        # Ensure no creds on this workspace
        requests.put(f"{BASE_URL}/api/workspaces/{wid}",
                     json={"rdp_username": "", "rdp_password": ""},
                     headers=admin_headers, timeout=15)
        r = requests.post(f"{BASE_URL}/api/workspaces/{wid}/launch-autologon",
                          json={}, headers=user_headers, timeout=15)
        assert r.status_code == 400

    def test_launch_autologon_success(self, user_headers, admin_headers):
        # Make sure remote-desktop has creds
        wid = "ws-remote-desktop"
        requests.put(f"{BASE_URL}/api/workspaces/{wid}",
                     json={"rdp_username": "testuser", "rdp_password": "testpass123"},
                     headers=admin_headers, timeout=15)

        r = requests.post(f"{BASE_URL}/api/workspaces/{wid}/launch-autologon",
                          json={}, headers=user_headers, timeout=25)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "session_id" in data
        assert "connection_url" in data
        assert "autologon" in data  # bool, may be False since TSplus unreachable
        assert data.get("clientless") is True
        ws = data.get("workspace", {})
        assert "rdp_password" not in ws
        # Pass sid back via pytest
        pytest.sid_autologon = data["session_id"]


# ── Session actions ───────────────────────────────────────────────────────
class TestSessionActions:
    def test_invalid_action_400(self, user_headers):
        sid = getattr(pytest, "sid_autologon", None)
        if not sid:
            pytest.skip("no session id")
        r = requests.post(f"{BASE_URL}/api/sessions/{sid}/action",
                          json={"action": "bogus"}, headers=user_headers, timeout=10)
        assert r.status_code == 400

    def test_lock_ok(self, user_headers):
        sid = getattr(pytest, "sid_autologon", None)
        if not sid:
            pytest.skip("no session id")
        r = requests.post(f"{BASE_URL}/api/sessions/{sid}/action",
                          json={"action": "lock"}, headers=user_headers, timeout=15)
        assert r.status_code == 200
        assert r.json().get("action") == "lock"

    def test_other_user_cannot_act_404(self, admin_headers):
        sid = getattr(pytest, "sid_autologon", None)
        if not sid:
            pytest.skip("no session id")
        # Admin is different user than usuario1
        r = requests.post(f"{BASE_URL}/api/sessions/{sid}/action",
                          json={"action": "lock"}, headers=admin_headers, timeout=10)
        assert r.status_code == 404

    def test_disconnect_sets_status(self, user_headers):
        sid = getattr(pytest, "sid_autologon", None)
        if not sid:
            pytest.skip("no session id")
        r = requests.post(f"{BASE_URL}/api/sessions/{sid}/action",
                          json={"action": "disconnect"}, headers=user_headers, timeout=15)
        assert r.status_code == 200
        # Follow up GET
        g = requests.get(f"{BASE_URL}/api/sessions/{sid}", headers=user_headers, timeout=10)
        assert g.status_code == 200
        assert g.json().get("status") == "disconnected"

    def test_logoff_on_new_session_terminates(self, user_headers, admin_headers):
        wid = "ws-remote-desktop"
        requests.put(f"{BASE_URL}/api/workspaces/{wid}",
                     json={"rdp_username": "testuser", "rdp_password": "testpass123"},
                     headers=admin_headers, timeout=15)
        launch = requests.post(f"{BASE_URL}/api/workspaces/{wid}/launch-autologon",
                               json={}, headers=user_headers, timeout=25)
        assert launch.status_code == 200
        sid = launch.json()["session_id"]
        r = requests.post(f"{BASE_URL}/api/sessions/{sid}/action",
                          json={"action": "logoff"}, headers=user_headers, timeout=15)
        assert r.status_code == 200
        g = requests.get(f"{BASE_URL}/api/sessions/{sid}", headers=user_headers, timeout=10)
        assert g.status_code == 200
        assert g.json().get("status") == "terminated"


# ── Admin TSplus endpoints ────────────────────────────────────────────────
class TestAdminTSplus:
    def test_admin_sessions(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/tsplus/sessions",
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "sessions" in data and "count" in data
        assert isinstance(data["sessions"], list)

    def test_admin_sessions_forbidden_for_user(self, user_headers):
        r = requests.get(f"{BASE_URL}/api/admin/tsplus/sessions",
                         headers=user_headers, timeout=15)
        assert r.status_code == 403

    def test_admin_status(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/tsplus/status",
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "connected" in d and "url" in d

    def test_admin_status_forbidden_user(self, user_headers):
        r = requests.get(f"{BASE_URL}/api/admin/tsplus/status",
                         headers=user_headers, timeout=15)
        assert r.status_code == 403
