# WinDesk Market (NeoSC) — PRD

## Original Problem Statement
Transform a WinDesk Cloud MVP into the "NeoSC" platform — a full SaaS for self-service provisioning of cloud desktops with NeoVDI (HTML5 RDP/VNC), NeoMesh (NetBird Zero Trust), and NeoGuard (Zitadel SSO). Integrate real third-party SaaS APIs (Zitadel, NetBird, LXD, Guacamole, TSplus, JumpServer) and AI (Claude 4.5 via emergentintegrations). Add real-time notifications and a B2B onboarding flow for existing TSplus companies.

## Tech Stack
React 19 + FastAPI + MongoDB + Tailwind CSS + Shadcn/UI + framer-motion + sonner. Auth: JWT + Zitadel OIDC PKCE. Real-time: Server-Sent Events (SSE) with per-user asyncio queues.

## NeoSC Product Suite
- **NeoGuard** = Zitadel SSO/MFA
- **NeoMesh** = NetBird Zero Trust VPN
- **NeoVDI** = HTML5 Desktop Gateway (Guacamole backend, rebranded)
- **NeoCloud** = LXD/LXC VM & Container management
- **NeoConnect** = NetBird relay bridging NeoSC ↔ Client infrastructure
- **NeoVault** = JumpServer PAM

## What's Implemented

### Phase 13 — Real-time Notifications + B2B Onboarding (Apr 2026) ✅
- **SSE NotificationHub** (`backend/notifications_hub.py`) — per-user asyncio queues, broadcast support, heartbeat every 20s.
- **`GET /api/notifications/stream?token=`** — SSE endpoint (EventSource-compatible, token via query param).
- **`NotificationsProvider`** (`frontend/src/context/NotificationsContext.jsx`) — wraps app, subscribes to SSE, emits sonner toasts with severity mapping.
- **`POST /api/admin/sessions/{id}/action`** — admin forces action (lock/disconnect/logoff) on ANY user's session → backend calls TSplus/Guacamole + updates DB + publishes SSE event with `type=session.{action}` to target user_id.
- **WorkspaceViewerPage** listens for `neosc:session-terminated` custom event → auto-redirects when admin kills session.
- **Mock email system**: `db.mock_emails` collection + `GET /api/admin/emails[/{id}]` for preview. XSS-escaped welcome message.
- **`POST /api/tenants/invite-users`** — bulk invite by email list, creates User docs with `invite_token`, sends mock email with magic link.
- **`WelcomePage` `/welcome`** — 2-step wizard: (1) Bienvenida con branding NeoSC + 4 product badges + enrollment info, (2) Invitar equipo con textarea multi-email + role select + welcome message + sent-invites list with email preview modal.
- **Sidebar**: new "Bienvenida" entry under Administración.

### Phase 12 — TSplus Remote Action Engine
Credential Injection (autologon), Session Control (lock/disconnect/logoff), admin UI in NeoVDI panel, WorkspaceViewerPage with SessionToolbar, password sanitization across all responses.

### Phase 11 — NeoVDI + OIDC + Apps Catalog
NeoVDI rebrand, Zitadel OIDC integration with groups claim, App Catalog, Workspace Assignments auto-syncing NetBird policies.

### Previous Phases (1-10)
Full LXD/LXC REST API, Zitadel auto-provisioning, NeoConnect relay, Market wizards (NeoCloud/NeoConnect), Landing page framer-motion, Claims mapping, Guacamole iframe performance fixes.

## Key API Endpoints (New in Phase 13)
- `GET /api/notifications/stream?token=` — SSE.
- `POST /api/notifications/test` — admin only.
- `POST /api/admin/sessions/{id}/action` — admin-forced session action + SSE notify.
- `POST /api/tenants/invite-users` — bulk invite.
- `GET /api/tenants/invited-users` — list invites.
- `GET /api/admin/emails` / `GET /api/admin/emails/{id}` — mock email preview.

## Data Model (new collections/fields)
- `users`: +`invite_token`, `invited_by`, `invite_status` (pending/accepted).
- `mock_emails`: {id, to, subject, body_html, category, sent_at, delivery:"mock"}.
- `sessions`: +`terminated_by` when admin force-kills.

## Prioritized Backlog

### P0
- Refactor server.py (~4300 lines) into APIRouter files: auth/workspaces/tsplus/guacamole/lxd/zitadel/netbird/notifications/tenants.

### P1
- Invite activation flow: `/activate?invite=token` page that sets user password → completes onboarding.
- Real email delivery (Resend or SendGrid — require API key).
- Deploy Connector + Node Discovery steps of B2B wizard (image steps 3-5).
- Stripe checkout + CFDI México invoicing.
- Session recording via NeoVault (JumpServer).

### P2
- Ansible / WinRM / OpenSSH post-provisioning scripts.
- End-to-end validation against real TSplus Farm Manager.

## Testing
- pytest suite: `/app/backend/tests/` — 30+ tests covering LXD, Zitadel/Netbird, enrollment, TSplus Remote Action Engine, SSE notifications + invites.
- Latest validation: `iteration_11.json` — 16/16 backend + full frontend flows OK.
