"""Iteration 16: LXD trust + Multi-tenant tests.

Validates:
 - LXD /status auth='trusted' + /instances returns list from project=default
 - Tenants: /me, /tenants list, POST create (with 409 dup), PUT update, lockdown
 - Tenant isolation: workspaces filter by tenant_id (cannot see other tenant's WS)
 - Audit logs / orchestrator / invite carry tenant_id
"""
import os
import uuid
import pytest
import requests

def _load_backend_url():
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if url:
        return url.rstrip("/")
    # fallback: read from frontend/.env
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().rstrip("/")
    except Exception:
        pass
    raise RuntimeError("REACT_APP_BACKEND_URL not set")


BASE_URL = _load_backend_url()
_created = {}  # shared state across test classes
ADMIN_EMAIL = "admin@windesk.cloud"
ADMIN_PASSWORD = "Admin123!"


# ---------- Fixtures ----------
@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def my_tenant(admin_headers):
    r = requests.get(f"{BASE_URL}/api/tenants/me", headers=admin_headers, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


# ---------- LXD trust + project=default ----------
class TestLXD:
    def test_lxd_status_trusted(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/lxd/status", headers=admin_headers, timeout=20)
        # Status must be reachable
        assert r.status_code == 200, f"LXD status {r.status_code}: {r.text}"
        data = r.json()
        # Allow common variants: auth/trusted/connection field
        auth_val = (data.get("auth") or data.get("trusted") or data.get("authentication")
                    or (data.get("metadata") or {}).get("auth"))
        assert auth_val in ("trusted", True, "true"), f"LXD not trusted, got: {data}"

    def test_lxd_instances_default_project(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/lxd/instances", headers=admin_headers, timeout=30)
        assert r.status_code == 200, f"{r.status_code}: {r.text}"
        data = r.json()
        # Accept either {instances:[...]}, {results:[...]}, or list directly
        instances = data if isinstance(data, list) else (
            data.get("instances") or data.get("results") or data.get("items") or [])
        assert isinstance(instances, list), f"unexpected shape: {data}"


# ---------- Tenants core ----------
class TestTenantsCore:
    def test_get_my_tenant_with_counters(self, my_tenant):
        assert "id" in my_tenant
        assert "name" in my_tenant
        assert "slug" in my_tenant
        counters = my_tenant.get("counters")
        assert counters is not None, "counters missing"
        for k in ("users", "workspaces", "applications", "active_sessions", "audit_logs"):
            assert k in counters, f"counter {k} missing"
            assert isinstance(counters[k], int)

    def test_list_all_tenants(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/tenants", headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "tenants" in data and "count" in data
        assert isinstance(data["tenants"], list)
        assert data["count"] >= 1
        for t in data["tenants"]:
            assert "id" in t and "name" in t and "slug" in t
            assert "counters" in t

    def test_create_tenant_and_dup(self, admin_headers):
        # Use only chars that survive slug sanitation (a-z0-9-) so we can compare exactly
        suffix = uuid.uuid4().hex[:8]
        name = f"test-t-{suffix}"
        r = requests.post(f"{BASE_URL}/api/tenants", headers=admin_headers,
                          json={"name": name, "plan": "trial"}, timeout=15)
        assert r.status_code == 200, f"create tenant {r.status_code}: {r.text}"
        body = r.json()
        assert body.get("ok") is True
        t = body["tenant"]
        assert t["name"] == name
        assert t["slug"] == name
        assert t["plan"] == "trial"
        assert "id" in t
        # duplicate slug
        r2 = requests.post(f"{BASE_URL}/api/tenants", headers=admin_headers,
                           json={"name": name, "plan": "trial"}, timeout=15)
        assert r2.status_code == 409, f"expected 409, got {r2.status_code}: {r2.text}"
        _created["tenant_id"] = t["id"]
        _created["tenant_slug"] = t["slug"]

    def test_update_tenant(self, admin_headers):
        tid = _created.get("tenant_id")
        assert tid, "tenant fixture missing"
        r = requests.put(f"{BASE_URL}/api/tenants/{tid}", headers=admin_headers,
                         json={"plan": "pro", "status": "active"}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["tenant"]["plan"] == "pro"
        # 404
        r2 = requests.put(f"{BASE_URL}/api/tenants/non-existent-id", headers=admin_headers,
                          json={"plan": "pro"}, timeout=15)
        assert r2.status_code == 404
        # 400 no valid fields
        r3 = requests.put(f"{BASE_URL}/api/tenants/{tid}", headers=admin_headers,
                          json={"bogus": "x"}, timeout=15)
        assert r3.status_code == 400

    def test_lockdown_tenant(self, admin_headers):
        tid = _created.get("tenant_id")
        assert tid
        r = requests.post(f"{BASE_URL}/api/tenants/{tid}/lockdown",
                          headers=admin_headers, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert body.get("tenant_id") == tid
        assert "killed_sessions" in body
        # status must be lockdown
        r2 = requests.get(f"{BASE_URL}/api/tenants", headers=admin_headers, timeout=10)
        t = next((x for x in r2.json()["tenants"] if x["id"] == tid), None)
        assert t and t.get("status") == "lockdown"


# ---------- Multi-tenant isolation: workspaces ----------
class TestTenantIsolation:
    def test_workspaces_scoped_to_tenant(self, admin_headers, my_tenant):
        r = requests.get(f"{BASE_URL}/api/workspaces", headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        wss = r.json() if isinstance(r.json(), list) else r.json().get("workspaces", [])
        my_tid = my_tenant["id"]
        for w in wss:
            tid = w.get("tenant_id")
            # allow legacy null (will be backfilled) but if set, must equal my tenant
            if tid is not None:
                assert tid == my_tid, f"workspace from another tenant leaked: {w.get('id')} tid={tid}"


# ---------- Audit logs / orchestrator carry tenant_id ----------
class TestTenantScopedAdmin:
    def test_system_logs_filtered(self, admin_headers, my_tenant):
        r = requests.get(f"{BASE_URL}/api/admin/system-logs", headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        logs = data if isinstance(data, list) else (data.get("logs") or data.get("items") or [])
        my_tid = my_tenant["id"]
        leaked = [l for l in logs if l.get("tenant_id") and l["tenant_id"] != my_tid]
        assert not leaked, f"logs from other tenant leaked: {leaked[:2]}"

    def test_orchestrator_counters(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/orchestrator", headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("active_sessions", "pending_invites", "active_workspaces", "completed_today"):
            assert k in data, f"counter {k} missing from orchestrator"
            assert isinstance(data[k], int)


# ---------- Invite inherits tenant_id ----------
class TestInviteTenantInherit:
    def test_invite_user_inherits_tenant(self, admin_headers, my_tenant):
        email = f"TEST_inv_{uuid.uuid4().hex[:6]}@windesk.cloud"
        r = requests.post(f"{BASE_URL}/api/tenants/invite-users", headers=admin_headers,
                          json={"emails": [email], "role": "user"}, timeout=20)
        # Endpoint may return 200 with details
        assert r.status_code in (200, 201), f"{r.status_code}: {r.text}"
        # Now list invited users and verify tenant_id present
        r2 = requests.get(f"{BASE_URL}/api/tenants/invited-users", headers=admin_headers, timeout=15)
        assert r2.status_code == 200, r2.text
        data = r2.json()
        users = data if isinstance(data, list) else (data.get("users") or data.get("invited") or [])
        found = next((u for u in users if (u.get("email") or "").lower() == email.lower()), None)
        assert found, f"invited user {email} not found in /tenants/invited-users response: {data}"
        # tenant_id must equal admin's tenant_id
        assert found.get("tenant_id") == my_tenant["id"], (
            f"invited user tenant_id mismatch: got {found.get('tenant_id')} want {my_tenant['id']}")
