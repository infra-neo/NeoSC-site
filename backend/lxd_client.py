"""
LXD/LXC REST API Client for NeoSC NeoCloud VM provisioning.
Uses TLS client certificate authentication.
"""
import os
import httpx
import logging
from typing import Optional

logger = logging.getLogger("lxd_client")

LXD_API_URL = os.environ.get("LXD_API_URL", "https://149.56.241.64:8443")
LXD_CERT_PATH = os.environ.get("LXD_CERT_PATH", "/app/backend/lxd-client.crt")
LXD_KEY_PATH = os.environ.get("LXD_KEY_PATH", "/app/backend/lxd-client.key")
LXD_PROJECT = os.environ.get("LXD_PROJECT", "NeoSC")


def _get_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        base_url=LXD_API_URL,
        cert=(LXD_CERT_PATH, LXD_KEY_PATH),
        verify=False,
        timeout=30.0,
    )


def _p(project: Optional[str] = None) -> dict:
    """Return project query param."""
    return {"project": project or LXD_PROJECT}


async def check_connection() -> dict:
    try:
        async with _get_client() as client:
            r = await client.get("/1.0")
            if r.status_code == 200:
                meta = r.json().get("metadata", {})
                return {
                    "connected": True,
                    "api_version": meta.get("api_version"),
                    "server_name": meta.get("environment", {}).get("server_name"),
                    "server_version": meta.get("environment", {}).get("server_version"),
                    "auth": meta.get("auth"),
                    "project": LXD_PROJECT,
                }
            return {"connected": False, "error": f"HTTP {r.status_code}"}
    except Exception as e:
        logger.error(f"LXD connection failed: {e}")
        return {"connected": False, "error": str(e)}


async def list_projects() -> list:
    try:
        async with _get_client() as client:
            r = await client.get("/1.0/projects?recursion=1")
            if r.status_code != 200:
                return []
            return [
                {"name": p.get("name"), "description": p.get("description", "")}
                for p in r.json().get("metadata", [])
            ]
    except Exception as e:
        logger.error(f"LXD list projects failed: {e}")
        return []


async def list_instances(instance_type: Optional[str] = None, project: Optional[str] = None) -> list:
    try:
        async with _get_client() as client:
            r = await client.get("/1.0/instances", params={**_p(project), "recursion": "2"})
            if r.status_code != 200:
                return []
            instances = r.json().get("metadata", [])
            if instance_type:
                instances = [i for i in instances if i.get("type") == instance_type]
            result = []
            for inst in instances:
                state = inst.get("state", {})
                network = state.get("network", {})
                ipv4 = ""
                for iface_name, iface in network.items():
                    if iface_name == "lo":
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


async def get_instance(name: str, project: Optional[str] = None) -> dict:
    try:
        async with _get_client() as client:
            r = await client.get(f"/1.0/instances/{name}", params={**_p(project), "recursion": "1"})
            if r.status_code != 200:
                return {"error": f"HTTP {r.status_code}", "detail": r.text}
            return r.json().get("metadata", {})
    except Exception as e:
        return {"error": str(e)}


async def get_instance_state(name: str, project: Optional[str] = None) -> dict:
    try:
        async with _get_client() as client:
            r = await client.get(f"/1.0/instances/{name}/state", params=_p(project))
            if r.status_code != 200:
                return {"error": f"HTTP {r.status_code}"}
            return r.json().get("metadata", {})
    except Exception as e:
        return {"error": str(e)}


async def create_instance(
    name: str,
    instance_type: str = "virtual-machine",
    image_alias: str = "",
    cpu: str = "4",
    memory: str = "8GiB",
    disk_size: str = "120GiB",
    description: str = "",
    profiles: list = None,
    storage_pool: str = "default",
    project: Optional[str] = None,
) -> dict:
    if profiles is None:
        profiles = ["default"]

    # Determine source: fingerprint (hex >=12 chars) or alias
    if len(image_alias) >= 12 and all(c in "0123456789abcdef" for c in image_alias.lower()):
        source = {"type": "image", "fingerprint": image_alias}
    else:
        source = {"type": "image", "alias": image_alias}

    payload = {
        "name": name,
        "type": instance_type,
        "source": source,
        "config": {
            "limits.cpu": cpu,
            "limits.memory": memory,
        },
        "devices": {
            "root": {
                "path": "/",
                "pool": storage_pool,
                "type": "disk",
                "size": disk_size,
            }
        },
        "profiles": profiles,
        "description": description,
    }

    try:
        async with _get_client() as client:
            r = await client.post("/1.0/instances", json=payload, params=_p(project))
            data = r.json()
            if r.status_code in (200, 202):
                op_url = data.get("operation")
                if op_url:
                    await client.get(f"{op_url}/wait", params={**_p(project), "timeout": "120"}, timeout=130.0)
                return {"ok": True, "name": name, "operation": op_url}
            return {"ok": False, "error": data.get("error", r.text), "error_code": data.get("error_code")}
    except Exception as e:
        return {"ok": False, "error": str(e)}


async def change_instance_state(name: str, action: str, force: bool = False, project: Optional[str] = None) -> dict:
    payload = {"action": action, "timeout": 60, "force": force}
    try:
        async with _get_client() as client:
            r = await client.put(f"/1.0/instances/{name}/state", json=payload, params=_p(project))
            data = r.json()
            if r.status_code in (200, 202):
                op_url = data.get("operation")
                if op_url:
                    await client.get(f"{op_url}/wait", params={**_p(project), "timeout": "120"}, timeout=130.0)
                return {"ok": True, "action": action, "instance": name}
            return {"ok": False, "error": data.get("error", r.text)}
    except Exception as e:
        return {"ok": False, "error": str(e)}


async def delete_instance(name: str, force: bool = False, project: Optional[str] = None) -> dict:
    try:
        async with _get_client() as client:
            if force:
                await change_instance_state(name, "stop", force=True, project=project)
            r = await client.delete(f"/1.0/instances/{name}", params=_p(project))
            data = r.json()
            if r.status_code in (200, 202):
                op_url = data.get("operation")
                if op_url:
                    await client.get(f"{op_url}/wait", params={**_p(project), "timeout": "120"}, timeout=130.0)
                return {"ok": True, "deleted": name}
            return {"ok": False, "error": data.get("error", r.text)}
    except Exception as e:
        return {"ok": False, "error": str(e)}


async def list_images(project: Optional[str] = None) -> list:
    try:
        async with _get_client() as client:
            r = await client.get("/1.0/images", params={**_p(project), "recursion": "1"})
            if r.status_code != 200:
                return []
            images = r.json().get("metadata", [])
            return [
                {
                    "fingerprint": img.get("fingerprint", "")[:12],
                    "fingerprint_full": img.get("fingerprint", ""),
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


async def list_profiles(project: Optional[str] = None) -> list:
    try:
        async with _get_client() as client:
            r = await client.get("/1.0/profiles", params={**_p(project), "recursion": "1"})
            if r.status_code != 200:
                return []
            return [
                {"name": p.get("name"), "description": p.get("description"), "config": p.get("config", {})}
                for p in r.json().get("metadata", [])
            ]
    except Exception as e:
        return []


async def list_storage_pools(project: Optional[str] = None) -> list:
    try:
        async with _get_client() as client:
            r = await client.get("/1.0/storage-pools", params={**_p(project), "recursion": "1"})
            if r.status_code != 200:
                return []
            return [
                {
                    "name": p.get("name"),
                    "driver": p.get("driver"),
                    "status": p.get("status"),
                    "description": p.get("description", ""),
                }
                for p in r.json().get("metadata", [])
            ]
    except Exception as e:
        return []
