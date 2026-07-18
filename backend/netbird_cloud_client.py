"""
NetBird Cloud client (app.netbird.io / api.netbird.io)
Used to create setup-keys for new VMs so the in-VM agent can auto-register
and obtain a NetBird mesh IP.

Env vars:
  NETBIRD_CLOUD_URL   = https://api.netbird.io
  NETBIRD_CLOUD_TOKEN = nbp_xxxxxxxxxxxx  (Personal Access Token)
"""
import os
import logging
import httpx

logger = logging.getLogger("netbird_cloud")


class NetBirdCloudClient:
    def __init__(self):
        self.url = os.environ.get("NETBIRD_CLOUD_URL", "https://api.netbird.io").rstrip("/")
        self.token = os.environ.get("NETBIRD_CLOUD_TOKEN", "")

    @property
    def configured(self) -> bool:
        return bool(self.token)

    def _headers(self) -> dict:
        return {
            "Authorization": f"Token {self.token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    async def create_setup_key(self, name: str, group_ids: list = None,
                                expires_in_days: int = 7, ephemeral: bool = False) -> dict:
        """Create a one-time setup key for a new peer to auto-register."""
        if not self.configured:
            return {"ok": False, "error": "NETBIRD_CLOUD_TOKEN not configured"}
        body = {
            "name": name,
            "type": "reusable" if not ephemeral else "one-off",
            "expires_in": expires_in_days * 86400,
            "revoked": False,
            "auto_groups": group_ids or [],
            "usage_limit": 0 if not ephemeral else 1,
            "ephemeral": ephemeral,
        }
        try:
            async with httpx.AsyncClient(timeout=15) as c:
                r = await c.post(f"{self.url}/api/setup-keys", headers=self._headers(), json=body)
                if r.status_code >= 400:
                    return {"ok": False, "status_code": r.status_code, "error": r.text[:300]}
                data = r.json()
                return {"ok": True, "key": data.get("key"), "id": data.get("id"), "data": data}
        except Exception as e:
            logger.error(f"create_setup_key error: {e}")
            return {"ok": False, "error": str(e)[:200]}

    async def list_peers(self) -> dict:
        if not self.configured:
            return {"ok": False, "error": "not configured"}
        try:
            async with httpx.AsyncClient(timeout=15) as c:
                r = await c.get(f"{self.url}/api/peers", headers=self._headers())
                if r.status_code >= 400:
                    return {"ok": False, "status_code": r.status_code, "error": r.text[:300]}
                return {"ok": True, "peers": r.json()}
        except Exception as e:
            return {"ok": False, "error": str(e)[:200]}

    async def find_peer_by_hostname(self, hostname: str) -> dict:
        """Locate a registered peer by hostname or name. Returns its mesh IP."""
        res = await self.list_peers()
        if not res.get("ok"):
            return res
        for p in res.get("peers", []):
            if p.get("hostname") == hostname or p.get("name") == hostname:
                return {"ok": True, "peer": p, "netbird_ip": p.get("ip")}
        return {"ok": False, "error": f"peer not found: {hostname}"}

    async def poll_peer_until_registered(self, vm_name: str,
                                          max_attempts: int = 30,
                                          delay_s: int = 4) -> dict:
        """
        Poll NetBird until a peer matching `vm_name` (by .name) shows up.
        Returns {ok, netbird_ip, peer, attempts}.
        """
        import asyncio as _aio
        for attempt in range(1, max_attempts + 1):
            res = await self.list_peers()
            if res.get("ok"):
                for p in res.get("peers", []):
                    name = (p.get("name") or "").lower()
                    hostname = (p.get("hostname") or "").lower()
                    target = vm_name.lower()
                    if name == target or hostname == target or target in name:
                        return {
                            "ok": True,
                            "netbird_ip": p.get("ip"),
                            "peer": p,
                            "peer_id": p.get("id"),
                            "dns_label": p.get("dns_label"),
                            "attempts": attempt,
                        }
            await _aio.sleep(delay_s)
        return {"ok": False, "error": f"peer '{vm_name}' not registered after {max_attempts} attempts", "attempts": max_attempts}

    async def create_group(self, name: str) -> dict:
        if not self.configured:
            return {"ok": False, "error": "not configured"}
        try:
            async with httpx.AsyncClient(timeout=15) as c:
                r = await c.post(f"{self.url}/api/groups", headers=self._headers(),
                                  json={"name": name})
                if r.status_code >= 400:
                    return {"ok": False, "status_code": r.status_code, "error": r.text[:300]}
                d = r.json()
                return {"ok": True, "id": d.get("id"), "data": d}
        except Exception as e:
            return {"ok": False, "error": str(e)[:200]}

    async def create_network_route(self, network_id: str, peer_id: str,
                                    network_range: str, description: str = "",
                                    groups: list = None, enabled: bool = True) -> dict:
        """
        Add a Network Route so the peer advertises `network_range` (CIDR) to the mesh.
        network_id is the NetBird Network id (get from /api/networks).
        """
        if not self.configured:
            return {"ok": False, "error": "not configured"}
        body = {
            "description": description or f"Gateway route to {network_range}",
            "network_id": description or f"gw-{peer_id[:6]}",
            "peer": peer_id,
            "network": network_range,
            "metric": 9999,
            "masquerade": True,
            "enabled": enabled,
            "groups": groups or [],
            "keep_route": False,
        }
        try:
            async with httpx.AsyncClient(timeout=15) as c:
                # NetBird uses /api/routes (legacy) or /api/networks/{id}/routes for network-scoped
                url = f"{self.url}/api/networks/{network_id}/routes" if network_id else f"{self.url}/api/routes"
                r = await c.post(url, headers=self._headers(), json=body)
                if r.status_code >= 400:
                    return {"ok": False, "status_code": r.status_code, "error": r.text[:300]}
                d = r.json()
                return {"ok": True, "route_id": d.get("id"), "data": d}
        except Exception as e:
            return {"ok": False, "error": str(e)[:200]}

    async def list_networks(self) -> dict:
        if not self.configured:
            return {"ok": False, "error": "not configured"}
        try:
            async with httpx.AsyncClient(timeout=10) as c:
                r = await c.get(f"{self.url}/api/networks", headers=self._headers())
                if r.status_code >= 400:
                    return {"ok": False, "status_code": r.status_code}
                data = r.json()
                return {"ok": True, "networks": data if isinstance(data, list) else data.get("networks", [])}
        except Exception as e:
            return {"ok": False, "error": str(e)[:200]}


netbird_cloud_client = NetBirdCloudClient()
