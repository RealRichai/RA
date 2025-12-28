#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🚀 RealRiches - Start Local Development"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if ! command -v docker >/dev/null 2>&1; then
  echo "✗ Docker not found. Install Docker Desktop:"
  echo "  https://www.docker.com/products/docker-desktop"
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "✗ Docker Desktop is not running."
  echo "  Open Docker Desktop and wait until it finishes starting."
  exit 1
fi

echo "[1/3] Starting databases (Postgres + Redis) with Docker..."
docker compose up -d postgres redis

echo "[2/3] Waiting for Postgres..."
for i in {1..30}; do
  if docker exec realriches-postgres pg_isready -U realriches >/dev/null 2>&1; then
    echo "✓ Postgres is ready"
    break
  fi
  sleep 1
  if [[ "$i" == "30" ]]; then
    echo "⚠ Postgres still not ready. You can check logs: docker logs realriches-postgres"
  fi
done

echo "[3/3] Starting API + Web (pnpm dev)..."
echo ""
echo "Web: http://localhost:3000"
echo "API: http://localhost:3001"
echo ""
pnpm dev
