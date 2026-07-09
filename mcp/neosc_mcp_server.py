"""
NeoSC MCP Server — exposes NeoSC operations and n8n workflows as MCP tools.

Run standalone (HTTP SSE transport) on port 8765:
    python3 /app/mcp/neosc_mcp_server.py

Or as stdio (for Claude Desktop integration):
    NEOSC_MCP_MODE=stdio python3 /app/mcp/neosc_mcp_server.py

Tools exposed:
    1.  neosc_login                    — Authenticate as admin / user
    2.  neosc_list_marketplace         — Catalog of OpenCloud templates
    3.  neosc_instantiate_vm           — Create VM from template
    4.  neosc_provision_status         — Poll a provisioning order
    5.  neosc_list_workspaces          — User's VMs + access URLs
    6.  netbird_list_peers             — All NetBird Cloud peers + IPs
    7.  netbird_create_setup_key       — Mint a setup key for new VM
    8.  zitadel_list_users             — NeoGuard SSO users
    9.  zitadel_list_orgs              — NeoGuard SSO orgs
    10. opennebula_health              — Wrapper API status
    11. n8n_run_workflow               — Execute any n8n workflow by ID
    12. health_check_all               — Aggregate status of all services

Requires: pip install mcp httpx
"""
import asyncio
import json
import os
import sys
from typing import Optional
import httpx

# ─── Config ──────────────────────────────────────────────────────────────────
NEOSC_API = os.environ.get("NEOSC_API", "https://action-steps-4.preview.emergentagent.com/api")
ADMIN_EMAIL = os.environ.get("NEOSC_ADMIN_EMAIL", "admin@windesk.cloud")
ADMIN_PASS = os.environ.get("NEOSC_ADMIN_PASS", "Admin123!")

OPENNEBULA_API = os.environ.get("OPENNEBULA_API_URL", "http://149.56.241.64:3000/api")
OPENNEBULA_TOKEN = os.environ.get("OPENNEBULA_TOKEN", "9c632dc1ac0b26ab925717ba62a2b0e535476a1d1b57ecbd7b58aae84cbb9113")

NETBIRD_API = os.environ.get("NETBIRD_CLOUD_URL", "https://api.netbird.io")
NETBIRD_TOKEN = os.environ.get("NETBIRD_CLOUD_TOKEN", "nbp_OJadsrm9YusgaWHrnWQpdZZydYffG811DIL9")

ZITADEL_DOMAIN = os.environ.get("ZITADEL_DOMAIN", "https://beyondcloud-nxm7ab.us1.zitadel.cloud")
ZITADEL_TOKEN = os.environ.get("ZITADEL_SERVICE_USER_TOKEN",
                                "NsXZCNkadmuKysEBT45K88gh8urvDjjwBJCWUhLzHdIAR1qiXbz5tQnV4rniPl12vOuzXMY")

N8N_URL = os.environ.get("N8N_URL", "https://n8n.kappa4.com")
N8N_KEY = os.environ.get("N8N_API_KEY",
                          "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhOTI4Nzc1OS1kZGRmLTQxZjMtYmU4MS02OGY0N2UwZGM1Y2UiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiZjA5MmE1ZTUtNjIzOS00MDE3LWE0Y2MtMjdkNDdlMDJhMGY1IiwiaWF0IjoxNzgyMDI0NTMxLCJleHAiOjE3ODQ2MDY0MDB9.zrfj8zgWEtYCs42mCuRmlixMbJCkWJ1cHhaymDg9IaQ")

UA = {"User-Agent": "NeoSC-MCP/1.0"}

# In-memory token cache (refreshed per call when needed)
_token_cache = {"value": None}


# ─── Auth helper ─────────────────────────────────────────────────────────────
async def _get_token(client: httpx.AsyncClient) -> str:
    if _token_cache["value"]:
        return _token_cache["value"]
    r = await client.post(f"{NEOSC_API}/auth/login",
                          json={"email": ADMIN_EMAIL, "password": ADMIN_PASS},
                          headers=UA, timeout=15)
    if r.status_code == 200:
        _token_cache["value"] = r.json().get("access_token")
        return _token_cache["value"]
    raise RuntimeError(f"Login failed: HTTP {r.status_code}")


# ─── Tool implementations (plain async functions, can be called from anywhere) ─
async def neosc_login() -> dict:
    """Authenticate with NeoSC. Returns token + user profile."""
    async with httpx.AsyncClient() as c:
        r = await c.post(f"{NEOSC_API}/auth/login",
                          json={"email": ADMIN_EMAIL, "password": ADMIN_PASS},
                          headers=UA, timeout=15)
        return {"http": r.status_code, "data": r.json() if r.is_success else r.text}


async def neosc_list_marketplace() -> dict:
    """List OpenCloud Marketplace templates available for purchase."""
    async with httpx.AsyncClient() as c:
        r = await c.get(f"{NEOSC_API}/market/templates", headers=UA, timeout=15)
        return {"http": r.status_code, "data": r.json() if r.is_success else r.text}


async def neosc_instantiate_vm(template_id: int = 14, cpu: int = 4,
                                memory: int = 8192, tsplus_users: int = 3,
                                company_name: Optional[str] = None) -> dict:
    """
    Create a VM from an OpenCloud template (provisions via OpenNebula + NetBird).
    template_id options: 14 (Starter GOLD), 12 (Business STD), 16 (Enterprise POWER)
    """
    async with httpx.AsyncClient() as c:
        token = await _get_token(c)
        body = {"cpu": cpu, "memory": memory, "tsplus_users": tsplus_users}
        if company_name:
            body["company_name"] = company_name
        r = await c.post(f"{NEOSC_API}/market/templates/{template_id}/instantiate",
                          headers={"Authorization": f"Bearer {token}", **UA},
                          json=body, timeout=30)
        return {"http": r.status_code, "data": r.json() if r.is_success else r.text}


async def neosc_provision_status(order_id: str) -> dict:
    """Get current provisioning steps + VM data for an order."""
    async with httpx.AsyncClient() as c:
        token = await _get_token(c)
        r = await c.get(f"{NEOSC_API}/market/orders/{order_id}/status",
                         headers={"Authorization": f"Bearer {token}", **UA}, timeout=15)
        return {"http": r.status_code, "data": r.json() if r.is_success else r.text}


async def neosc_list_workspaces() -> dict:
    """List the current user's provisioned VMs + their HTML5 access URLs."""
    async with httpx.AsyncClient() as c:
        token = await _get_token(c)
        r = await c.get(f"{NEOSC_API}/market/my-vms",
                         headers={"Authorization": f"Bearer {token}", **UA}, timeout=15)
        return {"http": r.status_code, "data": r.json() if r.is_success else r.text}


async def netbird_list_peers() -> dict:
    """List all NetBird Cloud peers (VMs/devices on the mesh network) with IPs + status."""
    async with httpx.AsyncClient() as c:
        r = await c.get(f"{NETBIRD_API}/api/peers",
                         headers={"Authorization": f"Token {NETBIRD_TOKEN}", **UA}, timeout=15)
        peers = r.json() if r.is_success else []
        summary = [{"name": p.get("name"), "ip": p.get("ip"), "hostname": p.get("hostname"),
                    "dns_label": p.get("dns_label"), "os": p.get("os"),
                    "connected": p.get("connected"), "last_login": p.get("last_login")}
                   for p in (peers if isinstance(peers, list) else [])]
        return {"http": r.status_code, "total": len(summary), "peers": summary}


async def netbird_create_setup_key(name: str, expires_days: int = 7,
                                    ephemeral: bool = False) -> dict:
    """Create a NetBird Cloud setup key (used by VMs to auto-register on the mesh)."""
    async with httpx.AsyncClient() as c:
        body = {
            "name": name,
            "type": "one-off" if ephemeral else "reusable",
            "expires_in": expires_days * 86400,
            "revoked": False,
            "usage_limit": 1 if ephemeral else 0,
            "ephemeral": ephemeral,
        }
        r = await c.post(f"{NETBIRD_API}/api/setup-keys",
                          headers={"Authorization": f"Token {NETBIRD_TOKEN}", **UA},
                          json=body, timeout=15)
        return {"http": r.status_code, "data": r.json() if r.is_success else r.text}


async def zitadel_list_users(limit: int = 50) -> dict:
    """List NeoGuard (Zitadel Cloud) users."""
    async with httpx.AsyncClient() as c:
        r = await c.post(f"{ZITADEL_DOMAIN}/v2/users",
                          headers={"Authorization": f"Bearer {ZITADEL_TOKEN}", **UA},
                          json={"queries": [], "limit": limit}, timeout=15)
        return {"http": r.status_code, "data": r.json() if r.is_success else r.text}


async def zitadel_list_orgs(limit: int = 50) -> dict:
    """List NeoGuard (Zitadel Cloud) organizations."""
    async with httpx.AsyncClient() as c:
        r = await c.post(f"{ZITADEL_DOMAIN}/v2/organizations/_search",
                          headers={"Authorization": f"Bearer {ZITADEL_TOKEN}", **UA},
                          json={"queries": [], "limit": limit}, timeout=15)
        return {"http": r.status_code, "data": r.json() if r.is_success else r.text}


async def opennebula_health() -> dict:
    """Check the OpenNebula wrapper API at 149.56.241.64:3000."""
    async with httpx.AsyncClient() as c:
        r = await c.get(f"{OPENNEBULA_API}/health",
                         headers={"Authorization": f"Bearer {OPENNEBULA_TOKEN}", **UA}, timeout=10)
        return {"http": r.status_code, "ok": r.is_success,
                "data": r.json() if r.is_success and r.headers.get("content-type", "").startswith("application/json") else r.text[:200]}


async def n8n_run_workflow(workflow_id: str) -> dict:
    """Trigger an existing n8n workflow by ID (must be active/webhook-triggered)."""
    async with httpx.AsyncClient() as c:
        # Use the executions API
        r = await c.post(f"{N8N_URL}/api/v1/workflows/{workflow_id}/execute",
                          headers={"X-N8N-API-KEY": N8N_KEY, **UA}, timeout=60)
        return {"http": r.status_code, "data": r.json() if r.is_success else r.text}


async def health_check_all() -> dict:
    """Aggregate health check of every 3rd-party service NeoSC depends on."""
    results = {}
    async with httpx.AsyncClient() as c:
        # OpenNebula
        try:
            r = await c.get(f"{OPENNEBULA_API}/health",
                            headers={"Authorization": f"Bearer {OPENNEBULA_TOKEN}", **UA}, timeout=8)
            results["opennebula"] = {"ok": r.status_code == 200, "http": r.status_code}
        except Exception as e:
            results["opennebula"] = {"ok": False, "error": str(e)[:80]}
        # NetBird
        try:
            r = await c.get(f"{NETBIRD_API}/api/peers",
                            headers={"Authorization": f"Token {NETBIRD_TOKEN}", **UA}, timeout=8)
            results["netbird"] = {"ok": r.status_code == 200, "http": r.status_code,
                                   "peers": len(r.json()) if r.is_success else 0}
        except Exception as e:
            results["netbird"] = {"ok": False, "error": str(e)[:80]}
        # Zitadel
        try:
            r = await c.post(f"{ZITADEL_DOMAIN}/v2/organizations/_search",
                             headers={"Authorization": f"Bearer {ZITADEL_TOKEN}", **UA},
                             json={"queries": [], "limit": 1}, timeout=8)
            results["zitadel"] = {"ok": r.status_code == 200, "http": r.status_code}
        except Exception as e:
            results["zitadel"] = {"ok": False, "error": str(e)[:80]}
        # NeoSC backend
        try:
            r = await c.post(f"{NEOSC_API}/auth/login",
                             json={"email": ADMIN_EMAIL, "password": ADMIN_PASS},
                             headers=UA, timeout=8)
            results["neosc"] = {"ok": r.status_code == 200, "http": r.status_code}
        except Exception as e:
            results["neosc"] = {"ok": False, "error": str(e)[:80]}
    all_ok = all(r.get("ok") for r in results.values())
    return {"all_ok": all_ok, "services": results}


# ─── MCP server setup ────────────────────────────────────────────────────────
TOOL_REGISTRY = [
    (neosc_login, "Authenticate with NeoSC platform"),
    (neosc_list_marketplace, "Catalog of OpenCloud Marketplace templates (Starter/Business/Enterprise)"),
    (neosc_instantiate_vm, "Create a Windows VDI VM with TSplus (template_id, cpu, memory, tsplus_users)"),
    (neosc_provision_status, "Poll provisioning steps + VM data for an order_id"),
    (neosc_list_workspaces, "List the user's provisioned VMs + their HTML5 URLs"),
    (netbird_list_peers, "List NetBird Cloud peers + mesh IPs"),
    (netbird_create_setup_key, "Mint a NetBird setup key (name, expires_days, ephemeral)"),
    (zitadel_list_users, "List NeoGuard (Zitadel) users"),
    (zitadel_list_orgs, "List NeoGuard (Zitadel) organizations"),
    (opennebula_health, "OpenNebula wrapper API health"),
    (n8n_run_workflow, "Execute an n8n workflow by ID"),
    (health_check_all, "Aggregate health of all 3rd-party services"),
]


def main():
    """
    If MCP package is installed, run the proper MCP server.
    Otherwise, fall back to an HTTP server that exposes the tools at /tools/{name}.
    """
    try:
        from mcp.server.fastmcp import FastMCP  # type: ignore
        mcp_available = True
    except Exception:
        mcp_available = False

    mode = os.environ.get("NEOSC_MCP_MODE", "http")  # 'http' (default) or 'stdio'

    if mcp_available:
        mcp = FastMCP("NeoSC")
        for fn, desc in TOOL_REGISTRY:
            mcp.tool(description=desc)(fn)
        if mode == "stdio":
            mcp.run("stdio")
        else:
            print(f"NeoSC MCP server (stdio) — exposes {len(TOOL_REGISTRY)} tools")
            mcp.run("stdio")
        return

    # ─── Fallback: simple HTTP server (for testing without MCP SDK) ─────────
    from aiohttp import web

    async def list_tools(req):
        return web.json_response([{"name": fn.__name__, "description": d} for fn, d in TOOL_REGISTRY])

    async def call_tool(req):
        name = req.match_info["name"]
        fn = next((f for f, _ in TOOL_REGISTRY if f.__name__ == name), None)
        if not fn:
            return web.json_response({"error": "tool not found"}, status=404)
        try:
            body = await req.json() if req.content_length else {}
        except Exception:
            body = {}
        try:
            result = await fn(**body)
            return web.json_response(result)
        except TypeError as e:
            return web.json_response({"error": f"bad args: {e}"}, status=400)
        except Exception as e:
            return web.json_response({"error": str(e)}, status=500)

    app = web.Application()
    app.router.add_get("/tools", list_tools)
    app.router.add_post("/tools/{name}", call_tool)
    print(f"⚠ MCP SDK not installed — fallback HTTP server on :8765 ({len(TOOL_REGISTRY)} tools)")
    print("   Install MCP: pip install mcp")
    print("   List tools: curl http://localhost:8765/tools")
    print("   Call tool:  curl -X POST http://localhost:8765/tools/health_check_all -d '{}' -H 'Content-Type: application/json'")
    web.run_app(app, host="0.0.0.0", port=8765)


if __name__ == "__main__":
    main()
