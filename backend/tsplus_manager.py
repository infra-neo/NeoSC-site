"""
TSplus Farm Manager API Client for NeoSC.
Manages credential injection and session control.
"""
import httpx
import os
import logging
from typing import Optional

logger = logging.getLogger("tsplus_manager")

TSPLUS_HOST = os.environ.get("TSPLUS_HOST", "10.100.10.152")
TSPLUS_PORT = os.environ.get("TSPLUS_PORT", "80")
TSPLUS_ADMIN_USER = os.environ.get("TSPLUS_ADMIN_USER", "Administrator")
TSPLUS_ADMIN_PASS = os.environ.get("TSPLUS_ADMIN_PASS", "")
TSPLUS_BASE_URL = f"http://{TSPLUS_HOST}:{TSPLUS_PORT}"


class TSPlusManager:
    """
    Integrates with TSplus Farm Manager API for:
    - Credential injection (autologon tokens)
    - Session control (logoff, disconnect, lock)
    """

    def _auth(self):
        return (TSPLUS_ADMIN_USER, TSPLUS_ADMIN_PASS) if TSPLUS_ADMIN_PASS else None

    async def get_autologon_token(self, username: str, password: str,
                                   domain: str = "", application_path: str = "") -> dict:
        """Get an autologon token from TSplus. Frontend uses this token in URL, never sees password."""
        try:
            async with httpx.AsyncClient(verify=False, timeout=10.0) as client:
                payload = {"UserName": username, "UserPassword": password}
                if domain:
                    payload["DomainName"] = domain
                if application_path:
                    payload["ApplicationPath"] = application_path

                resp = await client.post(
                    f"{TSPLUS_BASE_URL}/software/farmapi/",
                    params={"action": "GetToken"},
                    auth=self._auth(),
                    json=payload
                )
                resp.raise_for_status()
                data = resp.json()
                token = data.get("token") or data.get("Token") or ""
                return {
                    "token": token,
                    "session_url": f"{TSPLUS_BASE_URL}/software/?token={token}" if token else "",
                    "raw": data,
                }
        except Exception as e:
            logger.error(f"TSplus autologon error: {e}")
            return {"token": "", "session_url": "", "error": str(e)}

    async def list_sessions(self) -> list:
        """List active sessions on TSplus via Farm Manager API."""
        try:
            async with httpx.AsyncClient(verify=False, timeout=10.0) as client:
                resp = await client.get(
                    f"{TSPLUS_BASE_URL}/software/farmapi/",
                    params={"action": "GetSessions"},
                    auth=self._auth()
                )
                resp.raise_for_status()
                data = resp.json()
                return data if isinstance(data, list) else data.get("Sessions", [])
        except Exception as e:
            logger.error(f"TSplus list_sessions error: {e}")
            return []

    async def get_user_session(self, username: str) -> Optional[dict]:
        """Find active session for a specific user."""
        sessions = await self.list_sessions()
        for s in sessions:
            if s.get("UserName", "").lower() == username.lower():
                return s
        return None

    async def logoff_session(self, session_id: str) -> bool:
        """Logoff — close Windows session completely."""
        return await self._session_action("LogoffSession", session_id)

    async def disconnect_session(self, session_id: str) -> bool:
        """Disconnect — keep session alive, user can reconnect."""
        return await self._session_action("DisconnectSession", session_id)

    async def lock_session(self, session_id: str) -> bool:
        """Lock screen (Win+L equivalent)."""
        return await self._session_action("LockSession", session_id)

    async def _session_action(self, action: str, session_id: str) -> bool:
        try:
            async with httpx.AsyncClient(verify=False, timeout=10.0) as client:
                resp = await client.post(
                    f"{TSPLUS_BASE_URL}/software/farmapi/",
                    params={"action": action},
                    auth=self._auth(),
                    json={"SessionId": session_id}
                )
                return resp.status_code in (200, 201, 204)
        except Exception as e:
            logger.error(f"TSplus {action} error: {e}")
            return False

    async def check_status(self) -> dict:
        """Check if TSplus Farm Manager is reachable."""
        try:
            async with httpx.AsyncClient(verify=False, timeout=5.0) as client:
                resp = await client.get(f"{TSPLUS_BASE_URL}/software/farmapi/",
                                        params={"action": "GetSessions"}, auth=self._auth())
                return {"connected": resp.status_code < 500, "url": TSPLUS_BASE_URL, "status_code": resp.status_code}
        except Exception as e:
            return {"connected": False, "url": TSPLUS_BASE_URL, "error": str(e)}


tsplus_manager = TSPlusManager()
