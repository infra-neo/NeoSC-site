"""
Iter-19: Tests for GET /api/market/vms/{vm_id}/connect-url — Guacamole token passthrough.

- Requires a seeded market_vm doc (fixture inserts + cleans up).
- Verifies 200 with guacamole:true & url containing token= for Guacamole VMs.
- Verifies fresh token per call (two consecutive calls -> different tokens).
- Verifies netbird-fallback for VM without guacamole_connection_id.
- Verifies 404 for missing VM, 403 for non-admin accessing another user's VM.
"""
import os
import sys
import asyncio
import pytest
import requests
from urllib.parse import urlparse, parse_qs

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "https://action-steps-4.preview.emergentagent.com").rstrip("/")
# Load backend .env for MONGO_URL / DB_NAME
try:
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
except Exception:
    pass
ADMIN_EMAIL = "admin@windesk.cloud"
ADMIN_PASSWORD = "Admin123!"
USER_EMAIL = "usuario1@windesk.cloud"
USER_PASSWORD = "Demo123!"

sys.path.insert(0, "/app/backend")


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    d = r.json()
    return d.get("access_token") or d.get("token")


@pytest.fixture(scope="module")
def admin_headers():
    tok = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def user_headers():
    tok = _login(USER_EMAIL, USER_PASSWORD)
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def seeded_vms():
    """Insert two temporary VMs directly in Mongo: one Guacamole, one NetBird fallback."""
    from motor.motor_asyncio import AsyncIOMotorClient
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    guac_vm = {
        "id": "vm-test-passthrough-guac",
        "name": "test-passthrough-guac",
        "source": "opennebula-marketplace",
        "status": "running",
        "tsplus_licenses": 3,
        "guacamole_connection_id": 999,
        "guacamole_enrollment": "ok",
        "user_id": "admin-user-id",
    }
    nb_vm = {
        "id": "vm-test-passthrough-netbird",
        "name": "test-passthrough-netbird",
        "source": "opennebula-marketplace",
        "status": "running",
        "connection_url": "https://web.proxy.kappa4.com/nb-fallback",
        "user_id": "admin-user-id",
    }
    other_vm = {
        "id": "vm-test-passthrough-other-owner",
        "name": "test-passthrough-other",
        "source": "opennebula-marketplace",
        "status": "running",
        "guacamole_connection_id": 999,
        "guacamole_enrollment": "ok",
        "user_id": "some-other-user-id",  # Not the admin, not usuario1
    }

    async def _setup():
        for v in (guac_vm, nb_vm, other_vm):
            await db.market_vms.delete_one({"id": v["id"]})
            await db.market_vms.insert_one(dict(v))

    async def _teardown():
        for v in (guac_vm, nb_vm, other_vm):
            await db.market_vms.delete_one({"id": v["id"]})

    asyncio.get_event_loop().run_until_complete(_setup())
    yield {"guac": guac_vm["id"], "netbird": nb_vm["id"], "other": other_vm["id"]}
    asyncio.get_event_loop().run_until_complete(_teardown())
    client.close()


def _extract_token(url: str) -> str:
    """Token lives in the fragment (#/client/xxx?token=...) not the query."""
    if "token=" not in url:
        return ""
    return url.split("token=", 1)[1].split("&", 1)[0]


def test_connect_url_guacamole(admin_headers, seeded_vms):
    r = requests.get(f"{BASE_URL}/api/market/vms/{seeded_vms['guac']}/connect-url",
                     headers=admin_headers, timeout=30)
    assert r.status_code == 200, f"{r.status_code} {r.text}"
    body = r.json()
    assert body.get("ok") is True
    assert body.get("guacamole") is True
    assert body.get("connection_id") == 999
    url = body.get("url", "")
    assert "/guacamole/#/client/" in url or "/#/client/" in url, f"unexpected url: {url}"
    tok = _extract_token(url)
    assert tok, f"no token in url: {url}"
    print(f"guac url head: {url[:120]}... token[:16]={tok[:16]}")


def test_connect_url_fresh_token(admin_headers, seeded_vms):
    """Two consecutive calls must mint different tokens."""
    tokens = []
    for _ in range(2):
        r = requests.get(f"{BASE_URL}/api/market/vms/{seeded_vms['guac']}/connect-url",
                         headers=admin_headers, timeout=30)
        assert r.status_code == 200
        tokens.append(_extract_token(r.json().get("url", "")))
    print(f"token1[:16]={tokens[0][:16]} token2[:16]={tokens[1][:16]}")
    assert tokens[0] and tokens[1], "both tokens must exist"
    assert tokens[0] != tokens[1], "tokens should differ between calls"


def test_connect_url_netbird_fallback(admin_headers, seeded_vms):
    r = requests.get(f"{BASE_URL}/api/market/vms/{seeded_vms['netbird']}/connect-url",
                     headers=admin_headers, timeout=15)
    assert r.status_code == 200, f"{r.status_code} {r.text}"
    body = r.json()
    assert body.get("ok") is True
    assert body.get("guacamole") is False
    assert body.get("source") == "netbird-fallback"
    assert body.get("url") == "https://web.proxy.kappa4.com/nb-fallback"


def test_connect_url_404(admin_headers):
    r = requests.get(f"{BASE_URL}/api/market/vms/does-not-exist-xyz/connect-url",
                     headers=admin_headers, timeout=15)
    assert r.status_code == 404


def test_connect_url_403_other_owner(user_headers, seeded_vms):
    """Non-admin accessing another user's VM must get 403."""
    r = requests.get(f"{BASE_URL}/api/market/vms/{seeded_vms['other']}/connect-url",
                     headers=user_headers, timeout=15)
    assert r.status_code == 403, f"expected 403 got {r.status_code} {r.text}"


def test_connect_url_admin_can_access_other_owner(admin_headers, seeded_vms):
    """Admin should be able to access any VM."""
    r = requests.get(f"{BASE_URL}/api/market/vms/{seeded_vms['other']}/connect-url",
                     headers=admin_headers, timeout=30)
    assert r.status_code == 200, f"admin should access any VM; got {r.status_code} {r.text}"
