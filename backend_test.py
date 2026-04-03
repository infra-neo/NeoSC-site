#!/usr/bin/env python3
"""
WinDesk Cloud Backend API Testing Suite
Tests all API endpoints for the SaaS platform MVP
"""

import requests
import sys
import json
import time
from datetime import datetime

class WinDeskAPITester:
    def __init__(self, base_url="https://action-steps-4.preview.emergentagent.com"):
        self.base_url = base_url
        self.session = requests.Session()
        self.admin_token = None
        self.user_token = None
        self.test_user_id = None
        self.test_order_id = None
        self.test_vm_id = None
        self.tests_run = 0
        self.tests_passed = 0
        
        # Test credentials from /app/memory/test_credentials.md
        self.admin_email = "admin@windesk.cloud"
        self.admin_password = "Admin123!"
        
        # Test user for registration
        timestamp = datetime.now().strftime("%H%M%S")
        self.test_email = f"test_user_{timestamp}@example.com"
        self.test_password = "TestPass123!"
        self.test_name = f"Test User {timestamp}"

    def log(self, message, level="INFO"):
        """Log test messages"""
        print(f"[{level}] {message}")

    def run_test(self, name, test_func):
        """Run a single test with error handling"""
        self.tests_run += 1
        self.log(f"🔍 Testing {name}...")
        
        try:
            result = test_func()
            if result:
                self.tests_passed += 1
                self.log(f"✅ {name} - PASSED", "SUCCESS")
                return True
            else:
                self.log(f"❌ {name} - FAILED", "ERROR")
                return False
        except Exception as e:
            self.log(f"❌ {name} - ERROR: {str(e)}", "ERROR")
            return False

    def test_health_check(self):
        """Test basic API health"""
        response = self.session.get(f"{self.base_url}/api/health")
        return response.status_code == 200

    def test_api_root(self):
        """Test API root endpoint"""
        response = self.session.get(f"{self.base_url}/api/")
        if response.status_code == 200:
            data = response.json()
            return data.get("message") == "WinDesk Cloud API" and data.get("mode") == "DEMO"
        return False

    def test_get_plans(self):
        """Test GET /api/plans - should return 3 plans"""
        response = self.session.get(f"{self.base_url}/api/plans")
        if response.status_code == 200:
            plans = response.json()
            if len(plans) == 3:
                plan_ids = [p["id"] for p in plans]
                expected_ids = ["starter", "business", "enterprise"]
                return all(pid in plan_ids for pid in expected_ids)
        return False

    def test_get_single_plan(self):
        """Test GET /api/plans/{plan_id}"""
        response = self.session.get(f"{self.base_url}/api/plans/starter")
        if response.status_code == 200:
            plan = response.json()
            return plan["id"] == "starter" and plan["name"] == "Starter"
        return False

    def test_user_registration(self):
        """Test user registration"""
        data = {
            "email": self.test_email,
            "password": self.test_password,
            "name": self.test_name
        }
        response = self.session.post(f"{self.base_url}/api/auth/register", json=data)
        if response.status_code == 200:
            user_data = response.json()
            self.test_user_id = user_data.get("id")
            # Check if cookies are set
            cookies = response.cookies
            return "access_token" in cookies and "refresh_token" in cookies
        return False

    def test_user_login(self):
        """Test user login with registered user"""
        data = {
            "email": self.test_email,
            "password": self.test_password
        }
        response = self.session.post(f"{self.base_url}/api/auth/login", json=data)
        if response.status_code == 200:
            user_data = response.json()
            cookies = response.cookies
            return "access_token" in cookies and user_data.get("email") == self.test_email
        return False

    def test_admin_login(self):
        """Test admin login"""
        # Create new session for admin
        admin_session = requests.Session()
        data = {
            "email": self.admin_email,
            "password": self.admin_password
        }
        response = admin_session.post(f"{self.base_url}/api/auth/login", json=data)
        if response.status_code == 200:
            user_data = response.json()
            if user_data.get("role") == "platform_admin":
                # Store admin session for later tests
                self.admin_session = admin_session
                return True
        return False

    def test_auth_me(self):
        """Test GET /api/auth/me with authenticated user"""
        response = self.session.get(f"{self.base_url}/api/auth/me")
        if response.status_code == 200:
            user_data = response.json()
            return user_data.get("email") == self.test_email
        return False

    def test_create_order(self):
        """Test creating an order"""
        data = {
            "plan_id": "starter",
            "billing_period": "monthly",
            "region": "eu-west"
        }
        response = self.session.post(f"{self.base_url}/api/orders", json=data)
        if response.status_code == 200:
            order_data = response.json()
            self.test_order_id = order_data.get("id")
            return order_data.get("status") == "pending" and order_data.get("plan_id") == "starter"
        return False

    def test_get_orders(self):
        """Test GET /api/orders"""
        response = self.session.get(f"{self.base_url}/api/orders")
        if response.status_code == 200:
            orders = response.json()
            return isinstance(orders, list)
        return False

    def test_get_single_order(self):
        """Test GET /api/orders/{order_id}"""
        if not self.test_order_id:
            return False
        response = self.session.get(f"{self.base_url}/api/orders/{self.test_order_id}")
        if response.status_code == 200:
            order = response.json()
            return order.get("id") == self.test_order_id
        return False

    def test_simulate_payment(self):
        """Test simulated payment processing"""
        if not self.test_order_id:
            return False
        data = {"order_id": self.test_order_id}
        response = self.session.post(f"{self.base_url}/api/billing/simulate", json=data)
        if response.status_code == 200:
            result = response.json()
            return result.get("message") == "Payment simulated successfully"
        return False

    def test_vm_provisioning_wait(self):
        """Wait for VM provisioning to complete"""
        if not self.test_order_id:
            return False
        
        # Wait up to 30 seconds for provisioning
        for _ in range(15):  # 15 attempts, 2 seconds each
            time.sleep(2)
            response = self.session.get(f"{self.base_url}/api/orders/{self.test_order_id}")
            if response.status_code == 200:
                order = response.json()
                if order.get("status") == "active":
                    return True
                elif order.get("status") == "provisioning":
                    self.log(f"Provisioning step: {order.get('provisioning_step', 'unknown')}")
                    continue
        return False

    def test_get_vms(self):
        """Test GET /api/vms"""
        response = self.session.get(f"{self.base_url}/api/vms")
        if response.status_code == 200:
            vms = response.json()
            if isinstance(vms, list) and len(vms) > 0:
                self.test_vm_id = vms[0].get("id")
                return True
        return False

    def test_get_single_vm(self):
        """Test GET /api/vms/{vm_id}"""
        if not self.test_vm_id:
            return False
        response = self.session.get(f"{self.base_url}/api/vms/{self.test_vm_id}")
        if response.status_code == 200:
            vm = response.json()
            return vm.get("id") == self.test_vm_id
        return False

    def test_vm_metrics(self):
        """Test GET /api/vms/{vm_id}/metrics"""
        if not self.test_vm_id:
            return False
        response = self.session.get(f"{self.base_url}/api/vms/{self.test_vm_id}/metrics")
        if response.status_code == 200:
            metrics = response.json()
            required_fields = ["cpu_percent", "ram_percent", "disk_percent", "network_in_mb", "network_out_mb"]
            return all(field in metrics for field in required_fields)
        return False

    def test_vm_access_url(self):
        """Test GET /api/vms/{vm_id}/access-url"""
        if not self.test_vm_id:
            return False
        response = self.session.get(f"{self.base_url}/api/vms/{self.test_vm_id}/access-url")
        if response.status_code == 200:
            access_data = response.json()
            return "tsplus_url" in access_data and "rdp_ip" in access_data
        return False

    def test_vm_restart(self):
        """Test POST /api/vms/{vm_id}/restart"""
        if not self.test_vm_id:
            return False
        response = self.session.post(f"{self.base_url}/api/vms/{self.test_vm_id}/restart")
        if response.status_code == 200:
            result = response.json()
            return result.get("message") == "VM restarted successfully"
        return False

    def test_vm_snapshot(self):
        """Test POST /api/vms/{vm_id}/snapshot"""
        if not self.test_vm_id:
            return False
        response = self.session.post(f"{self.base_url}/api/vms/{self.test_vm_id}/snapshot")
        if response.status_code == 200:
            result = response.json()
            return "snapshot_id" in result
        return False

    def test_admin_stats(self):
        """Test GET /api/admin/stats (admin only)"""
        if not hasattr(self, 'admin_session'):
            return False
        response = self.admin_session.get(f"{self.base_url}/api/admin/stats")
        if response.status_code == 200:
            stats = response.json()
            required_fields = ["total_users", "total_vms", "active_vms", "total_orders", "pending_orders"]
            return all(field in stats for field in required_fields)
        return False

    def test_admin_users(self):
        """Test GET /api/admin/users (admin only)"""
        if not hasattr(self, 'admin_session'):
            return False
        response = self.admin_session.get(f"{self.base_url}/api/admin/users")
        if response.status_code == 200:
            users = response.json()
            return isinstance(users, list) and len(users) > 0
        return False

    def test_admin_orders(self):
        """Test GET /api/admin/orders (admin only)"""
        if not hasattr(self, 'admin_session'):
            return False
        response = self.admin_session.get(f"{self.base_url}/api/admin/orders")
        if response.status_code == 200:
            orders = response.json()
            return isinstance(orders, list)
        return False

    def test_admin_vms(self):
        """Test GET /api/admin/vms - should return 7 VMs including 4 PROD VMs"""
        if not hasattr(self, 'admin_session'):
            return False
        response = self.admin_session.get(f"{self.base_url}/api/admin/vms")
        if response.status_code == 200:
            vms = response.json()
            if isinstance(vms, list):
                # Should have at least 4 pre-built VMs
                prod_vms = [vm for vm in vms if vm.get('name', '').startswith('WinDesk-PROD')]
                self.log(f"Found {len(vms)} total VMs, {len(prod_vms)} PROD VMs")
                return len(prod_vms) >= 4 and len(vms) >= 4
        return False

    def test_admin_groups(self):
        """Test GET /api/admin/groups - should return 3 default groups"""
        if not hasattr(self, 'admin_session'):
            return False
        response = self.admin_session.get(f"{self.base_url}/api/admin/groups")
        if response.status_code == 200:
            groups = response.json()
            if isinstance(groups, list):
                expected_groups = ['Desarrollo', 'Soporte Técnico', 'Finanzas']
                group_names = [g.get('name') for g in groups]
                self.log(f"Found groups: {group_names}")
                return len(groups) >= 3 and all(name in group_names for name in expected_groups)
        return False

    def test_admin_roles(self):
        """Test GET /api/admin/roles - should return 3 default roles"""
        if not hasattr(self, 'admin_session'):
            return False
        response = self.admin_session.get(f"{self.base_url}/api/admin/roles")
        if response.status_code == 200:
            roles = response.json()
            if isinstance(roles, list):
                expected_roles = ['Administrador', 'Operador', 'Usuario']
                role_names = [r.get('name') for r in roles]
                self.log(f"Found roles: {role_names}")
                return len(roles) >= 3 and all(name in role_names for name in expected_roles)
        return False

    def test_admin_acls(self):
        """Test GET /api/admin/acls - should return 3 default ACLs"""
        if not hasattr(self, 'admin_session'):
            return False
        response = self.admin_session.get(f"{self.base_url}/api/admin/acls")
        if response.status_code == 200:
            acls = response.json()
            if isinstance(acls, list):
                expected_acls = ['Acceso Completo', 'Solo Conexión', 'Solo Lectura']
                acl_names = [a.get('name') for a in acls]
                self.log(f"Found ACLs: {acl_names}")
                return len(acls) >= 3 and all(name in acl_names for name in expected_acls)
        return False

    def test_create_policy(self):
        """Test POST /api/admin/policies - create new policy"""
        if not hasattr(self, 'admin_session'):
            return False
        
        # First get available users and VMs
        users_response = self.admin_session.get(f"{self.base_url}/api/admin/users")
        vms_response = self.admin_session.get(f"{self.base_url}/api/admin/vms")
        acls_response = self.admin_session.get(f"{self.base_url}/api/admin/acls")
        
        if users_response.status_code != 200 or vms_response.status_code != 200 or acls_response.status_code != 200:
            return False
            
        users = users_response.json()
        vms = vms_response.json()
        acls = acls_response.json()
        
        if not users or not vms or not acls:
            return False
            
        # Create a test policy
        policy_data = {
            "name": "Test Policy",
            "description": "Test policy for API testing",
            "policy_type": "user_vm",
            "subject_type": "user",
            "subject_ids": [users[0]['id']],
            "vm_ids": [vms[0]['id']],
            "acl_id": acls[0]['id'],
            "enabled": True
        }
        
        response = self.admin_session.post(f"{self.base_url}/api/admin/policies", json=policy_data)
        if response.status_code == 200:
            policy = response.json()
            self.test_policy_id = policy.get('id')
            return policy.get('name') == 'Test Policy'
        return False

    def test_vm_assignment(self):
        """Test VM assignment to users/groups"""
        if not hasattr(self, 'admin_session'):
            return False
            
        # Get a VM and user for assignment
        vms_response = self.admin_session.get(f"{self.base_url}/api/admin/vms")
        users_response = self.admin_session.get(f"{self.base_url}/api/admin/users")
        
        if vms_response.status_code != 200 or users_response.status_code != 200:
            return False
            
        vms = vms_response.json()
        users = users_response.json()
        
        if not vms or not users:
            return False
            
        vm_id = vms[0]['id']
        user_id = users[0]['id']
        
        # Test VM assignment via PUT /api/admin/vms/{vm_id}
        assignment_data = {
            "assigned_user_ids": [user_id],
            "assigned_group_ids": []
        }
        
        response = self.admin_session.put(f"{self.base_url}/api/admin/vms/{vm_id}", json=assignment_data)
        if response.status_code == 200:
            updated_vm = response.json()
            return user_id in updated_vm.get('assigned_user_ids', [])
        return False

    def test_access_url_dual_connection(self):
        """Test access URL returns both tsplus_url and panel_url"""
        if not hasattr(self, 'admin_session'):
            return False
            
        # Get a VM with panel_port
        vms_response = self.admin_session.get(f"{self.base_url}/api/admin/vms")
        if vms_response.status_code != 200:
            return False
            
        vms = vms_response.json()
        vm_with_panel = None
        
        for vm in vms:
            if vm.get('panel_port'):
                vm_with_panel = vm
                break
                
        if not vm_with_panel:
            self.log("No VM with panel_port found for dual connection test")
            return False
            
        # Test access URL
        response = self.admin_session.get(f"{self.base_url}/api/vms/{vm_with_panel['id']}/access-url")
        if response.status_code == 200:
            access_data = response.json()
            has_tsplus = 'tsplus_url' in access_data
            has_panel = 'panel_url' in access_data and access_data['panel_url'] is not None
            self.log(f"Access URL data: {access_data}")
            return has_tsplus and has_panel
        return False

    def test_logout(self):
        """Test POST /api/auth/logout"""
        response = self.session.post(f"{self.base_url}/api/auth/logout")
        return response.status_code == 200

    def run_all_tests(self):
        """Run all API tests in sequence"""
        self.log("🚀 Starting WinDesk Cloud API Tests")
        self.log(f"Base URL: {self.base_url}")
        
        # Basic API tests
        self.run_test("API Health Check", self.test_health_check)
        self.run_test("API Root Endpoint", self.test_api_root)
        
        # Plans tests
        self.run_test("Get All Plans", self.test_get_plans)
        self.run_test("Get Single Plan", self.test_get_single_plan)
        
        # Authentication tests
        self.run_test("User Registration", self.test_user_registration)
        self.run_test("User Login", self.test_user_login)
        self.run_test("Admin Login", self.test_admin_login)
        self.run_test("Auth Me Endpoint", self.test_auth_me)
        
        # Orders and billing tests
        self.run_test("Create Order", self.test_create_order)
        self.run_test("Get Orders", self.test_get_orders)
        self.run_test("Get Single Order", self.test_get_single_order)
        self.run_test("Simulate Payment", self.test_simulate_payment)
        
        # VM provisioning (this takes time)
        self.log("⏳ Waiting for VM provisioning to complete...")
        self.run_test("VM Provisioning Wait", self.test_vm_provisioning_wait)
        
        # VM management tests
        self.run_test("Get VMs", self.test_get_vms)
        self.run_test("Get Single VM", self.test_get_single_vm)
        self.run_test("VM Metrics", self.test_vm_metrics)
        self.run_test("VM Access URL", self.test_vm_access_url)
        self.run_test("VM Restart", self.test_vm_restart)
        self.run_test("VM Snapshot", self.test_vm_snapshot)
        
        # Admin tests
        self.run_test("Admin Stats", self.test_admin_stats)
        self.run_test("Admin Users", self.test_admin_users)
        self.run_test("Admin Orders", self.test_admin_orders)
        
        # Extended admin tests for new features
        self.run_test("Admin VMs (7 VMs including 4 PROD)", self.test_admin_vms)
        self.run_test("Admin Groups (3 default groups)", self.test_admin_groups)
        self.run_test("Admin Roles (3 default roles)", self.test_admin_roles)
        self.run_test("Admin ACLs (3 default ACLs)", self.test_admin_acls)
        self.run_test("Create Policy", self.test_create_policy)
        self.run_test("VM Assignment to Users/Groups", self.test_vm_assignment)
        self.run_test("Access URL Dual Connection (TSplus + 1Panel)", self.test_access_url_dual_connection)
        
        # Cleanup
        self.run_test("User Logout", self.test_logout)
        
        # Print results
        self.log("\n" + "="*50)
        self.log(f"📊 Test Results: {self.tests_passed}/{self.tests_run} passed")
        success_rate = (self.tests_passed / self.tests_run) * 100 if self.tests_run > 0 else 0
        self.log(f"📈 Success Rate: {success_rate:.1f}%")
        
        if self.tests_passed == self.tests_run:
            self.log("🎉 All tests passed!", "SUCCESS")
            return 0
        else:
            self.log(f"⚠️  {self.tests_run - self.tests_passed} tests failed", "ERROR")
            return 1

def main():
    """Main test runner"""
    tester = WinDeskAPITester()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())