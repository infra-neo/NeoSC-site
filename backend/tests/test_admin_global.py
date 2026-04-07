"""
Test Admin Global Panel (S7) - WinDesk Market
Tests for:
- GET /api/admin/global-stats - KPIs (active_tenants, running_vms, mrr, active_orders)
- GET /api/admin/tenants - List of tenants with name, plan, vms, users, status, mrr
- POST /api/admin/tenants/{id}/lockdown - Suspend a tenant
- POST /api/admin/tenants/{id}/activate - Reactivate a tenant
- GET /api/admin/orchestrator - Workers and queue
- GET /api/admin/system-logs - Log entries
- Non-admin user gets 403 on admin endpoints
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from test_credentials.md
ADMIN_EMAIL = "admin@windesk.cloud"
ADMIN_PASSWORD = "Admin123!"
DEMO_USER_EMAIL = "usuario1@windesk.cloud"
DEMO_USER_PASSWORD = "Demo123!"


@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def admin_token(api_client):
    """Get admin authentication token"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip(f"Admin authentication failed: {response.status_code} - {response.text}")


@pytest.fixture(scope="module")
def demo_user_token(api_client):
    """Get demo user (non-admin) authentication token"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": DEMO_USER_EMAIL,
        "password": DEMO_USER_PASSWORD
    })
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip(f"Demo user authentication failed: {response.status_code} - {response.text}")


@pytest.fixture(scope="module")
def admin_client(api_client, admin_token):
    """Session with admin auth header"""
    api_client.headers.update({"Authorization": f"Bearer {admin_token}"})
    return api_client


class TestAdminGlobalStats:
    """Test GET /api/admin/global-stats endpoint"""
    
    def test_global_stats_returns_kpis(self, api_client, admin_token):
        """Admin can access global stats with KPIs"""
        response = api_client.get(
            f"{BASE_URL}/api/admin/global-stats",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Verify required KPI fields exist
        assert "active_tenants" in data, "Missing active_tenants KPI"
        assert "running_vms" in data, "Missing running_vms KPI"
        assert "mrr" in data, "Missing mrr KPI"
        assert "active_orders" in data, "Missing active_orders KPI"
        
        # Verify data types
        assert isinstance(data["active_tenants"], (int, float)), "active_tenants should be numeric"
        assert isinstance(data["running_vms"], (int, float)), "running_vms should be numeric"
        assert isinstance(data["mrr"], (int, float)), "mrr should be numeric"
        assert isinstance(data["active_orders"], (int, float)), "active_orders should be numeric"
        
        print(f"KPIs: active_tenants={data['active_tenants']}, running_vms={data['running_vms']}, mrr=${data['mrr']}, active_orders={data['active_orders']}")
    
    def test_global_stats_forbidden_for_non_admin(self, api_client, demo_user_token):
        """Non-admin user gets 403 on global-stats"""
        response = api_client.get(
            f"{BASE_URL}/api/admin/global-stats",
            headers={"Authorization": f"Bearer {demo_user_token}"}
        )
        assert response.status_code == 403, f"Expected 403 for non-admin, got {response.status_code}"
        print("Non-admin correctly denied access to global-stats")


class TestAdminTenants:
    """Test GET /api/admin/tenants endpoint"""
    
    def test_tenants_list_returns_5_tenants(self, api_client, admin_token):
        """Admin can get list of tenants with required fields"""
        response = api_client.get(
            f"{BASE_URL}/api/admin/tenants",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        tenants = response.json()
        assert isinstance(tenants, list), "Response should be a list"
        assert len(tenants) >= 5, f"Expected at least 5 tenants, got {len(tenants)}"
        
        # Verify first tenant has required fields
        tenant = tenants[0]
        required_fields = ["name", "plan", "vms", "status", "mrr"]
        for field in required_fields:
            assert field in tenant, f"Tenant missing required field: {field}"
        
        # Verify users field (users_current or users)
        assert "users_current" in tenant or "users" in tenant, "Tenant missing users field"
        
        print(f"Found {len(tenants)} tenants")
        for t in tenants[:5]:
            print(f"  - {t.get('name')}: {t.get('plan')}, {t.get('vms')} VMs, status={t.get('status')}, MRR=${t.get('mrr')}")
    
    def test_tenants_forbidden_for_non_admin(self, api_client, demo_user_token):
        """Non-admin user gets 403 on tenants list"""
        response = api_client.get(
            f"{BASE_URL}/api/admin/tenants",
            headers={"Authorization": f"Bearer {demo_user_token}"}
        )
        assert response.status_code == 403, f"Expected 403 for non-admin, got {response.status_code}"
        print("Non-admin correctly denied access to tenants list")


class TestTenantLockdownActivate:
    """Test POST /api/admin/tenants/{id}/lockdown and /activate endpoints"""
    
    def test_lockdown_tenant(self, api_client, admin_token):
        """Admin can lockdown (suspend) a tenant"""
        # First get tenants to find one to lockdown
        response = api_client.get(
            f"{BASE_URL}/api/admin/tenants",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        tenants = response.json()
        
        # Find a tenant that is not already suspended
        target_tenant = None
        for t in tenants:
            if t.get("status") != "suspended":
                target_tenant = t
                break
        
        if not target_tenant:
            pytest.skip("No active tenant found to test lockdown")
        
        tenant_id = target_tenant.get("id")
        print(f"Testing lockdown on tenant: {target_tenant.get('name')} (id={tenant_id})")
        
        # Lockdown the tenant
        response = api_client.post(
            f"{BASE_URL}/api/admin/tenants/{tenant_id}/lockdown",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "message" in data, "Response should contain message"
        print(f"Lockdown response: {data.get('message')}")
        
        # Verify tenant is now suspended
        response = api_client.get(
            f"{BASE_URL}/api/admin/tenants",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        tenants = response.json()
        updated_tenant = next((t for t in tenants if t.get("id") == tenant_id), None)
        assert updated_tenant is not None, "Tenant not found after lockdown"
        assert updated_tenant.get("status") == "suspended", f"Tenant status should be 'suspended', got '{updated_tenant.get('status')}'"
        print(f"Verified tenant {tenant_id} is now suspended")
    
    def test_activate_tenant(self, api_client, admin_token):
        """Admin can activate a suspended tenant"""
        # First get tenants to find a suspended one
        response = api_client.get(
            f"{BASE_URL}/api/admin/tenants",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        tenants = response.json()
        
        # Find a suspended tenant
        target_tenant = None
        for t in tenants:
            if t.get("status") == "suspended":
                target_tenant = t
                break
        
        if not target_tenant:
            pytest.skip("No suspended tenant found to test activate")
        
        tenant_id = target_tenant.get("id")
        print(f"Testing activate on tenant: {target_tenant.get('name')} (id={tenant_id})")
        
        # Activate the tenant
        response = api_client.post(
            f"{BASE_URL}/api/admin/tenants/{tenant_id}/activate",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "message" in data, "Response should contain message"
        print(f"Activate response: {data.get('message')}")
        
        # Verify tenant is now active
        response = api_client.get(
            f"{BASE_URL}/api/admin/tenants",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        tenants = response.json()
        updated_tenant = next((t for t in tenants if t.get("id") == tenant_id), None)
        assert updated_tenant is not None, "Tenant not found after activate"
        assert updated_tenant.get("status") == "activo", f"Tenant status should be 'activo', got '{updated_tenant.get('status')}'"
        print(f"Verified tenant {tenant_id} is now activo")
    
    def test_lockdown_forbidden_for_non_admin(self, api_client, demo_user_token):
        """Non-admin user gets 403 on lockdown"""
        response = api_client.post(
            f"{BASE_URL}/api/admin/tenants/tenant-1/lockdown",
            headers={"Authorization": f"Bearer {demo_user_token}"}
        )
        assert response.status_code == 403, f"Expected 403 for non-admin, got {response.status_code}"
        print("Non-admin correctly denied access to lockdown")
    
    def test_activate_forbidden_for_non_admin(self, api_client, demo_user_token):
        """Non-admin user gets 403 on activate"""
        response = api_client.post(
            f"{BASE_URL}/api/admin/tenants/tenant-1/activate",
            headers={"Authorization": f"Bearer {demo_user_token}"}
        )
        assert response.status_code == 403, f"Expected 403 for non-admin, got {response.status_code}"
        print("Non-admin correctly denied access to activate")


class TestAdminOrchestrator:
    """Test GET /api/admin/orchestrator endpoint"""
    
    def test_orchestrator_returns_workers_and_queue(self, api_client, admin_token):
        """Admin can access orchestrator with workers and queue"""
        response = api_client.get(
            f"{BASE_URL}/api/admin/orchestrator",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Verify required fields
        assert "workers" in data, "Missing workers field"
        assert "queue" in data, "Missing queue field"
        
        # Verify workers is a list
        assert isinstance(data["workers"], list), "workers should be a list"
        assert len(data["workers"]) > 0, "Should have at least one worker"
        
        # Verify worker structure
        worker = data["workers"][0]
        assert "name" in worker, "Worker missing name"
        assert "status" in worker, "Worker missing status"
        
        # Verify queue is a list
        assert isinstance(data["queue"], list), "queue should be a list"
        
        print(f"Orchestrator: {len(data['workers'])} workers, {len(data['queue'])} items in queue")
        for w in data["workers"]:
            print(f"  Worker: {w.get('name')} - {w.get('status')}")
    
    def test_orchestrator_forbidden_for_non_admin(self, api_client, demo_user_token):
        """Non-admin user gets 403 on orchestrator"""
        response = api_client.get(
            f"{BASE_URL}/api/admin/orchestrator",
            headers={"Authorization": f"Bearer {demo_user_token}"}
        )
        assert response.status_code == 403, f"Expected 403 for non-admin, got {response.status_code}"
        print("Non-admin correctly denied access to orchestrator")


class TestAdminSystemLogs:
    """Test GET /api/admin/system-logs endpoint"""
    
    def test_system_logs_returns_entries(self, api_client, admin_token):
        """Admin can access system logs"""
        response = api_client.get(
            f"{BASE_URL}/api/admin/system-logs",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        logs = response.json()
        assert isinstance(logs, list), "Response should be a list"
        
        if len(logs) > 0:
            log = logs[0]
            # Logs can have different structures (audit logs vs system logs)
            # Check for common fields
            has_timestamp = "timestamp" in log
            has_message = "message" in log or "details" in log or "action" in log
            assert has_timestamp or has_message, "Log entry should have timestamp or message/details"
            
            print(f"Found {len(logs)} log entries")
            for l in logs[:5]:
                msg = l.get("message") or l.get("details") or l.get("action", "")
                print(f"  [{l.get('level', l.get('source', 'info'))}] {msg[:60]}...")
        else:
            print("No log entries found (empty list)")
    
    def test_system_logs_forbidden_for_non_admin(self, api_client, demo_user_token):
        """Non-admin user gets 403 on system-logs"""
        response = api_client.get(
            f"{BASE_URL}/api/admin/system-logs",
            headers={"Authorization": f"Bearer {demo_user_token}"}
        )
        assert response.status_code == 403, f"Expected 403 for non-admin, got {response.status_code}"
        print("Non-admin correctly denied access to system-logs")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
