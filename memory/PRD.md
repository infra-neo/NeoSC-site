# WinDesk Cloud - PRD

## Project Overview
**Name:** WinDesk Cloud  
**Type:** SaaS Platform for Windows Virtual Desktops  
**Status:** MVP Complete with Onboarding System (Demo Mode)

## Original Problem Statement
Build a SaaS platform for on-demand Windows VMs with TSplus and Zero Trust access. Extended with admin panel and onboarding wizard for new customers.

## User Personas
1. **Customer** - End user who provisions and uses Windows VMs
2. **Technical Admin** - First user from organization, goes through onboarding
3. **Platform Admin** - Internal admin with full platform access

## Tech Stack
- **Frontend:** React 19 + TailwindCSS + Radix UI
- **Backend:** FastAPI (Python 3.11)
- **Database:** MongoDB
- **Auth:** JWT (httpOnly cookies)
- **Styling:** Dark Industrial / Cyber-Ops theme

## Onboarding Flow
1. **Detection:** System checks if user has organization in DB
2. **Step 1 - Organization:** Company name and domain
3. **Step 2 - Admin:** Confirm admin user details
4. **Step 3 - Plan:** Select Starter/Business/Enterprise
5. **Step 4 - Review:** Confirm all settings
6. **Guided Tour:** 8-step interactive tour of dashboard features

## Core Requirements
### Completed ✅
- Landing page with pricing cards
- User authentication (JWT)
- Plan selection (Starter/Business/Enterprise)
- Order creation and payment simulation
- VM provisioning simulation
- Dashboard with VM list and metrics
- VM management (restart, snapshot)
- Admin panel (users, groups, roles, ACLs, policies)
- **Onboarding Wizard (4 steps)**
- **Guided Tour (8 steps)**
- Dual connection: TSplus + 1Panel

## What's Been Implemented

### 2026-04-03 - Onboarding System
**New Features:**
- Onboarding wizard with 4 steps
- Auto-detection of new customers
- Organization creation flow
- Admin confirmation step
- Plan selection during onboarding
- Review/confirmation step
- Guided tour after onboarding completion
- Tour progress tracking (8 steps)
- Skip tour option
- Tour completion persistence

**Backend Endpoints:**
- GET /api/onboarding/status
- POST /api/onboarding/organization
- POST /api/onboarding/admin
- POST /api/onboarding/plan
- POST /api/onboarding/complete
- POST /api/onboarding/complete-tour
- GET /api/onboarding/summary

**Frontend Components:**
- Onboarding.js - 4-step wizard
- GuidedTour.js - Interactive tour overlay

## Test Credentials
- Admin: `admin@windesk.cloud` / `Admin123!`
- Demo users: `usuario1@windesk.cloud` / `Demo123!`

## Pre-built VMs
| VM | IP | 1Panel Port |
|----|-----|-------------|
| vm-prod-001 | 10.100.10.150 | 33491 |
| vm-prod-002 | 10.100.10.151 | 33492 |
| vm-prod-003 | 10.100.10.152 | 33493 |
| vm-prod-004 | 10.100.10.153 | 33494 |

## Connection Methods
1. **TSplus HTML5:** https://web.tsplus.html5/
2. **1Panel Direct:** http://{internal_ip}:{panel_port}/

## Prioritized Backlog

### P0 - Critical (MVP) ✅
- All items completed

### P1 - High Priority (Next)
- [ ] Enforce ACL rules in backend
- [ ] Real Stripe integration
- [ ] Email notifications (SendGrid)
- [ ] Onboarding email welcome sequence

### P2 - Medium Priority
- [ ] Custom branding per organization
- [ ] Zitadel OIDC integration
- [ ] Audit logs

### P3 - Future/Nice to Have
- [ ] MSP white-label
- [ ] SSE for real-time updates
- [ ] Mobile app
