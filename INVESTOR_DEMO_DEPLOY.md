# RealRiches Investor Demo & Deploy Checklist

## Quick Status

| Check | Status | Details |
|-------|--------|---------|
| Node/pnpm | OK | v22.16.0 / 9.14.2 |
| Docker | OK | postgres + redis healthy |
| API (4000) | OK | `{"ok":true,"version":"2.0.0"}` |
| Web (3001) | OK | All 16 pages return 200 |
| TypeScript | OK | Builds clean |

---

## Part 1: Local Verification (Completed)

### Infrastructure
```bash
# Check all services
docker ps --format "{{.Names}}: {{.Status}}"
# Expected: realriches-postgres: Up (healthy), realriches-redis: Up (healthy)

curl http://localhost:4000/health
# Expected: {"ok":true,"service":"api","version":"2.0.0"}

curl -s -o /dev/null -w "%{http_code}" http://localhost:3001
# Expected: 200
```

### Verified Pages (All 200 OK)
- `/` - Homepage
- `/listings` - Rental listings
- `/login` - Login with 5 demo buttons
- `/register` - Registration
- `/commercial` - Commercial listings
- `/agents` - Coming Soon
- `/landlords` - Coming Soon
- `/investors` - Coming Soon
- `/dashboard` - Dashboard home
- `/dashboard/listings` - Listings management
- `/dashboard/applications` - Applications
- `/dashboard/scoring` - Lead scoring tool
- `/dashboard/alerts` - Alerts feed
- `/dashboard/billing` - Billing & usage
- `/dashboard/leads` - CRM leads
- `/dashboard/admin/errors` - Error viewer

---

## Part 2: Demo Walkthrough for Investors

### Demo Script (5 minutes)

1. **Homepage (30 sec)**
   - Open http://localhost:3001
   - Show hero, features, "FARE Act Compliant" messaging

2. **Login + Demo Buttons (30 sec)**
   - Go to /login
   - Show 5 role buttons: Tenant, Landlord, Agent, Investor, Admin

3. **Agent Demo (2 min)**
   - Click "Demo as Agent"
   - Show /dashboard/leads - CRM with lead tiers (HOT/WARM/COLD)
   - Show /dashboard/scoring - AI lead scoring tool
   - Click a lead to show /dashboard/leads/lead-1 - Nurture plan

4. **Admin Demo (1 min)**
   - Login as Admin
   - Show /dashboard/users - User management
   - Show /dashboard/billing - Usage tracking
   - Show /dashboard/admin/errors - Error monitoring

5. **Commercial (30 sec)**
   - Show /commercial - Commercial property listings
   - Note: NYC + Long Island markets

---

## Part 3: Deploy Plan

### Architecture
```
┌─────────────────┐     ┌─────────────────┐
│  Vercel (Web)   │────▶│  Railway/Render │
│  Next.js 14     │     │  Fastify API    │
└─────────────────┘     └────────┬────────┘
                                 │
                    ┌────────────┴────────────┐
                    │                         │
              ┌─────▼─────┐            ┌──────▼─────┐
              │  Neon/    │            │  Upstash   │
              │  Supabase │            │  Redis     │
              │  Postgres │            │  (cache)   │
              └───────────┘            └────────────┘
```

### Step 1: Database (Neon or Supabase)

**Option A: Neon (Recommended for Postgres)**
```bash
# 1. Create project at https://neon.tech
# 2. Copy connection string
# 3. Update .env:
DATABASE_URL="postgresql://user:pass@ep-xxx.neon.tech/realriches?sslmode=require"
```

**Option B: Supabase**
```bash
# 1. Create project at https://supabase.com
# 2. Go to Settings > Database > Connection string
# 3. Copy and update .env
```

### Step 2: Redis (Upstash)
```bash
# 1. Create database at https://upstash.com
# 2. Copy connection details
# 3. Update .env:
REDIS_URL="redis://default:xxx@xxx.upstash.io:6379"
```

### Step 3: API Deployment (Railway)
```bash
# 1. Connect GitHub repo at https://railway.app
# 2. Create new project > Deploy from GitHub
# 3. Select apps/api as root directory
# 4. Add environment variables:
#    - DATABASE_URL (from Neon)
#    - REDIS_URL (from Upstash)
#    - JWT_SECRET (generate: openssl rand -base64 32)
#    - NODE_ENV=production

# 5. Deploy and copy Railway URL (e.g., api.railway.app)
```

### Step 4: Web Deployment (Vercel)
```bash
# 1. Connect GitHub repo at https://vercel.com
# 2. Import project
# 3. Set root directory: apps/web
# 4. Framework preset: Next.js
# 5. Add environment variables:
#    - NEXT_PUBLIC_API_URL=https://your-api.railway.app/api/v1
#    - NEXT_PUBLIC_APP_URL=https://your-app.vercel.app

# 6. Deploy
```

### Step 5: DNS (Optional)
```bash
# At your domain registrar:
# 1. Add CNAME for www -> cname.vercel-dns.com
# 2. Add CNAME for api -> your-api.railway.app

# In Vercel:
# 1. Settings > Domains > Add your-domain.com
```

---

## Part 4: Required Secrets

| Secret | Where | Generate |
|--------|-------|----------|
| DATABASE_URL | Neon/Supabase | From dashboard |
| REDIS_URL | Upstash | From dashboard |
| JWT_SECRET | Railway | `openssl rand -base64 32` |
| JWT_REFRESH_SECRET | Railway | `openssl rand -base64 32` |
| STRIPE_SECRET_KEY | Railway | Stripe dashboard |
| STRIPE_WEBHOOK_SECRET | Railway | Stripe dashboard |

### Generate Secrets Now:
```bash
# Run this to generate JWT secrets:
echo "JWT_SECRET=$(openssl rand -base64 32)"
echo "JWT_REFRESH_SECRET=$(openssl rand -base64 32)"
```

---

## Part 5: Backup Plan

### Local Backup
```bash
# Create timestamped backup
cd ~/Desktop
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
zip -r "realriches_BACKUP_${TIMESTAMP}.zip" "realriches-platform 3" \
  -x "*/node_modules/*" \
  -x "*/.next/*" \
  -x "*/dist/*" \
  -x "*/.git/*"

# Verify
ls -lh realriches_BACKUP_*.zip | tail -1
```

### Git Backup
```bash
cd "realriches-platform 3"
git add -A
git commit -m "Backup before deployment"
git push origin main
```

### Cloud Backup (Optional)
```bash
# Upload to Google Drive, Dropbox, or S3
# Keep at least 3 copies in different locations
```

---

## Part 6: Pre-Deploy Checklist

| Task | Command | Expected |
|------|---------|----------|
| Build passes | `pnpm build` | No errors |
| Lint passes | `pnpm lint` | No errors |
| TypeScript | `pnpm typecheck` | No errors |
| Tests pass | `pnpm test:run` | All green |

### Run Full Check:
```bash
cd "realriches-platform 3"
pnpm build && pnpm lint && pnpm typecheck
```

---

## Part 7: Post-Deploy Verification

After deploying, verify these URLs work:

```bash
# API Health
curl https://your-api.railway.app/health

# Web Pages
curl -I https://your-app.vercel.app
curl -I https://your-app.vercel.app/login
curl -I https://your-app.vercel.app/dashboard
```

### Demo Login Test
1. Go to https://your-app.vercel.app/login
2. Click "Demo as Tenant"
3. Verify dashboard loads with demo data

---

## Quick Reference

### Start Local Development
```bash
cd "realriches-platform 3"
docker-compose up -d           # Start DB + Redis
pnpm --filter @realriches/api dev   # Terminal 1: API
pnpm --filter @realriches/web dev   # Terminal 2: Web
```

### Stop Everything
```bash
pkill -f "next dev"
pkill -f "tsx watch"
docker-compose down
```

### Current Local URLs
- Web: http://localhost:3001
- API: http://localhost:4000
- API Health: http://localhost:4000/health
- API Docs: http://localhost:4000/docs

---

**Document Created:** 2025-12-26
**Platform Version:** 2.0.0
**Status:** Ready for investor demo
