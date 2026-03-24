#!/bin/bash
# Pre-deploy build validation script for AppForge
# Run after `npm run build` and before deploying to gh-pages.
# Exits with code 1 on any failure.

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

FAIL=0

check() {
  local desc="$1"
  local result="$2"
  if [ "$result" -gt 0 ]; then
    echo -e "  ${GREEN}✓${NC} $desc"
  else
    echo -e "  ${RED}✗${NC} $desc"
    FAIL=1
  fi
}

echo "=== AppForge Build Validation ==="
echo ""

# 1. Check dist/ exists and has index.html
echo "1. Build output:"
if [ -f dist/index.html ]; then
  SIZE=$(wc -c < dist/index.html)
  check "dist/index.html exists (${SIZE} bytes)" 1
  if [ "$SIZE" -lt 10000 ]; then
    echo -e "  ${RED}✗${NC} index.html seems too small (< 10KB)"
    FAIL=1
  else
    check "index.html size is reasonable (> 10KB)" 1
  fi
else
  echo -e "  ${RED}✗${NC} dist/index.html missing — did you run 'npm run build'?"
  exit 1
fi

# 2. Check critical assets
echo ""
echo "2. Required assets:"
for asset in manifest.webmanifest sw.js registerSW.js icon-192.png icon-512.png apple-touch-icon.png favicon.svg; do
  if [ -f "dist/$asset" ]; then
    check "$asset present" 1
  else
    check "$asset present" 0
  fi
done

# 3. Critical code patterns in the built bundle
echo ""
echo "3. Critical code patterns in bundle:"

# stripJsonFences regex — the key fix for Anthropic's markdown-fenced JSON
FENCE_COUNT=$(grep -co '```(?:json)?' dist/index.html || true)
check "stripJsonFences regex present (found $FENCE_COUNT occurrences, need >=2)" "$([ "$FENCE_COUNT" -ge 2 ] && echo 1 || echo 0)"

# App name input
NAME_COUNT=$(grep -co 'App name' dist/index.html || true)
check "App name input placeholder present (found $NAME_COUNT)" "$([ "$NAME_COUNT" -ge 1 ] && echo 1 || echo 0)"

# Anthropic API URL
API_COUNT=$(grep -co 'api.anthropic.com' dist/index.html || true)
check "Anthropic API URL present (found $API_COUNT)" "$([ "$API_COUNT" -ge 1 ] && echo 1 || echo 0)"

# Service worker registration
SW_COUNT=$(grep -co 'registerSW' dist/index.html || true)
check "Service worker registration present" "$([ "$SW_COUNT" -ge 1 ] && echo 1 || echo 0)"

# 4. Manifest validation
echo ""
echo "4. Manifest validation:"
if [ -f dist/manifest.webmanifest ]; then
  # Check for relative paths (critical for GitHub Pages subpath)
  if grep -q '"\./' dist/manifest.webmanifest; then
    check "Manifest uses relative paths (./)" 1
  else
    check "Manifest uses relative paths (./) — REQUIRED for GitHub Pages subpath" 0
  fi

  # Check icons
  ICON_COUNT=$(grep -o '"src"' dist/manifest.webmanifest | wc -l || true)
  check "Manifest has icon entries (found $ICON_COUNT, need >=2)" "$([ "$ICON_COUNT" -ge 2 ] && echo 1 || echo 0)"
fi

# 5. Test pages
echo ""
echo "5. Test pages:"
if [ -f dist/sanity.html ]; then
  check "sanity.html present" 1
else
  check "sanity.html present (optional but recommended)" 0
fi
if [ -f dist/e2e-test.html ]; then
  check "e2e-test.html present" 1
else
  check "e2e-test.html present (optional but recommended)" 0
fi
if [ -f dist/e2e-flow-test.html ]; then
  check "e2e-flow-test.html present" 1
else
  check "e2e-flow-test.html present (optional but recommended)" 0
fi

# Summary
echo ""
if [ "$FAIL" -eq 0 ]; then
  echo -e "${GREEN}=== All checks passed! Safe to deploy. ===${NC}"
  exit 0
else
  echo -e "${RED}=== VALIDATION FAILED — do NOT deploy. Fix issues above. ===${NC}"
  exit 1
fi
