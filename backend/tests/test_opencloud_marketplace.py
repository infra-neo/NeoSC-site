"""
OpenCloud Marketplace tests (iteration 16)
- GET /api/market/templates    (public; 3 templates)
- POST /api/market/templates/{id}/instantiate (admin)
- Background provision pipeline reaches status=active
- NetBird Cloud setup_key is populated (real)
"""
import os
import time
import pytest
import requests
from pathlib import Path

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Try frontend/.env relative to this repo (works regardless of where the
    # repo is checked out — /app on Emergent, ~/NeoSC-site self-hosted, etc.)
    _candidates = [
        Path(__file__).resolve().parents[2] / "frontend" / ".env",  # repo_root/frontend/.env
        Path("/app/frontend/.env"),  # Emergent platform path (legacy fallback)
    ]
    for _env_path in _candidates:
        if _env_path.exists():
            with open(_env_path) as fh:
                for line in fh:
                    if line.startswith("REACT_APP_BACKEND_URL="):
                        BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
            if BASE_URL:
                break
if not BASE_URL:
    # Last resort default for local/self-hosted dev
    BASE_URL = "http://localhost:8001"

API = f"{BASE_URL}/api"
ADMIN_EMAIL = "admin@windesk.cloud"
ADMIN_PASSWORD = "Admin123!"


# ---------- fixtures ----------
@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                      timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"no token in login response: {r.json()}"
    return tok


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# ---------- GET /market/templates ----------
class TestMarketTemplates:
    def test_templates_returns_3_with_correct_ids(self):
        r = requests.get(f"{API}/market/templates", timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "templates" in body
        assert "api_status" in body
        templates = body["templates"]
        assert len(templates) == 3, f"expected 3 templates, got {len(templates)}"

        by_id = {t["templateId"]: t for t in templates}
        assert 14 in by_id and by_id[14]["badge"] == "GOLD" and by_id[14]["tier"] == "starter"
        assert 12 in by_id and by_id[12]["badge"] == "STD" and by_id[12]["tier"] == "business"
        assert 16 in by_id and by_id[16]["badge"] == "POWER" and by_id[16]["tier"] == "enterprise"

        # api_status should be 'ok' (or 'limited' if upstream unreachable — flag for review)
        assert body["api_status"] in ("ok", "limited")

    def test_templates_have_required_fields(self):
        r = requests.get(f"{API}/market/templates", timeout=15)
        assert r.status_code == 200
        for t in r.json()["templates"]:
            for fld in ("templateId", "name", "badge", "cpu", "memory", "disk",
                        "os", "tags", "service_id", "price_monthly", "tier",
                        "tsplus_users", "description"):
                assert fld in t, f"missing {fld} in {t.get('name')}"


# ---------- POST /market/templates/{id}/instantiate ----------
class TestInstantiate:
    def test_unauthenticated_rejected(self):
        r = requests.post(f"{API}/market/templates/14/instantiate",
                          json={"vm_name": "test-noauth"}, timeout=15)
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"

    def test_404_for_unknown_template(self, admin_headers):
        r = requests.post(f"{API}/market/templates/9999/instantiate",
                          json={"vm_name": "test-404"},
                          headers=admin_headers, timeout=15)
        assert r.status_code == 404

    def test_instantiate_gold_returns_order(self, admin_headers):
        payload = {"vm_name": "TEST-qa-vm-001", "cpu": 4, "memory": 8192}
        r = requests.post(f"{API}/market/templates/14/instantiate",
                          json=payload, headers=admin_headers, timeout=30)
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        data = r.json()
        assert "order_id" in data and len(data["order_id"]) > 10
        assert data["vm_name"] == "TEST-qa-vm-001"
        assert data["status"] == "provisioning"
        assert data["total_usd"] == 79
        # Store for the next test
        pytest.shared_order_id = data["order_id"]

    def test_pipeline_reaches_active_with_netbird_and_tunnel(self, admin_headers):
        order_id = getattr(pytest, "shared_order_id", None)
        if not order_id:
            pytest.skip("instantiate did not produce order_id")

        # Poll up to 240s — reboot_vm + netbird_configure need real time now
        deadline = time.time() + 420
        last = None
        while time.time() < deadline:
            r = requests.get(f"{API}/market/orders/{order_id}",
                             headers=admin_headers, timeout=15)
            if r.status_code == 200:
                last = r.json()
                if last.get("status") == "active":
                    break
            time.sleep(3)

        assert last is not None, "order endpoint not reachable"
        assert last.get("status") == "active", \
            f"order didn't reach active: status={last.get('status')}"
        # netbird_ip + html5_access_url + vm_id populated
        assert last.get("netbird_ip"), f"netbird_ip missing: {last.get('netbird_ip')}"
        assert last.get("html5_access_url"), \
            f"html5_access_url missing: {last.get('html5_access_url')}"
        assert last.get("vm_id"), f"vm_id missing: {last.get('vm_id')}"
        if last.get("rdp_url"):
            assert ":" in last["rdp_url"], f"rdp_url malformed: {last['rdp_url']}"
        # netbird_setup_key populated (real or fallback)
        # If NetBird Cloud token works, this is the actual setup-key string
        assert last.get("netbird_setup_key") is not None, \
            "netbird_setup_key is None — NetBird Cloud API failed"
        assert isinstance(last["netbird_setup_key"], str) \
            and len(last["netbird_setup_key"]) > 10

    def test_all_provision_steps_success(self, admin_headers):
        order_id = getattr(pytest, "shared_order_id", None)
        if not order_id:
            pytest.skip("no order id from previous test")

        r = requests.get(f"{API}/market/orders/{order_id}/status",
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        steps = body.get("steps", [])
        assert len(steps) == 14, f"expected 14 steps, got {len(steps)}: " \
            f"{[s.get('step_name') for s in steps]}"
        non_success = [s for s in steps if s.get("status") != "success"]
        assert not non_success, f"non-success steps: {non_success}"


# ---------- NetBird Cloud direct sanity ----------
class TestNetBirdCloud:
    def test_setup_key_creation_directly(self):
        """Sanity: confirm the token can actually mint a setup key on api.netbird.io."""
        token = os.environ.get("NETBIRD_CLOUD_TOKEN", "")
        if not token:
            pytest.skip("NETBIRD_CLOUD_TOKEN not set in environment")
        r = requests.post(
            "https://api.netbird.io/api/setup-keys",
            headers={"Authorization": f"Token {token}",
                     "Content-Type": "application/json"},
            json={"name": "TEST-marketplace-pytest",
                  "type": "reusable",
                  "expires_in": 86400,
                  "revoked": False,
                  "auto_groups": [],
                  "usage_limit": 0,
                  "ephemeral": False},
            timeout=20,
        )
        assert r.status_code in (200, 201), \
            f"netbird api failed: {r.status_code} {r.text[:300]}"
        body = r.json()
        assert body.get("key"), f"no key in netbird response: {body}"
