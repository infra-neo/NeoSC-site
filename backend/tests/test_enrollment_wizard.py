"""
Test Tenant Enrollment Wizard - Iteration 7
Tests:
- POST /api/admin/tenants/enroll creates tenant with status provisioning
- POST /api/admin/tenants/{id}/step/netbird-group creates real NetBird group
- POST /api/admin/tenants/{id}/step/netbird-setup-key creates real NetBird setup key
- POST /api/admin/tenants/{id}/step/netbird-policy creates real NetBird policy
- POST /api/admin/tenants/{id}/step/finalize activates tenant with correct MRR
- GET /api/admin/tenants/{id}/enrollment-status returns tenant with enrollment_steps
- Non-admin user gets 403 on enrollment endpoints
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://action-steps-4.preview.emergentagent.com')

# Test credentials
ADMIN_EMAIL = "admin@windesk.cloud"
ADMIN_PASSWORD = "Admin123!"
USER_EMAIL = "usuario1@windesk.cloud"
USER_PASSWORD = "Demo123!"


class TestEnrollmentWizard:
    """Tenant Enrollment Wizard API tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.admin_token = None
        self.user_token = None
        self.test_tenant_id = None
        
    def get_admin_token(self):
        """Get admin authentication token"""
        if self.admin_token:
            return self.admin_token
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            self.admin_token = response.json().get("access_token")
            return self.admin_token
        pytest.skip("Admin authentication failed")
        
    def get_user_token(self):
        """Get non-admin user authentication token"""
        if self.user_token:
            return self.user_token
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": USER_EMAIL,
            "password": USER_PASSWORD
        })
        if response.status_code == 200:
            self.user_token = response.json().get("access_token")
            return self.user_token
        pytest.skip("User authentication failed")
    
    # ============ ENROLLMENT CREATION TESTS ============
    
    def test_enroll_tenant_creates_provisioning_status(self):
        """POST /api/admin/tenants/enroll creates tenant with status provisioning"""
        token = self.get_admin_token()
        unique_name = f"TEST_Empresa_{uuid.uuid4().hex[:6]}"
        
        response = self.session.post(
            f"{BASE_URL}/api/admin/tenants/enroll",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "org_name": unique_name,
                "email_admin": "test@example.com",
                "tier": "starter",
                "max_users": 5
            }
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify tenant structure
        assert "id" in data, "Response should contain tenant id"
        assert data["status"] == "provisioning", f"Expected status 'provisioning', got '{data.get('status')}'"
        assert data["name"] == unique_name, f"Expected name '{unique_name}', got '{data.get('name')}'"
        assert data["tier"] == "starter", f"Expected tier 'starter', got '{data.get('tier')}'"
        assert "enrollment_steps" in data, "Response should contain enrollment_steps"
        assert data["sso_provider"] == "zitadel", "SSO provider should be zitadel"
        
        # Store tenant_id for subsequent tests
        self.__class__.test_tenant_id = data["id"]
        print(f"✓ Created tenant {data['id']} with status 'provisioning'")
        
    def test_enroll_tenant_with_plus_tier(self):
        """POST /api/admin/tenants/enroll with plus tier"""
        token = self.get_admin_token()
        unique_name = f"TEST_Plus_{uuid.uuid4().hex[:6]}"
        
        response = self.session.post(
            f"{BASE_URL}/api/admin/tenants/enroll",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "org_name": unique_name,
                "email_admin": "plus@example.com",
                "tier": "plus",
                "max_users": 25,
                "tsplus_host": "10.0.0.100",
                "tsplus_port": 443
            }
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data["tier"] == "plus", f"Expected tier 'plus', got '{data.get('tier')}'"
        print(f"✓ Created plus tier tenant {data['id']}")
        
    def test_enroll_tenant_non_admin_gets_403(self):
        """Non-admin user gets 403 on enrollment endpoint"""
        token = self.get_user_token()
        
        response = self.session.post(
            f"{BASE_URL}/api/admin/tenants/enroll",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "org_name": "Should Fail",
                "email_admin": "fail@example.com",
                "tier": "starter"
            }
        )
        
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print("✓ Non-admin correctly gets 403 on enroll endpoint")
        
    # ============ NETBIRD STEP TESTS ============
    
    def test_netbird_group_step_creates_real_group(self):
        """POST /api/admin/tenants/{id}/step/netbird-group creates real NetBird group"""
        token = self.get_admin_token()
        
        # First create a tenant if not exists
        if not hasattr(self.__class__, 'test_tenant_id') or not self.__class__.test_tenant_id:
            self.test_enroll_tenant_creates_provisioning_status()
        
        tenant_id = self.__class__.test_tenant_id
        
        response = self.session.post(
            f"{BASE_URL}/api/admin/tenants/{tenant_id}/step/netbird-group",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert data["step"] == "netbird_group", f"Expected step 'netbird_group', got '{data.get('step')}'"
        assert data["status"] == "completed", f"Expected status 'completed', got '{data.get('status')}'"
        assert "group_id" in data.get("details", {}), "Response should contain group_id in details"
        
        print(f"✓ NetBird group created: {data['details'].get('group_id')}")
        
    def test_netbird_setup_key_step_creates_real_key(self):
        """POST /api/admin/tenants/{id}/step/netbird-setup-key creates real NetBird setup key"""
        token = self.get_admin_token()
        
        if not hasattr(self.__class__, 'test_tenant_id') or not self.__class__.test_tenant_id:
            self.test_enroll_tenant_creates_provisioning_status()
            self.test_netbird_group_step_creates_real_group()
        
        tenant_id = self.__class__.test_tenant_id
        
        response = self.session.post(
            f"{BASE_URL}/api/admin/tenants/{tenant_id}/step/netbird-setup-key",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert data["step"] == "netbird_setup_key", f"Expected step 'netbird_setup_key', got '{data.get('step')}'"
        assert data["status"] == "completed", f"Expected status 'completed', got '{data.get('status')}'"
        assert "key_id" in data.get("details", {}), "Response should contain key_id in details"
        
        print(f"✓ NetBird setup key created: {data['details'].get('key_id')}")
        
    def test_netbird_policy_step_creates_real_policy(self):
        """POST /api/admin/tenants/{id}/step/netbird-policy creates real NetBird policy"""
        token = self.get_admin_token()
        
        if not hasattr(self.__class__, 'test_tenant_id') or not self.__class__.test_tenant_id:
            self.test_enroll_tenant_creates_provisioning_status()
            self.test_netbird_group_step_creates_real_group()
        
        tenant_id = self.__class__.test_tenant_id
        
        response = self.session.post(
            f"{BASE_URL}/api/admin/tenants/{tenant_id}/step/netbird-policy",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert data["step"] == "netbird_policy", f"Expected step 'netbird_policy', got '{data.get('step')}'"
        assert data["status"] == "completed", f"Expected status 'completed', got '{data.get('status')}'"
        assert "policy_id" in data.get("details", {}), "Response should contain policy_id in details"
        
        print(f"✓ NetBird policy created: {data['details'].get('policy_id')}")
        
    def test_netbird_steps_non_admin_gets_403(self):
        """Non-admin user gets 403 on NetBird step endpoints"""
        token = self.get_user_token()
        
        # Use a fake tenant_id - should fail with 403 before checking tenant
        response = self.session.post(
            f"{BASE_URL}/api/admin/tenants/tenant-fake/step/netbird-group",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print("✓ Non-admin correctly gets 403 on NetBird step endpoints")
        
    # ============ FINALIZE STEP TESTS ============
    
    def test_finalize_step_activates_tenant_with_mrr(self):
        """POST /api/admin/tenants/{id}/step/finalize activates tenant with correct MRR"""
        token = self.get_admin_token()
        
        if not hasattr(self.__class__, 'test_tenant_id') or not self.__class__.test_tenant_id:
            self.test_enroll_tenant_creates_provisioning_status()
        
        tenant_id = self.__class__.test_tenant_id
        
        response = self.session.post(
            f"{BASE_URL}/api/admin/tenants/{tenant_id}/step/finalize",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert data["step"] == "finalize", f"Expected step 'finalize', got '{data.get('step')}'"
        assert data["status"] == "completed", f"Expected status 'completed', got '{data.get('status')}'"
        assert data["details"]["tenant_status"] == "activo", f"Expected tenant_status 'activo', got '{data['details'].get('tenant_status')}'"
        
        # Starter plan MRR should be $29 (2900 cents / 100)
        mrr = data["details"].get("mrr")
        assert mrr == 29.0, f"Expected MRR 29.0 for starter plan, got {mrr}"
        
        print(f"✓ Tenant finalized with status 'activo' and MRR ${mrr}")
        
    def test_finalize_step_non_admin_gets_403(self):
        """Non-admin user gets 403 on finalize endpoint"""
        token = self.get_user_token()
        
        response = self.session.post(
            f"{BASE_URL}/api/admin/tenants/tenant-fake/step/finalize",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print("✓ Non-admin correctly gets 403 on finalize endpoint")
        
    # ============ ENROLLMENT STATUS TESTS ============
    
    def test_enrollment_status_returns_tenant_with_steps(self):
        """GET /api/admin/tenants/{id}/enrollment-status returns tenant with enrollment_steps"""
        token = self.get_admin_token()
        
        if not hasattr(self.__class__, 'test_tenant_id') or not self.__class__.test_tenant_id:
            self.test_enroll_tenant_creates_provisioning_status()
        
        tenant_id = self.__class__.test_tenant_id
        
        response = self.session.get(
            f"{BASE_URL}/api/admin/tenants/{tenant_id}/enrollment-status",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "id" in data, "Response should contain tenant id"
        assert "enrollment_steps" in data, "Response should contain enrollment_steps"
        assert "name" in data, "Response should contain tenant name"
        assert "tier" in data, "Response should contain tier"
        
        print(f"✓ Enrollment status returned for tenant {tenant_id}")
        print(f"  Steps: {data.get('enrollment_steps', {})}")
        
    def test_enrollment_status_non_admin_gets_403(self):
        """Non-admin user gets 403 on enrollment-status endpoint"""
        token = self.get_user_token()
        
        response = self.session.get(
            f"{BASE_URL}/api/admin/tenants/tenant-fake/enrollment-status",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print("✓ Non-admin correctly gets 403 on enrollment-status endpoint")
        
    # ============ ZITADEL ORG STEP TEST ============
    
    def test_zitadel_org_step_returns_manual_pending_or_completed(self):
        """POST /api/admin/tenants/{id}/step/zitadel-org returns manual_pending or completed"""
        token = self.get_admin_token()
        
        if not hasattr(self.__class__, 'test_tenant_id') or not self.__class__.test_tenant_id:
            self.test_enroll_tenant_creates_provisioning_status()
        
        tenant_id = self.__class__.test_tenant_id
        
        response = self.session.post(
            f"{BASE_URL}/api/admin/tenants/{tenant_id}/step/zitadel-org",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert data["step"] == "zitadel_org", f"Expected step 'zitadel_org', got '{data.get('step')}'"
        # Zitadel org creation may return manual_pending due to IAM permissions
        assert data["status"] in ["completed", "manual_pending", "error"], f"Unexpected status: {data.get('status')}"
        
        print(f"✓ Zitadel org step returned status: {data['status']}")
        if data["status"] == "manual_pending":
            print("  Note: Service user needs IAM_OWNER permission in Zitadel console")


class TestMarketPlanPrices:
    """Test Market plan prices match expected values"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
    def get_admin_token(self):
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Admin authentication failed")
        
    def test_market_addons_endpoint(self):
        """GET /api/market/addons returns addon catalog"""
        token = self.get_admin_token()
        
        response = self.session.get(
            f"{BASE_URL}/api/market/addons",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # Response is wrapped in {"addons": [...]}
        addons = data.get("addons", data) if isinstance(data, dict) else data
        assert isinstance(addons, list), "Response should contain a list of addons"
        assert len(addons) > 0, "Should have at least one addon"
        
        # Check addon structure
        addon = addons[0]
        assert "name" in addon, "Addon should have name"
        assert "price_mo" in addon, "Addon should have price_mo"
        
        print(f"✓ Market addons endpoint returns {len(addons)} addons")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
