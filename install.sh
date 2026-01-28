#!/bin/bash
# MoltBot Security Dashboard - Quick Installer
# An open-source security extension for molt.bot AI agents
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/moltbot/security-dashboard/main/install.sh | bash

set -e

INSTALL_DIR="${MOLTBOT_SECURITY_DIR:-$HOME/.moltbot-security}"
REPO_URL="https://github.com/jfr992/moltbot-security-dashboard"

echo ""
echo "  🦀 MoltBot Security Dashboard"
echo "  =============================="
echo "  Security monitoring for AI agents"
echo ""

# Check prerequisites
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is required."
    echo "   macOS: brew install python3"
    echo "   Linux: sudo apt install python3 python3-venv"
    exit 1
fi

echo "✓ Python $(python3 --version | cut -d' ' -f2)"

# Clone or update
if [ -d "$INSTALL_DIR" ]; then
    echo "📦 Updating existing installation..."
    cd "$INSTALL_DIR"
    git pull -q origin main 2>/dev/null || true
else
    echo "📦 Downloading..."
    git clone --depth 1 -q "$REPO_URL" "$INSTALL_DIR" 2>/dev/null || {
        # Fallback: download tarball
        echo "📦 Downloading archive..."
        mkdir -p "$INSTALL_DIR"
        curl -fsSL "$REPO_URL/archive/main.tar.gz" | tar -xz --strip-components=1 -C "$INSTALL_DIR"
    }
fi

# Setup Python environment
echo "🐍 Setting up environment..."
cd "$INSTALL_DIR/dashboard"

if [ ! -d "venv" ]; then
    python3 -m venv venv
fi

source venv/bin/activate
pip install -q --upgrade pip
pip install -q -r requirements.txt

# Create launcher
cat > "$INSTALL_DIR/start" << 'EOF'
#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR/dashboard"
source venv/bin/activate
echo "🦀 Starting MoltBot Security Dashboard..."
echo "   http://localhost:5050"
echo ""
exec python app.py "$@"
EOF
chmod +x "$INSTALL_DIR/start"

echo ""
echo "  ✅ Installed to: $INSTALL_DIR"
echo ""
echo "  Start the dashboard:"
echo "    $INSTALL_DIR/start"
echo ""
echo "  Or add to your shell config:"
echo "    alias moltbot-security='$INSTALL_DIR/start'"
echo ""
echo "  Dashboard: http://localhost:5050"
echo ""
