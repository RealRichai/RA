#!/bin/bash
# ============================================================================
# RealRiches Pre-commit Artifact Check
# Blocks commits containing node_modules, .next, or dist directories
# ============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

echo "Checking for forbidden artifacts in staged files..."

# Get list of staged files
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null || echo "")

# Patterns to block
FORBIDDEN_PATTERNS=(
    "node_modules/"
    ".next/"
    "dist/"
    ".turbo/"
    "coverage/"
    ".env"
    ".DS_Store"
)

FOUND_FORBIDDEN=0

for pattern in "${FORBIDDEN_PATTERNS[@]}"; do
    MATCHES=$(echo "$STAGED_FILES" | grep -E "^$pattern|/$pattern" || true)
    if [ -n "$MATCHES" ]; then
        echo -e "${RED}ERROR: Attempting to commit forbidden artifact: $pattern${NC}"
        echo "$MATCHES" | head -5
        FOUND_FORBIDDEN=1
    fi
done

if [ $FOUND_FORBIDDEN -eq 1 ]; then
    echo ""
    echo -e "${RED}Commit blocked. Remove artifacts with:${NC}"
    echo "  git reset HEAD <file>"
    echo "  git rm --cached -r <directory>"
    exit 1
fi

echo -e "${GREEN}No forbidden artifacts found.${NC}"
exit 0
