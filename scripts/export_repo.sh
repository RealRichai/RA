#!/usr/bin/env bash
#
# Export Repository
#
# Creates a clean zip archive of the repository excluding build artifacts,
# dependencies, and sensitive files.
#
# Usage:
#   ./scripts/export_repo.sh [output_path]
#
# Default output: ~/Desktop/realriches_export.zip
#

set -euo pipefail

# Default output path
OUTPUT="${1:-$HOME/Desktop/realriches_export.zip}"

# Get repo root (directory containing this script's parent)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

echo "Exporting repository..."
echo "Source: $REPO_ROOT"
echo "Output: $OUTPUT"
echo ""

# Remove existing file if present
if [ -f "$OUTPUT" ]; then
  rm "$OUTPUT"
  echo "Removed existing: $OUTPUT"
fi

# Create zip excluding build artifacts and sensitive files
cd "$REPO_ROOT"

zip -r "$OUTPUT" . \
  -x "*.git/*" \
  -x "*node_modules/*" \
  -x "*.next/*" \
  -x "*dist/*" \
  -x "*.turbo/*" \
  -x "*coverage/*" \
  -x "*.env" \
  -x "*.env.*" \
  -x "*.env.local" \
  -x "*.env.*.local" \
  -x "*.pnpm-store/*" \
  -x "*.DS_Store" \
  -x "*__pycache__/*" \
  -x "*.pyc" \
  -x "*.log" \
  -x "*tmp/*" \
  -x "*temp/*" \
  > /dev/null

# Get file size
SIZE=$(ls -lh "$OUTPUT" | awk '{print $5}')

echo ""
echo "=========================================="
echo "Export complete!"
echo "=========================================="
echo "File: $OUTPUT"
echo "Size: $SIZE"
echo ""
echo "Excluded:"
echo "  - node_modules/, .git/"
echo "  - .next/, dist/, .turbo/, coverage/"
echo "  - .env, .env.*, .env.local"
echo "  - .pnpm-store/, logs, temp files"
