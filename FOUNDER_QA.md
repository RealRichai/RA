# Founder QA Checklist

## Overview
25 click-tests to verify the RealRiches platform works end-to-end.
No coding required - just click and verify.

**Base URL:** http://localhost:3002

---

## Public Pages (Logged Out)

### 1. Homepage
- **URL:** http://localhost:3002/
- **Expected:** Landing page with hero, features, CTA buttons
- **Pass:** [ ]

### 2. Browse Rentals
- **URL:** http://localhost:3002/listings
- **Expected:** Grid of rental listings with filters (borough, price, beds)
- **Pass:** [ ]

### 3. Find an Agent
- **URL:** http://localhost:3002/agents
- **Expected:** "Coming Soon" page with features preview and CTA
- **Pass:** [ ]

### 4. For Landlords
- **URL:** http://localhost:3002/landlords
- **Expected:** "Coming Soon" page with landlord features and CTA
- **Pass:** [ ]

### 5. For Investors
- **URL:** http://localhost:3002/investors
- **Expected:** "Coming Soon" page with investor features and CTA
- **Pass:** [ ]

### 6. Commercial
- **URL:** http://localhost:3002/commercial
- **Expected:** Commercial listings grid with filters
- **Pass:** [ ]

---

## Demo Login

### 7. Demo Login Page
- **URL:** http://localhost:3002/login
- **Expected:** Login form + 5 demo role buttons (Tenant/Landlord/Agent/Investor/Admin)
- **Pass:** [ ]

### 8. Demo as Tenant
- **Action:** Click "Demo as Tenant" on login page
- **Expected:** Redirects to /dashboard with Tenant nav, Demo Mode banner visible
- **Pass:** [ ]

### 9. Demo as Agent
- **Action:** Click "Demo as Agent" on login page
- **Expected:** Redirects to /dashboard with Agent nav (Leads, Listings, Tours, Performance)
- **Pass:** [ ]

### 10. Demo as Admin
- **Action:** Click "Demo as Admin" on login page
- **Expected:** Redirects to /dashboard with Admin nav (Users, Listings, Analytics, Settings)
- **Pass:** [ ]

---

## Tenant Dashboard

### 11. Tenant Dashboard Home
- **URL:** http://localhost:3002/dashboard (as Tenant)
- **Expected:** Welcome message, stats cards, recent activity
- **Pass:** [ ]

### 12. Saved Listings
- **URL:** http://localhost:3002/dashboard/saved
- **Expected:** Grid of saved listings (demo data), stats at bottom
- **Pass:** [ ]

### 13. My Applications
- **URL:** http://localhost:3002/dashboard/applications
- **Expected:** List of applications with status, "Next Steps" section visible
- **Pass:** [ ]

### 14. My Tours
- **URL:** http://localhost:3002/dashboard/tours
- **Expected:** Upcoming/past tours list, tour details
- **Pass:** [ ]

---

## Agent Dashboard

### 15. Agent Leads
- **URL:** http://localhost:3002/dashboard/leads (as Agent)
- **Expected:** Leads table with tier badges (HOT/WARM/COLD), score, export button
- **Pass:** [ ]

### 16. Lead Scoring Tool
- **URL:** http://localhost:3002/dashboard/scoring
- **Expected:** JSON input form, submit button, score result display
- **Pass:** [ ]

### 17. Lead Detail + Nurture Plan
- **URL:** http://localhost:3002/dashboard/leads/lead-1
- **Expected:** Lead info, nurture plan timeline, editable notes
- **Pass:** [ ]

### 18. Agent Analytics
- **URL:** http://localhost:3002/dashboard/analytics
- **Expected:** Performance charts, metrics cards
- **Pass:** [ ]

---

## Landlord Dashboard

### 19. My Listings
- **URL:** http://localhost:3002/dashboard/listings (as Landlord)
- **Expected:** Property cards with views/inquiries stats
- **Pass:** [ ]

### 20. Received Applications
- **URL:** http://localhost:3002/dashboard/applications (as Landlord)
- **Expected:** Applicant cards with screening summary
- **Pass:** [ ]

### 21. Leases
- **URL:** http://localhost:3002/dashboard/leases
- **Expected:** Active/past leases list
- **Pass:** [ ]

---

## Admin Dashboard

### 22. User Management
- **URL:** http://localhost:3002/dashboard/users (as Admin)
- **Expected:** Users table with role/status filters, actions dropdown
- **Pass:** [ ]

### 23. Error Viewer
- **URL:** http://localhost:3002/dashboard/admin/errors
- **Expected:** Recent errors list (may be empty)
- **Pass:** [ ]

---

## Billing & Usage

### 24. Billing Page
- **URL:** http://localhost:3002/dashboard/billing
- **Expected:** Current plan info, usage counters (scoring calls, exports, etc.)
- **Pass:** [ ]

---

## Alerts

### 25. Alerts Feed
- **URL:** http://localhost:3002/dashboard/alerts
- **Expected:** Alert feed (demo alerts or empty state with message)
- **Pass:** [ ]

---

## API Health Checks

Run these curl commands to verify API is working:

```bash
# 1. Main health
curl http://localhost:4000/api/v1/health
# Expected: {"ok":true,"service":"api","version":"2.0.0"}

# 2. Scoring health
curl http://localhost:4000/api/v1/score/health
# Expected: {"ok":true,"module":"scoring"}

# 3. Get leads
curl http://localhost:4000/api/v1/leads
# Expected: {"data":{"leads":[...]}}

# 4. Get commercial listings
curl http://localhost:4000/api/v1/commercial/listings
# Expected: {"data":[...]}

# 5. Get usage
curl http://localhost:4000/api/v1/usage/me
# Expected: {"data":{"scoringCalls":0,"exports":0,...}}
```

---

## Summary

| Category | Tests | Passed |
|----------|-------|--------|
| Public Pages | 6 | /6 |
| Demo Login | 4 | /4 |
| Tenant Dashboard | 4 | /4 |
| Agent Dashboard | 4 | /4 |
| Landlord Dashboard | 3 | /3 |
| Admin Dashboard | 2 | /2 |
| Billing & Alerts | 2 | /2 |
| **Total** | **25** | **/25** |

---

## Notes

- All pages should show content (real, demo, or Coming Soon)
- No blank white pages anywhere
- Demo Mode banner appears when logged in via demo buttons
- API returns demo data when database is not connected
