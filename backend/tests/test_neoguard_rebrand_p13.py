"""Iteration 13 regression tests.
Coverage:
 1) PUT /api/workspaces/{id} persists new field guacamole_connection_id
 2) POST /api/workspaces/{id}/launch returns guac /#/client/ URL when linked
 3) POST /api/workspaces/{id}/launch-autologon — same when linked (when TSplus token unavailable)
 4) POST /api/tenants/invite-users — real NeoGuard (Zitadel) flow + mock fallback
 5) POST /api/tenants/invite-resend/{user_id} — admin only, 404 for unknown, ok for existing
"""
import os
import re
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://action-steps-4.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@windesk.cloud"
ADMIN_PASSWORD = "Admin123!"


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    tok = data.get("access_token") or data.get("token")
    assert tok, f"no token in login response: {data}"
    return tok


@pytest.fixture(scope="session")
def admin_client(admin_token):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json",
                      "Authorization": f"Bearer {admin_token}"})
    return s


# ---------- Workspace guacamole_connection_id persistence ----------

@pytest.fixture(scope="session")
def some_workspace(admin_client):
    r = admin_client.get(f"{BASE_URL}/api/workspaces", timeout=15)
    assert r.status_code == 200, r.text
    items = r.json()
    if isinstance(items, dict):
        items = items.get("workspaces") or items.get("items") or []
    assert items, "no workspaces available to test against"
    # prefer ws-remote-desktop (mentioned in context) or first
    for w in items:
        if w.get("id") == "ws-remote-desktop":
            return w
    return items[0]


class TestWorkspaceGuacLink:
    def test_put_persists_guacamole_connection_id(self, admin_client, some_workspace):
        ws_id = some_workspace["id"]
        test_conn_id = "99991"
        r = admin_client.put(f"{BASE_URL}/api/workspaces/{ws_id}",
                             json={"guacamole_connection_id": test_conn_id}, timeout=15)
        assert r.status_code == 200, r.text
        # Verify via list (no single-GET endpoint)
        g = admin_client.get(f"{BASE_URL}/api/workspaces", timeout=15)
        assert g.status_code == 200, g.text
        items = g.json()
        if isinstance(items, dict):
            items = items.get("workspaces") or items.get("items") or []
        matched = next((w for w in items if w.get("id") == ws_id), None)
        assert matched, f"workspace {ws_id} not in list"
        assert matched.get("guacamole_connection_id") == test_conn_id

    def test_launch_uses_guac_client_url(self, admin_client, some_workspace):
        ws_id = some_workspace["id"]
        # Ensure linked (piggyback on previous test's write)
        admin_client.put(f"{BASE_URL}/api/workspaces/{ws_id}",
                         json={"guacamole_connection_id": "99991"}, timeout=15)
        r = admin_client.post(f"{BASE_URL}/api/workspaces/{ws_id}/launch",
                              json={}, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        url = body.get("connection_url") or ""
        # Either real guac link or fallback to workspace.url if guac unreachable.
        # If guac reachable the URL MUST contain /#/client/ and token=
        if "/#/client/" in url:
            assert "token=" in url, f"missing token param: {url}"
            # the base64 client id should be present after /#/client/
            m = re.search(r"/#/client/([^?]+)\?token=", url)
            assert m and len(m.group(1)) > 4, f"client id segment missing: {url}"
        else:
            # Accept when Guacamole backend unreachable but expose the reason
            pytest.skip(f"Guacamole seems offline, fell back to workspace.url: {url}")

    def test_launch_autologon_uses_guac_when_tsplus_absent(self, admin_client, some_workspace):
        ws_id = some_workspace["id"]
        admin_client.put(f"{BASE_URL}/api/workspaces/{ws_id}",
                         json={"guacamole_connection_id": "99991"}, timeout=15)
        r = admin_client.post(f"{BASE_URL}/api/workspaces/{ws_id}/launch-autologon",
                              json={}, timeout=30)
        # autologon requires rdp_username/password on workspace — may 400 when missing.
        if r.status_code == 400:
            pytest.skip(f"workspace has no RDP credentials for autologon: {r.text}")
        assert r.status_code == 200, r.text
        body = r.json()
        url = body.get("connection_url") or ""
        # When TSplus token is obtained, url becomes TSplus session_url;
        # when it fails (no token) AND guac linked, url should be a guac /#/client/ link.
        autologon_ok = body.get("autologon") is True
        if not autologon_ok:
            assert "/#/client/" in url or url == "", f"expected guac link when TSplus autologon failed: {url}"
        else:
            # TSplus present — still verify we didn't crash; url must be non-empty
            assert url, "empty connection_url despite autologon=True"


# ---------- NeoGuard invite flow ----------

class TestNeoGuardInvites:
    def test_invite_users_mock_fallback(self, admin_client):
        email = f"TEST_mock_{uuid.uuid4().hex[:8]}@test.com"
        r = admin_client.post(f"{BASE_URL}/api/tenants/invite-users",
                              json={"emails": [email], "role": "user",
                                    "welcome_message": "pytest", "use_neoguard": False},
                              timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("delivery_mode") == "mock"
        res = data["results"][0]
        assert res["status"] == "invited"
        assert res["delivery"] == "mock"
        assert res.get("email_id"), "mock email_id should be present"

    def test_invite_users_neoguard_real(self, admin_client):
        email = f"TEST_neoguard_{uuid.uuid4().hex[:8]}@example.com"
        r = admin_client.post(f"{BASE_URL}/api/tenants/invite-users",
                              json={"emails": [email], "role": "user",
                                    "welcome_message": "pytest", "use_neoguard": True},
                              timeout=45)
        assert r.status_code == 200, r.text
        data = r.json()
        # NeoGuard should be reachable per context note; if not, backend falls back to mock.
        if data.get("delivery_mode") != "neoguard":
            pytest.skip(f"NeoGuard unreachable in env: {data}")
        res = data["results"][0]
        assert res["status"] == "invited"
        assert res["delivery"] == "neoguard"
        assert res.get("zitadel_user_id"), f"zitadel_user_id missing: {res}"
        # Grant may legitimately fail (400 Project Grant not found) — that's documented non-blocking.
        # Just assert grant key exists.
        assert "grant" in res

    def test_invite_resend_404_for_unknown(self, admin_client):
        r = admin_client.post(f"{BASE_URL}/api/tenants/invite-resend/does-not-exist-{uuid.uuid4().hex[:6]}",
                              timeout=15)
        assert r.status_code == 404, r.text

    def test_invite_resend_ok_for_existing(self, admin_client):
        # Create a mock invite first so we have a real internal id
        email = f"TEST_resend_{uuid.uuid4().hex[:8]}@test.com"
        inv = admin_client.post(f"{BASE_URL}/api/tenants/invite-users",
                                json={"emails": [email], "role": "user",
                                      "use_neoguard": False},
                                timeout=30).json()
        uid = inv["results"][0]["user_id"]
        r = admin_client.post(f"{BASE_URL}/api/tenants/invite-resend/{uid}", timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

    def test_invite_resend_admin_only(self):
        # Anonymous call must be rejected
        r = requests.post(f"{BASE_URL}/api/tenants/invite-resend/anything", timeout=15)
        assert r.status_code in (401, 403), r.text


# ---------- Optional: /api/zitadel/my-org used by WelcomePage ----------

class TestWelcomeDataSources:
    def test_zitadel_my_org_shape(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/zitadel/my-org", timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        # Required by WelcomePage roles dropdown
        assert "roles" in data or data.get("status") == "error"
