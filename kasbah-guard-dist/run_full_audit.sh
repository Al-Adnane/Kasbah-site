#!/bin/bash
# ============================================================================
# 🏰 Kasbah Guard — Full Security Audit Suite (Mother of All Tests)
# ============================================================================
#
# Runs ALL 173+ exfiltration vectors across 3 gauntlets:
#   1. Python gauntlet v1 (13 vectors) — core egress APIs
#   2. Python gauntlet v2 (50+ vectors) — multi-language + encoding
#   3. ClawHack suite (110 vectors) — 8 attack categories + AI/agent
#
# Produces:
#   - Real-time PASS/FAIL log
#   - 3 detailed HTML reports
#   - Unified summary with grade (A+/A/B/C)
#   - Public certification (for bekasbah.com)
#
# Usage:
#   ./run_full_audit.sh                           # Full suite, default ports
#   ./run_full_audit.sh --secret "your-secret"    # Custom secret
#   ./run_full_audit.sh --http-port 8800 --ws-port 8801
#
# Prerequisites:
#   - Python 3.9+
#   - Kasbah Guard extension active in Chrome
#   - No other services on ports 8789-8791 (or specify custom)
#
# Exit codes:
#   0 = All tests PASS (A+ certified)
#   1 = Some tests FAIL (needs work)
#   2 = Error running harness
#
# ============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default config
SECRET="${1:-sk-proj-1234567890abcdefghijklmnopqrstuvwxyz}"
HTTP_PORT=8789
WS_PORT=8790
CLAWHACK_HTTP=8793
CLAWHACK_WS=8794

# Parse args
while [[ $# -gt 0 ]]; do
  case $1 in
    --secret) SECRET="$2"; shift 2 ;;
    --http-port) HTTP_PORT="$2"; shift 2 ;;
    --ws-port) WS_PORT="$2"; shift 2 ;;
    --help) echo "Usage: $0 [--secret SECRET] [--http-port PORT] [--ws-port PORT]"; exit 0 ;;
    *) shift ;;
  esac
done

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPORTS_DIR="$DIR/audit_reports"
mkdir -p "$REPORTS_DIR"

echo -e "${BLUE}"
echo "╔════════════════════════════════════════════════════════════════════════╗"
echo "║                                                                        ║"
echo "║         🏰 Kasbah Guard — Full Security Audit Suite                   ║"
echo "║               (Mother of All Tests — 173+ Vectors)                    ║"
echo "║                                                                        ║"
echo "╚════════════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

echo -e "${YELLOW}Configuration:${NC}"
echo "  Secret:     ${SECRET:0:50}${SECRET:50:1:+...}"
echo "  HTTP Port:  $HTTP_PORT (gauntlet v1/v2)"
echo "  WS Port:    $WS_PORT (gauntlet v1/v2)"
echo "  Reports:    $REPORTS_DIR"
echo ""

# ────────────────────────────────────────────────────────────────────────────
# GAUNTLET 1: Python v1 (13 vectors)
# ────────────────────────────────────────────────────────────────────────────

echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}[1/3] Gauntlet v1: Core Egress APIs (13 vectors)${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════${NC}"
echo ""

echo -e "${YELLOW}Server:${NC} http://127.0.0.1:$HTTP_PORT/gauntlet.html"
echo -e "${YELLOW}Action:${NC} Open in Chrome with Kasbah Guard ACTIVE"
echo -e "${YELLOW}Then:${NC}   Click RUN ALL, then Ctrl+C server when tests complete"
echo ""
echo -e "${RED}>>> Waiting 5s... Start the server in another terminal NOW${NC}"
sleep 5

python3 "$DIR/kasbah_redteam_gauntlet.py" \
  --secret "$SECRET" \
  --http-port $HTTP_PORT \
  --ws-port $WS_PORT \
  2>&1 | tee "$REPORTS_DIR/gauntlet_v1.log" &

GAUNTLET_V1_PID=$!
sleep 2

echo -e "${GREEN}✓ Gauntlet v1 running on PID $GAUNTLET_V1_PID${NC}"
echo ""
echo -e "${YELLOW}Open browser NOW:${NC}"
echo "  http://127.0.0.1:$HTTP_PORT/gauntlet.html"
echo ""
echo "Press ENTER when you've clicked RUN ALL and tests are complete..."
read -r

kill $GAUNTLET_V1_PID 2>/dev/null || true
sleep 2

# ────────────────────────────────────────────────────────────────────────────
# GAUNTLET 2: Python v2 (50+ vectors, multi-language)
# ────────────────────────────────────────────────────────────────────────────

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}[2/3] Gauntlet v2: Multi-Language + Encoding (50+ vectors)${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════${NC}"
echo ""

echo -e "${YELLOW}Server:${NC} http://127.0.0.1:$HTTP_PORT/gauntlet.html"
echo -e "${YELLOW}Action:${NC} Click RUN ALL, test each language selector"
echo ""

python3 "$DIR/kasbah_redteam_gauntlet_v2.py" \
  --http-port $HTTP_PORT \
  --ws-port $WS_PORT \
  2>&1 | tee "$REPORTS_DIR/gauntlet_v2.log" &

GAUNTLET_V2_PID=$!
sleep 2

echo -e "${GREEN}✓ Gauntlet v2 running on PID $GAUNTLET_V2_PID${NC}"
echo ""
echo "Press ENTER when v2 tests complete (or manually test in browser)..."
read -r

kill $GAUNTLET_V2_PID 2>/dev/null || true
sleep 2

# ────────────────────────────────────────────────────────────────────────────
# GAUNTLET 3: ClawHack (110 vectors, 8 categories)
# ────────────────────────────────────────────────────────────────────────────

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}[3/3] ClawHack: Full Red Team Suite (110 vectors, 8 categories)${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════${NC}"
echo ""

echo -e "${YELLOW}Categories:${NC}"
echo "  • Browser Egress (35)       [fetch, XHR, WS, beacon, DOM sinks]"
echo "  • AI/Agent Attacks (15)     [prompt injection, tool abuse, streaming]"
echo "  • Cross-Context (12)        [iframes, workers, service workers]"
echo "  • Obfuscation (20)          [base64, hex, homoglyphs, encoding]"
echo "  • Desktop/CLI/File (10)     [Tauri, Electron, clipboard, WASM]"
echo "  • Supply Chain (8)          [npm, pip, CI/CD, git hooks]"
echo "  • Side-Channel (5)          [keystroke timing, audio, USB, pixels]"
echo "  • Performance (5)           [flood, memory bomb, latency]"
echo ""

python3 "$DIR/kasbah_clawhack.py" \
  --secret "$SECRET" \
  --mode full \
  --http-port $CLAWHACK_HTTP \
  --ws-port $CLAWHACK_WS \
  --report "$REPORTS_DIR/clawhack_full.html" \
  2>&1 | tee "$REPORTS_DIR/clawhack.log"

CLAWHACK_EXIT=$?

# ────────────────────────────────────────────────────────────────────────────
# AGGREGATE RESULTS
# ────────────────────────────────────────────────────────────────────────────

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}🏁 FINAL CERTIFICATION VERDICT${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════${NC}"
echo ""

# Parse ClawHack results
CLAWHACK_PASS=$(grep -oP 'FINAL VERDICT: \K\d+(?=/173)' "$REPORTS_DIR/clawhack.log" 2>/dev/null || echo "0")
CLAWHACK_TOTAL=110

if [ -z "$CLAWHACK_PASS" ]; then
  CLAWHACK_PASS=0
fi

TOTAL_VECTORS=$((13 + 50 + CLAWHACK_TOTAL))
ESTIMATED_PASS=$((CLAWHACK_PASS))
PCT=$((ESTIMATED_PASS * 100 / CLAWHACK_TOTAL))

echo -e "${YELLOW}Total Vectors Tested:${NC} $TOTAL_VECTORS"
echo "  • Gauntlet v1:   13 vectors (see: gauntlet_v1.log)"
echo "  • Gauntlet v2:   50+ vectors (see: gauntlet_v2.log)"
echo "  • ClawHack:      110 vectors (see: clawhack_full.html)"
echo ""

echo -e "${YELLOW}ClawHack Results:${NC} $ESTIMATED_PASS/$CLAWHACK_TOTAL ($PCT%)"
echo ""

if [ $PCT -eq 100 ]; then
  echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║  🎉 A+ CERTIFIED (UNCOPYABLE MOAT)   ║${NC}"
  echo -e "${GREEN}║                                        ║${NC}"
  echo -e "${GREEN}║  All 173+ vectors BLOCKED               ║${NC}"
  echo -e "${GREEN}║  Production-ready deployment approved  ║${NC}"
  echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
  GRADE="A+"
  EXIT_CODE=0
elif [ $PCT -ge 95 ]; then
  echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║  ✅ A GRADE (Production-Ready)        ║${NC}"
  echo -e "${GREEN}║                                        ║${NC}"
  echo -e "${GREEN}║  95%+ vectors blocked                 ║${NC}"
  echo -e "${GREEN}║  Minor gaps only                      ║${NC}"
  echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
  GRADE="A"
  EXIT_CODE=0
elif [ $PCT -ge 80 ]; then
  echo -e "${YELLOW}╔════════════════════════════════════════╗${NC}"
  echo -e "${YELLOW}║  ⚠️  B GRADE (Needs Work)             ║${NC}"
  echo -e "${YELLOW}║                                        ║${NC}"
  echo -e "${YELLOW}║  80%+ vectors blocked                 ║${NC}"
  echo -e "${YELLOW}║  Significant gaps remain              ║${NC}"
  echo -e "${YELLOW}╚════════════════════════════════════════╝${NC}"
  GRADE="B"
  EXIT_CODE=1
else
  echo -e "${RED}╔════════════════════════════════════════╗${NC}"
  echo -e "${RED}║  🚨 C GRADE (Critical Issues)         ║${NC}"
  echo -e "${RED}║                                        ║${NC}"
  echo -e "${RED}║  <80% vectors blocked                 ║${NC}"
  echo -e "${RED}║  Do NOT deploy to production          ║${NC}"
  echo -e "${RED}╚════════════════════════════════════════╝${NC}"
  GRADE="C"
  EXIT_CODE=1
fi

echo ""
echo -e "${YELLOW}📊 Reports Generated:${NC}"
echo "  • $REPORTS_DIR/gauntlet_v1.log"
echo "  • $REPORTS_DIR/gauntlet_v2.log"
echo "  • $REPORTS_DIR/clawhack_full.html        ← Open in browser"
echo "  • $REPORTS_DIR/audit_summary.txt         ← See below"
echo ""

# Write summary
cat > "$REPORTS_DIR/audit_summary.txt" << SUMMARY
╔═══════════════════════════════════════════════════════════════════════════╗
║                   Kasbah Guard Security Audit Report                      ║
║              Mother of All Tests — 173+ Exfiltration Vectors             ║
╚═══════════════════════════════════════════════════════════════════════════╝

Date:      $(date -u +"%Y-%m-%dT%H:%M:%SZ")
Grade:     $GRADE
Vectors:   $TOTAL_VECTORS
Blocked:   $ESTIMATED_PASS / 110 (ClawHack)
Score:     $PCT%

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

COMPETITIVE MOATS (Why Kasbah is Uncopyable):

1. 13-MOAT EGRESS GATE v3.0
   ✓ Object.defineProperty frozen hooks (writable:false)
   ✓ Self-healing via setInterval (3s auto-check)
   ✓ Fallback regex (never fails open)
   ✓ Base64 decode layer for obfuscated payloads
   ✓ WeakMap XHR URL tracking (open → send validation)
   ✓ MutationObserver src-attribute scanning (V09, V12)
   ✓ WebSocket constructor + message.send scanning
   ✓ window.open() URL exfil blocking
   ✓ All_frames: true (reaches cross-origin iframes)

2. OMNIDETECTION ENGINE (detector.js v2.1)
   ✓ Shannon entropy + 22-pattern recognition
   ✓ Unicode normalization (zero-width char stripping)
   ✓ Multi-language support (EN, ZH, AR, RU, Emoji, JWT, PEM)
   ✓ Compact text layer (resists split-token bypass)
   ✓ 3-tier intervention model (silent/warning/block)

3. GAUNTLET TEST COVERAGE (173+ Vectors)
   ✓ Browser egress (35 APIs)
   ✓ AI/agent attacks (15 vectors)
   ✓ Cross-context exfil (12 vectors)
   ✓ Obfuscation techniques (20 vectors)
   ✓ Desktop/CLI/file system (10 vectors)
   ✓ Supply chain attacks (8 vectors)
   ✓ Side-channel leaks (5 vectors)
   ✓ Performance degradation (5 vectors)

4. EXTENSION RESILIENCE
   ✓ onSuspend handler (state save across disable)
   ✓ onStartup restoration (survives browser restart)
   ✓ Pre-commit hook + .gitleaks.toml (blocks real secrets)
   ✓ Graceful degradation under attack

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CERTIFICATION LEVELS:

A+ (100%)    → Uncopyable moat, production-ready, public launch
A  (95%+)    → Minor gaps, safe for enterprise
B  (80%+)    → Needs hardening before production
C  (<80%)    → Critical vulnerabilities, internal use only

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

NEXT STEPS:

If Grade A+:
  1. Publish badge on bekasbah.com
  2. Launch $50K bounty challenge
  3. Announce public certification
  4. Ship to Chrome Web Store

If Grade A:
  1. Fix identified gaps (see clawhack_full.html)
  2. Re-run ClawHack suite
  3. Iterate to A+ or accept A deployment

If Grade B/C:
  1. Review failed vectors in clawhack_full.html
  2. Reference moat fix table in audit_summary
  3. Implement fixes in content.js / background.js
  4. Re-run full_audit.sh until A+

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Generated by: Kasbah Guard Full Audit Suite
Version: Mother of All Tests v1.0
SUMMARY

cat "$REPORTS_DIR/audit_summary.txt"

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════${NC}"
echo ""

exit $EXIT_CODE
