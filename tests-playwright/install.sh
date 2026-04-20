#!/usr/bin/env bash
# First-run installer for the LG Pilates Playwright test suite.
#
# Usage (from inside the tests-playwright folder):
#   chmod +x install.sh
#   ./install.sh

set -e  # exit on any error

echo "=== LG Pilates Playwright — First-run installer ==="
echo ""

# 1. Node check
if ! command -v node &> /dev/null; then
  echo "❌ Node.js not found. Install from https://nodejs.org (LTS) first."
  exit 1
fi
echo "✅ Node.js $(node -v) detected"

# 2. npm install
echo ""
echo "▶️  Installing npm packages (Playwright, Supabase client, dotenv)..."
npm install

# 3. Playwright browser install
echo ""
echo "▶️  Installing Chromium browser for Playwright..."
npx playwright install chromium

# 4. Set up .env.test from example if it doesn't exist yet
if [ ! -f .env.test ]; then
  echo ""
  echo "▶️  Creating .env.test from template..."
  cp .env.test.example .env.test
  echo ""
  echo "⚠️  OPEN .env.test IN A TEXT EDITOR AND PASTE THE TEST ANON KEY"
  echo "    where it says 'paste-anon-key-here'."
  echo "    Do NOT use the production key — the safety check will refuse to run."
else
  echo ""
  echo "✅ .env.test already exists (not overwriting)"
fi

echo ""
echo "=== Done ==="
echo ""
echo "Next steps:"
echo "  1. Check .env.test has a real TEST anon key"
echo "  2. Run:  npm test"
echo ""
