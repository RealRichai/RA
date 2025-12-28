#!/usr/bin/env bash
set -uo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

CHECK="✓"
CROSS="✗"
WARN="⚠"

ISSUES_FOUND=0
check_pass() { echo -e "  ${GREEN}${CHECK}${NC} $1"; }
check_fail() { echo -e "  ${RED}${CROSS}${NC} $1"; ISSUES_FOUND=$((ISSUES_FOUND + 1)); }
check_warn() { echo -e "  ${YELLOW}${WARN}${NC} $1"; }
fix_hint() { echo -e "      ${BLUE}→ Fix:${NC} $1"; }
section() { echo ""; echo -e "${CYAN}▸ $1${NC}"; }

echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  🩺 RealRiches - System Doctor${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

section "Node.js"
if command -v node &>/dev/null; then
  check_pass "Node.js $(node -v)"
else
  check_fail "Node.js not installed"
  fix_hint "Install Node 20+ (Node 22 recommended)"
fi

section "pnpm"
if command -v pnpm &>/dev/null; then
  check_pass "pnpm v$(pnpm --version)"
else
  check_fail "pnpm not installed"
  fix_hint "npm i -g pnpm"
fi

section "Docker"
if ! command -v docker &>/dev/null; then
  check_fail "Docker not installed"
  fix_hint "Install Docker Desktop: https://www.docker.com/products/docker-desktop"
else
  check_pass "Docker CLI available"
  if docker info &>/dev/null; then
    check_pass "Docker Desktop is running"
  else
    check_fail "Docker Desktop is NOT running"
    fix_hint "Open Docker Desktop"
  fi
fi

section "Environment"
if [[ -f ".env" ]]; then
  check_pass ".env exists"
else
  check_fail ".env missing"
  fix_hint "Run: ./setup_once.sh"
fi

section "Prisma"
if [[ -f "apps/api/prisma/schema.prisma" ]]; then
  check_pass "Prisma schema found"
  if [[ -d "node_modules/@prisma/client" ]] || [[ -d "node_modules/.pnpm" ]]; then
    check_warn "Prisma client generation depends on install state"
    fix_hint "Run: (cd apps/api && pnpm exec prisma generate)"
  else
    check_warn "node_modules not found"
    fix_hint "Run: pnpm install"
  fi
else
  check_fail "Prisma schema not found"
fi

echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
if [[ "$ISSUES_FOUND" -gt 0 ]]; then
  echo -e "  ${YELLOW}${WARN}${NC} Found ${ISSUES_FOUND} issue(s)."
  echo ""
  echo "  Quick fixes:"
  echo "    1. ./setup_once.sh"
  echo "    2. ./run_local.sh"
else
  echo -e "  ${GREEN}${CHECK}${NC} All checks passed."
fi
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
