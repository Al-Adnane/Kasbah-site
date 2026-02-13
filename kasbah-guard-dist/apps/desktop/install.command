#!/bin/bash
# Kasbah Guard Installer
# Double-click this file to install and fix macOS Gatekeeper automatically.

clear
echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║        Kasbah Guard Installer        ║"
echo "  ╚══════════════════════════════════════╝"
echo ""

APP_NAME="KasbahGuard.app"
APP_SRC="$(dirname "$0")/$APP_NAME"
APP_DEST="/Applications/$APP_NAME"

# Check if app exists in same directory
if [ ! -d "$APP_SRC" ]; then
    echo "  Looking for KasbahGuard.app..."
    # Try DMG mount points
    APP_SRC=$(find /Volumes -name "$APP_NAME" -maxdepth 2 2>/dev/null | head -1)
    if [ -z "$APP_SRC" ] || [ ! -d "$APP_SRC" ]; then
        echo "  ✗ Could not find KasbahGuard.app"
        echo "  Please run this from the DMG or same folder as the app."
        echo ""
        read -p "  Press Enter to close..."
        exit 1
    fi
fi

echo "  Found: $APP_SRC"
echo ""

# Copy to Applications
echo "  → Copying to /Applications..."
if [ -d "$APP_DEST" ]; then
    rm -rf "$APP_DEST"
fi
cp -R "$APP_SRC" "$APP_DEST" 2>/dev/null

if [ $? -ne 0 ]; then
    echo "  ✗ Copy failed. Trying with sudo..."
    sudo cp -R "$APP_SRC" "$APP_DEST"
fi

# Fix Gatekeeper
echo "  → Clearing Gatekeeper quarantine..."
xattr -cr "$APP_DEST" 2>/dev/null
if [ $? -ne 0 ]; then
    sudo xattr -cr "$APP_DEST" 2>/dev/null
fi

echo ""
echo "  ✓ Kasbah Guard installed successfully!"
echo "  ✓ Gatekeeper quarantine cleared"
echo ""

# Launch the app
echo "  → Launching Kasbah Guard..."
open "$APP_DEST"

echo ""
echo "  Done! You can close this window."
echo ""
