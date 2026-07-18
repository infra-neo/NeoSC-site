# WinDesk Market (NeoSC) — PRD

## Original Problem Statement
Multi-tenant SaaS for cloud desktops: HTML5 RDP/VNC (NeoVDI), Zero-Trust VPN (NeoMesh), SSO (NeoGuard OIDC), LXD/LXC management (NeoCloud), TSplus bridge (NeoConnect), JumpServer PAM (NeoVault). Real-time SSE notifications, B2B onboarding for TSplus companies, AI chatbot (Claude 4.5). Spanish UI.

## Tech Stack
React 19 + FastAPI + MongoDB + Tailwind + Shadcn/UI + framer-motion + sonner. JWT + NeoGuard OIDC PKCE. SSE real-time.

## What's Implemented

### Phase 19 — Workspace Embed + Auto-cleanup missing VMs (Feb 2026) ✅
- **Embedded HTML5 desktop**: `WorkspacesPage.jsx` reemplaza `window.open()` por Dialog + `<iframe>` con Fullscreen / Nueva pestaña / Cerrar (data-testids: `embed-connection-dialog`, `embed-connection-iframe`, `embed-fullscreen-btn`, `embed-external-btn`, `embed-close-btn`). No abre pestañas nuevas.
- **DELETE cascade**: `DELETE /api/market/vms/{id}` ahora borra la conexión Guacamole (`guacamole_client.delete_connection`) antes de eliminar el doc de Mongo. Response incluye `guacamole` con status.
- **Sunset auto-cleanup**: `sunset_sync.probe_state` devuelve `not_found=True` cuando el wrapper responde 404 o `{error:true, message:"vmId inválido/no encontrado/..."}`. `sync_once` incrementa `sunset_missing_count`; tras `MISSING_THRESHOLD=2` misses consecutivos, `_cleanup_missing_vms` borra la VM de Mongo, cascada Guacamole `delete_connection`, y marca `market_orders.status="deleted"`.
- Testing iter-18: 3/3 backend pytest + 100% frontend Playwright.

### Phase 18 — Wizard Simplification + Real NetBird Polling + Workspace Integration (Feb 2026) ✅
- **Step 2 TSplus simplificado**: removidas las 4 ediciones (System/Printer/Mobile Web/Enterprise). Único producto: "TSplus Remote Enterprise Access" con badge "14 días gratis". Licencias fijas: 3 / 5 / 10 / 15 / 25 / ∞ (no se permite otro valor).
- **Step 3 Infraestructura — 4 combos VM con allow-rules**: XS(2vCPU/4GB/50GB)→[3], S(4/8/50)→[3,5], M(8/16/100)→[3,5,10,15], L(16/32/100)→[cualquier]. Combos inválidos se muestran disabled con Lock. Removidos los sliders de CPU/RAM/Disk.
- **OS options**: Windows Server 2025 (recomendado), 2022, Win 11 Pro VDI, Win 10 LTSC.
- **VM naming `NEOSC-VDI-XXXX`** (matching NetBird peer pattern del cliente).
- **NetBird Cloud polling real**: `poll_peer_until_registered` (20 attempts × 4s = 80s max). Si el peer registra, usa la IP real + dns_label de api.netbird.io. Si no, fallback sintético 100.92.x.x.
- **`html5_access_url`** poblado desde env `NETBIRD_DEFAULT_EXPOSE_URL=https://vdi.eu1.netbird.services`. Insertado en `market_vms.connection_url` y en `workspaces.html5_url`.
- **WorkspacesPage** actualizado: muestra NEOSC-VDI-XXXX, NetBird IP en font-mono, URL HTML5, columna NeoMesh, botón HTML5 abre la URL real.
- Testing iter-17: 6/6 backend pytest + 100% frontend assertions.

### Phase 17 — OpenCloud Marketplace + OpenNebula + NetBird Cloud (Feb 2026) ✅
- **NeoMarket redesigned** as OpenCloud-style catalog (mirrors http://149.56.241.64:3000/marketplace.html). 3 gradient cards (GOLD/STD/POWER) with specs + tags + "Instanciar" button.
- **`/app/backend/opennebula_client.py`** — wrapper REST client (`POST /api/vm/instantiate {templateId, vmName, cpu, memory}`) with TEMPLATE_CATALOG (templateId 14/12/16, Service ID 9) and `health()` check.
- **`/app/backend/netbird_cloud_client.py`** — NetBird Cloud client (api.netbird.io) — `create_setup_key`, `find_peer_by_hostname`.
- **New endpoints**: `GET /api/market/templates` (public), `POST /api/market/templates/{id}/instantiate` (auth).
- **Real provisioning pipeline `_provision_opennebula_vm`** orchestrates 12 steps: payment → setup-key (real NetBird Cloud call) → OpenNebula instantiate (real wrapper call) → bootstrap → TSplus → NeoMesh agent → HTML5 → DNS → email → complete. Falls back to synthetic IP/vmId if upstream doesn't return them.
- **`NeoCloudWizard.jsx`** refactored as 6-step TSplus wizard (Plan/TSplus/Infra/Admin/Pago simulado/Confirmar) routed at `/market/neocloud` for guided flow.
- Env vars added: `OPENNEBULA_API_URL`, `OPENNEBULA_SUNSTONE_URL`, `OPENNEBULA_TOKEN`, `NETBIRD_CLOUD_URL`, `NETBIRD_CLOUD_TOKEN`.
- Testing iter-16: 8/8 backend pytest + 4/4 frontend flows pass.

### Phase 16 — Multi-Tenant Real + LXD Trust Fix (May 2026) ✅
- **LXD trust re-established** via join token exchange (`POST /1.0/certificates {trust_token, type, name}`). Switched `LXD_PROJECT=default`. Backend now reports `auth=trusted`, instances list real (juju-c27595-0, silver-2, etc).
- **Tenants collection** with `Tenant` Pydantic model (id, name, slug, zitadel_org_id, plan, status, branding, fresh_mode).
- **`ensure_default_tenant()`** runs at startup → creates "Neogenesys" tenant + backfills `tenant_id` on existing users, workspaces, applications, sessions, market_orders, audit_logs, mock_emails, workspace_assignments, market_vms.
- **`get_user_tenant()`** dependency-style helper auto-binds users to default tenant on first access.
- **Endpoints**: `GET /api/tenants/me` (with counters: users/workspaces/applications/active_sessions/audit_logs), `GET /api/tenants`, `POST /api/tenants` (slug auto-generated, 409 dup), `PUT /api/tenants/{id}` (validated allowed fields + status enum), `POST /api/tenants/{id}/lockdown` (terminates sessions + suspends workspaces + SSE notify).
- **Tenant filtering** added to: `GET /workspaces`, `GET /applications`, `GET /audit-logs`, `GET /admin/system-logs`, `GET /admin/orchestrator`.
- **Tenant injection** on: User register, invite-users, workspace create, session creates (3 places), audit_logs.
- **Frontend**: `/admin/tenants` page with "TU TENANT" card (5 counters), full tenant list, Suspend/Activate/Lockdown buttons, Create modal. Sidebar "Tenants" item.

### Phase 15 — Fresh Tenant + Quick Start + UX Fixes
FRESH_TENANT_MODE env var, Quick Start Checklist on /welcome step 3, login redirect fix, NeoVDI logout postMessage handler.

### Phase 14 — Admin UX Fixes
System Logs real, Orquestador real + controles, /api/zitadel/my-org, Sidebar shortcut.

### Phase 13 — Real-time Notifications + B2B Onboarding
SSE NotificationHub, admin_session_action notify, WelcomePage wizard, mock email XSS-escaped.

### Phase 12 — TSplus Remote Action Engine
Credential Injection, Session Control, TSplus admin tab.

### Phase 11 — NeoVDI + OIDC + Apps Catalog
### Previous Phases (1-10)
LXD/LXC REST, NeoGuard auto-provisioning, NeoConnect relay, Market wizards, Landing framer-motion, Claims mapping.

## Prioritized Backlog

### P0
- **Refactor server.py (~4870 lines)** → APIRouter files (tenants.py, lxd.py, sessions.py, audit.py, auth.py, workspaces.py, guacamole.py, etc.). Deferred from this turn.
- Real Devolutions Gateway integration alternative to NeoMesh.
- Subdomain routing per tenant (Cloudflare + Host header).

### P1
- `/api/onboarding/progress` endpoint for Quick Start sub-counters.
- Invite activation page (`/activate?invite=token`) — set password + login.
- Real email delivery (Resend / SendGrid).
- Stripe checkout + CFDI México.
- Session recording NeoVault.
- DELETE /api/tenants/{id} endpoint + UI confirm dialog.
- Migrate tenant create_at storage: store as ISO string directly (avoid repeating isoformat() conversion).

### P2
- Ansible/WinRM/OpenSSH post-provisioning.
- TSplus Farm real E2E.
- Replace native `<select>` in TenantsPage modal with shadcn Select.

## Testing
- `/app/backend/tests/` 50+ pytest. Latest `iteration_15.json`: 11/11 backend + 7/7 frontend.
