#!/usr/bin/env python3
"""
Test onboarding status for existing users (should not trigger onboarding)
"""

import requests
import sys

def test_existing_user_onboarding():
    """Test that existing users don't get redirected to onboarding"""
    base_url = "https://action-steps-4.preview.emergentagent.com"
    session = requests.Session()
    
    # Login with existing admin user
    login_data = {
        "email": "admin@windesk.cloud",
        "password": "Admin123!"
    }
    
    print("🔍 Testing existing user onboarding status...")
    
    # Login
    login_response = session.post(f"{base_url}/api/auth/login", json=login_data)
    if login_response.status_code != 200:
        print(f"❌ Login failed: {login_response.status_code}")
        return False
    
    print("✅ Admin login successful")
    
    # Check onboarding status
    status_response = session.get(f"{base_url}/api/onboarding/status")
    if status_response.status_code != 200:
        print(f"❌ Status check failed: {status_response.status_code}")
        return False
    
    status = status_response.json()
    print(f"📊 Admin onboarding status: {status}")
    
    # For existing admin, should not be new customer
    if status.get("is_new_customer") == False:
        print("✅ Existing user correctly identified (not new customer)")
        return True
    else:
        print("❌ Existing user incorrectly marked as new customer")
        return False

if __name__ == "__main__":
    success = test_existing_user_onboarding()
    sys.exit(0 if success else 1)