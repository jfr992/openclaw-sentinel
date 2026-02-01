#!/bin/bash
# MoltBot Security Check - Run locally before commits
# Usage: ./scripts/security-check.sh

set -e

echo "🔒 MoltBot Security Check"
echo "========================="
echo ""

cd "$(dirname "$0")/.."

# Activate venv if available
if [ -f "dashboard/venv/bin/activate" ]; then
    source dashboard/venv/bin/activate
fi

# Check if tools are installed
check_tool() {
    if ! command -v "$1" &> /dev/null; then
        echo "⚠️  $1 not found. Install with: $2"
        return 1
    fi
    return 0
}

MISSING=0

# Python security scan with Bandit
echo "📦 Checking Python code with Bandit..."
if check_tool bandit "pip install bandit"; then
    bandit -r dashboard/ -ll -ii --exclude "*/venv/*,*/test_*" 2>/dev/null || {
        echo "⚠️  Bandit found issues (see above)"
        MISSING=1
    }
    echo "✓ Bandit complete"
else
    MISSING=1
fi

echo ""

# Python dependency audit
echo "📦 Checking Python dependencies..."
if check_tool pip-audit "pip install pip-audit"; then
    cd dashboard
    pip-audit -r requirements.txt 2>/dev/null || {
        echo "⚠️  Vulnerable dependencies found"
        MISSING=1
    }
    cd ..
    echo "✓ pip-audit complete"
else
    MISSING=1
fi

echo ""

# npm audit
echo "📦 Checking npm dependencies..."
if [ -d "dashboard-ui/node_modules" ]; then
    cd dashboard-ui
    npm audit --audit-level=high 2>/dev/null || {
        echo "⚠️  npm vulnerabilities found (run: npm audit fix)"
        MISSING=1
    }
    cd ..
    echo "✓ npm audit complete"
else
    echo "⚠️  node_modules not found. Run: cd dashboard-ui && npm install"
fi

echo ""

# Secrets detection
echo "🔑 Checking for secrets..."
if check_tool detect-secrets "pip install detect-secrets"; then
    detect-secrets scan --exclude-files "venv/|node_modules/|package-lock.json" . 2>/dev/null | \
        python3 -c "import sys,json; d=json.load(sys.stdin); secrets=d.get('results',{}); print(f'Found {sum(len(v) for v in secrets.values())} potential secrets') if secrets else print('✓ No secrets found')"
else
    MISSING=1
fi

echo ""
echo "========================="
if [ $MISSING -eq 0 ]; then
    echo "✅ All security checks passed!"
else
    echo "⚠️  Some checks had issues (see above)"
    exit 1
fi
