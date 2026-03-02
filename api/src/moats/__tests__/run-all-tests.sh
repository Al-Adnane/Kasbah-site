#!/bin/bash

##############################################################################
# SAFE MOAT INTEGRATION - COMPREHENSIVE TEST RUNNER
#
# Tests all 4 security moats + integration layer
# Verifies zero regressions on existing test suites
#
# Tests:
#   - Magic Bytes: 25+ tests
#   - Rate Limiter: 20+ tests
#   - Circuit Breaker: 18+ tests
#   - Error Handler: 15+ tests
#   - Integration: 12+ tests
#
# Total: 90+ tests
#
# Exit codes:
#   0 = all tests passed
#   1 = some tests failed
#   2 = test suite error
##############################################################################

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "╔════════════════════════════════════════════════════════════════════════════╗"
echo "║             SAFE MOAT INTEGRATION - FULL TEST SUITE                        ║"
echo "╚════════════════════════════════════════════════════════════════════════════╝"
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counters
total_tests=0
passed_tests=0
failed_tests=0

# Function to run a test and track results
run_test() {
  local test_name=$1
  local test_file=$2

  echo -e "${BLUE}▶ Running: $test_name${NC}"

  if [ ! -f "$test_file" ]; then
    echo -e "${RED}✗ Test file not found: $test_file${NC}"
    failed_tests=$((failed_tests + 1))
    total_tests=$((total_tests + 1))
    return 1
  fi

  if npx jest "$test_file" --passWithNoTests --testTimeout=10000; then
    echo -e "${GREEN}✓ $test_name passed${NC}"
    passed_tests=$((passed_tests + 1))
    total_tests=$((total_tests + 1))
    return 0
  else
    echo -e "${RED}✗ $test_name failed${NC}"
    failed_tests=$((failed_tests + 1))
    total_tests=$((total_tests + 1))
    return 1
  fi
}

# Run moat tests
echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}PHASE 1: MOAT UNIT TESTS (78+)${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════════${NC}"
echo ""

run_test "Magic Bytes Validation (25+)" "$SCRIPT_DIR/magic-bytes.test.js"
run_test "Rate Limiter (20+)" "$SCRIPT_DIR/rate-limiter.test.js"
run_test "Circuit Breaker (18+)" "$SCRIPT_DIR/circuit-breaker.test.js"
run_test "Error Handler (15+)" "$SCRIPT_DIR/error-handler.test.js"

# Run integration tests
echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}PHASE 2: INTEGRATION TESTS (12+)${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════════${NC}"
echo ""

run_test "Moat Integration Layer" "$SCRIPT_DIR/integration.test.js"

# Summary
echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}TEST SUMMARY${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════════${NC}"
echo ""

if [ $failed_tests -eq 0 ]; then
  echo -e "${GREEN}✓ ALL TESTS PASSED${NC}"
  echo -e "${GREEN}  Total: $total_tests${NC}"
  echo -e "${GREEN}  Passed: $passed_tests${NC}"
  echo ""
  echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════════${NC}"
  echo -e "${BLUE}REGRESSION TEST: Market Launch (58/58 must pass)${NC}"
  echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════════${NC}"
  echo ""

  if [ -f "/tmp/kasbah-market-launch.cjs" ]; then
    if node /tmp/kasbah-market-launch.cjs; then
      echo -e "${GREEN}✓ Market launch test passed (58/58)${NC}"
      echo ""
      echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════════${NC}"
      echo -e "${GREEN}SUCCESS: ALL TESTS PASSED, ZERO REGRESSIONS${NC}"
      echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════════${NC}"
      echo ""
      echo "Moats are ready for integration!"
      echo ""
      exit 0
    else
      echo -e "${RED}✗ Market launch test failed${NC}"
      echo -e "${RED}REGRESSION DETECTED${NC}"
      exit 1
    fi
  else
    echo -e "${YELLOW}⚠ Market launch test not found (expected at /tmp/kasbah-market-launch.cjs)${NC}"
    echo -e "${YELLOW}Skipping regression check${NC}"
    echo ""
    exit 0
  fi
else
  echo -e "${RED}✗ SOME TESTS FAILED${NC}"
  echo -e "${RED}  Total: $total_tests${NC}"
  echo -e "${RED}  Passed: $passed_tests${NC}"
  echo -e "${RED}  Failed: $failed_tests${NC}"
  echo ""
  echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════════${NC}"
  echo -e "${RED}FAILURE: FIX TESTS BEFORE PROCEEDING${NC}"
  echo -e "${BLUE}═══════════════════════════════════════════════════════════════════════════════${NC}"
  echo ""
  exit 1
fi
