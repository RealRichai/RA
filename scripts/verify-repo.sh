#!/bin/bash
# ============================================================================
# RealRiches Repository Verification
# Quick check that repo is in a clean state
# ============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "============================================"
echo "RealRiches Repository Verification"
echo "============================================"
echo ""

ERRORS=0

# Check 1: No forbidden files tracked
echo "1. Checking for tracked artifacts..."
TRACKED_ARTIFACTS=$(git ls-files --cached | grep -E "(node_modules/|\.next/|dist/|\.turbo/|coverage/)" || true)
if [ -n "$TRACKED_ARTIFACTS" ]; then
    echo -e "${RED}   FAIL: Found tracked artifacts${NC}"
    echo "$TRACKED_ARTIFACTS" | head -10
    ERRORS=$((ERRORS + 1))
else
    echo -e "${GREEN}   PASS: No artifacts tracked${NC}"
fi

# Check 2: .gitignore exists and has required patterns
echo "2. Checking .gitignore..."
if [ -f ".gitignore" ]; then
    REQUIRED_PATTERNS=("node_modules" ".next" "dist" ".turbo" "coverage" ".env" ".DS_Store")
    MISSING=0
    for pattern in "${REQUIRED_PATTERNS[@]}"; do
        if ! grep -q "$pattern" .gitignore; then
            echo -e "${YELLOW}   WARN: Missing pattern: $pattern${NC}"
            MISSING=$((MISSING + 1))
        fi
    done
    if [ $MISSING -eq 0 ]; then
        echo -e "${GREEN}   PASS: .gitignore has all required patterns${NC}"
    fi
else
    echo -e "${RED}   FAIL: .gitignore not found${NC}"
    ERRORS=$((ERRORS + 1))
fi

# Check 3: Git status
echo "3. Checking git status..."
UNCOMMITTED=$(git status --porcelain 2>/dev/null | wc -l)
if [ "$UNCOMMITTED" -gt 0 ]; then
    echo -e "${YELLOW}   INFO: $UNCOMMITTED uncommitted changes${NC}"
else
    echo -e "${GREEN}   PASS: Working tree clean${NC}"
fi

# Check 4: Pre-commit hook exists
echo "4. Checking pre-commit hook..."
if [ -x ".husky/pre-commit" ] || [ -x ".git/hooks/pre-commit" ]; then
    echo -e "${GREEN}   PASS: Pre-commit hook installed${NC}"
else
    echo -e "${YELLOW}   WARN: Pre-commit hook not executable${NC}"
fi

echo ""
echo "============================================"
if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}All checks passed!${NC}"
    exit 0
else
    echo -e "${RED}$ERRORS check(s) failed${NC}"
    exit 1
fi
