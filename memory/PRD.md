# WinDesk Market (NeoSC) — PRD

## Original Problem Statement
Transform WinDesk Cloud MVP → NeoSC platform: self-service cloud desktops (NeoVDI HTML5 RDP/VNC), Zero-Trust VPN (NeoMesh NetBird), SSO (NeoGuard Zitadel OIDC), LXD container/VM management (NeoCloud), TSplus bridge (NeoConnect), JumpServer PAM (NeoVault). Real-time notifications, B2B onboarding for TSplus companies, AI chatbot (Claude 4.5). Current month: Feb 2026.

## Tech Stack
React 19 + FastAPI + MongoDB + Tailwind + Shadcn/UI + framer-motion + sonner. JWT + Zitadel OIDC PKCE. SSE real-time. emergentintegrations for Claude.

## What's Implemented

### Phase 14 — Admin UX Fixes (Apr 2026) ✅
- **System Logs** real data — transforms `audit_logs` mapping `action→source`, `details→message`, `success→level`.
- **Orquestador** real data — workers derived from DB (tsplus sessions, pending invites, running workspaces). Queue from real market_orders (+ demo fallback labeled).
- **Emergency controls functional**: `POST /api/admin/orders/{id}/retry` (409 if completed), `POST /api/admin/workspaces/{id}/suspend` (kills sessions + SSE notify), Lockdown tenant.
- **`GET /api/zitadel/my-org`** — Org Name, Org ID, Project ID, App Client ID, NeoVDI Client ID, Domain, User Count, Project Roles.
- **WelcomePage** shows 8 real Zitadel fields + status badge + 3 shortcut buttons.
- **Sidebar**: "Accesos & Grupos" → `/admin/neovdi?tab=access` with NavLink query-aware active state.

### Phase 13 — Real-time Notifications + B2B Onboarding
SSE NotificationHub, `/api/notifications/stream`, admin_session_action with SSE notify, WelcomePage 2-step wizard, mock email + XSS-escaped `invite-users`.

### Phase 12 — TSplus Remote Action Engine
Credential Injection autologon, Session Control, TSplus admin tab, SessionToolbar, password sanitization.

### Phase 11 — NeoVDI + OIDC + Apps Catalog
NeoVDI rebrand, Zitadel OIDC groups claim, App Catalog, Workspace Assignments NetBird sync.

### Previous Phases (1-10)
LXD/LXC REST API, Zitadel auto-provisioning, NeoConnect relay, Market wizards, Landing framer-motion, Claims mapping, Guacamole iframe fixes.

## Key API Endpoints (new in Phase 14)
- `POST /api/admin/orders/{id}/retry`
- `POST /api/admin/workspaces/{id}/suspend`
- `GET /api/zitadel/my-org`

## Data Model
- `market_orders`: +`retry_count`, `last_retry_at`.
- `audit_logs`: transformed on-the-fly for system-logs.

## Prioritized Backlog

### P0
- **Zitadel B2C invite flow real**: createHumanUser in Zitadel with send_email_verification=true → password setup on Zitadel portal → redirect back to NeoSC login → OIDC claims with tenant_id / groups / resources.
- Refactor server.py (~4400 lines) into APIRouter files.

### P1
- Invite activation (`/activate?invite=token`).
- Deploy Connector + Node Discovery (sketch steps 3-5).
- Stripe checkout + CFDI México.
- Session recording via NeoVault.
- Real email (Resend / SendGrid).

### P2
- Ansible/WinRM/OpenSSH post-provisioning.
- TSplus Farm real E2E.
- `suspend` integrate `lxd_client.stop_instance` for real resource release.

## Testing
- `/app/backend/tests/` — 40+ pytest tests. Latest `iteration_12.json`: 13/13 passing.
