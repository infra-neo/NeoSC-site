"""
LXD/LXC REST API Client for NeoSC NeoCloud VM provisioning.
Uses TLS client certificate authentication. Supports project switching.
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
                for iface_name, iface in (network or {}).items():
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
                        "os": inst.get("config", {}).get("image.os", ""),
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


def _build_cloud_init(username: str = "", password: str = "", ssh_key: str = "",
                       netbird_setup_key: str = "", addons: list = None) -> str:
    """Build cloud-init user-data YAML."""
    lines = ["#cloud-config"]

    # User creation
    if username:
        lines.append("users:")
        lines.append(f"  - name: {username}")
        lines.append("    shell: /bin/bash")
        lines.append("    sudo: ALL=(ALL) NOPASSWD:ALL")
        lines.append("    groups: sudo,adm")
        if password:
            lines.append(f"    plain_text_passwd: \"{password}\"")
            lines.append("    lock_passwd: false")
        if ssh_key:
            lines.append("    ssh_authorized_keys:")
            lines.append(f"      - {ssh_key}")

    # SSH config
    lines.append("ssh_pwauth: true")

    # Packages
    packages = ["curl", "wget", "openssh-server"]
    addons = addons or []
    runcmd = []

    if netbird_setup_key or "netbird" in addons:
        packages.append("ca-certificates")
        runcmd.append("curl -fsSL https://pkgs.netbird.io/install.sh | sh")
        if netbird_setup_key:
            runcmd.append(f"netbird up --setup-key {netbird_setup_key} --management-url https://manager.kappa4.com")

    if "docker" in addons:
        runcmd.append("curl -fsSL https://get.docker.com | sh")
        if username:
            runcmd.append(f"usermod -aG docker {username}")

    if "cockpit" in addons:
        packages.append("cockpit")
        runcmd.append("systemctl enable --now cockpit.socket")

    lines.append("packages:")
    for p in packages:
        lines.append(f"  - {p}")

    if runcmd:
        lines.append("runcmd:")
        for cmd in runcmd:
            lines.append(f"  - {cmd}")

    return "\n".join(lines)


async def create_instance(
    name: str,
    instance_type: str = "container",
    image_alias: str = "",
    cpu: str = "4",
    memory: str = "8GiB",
    disk_size: str = "120GiB",
    description: str = "",
    profiles: list = None,
    storage_pool: str = "default",
    project: Optional[str] = None,
    username: str = "",
    password: str = "",
    ssh_key: str = "",
    netbird_setup_key: str = "",
    addons: list = None,
    iso_path: str = "",
    enable_tpm: bool = False,
    secure_boot: bool = False,
) -> dict:
    if profiles is None:
        profiles = ["default"]

    # Build source — handle remote aliases (images:, ubuntu:, ubuntu-daily:),
    # local fingerprints, local aliases, and ISO-only (no image) installs.
    REMOTE_SERVERS = {
        "images":        ("https://images.linuxcontainers.org", "simplestreams"),
        "ubuntu":        ("https://cloud-images.ubuntu.com/releases", "simplestreams"),
        "ubuntu-daily":  ("https://cloud-images.ubuntu.com/daily", "simplestreams"),
    }
    if not image_alias:
        # ISO-only or blank — let LXD create an empty disk VM
        source = {"type": "none"}
    elif ":" in image_alias and image_alias.split(":")[0] in REMOTE_SERVERS:
        remote_name, alias_part = image_alias.split(":", 1)
        server_url, protocol = REMOTE_SERVERS[remote_name]
        source = {
            "type": "image",
            "alias": alias_part,
            "server": server_url,
            "protocol": protocol,
        }
    elif len(image_alias) >= 12 and all(c in "0123456789abcdef" for c in image_alias.lower()):
        # Local image fingerprint (short or full)
        source = {"type": "image", "fingerprint": image_alias}
    else:
        # Local image alias
        source = {"type": "image", "alias": image_alias}

    config = {
        "limits.cpu": cpu,
        "limits.memory": memory,
    }

    # VM-specific config
    if instance_type == "virtual-machine":
        if secure_boot:
            config["security.secureboot"] = "true"
        else:
            config["security.secureboot"] = "false"

    # Cloud-init
    if username or netbird_setup_key or addons:
        cloud_init = _build_cloud_init(username, password, ssh_key, netbird_setup_key, addons)
        config["user.user-data"] = cloud_init

    devices = {
        "root": {
            "path": "/",
            "pool": storage_pool,
            "type": "disk",
            "size": disk_size,
        }
    }

    # TPM for Windows 11
    if enable_tpm and instance_type == "virtual-machine":
        devices["vtpm"] = {
            "type": "tpm",
            "path": "/dev/tpm0",
        }

    # ISO attachment for VM installation (must be backed by pool for VMs)
    if iso_path and instance_type == "virtual-machine":
        devices["install"] = {
            "type": "disk",
            "source": iso_path,
            "pool": storage_pool,
            "boot.priority": "10",
        }

    payload = {
        "name": name,
        "type": instance_type,
        "source": source,
        "config": config,
        "devices": devices,
        "profiles": profiles,
        "description": description,
    }

    logger.info(
        f"LXD create_instance: name={name} type={instance_type} "
        f"source={source} project={project or LXD_PROJECT}"
    )
    try:
        async with _get_client() as client:
            r = await client.post("/1.0/instances", json=payload, params=_p(project))
            data = r.json()
            logger.debug(f"LXD create response HTTP {r.status_code}: {data}")
            if r.status_code in (200, 202) and data.get("type") != "error":
                op_url = data.get("operation")
                if op_url:
                    wait_r = await client.get(
                        f"{op_url}/wait",
                        params={**_p(project), "timeout": "180"},
                        timeout=190.0,
                    )
                    wait_data = wait_r.json()
                    if wait_data.get("type") == "error":
                        err = wait_data.get("error", "Operation failed")
                        logger.error(f"LXD operation failed for {name}: {err}")
                        return {"ok": False, "error": err, "error_code": wait_data.get("error_code")}
                return {"ok": True, "name": name, "operation": op_url}
            err = data.get("error", r.text)
            logger.error(f"LXD create_instance rejected for {name}: {err} (HTTP {r.status_code})")
            return {"ok": False, "error": err, "error_code": data.get("error_code")}
    except Exception as e:
        logger.error(f"LXD create_instance exception for {name}: {e}")
        return {"ok": False, "error": str(e)}


async def change_instance_state(name: str, action: str, force: bool = False, project: Optional[str] = None) -> dict:
    payload = {"action": action, "timeout": 60, "force": force}
    try:
        async with _get_client() as client:
            r = await client.put(f"/1.0/instances/{name}/state", json=payload, params=_p(project))
            data = r.json()
            if r.status_code in (200, 202) and data.get("type") != "error":
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
                try:
                    await change_instance_state(name, "stop", force=True, project=project)
                except Exception:
                    pass
            r = await client.delete(f"/1.0/instances/{name}", params=_p(project))
            data = r.json()
            if r.status_code in (200, 202) and data.get("type") != "error":
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
                for img in r.json().get("metadata", [])
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


async def exec_command(name: str, command: list, project: Optional[str] = None) -> dict:
    """Execute a command inside a running instance and return the result."""
    try:
        async with _get_client() as client:
            r = await client.post(
                f"/1.0/instances/{name}/exec",
                json={
                    "command": command,
                    "record-output": True,
                    "wait-for-websocket": False,
                    "interactive": False,
                },
                params=_p(project),
            )
            data = r.json()
            if r.status_code in (200, 202) and data.get("type") != "error":
                op_url = data.get("operation")
                if op_url:
                    wait_r = await client.get(f"{op_url}/wait", params={**_p(project), "timeout": "30"}, timeout=35.0)
                    wait_data = wait_r.json()
                    meta = wait_data.get("metadata", {}).get("metadata", {})
                    return_code = meta.get("return", -1)
                    output = meta.get("output", {})
                    stdout_url = output.get("1", "")
                    stderr_url = output.get("2", "")
                    stdout_text = ""
                    stderr_text = ""
                    if stdout_url:
                        sr = await client.get(stdout_url, params=_p(project))
                        if sr.status_code == 200:
                            stdout_text = sr.text
                    if stderr_url:
                        sr = await client.get(stderr_url, params=_p(project))
                        if sr.status_code == 200:
                            stderr_text = sr.text
                    return {
                        "ok": True,
                        "return_code": return_code,
                        "stdout": stdout_text,
                        "stderr": stderr_text,
                    }
            return {"ok": False, "error": data.get("error", r.text)}
    except Exception as e:
        return {"ok": False, "error": str(e)}


async def update_instance(name: str, updates: dict, project: Optional[str] = None) -> dict:
    """PATCH an instance config/devices. Used to fix or add devices."""
    try:
        async with _get_client() as client:
            r = await client.patch(
                f"/1.0/instances/{name}",
                json=updates,
                params=_p(project),
            )
            data = r.json()
            if r.status_code in (200, 202) and data.get("type") != "error":
                return {"ok": True, "name": name}
            return {"ok": False, "error": data.get("error", r.text)}
    except Exception as e:
        return {"ok": False, "error": str(e)}


async def remove_instance_device(name: str, device_name: str, project: Optional[str] = None) -> dict:
    """Remove a specific device from an instance by fetching current config, deleting the device, and PUTting back."""
    try:
        async with _get_client() as client:
            # GET current instance
            r = await client.get(f"/1.0/instances/{name}", params={**_p(project), "recursion": "1"})
            if r.status_code != 200:
                return {"ok": False, "error": f"GET failed: {r.status_code}"}
            meta = r.json().get("metadata", {})
            devices = meta.get("devices", {})
            config = meta.get("config", {})
            profiles = meta.get("profiles", [])
            description = meta.get("description", "")

            if device_name not in devices:
                return {"ok": False, "error": f"Device '{device_name}' not found"}

            del devices[device_name]

            # PUT updated instance (full replace of writable fields)
            put_payload = {
                "devices": devices,
                "config": {k: v for k, v in config.items() if not k.startswith("volatile.")},
                "profiles": profiles,
                "description": description,
            }
            r2 = await client.put(f"/1.0/instances/{name}", json=put_payload, params=_p(project))
            data2 = r2.json()
            if r2.status_code in (200, 202) and data2.get("type") != "error":
                return {"ok": True, "removed": device_name, "instance": name}
            return {"ok": False, "error": data2.get("error", r2.text)}
    except Exception as e:
        return {"ok": False, "error": str(e)}


async def fix_instance_iso_devices(name: str, pool: str = "dir", project: Optional[str] = None) -> dict:
    """Fix ISO disk devices that are missing a pool (common Windows VM issue).
    Adds pool backing to any disk device that has 'source' but no 'pool'."""
    try:
        async with _get_client() as client:
            r = await client.get(f"/1.0/instances/{name}", params={**_p(project), "recursion": "1"})
            if r.status_code != 200:
                return {"ok": False, "error": f"GET failed: {r.status_code}"}
            meta = r.json().get("metadata", {})
            devices = meta.get("devices", {})
            config = meta.get("config", {})
            profiles = meta.get("profiles", [])
            description = meta.get("description", "")

            fixed = []
            for dev_name, dev_conf in list(devices.items()):
                if dev_conf.get("type") == "disk" and dev_conf.get("source") and not dev_conf.get("pool"):
                    # This is an ISO/disk without pool - remove it to unblock other VMs
                    del devices[dev_name]
                    fixed.append(dev_name)

            if not fixed:
                return {"ok": True, "fixed": [], "message": "No devices needed fixing"}

            put_payload = {
                "devices": devices,
                "config": {k: v for k, v in config.items() if not k.startswith("volatile.")},
                "profiles": profiles,
                "description": description,
            }
            r2 = await client.put(f"/1.0/instances/{name}", json=put_payload, params=_p(project))
            data2 = r2.json()
            if r2.status_code in (200, 202) and data2.get("type") != "error":
                return {"ok": True, "fixed": fixed, "instance": name}
            return {"ok": False, "error": data2.get("error", r2.text)}
    except Exception as e:
        return {"ok": False, "error": str(e)}
