# WinDesk Market (NeoSC) - PRD

## Original Problem Statement
Transform a WinDesk Cloud MVP into the "NeoSC" platform — a full SaaS for self-service provisioning of cloud desktops with NeoVDI (HTML5 RDP/VNC), NeoMesh (NetBird Zero Trust), and NeoGuard (Zitadel SSO).

## Tech Stack
React 19 + FastAPI + MongoDB + Tailwind CSS + Shadcn/UI. Auth: JWT + Zitadel OIDC PKCE.

## NeoSC Product Suite
- **NeoGuard** = Zitadel SSO/MFA
- **NeoMesh** = NetBird Zero Trust VPN
- **NeoVDI** = HTML5 Desktop Gateway (Guacamole backend, rebranded)
- **NeoCloud** = LXD/LXC VM & Container management
- **NeoConnect** = NetBird relay bridging NeoSC ↔ Client infrastructure
- **NeoVault** = JumpServer PAM (bastion.manager.kappa4.com)

## What's Implemented

### Phase 11 — NeoVDI + OIDC + Apps Catalog (Apr 2026)
- **NeoVDI rebrand**: All UI references changed from Guacamole → NeoVDI
- **OIDC Integration**: Created Zitadel OIDC app for NeoVDI (Client ID: 368658584004778169), with roles (admin/user/viewer), groups claim mapping, post-logout redirect to /workspaces
- **Setup Script**: `/app/backend/scripts/setup-guacamole-oidc.sh` — configurable script for OIDC on the Guacamole server
- **OIDC Config tab**: Shows all OIDC parameters, script download, claim→group mapping explanation
- **App Catalog**: 9 apps across 5 categories (desktop, dev, productivity, admin, security) with install capability
- **Auto-register in NeoVDI**: When LXD creates VM → auto-creates RDP connection; container → VNC connection
- **NeoVault endpoint**: `/api/neovault/status` checking bastion.manager.kappa4.com
- **Sync Zitadel → NeoVDI**: Button syncs Zitadel project roles as NeoVDI user groups

### Previous Phases (1-10)
- Full LXD/LXC REST API, Zitadel auto-provisioning, NeoConnect relay, Market wizards, Landing page Teleport-style

## Key API Endpoints (New)
- GET `/api/guacamole/oidc-config` — OIDC configuration display
- GET `/api/guacamole/oidc-script` — Download setup script
- GET `/api/apps/catalog` — App catalog
- POST `/api/apps/install/{app_id}` — Install app (LXD + NeoVDI auto-register)
- GET `/api/neovault/status` — JumpServer status
- POST `/api/guacamole/sync-zitadel-groups` — Sync roles → groups

## Prioritized Backlog
### P0
- Execute OIDC script on Guacamole server (user action)
- Start JumpServer at bastion.manager.kappa4.com

### P1
- Stripe checkout + CFDI Mexico
- Claims mapping end-to-end: Zitadel → NetBird → LXD permissions

### P2
- Refactor server.py into APIRouters (3400+ lines)
- Session recording via NeoVault
