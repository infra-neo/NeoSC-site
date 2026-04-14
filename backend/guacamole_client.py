"""
Apache Guacamole REST API Client for NeoSC.
Manages RDP/VNC connections, users, groups, and OIDC integration.
"""
import httpx
import logging
import os
import base64

logger = logging.getLogger("guacamole_client")

GUACAMOLE_URL = os.environ.get("GUACAMOLE_URL", "")
GUACAMOLE_USER = os.environ.get("GUACAMOLE_USER", "guacadmin")
GUACAMOLE_PASS = os.environ.get("GUACAMOLE_PASS", "guacadmin")
GUACAMOLE_DATASOURCE = os.environ.get("GUACAMOLE_DATASOURCE", "postgresql")


def _client():
    return httpx.AsyncClient(timeout=15, verify=False)


async def get_token() -> str:
    if not GUACAMOLE_URL:
        return ""
    try:
        async with _client() as c:
            r = await c.post(f"{GUACAMOLE_URL}/api/tokens",
                             data={"username": GUACAMOLE_USER, "password": GUACAMOLE_PASS})
            if r.status_code == 200:
                return r.json().get("authToken", "")
            logger.error(f"Guacamole auth failed: {r.status_code} {r.text[:200]}")
    except Exception as e:
        logger.error(f"Guacamole auth error: {e}")
    return ""


async def check_status() -> dict:
    if not GUACAMOLE_URL:
        return {"connected": False, "error": "GUACAMOLE_URL not configured", "url": ""}
    token = await get_token()
    return {"connected": bool(token), "url": GUACAMOLE_URL, "datasource": GUACAMOLE_DATASOURCE}


# ─── Connections ──────────────────────────────────────────────────────────────

async def list_connections() -> list:
    token = await get_token()
    if not token:
        return []
    try:
        async with _client() as c:
            r = await c.get(f"{GUACAMOLE_URL}/api/session/data/{GUACAMOLE_DATASOURCE}/connectionGroups/ROOT/tree",
                            params={"token": token})
            if r.status_code == 200:
                tree = r.json()
                return [
                    {
                        "id": conn.get("identifier"),
                        "name": conn.get("name"),
                        "protocol": conn.get("protocol"),
                        "parentIdentifier": conn.get("parentIdentifier"),
                        "activeConnections": conn.get("activeConnections", 0),
                        "lastActive": conn.get("lastActive"),
                        "guacd_hostname": conn.get("attributes", {}).get("guacd-hostname", ""),
                    }
                    for conn in tree.get("childConnections", [])
                ]
    except Exception as e:
        logger.error(f"list_connections error: {e}")
    return []


async def get_connection_detail(connection_id: str) -> dict:
    """Get full connection detail including parameters."""
    token = await get_token()
    if not token:
        return {"error": "No token"}
    try:
        async with _client() as c:
            r_detail = await c.get(
                f"{GUACAMOLE_URL}/api/session/data/{GUACAMOLE_DATASOURCE}/connections/{connection_id}",
                params={"token": token})
            r_params = await c.get(
                f"{GUACAMOLE_URL}/api/session/data/{GUACAMOLE_DATASOURCE}/connections/{connection_id}/parameters",
                params={"token": token})
            detail = r_detail.json() if r_detail.status_code == 200 else {}
            params = r_params.json() if r_params.status_code == 200 else {}
            # Remove sensitive password
            safe_params = {k: (v if k != "password" else "***") for k, v in params.items()}
            return {
                "id": detail.get("identifier", connection_id),
                "name": detail.get("name", ""),
                "protocol": detail.get("protocol", ""),
                "parentIdentifier": detail.get("parentIdentifier", ""),
                "activeConnections": detail.get("activeConnections", 0),
                "lastActive": detail.get("lastActive"),
                "attributes": detail.get("attributes", {}),
                "parameters": safe_params,
                "raw_hostname": params.get("hostname", ""),
                "raw_port": params.get("port", ""),
            }
    except Exception as e:
        return {"error": str(e)}


async def create_connection(name, protocol, hostname, port, username="", password="",
                            parent_id="ROOT", extra_params=None) -> dict:
    token = await get_token()
    if not token:
        return {"ok": False, "error": "No Guacamole token"}
    params = {"hostname": hostname, "port": str(port)}
    if username:
        params["username"] = username
    if password:
        params["password"] = password
    if protocol == "rdp":
        params.setdefault("security", "any")
        params.setdefault("ignore-cert", "true")
        params.setdefault("resize-method", "display-update")
        params.setdefault("enable-wallpaper", "true")
        params.setdefault("enable-font-smoothing", "true")
        params.setdefault("enable-desktop-composition", "true")
        params.setdefault("enable-printing", "true")
        params.setdefault("enable-drive", "true")
        params.setdefault("drive-name", "NeoSC")
        params.setdefault("enable-audio-input", "true")
        params.setdefault("console-audio", "true")
    elif protocol == "vnc":
        params.setdefault("color-depth", "24")
    if extra_params:
        params.update(extra_params)
    payload = {
        "parentIdentifier": parent_id,
        "name": name,
        "protocol": protocol,
        "parameters": params,
        "attributes": {"max-connections": "5", "max-connections-per-user": "2"},
    }
    try:
        async with _client() as c:
            r = await c.post(
                f"{GUACAMOLE_URL}/api/session/data/{GUACAMOLE_DATASOURCE}/connections",
                params={"token": token}, json=payload)
            if r.status_code in (200, 201):
                data = r.json()
                return {"ok": True, "id": data.get("identifier"), "name": name, "protocol": protocol}
            return {"ok": False, "error": r.text[:300], "status": r.status_code}
    except Exception as e:
        return {"ok": False, "error": str(e)}


async def delete_connection(connection_id: str) -> dict:
    token = await get_token()
    if not token:
        return {"ok": False, "error": "No Guacamole token"}
    try:
        async with _client() as c:
            r = await c.delete(
                f"{GUACAMOLE_URL}/api/session/data/{GUACAMOLE_DATASOURCE}/connections/{connection_id}",
                params={"token": token})
            return {"ok": r.status_code in (200, 204), "deleted": connection_id}
    except Exception as e:
        return {"ok": False, "error": str(e)}


async def get_connection_link(connection_id: str) -> dict:
    token = await get_token()
    if not token:
        return {"ok": False, "error": "No Guacamole token"}
    client_id = base64.b64encode(f"{connection_id}\x00c\x00{GUACAMOLE_DATASOURCE}".encode()).decode()
    return {
        "ok": True,
        "url": f"{GUACAMOLE_URL}/#/client/{client_id}?token={token}",
        "embed_url": f"{GUACAMOLE_URL}/api/session/tunnel?token={token}&GUAC_DATA_SOURCE={GUACAMOLE_DATASOURCE}&GUAC_ID={connection_id}&GUAC_TYPE=c",
        "token": token,
        "client_id": client_id,
        "guacamole_url": GUACAMOLE_URL,
    }


# ─── Users ────────────────────────────────────────────────────────────────────

async def list_users() -> list:
    token = await get_token()
    if not token:
        return []
    try:
        async with _client() as c:
            r = await c.get(f"{GUACAMOLE_URL}/api/session/data/{GUACAMOLE_DATASOURCE}/users",
                            params={"token": token})
            if r.status_code == 200:
                return [{"username": uid, **u} for uid, u in r.json().items()]
    except Exception as e:
        logger.error(f"list_users error: {e}")
    return []


async def create_user(username: str, password: str = "", attributes: dict = None) -> dict:
    token = await get_token()
    if not token:
        return {"ok": False, "error": "No token"}
    payload = {
        "username": username,
        "password": password or "",
        "attributes": attributes or {"disabled": "", "expired": "", "access-window-start": "", "access-window-end": ""},
    }
    try:
        async with _client() as c:
            r = await c.post(f"{GUACAMOLE_URL}/api/session/data/{GUACAMOLE_DATASOURCE}/users",
                             params={"token": token}, json=payload)
            if r.status_code in (200, 201):
                return {"ok": True, "username": username}
            return {"ok": False, "error": r.text[:300]}
    except Exception as e:
        return {"ok": False, "error": str(e)}


async def grant_connection_to_user(username: str, connection_id: str) -> dict:
    """Grant READ permission on a connection to a user."""
    token = await get_token()
    if not token:
        return {"ok": False, "error": "No token"}
    patch = [{"op": "add", "path": f"/connectionPermissions/{connection_id}", "value": "READ"}]
    try:
        async with _client() as c:
            r = await c.patch(
                f"{GUACAMOLE_URL}/api/session/data/{GUACAMOLE_DATASOURCE}/users/{username}/permissions",
                params={"token": token}, json=patch)
            return {"ok": r.status_code in (200, 204), "username": username, "connection_id": connection_id}
    except Exception as e:
        return {"ok": False, "error": str(e)}


# ─── User Groups ──────────────────────────────────────────────────────────────

async def list_user_groups() -> list:
    token = await get_token()
    if not token:
        return []
    try:
        async with _client() as c:
            r = await c.get(f"{GUACAMOLE_URL}/api/session/data/{GUACAMOLE_DATASOURCE}/userGroups",
                            params={"token": token})
            if r.status_code == 200:
                groups = []
                for gid, g in r.json().items():
                    # Get members
                    mr = await c.get(
                        f"{GUACAMOLE_URL}/api/session/data/{GUACAMOLE_DATASOURCE}/userGroups/{gid}/memberUsers",
                        params={"token": token})
                    members = mr.json() if mr.status_code == 200 else []
                    # Get permissions
                    pr = await c.get(
                        f"{GUACAMOLE_URL}/api/session/data/{GUACAMOLE_DATASOURCE}/userGroups/{gid}/permissions",
                        params={"token": token})
                    perms = pr.json() if pr.status_code == 200 else {}
                    groups.append({
                        "identifier": gid,
                        "disabled": g.get("disabled", False),
                        "members": members,
                        "permissions": {
                            "connections": list(perms.get("connectionPermissions", {}).keys()),
                            "system": perms.get("systemPermissions", []),
                        },
                    })
                return groups
    except Exception as e:
        logger.error(f"list_user_groups error: {e}")
    return []


async def create_user_group(identifier: str) -> dict:
    token = await get_token()
    if not token:
        return {"ok": False, "error": "No token"}
    try:
        async with _client() as c:
            r = await c.post(f"{GUACAMOLE_URL}/api/session/data/{GUACAMOLE_DATASOURCE}/userGroups",
                             params={"token": token}, json={"identifier": identifier, "attributes": {"disabled": ""}})
            return {"ok": r.status_code in (200, 201), "identifier": identifier}
    except Exception as e:
        return {"ok": False, "error": str(e)}


async def add_user_to_group(group_id: str, username: str) -> dict:
    token = await get_token()
    if not token:
        return {"ok": False, "error": "No token"}
    patch = [{"op": "add", "path": "/", "value": username}]
    try:
        async with _client() as c:
            r = await c.patch(
                f"{GUACAMOLE_URL}/api/session/data/{GUACAMOLE_DATASOURCE}/userGroups/{group_id}/memberUsers",
                params={"token": token}, json=patch)
            return {"ok": r.status_code in (200, 204)}
    except Exception as e:
        return {"ok": False, "error": str(e)}


async def grant_connection_to_group(group_id: str, connection_id: str) -> dict:
    """Grant READ on a connection to a group."""
    token = await get_token()
    if not token:
        return {"ok": False, "error": "No token"}
    patch = [{"op": "add", "path": f"/connectionPermissions/{connection_id}", "value": "READ"}]
    try:
        async with _client() as c:
            r = await c.patch(
                f"{GUACAMOLE_URL}/api/session/data/{GUACAMOLE_DATASOURCE}/userGroups/{group_id}/permissions",
                params={"token": token}, json=patch)
            return {"ok": r.status_code in (200, 204)}
    except Exception as e:
        return {"ok": False, "error": str(e)}
