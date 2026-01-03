# Quarterly Restore Drill

> **Last Updated:** 2026-01-02
> **Owner:** Platform Team
> **Schedule:** First Sunday of each quarter (Q1: Jan, Q2: Apr, Q3: Jul, Q4: Oct)

## Overview

Quarterly restore drills validate our backup and recovery procedures work correctly. This is a **non-destructive** exercise performed against an isolated environment.

---

## Schedule

| Quarter | Date | Primary | Backup |
|---------|------|---------|--------|
| Q1 2026 | Jan 5, 2026 | @on-call | @platform-lead |
| Q2 2026 | Apr 6, 2026 | TBD | TBD |
| Q3 2026 | Jul 5, 2026 | TBD | TBD |
| Q4 2026 | Oct 4, 2026 | TBD | TBD |

---

## Pre-Drill Preparation (1 day before)

### Checklist

- [ ] Confirm drill participants availability
- [ ] Verify staging environment is available
- [ ] Generate restore rehearsal checklist
  ```bash
  ./scripts/ops/generate-restore-checklist.sh
  ```
- [ ] Notify team in #platform channel
- [ ] Ensure access to backup storage is working
- [ ] Document current production metrics for comparison

---

## Drill Procedure

### Phase 1: Setup (15 minutes)

#### Step 1.1: Create Isolated Environment

```bash
# Provision drill environment
kubectl create namespace drill-restore-$(date +%Y%m%d)

# Deploy PostgreSQL without data
helm install postgres-drill bitnami/postgresql \
  -n drill-restore-$(date +%Y%m%d) \
  -f values-drill.yaml
```

#### Step 1.2: Document Starting Conditions

```bash
# Record backup metadata
pgbackrest info --stanza=realriches > /tmp/drill-backup-info.txt

# Record production metrics for comparison
psql -c "SELECT count(*) as users FROM users;" > /tmp/drill-expected-counts.txt
psql -c "SELECT count(*) as transactions FROM ledger_transactions;" >> /tmp/drill-expected-counts.txt
```

---

### Phase 2: Point-in-Time Recovery Test (30 minutes)

#### Step 2.1: Select Recovery Target

Choose a recovery timestamp from 24 hours ago:

```bash
RECOVERY_TARGET=$(date -u -d "24 hours ago" +"%Y-%m-%d %H:%M:%S+00")
echo "Recovery target: $RECOVERY_TARGET"
```

#### Step 2.2: Execute PITR

```bash
# Start timer
DRILL_START=$(date +%s)

# Perform restore to drill environment
pgbackrest restore --stanza=realriches \
  --type=time \
  --target="$RECOVERY_TARGET" \
  --pg1-path=/tmp/drill-restore \
  --target-action=promote

# Record completion time
DRILL_END=$(date +%s)
DRILL_RTO=$((DRILL_END - DRILL_START))
echo "PITR completed in ${DRILL_RTO} seconds"
```

#### Step 2.3: Verify Recovery

```bash
# Verify database is accessible
pg_isready -h localhost -p 5433

# Compare row counts
psql -p 5433 -c "SELECT count(*) as users FROM users;"
psql -p 5433 -c "SELECT count(*) as transactions FROM ledger_transactions;"

# Verify data integrity
psql -p 5433 -c "
  SELECT SUM(CASE WHEN is_debit THEN amount ELSE -amount END) as balance
  FROM ledger_entries;
"
```

---

### Phase 3: Full Restore Test (30 minutes)

#### Step 3.1: Execute Full Restore

```bash
# Clear drill environment
rm -rf /tmp/drill-restore/*

# Perform full restore
pgbackrest restore --stanza=realriches \
  --type=default \
  --pg1-path=/tmp/drill-restore
```

#### Step 3.2: Verify Full Restore

```bash
# Start PostgreSQL on drill data
pg_ctl start -D /tmp/drill-restore -o "-p 5434"

# Verify all tables exist
psql -p 5434 -c "\dt"

# Run application health check against drill DB
DATABASE_URL="postgresql://localhost:5434/realriches" \
  ./scripts/ops/verify-restore.sh
```

---

### Phase 4: Table-Level Restore Test (15 minutes)

#### Step 4.1: Restore Single Table

```bash
# Create temp database
createdb -p 5434 restore_test

# Restore users table from logical backup
pg_restore -p 5434 -d restore_test \
  -t users \
  /backups/logical/realriches_latest.dump

# Verify table restored
psql -p 5434 -d restore_test -c "SELECT count(*) FROM users;"
```

---

### Phase 5: Cleanup (15 minutes)

#### Step 5.1: Destroy Drill Environment

```bash
# Stop drill PostgreSQL instances
pg_ctl stop -D /tmp/drill-restore

# Remove drill data
rm -rf /tmp/drill-restore

# Delete Kubernetes namespace
kubectl delete namespace drill-restore-$(date +%Y%m%d)
```

#### Step 5.2: Document Results

Fill out the drill report template:

```bash
./scripts/ops/generate-restore-checklist.sh --report
```

---

## Success Criteria

| Metric | Target | Actual |
|--------|--------|--------|
| PITR RTO | < 30 minutes | _____ |
| Full Restore RTO | < 60 minutes | _____ |
| Data Integrity | 100% | _____ |
| Row Count Match | 100% | _____ |
| Ledger Balance | 0 | _____ |

---

## Drill Report Template

```markdown
# Restore Drill Report - YYYY-QN

**Date:** YYYY-MM-DD
**Participants:** @name1, @name2
**Duration:** X hours

## Summary
[ ] PASS / [ ] FAIL

## Metrics
- PITR RTO: XX minutes (target: 30)
- Full Restore RTO: XX minutes (target: 60)
- Data Integrity: XX% (target: 100%)

## Issues Encountered
1. Issue description
   - Resolution: ...

## Action Items
- [ ] Action item 1
- [ ] Action item 2

## Lessons Learned
- ...
```

---

## Failure Procedures

If drill fails:

1. **Do not panic** - this is why we drill
2. Document the failure point precisely
3. Attempt to diagnose root cause
4. Create action items for remediation
5. Schedule follow-up drill within 2 weeks

---

## Historical Results

| Date | Result | RTO Achieved | Notes |
|------|--------|--------------|-------|
| 2026-01-05 | - | - | Initial drill |

---

## References

- [backup-strategy.md](./backup-strategy.md)
- [restore-steps.md](./restore-steps.md)
- [incident-response.md](./incident-response.md)
