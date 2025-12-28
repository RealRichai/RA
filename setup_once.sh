#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ⚙️  RealRiches - One-time Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "✗ Node.js not found. Install Node 20+ (Node 22 recommended)."
  exit 1
fi

echo "✓ Node: $(node -v)"

# pnpm via corepack
if command -v corepack >/dev/null 2>&1; then
  corepack enable >/dev/null 2>&1 || true
  corepack prepare pnpm@9.15.0 --activate >/dev/null 2>&1 || true
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "✗ pnpm not found. Install: npm i -g pnpm"
  exit 1
fi

echo "✓ pnpm: v$(pnpm --version)"
echo ""

# .env
if [[ ! -f ".env" ]]; then
  if [[ -f ".env.example" ]]; then
    cp .env.example .env
  else
    cat > .env <<'ENV'
NODE_ENV=development
PORT=3001
HOST=0.0.0.0
API_VERSION=v1
DATABASE_URL=postgresql://realriches:realriches_dev_password@localhost:5432/realriches?schema=public
REDIS_URL=redis://localhost:6379
JWT_SECRET=
JWT_REFRESH_SECRET=
ENV
  fi
  echo "✓ Created .env"
fi

# Fill JWT secrets if empty
gen_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  fi
}

if ! grep -q "^JWT_SECRET=.*[0-9a-f]" .env; then
  sed -i.bak "s/^JWT_SECRET=.*/JWT_SECRET=$(gen_secret)/" .env || true
  rm -f .env.bak
fi
if ! grep -q "^JWT_REFRESH_SECRET=.*[0-9a-f]" .env; then
  sed -i.bak "s/^JWT_REFRESH_SECRET=.*/JWT_REFRESH_SECRET=$(gen_secret)/" .env || true
  rm -f .env.bak
fi

echo "✓ Ensured JWT secrets"
echo ""

echo "[1/2] Installing dependencies (pnpm install)..."
pnpm install

echo ""
echo "[2/2] Generating Prisma client..."
pushd apps/api >/dev/null
pnpm exec prisma generate
popd >/dev/null

echo ""
echo "✅ Setup complete."
echo "Next: ./run_local.sh"
