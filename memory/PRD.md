# WinDesk Market (NeoSC) — PRD

## Original Problem Statement
Transform WinDesk Cloud MVP → NeoSC platform: self-service cloud desktops (NeoVDI HTML5 RDP/VNC), Zero-Trust VPN (NeoMesh), SSO (NeoGuard OIDC), LXD container/VM management (NeoCloud), TSplus bridge (NeoConnect), JumpServer PAM (NeoVault). Real-time notifications, B2B onboarding for TSplus companies, AI chatbot (Claude 4.5). Spanish UI. Current month: Feb 2026.

## Tech Stack
React 19 + FastAPI + MongoDB + Tailwind + Shadcn/UI + framer-motion + sonner. JWT + NeoGuard (Zitadel) OIDC PKCE. SSE real-time. emergentintegrations Claude.

## What's Implemented

### Phase 15 — Fresh Tenant + Quick Start + UX Fixes (Apr 2026) ✅
- **`FRESH_TENANT_MODE=true`** — `/api/workspaces` and `/api/applications` start empty.
- **Quick Start Checklist** on `/welcome` (step 3) — 7 tasks × 5 groups. Per-task action + "No haré esto".
- **`/login` redirect-if-authenticated** in LoginPage.jsx.
- **NeoVDI logout postMessage listener** in ConnectionPage.jsx.
- **POST /api/workspaces** ObjectId serialization fixed.

### Phase 14 — Admin UX Fixes
System Logs real, Orquestador real + controles, `/api/zitadel/my-org`, WelcomePage Zitadel fields, Sidebar shortcut.

### Phase 13 — Real-time Notifications + B2B Onboarding
SSE NotificationHub, admin_session_action notify, WelcomePage wizard, mock email XSS-escaped.

### Phase 12 — TSplus Remote Action Engine
Credential Injection, Session Control, TSplus admin tab, SessionToolbar.

### Phase 11 — NeoVDI + OIDC + Apps Catalog
NeoVDI rebrand, NeoGuard OIDC groups claim, App Catalog, Workspace Assignments NeoMesh sync.

### Previous Phases (1-10)
LXD/LXC REST API, NeoGuard auto-provisioning, NeoConnect relay, Market wizards, Landing framer-motion, Claims mapping.

## Prioritized Backlog

### P0
- Refactor server.py (~4700 lines) into APIRouter files.
- Multi-tenant real (org isolation, tenant_id on every doc, subdomain routing).
- Real Devolutions Gateway integration alternative to NeoMesh.

### P1
- `/api/onboarding/progress` endpoint for Quick Start sub-counters.
- Invite activation page (`/activate?invite=token`).
- Real email delivery (Resend / SendGrid).
- Stripe checkout + CFDI México.
- Session recording NeoVault.
- Configure Guacamole `OPENID_AFTER_LOGOUT_URI` server-side.

### P2
- Ansible/WinRM/OpenSSH post-provisioning.
- TSplus Farm real E2E.
- `suspend` integrate `lxd_client.stop_instance`.

## Testing
- `/app/backend/tests/` 45+ pytest. Latest `iteration_14.json`.
