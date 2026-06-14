"""
OpenNebula OneFlow client — skeleton ready to plug.
Configure via env:
  OPENNEBULA_URL     = https://your-opennebula:9869   (OneFlow REST API)
  OPENNEBULA_USER    = oneadmin
  OPENNEBULA_PASSWORD= <password>
  OPENNEBULA_VM_TEMPLATE_TSPLUS = id of VMTemplate with TSplus+NeoMesh preinstalled
"""
import os
import logging
import httpx
from typing import Optional

logger = logging.getLogger("opennebula")


class OpenNebulaClient:
    def __init__(self):
        self.url = os.environ.get("OPENNEBULA_URL", "")
        self.user = os.environ.get("OPENNEBULA_USER", "")
        self.password = os.environ.get("OPENNEBULA_PASSWORD", "")
        self.vm_template_id = os.environ.get("OPENNEBULA_VM_TEMPLATE_TSPLUS", "")

    @property
    def configured(self) -> bool:
        return bool(self.url and self.user and self.password)

    @property
    def _auth(self):
        return (self.user, self.password)

    async def check_status(self) -> dict:
        if not self.configured:
            return {"connected": False, "url": self.url or "(no configurado)",
                    "error": "Configura OPENNEBULA_URL/USER/PASSWORD en /app/backend/.env"}
        try:
            async with httpx.AsyncClient(timeout=8, verify=False) as c:
                r = await c.get(f"{self.url}/service_template", auth=self._auth)
                return {"connected": r.status_code < 400, "status_code": r.status_code,
                        "url": self.url, "templates_available": r.json().get("DOCUMENT_POOL", {}) if r.status_code < 400 else None}
        except Exception as e:
            return {"connected": False, "url": self.url, "error": str(e)[:200]}

    async def list_service_templates(self) -> list:
        if not self.configured:
            return []
        try:
            async with httpx.AsyncClient(timeout=10, verify=False) as c:
                r = await c.get(f"{self.url}/service_template", auth=self._auth)
                if r.status_code >= 400:
                    return []
                pool = r.json().get("DOCUMENT_POOL", {}).get("DOCUMENT", [])
                return pool if isinstance(pool, list) else [pool]
        except Exception as e:
            logger.error(f"list_service_templates: {e}")
            return []

    async def instantiate_template(self, template_id: str, vm_name: str,
                                    cpu: int, memory_mb: int, disk_gb: int,
                                    os_image: str, extras: Optional[dict] = None) -> dict:
        """Instantiate a service-template with custom resources.
        Returns {ok, service_id, error}."""
        if not self.configured:
            return {"ok": False, "error": "OpenNebula not configured"}
        body = {
            "action": {
                "perform": "instantiate",
                "params": {
                    "merge_template": {
                        "name": vm_name,
                        "custom_attrs_values": {
                            "CPU": str(cpu),
                            "MEMORY": str(memory_mb),
                            "DISK_SIZE": str(disk_gb * 1024),
                            "OS_IMAGE": os_image,
                            **(extras or {}),
                        },
                    }
                }
            }
        }
        try:
            async with httpx.AsyncClient(timeout=30, verify=False) as c:
                r = await c.post(
                    f"{self.url}/service_template/{template_id}/action",
                    auth=self._auth, json=body,
                )
                if r.status_code >= 400:
                    return {"ok": False, "error": f"HTTP {r.status_code}: {r.text[:200]}"}
                d = r.json()
                return {"ok": True, "service_id": d.get("DOCUMENT", {}).get("ID"), "response": d}
        except Exception as e:
            return {"ok": False, "error": str(e)[:200]}


opennebula_client = OpenNebulaClient()
