# Backup Strategy

> **Last Updated:** 2026-01-02
> **Owner:** Platform Team
> **Review Cycle:** Quarterly

## Overview

RealRiches uses PostgreSQL Point-in-Time Recovery (PITR) with continuous WAL archiving for database backups. This provides RPO (Recovery Point Objective) of seconds and RTO (Recovery Time Objective) of minutes.

---

## Backup Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         PostgreSQL Primary                              │
│                                                                         │
│   ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐    │
│   │   Base Backup   │    │   WAL Segments  │    │   Continuous    │    │
│   │   (Weekly)      │    │   (Real-time)   │    │   Archiving     │    │
│   └────────┬────────┘    └────────┬────────┘    └────────┬────────┘    │
└────────────┼─────────────────────┼─────────────────────┼───────────────┘
             │                     │                     │
             ▼                     ▼                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Object Storage (S3)                             │
│                                                                         │
│   ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐    │
│   │  base_backups/  │    │    wal_archive/ │    │   retention/    │    │
│   │  YYYY-MM-DD/    │    │   YYYYMMDD/     │    │   policy/       │    │
│   └─────────────────┘    └─────────────────┘    └─────────────────┘    │
│                                                                         │
│   Encryption: AES-256-GCM          Lifecycle: 90-day retention          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Backup Types

### 1. Continuous WAL Archiving

Write-Ahead Log segments are archived continuously to object storage.

| Parameter | Value |
|-----------|-------|
| Frequency | Real-time (per segment) |
| Segment Size | 16 MB |
| Archive Delay | < 5 seconds |
| Encryption | AES-256-GCM |
| Compression | LZ4 |

**PostgreSQL Configuration:**
```sql
archive_mode = on
archive_command = 'pgbackrest --stanza=realriches archive-push %p'
archive_timeout = 60
```

### 2. Base Backups

Full physical backups taken weekly.

| Parameter | Value |
|-----------|-------|
| Frequency | Weekly (Sunday 02:00 UTC) |
| Type | Full physical backup |
| Method | pgBackRest |
| Retention | 4 weeks |
| Verification | Automatic checksum |

### 3. Logical Backups (Supplementary)

pg_dump for table-level recovery scenarios.

| Parameter | Value |
|-----------|-------|
| Frequency | Daily (04:00 UTC) |
| Type | SQL dump |
| Tables | Critical tables only |
| Retention | 7 days |

---

## Recovery Point Objective (RPO)

| Scenario | RPO |
|----------|-----|
| Normal operation | < 5 seconds |
| Network partition | < 60 seconds (archive_timeout) |
| Storage failure | Last successful WAL segment |

---

## Recovery Time Objective (RTO)

| Scenario | RTO |
|----------|-----|
| Point-in-time recovery | 15-30 minutes |
| Full database restore | 30-60 minutes |
| Table-level restore | 5-15 minutes |

---

## Backup Verification

### Automated Checks (Daily)

1. **WAL Archive Continuity**
   - Verify no gaps in WAL sequence
   - Alert if archive delay > 5 minutes

2. **Base Backup Integrity**
   - Checksum verification
   - Manifest validation

3. **Storage Health**
   - S3 object count verification
   - Storage utilization monitoring

### Manual Verification (Weekly)

Run backup verification script:
```bash
./scripts/ops/verify-backups.sh
```

---

## Retention Policy

| Backup Type | Retention |
|-------------|-----------|
| WAL segments | 7 days |
| Base backups | 4 weeks |
| Monthly snapshots | 12 months |
| Yearly archives | 7 years (compliance) |

---

## Quarterly Restore Drill

See [restore-drill.md](./restore-drill.md) for the quarterly restore drill procedure.

**Schedule:** First Sunday of each quarter
**Duration:** 2-4 hours
**Participants:** On-call engineer + backup owner

---

## Monitoring & Alerts

### Critical Alerts

| Alert | Threshold | Action |
|-------|-----------|--------|
| WAL archive delay | > 5 minutes | Page on-call |
| Base backup failure | 1 failure | Page on-call |
| Storage > 80% | 80% capacity | Ticket |

### Metrics

```
# Backup metrics (Prometheus format)
backup_last_successful_timestamp{type="base"}
backup_last_successful_timestamp{type="wal"}
backup_wal_archive_delay_seconds
backup_storage_bytes{type="base|wal"}
backup_restore_test_last_success_timestamp
```

---

## Disaster Recovery

### Primary Region Failure

1. Promote standby in secondary region
2. Update DNS to point to new primary
3. Verify application connectivity
4. Begin WAL archiving from new primary

### Complete Data Loss

1. Provision new PostgreSQL instance
2. Restore from latest base backup
3. Apply WAL segments to target time
4. Verify data integrity
5. Update application configuration

See [restore-steps.md](./restore-steps.md) for detailed procedures.

---

## Compliance Requirements

| Requirement | Implementation |
|-------------|----------------|
| SOC2 - Backup encryption | AES-256-GCM at rest |
| SOC2 - Access control | IAM roles, audit logging |
| GDPR - Data location | EU region backups for EU data |
| Retention - Financial | 7-year archive for transactions |

---

## References

- [PostgreSQL PITR Documentation](https://www.postgresql.org/docs/current/continuous-archiving.html)
- [pgBackRest User Guide](https://pgbackrest.org/user-guide.html)
- [restore-steps.md](./restore-steps.md)
- [restore-drill.md](./restore-drill.md)
