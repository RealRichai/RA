#!/bin/bash
# RealRiches Local Development Startup Script

set -e

echo "=========================================="
echo "  RealRiches Platform - Local Dev Start"
echo "=========================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check Docker
echo -e "${YELLOW}1. Checking Docker...${NC}"
if ! docker info > /dev/null 2>&1; then
    echo "   Docker is not running. Please start Docker Desktop."
    exit 1
fi
echo -e "   ${GREEN}Docker is running${NC}"

# Start Docker containers
echo -e "${YELLOW}2. Starting PostgreSQL & Redis...${NC}"
docker-compose up -d 2>/dev/null || docker compose up -d
sleep 2

# Check containers
if docker ps | grep -q realriches-postgres; then
    echo -e "   ${GREEN}PostgreSQL: Running on port 5432${NC}"
else
    echo "   PostgreSQL: Not running"
fi

if docker ps | grep -q realriches-redis; then
    echo -e "   ${GREEN}Redis: Running on port 6379${NC}"
else
    echo "   Redis: Not running"
fi

echo ""
echo -e "${YELLOW}3. Starting API server...${NC}"
echo "   API will be available at: http://localhost:4000"
echo "   API docs at: http://localhost:4000/docs"
pnpm --filter @realriches/api dev &
API_PID=$!
sleep 3

echo ""
echo -e "${YELLOW}4. Starting Web server...${NC}"
echo "   Web will be available at: http://localhost:3000"
pnpm --filter @realriches/web dev &
WEB_PID=$!

echo ""
echo "=========================================="
echo -e "  ${GREEN}All services starting...${NC}"
echo "=========================================="
echo ""
echo "  Web:  http://localhost:3000"
echo "  API:  http://localhost:4000"
echo "  Docs: http://localhost:4000/docs"
echo ""
echo "  Press Ctrl+C to stop all services"
echo ""

# Wait for both processes
wait $API_PID $WEB_PID
