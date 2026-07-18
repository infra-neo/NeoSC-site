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

    async def get_peer(self, peer_id: str) -> dict:
        """Fetch a single peer by id (used to check connected state post-reboot)."""
        if not self.configured:
            return {"ok": False, "error": "not configured"}
        try:
            async with httpx.AsyncClient(timeout=15) as c:
                r = await c.get(f"{self.url}/api/peers/{peer_id}", headers=self._headers())
                if r.status_code >= 400:
                    return {"ok": False, "status_code": r.status_code, "error": r.text[:300]}
                return {"ok": True, "peer": r.json()}
        except Exception as e:
            return {"ok": False, "error": str(e)[:200]}

    async def wait_for_peer_connected(self, peer_id: str,
                                       max_attempts: int = 15,
                                       delay_s: int = 4) -> dict:
        """
        Poll a peer after a reboot trigger until NetBird reports connected=true again.
        Used after opennebula_client.reboot_vm() so we don't create reverse-proxy
        services against a peer that's mid-reboot.
        """
        import asyncio as _aio
        for attempt in range(1, max_attempts + 1):
            res = await self.get_peer(peer_id)
            if res.get("ok"):
                peer = res.get("peer", {})
                if peer.get("connected"):
                    return {"ok": True, "peer": peer, "attempts": attempt}
            await _aio.sleep(delay_s)
        return {"ok": False, "error": f"peer '{peer_id}' not reconnected after {max_attempts} attempts",
                "attempts": max_attempts}

    async def create_reverse_proxy_service(self, name: str, mode: str, peer_id: str,
                                            target_port: int, listen_port: int = None,
                                            pass_host_header: bool = False) -> dict:
        """
        Create a NetBird Reverse Proxy service pointing at a peer.
        mode: "tcp" | "http" | "udp" | "tls"
        For mode="tcp"/"udp"/"tls" you must pass listen_port (public port on the proxy cluster).
        For mode="http" listen_port is not required (routed by domain over 443).
        Docs: https://docs.netbird.io/api/resources/services
        """
        if not self.configured:
            return {"ok": False, "error": "NETBIRD_CLOUD_TOKEN not configured"}
        target = {
            "target_id": peer_id,
            "target_type": "peer",
            "protocol": mode,
            "port": target_port,
            "enabled": True,
        }
        body = {
            "name": name,
            "mode": mode,
            "targets": [target],
            "enabled": True,
            "pass_host_header": pass_host_header,
        }
        if mode != "http" and listen_port:
            body["listen_port"] = listen_port
        try:
            async with httpx.AsyncClient(timeout=20) as c:
                r = await c.post(f"{self.url}/api/reverse-proxies/services",
                                  headers=self._headers(), json=body)
                if r.status_code >= 400:
                    return {"ok": False, "status_code": r.status_code, "error": r.text[:400]}
                data = r.json()
                return {"ok": True, "id": data.get("id"), "domain": data.get("domain"), "data": data}
        except Exception as e:
            logger.error(f"create_reverse_proxy_service error: {e}")
            return {"ok": False, "error": str(e)[:200]}

    async def expose_vdi_peer(self, vm_name: str, peer_id: str,
                               rdp_port: int = 3389, http_port: int = 80) -> dict:
        """
        Creates the 2 endpoints a freshly-provisioned VDI VM needs:
          - TCP service  -> RDP (3389), for thick-client / TSplus Farm API reachability
          - HTTP service -> web/HTML5 portal (80), for the workspace access URL

        Returns {ok, rdp_url, html_url, rdp_service_id, http_service_id}.
        listen_port for the TCP service is derived from the vm_name so it's stable
        and collision-resistant across VMs (avoids clashing with other tenants' RDP
        services on the shared proxy cluster).
        """
        import zlib
        slug = vm_name.lower().replace("_", "-")
        # Deterministic pseudo-random port in the 20000-65000 range from the vm name
        tcp_listen_port = 20000 + (zlib.crc32(slug.encode()) % 45000)

        rdp_res = await self.create_reverse_proxy_service(
            name=f"{slug}-rdp", mode="tcp", peer_id=peer_id,
            target_port=rdp_port, listen_port=tcp_listen_port,
        )
        http_res = await self.create_reverse_proxy_service(
            name=slug, mode="http", peer_id=peer_id,
            target_port=http_port, pass_host_header=True,
        )

        if not rdp_res.get("ok") or not http_res.get("ok"):
            return {
                "ok": False,
                "error": f"rdp:{rdp_res.get('error')} http:{http_res.get('error')}",
                "rdp_result": rdp_res,
                "http_result": http_res,
            }

        rdp_domain = rdp_res.get("domain") or f"{slug}-rdp.eu1.netbird.services"
        http_domain = http_res.get("domain") or f"{slug}.eu1.netbird.services"
        return {
            "ok": True,
            "rdp_url": f"{rdp_domain}:{tcp_listen_port}",
            "html_url": f"https://{http_domain}",
            "rdp_service_id": rdp_res.get("id"),
            "http_service_id": http_res.get("id"),
        }

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


netbird_cloud_client = NetBirdCloudClient()
