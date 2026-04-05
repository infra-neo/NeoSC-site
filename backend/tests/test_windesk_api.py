"""
WinDesk Cloud API Tests
Tests all backend API endpoints for the WinDesk Market SaaS application.
Covers: Auth, Workspaces, Sessions, Applications, Audit Logs, Organizations, Policies, Market, Stats
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


class TestHealthAndRoot:
    """Basic API health checks"""
    
    def test_api_root(self):
        """GET /api/ - API root returns version info"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "version" in data
        print(f"✓ API root: {data['message']} v{data['version']}")


class TestAuthentication:
    """Authentication endpoint tests"""
    
    def test_login_admin_success(self):
        """POST /api/auth/login - Admin login returns access_token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        assert data["user"]["email"] == ADMIN_EMAIL
        assert data["user"]["role"] == "admin"
        print(f"✓ Admin login successful: {data['user']['email']} (role: {data['user']['role']})")
    
    def test_login_demo_user_success(self):
        """POST /api/auth/login - Demo user login returns access_token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": DEMO_USER_EMAIL,
            "password": DEMO_USER_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        assert data["user"]["email"] == DEMO_USER_EMAIL
        print(f"✓ Demo user login successful: {data['user']['email']}")
    
    def test_login_invalid_credentials(self):
        """POST /api/auth/login - Invalid credentials returns 401"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "wrong@example.com",
            "password": "wrongpassword"
        })
        assert response.status_code == 401
        print("✓ Invalid credentials correctly rejected with 401")
    
    def test_auth_me_without_token(self):
        """GET /api/auth/me - Without token returns 401"""
        response = requests.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 401
        print("✓ /auth/me without token correctly returns 401")


class TestAuthenticatedEndpoints:
    """Tests requiring authentication"""
    
    @pytest.fixture(autouse=True)
    def setup_auth(self):
        """Get auth token before each test"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            self.token = response.json()["access_token"]
            self.headers = {"Authorization": f"Bearer {self.token}"}
            self.user = response.json()["user"]
        else:
            pytest.skip("Authentication failed")
    
    def test_auth_me_with_token(self):
        """GET /api/auth/me - With valid token returns user info"""
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == ADMIN_EMAIL
        print(f"✓ /auth/me returns user: {data['email']}")
    
    # ============ STATS ============
    def test_get_stats(self):
        """GET /api/stats - Returns stats object"""
        response = requests.get(f"{BASE_URL}/api/stats", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert "active_sessions" in data
        assert "total_workspaces" in data
        assert "total_users" in data
        assert "security_score" in data
        print(f"✓ Stats: {data['total_users']} users, {data['total_workspaces']} workspaces, {data['active_sessions']} active sessions")
    
    # ============ WORKSPACES ============
    def test_get_workspaces(self):
        """GET /api/workspaces - Returns workspace list"""
        response = requests.get(f"{BASE_URL}/api/workspaces", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Workspaces: {len(data)} workspaces returned")
        if data:
            ws = data[0]
            assert "id" in ws
            assert "name" in ws
            print(f"  First workspace: {ws['name']} ({ws['id']})")
    
    # ============ APPLICATIONS ============
    def test_get_applications(self):
        """GET /api/applications - Returns applications list"""
        response = requests.get(f"{BASE_URL}/api/applications", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Applications: {len(data)} applications returned")
        if data:
            app = data[0]
            assert "id" in app
            assert "name" in app
            print(f"  First app: {app['name']} ({app.get('category', 'N/A')})")
    
    # ============ SESSIONS ============
    def test_get_sessions(self):
        """GET /api/sessions - Returns sessions list"""
        response = requests.get(f"{BASE_URL}/api/sessions", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Sessions: {len(data)} sessions returned")
    
    def test_get_active_sessions(self):
        """GET /api/sessions/active - Returns active sessions"""
        response = requests.get(f"{BASE_URL}/api/sessions/active", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Active sessions: {len(data)} active sessions")
    
    # ============ AUDIT LOGS ============
    def test_get_audit_logs(self):
        """GET /api/audit-logs - Returns audit log list"""
        response = requests.get(f"{BASE_URL}/api/audit-logs", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Audit logs: {len(data)} logs returned")
        if data:
            log = data[0]
            assert "action" in log
            assert "user_email" in log
            print(f"  Latest log: {log['action']} by {log['user_email']}")
    
    # ============ ORGANIZATIONS ============
    def test_get_organizations(self):
        """GET /api/organizations - Returns organizations list"""
        response = requests.get(f"{BASE_URL}/api/organizations", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Organizations: {len(data)} organizations returned")
        if data:
            org = data[0]
            assert "name" in org
            print(f"  First org: {org['name']}")
    
    # ============ POLICIES ============
    def test_get_policies(self):
        """GET /api/policies - Returns policies list"""
        response = requests.get(f"{BASE_URL}/api/policies", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Policies: {len(data)} policies returned")
        if data:
            pol = data[0]
            assert "name" in pol
            assert "enabled" in pol
            print(f"  First policy: {pol['name']} (enabled: {pol['enabled']})")


class TestMarketEndpoints:
    """Market/VDI provisioning endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup_auth(self):
        """Get auth token before each test"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            self.token = response.json()["access_token"]
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Authentication failed")
    
    def test_get_market_addons(self):
        """GET /api/market/addons - Returns addon list (public)"""
        response = requests.get(f"{BASE_URL}/api/market/addons")
        assert response.status_code == 200
        data = response.json()
        assert "addons" in data
        assert isinstance(data["addons"], list)
        assert len(data["addons"]) > 0
        print(f"✓ Market addons: {len(data['addons'])} addons available")
        addon = data["addons"][0]
        assert "slug" in addon
        assert "name" in addon
        assert "price_mo" in addon
        print(f"  First addon: {addon['name']} (${addon['price_mo']/100}/mo)")
    
    def test_calculate_market_price(self):
        """POST /api/market/price - Returns price calculation"""
        response = requests.post(f"{BASE_URL}/api/market/price", json={
            "neosc_plan": "business",
            "billing_period": "monthly",
            "vcpu": 4,
            "ram_gb": 8,
            "disk_gb": 80,
            "tsplus_licenses": 10,
            "addons": []
        })
        assert response.status_code == 200
        data = response.json()
        assert "total_cents" in data
        assert "total_usd" in data
        assert "billing_period" in data
        print(f"✓ Price calculation: ${data['total_usd']} ({data['billing_period']})")
    
    def test_calculate_price_with_addons(self):
        """POST /api/market/price - Price with addons"""
        response = requests.post(f"{BASE_URL}/api/market/price", json={
            "neosc_plan": "starter",
            "billing_period": "annual",
            "vcpu": 2,
            "ram_gb": 4,
            "disk_gb": 60,
            "tsplus_licenses": 5,
            "addons": ["backup-daily", "mfa-enforce"]
        })
        assert response.status_code == 200
        data = response.json()
        assert data["total_cents"] > 0
        print(f"✓ Price with addons: ${data['total_usd']} (annual)")
    
    def test_get_my_vms(self):
        """GET /api/market/my-vms - Returns user's VMs"""
        response = requests.get(f"{BASE_URL}/api/market/my-vms", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert "vms" in data
        assert isinstance(data["vms"], list)
        print(f"✓ My VMs: {len(data['vms'])} VMs")
    
    def test_get_market_orders(self):
        """GET /api/market/orders - Returns user's orders"""
        response = requests.get(f"{BASE_URL}/api/market/orders", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert "orders" in data
        assert isinstance(data["orders"], list)
        print(f"✓ Market orders: {len(data['orders'])} orders")


class TestLogout:
    """Logout functionality test"""
    
    def test_logout(self):
        """POST /api/auth/logout - Logout works"""
        # First login
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert login_response.status_code == 200
        token = login_response.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # Then logout
        logout_response = requests.post(f"{BASE_URL}/api/auth/logout", headers=headers)
        assert logout_response.status_code == 200
        data = logout_response.json()
        assert "message" in data
        print(f"✓ Logout successful: {data['message']}")
        
        # Verify token is invalidated
        me_response = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert me_response.status_code == 401
        print("✓ Token invalidated after logout")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
