# WinDesk Market (NeoSC) — PRD

## Original Problem Statement
Transform a WinDesk Cloud MVP into the "NeoSC" platform — a full SaaS for self-service provisioning of cloud desktops with NeoVDI (HTML5 RDP/VNC), NeoMesh (NetBird Zero Trust), and NeoGuard (Zitadel SSO). Integrate real third-party SaaS APIs (Zitadel, NetBird, LXD, Guacamole, TSplus, JumpServer) and AI (Claude 4.5 via emergentintegrations).

## Tech Stack
React 19 + FastAPI + MongoDB + Tailwind CSS + Shadcn/UI. Auth: JWT + Zitadel OIDC PKCE. Animations: framer-motion.

## NeoSC Product Suite
- **NeoGuard** = Zitadel SSO/MFA
- **NeoMesh** = NetBird Zero Trust VPN
- **NeoVDI** = HTML5 Desktop Gateway (Guacamole backend, rebranded)
- **NeoCloud** = LXD/LXC VM & Container management
- **NeoConnect** = NetBird relay bridging NeoSC ↔ Client infrastructure
- **NeoVault** = JumpServer PAM (bastion.manager.kappa4.com)

## What's Implemented

### Phase 12 — TSplus Remote Action Engine (Apr 2026) ✅
- **Credential Injection (Autologon)** via TSplus Farm Manager API — password stored encrypted in MongoDB, never sent to frontend.
- **Session Control**: Logoff / Disconnect / Lock buttons per session (calls /api/sessions/{id}/action).
- **Admin UI** (`/admin/neovdi` → TSplus tab):
  - TSplus Farm Manager status card (connected/disconnected).
  - Workspace list with `CREDS OK`/`SIN CREDS` badges and per-workspace RDP editor modal (username / password / domain / app path / launch mode).
  - Active sessions list fetched from TSplus Farm API.
  - "Test Autologon" button opens /viewer/new/{id} in new tab.
- **SessionToolbar component** integrated in WorkspaceViewerPage — shows AUTOLOGON badge when credentials were injected.
- **Route**: `/viewer/new/:workspaceId` — triggers POST /api/workspaces/{id}/launch-autologon, creates session, renders iframe with toolbar.
- **Security**: GET/PUT /api/workspaces strip `rdp_password` from all responses; admins see `rdp_password_set` bool. Audit logs mask password as `***`.

### Phase 11 — NeoVDI + OIDC + Apps Catalog
- NeoVDI rebrand of Guacamole, OIDC integration (Client ID 368658584004778169), groups claim mapping, App Catalog (9 apps, 5 categories), sync Zitadel → NeoVDI roles.

### Previous Phases (1-10)
Full LXD/LXC REST API, Zitadel auto-provisioning, NeoConnect relay, Market wizards, Landing page with framer-motion, Claims mapping end-to-end, Guacamole iframe fixes (no sandbox), Direct URL support for web apps.

## Key API Endpoints

### TSplus (new)
- `POST /api/workspaces/{id}/launch-autologon` → inject credentials, return session + connection_url.
- `POST /api/sessions/{id}/action` body `{action: lock|disconnect|logoff}`.
- `GET /api/admin/tsplus/sessions` — admin only.
- `GET /api/admin/tsplus/status` — admin only.
- `PUT /api/workspaces/{id}` — now accepts rdp_username, rdp_password, rdp_domain, rdp_application_path, launch_mode.

## Data Model
- `workspaces`: {id, name, type, ..., rdp_username, rdp_password (write-only), rdp_domain, rdp_application_path, launch_mode}
- `sessions`: {id, user_id, workspace_id, ..., tsplus_token, tsplus_session_id, rdp_username, connection_type: "tsplus_autologon", status}
- Response sanitization: `rdp_password` never returned; admins get `rdp_password_set: bool`.

## Prioritized Backlog

### P0
- Refactor server.py (~4000 lines) into APIRouter files: `routers/auth.py`, `routers/workspaces.py`, `routers/tsplus.py`, `routers/guacamole.py`, `routers/lxd.py`, `routers/zitadel.py`, `routers/netbird.py`.

### P1
- Stripe checkout + CFDI México invoicing.
- Session recording via NeoVault (JumpServer).
- End-to-end validation against real TSplus Farm Manager (current env is unreachable).

### P2
- Ansible / WinRM / OpenSSH post-provisioning scripts.
- User-facing "My Workspaces" page with Launch Autologon button (currently only via admin test button).

## Testing
- pytest suite: `/app/backend/tests/test_tsplus_remote_action.py` — 14/14 passing.
- Frontend flows validated by testing_agent_v3_fork iteration 10.
