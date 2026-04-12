"""
Apache Guacamole REST API Client for NeoSC.
Manages RDP/VNC connections programmatically via Guacamole's REST API.
"""
import httpx
import logging
import os

logger = logging.getLogger("guacamole_client")

GUACAMOLE_URL = os.environ.get("GUACAMOLE_URL", "")
GUACAMOLE_USER = os.environ.get("GUACAMOLE_USER", "guacadmin")
GUACAMOLE_PASS = os.environ.get("GUACAMOLE_PASS", "guacadmin")
GUACAMOLE_DATASOURCE = os.environ.get("GUACAMOLE_DATASOURCE", "mysql")


async def get_token() -> str:
    """Authenticate with Guacamole and get a session token."""
    if not GUACAMOLE_URL:
        return ""
    try:
        async with httpx.AsyncClient(timeout=10, verify=False) as c:
            r = await c.post(
                f"{GUACAMOLE_URL}/api/tokens",
                data={"username": GUACAMOLE_USER, "password": GUACAMOLE_PASS},
            )
            if r.status_code == 200:
                return r.json().get("authToken", "")
            logger.error(f"Guacamole auth failed: {r.status_code} {r.text[:200]}")
    except Exception as e:
        logger.error(f"Guacamole auth error: {e}")
    return ""


async def list_connections() -> list:
    """List all connections in the ROOT group."""
    token = await get_token()
    if not token:
        return []
    try:
        async with httpx.AsyncClient(timeout=10, verify=False) as c:
            r = await c.get(
                f"{GUACAMOLE_URL}/api/session/data/{GUACAMOLE_DATASOURCE}/connectionGroups/ROOT/tree",
                params={"token": token},
            )
            if r.status_code == 200:
                tree = r.json()
                connections = tree.get("childConnections", [])
                return [
                    {
                        "id": conn.get("identifier"),
                        "name": conn.get("name"),
                        "protocol": conn.get("protocol"),
                        "parentIdentifier": conn.get("parentIdentifier"),
                        "activeConnections": conn.get("activeConnections", 0),
                    }
                    for conn in connections
                ]
    except Exception as e:
        logger.error(f"Guacamole list connections error: {e}")
    return []


async def create_connection(
    name: str,
    protocol: str,
    hostname: str,
    port: int,
    username: str = "",
    password: str = "",
    parent_id: str = "ROOT",
    extra_params: dict = None,
) -> dict:
    """Create an RDP or VNC connection in Guacamole."""
    token = await get_token()
    if not token:
        return {"ok": False, "error": "No Guacamole token"}
    params = {
        "hostname": hostname,
        "port": str(port),
    }
    if username:
        params["username"] = username
    if password:
        params["password"] = password

    # Protocol-specific defaults
    if protocol == "rdp":
        params.setdefault("security", "nla")
        params.setdefault("ignore-cert", "true")
        params.setdefault("resize-method", "display-update")
        params.setdefault("enable-wallpaper", "true")
        params.setdefault("enable-font-smoothing", "true")
    elif protocol == "vnc":
        params.setdefault("color-depth", "24")

    if extra_params:
        params.update(extra_params)

    payload = {
        "parentIdentifier": parent_id,
        "name": name,
        "protocol": protocol,
        "parameters": params,
        "attributes": {
            "max-connections": "5",
            "max-connections-per-user": "2",
        },
    }
    try:
        async with httpx.AsyncClient(timeout=10, verify=False) as c:
            r = await c.post(
                f"{GUACAMOLE_URL}/api/session/data/{GUACAMOLE_DATASOURCE}/connections",
                params={"token": token},
                json=payload,
            )
            if r.status_code in (200, 201):
                data = r.json()
                return {"ok": True, "id": data.get("identifier"), "name": name, "protocol": protocol}
            return {"ok": False, "error": r.text[:300], "status": r.status_code}
    except Exception as e:
        return {"ok": False, "error": str(e)}


async def delete_connection(connection_id: str) -> dict:
    """Delete a connection from Guacamole."""
    token = await get_token()
    if not token:
        return {"ok": False, "error": "No Guacamole token"}
    try:
        async with httpx.AsyncClient(timeout=10, verify=False) as c:
            r = await c.delete(
                f"{GUACAMOLE_URL}/api/session/data/{GUACAMOLE_DATASOURCE}/connections/{connection_id}",
                params={"token": token},
            )
            return {"ok": r.status_code in (200, 204), "deleted": connection_id}
    except Exception as e:
        return {"ok": False, "error": str(e)}


async def get_connection_link(connection_id: str) -> dict:
    """Get a direct Guacamole link for a connection."""
    token = await get_token()
    if not token:
        return {"ok": False, "error": "No Guacamole token"}
    # Guacamole uses encoded connection identifier: <id>\0c\0<datasource>
    import base64
    client_id = base64.b64encode(f"{connection_id}\x00c\x00{GUACAMOLE_DATASOURCE}".encode()).decode()
    return {
        "ok": True,
        "url": f"{GUACAMOLE_URL}/#/client/{client_id}?token={token}",
        "token": token,
        "client_id": client_id,
    }


async def check_status() -> dict:
    """Check if Guacamole is reachable."""
    if not GUACAMOLE_URL:
        return {"connected": False, "error": "GUACAMOLE_URL not configured", "url": ""}
    token = await get_token()
    return {
        "connected": bool(token),
        "url": GUACAMOLE_URL,
        "datasource": GUACAMOLE_DATASOURCE,
    }


def get_cloud_init_guacamole() -> str:
    """Return cloud-init runcmd lines to install Guacamole via Docker."""
    return """
# Install Docker
curl -fsSL https://get.docker.com | sh

# Create Guacamole network
docker network create guacamole-net

# Start guacd
docker run -d --name guacd --network guacamole-net --restart always guacamole/guacd

# Init MySQL
docker run --rm guacamole/guacamole /opt/guacamole/bin/initdb.sh --mysql > /tmp/initdb.sql

# Start MySQL
docker run -d --name guac-mysql --network guacamole-net --restart always \
  -e MYSQL_ROOT_PASSWORD=guacamole_root_pw \
  -e MYSQL_DATABASE=guacamole_db \
  -e MYSQL_USER=guacamole_user \
  -e MYSQL_PASSWORD=guacamole_pw \
  mysql:8.0

sleep 15

# Init database
docker exec -i guac-mysql mysql -uroot -pguacamole_root_pw guacamole_db < /tmp/initdb.sql

# Start Guacamole web
docker run -d --name guacamole --network guacamole-net --restart always \
  -e GUACD_HOSTNAME=guacd \
  -e MYSQL_HOSTNAME=guac-mysql \
  -e MYSQL_DATABASE=guacamole_db \
  -e MYSQL_USER=guacamole_user \
  -e MYSQL_PASSWORD=guacamole_pw \
  -p 8080:8080 \
  guacamole/guacamole
"""
