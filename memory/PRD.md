# WinDesk Cloud - PRD

## Project Overview
**Name:** WinDesk Cloud  
**Type:** SaaS Platform for Windows Virtual Desktops  
**Status:** MVP Complete (Demo Mode)

## Original Problem Statement
Build a SaaS platform for on-demand Windows VMs with TSplus and Zero Trust access (NetBird + Cloudflare Tunnel). MVP with demo mode simulating external services.

## User Personas
1. **Customer** - End user who provisions and uses Windows VMs
2. **MSP Admin** - Managed Service Provider managing multiple customers (future)
3. **Platform Admin** - Internal admin with full platform access

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

## What's Been Implemented

### 2026-04-03 - MVP Complete
**Backend:**
- FastAPI server with 23 endpoints
- JWT authentication with httpOnly cookies
- MongoDB models: users, plans, orders, vms, snapshots
- Demo mode simulating: payments, VM provisioning, metrics
- Admin APIs for stats and management

**Frontend:**
- Landing page with hero, features, pricing
- Auth pages (Login/Register)
- Dashboard with VM cards and real-time metrics
- Plans selection with billing toggle
- Checkout with simulated payment
- VM detail page with actions
- Admin panel with tabs (Orders/VMs/Users)

**Design:**
- Dark Industrial / Cyber-Ops theme
- Syne + JetBrains Mono typography
- Teal (#00d4aa) primary brand color
- Glass morphism effects
- Grid pattern backgrounds

## API Endpoints
- POST /api/auth/register
- POST /api/auth/login
- POST /api/auth/logout
- GET /api/auth/me
- POST /api/auth/refresh
- GET /api/plans
- POST /api/orders
- GET /api/orders
- POST /api/billing/simulate
- GET /api/vms
- GET /api/vms/{id}/metrics
- POST /api/vms/{id}/restart
- POST /api/vms/{id}/snapshot
- GET /api/admin/stats
- GET /api/admin/users
- GET /api/admin/orders

## Prioritized Backlog

### P0 - Critical (MVP) ✅
- All items completed

### P1 - High Priority (Next)
- [ ] MSP multi-tenant support
- [ ] Real Stripe integration
- [ ] Email notifications (SendGrid)
- [ ] VM usage tracking and billing

### P2 - Medium Priority
- [ ] Zitadel OIDC integration
- [ ] Real NetBird integration
- [ ] Real Cloudflare Tunnel setup
- [ ] LXD/GCP VM provisioning

### P3 - Future/Nice to Have
- [ ] Custom domain per tenant
- [ ] SSE for real-time provisioning updates
- [ ] White-label for MSPs
- [ ] Mobile responsive improvements

## Mocked Services (Demo Mode)
- Stripe payments → Simulated successful payment
- NetBird VPN → Random IPs generated
- Cloudflare Tunnel → hostname generated as {orderId}.desk.kappa4.com
- TSplus → Demo access URL
- VM metrics → Random values (10-70% usage)

## Next Steps
1. Connect real Stripe for payments
2. Set up email notifications
3. Implement MSP multi-tenant features
