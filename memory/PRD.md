# WinDesk Market (NeoSC) - PRD

## Original Problem Statement
Transform a WinDesk Cloud MVP into the "WinDesk Market" (NeoSC) platform — a full SaaS application for self-service provisioning of cloud Windows VMs with TSplus HTML5, Netbird Zero Trust networking, and Zitadel SSO.

## Tech Stack
React 19 + FastAPI + MongoDB + Tailwind CSS + Shadcn/UI. Auth: JWT + Zitadel OIDC PKCE.

## What's Been Implemented

### Phase 1 - MVP (DONE)
- Basic WinDesk Cloud, RBAC, Onboarding, Zitadel OIDC SSO (Manual PKCE)

### Phase 2 - WinDesk Market (DONE - Feb 2026)
- Complete Market flow (7 screens: Landing, Market/Plans, Configurator, Checkout, Provisioning, Portal, Admin)
- 15+ frontend pages, AuthContext, LanguageContext, Sidebar with role-based nav

### Phase 3 - Admin Global S7 (DONE - Feb 2026)
- Admin panel with KPIs, tenants table (lockdown/activate), orchestrator live, system logs
- 6 admin endpoints with role enforcement

### Phase 4 - Zitadel + NetBird Integration (DONE - Feb 2026)
- **NeoSC SSO (Zitadel) Admin** (`/admin/zitadel`): CRUD users, list orgs, roles, grants via Zitadel Management API v2
- **NetBird Admin** (`/admin/netbird`): List/manage peers, groups, setup-keys, routes, users via NetBird REST API
- **Login page**: NeoSC SSO button (Zitadel PKCE) + bypass local (admin + 3 demo users)
- Real API integrations (not mocked) — Zitadel PAT + NetBird API token
- App URLs updated: NeoSC Panel → panel.proxy.kappa4.com, Windows Desktop → web.proxy.kappa4.com, Demo → win11.blueedge.me

## Architecture
```
Backend endpoints:
  /api/admin/zitadel/users (GET list, POST create, GET/:id, DELETE/:id)
  /api/admin/zitadel/orgs (GET list, POST create)
  /api/admin/zitadel/roles (GET projects)
  /api/admin/zitadel/grants (GET user grants)
  /api/admin/netbird/peers (GET list, GET/:id, PUT/:id, DELETE/:id)
  /api/admin/netbird/groups (GET list, POST create, DELETE/:id)
  /api/admin/netbird/setup-keys (GET list, POST create)
  /api/admin/netbird/routes (GET list)
  /api/admin/netbird/users (GET list)
```

## Mocked Features
- VM Provisioning (SSE simulation), Payments (demo mode), JumpServer (mock URLs)

## Prioritized Backlog
### P1
- Real VM provisioning via LXD/cloud API
- Real Stripe/PayPal payment integration
- Grant Zitadel service user IAM membership for full projects/grants access

### P2
- Session recording and playback
- Real-time metrics from actual VMs
- Email notifications
- Multi-region support
