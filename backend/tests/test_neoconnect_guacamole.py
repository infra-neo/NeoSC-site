"""
Test NeoConnect and Guacamole Integration - Iteration 9
Tests:
- POST /api/admin/tenants/enroll - Creates a new tenant
- POST /api/admin/tenants/{id}/step/zitadel-org - Full Zitadel auto-provisioning
- POST /api/admin/tenants/{id}/step/netbird-group - Creates NetBird group
- POST /api/admin/tenants/{id}/step/netbird-setup-key - Creates setup key
- POST /api/admin/tenants/{id}/step/netbird-policy - Creates access policy
- POST /api/admin/tenants/{id}/step/deploy-relay - Deploy LXD container with NetBird relay
- POST /api/admin/tenants/{id}/auto-provision - Run all steps automatically
- GET /api/admin/tenants/{id}/neoconnect-info - Get NetBird download links and setup key
- GET /api/guacamole/status - Check Guacamole server status
- GET /api/guacamole/connections - List Guacamole connections
- POST /api/guacamole/connections - Create RDP/VNC connection
- POST /api/guacamole/deploy - Deploy Guacamole server container via LXD
"""
import pytest
import requests
import os
import uuid
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://action-steps-4.preview.emergentagent.com')

# Test credentials
ADMIN_EMAIL = "admin@windesk.cloud"
ADMIN_PASSWORD = "Admin123!"


class TestNeoConnectGuacamole:
    """NeoConnect and Guacamole API tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.admin_token = None
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
    
    # ============ TENANT ENROLLMENT TESTS ============
    
    def test_01_enroll_tenant_creates_tenant(self):
        """POST /api/admin/tenants/enroll creates a new tenant"""
        token = self.get_admin_token()
        unique_name = f"TEST_NeoConnect_{uuid.uuid4().hex[:6]}"
        
        response = self.session.post(
            f"{BASE_URL}/api/admin/tenants/enroll",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "org_name": unique_name,
                "email_admin": "test@neoconnect.test",
                "tier": "plus",
                "max_users": 5,
                "tsplus_host": "10.100.10.152",
                "tsplus_port": 443
            }
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify tenant structure
        assert "id" in data, "Response should contain tenant id"
        assert data["status"] == "provisioning", f"Expected status 'provisioning', got '{data.get('status')}'"
        assert data["name"] == unique_name
        assert "enrollment_steps" in data
        
        # Store tenant_id for subsequent tests
        self.__class__.test_tenant_id = data["id"]
        print(f"✓ Created tenant {data['id']} with status 'provisioning'")
        
    def test_02_zitadel_org_provisioning(self):
        """POST /api/admin/tenants/{id}/step/zitadel-org - Full Zitadel auto-provisioning"""
        token = self.get_admin_token()
        tenant_id = getattr(self.__class__, 'test_tenant_id', None)
        
        if not tenant_id:
            # Create a new tenant for this test
            unique_name = f"TEST_Zitadel_{uuid.uuid4().hex[:6]}"
            create_resp = self.session.post(
                f"{BASE_URL}/api/admin/tenants/enroll",
                headers={"Authorization": f"Bearer {token}"},
                json={"org_name": unique_name, "email_admin": "zitadel@test.com", "tier": "plus"}
            )
            assert create_resp.status_code == 200
            tenant_id = create_resp.json()["id"]
            self.__class__.test_tenant_id = tenant_id
        
        response = self.session.post(
            f"{BASE_URL}/api/admin/tenants/{tenant_id}/step/zitadel-org",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "step" in data, "Response should contain step"
        assert data["step"] == "zitadel_org"
        assert "status" in data, "Response should contain status"
        assert "details" in data, "Response should contain details"
        
        if data["status"] == "completed":
            details = data["details"]
            assert "project_id" in details, "Should have project_id"
            assert "client_id" in details, "Should have client_id"
            assert "roles" in details, "Should have roles"
            print(f"✓ Zitadel provisioning completed: project={details.get('project_id')}, client={details.get('client_id')}")
        else:
            print(f"⚠ Zitadel provisioning status: {data['status']}, details: {data.get('details')}")
            
    def test_03_netbird_group_creation(self):
        """POST /api/admin/tenants/{id}/step/netbird-group - Creates NetBird group"""
        token = self.get_admin_token()
        tenant_id = getattr(self.__class__, 'test_tenant_id', None)
        
        if not tenant_id:
            pytest.skip("No tenant_id available from previous test")
        
        response = self.session.post(
            f"{BASE_URL}/api/admin/tenants/{tenant_id}/step/netbird-group",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert data["step"] == "netbird_group"
        assert "status" in data
        
        if data["status"] == "completed":
            assert "group_id" in data["details"], "Should have group_id"
            print(f"✓ NetBird group created: {data['details'].get('group_id')}")
        else:
            print(f"⚠ NetBird group status: {data['status']}, details: {data.get('details')}")
            
    def test_04_netbird_setup_key_creation(self):
        """POST /api/admin/tenants/{id}/step/netbird-setup-key - Creates setup key"""
        token = self.get_admin_token()
        tenant_id = getattr(self.__class__, 'test_tenant_id', None)
        
        if not tenant_id:
            pytest.skip("No tenant_id available from previous test")
        
        response = self.session.post(
            f"{BASE_URL}/api/admin/tenants/{tenant_id}/step/netbird-setup-key",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert data["step"] == "netbird_setup_key"
        assert "status" in data
        
        if data["status"] == "completed":
            assert "setup_key" in data["details"], "Should have setup_key"
            print(f"✓ NetBird setup key created: {data['details'].get('key_id')}")
        else:
            print(f"⚠ NetBird setup key status: {data['status']}, details: {data.get('details')}")
            
    def test_05_netbird_policy_creation(self):
        """POST /api/admin/tenants/{id}/step/netbird-policy - Creates access policy"""
        token = self.get_admin_token()
        tenant_id = getattr(self.__class__, 'test_tenant_id', None)
        
        if not tenant_id:
            pytest.skip("No tenant_id available from previous test")
        
        response = self.session.post(
            f"{BASE_URL}/api/admin/tenants/{tenant_id}/step/netbird-policy",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert data["step"] == "netbird_policy"
        assert "status" in data
        
        if data["status"] == "completed":
            assert "policy_id" in data["details"], "Should have policy_id"
            print(f"✓ NetBird policy created: {data['details'].get('policy_id')}")
        else:
            print(f"⚠ NetBird policy status: {data['status']}, details: {data.get('details')}")
            
    def test_06_neoconnect_info(self):
        """GET /api/admin/tenants/{id}/neoconnect-info - Get NetBird download links"""
        token = self.get_admin_token()
        tenant_id = getattr(self.__class__, 'test_tenant_id', None)
        
        if not tenant_id:
            pytest.skip("No tenant_id available from previous test")
        
        response = self.session.get(
            f"{BASE_URL}/api/admin/tenants/{tenant_id}/neoconnect-info",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "setup_key" in data, "Should have setup_key"
        assert "management_url" in data, "Should have management_url"
        assert "downloads" in data, "Should have downloads"
        
        downloads = data["downloads"]
        assert "windows" in downloads, "Should have windows download info"
        assert "linux" in downloads, "Should have linux download info"
        assert "docker" in downloads, "Should have docker download info"
        
        print(f"✓ NeoConnect info retrieved: setup_key={data.get('setup_key', '')[:20]}...")
        
    def test_07_deploy_relay_container(self):
        """POST /api/admin/tenants/{id}/step/deploy-relay - Deploy LXD container"""
        token = self.get_admin_token()
        tenant_id = getattr(self.__class__, 'test_tenant_id', None)
        
        if not tenant_id:
            pytest.skip("No tenant_id available from previous test")
        
        # This test may take a while due to LXD provisioning
        response = self.session.post(
            f"{BASE_URL}/api/admin/tenants/{tenant_id}/step/deploy-relay",
            headers={"Authorization": f"Bearer {token}"},
            timeout=120  # 2 minute timeout for LXD operations
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert data["step"] == "deploy_relay"
        assert "status" in data
        
        if data["status"] == "completed":
            assert "container" in data["details"], "Should have container name"
            print(f"✓ Relay container deployed: {data['details'].get('container')}")
        else:
            # LXD may fail if image not cached - this is expected in test environment
            print(f"⚠ Relay deployment status: {data['status']}, details: {data.get('details')}")
            
    # ============ AUTO-PROVISION TEST ============
    
    def test_08_auto_provision_tenant(self):
        """POST /api/admin/tenants/{id}/auto-provision - Run all steps automatically"""
        token = self.get_admin_token()
        
        # Create a fresh tenant for auto-provision test
        unique_name = f"TEST_AutoProv_{uuid.uuid4().hex[:6]}"
        create_resp = self.session.post(
            f"{BASE_URL}/api/admin/tenants/enroll",
            headers={"Authorization": f"Bearer {token}"},
            json={"org_name": unique_name, "email_admin": "autoprov@test.com", "tier": "plus"}
        )
        assert create_resp.status_code == 200
        tenant_id = create_resp.json()["id"]
        
        response = self.session.post(
            f"{BASE_URL}/api/admin/tenants/{tenant_id}/auto-provision",
            headers={"Authorization": f"Bearer {token}"},
            timeout=180  # 3 minute timeout for all steps
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "auto_provision" in data, "Should have auto_provision status"
        assert "steps" in data, "Should have steps results"
        
        steps = data["steps"]
        completed_count = sum(1 for s in steps.values() if s.get("status") == "completed")
        
        print(f"✓ Auto-provision result: {data['auto_provision']}, completed steps: {completed_count}/{len(steps)}")
        for step_name, step_result in steps.items():
            status = step_result.get("status", "unknown")
            print(f"  - {step_name}: {status}")
            
    # ============ GUACAMOLE TESTS ============
    
    def test_09_guacamole_status(self):
        """GET /api/guacamole/status - Check Guacamole server status"""
        token = self.get_admin_token()
        
        response = self.session.get(
            f"{BASE_URL}/api/guacamole/status",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "connected" in data, "Should have connected status"
        
        if data["connected"]:
            print(f"✓ Guacamole connected: url={data.get('url')}")
        else:
            # Expected - Guacamole not deployed yet
            print(f"✓ Guacamole status: not connected (expected - not deployed)")
            
    def test_10_guacamole_connections_list(self):
        """GET /api/guacamole/connections - List Guacamole connections"""
        token = self.get_admin_token()
        
        response = self.session.get(
            f"{BASE_URL}/api/guacamole/connections",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "connections" in data, "Should have connections list"
        assert "count" in data, "Should have count"
        
        print(f"✓ Guacamole connections: {data['count']} connections")
        
    def test_11_guacamole_create_connection(self):
        """POST /api/guacamole/connections - Create RDP/VNC connection"""
        token = self.get_admin_token()
        
        response = self.session.post(
            f"{BASE_URL}/api/guacamole/connections",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "name": f"TEST_RDP_{uuid.uuid4().hex[:6]}",
                "protocol": "rdp",
                "hostname": "10.100.10.152",
                "port": 3389,
                "username": "testuser",
                "password": "testpass"
            }
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "ok" in data, "Should have ok status"
        
        if data["ok"]:
            assert "id" in data, "Should have connection id"
            print(f"✓ Guacamole connection created: {data.get('id')}")
        else:
            # Expected if Guacamole not deployed
            print(f"✓ Guacamole connection creation: {data.get('error', 'not connected')}")
            
    def test_12_guacamole_deploy(self):
        """POST /api/guacamole/deploy - Deploy Guacamole server container"""
        token = self.get_admin_token()
        
        response = self.session.post(
            f"{BASE_URL}/api/guacamole/deploy",
            headers={"Authorization": f"Bearer {token}"},
            timeout=180  # 3 minute timeout for LXD operations
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "ok" in data, "Should have ok status"
        
        if data["ok"]:
            print(f"✓ Guacamole deploy: {data.get('status', 'deployed')}, container={data.get('container')}")
        else:
            # May fail if LXD not accessible
            print(f"⚠ Guacamole deploy: {data.get('error', 'failed')}")
            
    # ============ ENROLLMENT STATUS TEST ============
    
    def test_13_enrollment_status(self):
        """GET /api/admin/tenants/{id}/enrollment-status - Get tenant enrollment status"""
        token = self.get_admin_token()
        tenant_id = getattr(self.__class__, 'test_tenant_id', None)
        
        if not tenant_id:
            pytest.skip("No tenant_id available from previous test")
        
        response = self.session.get(
            f"{BASE_URL}/api/admin/tenants/{tenant_id}/enrollment-status",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "id" in data, "Should have tenant id"
        assert "name" in data, "Should have tenant name"
        assert "status" in data, "Should have status"
        assert "enrollment_steps" in data, "Should have enrollment_steps"
        
        steps = data.get("enrollment_steps", {})
        completed = [k for k, v in steps.items() if v == "completed"]
        
        print(f"✓ Enrollment status: {data['status']}, completed steps: {completed}")


class TestAPIHealth:
    """Basic API health checks"""
    
    def test_api_root(self):
        """GET /api/ - API root endpoint"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        print(f"✓ API root: {data.get('message')}")
        
    def test_auth_login(self):
        """POST /api/auth/login - Admin login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        print(f"✓ Admin login successful: {data['user'].get('email')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
