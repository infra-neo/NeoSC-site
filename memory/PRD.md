# WinDesk Market (NeoSC) - PRD

## Original Problem Statement
Transform a WinDesk Cloud MVP into the "WinDesk Market" (NeoSC) platform — a full SaaS application for self-service provisioning of cloud Windows VMs with TSplus HTML5, Netbird Zero Trust networking, and Zitadel SSO. The app must follow the architectural flows and UI screen specs provided via HTML artifacts and source code bundles.

## User Personas
- **End Users (Clients)**: Companies/individuals who need cloud Windows desktops accessible from any browser
- **Platform Admins**: NeoSC operators who manage tenants, policies, organizations, and audit trails
- **IT Managers**: Users in organizations who manage workspaces and sessions for their teams

## Tech Stack
- **Frontend**: React 19 + Tailwind CSS + Shadcn/UI + Lucide icons
- **Backend**: FastAPI (Python) with Motor (async MongoDB driver)
- **Database**: MongoDB
- **Auth**: JWT Bearer tokens (local) + Zitadel OIDC PKCE (SSO)
- **Path aliases**: `@/` → `src/` via jsconfig.json + craco webpack alias

## Core Architecture
```
/app
├── backend/
│   ├── server.py          # Full API (1800+ lines) - Auth, Market, Workspaces, Sessions, Admin
│   ├── .env               # MONGO_URL, DB_NAME, Zitadel config, DEMO_MODE
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.js         # Routing (public + protected routes)
│   │   ├── context/AuthContext.jsx    # Bearer token auth
│   │   ├── i18n/LanguageContext.jsx   # ES/EN toggle
│   │   ├── config/zitadel.js          # Zitadel OIDC config
│   │   ├── components/layout/Sidebar.jsx  # App navigation
│   │   ├── pages/
│   │   │   ├── LandingPage.jsx        # S1: Public hero + demos
│   │   │   ├── LoginPage.jsx          # Email/password + SSO
│   │   │   ├── AuthCallbackPage.jsx   # OIDC redirect handler
│   │   │   ├── DashboardPage.jsx      # S6: Portal with KPIs
│   │   │   ├── WorkspacesPage.jsx     # Workspace management
│   │   │   ├── SessionsPage.jsx       # Active sessions table
│   │   │   ├── ApplicationsPage.jsx   # SSO app launcher
│   │   │   ├── AuditLogsPage.jsx      # Audit trail
│   │   │   ├── PoliciesPage.jsx       # Security policies
│   │   │   ├── OrganizationsPage.jsx  # Multi-tenant orgs
│   │   │   ├── SettingsPage.jsx       # Profile + language
│   │   │   ├── WorkspaceViewerPage.jsx # iframe viewer
│   │   │   ├── MultiViewPage.jsx      # Multi-session grid
│   │   │   └── market/
│   │   │       ├── MarketPage.jsx     # S2-S3: Plan + configurator
│   │   │       ├── CheckoutPage.jsx   # S4: Payment
│   │   │       └── ProvisionProgressPage.jsx  # S5: Real-time SSE
│   │   └── components/ui/            # Shadcn components
│   ├── .env
│   └── package.json
└── memory/
    ├── PRD.md
    └── test_credentials.md
```

## Key API Endpoints
- **Auth**: POST `/api/auth/login`, `/api/auth/register`, `/api/auth/logout`, `/api/auth/sso`, `/api/auth/token-exchange`
- **Market**: GET/POST `/api/market/addons`, `/api/market/price`, `/api/market/orders`, `/api/market/my-vms`
- **Workspaces**: GET/POST/PUT/DELETE `/api/workspaces`, `/api/workspaces/{id}/launch`, `/api/workspaces/{id}/stop`
- **Applications**: GET `/api/applications`, POST `/api/applications/{id}/launch`
- **Sessions**: GET `/api/sessions`, `/api/sessions/active`, POST `/api/sessions/{id}/disconnect`
- **Admin**: GET `/api/audit-logs`, `/api/organizations`, `/api/policies`, GET/PATCH `/api/policies/{id}`
- **Stats**: GET `/api/stats`

## DB Collections
- `users`: {id, email, name, organization, role, password_hash, mfa_enabled, sso_provider, oidc_sub}
- `workspaces`: {id, name, description, type, connection_type, status, cpu, memory, storage, user_id}
- `sessions`: {id, user_id, workspace_id, workspace_name, workspace_type, status, started_at, connection_url}
- `market_orders`: {id, user_id, neosc_plan, config, addons, pricing, status, payment_status}
- `audit_logs`: {id, user_id, user_email, action, resource, success, timestamp, details}
- `organizations`: {id, name, domain, sso_provider, member_count, plan}
- `policies`: {id, name, description, type, enabled, rules}

## What's Been Implemented (Feb 2026)

### Phase 1 - MVP (DONE)
- Basic WinDesk Cloud with React + FastAPI + MongoDB
- Custom TSplus and 1Panel connection URL mapping
- RBAC System (Users, Groups, Roles, ACLs) & Admin panel
- Client Onboarding Wizard and Interactive Guided Tour
- Zitadel OIDC SSO (Manual PKCE flow)

### Phase 2 - WinDesk Market Transformation (DONE - Feb 2026)
- Complete backend rewrite with Market endpoints (orders, addons, pricing, provisioning SSE)
- 7 main screens: Landing (S1), Market/Plans (S2), Configurator (S3), Checkout (S4), Provisioning Progress (S5), Portal Dashboard (S6), Admin (S7)
- New AuthContext with Bearer token auth
- LanguageContext (ES/EN)
- Sidebar navigation with role-based items
- Workspace management (CRUD, launch, stop)
- Applications launcher with SSO
- Sessions management (list, active, disconnect)
- Audit logs, Organizations, Policies, Settings pages
- Multi-View (multi-session grid viewer)
- Workspace iframe viewer
- 100% test pass rate (20/20 backend, all frontend)

## Mocked/Simulated Features
- **VM Provisioning**: 12-step SSE simulation (not real LXD/cloud)
- **Payment Processing**: Demo mode (no real Stripe/PayPal)
- **JumpServer Integration**: Returns mock Luna URLs
- **Live metrics**: CPU/RAM/Disk usage randomly generated

## Prioritized Backlog

### P0 (Next)
- None - current phase complete

### P1 (Future)
- Real Stripe/PayPal payment integration
- Real VM provisioning via LXD/cloud API
- Email notifications (order confirmation, provisioning complete)
- JumpServer real integration for HTML5 RDP

### P2 (Future)
- Admin Global panel (S7) with tenant orchestrator
- Session recording and playback
- Real-time metrics from actual VMs
- ACL enforcement on workspace/resource level
- Multi-region support
