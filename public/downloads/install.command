#!/bin/bash
# Kasbah Guard Installer
# Double-click this file to install. It will ask for your password once.

clear
echo ""
echo "  ╔═══════════════════════════════════╗"
echo "  ║       Kasbah Guard Installer      ║"
echo "  ╚═══════════════════════════════════╝"
echo ""

DMG_PATH="$(dirname "$0")/KasbahGuard-macOS.dmg"

if [ ! -f "$DMG_PATH" ]; then
    echo "  Looking for DMG in Downloads..."
    DMG_PATH="$HOME/Downloads/KasbahGuard-macOS.dmg"
fi

if [ ! -f "$DMG_PATH" ]; then
    echo "  ✗ Cannot find KasbahGuard-macOS.dmg"
    echo "  Please download it first and put it in your Downloads folder."
    echo ""
    read -p "  Press Enter to exit..."
    exit 1
fi

echo "  Found: $DMG_PATH"
echo ""

# Mount DMG
echo "  Mounting DMG..."
MOUNT_DIR=$(hdiutil attach "$DMG_PATH" -nobrowse 2>/dev/null | grep "/Volumes/" | awk '{print $3}')

if [ -z "$MOUNT_DIR" ]; then
    # Try with full path parsing
    MOUNT_DIR=$(hdiutil attach "$DMG_PATH" -nobrowse 2>/dev/null | tail -1 | sed 's/.*\(\/Volumes\/.*\)/\1/')
fi

if [ ! -d "$MOUNT_DIR" ]; then
    MOUNT_DIR="/Volumes/KasbahGuard"
fi

if [ ! -d "$MOUNT_DIR/KasbahGuard.app" ]; then
    echo "  ✗ Could not mount DMG properly."
    read -p "  Press Enter to exit..."
    exit 1
fi

echo "  ✓ Mounted"

# Copy to Applications
echo "  Copying to /Applications..."
rm -rf /Applications/KasbahGuard.app 2>/dev/null
cp -R "$MOUNT_DIR/KasbahGuard.app" /Applications/

echo "  ✓ Copied"

# Unmount
hdiutil detach "$MOUNT_DIR" -quiet 2>/dev/null

# Fix Gatekeeper
echo "  Fixing Gatekeeper..."
xattr -cr /Applications/KasbahGuard.app 2>/dev/null

echo "  ✓ Gatekeeper cleared"

# Launch
echo ""
echo "  Launching Kasbah Guard..."
open /Applications/KasbahGuard.app

echo ""
echo "  ╔═══════════════════════════════════╗"
echo "  ║          ✓ Installed!             ║"
echo "  ║                                   ║"
echo "  ║  Kasbah Guard is now running.     ║"
echo "  ║  Install the browser extension    ║"
echo "  ║  from inside the app.             ║"
echo "  ╚═══════════════════════════════════╝"
echo ""
read -p "  Press Enter to close..."
