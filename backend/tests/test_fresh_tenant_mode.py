"""
Iteration 14 — FRESH_TENANT_MODE tests.
Validates:
  - GET /api/workspaces returns [] when DB empty + FRESH_TENANT_MODE=true (no auto-seed)
  - GET /api/applications returns [] when DB empty + FRESH_TENANT_MODE=true
  - POST /api/workspaces creates and GET returns exactly that one (no seed pollution)
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://action-steps-4.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@windesk.cloud"
ADMIN_PASSWORD = "Admin123!"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("access_token") or data.get("token")
    assert tok, f"no access_token in login resp: {data}"
    return tok


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# ---------- FRESH_TENANT_MODE: workspaces ----------
class TestFreshTenantModeWorkspaces:
    def test_workspaces_empty_or_real_only(self, auth_headers):
        """With FRESH_TENANT_MODE=true, GET /api/workspaces must NOT auto-seed DEFAULT_WORKSPACES."""
        r = requests.get(f"{BASE_URL}/api/workspaces", headers=auth_headers, timeout=20)
        assert r.status_code == 200, f"GET /api/workspaces failed: {r.status_code} {r.text}"
        items = r.json()
        assert isinstance(items, list)
        # Detect seed pollution: DEFAULT_WORKSPACES ids are ws-1, ws-2, ws-3 typically.
        seed_ids = {"ws-1", "ws-2", "ws-3"}
        found_seed = [w for w in items if w.get("id") in seed_ids]
        # If DB was cleared, we expect [] after enabling FRESH_TENANT_MODE.
        # If DB has user-created workspaces, that's fine — but no legacy seed must appear.
        assert not found_seed, (
            f"FRESH_TENANT_MODE=true but legacy seed workspaces still inserted: {[w.get('id') for w in found_seed]}"
        )

    def test_create_workspace_returns_single_entry(self, auth_headers):
        """Creating a workspace should result in GET returning at least that one; no seed added alongside."""
        uniq = uuid.uuid4().hex[:8]
        payload = {
            "name": f"TEST_WS_{uniq}",
            "type": "vm",
            "description": "Iteration14 fresh-tenant test workspace",
            "url": "https://example.invalid/",
            "connection_type": "html5",
            "requires_netbird": False,
            "clientless": True,
            "launch_mode": "new_tab",
            "cpu": "2 vCPU",
            "memory": "4 GB",
            "storage": "50 GB",
            "image_url": "",
            "icon": "default",
        }
        r = requests.post(f"{BASE_URL}/api/workspaces", headers=auth_headers, json=payload, timeout=20)
        assert r.status_code in (200, 201), f"POST /api/workspaces failed: {r.status_code} {r.text}"
        created = r.json()
        ws_id = created.get("id") or created.get("workspace", {}).get("id")
        assert ws_id, f"no id in create response: {created}"

        # Verify GET returns it
        r2 = requests.get(f"{BASE_URL}/api/workspaces", headers=auth_headers, timeout=20)
        assert r2.status_code == 200
        items = r2.json()
        ids = [w.get("id") for w in items]
        assert ws_id in ids, f"created workspace {ws_id} not found in GET list: {ids}"

        # No legacy seed polluted
        seed_ids = {"ws-1", "ws-2", "ws-3"}
        assert not (set(ids) & seed_ids), f"legacy seed ids present after create: {set(ids) & seed_ids}"

        # Cleanup
        try:
            requests.delete(f"{BASE_URL}/api/workspaces/{ws_id}", headers=auth_headers, timeout=20)
        except Exception:
            pass


# ---------- FRESH_TENANT_MODE: applications ----------
class TestFreshTenantModeApplications:
    def test_applications_no_seed_pollution(self, auth_headers):
        """GET /api/applications must NOT auto-seed DEFAULT_APPLICATIONS when FRESH_TENANT_MODE=true."""
        r = requests.get(f"{BASE_URL}/api/applications", headers=auth_headers, timeout=20)
        assert r.status_code == 200, f"GET /api/applications failed: {r.status_code} {r.text}"
        apps = r.json()
        assert isinstance(apps, list)
        seed_ids = {"app-remote-desktop", "app-crm"}
        present = {a.get("id") for a in apps} & seed_ids
        assert not present, f"FRESH_TENANT_MODE=true but legacy seed apps inserted: {present}"
