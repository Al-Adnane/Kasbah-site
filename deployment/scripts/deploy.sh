#!/usr/bin/env bash
# ──────────────────────────────────────────────
# deploy.sh — Deploy Kasbah Guard to Kubernetes
# Usage: ./scripts/deploy.sh [--dry-run] [--namespace <ns>]
# ──────────────────────────────────────────────
set -euo pipefail

# ── Configuration ─────────────────────────────
NAMESPACE="${NAMESPACE:-kasbah-guard}"
KUBECTL="${KUBECTL:-kubectl}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"
K8S_DIR="$DEPLOY_DIR/kubernetes"
MON_DIR="$DEPLOY_DIR/monitoring"
DRY_RUN=false
SKIP_CONFIRM=false

# ── Argument parsing ───────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --yes|-y)
      SKIP_CONFIRM=true
      shift
      ;;
    --namespace|-n)
      NAMESPACE="$2"
      shift 2
      ;;
    --help|-h)
      echo "Usage: $0 [--dry-run] [--yes] [--namespace <ns>]"
      echo ""
      echo "  --dry-run        Print kubectl commands without executing them"
      echo "  --yes            Skip confirmation prompts"
      echo "  --namespace <ns> Target namespace (default: kasbah-guard)"
      exit 0
      ;;
    *)
      echo "Unknown argument: $1"
      exit 1
      ;;
  esac
done

# ── Helpers ────────────────────────────────────
log()  { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
info() { log "INFO  $*"; }
ok()   { log "OK    $*"; }
warn() { log "WARN  $*"; }
fail() { log "ERROR $*" >&2; exit 1; }

kube_apply() {
  local file="$1"
  local ns_flag="${2:-}"
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "  [DRY-RUN] $KUBECTL apply $ns_flag -f $file"
  else
    $KUBECTL apply $ns_flag -f "$file"
  fi
}

wait_for_pods() {
  local label="$1"
  local timeout="${2:-120s}"
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "  [DRY-RUN] $KUBECTL rollout status deployment/$label -n $NAMESPACE --timeout=$timeout"
  else
    $KUBECTL rollout status "deployment/$label" -n "$NAMESPACE" --timeout="$timeout" || \
      warn "Rollout of $label did not complete within $timeout — continuing"
  fi
}

# ── Pre-flight checks ──────────────────────────
info "Running pre-flight checks..."

command -v "$KUBECTL" >/dev/null 2>&1 || fail "kubectl not found in PATH"

if [[ "$DRY_RUN" == "false" ]]; then
  $KUBECTL cluster-info >/dev/null 2>&1 || fail "Cannot reach Kubernetes cluster. Check your kubeconfig."
fi

# Verify all manifest files exist
REQUIRED_FILES=(
  "$K8S_DIR/namespace.yaml"
  "$K8S_DIR/configmap.yaml"
  "$K8S_DIR/secrets.yaml"
  "$K8S_DIR/redis.yaml"
  "$K8S_DIR/constitutional-ai.yaml"
  "$K8S_DIR/onnx-inference.yaml"
  "$K8S_DIR/zk-engine.yaml"
  "$K8S_DIR/ebpf-ticket-server.yaml"
  "$K8S_DIR/enterprise-dashboard.yaml"
  "$K8S_DIR/ingress.yaml"
  "$K8S_DIR/network-policy.yaml"
  "$MON_DIR/prometheus.yaml"
  "$MON_DIR/grafana.yaml"
  "$MON_DIR/alerts.yaml"
)

for f in "${REQUIRED_FILES[@]}"; do
  [[ -f "$f" ]] || fail "Required manifest not found: $f"
done

ok "All manifest files present."

# ── Confirmation ───────────────────────────────
if [[ "$SKIP_CONFIRM" == "false" && "$DRY_RUN" == "false" ]]; then
  echo ""
  echo "  Target namespace : $NAMESPACE"
  echo "  Manifests dir    : $DEPLOY_DIR"
  echo "  Mode             : LIVE (real changes will be applied)"
  echo ""
  read -rp "  Proceed with deployment? [y/N] " confirm
  [[ "$confirm" =~ ^[Yy]$ ]] || { info "Deployment cancelled."; exit 0; }
fi

[[ "$DRY_RUN" == "true" ]] && info "DRY-RUN mode — no changes will be made."

echo ""
info "Deploying Kasbah Guard to namespace: $NAMESPACE"
echo "────────────────────────────────────────────────────"

# ── Step 1: Namespace ──────────────────────────
info "[1/12] Creating namespace..."
kube_apply "$K8S_DIR/namespace.yaml"
ok "Namespace ready."

# ── Step 2: ConfigMap ──────────────────────────
info "[2/12] Applying ConfigMap..."
kube_apply "$K8S_DIR/configmap.yaml"
ok "ConfigMap applied."

# ── Step 3: Secrets ────────────────────────────
info "[3/12] Applying Secrets..."
warn "Ensure secrets.yaml contains real values before production deployment."
kube_apply "$K8S_DIR/secrets.yaml" "-n $NAMESPACE"
ok "Secrets applied."

# ── Step 4: Redis ──────────────────────────────
info "[4/12] Deploying Redis (StatefulSet)..."
kube_apply "$K8S_DIR/redis.yaml" "-n $NAMESPACE"
if [[ "$DRY_RUN" == "false" ]]; then
  info "  Waiting 15s for Redis to initialize..."
  sleep 15
fi
ok "Redis deployed."

# ── Step 5: constitutional-ai ──────────────────
info "[5/12] Deploying constitutional-ai..."
kube_apply "$K8S_DIR/constitutional-ai.yaml" "-n $NAMESPACE"
wait_for_pods "constitutional-ai" "120s"
ok "constitutional-ai deployed."

# ── Step 6: onnx-inference ─────────────────────
info "[6/12] Deploying onnx-inference..."
kube_apply "$K8S_DIR/onnx-inference.yaml" "-n $NAMESPACE"
wait_for_pods "onnx-inference" "180s"
ok "onnx-inference deployed."

# ── Step 7: zk-engine ─────────────────────────
info "[7/12] Deploying zk-engine..."
kube_apply "$K8S_DIR/zk-engine.yaml" "-n $NAMESPACE"
wait_for_pods "zk-engine" "120s"
ok "zk-engine deployed."

# ── Step 8: ebpf-ticket-server ────────────────
info "[8/12] Deploying ebpf-ticket-server..."
kube_apply "$K8S_DIR/ebpf-ticket-server.yaml" "-n $NAMESPACE"
wait_for_pods "ebpf-ticket-server" "60s"
ok "ebpf-ticket-server deployed."

# ── Step 9: enterprise-dashboard ──────────────
info "[9/12] Deploying enterprise-dashboard..."
kube_apply "$K8S_DIR/enterprise-dashboard.yaml" "-n $NAMESPACE"
wait_for_pods "enterprise-dashboard" "120s"
ok "enterprise-dashboard deployed."

# ── Step 10: Ingress & Network Policy ─────────
info "[10/12] Applying Ingress and NetworkPolicy..."
kube_apply "$K8S_DIR/ingress.yaml" "-n $NAMESPACE"
kube_apply "$K8S_DIR/network-policy.yaml" "-n $NAMESPACE"
ok "Ingress and NetworkPolicy applied."

# ── Step 11: Monitoring ───────────────────────
info "[11/12] Deploying monitoring stack..."
kube_apply "$MON_DIR/prometheus.yaml" "-n $NAMESPACE"
kube_apply "$MON_DIR/grafana.yaml" "-n $NAMESPACE"
ok "Prometheus and Grafana deployed."

# ── Step 12: Alert Rules ──────────────────────
info "[12/12] Applying alert rules..."
kube_apply "$MON_DIR/alerts.yaml" "-n $NAMESPACE"
ok "Alert rules applied."

echo "────────────────────────────────────────────────────"
echo ""
info "Deployment complete."
echo ""

# ── Summary ────────────────────────────────────
if [[ "$DRY_RUN" == "false" ]]; then
  echo "  Pod status:"
  $KUBECTL get pods -n "$NAMESPACE" -o wide 2>/dev/null || true
  echo ""
  echo "  Services:"
  $KUBECTL get services -n "$NAMESPACE" 2>/dev/null || true
  echo ""
  echo "  Ingress:"
  $KUBECTL get ingress -n "$NAMESPACE" 2>/dev/null || true
  echo ""
  echo "  To stream logs from a service:"
  echo "    kubectl logs -n $NAMESPACE -l app=constitutional-ai -f"
  echo ""
  echo "  To check HPA status:"
  echo "    kubectl get hpa -n $NAMESPACE"
  echo ""
  echo "  To open Grafana (port-forward):"
  echo "    kubectl port-forward -n $NAMESPACE svc/grafana 3000:3000"
  echo "    Then open: http://localhost:3000"
  echo ""
fi
