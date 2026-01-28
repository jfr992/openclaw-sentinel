#!/bin/bash
# Start MoltBot Security Dashboard

cd "$(dirname "$0")/dashboard"
source venv/bin/activate

echo "🦀 Starting MoltBot Security Dashboard..."
echo "   Open: http://localhost:5050"
echo "   Press Ctrl+C to stop"
echo ""

python app.py
