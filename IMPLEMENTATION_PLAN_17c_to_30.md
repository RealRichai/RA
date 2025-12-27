# Implementation Plan: Pass 17c through Pass 30

## Overview
This document tracks the implementation of Passes 17c-30 for the RealRiches platform.
All features end in clickable UI pages with working API endpoints (real or demo data).

---

## Pass 17c: Federated Scoring API

### Files Changed
- `apps/api/src/index.ts` - Add scoring endpoints
- `apps/api/src/services/scoring.service.ts` - Scoring logic (NEW)
- `apps/web/src/app/dashboard/scoring/page.tsx` - Scoring UI (NEW)

### Endpoints Added
- `GET /api/v1/score/health` - Health check for scoring module
- `POST /api/v1/score/lead` - Score a lead (sync)

### UI Pages
- `/dashboard/scoring` - Agent/Admin scoring interface

### How to Test
```bash
# Health check
curl http://localhost:4000/api/v1/score/health

# Score a lead
curl -X POST http://localhost:4000/api/v1/score/lead \
  -H "Content-Type: application/json" \
  -d '{"name":"John Doe","email":"john@example.com","phone":"555-1234","source":"website","budget":5000}'

# UI: http://localhost:3002/dashboard/scoring
```

- [ ] Completed

---

## Pass 17d: Scoring Pipeline (Cache + Async + Audit)

### Files Changed
- `apps/api/src/index.ts` - Add async scoring endpoints
- `apps/api/src/services/scoring.service.ts` - Add caching, async jobs, audit

### Endpoints Added
- `POST /api/v1/score/lead/async` - Async scoring job
- `GET /api/v1/score/jobs/:id` - Job status

### UI Pages
- `/dashboard/scoring` - Enhanced with async support

### How to Test
```bash
# Submit async job
curl -X POST http://localhost:4000/api/v1/score/lead/async \
  -H "Content-Type: application/json" \
  -d '{"name":"Jane Doe","email":"jane@example.com"}'

# Check job status
curl http://localhost:4000/api/v1/score/jobs/JOB_ID_HERE

# UI: http://localhost:3002/dashboard/scoring (toggle async mode)
```

- [ ] Completed

---

## Pass 18: Agent Portal Wiring

### Files Changed
- `apps/api/src/index.ts` - Add leads export endpoint
- `apps/web/src/app/dashboard/leads/page.tsx` - Enhanced with scores + export

### Endpoints Added
- `GET /api/v1/leads` - List leads (already exists, ensure demo fallback)
- `GET /api/v1/leads/export?format=hubspot|salesforce|fub` - Export CSV

### UI Pages
- `/dashboard/leads` - Shows leads with tier/score + export dropdown

### How to Test
```bash
# Get leads
curl http://localhost:4000/api/v1/leads

# Export to HubSpot format
curl "http://localhost:4000/api/v1/leads/export?format=hubspot"

# UI: http://localhost:3002/dashboard/leads
```

- [ ] Completed

---

## Pass 19: Landlord Portal Wiring

### Files Changed
- `apps/api/src/index.ts` - Ensure endpoints return demo data
- `apps/web/src/app/dashboard/listings/page.tsx` - Enhanced
- `apps/web/src/app/dashboard/applications/page.tsx` - Enhanced for landlord

### Endpoints Added
- `GET /api/v1/listings/me` - My listings (already exists)
- `GET /api/v1/applications/received` - Received applications (already exists)

### UI Pages
- `/dashboard/listings` - Shows listings (real or demo)
- `/dashboard/applications` - Shows received applications with screening summary

### How to Test
```bash
curl http://localhost:4000/api/v1/listings/me
curl http://localhost:4000/api/v1/applications/received

# UI: http://localhost:3002/dashboard/listings
# UI: http://localhost:3002/dashboard/applications
```

- [ ] Completed

---

## Pass 20: Tenant Portal Wiring

### Files Changed
- `apps/api/src/index.ts` - Ensure endpoints
- `apps/web/src/app/dashboard/saved/page.tsx` - Enhanced
- `apps/web/src/app/dashboard/applications/page.tsx` - Tenant view with next steps

### Endpoints Added
- `GET /api/v1/user/saved-listings` (already exists)
- `GET /api/v1/applications/me` (already exists)

### UI Pages
- `/dashboard/saved` - Shows saved listings
- `/dashboard/applications` - Tenant applications with "Next Steps"

### How to Test
```bash
curl http://localhost:4000/api/v1/user/saved-listings
curl http://localhost:4000/api/v1/applications/me

# UI: http://localhost:3002/dashboard/saved
# UI: http://localhost:3002/dashboard/applications
```

- [ ] Completed

---

## Pass 21: Commercial Real Estate Module

### Files Changed
- `apps/api/src/index.ts` - Add commercial endpoints
- `apps/web/src/app/commercial/page.tsx` (NEW)
- `apps/web/src/app/commercial/[id]/page.tsx` (NEW)
- `apps/web/src/components/layout/header.tsx` - Add Commercial nav tab

### Endpoints Added
- `GET /api/v1/commercial/listings` - List commercial properties

### UI Pages
- `/commercial` - Commercial listings with filters
- `/commercial/[id]` - Commercial property detail

### How to Test
```bash
curl http://localhost:4000/api/v1/commercial/listings

# UI: http://localhost:3002/commercial
```

- [ ] Completed

---

## Pass 22: CRM Export Formats

### Files Changed
- `apps/api/src/index.ts` - Enhanced export with full fields

### Endpoints Added
- Already in Pass 18, enhanced with:
  - score, tier, confidence
  - source fingerprint fields
  - contact channel confidence

### How to Test
```bash
curl "http://localhost:4000/api/v1/leads/export?format=hubspot" | head -5
curl "http://localhost:4000/api/v1/leads/export?format=salesforce" | head -5
curl "http://localhost:4000/api/v1/leads/export?format=fub" | head -5
```

- [ ] Completed

---

## Pass 23: Alerts Module

### Files Changed
- `apps/api/src/index.ts` - Add alerts endpoints
- `apps/web/src/app/dashboard/alerts/page.tsx` (NEW)

### Endpoints Added
- `POST /api/v1/alerts/subscribe` - Subscribe to alerts
- `GET /api/v1/alerts` - Get alerts feed

### UI Pages
- `/dashboard/alerts` - Alert feed with empty/demo states

### How to Test
```bash
curl http://localhost:4000/api/v1/alerts

curl -X POST http://localhost:4000/api/v1/alerts/subscribe \
  -H "Content-Type: application/json" \
  -d '{"type":"lead_tier_change","leadId":"lead-1"}'

# UI: http://localhost:3002/dashboard/alerts
```

- [ ] Completed

---

## Pass 24: Nurture Plans

### Files Changed
- `apps/api/src/index.ts` - Add nurture plan endpoint
- `apps/web/src/app/dashboard/leads/[id]/page.tsx` (NEW)

### Endpoints Added
- `GET /api/v1/leads/:id/nurture-plan` - Get nurture plan for lead

### UI Pages
- `/dashboard/leads/[id]` - Lead detail with nurture plan + editable notes

### How to Test
```bash
curl http://localhost:4000/api/v1/leads/lead-1/nurture-plan

# UI: http://localhost:3002/dashboard/leads/lead-1
```

- [ ] Completed

---

## Pass 25: Usage Tracking + Billing Scaffold

### Files Changed
- `apps/api/src/index.ts` - Add usage tracking
- `apps/web/src/app/dashboard/billing/page.tsx` (NEW)

### Endpoints Added
- `GET /api/v1/usage/me` - Usage counters

### UI Pages
- `/dashboard/billing` - Plan placeholder + usage counters

### How to Test
```bash
curl http://localhost:4000/api/v1/usage/me

# UI: http://localhost:3002/dashboard/billing
```

- [ ] Completed

---

## Pass 26: Observability

### Files Changed
- `apps/api/src/index.ts` - Add error tracking endpoint
- `apps/web/src/app/dashboard/admin/errors/page.tsx` (NEW)

### Endpoints Added
- `GET /api/v1/admin/errors` - Last 50 errors

### UI Pages
- `/dashboard/admin/errors` - Admin-only error viewer

### How to Test
```bash
curl http://localhost:4000/api/v1/admin/errors

# UI: http://localhost:3002/dashboard/admin/errors
```

- [ ] Completed

---

## Pass 27: Founder Demo Mode

### Files Changed
- `apps/web/src/app/login/page.tsx` - Add demo login buttons
- `apps/web/src/stores/auth.ts` - Support demo sessions
- `apps/web/src/components/ui/demo-banner.tsx` (NEW)

### UI Pages
- `/login` - 5 demo role buttons
- All dashboard pages - Demo Mode banner with Reset button

### How to Test
```bash
# UI: http://localhost:3002/login
# Click "Demo as Agent" → redirects to /dashboard with demo data
```

- [ ] Completed

---

## Pass 28: Navigation Completeness

### Files Changed
- Audit all nav items in header.tsx
- Create Coming Soon pages for any missing routes

### UI Pages
- Every top nav item → working page OR polished Coming Soon

### How to Test
```bash
# Click every nav item, no 404s or blank pages
```

- [ ] Completed

---

## Pass 29: Loading/Empty/Error States

### Files Changed
- All dashboard pages - Add consistent loading/empty/error states

### How to Test
```bash
# Each page shows appropriate state based on data/loading/error
```

- [ ] Completed

---

## Pass 30: Final QA + Build

### Tasks
- [ ] Update FOUNDER_QA.md with all new features
- [ ] `pnpm -C apps/api dev` works
- [ ] `pnpm -C apps/web dev` works
- [ ] `pnpm -C apps/web build` passes

---

## TODO: HUMAN_IMPLEMENTATION_REQUIRED

No `// TODO: HUMAN_IMPLEMENTATION_REQUIRED` comments found in codebase.

---

## Summary

| Pass | Feature | Status |
|------|---------|--------|
| 17c | Scoring API | Pending |
| 17d | Scoring Pipeline | Pending |
| 18 | Agent Portal | Pending |
| 19 | Landlord Portal | Pending |
| 20 | Tenant Portal | Pending |
| 21 | Commercial Module | Pending |
| 22 | CRM Export | Pending |
| 23 | Alerts Module | Pending |
| 24 | Nurture Plans | Pending |
| 25 | Usage + Billing | Pending |
| 26 | Observability | Pending |
| 27 | Demo Mode | Pending |
| 28 | Nav Completeness | Pending |
| 29 | UI States | Pending |
| 30 | Final QA | Pending |
