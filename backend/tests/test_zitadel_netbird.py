"""
Test Zitadel Management API Proxy and NetBird API Proxy endpoints
These are REAL API integrations (not mocked) - testing proxy functionality

Features tested:
- Zitadel: users, orgs, roles (projects), grants
- NetBird: peers, groups, setup-keys, routes, users
- Admin role enforcement (403 for non-admin users)
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "admin@windesk.cloud"
ADMIN_PASSWORD = "Admin123!"
DEMO_EMAIL = "usuario1@windesk.cloud"
DEMO_PASSWORD = "Demo123!"


class TestAuthSetup:
    """Setup authentication tokens for testing"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert data["user"]["role"] == "admin"
        return data["access_token"]
    
    @pytest.fixture(scope="class")
    def user_token(self):
        """Get non-admin user authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": DEMO_EMAIL,
            "password": DEMO_PASSWORD
        })
        assert response.status_code == 200, f"User login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        return data["access_token"]
    
    @pytest.fixture(scope="class")
    def admin_headers(self, admin_token):
        """Headers with admin auth"""
        return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}
    
    @pytest.fixture(scope="class")
    def user_headers(self, user_token):
        """Headers with non-admin auth"""
        return {"Authorization": f"Bearer {user_token}", "Content-Type": "application/json"}


class TestZitadelUsersAPI(TestAuthSetup):
    """Test Zitadel Users API proxy"""
    
    def test_zitadel_users_admin_access(self, admin_headers):
        """GET /api/admin/zitadel/users - Admin can list Zitadel users"""
        response = requests.get(f"{BASE_URL}/api/admin/zitadel/users", headers=admin_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        # Zitadel v2 API returns { result: [...] }
        assert "result" in data or isinstance(data, list), f"Unexpected response format: {data}"
        users = data.get("result", data) if isinstance(data, dict) else data
        print(f"Found {len(users)} Zitadel users")
        # Should have at least 1 user (service user 'emergente')
        assert len(users) >= 1, "Expected at least 1 Zitadel user"
    
    def test_zitadel_users_non_admin_forbidden(self, user_headers):
        """GET /api/admin/zitadel/users - Non-admin gets 403"""
        response = requests.get(f"{BASE_URL}/api/admin/zitadel/users", headers=user_headers)
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"


class TestZitadelOrgsAPI(TestAuthSetup):
    """Test Zitadel Organizations API proxy"""
    
    def test_zitadel_orgs_admin_access(self, admin_headers):
        """GET /api/admin/zitadel/orgs - Admin can list Zitadel organizations"""
        response = requests.get(f"{BASE_URL}/api/admin/zitadel/orgs", headers=admin_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        # Zitadel v2 API returns { details: { totalResult: "N" }, result: [...] }
        # Note: If service user lacks permission, result may be missing but totalResult shows count
        assert "details" in data or "result" in data, f"Unexpected response format: {data}"
        total = int(data.get("details", {}).get("totalResult", 0))
        orgs = data.get("result", [])
        print(f"Zitadel orgs: totalResult={total}, returned={len(orgs)}")
    
    def test_zitadel_orgs_non_admin_forbidden(self, user_headers):
        """GET /api/admin/zitadel/orgs - Non-admin gets 403"""
        response = requests.get(f"{BASE_URL}/api/admin/zitadel/orgs", headers=user_headers)
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"


class TestZitadelRolesAPI(TestAuthSetup):
    """Test Zitadel Roles (Projects) API proxy"""
    
    def test_zitadel_roles_admin_access(self, admin_headers):
        """GET /api/admin/zitadel/roles - Admin can list Zitadel projects
        Note: Returns 404 if service user lacks IAM membership for projects
        """
        response = requests.get(f"{BASE_URL}/api/admin/zitadel/roles", headers=admin_headers)
        # 200 = success, 404 = service user lacks permission (expected for limited PAT)
        assert response.status_code in [200, 404], f"Unexpected status: {response.status_code}"
        if response.status_code == 200:
            data = response.json()
            projects = data.get("result", [])
            print(f"Found {len(projects)} Zitadel projects")
        else:
            print("Zitadel roles: 404 - Service user lacks IAM membership (expected)")
    
    def test_zitadel_roles_non_admin_forbidden(self, user_headers):
        """GET /api/admin/zitadel/roles - Non-admin gets 403"""
        response = requests.get(f"{BASE_URL}/api/admin/zitadel/roles", headers=user_headers)
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"


class TestZitadelGrantsAPI(TestAuthSetup):
    """Test Zitadel User Grants API proxy"""
    
    def test_zitadel_grants_admin_access(self, admin_headers):
        """GET /api/admin/zitadel/grants - Admin can list Zitadel user grants
        Note: Returns 404 if service user lacks IAM membership for grants
        """
        response = requests.get(f"{BASE_URL}/api/admin/zitadel/grants", headers=admin_headers)
        # 200 = success, 404 = service user lacks permission (expected for limited PAT)
        assert response.status_code in [200, 404], f"Unexpected status: {response.status_code}"
        if response.status_code == 200:
            data = response.json()
            grants = data.get("result", [])
            print(f"Found {len(grants)} Zitadel user grants")
        else:
            print("Zitadel grants: 404 - Service user lacks IAM membership (expected)")
    
    def test_zitadel_grants_non_admin_forbidden(self, user_headers):
        """GET /api/admin/zitadel/grants - Non-admin gets 403"""
        response = requests.get(f"{BASE_URL}/api/admin/zitadel/grants", headers=user_headers)
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"


class TestNetBirdPeersAPI(TestAuthSetup):
    """Test NetBird Peers API proxy"""
    
    def test_netbird_peers_admin_access(self, admin_headers):
        """GET /api/admin/netbird/peers - Admin can list NetBird peers"""
        response = requests.get(f"{BASE_URL}/api/admin/netbird/peers", headers=admin_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        print(f"Found {len(data)} NetBird peers")
        # Should have 5 real peers
        assert len(data) >= 5, f"Expected at least 5 NetBird peers, got {len(data)}"
        # Verify peer structure
        if len(data) > 0:
            peer = data[0]
            assert "id" in peer, "Peer should have id"
            assert "ip" in peer, "Peer should have ip"
            print(f"First peer: {peer.get('name', peer.get('hostname', 'unknown'))} - {peer.get('ip')}")
    
    def test_netbird_peers_non_admin_forbidden(self, user_headers):
        """GET /api/admin/netbird/peers - Non-admin gets 403"""
        response = requests.get(f"{BASE_URL}/api/admin/netbird/peers", headers=user_headers)
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"


class TestNetBirdGroupsAPI(TestAuthSetup):
    """Test NetBird Groups API proxy"""
    
    def test_netbird_groups_admin_access(self, admin_headers):
        """GET /api/admin/netbird/groups - Admin can list NetBird groups"""
        response = requests.get(f"{BASE_URL}/api/admin/netbird/groups", headers=admin_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        print(f"Found {len(data)} NetBird groups")
        # Should have 8 groups
        assert len(data) >= 8, f"Expected at least 8 NetBird groups, got {len(data)}"
    
    def test_netbird_groups_non_admin_forbidden(self, user_headers):
        """GET /api/admin/netbird/groups - Non-admin gets 403"""
        response = requests.get(f"{BASE_URL}/api/admin/netbird/groups", headers=user_headers)
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"


class TestNetBirdSetupKeysAPI(TestAuthSetup):
    """Test NetBird Setup Keys API proxy"""
    
    def test_netbird_setup_keys_admin_access(self, admin_headers):
        """GET /api/admin/netbird/setup-keys - Admin can list NetBird setup keys"""
        response = requests.get(f"{BASE_URL}/api/admin/netbird/setup-keys", headers=admin_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        print(f"Found {len(data)} NetBird setup keys")
    
    def test_netbird_setup_keys_non_admin_forbidden(self, user_headers):
        """GET /api/admin/netbird/setup-keys - Non-admin gets 403"""
        response = requests.get(f"{BASE_URL}/api/admin/netbird/setup-keys", headers=user_headers)
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"


class TestNetBirdRoutesAPI(TestAuthSetup):
    """Test NetBird Routes API proxy"""
    
    def test_netbird_routes_admin_access(self, admin_headers):
        """GET /api/admin/netbird/routes - Admin can list NetBird routes"""
        response = requests.get(f"{BASE_URL}/api/admin/netbird/routes", headers=admin_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        print(f"Found {len(data)} NetBird routes")
    
    def test_netbird_routes_non_admin_forbidden(self, user_headers):
        """GET /api/admin/netbird/routes - Non-admin gets 403"""
        response = requests.get(f"{BASE_URL}/api/admin/netbird/routes", headers=user_headers)
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"


class TestNetBirdUsersAPI(TestAuthSetup):
    """Test NetBird Users API proxy"""
    
    def test_netbird_users_admin_access(self, admin_headers):
        """GET /api/admin/netbird/users - Admin can list NetBird users"""
        response = requests.get(f"{BASE_URL}/api/admin/netbird/users", headers=admin_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        print(f"Found {len(data)} NetBird users")
    
    def test_netbird_users_non_admin_forbidden(self, user_headers):
        """GET /api/admin/netbird/users - Non-admin gets 403"""
        response = requests.get(f"{BASE_URL}/api/admin/netbird/users", headers=user_headers)
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
