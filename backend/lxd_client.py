"""
LXD/LXC REST API Client for NeoSC NeoCloud VM provisioning.
Uses TLS client certificate authentication.
"""
import os
import httpx
import logging
from typing import Optional

logger = logging.getLogger("lxd_client")

LXD_API_URL = os.environ.get("LXD_API_URL", "https://100.121.53.218:8443")
LXD_CERT_PATH = os.environ.get("LXD_CERT_PATH", "/app/backend/lxd-client.crt")
LXD_KEY_PATH = os.environ.get("LXD_KEY_PATH", "/app/backend/lxd-client.key")


def _get_client() -> httpx.AsyncClient:
    """Create httpx client with LXD TLS cert auth."""
    return httpx.AsyncClient(
        base_url=LXD_API_URL,
        cert=(LXD_CERT_PATH, LXD_KEY_PATH),
        verify=False,
        timeout=30.0,
    )


async def check_connection() -> dict:
    """Test connectivity to LXD server."""
    try:
        async with _get_client() as client:
            r = await client.get("/1.0")
            if r.status_code == 200:
                data = r.json()
                meta = data.get("metadata", {})
                return {
                    "connected": True,
                    "api_version": meta.get("api_version"),
                    "server_name": meta.get("environment", {}).get("server_name"),
                    "server_version": meta.get("environment", {}).get("server_version"),
                    "auth": meta.get("auth"),
                }
            return {"connected": False, "error": f"HTTP {r.status_code}"}
    except Exception as e:
        logger.error(f"LXD connection failed: {e}")
        return {"connected": False, "error": str(e)}


async def list_instances(instance_type: Optional[str] = None) -> list:
    """List all instances (containers + VMs). Use type='virtual-machine' to filter."""
    try:
        async with _get_client() as client:
            r = await client.get("/1.0/instances?recursion=2")
            if r.status_code != 200:
                return []
            instances = r.json().get("metadata", [])
            if instance_type:
                instances = [i for i in instances if i.get("type") == instance_type]
            result = []
            for inst in instances:
                state = inst.get("state", {})
                network = state.get("network", {})
                # Get IPv4 from eth0 or enp5s0
                ipv4 = ""
                for iface_name, iface in network.items():
                    if iface_name in ("lo",):
                        continue
                    for addr in iface.get("addresses", []):
                        if addr.get("family") == "inet" and addr.get("scope") == "global":
                            ipv4 = addr["address"]
                            break
                    if ipv4:
                        break

                result.append({
                    "name": inst.get("name"),
                    "type": inst.get("type"),
                    "status": inst.get("status"),
                    "status_code": inst.get("status_code"),
                    "description": inst.get("description", ""),
                    "created_at": inst.get("created_at"),
                    "ipv4": ipv4,
                    "architecture": inst.get("architecture"),
                    "config": {
                        "cpu": inst.get("config", {}).get("limits.cpu", ""),
                        "memory": inst.get("config", {}).get("limits.memory", ""),
                        "image": inst.get("config", {}).get("image.description", ""),
                    },
                    "profiles": inst.get("profiles", []),
                    "location": inst.get("location", ""),
                })
            return result
    except Exception as e:
        logger.error(f"LXD list instances failed: {e}")
        return []


async def get_instance(name: str) -> dict:
    """Get details of a specific instance."""
    try:
        async with _get_client() as client:
            r = await client.get(f"/1.0/instances/{name}?recursion=1")
            if r.status_code != 200:
                return {"error": f"HTTP {r.status_code}", "detail": r.text}
            return r.json().get("metadata", {})
    except Exception as e:
        return {"error": str(e)}


async def get_instance_state(name: str) -> dict:
    """Get runtime state (CPU, memory, network, disk) of an instance."""
    try:
        async with _get_client() as client:
            r = await client.get(f"/1.0/instances/{name}/state")
            if r.status_code != 200:
                return {"error": f"HTTP {r.status_code}"}
            return r.json().get("metadata", {})
    except Exception as e:
        return {"error": str(e)}


async def create_instance(
    name: str,
    instance_type: str = "virtual-machine",
    image_alias: str = "ubuntu/24.04",
    cpu: str = "4",
    memory: str = "8GiB",
    disk_size: str = "120GiB",
    description: str = "",
    profiles: list = None,
) -> dict:
    """Create a new VM or container."""
    if profiles is None:
        profiles = ["default"]

    payload = {
        "name": name,
        "type": instance_type,
        "source": {
            "type": "image",
            "alias": image_alias,
        },
        "config": {
            "limits.cpu": cpu,
            "limits.memory": memory,
        },
        "devices": {
            "root": {
                "path": "/",
                "pool": "default",
                "type": "disk",
                "size": disk_size,
            }
        },
        "profiles": profiles,
        "description": description,
    }

    try:
        async with _get_client() as client:
            r = await client.post("/1.0/instances", json=payload)
            data = r.json()
            if r.status_code in (200, 202):
                # Async operation — wait for it
                op_url = data.get("operation")
                if op_url:
                    await client.get(f"{op_url}/wait?timeout=120")
                return {"ok": True, "name": name, "operation": op_url}
            return {"ok": False, "error": data.get("error", r.text)}
    except Exception as e:
        return {"ok": False, "error": str(e)}


async def change_instance_state(name: str, action: str, force: bool = False) -> dict:
    """Start, stop, restart, or freeze an instance."""
    payload = {"action": action, "timeout": 60, "force": force}
    try:
        async with _get_client() as client:
            r = await client.put(f"/1.0/instances/{name}/state", json=payload)
            data = r.json()
            if r.status_code in (200, 202):
                op_url = data.get("operation")
                if op_url:
                    await client.get(f"{op_url}/wait?timeout=120")
                return {"ok": True, "action": action, "instance": name}
            return {"ok": False, "error": data.get("error", r.text)}
    except Exception as e:
        return {"ok": False, "error": str(e)}


async def delete_instance(name: str, force: bool = False) -> dict:
    """Delete an instance. Must be stopped first unless force=True."""
    try:
        async with _get_client() as client:
            if force:
                # Stop first
                await change_instance_state(name, "stop", force=True)
            r = await client.delete(f"/1.0/instances/{name}")
            data = r.json()
            if r.status_code in (200, 202):
                op_url = data.get("operation")
                if op_url:
                    await client.get(f"{op_url}/wait?timeout=120")
                return {"ok": True, "deleted": name}
            return {"ok": False, "error": data.get("error", r.text)}
    except Exception as e:
        return {"ok": False, "error": str(e)}


async def list_images() -> list:
    """List available images on the LXD server."""
    try:
        async with _get_client() as client:
            r = await client.get("/1.0/images?recursion=1")
            if r.status_code != 200:
                return []
            images = r.json().get("metadata", [])
            return [
                {
                    "fingerprint": img.get("fingerprint", "")[:12],
                    "description": img.get("properties", {}).get("description", ""),
                    "os": img.get("properties", {}).get("os", ""),
                    "release": img.get("properties", {}).get("release", ""),
                    "architecture": img.get("architecture"),
                    "size": img.get("size", 0),
                    "type": img.get("type"),
                    "aliases": [a.get("name") for a in img.get("aliases", [])],
                    "created_at": img.get("created_at"),
                }
                for img in images
            ]
    except Exception as e:
        logger.error(f"LXD list images failed: {e}")
        return []


async def list_profiles() -> list:
    """List available profiles."""
    try:
        async with _get_client() as client:
            r = await client.get("/1.0/profiles?recursion=1")
            if r.status_code != 200:
                return []
            return [
                {
                    "name": p.get("name"),
                    "description": p.get("description"),
                    "config": p.get("config", {}),
                }
                for p in r.json().get("metadata", [])
            ]
    except Exception as e:
        return []
