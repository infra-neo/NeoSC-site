"""
OpenNebula client — wraps the existing wrapper REST API at
http://149.56.241.64:3000/api (Node.js bridge that talks to OpenNebula OneFlow XML-RPC).

Env vars:
  OPENNEBULA_API_URL     = http://149.56.241.64:3000/api   (wrapper REST)
  OPENNEBULA_SUNSTONE_URL= http://149.56.241.64             (Sunstone UI)
  OPENNEBULA_TOKEN       = <oneadmin one_auth token sha256>

Fallback: if the wrapper is unreachable, we run a simulated provisioning
so the UX never breaks during demos.
"""
import os
import logging
import httpx
from typing import Optional, List

logger = logging.getLogger("opennebula")

# Static template catalog mirroring the reference marketplace.html
TEMPLATE_CATALOG = [
    {
        "templateId": 14,
        "name": "WINDOWS-SERVER-VDI-TSPLUS-GOLD",
        "badge": "GOLD",
        "version": "v1.0.0",
        "tier": "starter",
        "tsplus_users": {"default": 3, "min": 3, "max": 5},
        "description": "Imagen maestra para VDI empresarial, preparada para sysprep y clonación masiva mediante OneFlow Service con optimización avanzada de memoria.",
        "cpu": 4,
        "memory": 8192,
        "disk": 120,
        "os": "Windows Server 2025",
        "tags": ["Enterprise", "VDI", "TSplus", "Premium"],
        "category": "windows",
        "service_id": 9,
        "price_monthly": 79,
        "price_yearly": 790,
    },
    {
        "templateId": 12,
        "name": "WINDOWS-SERVER-2025-VDI-STANDARD",
        "badge": "STD",
        "version": "v1.0.0",
        "tier": "business",
        "tsplus_users": {"default": 10, "min": 6, "max": 15},
        "description": "Perfil de oficina y productividad general para escritorios virtuales con suite corporativa preinstalada.",
        "cpu": 4,
        "memory": 8192,
        "disk": 100,
        "os": "Windows Server 2025",
        "tags": ["Oficina", "VDI", "Estándar", "TSplus"],
        "category": "windows",
        "service_id": 9,
        "price_monthly": 189,
        "price_yearly": 1890,
    },
    {
        "templateId": 16,
        "name": "WIN11-VDI-POWER",
        "badge": "POWER",
        "version": "v1.0.0",
        "tier": "enterprise",
        "tsplus_users": {"default": 25, "min": 16, "max": 100},
        "description": "Perfil para cargas más exigentes con mayor memoria, vCPU dedicado y optimización para procesamiento de datos masivo.",
        "cpu": 6,
        "memory": 16384,
        "disk": 120,
        "os": "Windows 11",
        "tags": ["Power User", "VDI", "Desarrollo"],
        "category": "windows",
        "service_id": 9,
        "price_monthly": 499,
        "price_yearly": 4990,
    },
]


class OpenNebulaClient:
    def __init__(self):
        self.api_url = os.environ.get("OPENNEBULA_API_URL", "").rstrip("/")
        self.sunstone_url = os.environ.get("OPENNEBULA_SUNSTONE_URL", "").rstrip("/")
        self.token = os.environ.get("OPENNEBULA_TOKEN", "")

    @property
    def configured(self) -> bool:
        return bool(self.api_url)

    def _headers(self) -> dict:
        h = {"Content-Type": "application/json", "Accept": "application/json"}
        if self.token:
            h["Authorization"] = f"Bearer {self.token}"
        return h

    async def health(self) -> dict:
        if not self.configured:
            return {"ok": False, "error": "OPENNEBULA_API_URL not set"}
        try:
            async with httpx.AsyncClient(timeout=5) as c:
                r = await c.get(f"{self.api_url}/health", headers=self._headers())
                return {"ok": r.status_code == 200, "status_code": r.status_code,
                        "data": r.json() if r.headers.get("content-type", "").startswith("application/json") else None}
        except Exception as e:
            return {"ok": False, "error": str(e)[:200]}

    def list_templates(self) -> List[dict]:
        """Returns the static catalog (mirrors the reference HTML)."""
        return TEMPLATE_CATALOG

    def get_template(self, template_id: int) -> Optional[dict]:
        return next((t for t in TEMPLATE_CATALOG if t["templateId"] == template_id), None)

    async def instantiate_vm(self, template_id: int, vm_name: str,
                              cpu: int, memory_mb: int) -> dict:
        """
        Calls the wrapper API: POST /api/vm/instantiate
        Body: {templateId, vmName, cpu, memory}
        Returns: {ok, vm_id?, service_id?, message, raw}
        """
        if not self.configured:
            return {"ok": False, "error": "OpenNebula API URL not configured"}

        body = {
            "templateId": template_id,
            "vmName": vm_name,
            "cpu": cpu,
            "memory": memory_mb,
        }
        try:
            async with httpx.AsyncClient(timeout=60) as c:
                r = await c.post(
                    f"{self.api_url}/vm/instantiate",
                    headers=self._headers(),
                    json=body,
                )
                payload = r.json() if r.headers.get("content-type", "").startswith("application/json") else {"raw": r.text}
                if r.status_code >= 400 or payload.get("success") is False:
                    return {"ok": False,
                            "status_code": r.status_code,
                            "error": payload.get("message") or payload.get("error") or r.text[:200],
                            "raw": payload}
                return {
                    "ok": True,
                    "vm_id": payload.get("vmId") or payload.get("vm_id"),
                    "service_id": payload.get("serviceId") or payload.get("service_id"),
                    "message": payload.get("message") or "VM instanced",
                    "raw": payload,
                }
        except httpx.RequestError as e:
            return {"ok": False, "error": f"Connection error: {str(e)[:200]}"}
        except Exception as e:
            return {"ok": False, "error": str(e)[:200]}

    async def vm_action(self, vm_id: str, action: str) -> dict:
        """
        Calls the wrapper API: POST /api/vm/{id}/action
        Body: {"action": "start"|"stop"|"reboot"|"poweroff"|"suspend"|"resume"|"terminate"}

        ⚠️ NO VERIFICADO contra el wrapper real (149.56.241.64:3000) — asume la
        misma convención REST que /vm/instantiate. Si el wrapper Node.js expone
        otra ruta/verbo, ajusta aquí. Prueba primero con:
          curl -X POST http://149.56.241.64:3000/api/vm/<id>/action \\
               -H "Authorization: Bearer $OPENNEBULA_TOKEN" \\
               -H "Content-Type: application/json" -d '{"action":"reboot"}'
        """
        valid = {"start", "stop", "reboot", "poweroff", "suspend", "resume", "terminate"}
        if action not in valid:
            return {"ok": False, "error": f"acción inválida: {action}. Usa una de {sorted(valid)}"}
        if not self.configured or not vm_id:
            return {"ok": False, "error": "missing config or vm_id"}
        try:
            async with httpx.AsyncClient(timeout=30) as c:
                r = await c.post(
                    f"{self.api_url}/vm/{vm_id}/action",
                    headers=self._headers(),
                    json={"action": action},
                )
                payload = r.json() if r.headers.get("content-type", "").startswith("application/json") else {"raw": r.text}
                if r.status_code >= 400 or payload.get("success") is False:
                    return {"ok": False, "status_code": r.status_code,
                            "error": payload.get("message") or payload.get("error") or r.text[:200]}
                return {"ok": True, "vm_id": vm_id, "action": action, "raw": payload}
        except httpx.RequestError as e:
            return {"ok": False, "error": f"Connection error: {str(e)[:200]}"}
        except Exception as e:
            return {"ok": False, "error": str(e)[:200]}

    async def get_vm_status(self, vm_id: str) -> dict:
        """Optional: query VM status via wrapper."""
        if not self.configured or not vm_id:
            return {"ok": False, "error": "missing config or vm_id"}
        try:
            async with httpx.AsyncClient(timeout=10) as c:
                r = await c.get(f"{self.api_url}/vm/{vm_id}", headers=self._headers())
                if r.status_code >= 400:
                    return {"ok": False, "status_code": r.status_code, "error": r.text[:200]}
                return {"ok": True, "data": r.json()}
        except Exception as e:
            return {"ok": False, "error": str(e)[:200]}


opennebula_client = OpenNebulaClient()
