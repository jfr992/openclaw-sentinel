#!/bin/bash
# MoltBot Security Dashboard - Uninstaller

INSTALL_DIR="${MOLTBOT_SECURITY_DIR:-$HOME/.moltbot-security}"

echo ""
echo "  🦀 MoltBot Security Uninstaller"
echo "  ================================"
echo ""

if [ ! -d "$INSTALL_DIR" ]; then
    echo "  Not installed at: $INSTALL_DIR"
    exit 0
fi

echo "  Found: $INSTALL_DIR"
echo ""
read -p "  Remove MoltBot Security Dashboard? [y/N] " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    rm -rf "$INSTALL_DIR"
    echo ""
    echo "  ✅ Removed."
    echo ""
    echo "  Note: Clawdbot data (~/.clawdbot) was preserved."
else
    echo "  Cancelled."
fi
