#!/usr/bin/env bash
#
# Export Repository Safely
#
# Creates a clean zip archive of the repository excluding:
# - Build artifacts (.next, dist, .turbo, coverage, *.tsbuildinfo)
# - Dependencies (node_modules, .pnpm-store)
# - Secrets (.env, .env.*, .env.local, .env.*.local)
# - VCS (.git)
#
# Usage:
#   ./scripts/export_repo.sh [output_path]
#
# Default output: ~/Desktop/realriches_YYYYMMDD_HHMMSS.zip
#
# Exit codes:
#   0 - Success
#   1 - Validation failed (secrets detected in archive)
#   2 - Zip creation failed
#

set -euo pipefail

# Colors for output (works on macOS and Linux)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default output path with timestamp
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DEFAULT_OUTPUT="$HOME/Desktop/realriches_${TIMESTAMP}.zip"
OUTPUT="${1:-$DEFAULT_OUTPUT}"

# Get repo root (directory containing this script's parent)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

echo -e "${BLUE}=========================================="
echo "  RealRiches Repository Export"
echo -e "==========================================${NC}"
echo ""
echo -e "Source: ${YELLOW}$REPO_ROOT${NC}"
echo -e "Output: ${YELLOW}$OUTPUT${NC}"
echo ""

# Define exclusion patterns
# Note: zip requires patterns without leading ./ and uses shell glob syntax
EXCLUDE_PATTERNS=(
    # Version control
    ".git/*"
    "*/.git/*"

    # Dependencies (directory and contents)
    "node_modules/*"
    "*/node_modules/*"
    ".pnpm-store/*"
    "*/.pnpm-store/*"

    # Build artifacts (directory and contents)
    ".next/*"
    "*/.next/*"
    "dist/*"
    "*/dist/*"
    ".turbo/*"
    "*/.turbo/*"
    "coverage/*"
    "*/coverage/*"
    "*.tsbuildinfo"
    "*/*.tsbuildinfo"

    # Environment files (secrets) - multiple patterns for thorough coverage
    ".env"
    ".env.local"
    ".env.development"
    ".env.production"
    ".env.test"
    ".env.staging"
    ".env.development.local"
    ".env.production.local"
    ".env.test.local"
    ".env.staging.local"
    "*/.env"
    "*/.env.local"
    "*/.env.*"

    # OS files
    ".DS_Store"
    "*/.DS_Store"
    "Thumbs.db"
    "*/Thumbs.db"

    # Python artifacts
    "__pycache__/*"
    "*/__pycache__/*"
    "*.pyc"
    "*/*.pyc"

    # Logs
    "*.log"
    "*/*.log"
    "logs/*"
    "*/logs/*"

    # Temporary files
    "tmp/*"
    "*/tmp/*"
    "temp/*"
    "*/temp/*"
    "*.tmp"
    "*/*.tmp"
)

# Print excluded patterns
echo -e "${YELLOW}Excluded patterns:${NC}"
echo "  Build:    .next/, dist/, .turbo/, coverage/, *.tsbuildinfo"
echo "  Deps:     node_modules/, .pnpm-store/"
echo "  Secrets:  .env, .env.*, .env.local, .env.*.local"
echo "  VCS:      .git/"
echo "  Other:    logs, tmp, __pycache__, .DS_Store"
echo ""

# Remove existing file if present
if [ -f "$OUTPUT" ]; then
    rm "$OUTPUT"
    echo -e "${YELLOW}Removed existing:${NC} $OUTPUT"
fi

# Build zip exclusion arguments
EXCLUDE_ARGS=()
for pattern in "${EXCLUDE_PATTERNS[@]}"; do
    EXCLUDE_ARGS+=("-x" "$pattern")
done

# Create zip
echo -e "${BLUE}Creating archive...${NC}"
cd "$REPO_ROOT"

if ! zip -r "$OUTPUT" . "${EXCLUDE_ARGS[@]}" > /dev/null 2>&1; then
    echo -e "${RED}ERROR: Failed to create zip archive${NC}"
    exit 2
fi

# Get file size (works on both macOS and Linux)
if [[ "$OSTYPE" == "darwin"* ]]; then
    SIZE=$(stat -f%z "$OUTPUT" | awk '{printf "%.1f MB", $1/1024/1024}')
else
    SIZE=$(stat --printf="%s" "$OUTPUT" | awk '{printf "%.1f MB", $1/1024/1024}')
fi

# Count files in archive
FILE_COUNT=$(unzip -l "$OUTPUT" 2>/dev/null | tail -1 | awk '{print $2}')

echo ""
echo -e "${BLUE}=========================================="
echo "  Validation"
echo -e "==========================================${NC}"

# Validation: Check for .env files in the archive (excluding .env.example)
echo -e "${YELLOW}Checking for secrets in archive...${NC}"

# Match .env files but exclude .env.example and .env.*.example
ENV_FILES=$(unzip -l "$OUTPUT" 2>/dev/null | awk '{print $4}' | grep -E "\.env($|\.)" | grep -v "\.example$" || true)

if [ -n "$ENV_FILES" ]; then
    echo ""
    echo -e "${RED}=========================================="
    echo "  VALIDATION FAILED - SECRETS DETECTED!"
    echo -e "==========================================${NC}"
    echo ""
    echo -e "${RED}The following .env files were found in the archive:${NC}"
    echo "$ENV_FILES" | while read -r file; do
        echo -e "  ${RED}✗${NC} $file"
    done
    echo ""
    echo -e "${RED}Archive has been deleted for safety.${NC}"
    rm -f "$OUTPUT"
    exit 1
fi

echo -e "  ${GREEN}✓${NC} No .env files detected"

# Additional check for common secret patterns in filenames
SUSPECT_FILES=$(unzip -l "$OUTPUT" 2>/dev/null | grep -iE "(secret|credential|\.pem$|\.key$|id_rsa)" | awk '{print $4}' || true)

if [ -n "$SUSPECT_FILES" ]; then
    echo -e "  ${YELLOW}⚠${NC} Potential sensitive files detected (review recommended):"
    echo "$SUSPECT_FILES" | while read -r file; do
        echo -e "      $file"
    done
fi

echo ""
echo -e "${GREEN}=========================================="
echo "  Export Complete!"
echo -e "==========================================${NC}"
echo ""
echo -e "  File:   ${GREEN}$OUTPUT${NC}"
echo -e "  Size:   ${GREEN}$SIZE${NC}"
echo -e "  Files:  ${GREEN}$FILE_COUNT${NC}"
echo ""
echo -e "${GREEN}✓ Archive is safe to share${NC}"
echo ""
