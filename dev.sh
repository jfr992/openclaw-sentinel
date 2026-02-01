#!/bin/bash
# MoltBot Guardian - Development Commands
# Usage: ./dev.sh [command]

set -e
cd "$(dirname "$0")"

case "${1:-help}" in
  setup)
    echo "📦 Installing dependencies..."
    cd dashboard && python3 -m venv venv && source venv/bin/activate && pip install -q -r requirements.txt
    cd ../dashboard-ui && npm ci --silent
    echo "📦 Installing pre-commit hooks..."
    pip install -q pre-commit && pre-commit install
    echo "✅ Ready! Run: ./dev.sh start"
    ;;

  start)
    echo "🦀 Starting dev server..."
    cd dashboard && source venv/bin/activate && python app.py
    ;;

  build)
    echo "📦 Building frontend..."
    cd dashboard-ui && npm run build
    ;;

  lint)
    echo "🔍 Running pre-commit hooks..."
    pre-commit run --all-files
    ;;

  test)
    echo "🧪 Running tests..."
    cd dashboard && source venv/bin/activate && python -m pytest -v
    ;;

  docker)
    echo "🐳 Building & running Docker..."
    docker compose build && docker compose up
    ;;

  clean)
    echo "🧹 Cleaning..."
    rm -rf dashboard/venv dashboard-ui/node_modules dashboard/__pycache__
    docker compose down --rmi local 2>/dev/null || true
    ;;

  *)
    echo "MoltBot Guardian Dev"
    echo ""
    echo "Commands:"
    echo "  setup   Install deps + pre-commit hooks"
    echo "  start   Run dev server (localhost:5050)"
    echo "  build   Build frontend"
    echo "  lint    Run pre-commit checks"
    echo "  test    Run Python tests"
    echo "  docker  Build & run in Docker"
    echo "  clean   Remove build artifacts"
    ;;
esac
