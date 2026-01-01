#!/usr/bin/env bash
#
# Policy Scan: HUMAN_IMPLEMENTATION_REQUIRED
#
# Scans source directories for HUMAN_IMPLEMENTATION_REQUIRED markers.
# Returns non-zero if any matches are found.
#
# Usage:
#   ./scripts/policy_scan.sh
#
# Directories scanned: apps/, packages/, prisma/, docs/
# Exclusions: coverage/, .next/, dist/, .turbo/
#

set -euo pipefail

MARKER="HUMAN_IMPLEMENTATION_REQUIRED"
DIRS="apps packages prisma docs"
EXCLUDE_DIRS="coverage .next dist .turbo node_modules"

# Build exclude arguments for grep
EXCLUDE_ARGS=""
for dir in $EXCLUDE_DIRS; do
  EXCLUDE_ARGS="$EXCLUDE_ARGS --exclude-dir=$dir"
done

echo "Scanning for $MARKER in source files..."
echo "Directories: $DIRS"
echo "Excluding: $EXCLUDE_DIRS"
echo ""

# Check if directories exist
EXISTING_DIRS=""
for dir in $DIRS; do
  if [ -d "$dir" ]; then
    EXISTING_DIRS="$EXISTING_DIRS $dir"
  fi
done

if [ -z "$EXISTING_DIRS" ]; then
  echo "No source directories found to scan."
  exit 0
fi

# Run grep and capture output
if grep -rn "$MARKER" $EXISTING_DIRS \
    --include="*.ts" \
    --include="*.tsx" \
    --include="*.js" \
    --include="*.jsx" \
    --include="*.md" \
    $EXCLUDE_ARGS 2>/dev/null; then
  echo ""
  echo "=========================================="
  echo "ERROR: Found $MARKER in source files."
  echo "=========================================="
  echo ""
  echo "Fix the TODOs or move them to documentation only."
  exit 1
else
  echo "OK: No $MARKER found in source."
  exit 0
fi
