#!/usr/bin/env bash
# ──────────────────────────────────────────────
# health-check.sh — Verify all Kasbah Guard services
# are responding. Uses kubectl port-forward under the
# hood so no ingress or external IP is required.
#
# Usage:
#   ./scripts/health-check.sh [--namespace <ns>] [--timeout <sec>]
# ──────────────────────────────────────────────
set -euo pipefail

NAMESPACE="${NAMESPACE:-kasbah-guard}"
TIMEOUT="${TIMEOUT:-10}"
KUBECTL="${KUBECTL:-kubectl}"
PASS=0
FAIL=0
SKIP=0
PF_PIDS=()

# ── Colours ────────────────────────────────────
if [[ -t 1 ]]; then
  GREEN="\033[0;32m"
  RED="\033[0;31m"
  YELLOW="\033[0;33m"
  CYAN="\033[0;36m"
  RESET="\033[0m"
  BOLD="\033[1m"
else
  GREEN="" RED="" YELLOW="" CYAN="" RESET="" BOLD=""
fi

# ── Argument parsing ───────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --namespace|-n) NAMESPACE="$2"; shift 2;;
    --timeout|-t)   TIMEOUT="$2";   shift 2;;
    --help|-h)
      echo "Usage: $0 [--namespace <ns>] [--timeout <sec>]"
      exit 0
      ;;
    *) echo "Unknown argument: $1"; exit 1;;
  esac
done

# ── Helpers ────────────────────────────────────
log()  { echo "$(date '+%H:%M:%S') $*"; }
pass() { echo -e "  ${GREEN}PASS${RESET}  $*"; ((PASS++)); }
fail() { echo -e "  ${RED}FAIL${RESET}  $*"; ((FAIL++)); }
skip() { echo -e "  ${YELLOW}SKIP${RESET}  $*"; ((SKIP++)); }

# Start a port-forward in background; store PID for cleanup
start_pf() {
  local svc="$1" local_port="$2" remote_port="$3"
  $KUBECTL port-forward -n "$NAMESPACE" "svc/$svc" "${local_port}:${remote_port}" \
    >/dev/null 2>&1 &
  PF_PIDS+=($!)
}

cleanup() {
  for pid in "${PF_PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
}
trap cleanup EXIT

# HTTP check helper
http_check() {
  local name="$1" url="$2" expected_status="${3:-200}"
  local actual
  actual=$(curl -sk -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT" "$url" 2>/dev/null || echo "000")
  if [[ "$actual" == "$expected_status" ]]; then
    pass "$name  ($url)  HTTP $actual"
  elif [[ "$actual" == "000" ]]; then
    fail "$name  ($url)  No response (timeout or connection refused)"
  else
    fail "$name  ($url)  HTTP $actual (expected $expected_status)"
  fi
}

# K8s resource check helper
k8s_check() {
  local label="$1" kind="${2:-deployment}"
  local ready total
  if ! $KUBECTL get "$kind" -n "$NAMESPACE" -l "app=$label" >/dev/null 2>&1; then
    skip "$label $kind — not found in namespace $NAMESPACE"
    return
  fi
  ready=$($KUBECTL get "$kind" -n "$NAMESPACE" -l "app=$label" \
    -o jsonpath='{.items[0].status.readyReplicas}' 2>/dev/null || echo "0")
  total=$($KUBECTL get "$kind" -n "$NAMESPACE" -l "app=$label" \
    -o jsonpath='{.items[0].spec.replicas}' 2>/dev/null || echo "?")
  ready="${ready:-0}"
  if [[ "$ready" -ge 1 ]] && [[ "$ready" == "$total" ]]; then
    pass "$label $kind  ($ready/$total replicas ready)"
  elif [[ "$ready" -ge 1 ]]; then
    fail "$label $kind  ($ready/$total replicas ready — some pods not ready)"
  else
    fail "$label $kind  (0 replicas ready)"
  fi
}

# ── Main ───────────────────────────────────────
echo ""
echo -e "${BOLD}${CYAN}Kasbah Guard — Health Check${RESET}"
echo -e "${CYAN}Namespace: $NAMESPACE  |  Timeout: ${TIMEOUT}s${RESET}"
echo "─────────────────────────────────────────────────"

# ── Phase 1: Kubernetes resource status ────────
echo ""
echo -e "${BOLD}Phase 1: Kubernetes resource readiness${RESET}"

k8s_check "constitutional-ai"
k8s_check "onnx-inference"
k8s_check "zk-engine"
k8s_check "ebpf-ticket-server"
k8s_check "enterprise-dashboard"
k8s_check "redis" "statefulset"
k8s_check "prometheus"
k8s_check "grafana"

# ── Phase 2: HTTP endpoint checks via port-forward ─
echo ""
echo -e "${BOLD}Phase 2: HTTP endpoint health checks (port-forward)${RESET}"
echo "  Starting port-forwards..."

# Allocate local ports well away from defaults
start_pf "constitutional-ai"   19001 3000
start_pf "onnx-inference"      19002 8080
start_pf "zk-engine"           19003 8081
start_pf "ebpf-ticket-server"  19004 8082
start_pf "enterprise-dashboard" 19005 3001
start_pf "prometheus"          19006 9090
start_pf "grafana"             19007 3000

# Give port-forwards a moment to establish
sleep 3

http_check "constitutional-ai  /api/validate-intent" \
  "http://localhost:19001/api/validate-intent" "200"

http_check "onnx-inference      /health" \
  "http://localhost:19002/health" "200"

http_check "zk-engine           /health" \
  "http://localhost:19003/health" "200"

http_check "ebpf-ticket-server  /health" \
  "http://localhost:19004/health" "200"

http_check "enterprise-dashboard /api/health" \
  "http://localhost:19005/api/health" "200"

http_check "prometheus          /-/healthy" \
  "http://localhost:19006/-/healthy" "200"

http_check "prometheus          /-/ready" \
  "http://localhost:19006/-/ready" "200"

http_check "grafana             /api/health" \
  "http://localhost:19007/api/health" "200"

# ── Phase 3: HPA status ────────────────────────
echo ""
echo -e "${BOLD}Phase 3: HPA status${RESET}"
if $KUBECTL get hpa -n "$NAMESPACE" >/dev/null 2>&1; then
  hpa_count=$($KUBECTL get hpa -n "$NAMESPACE" --no-headers 2>/dev/null | wc -l | tr -d ' ')
  if [[ "$hpa_count" -gt 0 ]]; then
    pass "HPA resources found ($hpa_count)"
    echo ""
    $KUBECTL get hpa -n "$NAMESPACE" 2>/dev/null || true
  else
    skip "No HPA resources found in namespace $NAMESPACE"
  fi
else
  skip "kubectl get hpa failed — check RBAC permissions"
fi

# ── Phase 4: PVC status ────────────────────────
echo ""
echo -e "${BOLD}Phase 4: PersistentVolumeClaim status${RESET}"
if $KUBECTL get pvc -n "$NAMESPACE" >/dev/null 2>&1; then
  while IFS= read -r line; do
    name=$(echo "$line" | awk '{print $1}')
    status=$(echo "$line" | awk '{print $2}')
    if [[ "$status" == "Bound" ]]; then
      pass "PVC $name  ($status)"
    else
      fail "PVC $name  ($status) — not Bound"
    fi
  done < <($KUBECTL get pvc -n "$NAMESPACE" --no-headers 2>/dev/null || true)
fi

# ── Summary ────────────────────────────────────
echo ""
echo "─────────────────────────────────────────────────"
total=$((PASS + FAIL + SKIP))
echo -e "${BOLD}Results: ${GREEN}${PASS} passed${RESET}  ${RED}${FAIL} failed${RESET}  ${YELLOW}${SKIP} skipped${RESET}  (${total} total)"
echo ""

if [[ "$FAIL" -gt 0 ]]; then
  echo -e "${RED}One or more checks failed. Review output above.${RESET}"
  echo ""
  echo "  Useful commands:"
  echo "    kubectl get pods -n $NAMESPACE"
  echo "    kubectl describe pod -n $NAMESPACE <pod-name>"
  echo "    kubectl logs -n $NAMESPACE -l app=<service-name>"
  exit 1
else
  echo -e "${GREEN}All checks passed. Kasbah Guard is healthy.${RESET}"
  echo ""
  exit 0
fi
