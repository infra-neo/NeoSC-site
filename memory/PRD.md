# WinDesk Cloud - PRD

## Project Overview
**Name:** WinDesk Cloud  
**Type:** SaaS Platform for Windows Virtual Desktops  
**Status:** MVP Complete with Admin Features (Demo Mode)

## Original Problem Statement
Build a SaaS platform for on-demand Windows VMs with TSplus and Zero Trust access. Extended with admin panel for users, groups, roles, ACLs and policies management.

## User Personas
1. **Customer** - End user who provisions and uses Windows VMs
2. **MSP Admin** - Managed Service Provider managing multiple customers (future)
3. **Platform Admin** - Internal admin with full platform access, user/group/policy management

## Tech Stack
- **Frontend:** React 19 + TailwindCSS + Radix UI
- **Backend:** FastAPI (Python 3.11)
- **Database:** MongoDB
- **Auth:** JWT (httpOnly cookies)
- **Styling:** Dark Industrial / Cyber-Ops theme

## Core Requirements (Static)
- [x] Landing page with pricing cards
- [x] User authentication (JWT)
- [x] Plan selection (Starter/Business/Enterprise)
- [x] Order creation and payment simulation
- [x] VM provisioning simulation
- [x] Dashboard with VM list and metrics
- [x] VM management (restart, snapshot)
- [x] Admin panel with stats/users/orders/vms
- [x] Groups management (create, edit, members)
- [x] Roles management with permissions
- [x] ACLs for action control
- [x] Policies to associate users/groups with VMs
- [x] Dual connection: TSplus + 1Panel

## What's Been Implemented

### 2026-04-03 - MVP Complete
**Backend:**
- FastAPI server with 40+ endpoints
- JWT authentication with httpOnly cookies
- MongoDB models: users, plans, orders, vms, snapshots, groups, roles, acls, policies
- Demo mode simulating: payments, VM provisioning, metrics
- Admin APIs for CRUD on all entities

**Frontend:**
- Landing page with hero, features, pricing
- Auth pages (Login/Register)
- Dashboard with VM cards and real-time metrics
- Plans selection with billing toggle
- Checkout with simulated payment
- VM detail page with dual connection buttons
- Full Admin panel with tabs:
  - Panel General (stats overview)
  - Usuarios (CRUD, enable/disable)
  - Grupos (CRUD, member management)
  - Roles (CRUD, permissions)
  - Máquinas Virtuales (CRUD, assignment)
  - ACLs (CRUD, action control)
  - Políticas (associate users/groups to VMs)
  - Órdenes (history)

**Design:**
- Dark Industrial / Cyber-Ops theme
- Syne + JetBrains Mono typography
- Teal (#00d4aa) primary brand color

## Pre-built VMs
| ID | Name | IP | Specs | 1Panel Port |
|----|------|-----|-------|-------------|
| vm-prod-001 | WinDesk-PROD-001 | 10.100.10.150 | 4 vCPU, 8GB RAM | 33491 |
| vm-prod-002 | WinDesk-PROD-002 | 10.100.10.151 | 4 vCPU, 8GB RAM | 33492 |
| vm-prod-003 | WinDesk-PROD-003 | 10.100.10.152 | 8 vCPU, 16GB RAM | 33493 |
| vm-prod-004 | WinDesk-PROD-004 | 10.100.10.153 | 2 vCPU, 4GB RAM | 33494 |

## Default Groups
- Desarrollo
- Soporte Técnico
- Finanzas

## Default Roles
- Administrador (full access)
- Operador (manage VMs, view users)
- Usuario (connect assigned only)

## Default ACLs
- Acceso Completo (all actions)
- Solo Conexión (connect + view)
- Solo Lectura (view only)

## Connection Methods
1. **TSplus HTML5:** https://web.tsplus.html5/
2. **1Panel Direct:** http://{internal_ip}:{panel_port}/ (e.g., http://10.100.10.150:33491/)

## Prioritized Backlog

### P0 - Critical (MVP) ✅
- All items completed

### P1 - High Priority (Next)
- [ ] Enforce ACL rules in backend (check permissions before actions)
- [ ] Real Stripe integration
- [ ] Email notifications (SendGrid)
- [ ] User self-service portal

### P2 - Medium Priority
- [ ] Zitadel OIDC integration
- [ ] Real NetBird integration
- [ ] LXD/GCP VM provisioning
- [ ] Audit logs

### P3 - Future/Nice to Have
- [ ] MSP white-label
- [ ] SSE for real-time updates
- [ ] Mobile app

## Mocked Services (Demo Mode)
- Stripe payments → Simulated
- NetBird VPN → Random IPs
- Cloudflare Tunnel → hostname as {orderId}.desk.kappa4.com
- VM metrics → Random values
- 1Panel → Direct link to internal IP:port
