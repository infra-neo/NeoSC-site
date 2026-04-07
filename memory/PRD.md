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

## Market Tiers
- **Starter**: $29/mes — VM + NeoDesk HTML5, 5 users
- **Plus**: $79/mes — TSplus existente + NeoProxy + NeoMesh, 25 users
- **Enterprise**: Custom — B2B delegado + NeoVault + On-prem

## What's Been Implemented

### Phase 1 - MVP (DONE)
- Basic WinDesk Cloud, RBAC, Onboarding, Zitadel OIDC SSO (Manual PKCE)

### Phase 2 - WinDesk Market (DONE)
- Complete Market flow (7 screens), 15+ frontend pages, AuthContext, LanguageContext, Sidebar

### Phase 3 - Admin Global S7 (DONE)
- Admin panel with KPIs, tenants table, orchestrator live, system logs

### Phase 4 - Zitadel + NetBird Integration (DONE)
- NeoGuard SSO Admin (CRUD users, orgs, roles, grants via Zitadel API v2)
- NeoMesh Admin (peers, groups, setup-keys, routes, users via NetBird REST API)
- Login page: NeoSC SSO button + bypass local

### Phase 5 - Tenant Enrollment + Rebranding (DONE - Feb 2026)
- **Tenant Enrollment Wizard** (`/admin/enroll-tenant`) with 6 real steps:
  1. NeoGuard Org (Zitadel - manual_pending until IAM permission granted)
  2. NeoMesh Group (NetBird - REAL API)
  3. NeoMesh Setup Key (NetBird - REAL API)
  4. NeoMesh Policy (NetBird - REAL API)
  5. Register Infra (TSplus host/IP)
  6. Finalize (activate tenant, set MRR)
- **Market tiers updated**: Starter $29, Plus $79, Enterprise Custom
- **NeoSC rebranding** across Landing, Market, Dashboard, Sidebar
- 100% test pass rate (13/13 backend, all frontend)

## Key API Endpoints (New)
- POST `/api/admin/tenants/enroll` — Create new tenant
- POST `/api/admin/tenants/{id}/step/zitadel-org` — Create Zitadel org
- POST `/api/admin/tenants/{id}/step/netbird-group` — Create NetBird group
- POST `/api/admin/tenants/{id}/step/netbird-setup-key` — Generate setup key
- POST `/api/admin/tenants/{id}/step/netbird-policy` — Create access policy
- POST `/api/admin/tenants/{id}/step/register-infra` — Register client infra
- POST `/api/admin/tenants/{id}/step/finalize` — Activate tenant
- GET `/api/admin/tenants/{id}/enrollment-status` — Get enrollment state

## Mocked/Pending
- Zitadel org creation (needs IAM_OWNER in Zitadel console)
- VM provisioning (SSE simulation)
- Payments (demo mode)

### Phase 6 - AI Agent "Neo" (DONE - Feb 2026)
- Backend: `POST /api/neo/chat` using Claude Sonnet 4.5 via `emergentintegrations`
- Backend: `GET /api/neo/history/{session_id}`, `DELETE /api/neo/history/{session_id}`
- Frontend: `NeoChat.jsx` floating widget mounted globally in `App.js`
- Spanish-speaking, friendly consultant personality
- Conversation persistence in MongoDB (`neo_conversations` collection)
- Quick suggestion buttons for discovery/onboarding

## Prioritized Backlog
### P0
- Grant IAM_OWNER to service user in Zitadel console

### P1
- Connect orchestrator to real Celery workers
- Real VM provisioning via PowerShell/WinRM
- Stripe checkout with CFDI México
- NeoProxy (Pomerium) integration

### P2
- NeoVault (JumpServer) PAM integration
- Session recording
- Real-time VM metrics
- Refactor server.py into APIRouters
