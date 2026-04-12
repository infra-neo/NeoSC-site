# WinDesk Market (NeoSC) - PRD

## Original Problem Statement
Transform a WinDesk Cloud MVP into the "NeoSC" platform — a full SaaS application for self-service provisioning of cloud Windows VMs with NeoDesk (Guacamole/TSplus HTML5), NeoMesh (NetBird Zero Trust), and NeoGuard (Zitadel SSO).

## Tech Stack
React 19 + FastAPI + MongoDB + Tailwind CSS + Shadcn/UI. Auth: JWT + Zitadel OIDC PKCE.

## NeoSC Branding
- **NeoGuard** = Zitadel SSO/MFA
- **NeoMesh** = NetBird Zero Trust VPN
- **NeoDesk** = Guacamole HTML5 Desktop (Starter)
- **NeoDesk+** = TSplus HTML5 Desktop (Plus/Enterprise)
- **NeoProxy** = Pomerium IAP
- **NeoVault** = JumpServer PAM
- **NeoConnect** = NetBird relay container bridging NeoSC ↔ Client TSplus

## Market Tiers
- **Starter**: $29/mes — VM + NeoDesk HTML5, 5 users
- **Plus**: $79/mes — TSplus existente + NeoProxy + NeoMesh, 25 users
- **Enterprise**: Custom — B2B delegado + NeoVault + On-prem

## What's Been Implemented

### Phase 1-8 (Previous Sessions)
- MVP, Market, Admin Panel, Zitadel+NetBird, Enrollment, AI Agent Neo, UX Fixes, SSO Fix

### Phase 9 - LXD/LXC NeoCloud Integration (DONE)
- Full LXD REST API wrapper, cloud-init, project switching, remote exec

### Phase 10 - Automated Provisioning + NeoConnect + Guacamole (DONE - Apr 2026)

#### Zitadel Auto-Provisioning
- **POST /api/admin/tenants/{id}/step/zitadel-org**: Full automated provisioning:
  - Creates Zitadel Project (NeoSC-{slug})
  - Creates 3 Roles: tenant-admin, tenant-user, tenant-viewer
  - Creates OIDC SPA Application with PKCE (redirect URIs for tenant domain)
  - Creates admin Human User with password
  - Grants tenant-admin role to the user
  - Stores project_id, app_id, client_id, roles, user_id in tenant doc

#### NeoConnect Relay Container
- **POST /api/admin/tenants/{id}/step/deploy-relay**: Deploys an LXD Linux container with:
  - NetBird pre-installed via cloud-init
  - Auto-enrollment to tenant's NetBird group
  - Acts as bridge between NeoSC cloud and client's TSplus infrastructure
- **GET /api/admin/tenants/{id}/neoconnect-info**: Returns:
  - Setup key for the tenant
  - Download links for Windows (.exe), Linux (curl script), Docker, macOS
  - Relay container status

#### Auto-Provision All
- **POST /api/admin/tenants/{id}/auto-provision**: Runs all steps in sequence:
  zitadel-org → netbird-group → netbird-setup-key → netbird-policy → deploy-relay

#### Apache Guacamole Integration
- **Backend module**: `guacamole_client.py` — REST API client for Guacamole
  - Token-based auth, CRUD connections (RDP/VNC/SSH), connection links, status check
- **GET /api/guacamole/status**: Check Guacamole server connectivity
- **GET /api/guacamole/connections**: List all configured connections
- **POST /api/guacamole/connections**: Create RDP/VNC/SSH connection
- **DELETE /api/guacamole/connections/{id}**: Remove connection
- **GET /api/guacamole/connections/{id}/link**: Get direct Guacamole session URL
- **POST /api/guacamole/deploy**: Deploy Guacamole server as LXD container with Docker

#### Frontend Updates
- **EnrollTenantPage.jsx**: Updated with 7 steps including NeoConnect Relay, Auto-Provision button, NeoConnect download panel (Windows/Linux/Docker tabs with copy-to-clipboard)
- **GuacamolePage.jsx**: New admin page for Guacamole management — server status, deploy button, create/list/delete connections
- **Sidebar**: Added NeoDesk Guacamole link in admin section
- **App.js**: Added /admin/guacamole route

## Key API Endpoints
- POST `/api/admin/tenants/enroll` — Create new tenant
- POST `/api/admin/tenants/{id}/step/zitadel-org` — **Full** Zitadel auto-provisioning
- POST `/api/admin/tenants/{id}/step/netbird-group` — Create NetBird group
- POST `/api/admin/tenants/{id}/step/netbird-setup-key` — Generate setup key
- POST `/api/admin/tenants/{id}/step/netbird-policy` — Create access policy
- POST `/api/admin/tenants/{id}/step/deploy-relay` — Deploy LXD relay container
- POST `/api/admin/tenants/{id}/step/register-infra` — Register client infra
- POST `/api/admin/tenants/{id}/step/finalize` — Activate tenant
- POST `/api/admin/tenants/{id}/auto-provision` — Auto-run all steps
- GET `/api/admin/tenants/{id}/neoconnect-info` — Download links + setup key
- GET `/api/admin/tenants/{id}/enrollment-status` — Get enrollment state
- GET/POST/DELETE `/api/guacamole/*` — Guacamole connection management
- POST `/api/guacamole/deploy` — Deploy Guacamole LXD container

## Prioritized Backlog

### P0
- Configure GUACAMOLE_URL once Guacamole container is running (needs IP from LXD)

### P1
- Map claims Zitadel → NetBird → LXD (SSO users get correct network routes)
- Stripe checkout with CFDI Mexico invoicing
- NeoProxy (Pomerium) IAP integration

### P2
- Ansible/WinRM post-provisioning (TSplus auto-install in VMs)
- NeoVault (JumpServer) PAM integration
- Session recording, real-time VM metrics
- Refactor server.py into APIRouters (3000+ lines)
