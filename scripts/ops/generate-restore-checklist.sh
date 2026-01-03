#!/usr/bin/env bash
#
# Restore Rehearsal Checklist Generator
#
# Generates a checklist for quarterly restore drills.
# Non-destructive - only generates documentation.
#
# Usage:
#   ./scripts/ops/generate-restore-checklist.sh [--output FILE] [--report]
#
# Exit codes:
#   0 - Success
#   1 - Error

set -euo pipefail

# =============================================================================
# Configuration
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Default output
OUTPUT_FILE=""
GENERATE_REPORT=false

# Date info
DRILL_DATE=$(date -u +%Y-%m-%d)
DRILL_QUARTER="Q$(($(date +%m)/4+1))"
DRILL_YEAR=$(date +%Y)

# =============================================================================
# Argument Parsing
# =============================================================================

while [[ $# -gt 0 ]]; do
    case "$1" in
        --output|-o)
            OUTPUT_FILE="$2"
            shift 2
            ;;
        --report)
            GENERATE_REPORT=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [--output FILE] [--report]"
            echo ""
            echo "Options:"
            echo "  --output, -o FILE   Write checklist to FILE"
            echo "  --report            Generate post-drill report template"
            echo "  --help, -h          Show this help"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# =============================================================================
# Checklist Generation
# =============================================================================

generate_checklist() {
    cat << EOF
# Restore Drill Checklist - ${DRILL_QUARTER} ${DRILL_YEAR}

**Generated:** $(date -u +%Y-%m-%dT%H:%M:%SZ)
**Scheduled Date:** ${DRILL_DATE}
**Primary Engineer:** _______________
**Backup Engineer:** _______________

---

## Pre-Drill Preparation (Day Before)

### Environment
- [ ] Confirm staging environment is available
- [ ] Verify backup storage credentials are valid
- [ ] Ensure sufficient disk space on drill server (min 100GB)
- [ ] Confirm PostgreSQL 16 is installed on drill server

### Notification
- [ ] Post in #platform: "Quarterly restore drill tomorrow at XX:XX UTC"
- [ ] Confirm participants are available
- [ ] Ensure on-call has been notified

### Backup Status
- [ ] Run backup verification: \`./scripts/ops/verify-backups.sh\`
- [ ] Document latest backup timestamp: _______________
- [ ] Record production row counts for comparison:
  - Users: _______________
  - Leases: _______________
  - Transactions: _______________
  - Ledger Entries: _______________

---

## Drill Execution

### Phase 1: Setup (15 min)

**Start Time:** _______________

- [ ] Create isolated namespace: \`kubectl create namespace drill-restore-${DRILL_DATE}\`
- [ ] Deploy empty PostgreSQL: \`helm install postgres-drill bitnami/postgresql -n drill-restore-${DRILL_DATE}\`
- [ ] Verify no production connectivity
- [ ] Document environment details

### Phase 2: PITR Test (30 min)

**Recovery Target:** _______________

- [ ] Execute PITR restore command
- [ ] Record restore start time: _______________
- [ ] Record restore end time: _______________
- [ ] **PITR RTO:** _______________ minutes

**Verification:**
- [ ] Database accessible: \`pg_isready\`
- [ ] Users count matches: _______________
- [ ] Ledger balance = 0: _______________
- [ ] No foreign key violations

### Phase 3: Full Restore Test (30 min)

- [ ] Clear drill environment
- [ ] Execute full restore command
- [ ] Record restore start time: _______________
- [ ] Record restore end time: _______________
- [ ] **Full Restore RTO:** _______________ minutes

**Verification:**
- [ ] All tables exist: \`\\dt\`
- [ ] Schema matches production
- [ ] Indexes present

### Phase 4: Table-Level Restore (15 min)

- [ ] Create temp database
- [ ] Restore users table from logical backup
- [ ] Verify row count
- [ ] Clean up temp database

### Phase 5: Cleanup (15 min)

- [ ] Stop drill PostgreSQL instances
- [ ] Delete drill data: \`rm -rf /tmp/drill-restore\`
- [ ] Delete namespace: \`kubectl delete namespace drill-restore-${DRILL_DATE}\`
- [ ] Verify all resources cleaned up

---

## Success Criteria

| Metric | Target | Actual | Pass? |
|--------|--------|--------|-------|
| PITR RTO | < 30 min | | [ ] |
| Full Restore RTO | < 60 min | | [ ] |
| Data Integrity | 100% | | [ ] |
| Row Count Match | 100% | | [ ] |
| Ledger Balance | 0 | | [ ] |

---

## Issues Encountered

| # | Description | Resolution | Action Item |
|---|-------------|------------|-------------|
| 1 | | | |
| 2 | | | |
| 3 | | | |

---

## Sign-Off

**Drill Result:** [ ] PASS / [ ] FAIL

**Primary Engineer:** _______________  Date: _______________

**Backup Engineer:** _______________  Date: _______________

---

## Post-Drill Actions

- [ ] Upload checklist to incident tracker
- [ ] Create action items for any issues
- [ ] Update restore-drill.md with results
- [ ] Schedule remediation for any failures
- [ ] Notify team of drill completion
EOF
}

# =============================================================================
# Report Generation
# =============================================================================

generate_report() {
    cat << EOF
# Restore Drill Report - ${DRILL_QUARTER} ${DRILL_YEAR}

**Date:** ${DRILL_DATE}
**Participants:** @_______________, @_______________
**Duration:** ___ hours ___ minutes

---

## Summary

**Result:** [ ] PASS / [ ] FAIL

---

## Metrics

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| PITR RTO | < 30 min | | |
| Full Restore RTO | < 60 min | | |
| Data Integrity | 100% | | |
| Row Count Match | 100% | | |
| Ledger Balance | 0 | | |

---

## Environment Details

- **Backup Tool Version:** pgBackRest _______________
- **PostgreSQL Version:** 16.___
- **Latest Backup:** _______________
- **Recovery Target:** _______________

---

## Issues Encountered

### Issue 1: _______________

**Description:**

**Impact:**

**Resolution:**

**Action Item:**

---

## Lessons Learned

### What Went Well

1.
2.
3.

### What Could Be Improved

1.
2.
3.

---

## Action Items

| # | Action | Owner | Due Date | Status |
|---|--------|-------|----------|--------|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |

---

## Attachments

- [ ] Backup verification output
- [ ] Restore logs
- [ ] Screenshots (if applicable)

---

## Approval

**Report Author:** _______________

**Platform Lead:** _______________

**Date:** _______________
EOF
}

# =============================================================================
# Main
# =============================================================================

main() {
    local output

    if [[ "$GENERATE_REPORT" == "true" ]]; then
        output=$(generate_report)
    else
        output=$(generate_checklist)
    fi

    if [[ -n "$OUTPUT_FILE" ]]; then
        echo "$output" > "$OUTPUT_FILE"
        echo "Checklist written to: $OUTPUT_FILE"
    else
        echo "$output"
    fi
}

main "$@"
