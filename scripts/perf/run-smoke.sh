#!/usr/bin/env bash
#
# Run k6 Smoke Tests
#
# Executes the performance smoke test suite against the API.
# Used by CI and for local development.
#
# Usage:
#   ./scripts/perf/run-smoke.sh [--api-url URL] [--output-dir DIR]
#
# Environment:
#   API_BASE_URL - API base URL (default: http://localhost:4000)
#   AUTH_TOKEN   - Auth token for API requests (default: test-token)
#
# Exit codes:
#   0 - All thresholds passed
#   1 - One or more thresholds failed (regression detected)
#   2 - Script error

set -euo pipefail

# =============================================================================
# Configuration
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PERF_DIR="$PROJECT_ROOT/tests/performance"

# Defaults
API_BASE_URL="${API_BASE_URL:-http://localhost:4000}"
AUTH_TOKEN="${AUTH_TOKEN:-test-token}"
OUTPUT_DIR="${OUTPUT_DIR:-$PERF_DIR/results}"

# =============================================================================
# Argument Parsing
# =============================================================================

while [[ $# -gt 0 ]]; do
    case "$1" in
        --api-url)
            API_BASE_URL="$2"
            shift 2
            ;;
        --output-dir)
            OUTPUT_DIR="$2"
            shift 2
            ;;
        --help|-h)
            echo "Usage: $0 [--api-url URL] [--output-dir DIR]"
            echo ""
            echo "Options:"
            echo "  --api-url URL      API base URL (default: http://localhost:4000)"
            echo "  --output-dir DIR   Output directory for results"
            echo "  --help, -h         Show this help"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 2
            ;;
    esac
done

# =============================================================================
# Pre-flight Checks
# =============================================================================

echo "================================="
echo "  k6 Smoke Test Runner"
echo "================================="

# Check if k6 is installed
if ! command -v k6 &> /dev/null; then
    echo "ERROR: k6 is not installed"
    echo ""
    echo "Install k6:"
    echo "  macOS:   brew install k6"
    echo "  Linux:   sudo apt install k6"
    echo "  Docker:  docker pull grafana/k6"
    echo ""
    echo "Or run with Docker:"
    echo "  docker run --rm -v \$(pwd):/scripts grafana/k6 run /scripts/tests/performance/smoke.js"
    exit 2
fi

# Check if baselines exist
if [[ ! -f "$PERF_DIR/baselines.json" ]]; then
    echo "ERROR: baselines.json not found at $PERF_DIR/baselines.json"
    exit 2
fi

# Create output directory
mkdir -p "$OUTPUT_DIR"

# =============================================================================
# Load Baselines
# =============================================================================

BASELINES=$(cat "$PERF_DIR/baselines.json")
echo "Loaded baselines v$(echo "$BASELINES" | jq -r '.version')"

# =============================================================================
# Run k6
# =============================================================================

echo ""
echo "Running smoke tests..."
echo "  API URL: $API_BASE_URL"
echo "  Output:  $OUTPUT_DIR"
echo ""

# Run k6 with baselines injected as environment variable
k6 run \
    --env "API_BASE_URL=$API_BASE_URL" \
    --env "AUTH_TOKEN=$AUTH_TOKEN" \
    --env "BASELINES=$BASELINES" \
    --out "json=$OUTPUT_DIR/results.json" \
    --summary-trend-stats "avg,min,med,max,p(90),p(95),p(99)" \
    "$PERF_DIR/smoke.js"

EXIT_CODE=$?

# =============================================================================
# Post-processing
# =============================================================================

if [[ $EXIT_CODE -eq 0 ]]; then
    echo ""
    echo "================================="
    echo "  All thresholds passed!"
    echo "================================="
else
    echo ""
    echo "================================="
    echo "  REGRESSION DETECTED"
    echo "================================="
    echo ""
    echo "One or more performance thresholds were exceeded."
    echo "Check the summary above for details."
    echo ""
    echo "To update baselines (requires approval):"
    echo "  1. Run full load test to get new metrics"
    echo "  2. Update tests/performance/baselines.json"
    echo "  3. Get approval from platform team"
    echo "  4. Commit with message: 'perf: update baselines - [reason]'"
fi

exit $EXIT_CODE
