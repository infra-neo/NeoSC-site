"""
NeoCloud Wizard iter-17 backend tests
- POST /api/market/templates/14/instantiate (no vm_name) → vm_name = NEOSC-VDI-XXXX
- After provisioning: order.status=active, netbird_ip set, html5_access_url=https://vdi.eu1.netbird.services,
  workspace_id set, and entry in /api/market/my-vms with source='opennebula-marketplace' and connection_url=html5_access_url
"""
import os
import re
import time
import pytest
import requests

# Load BASE_URL from frontend/.env
BASE_URL = ""
with open("/app/frontend/.env") as fh:
    for line in fh:
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().rstrip("/")

API = f"{BASE_URL}/api"
ADMIN_EMAIL = "admin@windesk.cloud"
ADMIN_PASSWORD = "Admin123!"
EXPECTED_EXPOSE_URL = "https://vdi.eu1.netbird.services"
VM_NAME_RE = re.compile(r"^NEOSC-VDI-[0-9A-F]{4}$")


@pytest.fixture(scope="session")
def admin_headers():
    r = requests.post(f"{API}/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                      timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"no token in response: {r.json()}"
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


class TestInstantiateAutoName:
    """POST instantiate without vm_name must generate NEOSC-VDI-XXXX"""

    def test_instantiate_no_vmname_returns_neosc_pattern(self, admin_headers):
        r = requests.post(f"{API}/market/templates/14/instantiate",
                          headers=admin_headers,
                          json={},  # no vm_name
                          timeout=30)
        assert r.status_code == 200, f"got {r.status_code}: {r.text}"
        body = r.json()
        assert "order_id" in body
        assert "vm_name" in body
        assert VM_NAME_RE.match(body["vm_name"]), \
            f"vm_name '{body['vm_name']}' doesn't match NEOSC-VDI-XXXX (4 uppercase hex)"

    def test_instantiate_no_vmname_uniqueness(self, admin_headers):
        # 2 successive calls produce different names
        a = requests.post(f"{API}/market/templates/14/instantiate",
                          headers=admin_headers, json={}, timeout=30).json()
        b = requests.post(f"{API}/market/templates/14/instantiate",
                          headers=admin_headers, json={}, timeout=30).json()
        assert a["vm_name"] != b["vm_name"], "two instantiate calls returned the same vm_name"


class TestProvisionPipelineFullActive:
    """End-to-end: instantiate → wait → order is active with all iter-17 fields populated"""

    @pytest.fixture(scope="class")
    def provisioned_order(self, admin_headers):
        r = requests.post(f"{API}/market/templates/14/instantiate",
                          headers=admin_headers, json={}, timeout=30)
        assert r.status_code == 200, r.text
        order_id = r.json()["order_id"]
        vm_name = r.json()["vm_name"]

        # Poll up to ~130s (netbird polling can take ~80s + provisioning ~30s)
        deadline = time.time() + 140
        last_status = None
        order = None
        while time.time() < deadline:
            o = requests.get(f"{API}/market/orders/{order_id}",
                             headers=admin_headers, timeout=15)
            if o.status_code == 200:
                order = o.json()
                last_status = order.get("status")
                if last_status in ("active", "failed"):
                    break
            time.sleep(4)
        assert order is not None, "order doc never fetched"
        assert last_status == "active", f"order didn't reach active in 140s, status={last_status}"
        return {"order_id": order_id, "vm_name": vm_name, "order": order, "headers": admin_headers}

    def test_order_has_netbird_ip(self, provisioned_order):
        order = provisioned_order["order"]
        ip = order.get("netbird_ip")
        assert ip, f"netbird_ip not set on order: {order}"
        # Real registered peer OR fallback (100.92.x.x); accept either
        assert isinstance(ip, str) and len(ip) >= 7

    def test_order_has_html5_access_url(self, provisioned_order):
        order = provisioned_order["order"]
        assert order.get("html5_access_url") == EXPECTED_EXPOSE_URL, \
            f"html5_access_url mismatch: {order.get('html5_access_url')}"

    def test_order_has_workspace_id(self, provisioned_order):
        assert provisioned_order["order"].get("workspace_id"), \
            f"workspace_id not set on order: {provisioned_order['order']}"

    def test_my_vms_contains_marketplace_entry(self, provisioned_order):
        headers = provisioned_order["headers"]
        vm_name = provisioned_order["vm_name"]
        r = requests.get(f"{API}/market/my-vms", headers=headers, timeout=15)
        assert r.status_code == 200, r.text
        vms = r.json() if isinstance(r.json(), list) else r.json().get("vms", [])
        assert isinstance(vms, list), f"unexpected my-vms response shape: {r.json()}"
        # Find our VM by name OR by source=opennebula-marketplace + html5_access_url
        match = next(
            (v for v in vms
             if v.get("name") == vm_name or v.get("vm_name") == vm_name),
            None,
        )
        assert match is not None, \
            f"vm '{vm_name}' not found in my-vms. Available: {[v.get('name') or v.get('vm_name') for v in vms]}"
        assert match.get("source") == "opennebula-marketplace", \
            f"source mismatch: {match.get('source')}"
        assert match.get("connection_url") == EXPECTED_EXPOSE_URL, \
            f"connection_url mismatch: {match.get('connection_url')}"
