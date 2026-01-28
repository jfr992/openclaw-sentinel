#!/bin/bash
# MoltBot Security Dashboard - Quick Setup

set -e

echo "🦀 MoltBot Security Dashboard Setup"
echo "===================================="

# Check prerequisites
command -v python3 >/dev/null 2>&1 || { echo "❌ Python 3 required. Install with: brew install python3"; exit 1; }

# Setup Python environment
echo "📦 Setting up Python environment..."
cd "$(dirname "$0")/dashboard"

if [ ! -d "venv" ]; then
    python3 -m venv venv
fi

source venv/bin/activate
pip install -q -r requirements.txt

echo "✅ Python environment ready"

# Check if Node.js is available for development
if command -v node >/dev/null 2>&1; then
    echo "📦 Node.js found - setting up React frontend..."
    cd ../dashboard-ui
    npm install --silent
    npm run build --silent
    echo "✅ React frontend built"
else
    echo "ℹ️  Node.js not found - using pre-built frontend"
fi

cd ..

echo ""
echo "===================================="
echo "✅ Setup complete!"
echo ""
echo "To start the dashboard:"
echo "  cd dashboard"
echo "  source venv/bin/activate"
echo "  python app.py"
echo ""
echo "Then open: http://localhost:5050"
echo "===================================="
