"""Tests for SSE notifications + B2B tenant invite flow (iteration 11)."""
import os
import time
import uuid
import threading
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://action-steps-4.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@windesk.cloud"
ADMIN_PASS = "Admin123!"
USER_EMAIL = "usuario1@windesk.cloud"
USER_PASS = "Demo123!"


def _login(email: str, password: str) -> str:
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    data = r.json()
    return data.get("access_token") or data.get("token")


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PASS)


@pytest.fixture(scope="module")
def user_token():
    return _login(USER_EMAIL, USER_PASS)


@pytest.fixture
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture
def user_headers(user_token):
    return {"Authorization": f"Bearer {user_token}"}


# ============ SSE Stream ============

class TestSSEStream:
    def test_invalid_token_returns_401(self):
        r = requests.get(f"{API}/notifications/stream?token=invalid-xyz", timeout=10, stream=True)
        assert r.status_code == 401, r.text

    def test_missing_token_returns_401(self):
        r = requests.get(f"{API}/notifications/stream", timeout=10, stream=True)
        assert r.status_code == 401

    def test_valid_token_returns_event_stream_with_ready(self, admin_token):
        url = f"{API}/notifications/stream?token={admin_token}"
        r = requests.get(url, timeout=10, stream=True)
        assert r.status_code == 200
        assert "text/event-stream" in r.headers.get("content-type", "")
        # Read initial 'ready' event (first chunk)
        buff = b""
        start = time.time()
        for chunk in r.iter_content(chunk_size=256):
            buff += chunk
            if b"event: ready" in buff:
                break
            if time.time() - start > 6:
                break
        r.close()
        assert b"event: ready" in buff, f"Did not receive ready event, got: {buff!r}"


# ============ Notifications Test Endpoint ============

class TestNotificationsTest:
    def test_non_admin_forbidden(self, user_headers):
        r = requests.post(f"{API}/notifications/test", headers=user_headers, json={})
        assert r.status_code == 403

    def test_admin_publish_ok(self, admin_headers):
        r = requests.post(f"{API}/notifications/test", headers=admin_headers,
                          json={"title": "TEST_notif", "message": "hi"})
        assert r.status_code == 200
        data = r.json()
        assert data.get("ok") is True
        assert "target" in data


# ============ End-to-end SSE delivery ============

class TestSSEEndToEnd:
    def test_admin_test_notification_delivered_via_sse(self, admin_token, admin_headers):
        """Open SSE, then trigger /notifications/test, expect the event delivered."""
        url = f"{API}/notifications/stream?token={admin_token}"
        received = {"data": b""}

        def reader():
            try:
                r = requests.get(url, timeout=12, stream=True)
                start = time.time()
                for chunk in r.iter_content(chunk_size=256):
                    received["data"] += chunk
                    if b"TEST_E2E_SSE" in received["data"]:
                        break
                    if time.time() - start > 8:
                        break
                r.close()
            except Exception as e:
                received["err"] = str(e)

        t = threading.Thread(target=reader, daemon=True)
        t.start()
        time.sleep(1.5)  # let stream establish

        # Trigger a notification; admin sends to self (no user_id -> self)
        pub = requests.post(f"{API}/notifications/test", headers=admin_headers,
                            json={"type": "info", "title": "TEST_E2E_SSE", "message": "e2e"})
        assert pub.status_code == 200

        t.join(timeout=9)
        assert b"TEST_E2E_SSE" in received["data"], f"SSE did not receive event. Buff: {received['data'][:400]!r}"


# ============ Admin Session Action ============

class TestAdminSessionAction:
    def test_non_admin_forbidden(self, user_headers):
        r = requests.post(f"{API}/admin/sessions/any-id/action",
                          headers=user_headers, json={"action": "logoff"})
        assert r.status_code == 403

    def test_invalid_action_400(self, admin_headers):
        # Need a real session id — just test unknown action on unknown session: action validated first
        r = requests.post(f"{API}/admin/sessions/does-not-exist/action",
                          headers=admin_headers, json={"action": "boom"})
        assert r.status_code == 400

    def test_session_not_found_404(self, admin_headers):
        r = requests.post(f"{API}/admin/sessions/does-not-exist/action",
                          headers=admin_headers, json={"action": "logoff"})
        assert r.status_code == 404


# ============ Mock Emails (admin only) ============

class TestMockEmailsAdmin:
    def test_list_emails_non_admin_forbidden(self, user_headers):
        r = requests.get(f"{API}/admin/emails", headers=user_headers)
        assert r.status_code == 403

    def test_list_emails_admin_ok(self, admin_headers):
        r = requests.get(f"{API}/admin/emails", headers=admin_headers)
        assert r.status_code == 200
        data = r.json()
        assert "emails" in data
        assert isinstance(data["emails"], list)
        assert "count" in data

    def test_get_email_not_found(self, admin_headers):
        r = requests.get(f"{API}/admin/emails/nonexistent-id", headers=admin_headers)
        assert r.status_code == 404


# ============ Tenant Invite Users (B2B) ============

class TestInviteUsers:
    def test_non_admin_forbidden(self, user_headers):
        r = requests.post(f"{API}/tenants/invite-users", headers=user_headers,
                          json={"emails": ["x@y.com"]})
        assert r.status_code == 403

    def test_invited_users_list_non_admin_forbidden(self, user_headers):
        r = requests.get(f"{API}/tenants/invited-users", headers=user_headers)
        assert r.status_code == 403

    def test_invite_mixed_emails_and_persistence(self, admin_headers):
        unique = uuid.uuid4().hex[:8]
        new_email = f"test_invitee_{unique}@example.com"
        dup_email = ADMIN_EMAIL  # already exists
        invalid = "not-an-email"

        payload = {
            "emails": [new_email, dup_email, invalid, ""],
            "role": "user",
            "welcome_message": "TEST_welcome hi",
        }
        r = requests.post(f"{API}/tenants/invite-users", headers=admin_headers, json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["ok"] is True
        results = {res["email"]: res["status"] for res in data["results"]}
        # Status checks
        assert results.get(new_email) == "invited"
        assert results.get(dup_email.lower()) == "already_exists"
        # Invalid ones
        invalid_results = [r for r in data["results"] if r["status"] == "invalid"]
        assert len(invalid_results) >= 1

        # Retrieve email id for invited
        invited_res = [r for r in data["results"] if r["status"] == "invited"][0]
        email_id = invited_res.get("email_id")
        assert email_id

        # Verify email content via admin preview
        er = requests.get(f"{API}/admin/emails/{email_id}", headers=admin_headers)
        assert er.status_code == 200
        email_doc = er.json()
        assert email_doc["to"] == new_email
        assert email_doc["category"] == "user_invite"
        assert "body_html" in email_doc
        assert "NeoSC" in email_doc["body_html"]
        assert "invite=" in email_doc["body_html"]  # magic link

        # Verify appears in invited list
        lr = requests.get(f"{API}/tenants/invited-users", headers=admin_headers)
        assert lr.status_code == 200
        emails_in_list = [u["email"] for u in lr.json().get("users", [])]
        assert new_email in emails_in_list

        # Verify appears in admin emails list
        lre = requests.get(f"{API}/admin/emails", headers=admin_headers)
        assert lre.status_code == 200
        eids = [e["id"] for e in lre.json().get("emails", [])]
        assert email_id in eids

    def test_invite_empty_list(self, admin_headers):
        r = requests.post(f"{API}/tenants/invite-users", headers=admin_headers,
                          json={"emails": [], "role": "user"})
        assert r.status_code == 200
        assert r.json()["total"] == 0
