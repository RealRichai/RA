# Database Restore Procedures

> **Last Updated:** 2026-01-02
> **Owner:** Platform Team
> **Severity:** P0 Runbook

## Overview

This document provides step-by-step procedures for restoring the RealRiches PostgreSQL database from backups. All restore operations should be performed by trained personnel.

---

## Prerequisites

Before starting any restore operation:

- [ ] Confirm you have appropriate access (DBA or Platform Engineer role)
- [ ] Notify stakeholders via #incidents Slack channel
- [ ] Determine target recovery point (timestamp or transaction ID)
- [ ] Verify backup availability in object storage
- [ ] Ensure sufficient disk space on target server

---

## Restore Scenarios

### Scenario 1: Point-in-Time Recovery (PITR)

**Use when:** Data corruption, accidental deletion, need to recover to specific timestamp.

**Estimated time:** 15-30 minutes

#### Step 1: Stop Application Traffic

```bash
# Scale down application pods
kubectl scale deployment api --replicas=0 -n production

# Verify no active connections
psql -c "SELECT count(*) FROM pg_stat_activity WHERE datname = 'realriches';"
```

#### Step 2: Identify Recovery Target

```bash
# List available recovery points
pgbackrest info --stanza=realriches

# For timestamp-based recovery, note the exact timestamp
# Format: YYYY-MM-DD HH:MM:SS+00
```

#### Step 3: Perform PITR Restore

```bash
# Stop PostgreSQL
sudo systemctl stop postgresql

# Restore to specific timestamp
pgbackrest restore --stanza=realriches \
  --type=time \
  --target="2026-01-02 14:30:00+00" \
  --target-action=promote

# Start PostgreSQL
sudo systemctl start postgresql
```

#### Step 4: Verify Recovery

```bash
# Check PostgreSQL is running
pg_isready

# Verify data integrity
psql -c "SELECT count(*) FROM users;"
psql -c "SELECT count(*) FROM ledger_transactions;"

# Check for any corruption
psql -c "SELECT * FROM pg_stat_database WHERE datname = 'realriches';"
```

#### Step 5: Resume Application

```bash
# Scale up application
kubectl scale deployment api --replicas=3 -n production

# Verify health checks
curl -f https://api.realriches.com/health
```

---

### Scenario 2: Full Database Restore

**Use when:** Complete database loss, new environment setup, disaster recovery.

**Estimated time:** 30-60 minutes

#### Step 1: Provision New Database Server

```bash
# Ensure PostgreSQL 16 is installed
psql --version

# Verify pgBackRest is configured
pgbackrest info
```

#### Step 2: Restore Latest Backup

```bash
# Stop PostgreSQL if running
sudo systemctl stop postgresql

# Clear existing data directory
sudo rm -rf /var/lib/postgresql/16/main/*

# Restore from latest backup
pgbackrest restore --stanza=realriches --type=default

# Start PostgreSQL
sudo systemctl start postgresql
```

#### Step 3: Apply WAL Segments

```bash
# PostgreSQL will automatically apply WAL segments
# Monitor recovery progress
tail -f /var/log/postgresql/postgresql-16-main.log

# Check recovery status
psql -c "SELECT pg_is_in_recovery();"
```

#### Step 4: Promote to Primary (if needed)

```bash
# If this is a standby being promoted
psql -c "SELECT pg_promote();"

# Verify no longer in recovery
psql -c "SELECT pg_is_in_recovery();"
```

---

### Scenario 3: Table-Level Restore

**Use when:** Need to restore specific tables without full database restore.

**Estimated time:** 5-15 minutes

#### Step 1: Restore to Temporary Database

```bash
# Create temporary database
createdb realriches_restore

# Restore specific table from logical backup
pg_restore -d realriches_restore \
  -t users \
  /backups/logical/realriches_2026-01-02.dump
```

#### Step 2: Copy Data to Production

```bash
# Copy restored data (adjust query as needed)
psql -c "
  INSERT INTO realriches.users
  SELECT * FROM realriches_restore.users
  WHERE id IN ('uuid1', 'uuid2')
  ON CONFLICT (id) DO UPDATE SET
    updated_at = EXCLUDED.updated_at,
    -- other columns as needed
;"
```

#### Step 3: Cleanup

```bash
# Drop temporary database
dropdb realriches_restore
```

---

## Post-Restore Checklist

After any restore operation:

- [ ] Verify row counts match expected values
- [ ] Run application health checks
- [ ] Check for foreign key constraint violations
- [ ] Verify ledger balance integrity
- [ ] Test critical user flows (login, transactions)
- [ ] Update incident timeline
- [ ] Notify stakeholders of restoration completion

### Data Integrity Verification

```bash
# Run integrity checks
./scripts/ops/verify-restore.sh

# Check ledger balance (should be zero for double-entry)
psql -c "
  SELECT SUM(CASE WHEN is_debit THEN amount ELSE -amount END) as balance
  FROM ledger_entries;
"

# Verify foreign key relationships
psql -c "
  SELECT conname, conrelid::regclass, confrelid::regclass
  FROM pg_constraint
  WHERE contype = 'f'
  AND NOT EXISTS (
    SELECT 1 FROM pg_depend
    WHERE objid = pg_constraint.oid
  );
"
```

---

## Rollback Procedures

If restore causes issues:

### Rollback PITR

```bash
# If you have a pre-restore backup
pgbackrest restore --stanza=realriches \
  --type=time \
  --target="<pre-restore-timestamp>" \
  --target-action=promote
```

### Rollback to Previous State

1. Stop application traffic
2. Restore from backup taken before the restore attempt
3. Verify data integrity
4. Resume application traffic

---

## Emergency Contacts

| Role | Contact | Escalation |
|------|---------|------------|
| On-Call DBA | PagerDuty | Immediate |
| Platform Lead | @platform-lead | 15 min |
| VP Engineering | @vp-eng | 30 min |

---

## Incident Documentation

After any restore:

1. Create incident report in incident tracker
2. Document:
   - Root cause of data loss
   - Recovery time achieved
   - Data loss (if any)
   - Lessons learned
3. Update this runbook if procedures changed

---

## References

- [backup-strategy.md](./backup-strategy.md)
- [restore-drill.md](./restore-drill.md)
- [incident-response.md](./incident-response.md)
- [PostgreSQL Recovery Configuration](https://www.postgresql.org/docs/current/runtime-config-wal.html#RUNTIME-CONFIG-WAL-RECOVERY)
