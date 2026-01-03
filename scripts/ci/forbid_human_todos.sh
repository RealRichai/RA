#!/usr/bin/env bash
#
# forbid_human_todos.sh - CI policy gate for HUMAN_IMPLEMENTATION_REQUIRED markers
#
# This script scans source files for "TODO: HUMAN_IMPLEMENTATION_REQUIRED" markers
# and fails the build if any are found. Uses git ls-files as the source-of-truth.
#
# SCAN PATHS:
#   - apps/**
#   - packages/**
#   - prisma/**
#   - docs/**
#   - .github/**
#   - scripts/**
#
# EXCLUDED PATHS (generated artifacts):
#   - coverage/**
#   - .next/**
#   - dist/**
#   - .turbo/**
#   - node_modules/**
#
# Usage:
#   ./scripts/ci/forbid_human_todos.sh [--test]
#
# Options:
#   --test    Run self-test: creates a temp file with the marker, verifies detection,
#             then cleans up. Exits 0 if detection works, 1 if it fails.
#
# Exit Codes:
#   0  - No violations found (or test passed)
#   1  - Violations found (or test failed)
#   2  - Script error
#

set -euo pipefail

# Configuration
MARKER="TODO: HUMAN_IMPLEMENTATION_REQUIRED"
SCAN_PATHS="apps packages prisma docs .github scripts"
EXCLUDE_PATTERNS="coverage/ .next/ dist/ .turbo/ node_modules/"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Self-test mode
run_self_test() {
    echo "Running self-test..."

    # Create a temp file in a scanned directory
    TEST_FILE="scripts/ci/.test_human_todo_marker.ts"
    echo "// $MARKER - test marker" > "$TEST_FILE"

    # Track the file with git (but don't commit)
    git add "$TEST_FILE" 2>/dev/null || true

    # Run detection (expect to find it)
    set +e
    MATCHES=$(git ls-files -- $SCAN_PATHS 2>/dev/null | \
        grep -v -E "(coverage/|\.next/|dist/|\.turbo/|node_modules/)" | \
        xargs grep -l "$MARKER" 2>/dev/null)
    RESULT=$?
    set -e

    # Cleanup
    git reset HEAD "$TEST_FILE" 2>/dev/null || true
    rm -f "$TEST_FILE"

    # Verify detection worked
    if echo "$MATCHES" | grep -q ".test_human_todo_marker.ts"; then
        echo -e "${GREEN}SELF-TEST PASSED${NC}: Marker detection working correctly"
        exit 0
    else
        echo -e "${RED}SELF-TEST FAILED${NC}: Did not detect marker in test file"
        exit 1
    fi
}

# Check for test flag
if [[ "${1:-}" == "--test" ]]; then
    run_self_test
fi

echo "========================================"
echo "  Policy Gate: Forbid HUMAN_IMPLEMENTATION_REQUIRED"
echo "========================================"
echo ""
echo "Marker:   $MARKER"
echo "Scanning: $SCAN_PATHS"
echo "Excluded: $EXCLUDE_PATTERNS"
echo ""

# Check we're in a git repo
if ! git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
    echo -e "${RED}ERROR: Not inside a git repository${NC}"
    exit 2
fi

# Build exclusion regex pattern
EXCLUDE_REGEX="($(echo "$EXCLUDE_PATTERNS" | tr ' ' '|' | sed 's/\//\\\//g'))"

# Get list of tracked files in scan paths, excluding generated directories
echo "Gathering tracked files..."

# First check which scan paths exist
EXISTING_PATHS=""
for path in $SCAN_PATHS; do
    if [ -e "$path" ]; then
        EXISTING_PATHS="$EXISTING_PATHS $path"
    fi
done

if [ -z "$EXISTING_PATHS" ]; then
    echo -e "${YELLOW}WARNING: No scan paths found${NC}"
    exit 0
fi

# Get files using git ls-files and filter out excluded paths
FILES=$(git ls-files -- $EXISTING_PATHS 2>/dev/null | \
    grep -v -E "$EXCLUDE_REGEX" || true)

if [ -z "$FILES" ]; then
    echo -e "${YELLOW}WARNING: No files found to scan${NC}"
    exit 0
fi

FILE_COUNT=$(echo "$FILES" | wc -l | tr -d ' ')
echo "Found $FILE_COUNT files to scan"
echo ""

# Search for the marker in all files
echo "Searching for forbidden marker..."
VIOLATIONS=""
VIOLATION_COUNT=0

# Use grep with line numbers on the filtered file list
while IFS= read -r file; do
    if [ -f "$file" ]; then
        MATCHES=$(grep -n "$MARKER" "$file" 2>/dev/null || true)
        if [ -n "$MATCHES" ]; then
            while IFS= read -r match; do
                VIOLATIONS="$VIOLATIONS\n  $file:$match"
                VIOLATION_COUNT=$((VIOLATION_COUNT + 1))
            done <<< "$MATCHES"
        fi
    fi
done <<< "$FILES"

# Report results
echo ""
if [ "$VIOLATION_COUNT" -gt 0 ]; then
    echo -e "${RED}========================================"
    echo "  POLICY VIOLATION DETECTED"
    echo -e "========================================${NC}"
    echo ""
    echo -e "${RED}Found $VIOLATION_COUNT occurrence(s) of forbidden marker:${NC}"
    echo -e "$VIOLATIONS"
    echo ""
    echo "These markers must be resolved before merging."
    echo "Either complete the implementation or convert to a trackable issue."
    echo ""
    exit 1
else
    echo -e "${GREEN}========================================"
    echo "  POLICY CHECK PASSED"
    echo -e "========================================${NC}"
    echo ""
    echo -e "${GREEN}No '$MARKER' markers found in source files.${NC}"
    exit 0
fi
