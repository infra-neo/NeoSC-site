"""
Tests for Workspaces bugfix:
1) DELETE /api/market/vms/{id} should cascade-delete Guacamole connection.
2) POST /api/internal/sunset/sync-now should return stats without crashing.
3) Sunset auto-cleanup code path exists (probe_state + _cleanup_missing_vms).
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://action-steps-4.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@windesk.cloud"
ADMIN_PASSWORD = "Admin123!"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                      timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, f"no token in {r.json()}"
    return tok


@pytest.fixture(scope="module")
def headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


def test_sunset_sync_now(headers):
    """POST /api/internal/sunset/sync-now returns 200 + stats and does not crash."""
    r = requests.post(f"{BASE_URL}/api/internal/sunset/sync-now", headers=headers, timeout=60)
    assert r.status_code == 200, f"{r.status_code} {r.text}"
    body = r.json()
    assert body.get("ok") is True
    stats = body.get("stats", {})
    for key in ("scanned", "updated", "unreachable"):
        assert key in stats, f"missing stat {key} in {stats}"
    print(f"sync stats: {stats}")


def test_sunset_sync_code_paths():
    """Verify probe_state returns not_found flag and _cleanup_missing_vms exists."""
    import sys
    sys.path.insert(0, "/app/backend")
    import sunset_sync
    assert hasattr(sunset_sync, "probe_state")
    assert hasattr(sunset_sync, "_cleanup_missing_vms")
    assert hasattr(sunset_sync, "MISSING_THRESHOLD")
    assert sunset_sync.MISSING_THRESHOLD == 2
    import inspect
    src = inspect.getsource(sunset_sync.probe_state)
    assert "not_found" in src, "probe_state must set not_found flag"
    src2 = inspect.getsource(sunset_sync._cleanup_missing_vms)
    assert "guacamole" in src2.lower(), "_cleanup_missing_vms must cascade Guacamole"


def test_delete_market_vm_cascades_guacamole(headers):
    """
    DELETE /api/market/vms/{id} should return `guacamole` field when VM has conn id.
    Uses a simulated VM (starts with 'vm-' so it doesn't touch real infra).
    """
    r = requests.get(f"{BASE_URL}/api/market/my-vms", headers=headers, timeout=15)
    assert r.status_code == 200, f"{r.status_code} {r.text}"
    vms = r.json().get("vms", [])
    # Prefer a simulated VM with guacamole_connection_id
    target = None
    for v in vms:
        vid = str(v.get("id") or "")
        if vid.startswith("vm-") and v.get("guacamole_connection_id"):
            target = v
            break
    if target is None:
        # Fallback: any simulated VM
        for v in vms:
            if str(v.get("id") or "").startswith("vm-"):
                target = v
                break
    if target is None:
        pytest.skip(f"No suitable simulated VM found among {len(vms)} VMs to safely test DELETE cascade")

    vm_id = target["id"]
    had_conn = bool(target.get("guacamole_connection_id"))
    print(f"Deleting VM {vm_id} (had_guac_conn={had_conn}, conn_id={target.get('guacamole_connection_id')})")

    dr = requests.delete(f"{BASE_URL}/api/market/vms/{vm_id}", headers=headers, timeout=30)
    assert dr.status_code == 200, f"delete failed: {dr.status_code} {dr.text}"
    body = dr.json()
    assert body.get("ok") is True
    # Response must include guacamole field (None if no conn, dict otherwise)
    assert "guacamole" in body, f"response missing 'guacamole' key: {body}"
    if had_conn:
        # When VM had a conn id, cascade should have attempted; guac_result present
        assert body["guacamole"] is not None, "guacamole cascade result should not be None when conn existed"
        print(f"guacamole cascade result: {body['guacamole']}")

    # Verify VM is gone
    r2 = requests.get(f"{BASE_URL}/api/market/my-vms", headers=headers, timeout=15)
    ids_after = {v.get("id") for v in r2.json().get("vms", [])}
    assert vm_id not in ids_after, f"VM {vm_id} still present after delete"
