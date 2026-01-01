#!/bin/bash
#
# Security Headers Configuration Check
#
# Validates that security headers are properly configured in the API.
# Part of OWASP Top 10:2021 A05 (Security Misconfiguration) controls.
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ERRORS=0
WARNINGS=0

echo "========================================"
echo "Security Headers Configuration Check"
echo "========================================"
echo ""

# Check 1: Helmet is registered
echo -n "Checking Helmet middleware registration... "
if grep -q "import helmet from '@fastify/helmet'" "$PROJECT_ROOT/apps/api/src/plugins/index.ts" && \
   grep -q "app.register(helmet" "$PROJECT_ROOT/apps/api/src/plugins/index.ts"; then
    echo -e "${GREEN}PASS${NC}"
else
    echo -e "${RED}FAIL${NC}"
    echo "  ERROR: Helmet middleware must be registered in plugins/index.ts"
    ((ERRORS++))
fi

# Check 2: Content Security Policy is configured
echo -n "Checking Content-Security-Policy configuration... "
if grep -q "contentSecurityPolicy" "$PROJECT_ROOT/apps/api/src/plugins/index.ts"; then
    echo -e "${GREEN}PASS${NC}"
else
    echo -e "${RED}FAIL${NC}"
    echo "  ERROR: Content-Security-Policy must be configured"
    ((ERRORS++))
fi

# Check 3: CSP defaultSrc is restrictive
echo -n "Checking CSP defaultSrc is restrictive... "
if grep -q "defaultSrc.*'self'" "$PROJECT_ROOT/apps/api/src/plugins/index.ts"; then
    echo -e "${GREEN}PASS${NC}"
else
    echo -e "${YELLOW}WARN${NC}"
    echo "  WARNING: CSP defaultSrc should use 'self' as baseline"
    ((WARNINGS++))
fi

# Check 4: CORS is configured
echo -n "Checking CORS configuration... "
if grep -q "import cors from '@fastify/cors'" "$PROJECT_ROOT/apps/api/src/plugins/index.ts" && \
   grep -q "app.register(cors" "$PROJECT_ROOT/apps/api/src/plugins/index.ts"; then
    echo -e "${GREEN}PASS${NC}"
else
    echo -e "${RED}FAIL${NC}"
    echo "  ERROR: CORS middleware must be registered"
    ((ERRORS++))
fi

# Check 5: CORS origin is not wildcard in production config
echo -n "Checking CORS origin restriction... "
if grep -q "origin: '\*'" "$PROJECT_ROOT/apps/api/src/plugins/index.ts"; then
    echo -e "${RED}FAIL${NC}"
    echo "  ERROR: CORS origin must not be '*' wildcard"
    ((ERRORS++))
else
    echo -e "${GREEN}PASS${NC}"
fi

# Check 6: Rate limiting is configured
echo -n "Checking rate limiting configuration... "
if grep -q "import rateLimit from '@fastify/rate-limit'" "$PROJECT_ROOT/apps/api/src/plugins/index.ts" && \
   grep -q "app.register(rateLimit" "$PROJECT_ROOT/apps/api/src/plugins/index.ts"; then
    echo -e "${GREEN}PASS${NC}"
else
    echo -e "${RED}FAIL${NC}"
    echo "  ERROR: Rate limiting middleware must be registered"
    ((ERRORS++))
fi

# Check 7: JWT secret validation exists
echo -n "Checking JWT secret minimum length validation... "
if grep -q "min(32)" "$PROJECT_ROOT/packages/config/src/index.ts" || \
   grep -q "length.*32\|32.*length" "$PROJECT_ROOT/packages/config/src/index.ts"; then
    echo -e "${GREEN}PASS${NC}"
else
    echo -e "${YELLOW}WARN${NC}"
    echo "  WARNING: JWT secret should require minimum 32 characters"
    ((WARNINGS++))
fi

# Check 8: Error handler hides stack in production
echo -n "Checking error handler production mode... "
if grep -q "NODE_ENV\|production" "$PROJECT_ROOT/apps/api/src/plugins/error-handler.ts" || \
   grep -q "stack.*undefined\|stack.*null" "$PROJECT_ROOT/apps/api/src/plugins/error-handler.ts"; then
    echo -e "${GREEN}PASS${NC}"
else
    echo -e "${YELLOW}WARN${NC}"
    echo "  WARNING: Error handler should hide stack traces in production"
    ((WARNINGS++))
fi

# Check 9: Sensitive data redaction in audit logs
echo -n "Checking sensitive data redaction in logs... "
if grep -q "REDACTED\|sanitize\|password\|token" "$PROJECT_ROOT/apps/api/src/plugins/audit.ts"; then
    echo -e "${GREEN}PASS${NC}"
else
    echo -e "${YELLOW}WARN${NC}"
    echo "  WARNING: Audit logs should redact sensitive data"
    ((WARNINGS++))
fi

# Check 10: File upload limits configured
echo -n "Checking file upload limits... "
if grep -q "fileSize\|fileSizeLimit\|limits" "$PROJECT_ROOT/apps/api/src/plugins/index.ts"; then
    echo -e "${GREEN}PASS${NC}"
else
    echo -e "${YELLOW}WARN${NC}"
    echo "  WARNING: File upload limits should be configured"
    ((WARNINGS++))
fi

echo ""
echo "========================================"
echo "Results Summary"
echo "========================================"
echo -e "Errors:   ${RED}$ERRORS${NC}"
echo -e "Warnings: ${YELLOW}$WARNINGS${NC}"

if [ $ERRORS -gt 0 ]; then
    echo ""
    echo -e "${RED}FAILED: Security headers check found $ERRORS error(s)${NC}"
    echo "Fix the errors above before proceeding."
    exit 1
fi

if [ $WARNINGS -gt 0 ]; then
    echo ""
    echo -e "${YELLOW}PASSED with warnings: $WARNINGS warning(s) found${NC}"
    echo "Consider addressing the warnings above."
    exit 0
fi

echo ""
echo -e "${GREEN}PASSED: All security headers checks passed${NC}"
exit 0
