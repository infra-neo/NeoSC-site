"""
P0 bugs test suite — iteration 12
Covers:
  - GET /api/admin/orchestrator (real workers/queue/stats)
  - GET /api/admin/system-logs (source/level classification + prefixed messages)
  - GET /api/zitadel/my-org (org metadata, roles, status)
  - POST /api/admin/orders/{id}/retry (404 + happy-path retry_count++)
  - POST /api/admin/workspaces/{id}/suspend (404 + happy-path suspend)
"""
import os
import uuid
import pytest
import requests
from datetime import datetime, timezone

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL is required"

ADMIN_EMAIL = "admin@windesk.cloud"
ADMIN_PASSWORD = "Admin123!"
USER_EMAIL = "usuario1@windesk.cloud"
USER_PASSWORD = "Demo123!"


# ---------- Fixtures ----------
@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def user_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": USER_EMAIL, "password": USER_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def auth(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---------- /api/admin/orchestrator ----------
class TestOrchestrator:
    def test_returns_real_shape(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/admin/orchestrator",
                         headers=auth(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        # top-level keys
        for k in ("workers", "queue", "active_count", "completed_today",
                  "active_sessions", "pending_invites", "active_workspaces"):
            assert k in d, f"missing {k}"
        # workers: provision/tsplus/notify/workspace/backup
        names = [w["name"] for w in d["workers"]]
        for expected in ("provision@worker-1", "tsplus@worker-1",
                         "notify@worker-1", "workspace@worker-1", "backup@worker-1"):
            assert expected in names, f"missing worker {expected}"
        # counters are ints
        assert isinstance(d["active_sessions"], int)
        assert isinstance(d["pending_invites"], int)
        assert isinstance(d["active_workspaces"], int)
        assert isinstance(d["completed_today"], int)

    def test_worker_tasks_linked_to_real_counts(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/admin/orchestrator",
                         headers=auth(admin_token), timeout=15).json()
        workers_by_name = {w["name"]: w for w in r["workers"]}
        # tsplus worker tasks == active_sessions
        assert workers_by_name["tsplus@worker-1"]["tasks"] == r["active_sessions"]
        # notify worker tasks == pending_invites
        assert workers_by_name["notify@worker-1"]["tasks"] == r["pending_invites"]
        # workspace worker tasks == active_workspaces
        assert workers_by_name["workspace@worker-1"]["tasks"] == r["active_workspaces"]

    def test_requires_admin(self, user_token):
        r = requests.get(f"{BASE_URL}/api/admin/orchestrator",
                         headers=auth(user_token), timeout=15)
        assert r.status_code in (401, 403)


# ---------- /api/admin/system-logs ----------
class TestSystemLogs:
    ALLOWED_SOURCES = {"auth", "workspace", "tenant", "zitadel", "netbird",
                       "lxd", "neovdi", "tsplus", "payment", "orchestrator", "worker-1"}
    ALLOWED_LEVELS = {"info", "warn", "error"}

    def test_shape(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/admin/system-logs",
                         headers=auth(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        logs = r.json()
        assert isinstance(logs, list) and len(logs) > 0
        for entry in logs[:10]:
            assert "timestamp" in entry
            assert entry.get("level") in self.ALLOWED_LEVELS, f"bad level: {entry}"
            assert entry.get("source") in self.ALLOWED_SOURCES, f"bad source: {entry}"
            assert entry.get("message"), f"empty message: {entry}"

    def test_message_prefix_when_user_present(self, admin_token):
        """If entry has user_email in audit_log, message must be '[email] ...'"""
        r = requests.get(f"{BASE_URL}/api/admin/system-logs",
                         headers=auth(admin_token), timeout=15).json()
        # Generate a known audit log: login as admin again
        requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
        r2 = requests.get(f"{BASE_URL}/api/admin/system-logs",
                          headers=auth(admin_token), timeout=15).json()
        with_prefix = [l for l in r2 if l["message"].startswith("[")]
        assert with_prefix, "expected at least one log with [email] prefix"

    def test_requires_admin(self, user_token):
        r = requests.get(f"{BASE_URL}/api/admin/system-logs",
                         headers=auth(user_token), timeout=15)
        assert r.status_code in (401, 403)


# ---------- /api/zitadel/my-org ----------
class TestZitadelMyOrg:
    REQUIRED_KEYS = {"org_id", "org_name", "domain", "project_id",
                     "app_client_id", "neovdi_client_id", "user_count",
                     "user_email", "user_role", "status"}

    def test_structure(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/zitadel/my-org",
                         headers=auth(admin_token), timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        missing = self.REQUIRED_KEYS - set(d.keys())
        assert not missing, f"missing keys: {missing}"
        assert d["status"] in {"connected", "not_configured", "error", "unknown"}
        assert d["user_email"] == ADMIN_EMAIL
        assert d["user_role"] == "admin"
        # roles array always present (may be empty if error)
        assert "roles" in d and isinstance(d["roles"], list)

    def test_user_can_read(self, user_token):
        """my-org is available to any authenticated user."""
        r = requests.get(f"{BASE_URL}/api/zitadel/my-org",
                         headers=auth(user_token), timeout=20)
        assert r.status_code == 200
        assert r.json()["user_email"] == USER_EMAIL


# ---------- /api/admin/orders/{id}/retry ----------
class TestOrderRetry:
    def test_404_on_missing(self, admin_token):
        r = requests.post(f"{BASE_URL}/api/admin/orders/nonexistent-xyz-123/retry",
                          headers=auth(admin_token), timeout=15)
        assert r.status_code == 404

    def test_requires_admin(self, user_token):
        r = requests.post(f"{BASE_URL}/api/admin/orders/any/retry",
                          headers=auth(user_token), timeout=15)
        assert r.status_code in (401, 403)

    def test_retry_increments_count(self, admin_token):
        # Create a real market_order via the admin-available seed path:
        # POST /api/market/orders (which requires auth)
        order_id = f"TEST_ORDER_{uuid.uuid4().hex[:8]}"
        # Directly insert via admin API: POST a preview order
        resp = requests.post(
            f"{BASE_URL}/api/market/orders",
            headers=auth(admin_token),
            json={"plan_id": "neosc_starter", "organization": "TEST_RetryOrg",
                  "customer_email": "test_retry@example.com", "users": 3},
            timeout=15,
        )
        if resp.status_code != 200:
            pytest.skip(f"cannot create order for test: {resp.status_code} {resp.text[:120]}")
        created = resp.json()
        real_id = created.get("id") or created.get("order_id")
        assert real_id, f"no id in created: {created}"

        r = requests.post(f"{BASE_URL}/api/admin/orders/{real_id}/retry",
                          headers=auth(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert body.get("retry_count", 0) >= 1
        # second retry should bump further
        r2 = requests.post(f"{BASE_URL}/api/admin/orders/{real_id}/retry",
                           headers=auth(admin_token), timeout=15).json()
        assert r2["retry_count"] == body["retry_count"] + 1


# ---------- /api/admin/workspaces/{id}/suspend ----------
class TestWorkspaceSuspend:
    def test_404_on_missing(self, admin_token):
        r = requests.post(f"{BASE_URL}/api/admin/workspaces/does-not-exist/suspend",
                          headers=auth(admin_token), timeout=15)
        assert r.status_code == 404

    def test_requires_admin(self, user_token):
        r = requests.post(f"{BASE_URL}/api/admin/workspaces/any-id/suspend",
                          headers=auth(user_token), timeout=15)
        assert r.status_code in (401, 403)

    def test_suspend_changes_status(self, admin_token):
        # Need a real workspace. Try to find one first:
        r = requests.get(f"{BASE_URL}/api/admin/workspaces",
                         headers=auth(admin_token), timeout=15)
        if r.status_code != 200:
            pytest.skip(f"cannot list workspaces: {r.status_code}")
        workspaces = r.json()
        running = [w for w in workspaces if w.get("status") != "suspended"]
        if not running:
            pytest.skip("no non-suspended workspace available for suspend test")
        ws = running[0]
        ws_id = ws["id"]
        # capture original status so we can restore
        original_status = ws.get("status")
        r = requests.post(f"{BASE_URL}/api/admin/workspaces/{ws_id}/suspend",
                          headers=auth(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert body.get("workspace_id") == ws_id
        assert "killed_sessions" in body

        # verify via list
        r2 = requests.get(f"{BASE_URL}/api/admin/workspaces",
                          headers=auth(admin_token), timeout=15).json()
        target = next((w for w in r2 if w["id"] == ws_id), None)
        assert target is not None
        assert target["status"] == "suspended"

        # restore to reduce test side-effects (best effort)
        if original_status and original_status != "suspended":
            try:
                requests.patch(f"{BASE_URL}/api/admin/workspaces/{ws_id}",
                               headers=auth(admin_token),
                               json={"status": original_status}, timeout=10)
            except Exception:
                pass
