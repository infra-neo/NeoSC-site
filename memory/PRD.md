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
- **NeoConnect** = NetBird relay bridging NeoSC ↔ Client TSplus
- **NeoCloud** = On-demand desktops & apps (LXC/VM)

## Two-Portal Market Architecture (NEW - Apr 2026)

### Portal 1: NeoCloud (`/market/neocloud`)
5-step wizard for new customers wanting cloud desktops/apps:
1. **Workspace type**: Windows Desktop (VM), Ubuntu Desktop (LXC), Browser Kiosk, VSCode Server, Office Suite, Dev Container
2. **Resources**: CPU/RAM/Disk + Addons (VPN, storage, backup, SSO)
3. **Plan**: Starter $29, Plus $79, Enterprise custom
4. **Account**: Login or register
5. **Confirm + Pay**: Order creation → provisioning

### Portal 2: NeoConnect (`/market/neoconnect`)
5-step wizard for TSplus customers:
1. **Company info**: Org name, email, RFC, users
2. **TSplus data**: Host/IP, port, license, LDAP → triggers auto-provisioning (Zitadel + NetBird)
3. **Install connector**: 3 options — NetBird Agent (.exe/Linux), Docker Container, DNS Redirect (CNAME)
4. **Register hosts**: Manual IP/hostname registration of Windows servers
5. **Activate**: Finalize + go to workspaces

### Market Selector (`/market`)
Landing page with two portal cards + comparison table

## What's Been Implemented

### Phases 1-9 (Previous)
- MVP, Market, Admin, Zitadel+NetBird, Enrollment, AI Neo, UX, SSO Fix, LXD

### Phase 10 - Auto-Provisioning + NeoConnect + Guacamole (DONE)
- Zitadel auto-provisioning (Project + Roles + OIDC App + User + Grant)
- NeoConnect relay container deployment
- Guacamole API integration
- LXD Windows VM fix (TPM, device management)

### Phase 11 - Two-Portal Wizard System (DONE - Apr 2026)
- **MarketPage.jsx**: Redesigned as portal selector (NeoCloud vs NeoConnect)
- **NeoCloudWizard.jsx**: 5-step wizard with 6 workspace types, resource config, plan selection
- **NeoConnectWizard.jsx**: 5-step wizard with auto-provisioning, 3 connector options, host registration
- Comparison table at bottom of market page

## Key Files
- `/app/frontend/src/pages/market/MarketPage.jsx` — Portal selector
- `/app/frontend/src/pages/market/NeoCloudWizard.jsx` — Cloud wizard
- `/app/frontend/src/pages/market/NeoConnectWizard.jsx` — TSplus wizard

## Prioritized Backlog

### P0
- Configure GUACAMOLE_URL once deployed

### P1
- Claims mapping Zitadel → NetBird → LXD
- Stripe checkout + CFDI Mexico
- NeoProxy (Pomerium) IAP

### P2
- Ansible/WinRM post-provisioning
- NeoVault PAM
- Refactor server.py into APIRouters
