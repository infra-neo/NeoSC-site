# WinDesk Market (NeoSC) — PRD

## Original Problem Statement
Multi-tenant SaaS for cloud desktops: HTML5 RDP/VNC (NeoVDI), Zero-Trust VPN (NeoMesh), SSO (NeoGuard OIDC), LXD/LXC management (NeoCloud), TSplus bridge (NeoConnect), JumpServer PAM (NeoVault). Real-time SSE notifications, B2B onboarding for TSplus companies, AI chatbot (Claude 4.5). Spanish UI.

## Tech Stack
React 19 + FastAPI + MongoDB + Tailwind + Shadcn/UI + framer-motion + sonner. JWT + NeoGuard OIDC PKCE. SSE real-time.

## What's Implemented

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
