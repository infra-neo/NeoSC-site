#!/usr/bin/env python3
"""
WinDesk Cloud Onboarding API Testing Suite
Tests the onboarding flow endpoints specifically
"""

import requests
import sys
import json
import time
from datetime import datetime

class OnboardingAPITester:
    def __init__(self, base_url="https://action-steps-4.preview.emergentagent.com"):
        self.base_url = base_url
        self.session = requests.Session()
        self.tests_run = 0
        self.tests_passed = 0
        
        # Create a new user for onboarding testing
        timestamp = datetime.now().strftime("%H%M%S")
        self.new_user_email = f"newuser_{timestamp}@test.com"
        self.new_user_password = "Test123!"
        self.new_user_name = f"New User {timestamp}"
        
        # Test organization data
        self.org_name = f"Test Organization {timestamp}"
        self.org_domain = "testorg.com"
        
        # Test admin data
        self.admin_name = f"Admin User {timestamp}"
        self.admin_email = self.new_user_email  # Same as new user
        
        # Test plan selection
        self.selected_plan = "starter"

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

    def test_register_new_user(self):
        """Register a new user for onboarding testing"""
        data = {
            "email": self.new_user_email,
            "password": self.new_user_password,
            "name": self.new_user_name
        }
        response = self.session.post(f"{self.base_url}/api/auth/register", json=data)
        if response.status_code == 200:
            user_data = response.json()
            self.log(f"Registered new user: {user_data.get('email')}")
            return True
        else:
            self.log(f"Registration failed: {response.status_code} - {response.text}")
            return False

    def test_onboarding_status_new_customer(self):
        """Test GET /api/onboarding/status returns is_new_customer=true for new users"""
        response = self.session.get(f"{self.base_url}/api/onboarding/status")
        if response.status_code == 200:
            status = response.json()
            self.log(f"Onboarding status: {status}")
            return (status.get("is_new_customer") == True and 
                   status.get("onboarding_completed") == False and
                   status.get("current_step") == 1)
        else:
            self.log(f"Status check failed: {response.status_code} - {response.text}")
            return False

    def test_onboarding_organization(self):
        """Test POST /api/onboarding/organization saves organization name"""
        data = {
            "name": self.org_name,
            "domain": self.org_domain
        }
        response = self.session.post(f"{self.base_url}/api/onboarding/organization", json=data)
        if response.status_code == 200:
            result = response.json()
            self.log(f"Organization setup result: {result}")
            return result.get("message") == "Organization setup completed" and result.get("next_step") == 2
        else:
            self.log(f"Organization setup failed: {response.status_code} - {response.text}")
            return False

    def test_onboarding_admin(self):
        """Test POST /api/onboarding/admin confirms admin user"""
        data = {
            "admin_name": self.admin_name,
            "admin_email": self.admin_email,
            "admin_password": self.new_user_password
        }
        response = self.session.post(f"{self.base_url}/api/onboarding/admin", json=data)
        if response.status_code == 200:
            result = response.json()
            self.log(f"Admin setup result: {result}")
            return result.get("message") == "Admin setup completed" and result.get("next_step") == 3
        else:
            self.log(f"Admin setup failed: {response.status_code} - {response.text}")
            return False

    def test_onboarding_plan(self):
        """Test POST /api/onboarding/plan saves selected plan"""
        data = {
            "selected_plan": self.selected_plan
        }
        response = self.session.post(f"{self.base_url}/api/onboarding/plan", json=data)
        if response.status_code == 200:
            result = response.json()
            self.log(f"Plan setup result: {result}")
            return (result.get("message") == "Plan selected" and 
                   result.get("next_step") == 4 and
                   result.get("plan") == "Starter")
        else:
            self.log(f"Plan setup failed: {response.status_code} - {response.text}")
            return False

    def test_onboarding_summary(self):
        """Test GET /api/onboarding/summary returns correct data"""
        response = self.session.get(f"{self.base_url}/api/onboarding/summary")
        if response.status_code == 200:
            summary = response.json()
            self.log(f"Onboarding summary: {summary}")
            org_check = summary.get("organization", {}).get("name") == self.org_name
            admin_check = summary.get("admin", {}).get("email") == self.admin_email
            plan_check = summary.get("plan", {}).get("id") == self.selected_plan
            return org_check and admin_check and plan_check
        else:
            self.log(f"Summary check failed: {response.status_code} - {response.text}")
            return False

    def test_onboarding_complete(self):
        """Test POST /api/onboarding/complete marks onboarding as finished"""
        response = self.session.post(f"{self.base_url}/api/onboarding/complete", json={})
        if response.status_code == 200:
            result = response.json()
            self.log(f"Onboarding complete result: {result}")
            return (result.get("message") == "Onboarding completed successfully" and
                   result.get("organization_name") == self.org_name and
                   result.get("show_tour") == True)
        else:
            self.log(f"Onboarding completion failed: {response.status_code} - {response.text}")
            return False

    def test_onboarding_status_completed(self):
        """Test GET /api/onboarding/status after completion shows onboarding_completed=true"""
        response = self.session.get(f"{self.base_url}/api/onboarding/status")
        if response.status_code == 200:
            status = response.json()
            self.log(f"Final onboarding status: {status}")
            return (status.get("is_new_customer") == False and 
                   status.get("onboarding_completed") == True and
                   status.get("organization_name") == self.org_name and
                   status.get("show_tour") == True)
        else:
            self.log(f"Final status check failed: {response.status_code} - {response.text}")
            return False

    def test_complete_tour(self):
        """Test POST /api/onboarding/complete-tour marks tour as completed"""
        response = self.session.post(f"{self.base_url}/api/onboarding/complete-tour", json={})
        if response.status_code == 200:
            result = response.json()
            self.log(f"Tour completion result: {result}")
            return result.get("message") == "Tour completed"
        else:
            self.log(f"Tour completion failed: {response.status_code} - {response.text}")
            return False

    def test_onboarding_status_tour_completed(self):
        """Test GET /api/onboarding/status after tour completion shows show_tour=false"""
        response = self.session.get(f"{self.base_url}/api/onboarding/status")
        if response.status_code == 200:
            status = response.json()
            self.log(f"Status after tour completion: {status}")
            return status.get("show_tour") == False
        else:
            self.log(f"Status check after tour failed: {response.status_code} - {response.text}")
            return False

    def run_all_tests(self):
        """Run all onboarding API tests in sequence"""
        self.log("🚀 Starting WinDesk Cloud Onboarding API Tests")
        self.log(f"Base URL: {self.base_url}")
        
        # Step 1: Register new user
        self.run_test("Register New User", self.test_register_new_user)
        
        # Step 2: Check initial onboarding status (should be new customer)
        self.run_test("Onboarding Status - New Customer", self.test_onboarding_status_new_customer)
        
        # Step 3: Complete organization setup
        self.run_test("Onboarding Organization Setup", self.test_onboarding_organization)
        
        # Step 4: Complete admin setup
        self.run_test("Onboarding Admin Setup", self.test_onboarding_admin)
        
        # Step 5: Select plan
        self.run_test("Onboarding Plan Selection", self.test_onboarding_plan)
        
        # Step 6: Get onboarding summary
        self.run_test("Onboarding Summary", self.test_onboarding_summary)
        
        # Step 7: Complete onboarding
        self.run_test("Onboarding Complete", self.test_onboarding_complete)
        
        # Step 8: Check final onboarding status
        self.run_test("Onboarding Status - Completed", self.test_onboarding_status_completed)
        
        # Step 9: Complete tour
        self.run_test("Complete Tour", self.test_complete_tour)
        
        # Step 10: Check status after tour completion
        self.run_test("Onboarding Status - Tour Completed", self.test_onboarding_status_tour_completed)
        
        # Print results
        self.log("\n" + "="*50)
        self.log(f"📊 Onboarding Test Results: {self.tests_passed}/{self.tests_run} passed")
        success_rate = (self.tests_passed / self.tests_run) * 100 if self.tests_run > 0 else 0
        self.log(f"📈 Success Rate: {success_rate:.1f}%")
        
        if self.tests_passed == self.tests_run:
            self.log("🎉 All onboarding tests passed!", "SUCCESS")
            return 0
        else:
            self.log(f"⚠️  {self.tests_run - self.tests_passed} onboarding tests failed", "ERROR")
            return 1

def main():
    """Main test runner"""
    tester = OnboardingAPITester()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())