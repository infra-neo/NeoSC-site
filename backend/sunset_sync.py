"""
Sunset / OpenNebula sync worker.
Periodically reconciles Mongo's `market_vms` with what the Sunset wrapper reports.

Notes:
- The Sunset wrapper at http://149.56.241.64:3000 currently exposes:
    GET  /api/health
    GET  /api/templates
    POST /api/vm/instantiate
    GET  /api/vm/list?vmId=<id>   (single-VM status, format under discovery)
- OneFlow XML-RPC (port 2633) is NOT publicly reachable from this backend,
  so all reads go through the wrapper. When the wrapper gains list-all or
  service endpoints, this worker picks them up automatically via `probe_state`.
"""
import asyncio
import logging
import os
from datetime import datetime, timezone
from typing import Optional

import httpx

logger = logging.getLogger("sunset_sync")

SUNSET_API = os.environ.get("OPENNEBULA_API_URL", "").rstrip("/")
SUNSET_TOKEN = os.environ.get("OPENNEBULA_TOKEN", "")
SYNC_INTERVAL_SECONDS = int(os.environ.get("SUNSET_SYNC_INTERVAL", "60"))
SYNC_MAX_VMS_PER_TICK = int(os.environ.get("SUNSET_SYNC_MAX", "50"))

STATE_MAP = {
    # OpenNebula LCM_STATE numeric → human enum used across NeoSC
    "LCM_INIT":     "provisioning",
    "PROLOG":       "provisioning",
    "BOOT":         "provisioning",
    "RUNNING":      "running",
    "MIGRATE":      "running",
    "SHUTDOWN":     "stopped",
    "SHUTDOWN_UNDEPLOY": "stopped",
    "POWEROFF":     "stopped",
    "STOP":         "stopped",
    "SUSPENDED":    "stopped",
    "UNKNOWN":      "error",
    "FAILURE":      "error",
    "BOOT_FAILURE": "error",
    "PROLOG_FAILURE": "error",
    "EPILOG_FAILURE": "error",
}


def _headers() -> dict:
    h = {"Content-Type": "application/json", "Accept": "application/json"}
    if SUNSET_TOKEN:
        h["Authorization"] = f"Bearer {SUNSET_TOKEN}"
    return h


async def probe_state(vm_id: str) -> dict:
    """
    Best-effort read of one VM's current state from Sunset.
    Tries multiple candidate paths until one responds 200 with a parseable body.

    Returns dict:
        {ok: bool, state: str, ip: Optional[str], raw: any, error: Optional[str]}
    """
    if not SUNSET_API or not vm_id:
        return {"ok": False, "error": "no api or vm_id"}
    candidates = [
        f"{SUNSET_API}/vm/{vm_id}",
        f"{SUNSET_API}/vm/list?vmId={vm_id}",
        f"{SUNSET_API}/vm/status/{vm_id}",
        f"{SUNSET_API}/vms/{vm_id}",
    ]
    async with httpx.AsyncClient(timeout=8) as c:
        for url in candidates:
            try:
                r = await c.get(url, headers=_headers())
                if r.status_code >= 400:
                    continue
                data = r.json() if r.headers.get("content-type", "").startswith("application/json") else None
                if not data:
                    continue
                # Try to map fields — wrapper may return {state, ip, ...} or {vm:{...}}
                v = data.get("vm") or data.get("data") or data
                state_raw = (v.get("state") or v.get("STATE") or v.get("status") or "").upper() if isinstance(v, dict) else ""
                mapped = STATE_MAP.get(state_raw, state_raw.lower() or "unknown")
                ip = v.get("ip") if isinstance(v, dict) else None
                return {"ok": True, "state": mapped, "ip": ip, "raw": data, "endpoint": url}
            except Exception as e:
                logger.debug(f"probe {url} → {e}")
                continue
    return {"ok": False, "error": "no endpoint responded"}


async def list_all_vms() -> dict:
    """
    Try to list ALL VMs Sunset knows about (for orphan detection).
    Falls back to empty list if wrapper doesn't support list-all.
    """
    if not SUNSET_API:
        return {"ok": False, "vms": [], "error": "no api"}
    for path in ("/vm/list", "/vms", "/services", "/vm"):
        url = f"{SUNSET_API}{path}"
        try:
            async with httpx.AsyncClient(timeout=10) as c:
                r = await c.get(url, headers=_headers())
                if r.status_code == 200:
                    data = r.json()
                    vms = data.get("vms") or data.get("data") or data.get("services") or (data if isinstance(data, list) else None)
                    if isinstance(vms, list):
                        return {"ok": True, "vms": vms, "endpoint": url}
        except Exception:
            continue
    return {"ok": False, "vms": [], "error": "no list endpoint available"}


async def sync_once(db) -> dict:
    """
    Run a single reconciliation pass:
      1. For each active VM in Mongo, probe Sunset for current state.
      2. Update state, ip, last_synced_at in market_vms.
      3. Detect Mongo VMs that Sunset no longer reports (orphaned-outbound).
      4. Detect Sunset VMs not in Mongo (orphaned-inbound).
    Returns stats.
    """
    stats = {"scanned": 0, "updated": 0, "unchanged": 0, "unreachable": 0,
             "orphaned_outbound": 0, "orphaned_inbound": 0, "errors": []}

    # Load candidates: VMs in state that could still change
    cursor = db.market_vms.find(
        {"status": {"$in": ["provisioning", "running", "stopped"]}},
        {"_id": 0, "id": 1, "name": 1, "sunset_vm_id": 1, "vm_id": 1,
         "status": 1, "tenant_id": 1, "netbird_ip": 1, "internal_ip": 1}
    ).limit(SYNC_MAX_VMS_PER_TICK)

    vms = await cursor.to_list(length=SYNC_MAX_VMS_PER_TICK)
    stats["scanned"] = len(vms)

    for vm in vms:
        sunset_id = vm.get("sunset_vm_id") or vm.get("vm_id")
        # skip local-simulated IDs (start with 'vm-' or 'sim-')
        if not sunset_id or str(sunset_id).startswith(("vm-", "sim-")):
            continue
        res = await probe_state(str(sunset_id))
        now = datetime.now(timezone.utc).isoformat()
        if not res.get("ok"):
            stats["unreachable"] += 1
            await db.market_vms.update_one(
                {"id": vm["id"]},
                {"$set": {"sunset_last_synced_at": now, "sunset_reachable": False}}
            )
            continue
        new_state = res.get("state") or vm.get("status")
        new_ip = res.get("ip")
        changed = new_state != vm.get("status") or (new_ip and new_ip != vm.get("internal_ip"))
        update = {"sunset_last_synced_at": now, "sunset_reachable": True}
        if new_state != vm.get("status"):
            update["status"] = new_state
            update["_last_state_transition"] = now
        if new_ip and new_ip != vm.get("internal_ip"):
            update["internal_ip"] = new_ip
        await db.market_vms.update_one({"id": vm["id"]}, {"$set": update})
        if changed:
            stats["updated"] += 1
            logger.info(f"sunset_sync: vm={vm.get('name')} id={sunset_id} → state={new_state} ip={new_ip}")
        else:
            stats["unchanged"] += 1

    # Orphan detection (best-effort)
    remote = await list_all_vms()
    if remote.get("ok"):
        remote_ids = set()
        for r in remote.get("vms", []):
            rid = str(r.get("id") or r.get("ID") or r.get("vmId") or "")
            if rid:
                remote_ids.add(rid)
        local_ids = {str(vm.get("sunset_vm_id") or vm.get("vm_id"))
                     for vm in vms if vm.get("sunset_vm_id") or vm.get("vm_id")}
        outbound = local_ids - remote_ids   # in Mongo, not in Sunset
        inbound = remote_ids - local_ids     # in Sunset, not in Mongo
        if outbound:
            stats["orphaned_outbound"] = len(outbound)
            logger.warning(f"sunset_sync: {len(outbound)} VMs in Mongo not found in Sunset: {list(outbound)[:5]}")
        if inbound:
            stats["orphaned_inbound"] = len(inbound)
            logger.warning(f"sunset_sync: {len(inbound)} VMs in Sunset not in Mongo: {list(inbound)[:5]}")

    return stats


async def periodic_sync_loop(db):
    """Long-running background task; started from server startup_event."""
    logger.info(f"sunset_sync loop starting (interval={SYNC_INTERVAL_SECONDS}s)")
    while True:
        try:
            stats = await sync_once(db)
            if stats["scanned"] > 0:
                logger.info(f"sunset_sync tick: {stats}")
        except asyncio.CancelledError:
            logger.info("sunset_sync loop cancelled")
            break
        except Exception as e:
            logger.error(f"sunset_sync tick failed: {e}")
        await asyncio.sleep(SYNC_INTERVAL_SECONDS)
