#!/bin/bash
#
# Authorization Middleware Check
#
# Ensures all API endpoints have proper authorization middleware.
# Part of OWASP Top 10:2021 A01 (Broken Access Control) controls.
#
# This script scans route files for endpoints and verifies they use
# authentication/authorization decorators or are explicitly marked as public.
#

# Don't use set -e as arithmetic operations can return non-zero
set +e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ROUTES_DIR="$PROJECT_ROOT/apps/api/src/modules"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ERRORS=0
WARNINGS=0
CHECKED=0

# Known public endpoints that don't require auth
PUBLIC_PATTERNS=(
    "/health"
    "/ready"
    "/metrics"
    "/docs"
    "/public/"
    "auth/login"
    "auth/register"
    "auth/refresh"
    "auth/forgot-password"
    "auth/reset-password"
    "auth/verify-email"
    "listings"  # Public listing browse
    "webhook"
)

echo "========================================"
echo "Authorization Middleware Check"
echo "========================================"
echo ""

is_public_endpoint() {
    local endpoint="$1"
    for pattern in "${PUBLIC_PATTERNS[@]}"; do
        if echo "$endpoint" | grep -qi "$pattern"; then
            return 0
        fi
    done
    return 1
}

check_route_file() {
    local file="$1"
    local relative_path="${file#$PROJECT_ROOT/}"
    local file_errors=0

    # Extract route definitions (fastify.get, fastify.post, etc.)
    local endpoints
    endpoints=$(grep -n "fastify\.\(get\|post\|put\|patch\|delete\)" "$file" 2>/dev/null || true)

    if [ -z "$endpoints" ]; then
        return 0
    fi

    # Check if file has authentication imports/usage
    local has_auth_pattern=0
    if grep -q "authenticate\|authorize\|preHandler\|onRequest.*auth\|requireAuth" "$file"; then
        has_auth_pattern=1
    fi

    # Check each endpoint
    while IFS= read -r line; do
        CHECKED=$((CHECKED + 1))
        local line_num=$(echo "$line" | cut -d: -f1)
        local endpoint_def=$(echo "$line" | cut -d: -f2-)

        # Extract the path - may be on same line or next few lines
        # Get 5 lines starting from this line to find the path
        local context_lines
        context_lines=$(sed -n "${line_num},$((line_num + 5))p" "$file")

        local path=""
        # Try single quotes first
        path=$(echo "$context_lines" | grep -oE "'[^']+'" | head -1 | tr -d "'" || true)
        # Try double quotes if no single quotes found
        if [ -z "$path" ]; then
            path=$(echo "$context_lines" | grep -oE '"[^"]+"' | head -1 | tr -d '"' || true)
        fi
        # Default path if extraction failed
        if [ -z "$path" ]; then
            path="<unknown>"
        fi

        # Check if this is a public endpoint
        if is_public_endpoint "$path"; then
            continue
        fi

        # Check if the route has auth middleware
        # Look for preHandler or onRequest hooks in the next 20 lines
        local context
        context=$(sed -n "${line_num},$((line_num + 30))p" "$file" | head -30)

        local has_auth=0
        if echo "$context" | grep -q "authenticate\|authorize\|preHandler.*auth\|onRequest.*auth"; then
            has_auth=1
        fi

        # Check if there's a preHandler array with authentication
        if echo "$context" | grep -q "preHandler.*\["; then
            if echo "$context" | grep -q "authenticate\|authorize"; then
                has_auth=1
            fi
        fi

        # Check for route-level onRequest hook
        if echo "$context" | grep -q "onRequest.*authenticate"; then
            has_auth=1
        fi

        if [ $has_auth -eq 0 ] && [ $has_auth_pattern -eq 0 ]; then
            echo -e "${YELLOW}WARNING${NC}: $relative_path:$line_num"
            echo "  Endpoint '$path' may be missing authorization"
            echo "  Add preHandler: [fastify.authenticate] or mark as intentionally public"
            WARNINGS=$((WARNINGS + 1))
            file_errors=$((file_errors + 1))
        fi
    done <<< "$endpoints"

    return $file_errors
}

# Check auth plugin exists and exports decorators
echo -n "Checking auth plugin exports authenticate decorator... "
if grep -q "fastify.decorate" "$PROJECT_ROOT/apps/api/src/plugins/auth.ts" && \
   grep -q "authenticate" "$PROJECT_ROOT/apps/api/src/plugins/auth.ts"; then
    echo -e "${GREEN}PASS${NC}"
else
    echo -e "${RED}FAIL${NC}"
    echo "  ERROR: Auth plugin must export 'authenticate' decorator"
    ERRORS=$((ERRORS + 1))
fi

echo -n "Checking auth plugin exports authorize decorator... "
if grep -q "fastify.decorate" "$PROJECT_ROOT/apps/api/src/plugins/auth.ts" && \
   grep -q "authorize" "$PROJECT_ROOT/apps/api/src/plugins/auth.ts"; then
    echo -e "${GREEN}PASS${NC}"
else
    echo -e "${RED}FAIL${NC}"
    echo "  ERROR: Auth plugin must export 'authorize' decorator"
    ERRORS=$((ERRORS + 1))
fi

echo ""
echo "Scanning route files for authorization..."
echo ""

# Find all route files
route_files=$(find "$ROUTES_DIR" -name "*.ts" -type f | grep -E "(routes?|router|endpoints?)" || true)

# Also check any route files in the modules
additional_routes=$(find "$ROUTES_DIR" -name "*.ts" -type f -exec grep -l "fastify\.\(get\|post\|put\|patch\|delete\)" {} \; 2>/dev/null || true)

# Combine and deduplicate
all_routes=$(echo -e "$route_files\n$additional_routes" | sort -u | grep -v "^$" || true)

if [ -z "$all_routes" ]; then
    echo "No route files found to check"
else
    while IFS= read -r file; do
        check_route_file "$file"
    done <<< "$all_routes"
fi

echo ""
echo "========================================"
echo "Results Summary"
echo "========================================"
echo "Endpoints checked: $CHECKED"
echo -e "Errors:   ${RED}$ERRORS${NC}"
echo -e "Warnings: ${YELLOW}$WARNINGS${NC}"

# Check for admin-only routes
echo ""
echo "Checking admin routes have elevated authorization..."
admin_routes=$(find "$ROUTES_DIR" -name "*.ts" -type f -exec grep -l "'/admin" {} \; 2>/dev/null || true)
if [ -n "$admin_routes" ]; then
    while IFS= read -r file; do
        # Skip index/registration files that just import routes
        if echo "$file" | grep -q "index\.ts$"; then
            continue
        fi
        if ! grep -q "roles.*admin\|authorize.*admin\|super_admin\|adminAuth" "$file" 2>/dev/null; then
            echo -e "${YELLOW}WARNING${NC}: ${file#$PROJECT_ROOT/}"
            echo "  Admin routes should check for admin role"
            WARNINGS=$((WARNINGS + 1))
        fi
    done <<< "$admin_routes"
fi

if [ $ERRORS -gt 0 ]; then
    echo ""
    echo -e "${RED}FAILED: Authorization check found $ERRORS error(s)${NC}"
    echo "Fix the errors above before proceeding."
    exit 1
fi

if [ $WARNINGS -gt 0 ]; then
    echo ""
    echo -e "${YELLOW}PASSED with warnings: $WARNINGS potential issue(s) found${NC}"
    echo "Review the warnings and ensure authorization is intentional."
    exit 0
fi

echo ""
echo -e "${GREEN}PASSED: All authorization checks passed${NC}"
exit 0
