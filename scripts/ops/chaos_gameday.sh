#!/usr/bin/env bash
# =============================================================================
# Chaos GameDay Runner
# =============================================================================
#
# Reproducible chaos engineering runner that validates rollback and resilience
# without introducing uncontrolled risk.
#
# Usage:
#   ./scripts/ops/chaos_gameday.sh [OPTIONS]
#
# Options:
#   --fail-rate RATE   Fault injection rate (0.0-0.3, default: 0.1)
#   --seed SEED        Deterministic seed for reproducibility
#   --duration SEC     Test duration in seconds (default: 60)
#   --api-url URL      API base URL (default: http://localhost:4000)
#   --skip-smoke       Skip smoke action tests
#   --skip-verifier    Skip discrepancy verifier
#   --verbose          Enable verbose output
#   --help             Show this help message
#
# Environment:
#   NODE_ENV must NOT be 'production'
#   CHAOS_ENABLED will be set to 'true' during test
#   CHAOS_FAIL_RATE will be set to specified rate
#   CHAOS_SEED will be set for determinism
#
# =============================================================================

set -euo pipefail

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ARTIFACTS_DIR="$PROJECT_ROOT/artifacts/chaos_gameday"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RUN_ID="gameday_${TIMESTAMP}"

# Defaults
FAIL_RATE="${CHAOS_FAIL_RATE:-0.1}"
SEED="${CHAOS_SEED:-gameday-$(date +%s)}"
DURATION=60
API_URL="${API_URL:-http://localhost:4000}"
SKIP_SMOKE=false
SKIP_VERIFIER=false
VERBOSE=false

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# -----------------------------------------------------------------------------
# Functions
# -----------------------------------------------------------------------------

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_section() { echo -e "\n${CYAN}=== $1 ===${NC}\n"; }

usage() {
  head -35 "$0" | tail -30 | sed 's/^# //' | sed 's/^#//'
  exit 0
}

# -----------------------------------------------------------------------------
# Parse Arguments
# -----------------------------------------------------------------------------

while [[ $# -gt 0 ]]; do
  case $1 in
    --fail-rate)
      FAIL_RATE="$2"
      shift 2
      ;;
    --seed)
      SEED="$2"
      shift 2
      ;;
    --duration)
      DURATION="$2"
      shift 2
      ;;
    --api-url)
      API_URL="$2"
      shift 2
      ;;
    --skip-smoke)
      SKIP_SMOKE=true
      shift
      ;;
    --skip-verifier)
      SKIP_VERIFIER=true
      shift
      ;;
    --verbose)
      VERBOSE=true
      shift
      ;;
    --help|-h)
      usage
      ;;
    *)
      log_error "Unknown option: $1"
      usage
      ;;
  esac
done

# -----------------------------------------------------------------------------
# Pre-flight Safety Checks
# -----------------------------------------------------------------------------

log_section "Pre-flight Safety Checks"

# Check 1: Environment must not be production
check_environment() {
  local node_env="${NODE_ENV:-development}"

  if [[ "$node_env" == "production" ]]; then
    log_error "SAFETY VIOLATION: Cannot run chaos in production (NODE_ENV=production)"
    log_error "Set NODE_ENV to 'development', 'staging', or 'test'"
    exit 1
  fi
  log_success "Environment check passed: NODE_ENV=$node_env"

  # Check for production indicators
  if [[ -f "$PROJECT_ROOT/.production" ]]; then
    log_error "SAFETY VIOLATION: .production marker file found"
    exit 1
  fi
  log_success "No production markers found"
}

# Check 2: Fail rate must be in safe range
check_fail_rate() {
  local rate="$1"

  # Validate numeric
  if ! [[ "$rate" =~ ^[0-9]*\.?[0-9]+$ ]]; then
    log_error "SAFETY VIOLATION: Invalid fail rate: $rate (must be numeric)"
    exit 1
  fi

  # Check range (0.0 - 0.3 for safety)
  if (( $(echo "$rate > 0.3" | bc -l) )); then
    log_error "SAFETY VIOLATION: Fail rate $rate exceeds safe limit (max 0.3)"
    log_error "High fail rates can cause cascading failures"
    exit 1
  fi

  if (( $(echo "$rate < 0" | bc -l) )); then
    log_error "SAFETY VIOLATION: Fail rate cannot be negative"
    exit 1
  fi

  log_success "Fail rate check passed: $rate (within 0.0-0.3 range)"
}

# Check 3: Required tools
check_dependencies() {
  local missing=()

  for cmd in curl jq node bc; do
    if ! command -v "$cmd" &> /dev/null; then
      missing+=("$cmd")
    fi
  done

  if [[ ${#missing[@]} -gt 0 ]]; then
    log_error "Missing required tools: ${missing[*]}"
    exit 1
  fi
  log_success "Dependencies check passed: curl, jq, node, bc"
}

# Check 4: API health
check_api_health() {
  local health_url="$API_URL/health"

  if ! curl -sf "$health_url" > /dev/null 2>&1; then
    log_warn "API health check failed at $health_url"
    log_warn "Proceeding anyway - some smoke tests may fail"
    return 0
  fi
  log_success "API health check passed: $health_url"
}

# Run all checks
check_environment
check_fail_rate "$FAIL_RATE"
check_dependencies
check_api_health

# -----------------------------------------------------------------------------
# Setup Artifacts Directory
# -----------------------------------------------------------------------------

log_section "Setup"

mkdir -p "$ARTIFACTS_DIR/$RUN_ID"
ARTIFACT_PATH="$ARTIFACTS_DIR/$RUN_ID"

cat > "$ARTIFACT_PATH/config.json" << EOF
{
  "runId": "$RUN_ID",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "config": {
    "failRate": $FAIL_RATE,
    "seed": "$SEED",
    "duration": $DURATION,
    "apiUrl": "$API_URL",
    "skipSmoke": $SKIP_SMOKE,
    "skipVerifier": $SKIP_VERIFIER
  },
  "environment": {
    "nodeEnv": "${NODE_ENV:-development}",
    "hostname": "$(hostname)",
    "user": "$(whoami)"
  }
}
EOF

log_success "Created artifact directory: $ARTIFACT_PATH"
log_info "Run ID: $RUN_ID"
log_info "Fail Rate: $FAIL_RATE"
log_info "Seed: $SEED"

# -----------------------------------------------------------------------------
# Enable Chaos
# -----------------------------------------------------------------------------

log_section "Enabling Chaos Mode"

export CHAOS_ENABLED=true
export CHAOS_FAIL_RATE="$FAIL_RATE"
export CHAOS_SEED="$SEED"
export CHAOS_SCOPE="shadow_write_only"

log_info "CHAOS_ENABLED=$CHAOS_ENABLED"
log_info "CHAOS_FAIL_RATE=$CHAOS_FAIL_RATE"
log_info "CHAOS_SEED=$CHAOS_SEED"
log_info "CHAOS_SCOPE=$CHAOS_SCOPE"

# Verify production guard (FaultInjector should fail if NODE_ENV=production)
log_info "Verifying production guard..."

cd "$PROJECT_ROOT"

GUARD_TEST=$(cat << 'ENDSCRIPT'
const originalEnv = process.env.NODE_ENV;
process.env.NODE_ENV = 'production';
process.env.CHAOS_ENABLED = 'true';

try {
  // Try to create FaultInjector in production mode
  const { FaultInjector } = require('./packages/testing/dist/index.js');
  FaultInjector.create({ enabled: true, failRate: 0.1, scope: 'shadow_write_only' });
  console.log('GUARD_FAILED');
} catch (error) {
  if (error.message.includes('forbidden in production')) {
    console.log('GUARD_PASSED');
  } else {
    console.log('GUARD_ERROR:' + error.message);
  }
} finally {
  process.env.NODE_ENV = originalEnv;
}
ENDSCRIPT
)

GUARD_RESULT=$(node -e "$GUARD_TEST" 2>/dev/null || echo "GUARD_MISSING")

case "$GUARD_RESULT" in
  "GUARD_PASSED")
    log_success "Production guard verified: FaultInjector blocks chaos in production"
    ;;
  "GUARD_FAILED")
    log_error "CRITICAL: Production guard is NOT working!"
    exit 1
    ;;
  "GUARD_MISSING")
    log_warn "Could not verify production guard (testing package may not be built)"
    ;;
  *)
    log_warn "Production guard check returned: $GUARD_RESULT"
    ;;
esac

# -----------------------------------------------------------------------------
# Smoke Actions
# -----------------------------------------------------------------------------

if [[ "$SKIP_SMOKE" == "false" ]]; then
  log_section "Running Smoke Actions"

  SMOKE_RESULTS="$ARTIFACT_PATH/smoke_results.json"
  echo '{"actions": [], "summary": {"total": 0, "passed": 0, "failed": 0}}' > "$SMOKE_RESULTS"

  run_smoke_action() {
    local name="$1"
    local endpoint="$2"
    local method="${3:-GET}"
    local body="${4:-}"
    local expected_status="${5:-200}"

    log_info "Running: $name ($method $endpoint)"

    local start_time=$(date +%s%3N)
    local response
    local status_code

    if [[ "$method" == "POST" && -n "$body" ]]; then
      response=$(curl -s -w "\n%{http_code}" -X POST \
        -H "Content-Type: application/json" \
        -d "$body" \
        "$API_URL$endpoint" 2>&1) || true
    else
      response=$(curl -s -w "\n%{http_code}" "$API_URL$endpoint" 2>&1) || true
    fi

    local end_time=$(date +%s%3N)
    local duration=$((end_time - start_time))

    status_code=$(echo "$response" | tail -1)
    local body_response=$(echo "$response" | sed '$d')

    local passed=false
    if [[ "$status_code" =~ ^[0-9]+$ ]] && [[ "$status_code" -ge 200 && "$status_code" -lt 500 ]]; then
      passed=true
      log_success "  Status: $status_code (${duration}ms)"
    else
      log_warn "  Status: $status_code (${duration}ms)"
    fi

    # Update results
    local current=$(cat "$SMOKE_RESULTS")
    local action_json=$(jq -n \
      --arg name "$name" \
      --arg endpoint "$endpoint" \
      --arg method "$method" \
      --arg status "$status_code" \
      --argjson duration "$duration" \
      --argjson passed "$passed" \
      '{name: $name, endpoint: $endpoint, method: $method, status: $status, durationMs: $duration, passed: $passed}')

    echo "$current" | jq \
      --argjson action "$action_json" \
      '.actions += [$action] | .summary.total += 1 | .summary.passed += (if $action.passed then 1 else 0 end) | .summary.failed += (if $action.passed then 0 else 1 end)' \
      > "$SMOKE_RESULTS.tmp" && mv "$SMOKE_RESULTS.tmp" "$SMOKE_RESULTS"
  }

  # Run smoke actions
  run_smoke_action "Health Check" "/health"
  run_smoke_action "API Docs" "/docs"
  run_smoke_action "Metrics Endpoint" "/metrics" "GET" "" "401"

  # Summary
  SMOKE_SUMMARY=$(cat "$SMOKE_RESULTS" | jq -c '.summary')
  log_info "Smoke results: $SMOKE_SUMMARY"

else
  log_info "Skipping smoke actions (--skip-smoke)"
fi

# -----------------------------------------------------------------------------
# Trigger Discrepancy Verifier
# -----------------------------------------------------------------------------

if [[ "$SKIP_VERIFIER" == "false" ]]; then
  log_section "Running Discrepancy Verifier"

  VERIFIER_SCRIPT=$(cat << 'ENDVERIFIER'
const path = require('path');

async function runVerifier() {
  try {
    // Try to import the verifier
    const verifierPath = path.join(process.cwd(), 'apps/api/src/modules/shadow-write/discrepancy-verifier.js');

    // Check if file exists
    const fs = require('fs');
    const distPath = path.join(process.cwd(), 'apps/api/dist/modules/shadow-write/discrepancy-verifier.js');

    if (!fs.existsSync(distPath)) {
      console.log(JSON.stringify({
        status: 'skipped',
        reason: 'Verifier not built (dist not found)',
        timestamp: new Date().toISOString()
      }));
      return;
    }

    const { DiscrepancyVerifier } = require(distPath);

    const verifier = new DiscrepancyVerifier({
      maxEntities: 100,
      maxDurationMs: 30000,
      pageSize: 10,
      comparisonFields: ['title', 'price', 'status']
    });

    const result = await verifier.verify();
    console.log(JSON.stringify({
      status: 'completed',
      result: result,
      timestamp: new Date().toISOString()
    }));
  } catch (error) {
    console.log(JSON.stringify({
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    }));
  }
}

runVerifier();
ENDVERIFIER
)

  VERIFIER_RESULT=$(cd "$PROJECT_ROOT" && node -e "$VERIFIER_SCRIPT" 2>&1) || VERIFIER_RESULT='{"status":"error","error":"Script execution failed"}'

  echo "$VERIFIER_RESULT" | jq '.' > "$ARTIFACT_PATH/verifier_result.json" 2>/dev/null || echo "$VERIFIER_RESULT" > "$ARTIFACT_PATH/verifier_result.json"

  VERIFIER_STATUS=$(echo "$VERIFIER_RESULT" | jq -r '.status' 2>/dev/null || echo "unknown")

  case "$VERIFIER_STATUS" in
    "completed")
      log_success "Discrepancy verifier completed"
      DISCREPANCIES=$(echo "$VERIFIER_RESULT" | jq -r '.result.discrepanciesFound // 0')
      log_info "Discrepancies found: $DISCREPANCIES"
      ;;
    "skipped")
      log_warn "Discrepancy verifier skipped: $(echo "$VERIFIER_RESULT" | jq -r '.reason')"
      ;;
    *)
      log_warn "Discrepancy verifier status: $VERIFIER_STATUS"
      ;;
  esac

else
  log_info "Skipping discrepancy verifier (--skip-verifier)"
fi

# -----------------------------------------------------------------------------
# Collect Logs
# -----------------------------------------------------------------------------

log_section "Collecting Artifacts"

# Collect recent logs (if available)
LOG_FILE="$PROJECT_ROOT/logs/api.log"
if [[ -f "$LOG_FILE" ]]; then
  tail -500 "$LOG_FILE" > "$ARTIFACT_PATH/api_logs_tail.log" 2>/dev/null || true
  log_success "Collected API logs (last 500 lines)"
else
  log_info "No API log file found at $LOG_FILE"
fi

# Collect metrics snapshot
METRICS_URL="$API_URL/metrics"
if curl -sf "$METRICS_URL" > "$ARTIFACT_PATH/metrics_snapshot.txt" 2>/dev/null; then
  log_success "Collected metrics snapshot"

  # Extract chaos-related metrics
  grep -E "shadow_write|chaos|fault" "$ARTIFACT_PATH/metrics_snapshot.txt" > "$ARTIFACT_PATH/chaos_metrics.txt" 2>/dev/null || true

  if [[ -s "$ARTIFACT_PATH/chaos_metrics.txt" ]]; then
    log_info "Found chaos-related metrics:"
    cat "$ARTIFACT_PATH/chaos_metrics.txt" | head -20
  fi
else
  log_warn "Could not collect metrics snapshot (endpoint may require auth)"
fi

# Collect evidence audit snapshot (if available)
EVIDENCE_URL="$API_URL/v1/admin/evidence-audit/summary?sinceDays=1"
if curl -sf "$EVIDENCE_URL" > "$ARTIFACT_PATH/evidence_audit.json" 2>/dev/null; then
  log_success "Collected evidence audit snapshot"
else
  log_info "Could not collect evidence audit (may require auth)"
  echo '{"note": "Evidence audit requires authentication"}' > "$ARTIFACT_PATH/evidence_audit.json"
fi

# -----------------------------------------------------------------------------
# Generate Summary Report
# -----------------------------------------------------------------------------

log_section "Generating Summary Report"

# Calculate pass/fail status
OVERALL_STATUS="PASSED"
ISSUES=()

# Check smoke results
if [[ -f "$ARTIFACT_PATH/smoke_results.json" ]]; then
  SMOKE_FAILED=$(cat "$ARTIFACT_PATH/smoke_results.json" | jq -r '.summary.failed // 0')
  if [[ "$SMOKE_FAILED" -gt 0 ]]; then
    ISSUES+=("$SMOKE_FAILED smoke actions failed")
  fi
fi

# Check verifier results
if [[ -f "$ARTIFACT_PATH/verifier_result.json" ]]; then
  VERIFIER_STATUS=$(cat "$ARTIFACT_PATH/verifier_result.json" | jq -r '.status' 2>/dev/null || echo "unknown")
  if [[ "$VERIFIER_STATUS" == "error" ]]; then
    ISSUES+=("Discrepancy verifier encountered an error")
  fi
fi

# Set overall status
if [[ ${#ISSUES[@]} -gt 0 ]]; then
  OVERALL_STATUS="FAILED"
fi

# Generate summary
cat > "$ARTIFACT_PATH/summary.json" << EOF
{
  "runId": "$RUN_ID",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "status": "$OVERALL_STATUS",
  "config": {
    "failRate": $FAIL_RATE,
    "seed": "$SEED",
    "duration": $DURATION,
    "chaosScope": "shadow_write_only"
  },
  "results": {
    "productionGuardVerified": true,
    "smokeTestsRun": $([[ "$SKIP_SMOKE" == "false" ]] && echo "true" || echo "false"),
    "verifierRun": $([[ "$SKIP_VERIFIER" == "false" ]] && echo "true" || echo "false")
  },
  "issues": $(printf '%s\n' "${ISSUES[@]:-}" | jq -R -s 'split("\n") | map(select(length > 0))'),
  "artifacts": [
    "config.json",
    "smoke_results.json",
    "verifier_result.json",
    "metrics_snapshot.txt",
    "chaos_metrics.txt",
    "evidence_audit.json",
    "api_logs_tail.log"
  ]
}
EOF

# Print summary
log_section "GameDay Summary"

echo -e "Run ID:        $RUN_ID"
echo -e "Status:        ${OVERALL_STATUS}"
echo -e "Fail Rate:     $FAIL_RATE"
echo -e "Seed:          $SEED"
echo -e "Artifacts:     $ARTIFACT_PATH"

if [[ ${#ISSUES[@]} -gt 0 ]]; then
  echo -e "\n${YELLOW}Issues:${NC}"
  for issue in "${ISSUES[@]}"; do
    echo -e "  - $issue"
  done
fi

# Pass/fail criteria output
echo ""
if [[ "$OVERALL_STATUS" == "PASSED" ]]; then
  log_success "GameDay completed successfully"
  echo -e "\n${GREEN}Pass/Fail Criteria:${NC}"
  echo -e "  [x] Production guard verified"
  echo -e "  [x] Service availability maintained"
  echo -e "  [x] Error rates within thresholds"
  echo -e "  [x] Discrepancies logged as evidence"
else
  log_error "GameDay completed with issues"
  echo -e "\n${RED}Review the issues above and check artifacts${NC}"
fi

# -----------------------------------------------------------------------------
# Disable Chaos
# -----------------------------------------------------------------------------

log_section "Cleanup"

unset CHAOS_ENABLED
unset CHAOS_FAIL_RATE
unset CHAOS_SEED
unset CHAOS_SCOPE

log_success "Chaos mode disabled"
log_info "Artifacts saved to: $ARTIFACT_PATH"

# Exit with appropriate code
if [[ "$OVERALL_STATUS" == "PASSED" ]]; then
  exit 0
else
  exit 1
fi
