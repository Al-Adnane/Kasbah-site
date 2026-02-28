# Kasbah Guard — Kubernetes Deployment Guide

This directory contains everything needed to deploy Kasbah Guard to a
Kubernetes cluster: raw manifests, a Helm chart, monitoring configuration,
and operational scripts.

> **Note on api-worker:** The Cloudflare Worker (`api-worker`) is deployed
> separately via `wrangler deploy` and is **not** managed by these Kubernetes
> manifests. See the repo root `api/` directory for worker deployment.

---

## Table of Contents

1. [Directory layout](#directory-layout)
2. [Prerequisites](#prerequisites)
3. [Quick start (3 commands)](#quick-start)
4. [Configuration reference](#configuration-reference)
5. [Secrets management](#secrets-management)
6. [Scaling guide](#scaling-guide)
7. [Monitoring setup](#monitoring-setup)
8. [Rollback procedures](#rollback-procedures)
9. [Multi-region setup](#multi-region-setup)
10. [Troubleshooting](#troubleshooting)

---

## Directory layout

```
deployment/
├── kubernetes/
│   ├── namespace.yaml           # Namespace: kasbah-guard
│   ├── configmap.yaml           # Shared environment config
│   ├── secrets.yaml             # Secret template (replace placeholders)
│   ├── constitutional-ai.yaml   # Next.js app, port 3000 — intent validation
│   ├── onnx-inference.yaml      # Rust ML server, port 8080 + model PVC
│   ├── zk-engine.yaml           # Rust ZK server, port 8081
│   ├── ebpf-ticket-server.yaml  # Rust ticket issuer, port 8082
│   ├── enterprise-dashboard.yaml # Next.js dashboard, port 3001
│   ├── redis.yaml               # StatefulSet + redis_exporter sidecar
│   ├── ingress.yaml             # Nginx ingress with TLS + rate limiting
│   └── network-policy.yaml      # Zero-trust: default-deny + explicit allows
├── monitoring/
│   ├── prometheus.yaml          # Prometheus + RBAC + 50Gi PVC
│   ├── grafana.yaml             # Grafana + auto-provisioned datasource
│   └── alerts.yaml              # PrometheusRule (10 alerting rules)
├── helm/
│   ├── Chart.yaml               # Chart metadata
│   └── values.yaml              # All configurable values
├── scripts/
│   ├── deploy.sh                # Full deployment script
│   └── health-check.sh          # Post-deploy health verification
└── README.md                    # This file
```

---

## Prerequisites

| Tool | Minimum version | Purpose |
|------|----------------|---------|
| `kubectl` | 1.27+ | Kubernetes CLI |
| `helm` | 3.12+ | Chart-based deployments |
| Kubernetes cluster | 1.27+ | GKE / EKS / AKS / k3s |
| `cert-manager` | 1.13+ | Automatic TLS certificates |
| `ingress-nginx` | 1.8+ | Nginx ingress controller |
| `wrangler` | 3.x | Cloudflare Worker deployment (api-worker only) |

**Resource requirements (minimum cluster capacity):**

| Service | CPU request | Memory request |
|---------|------------|----------------|
| constitutional-ai (x2) | 200m | 512Mi |
| onnx-inference (x2) | 1000m | 2Gi |
| zk-engine (x2) | 400m | 1Gi |
| ebpf-ticket-server (x1) | 50m | 128Mi |
| enterprise-dashboard (x2) | 200m | 512Mi |
| redis (x1) | 100m | 256Mi |
| prometheus (x1) | 200m | 512Mi |
| grafana (x1) | 100m | 256Mi |
| **Total** | **~2.25 CPU** | **~5.2Gi** |

A cluster with 3 nodes of 2 vCPU / 4Gi RAM each is sufficient to start.
ONNX inference scales to 20 replicas, so plan accordingly.

---

## Quick start

```bash
# 1. Fill in real secret values (see Secrets management below)
vim deployment/kubernetes/secrets.yaml

# 2. Deploy everything
cd deployment && bash scripts/deploy.sh --yes

# 3. Verify all services are healthy
bash scripts/health-check.sh
```

That's it. The script handles ordering (Redis before app services),
rollout waiting, and prints a pod summary when complete.

---

## Configuration reference

All shared configuration lives in `kubernetes/configmap.yaml`. Edit the
values before running `deploy.sh`, or patch after deployment:

```bash
kubectl edit configmap kasbah-guard-config -n kasbah-guard
# Then restart affected deployments:
kubectl rollout restart deployment/constitutional-ai -n kasbah-guard
```

| Key | Default | Description |
|-----|---------|-------------|
| `LOG_LEVEL` | `info` | Log verbosity: `debug`, `info`, `warn`, `error` |
| `RISK_THRESHOLD` | `0.5` | Score above which a request is flagged as risky |
| `APPROVAL_THRESHOLD` | `0.4` | Score below which a request is auto-approved |
| `CONSTITUTIONAL_AI_URL` | `http://constitutional-ai:3000` | Internal service URL |
| `ONNX_INFERENCE_URL` | `http://onnx-inference:8080` | Internal service URL |
| `ZK_ENGINE_URL` | `http://zk-engine:8081` | Internal service URL |
| `TICKET_SERVER_URL` | `http://ebpf-ticket-server:8082` | Internal service URL |
| `REDIS_URL` | `redis://redis:6379` | Redis connection string |

---

## Secrets management

`kubernetes/secrets.yaml` contains base64-encoded **placeholders only**.
Replace them before deploying.

### Manual approach

```bash
# Encode a value
echo -n "your-actual-secret" | base64

# Edit the file and replace placeholder values
vim deployment/kubernetes/secrets.yaml
```

### Recommended: External Secrets Operator

For production, use the [External Secrets Operator](https://external-secrets.io)
to pull secrets from AWS Secrets Manager, GCP Secret Manager, or HashiCorp Vault
instead of storing them in the repository.

```yaml
# Example ExternalSecret (not included — add to kubernetes/ if needed)
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: kasbah-guard-secrets
  namespace: kasbah-guard
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-secretsmanager
    kind: ClusterSecretStore
  target:
    name: kasbah-guard-secrets
  data:
    - secretKey: JWT_SECRET
      remoteRef:
        key: kasbah/production/jwt-secret
```

### Secrets reference

| Secret key | Description |
|-----------|-------------|
| `JWT_SECRET` | HS256/HS512 signing key, min 32 characters |
| `SIGNING_KEY_HEX` | 64-character hex key for ticket server |
| `REDIS_PASSWORD` | Redis `requirepass` value |
| `GF_SECURITY_ADMIN_PASSWORD` | Grafana admin UI password |

---

## Scaling guide

### Horizontal scaling (HPA)

All stateless services have an HPA. They scale automatically based on CPU.
To change the bounds without editing YAML:

```bash
# Increase onnx-inference max replicas to 30
kubectl patch hpa onnx-inference-hpa -n kasbah-guard \
  --type=merge -p '{"spec":{"maxReplicas":30}}'

# Check current HPA state
kubectl get hpa -n kasbah-guard
```

### Manual scaling override

```bash
# Temporarily scale constitutional-ai to 5 replicas
kubectl scale deployment constitutional-ai -n kasbah-guard --replicas=5

# Note: HPA will resume control after the next evaluation cycle.
# To prevent HPA from fighting you, set minReplicas equal to the target first.
```

### Service-specific notes

| Service | Scaling notes |
|---------|--------------|
| `constitutional-ai` | Stateless — scales freely. |
| `onnx-inference` | CPU-heavy. Models come from a ReadOnlyMany PVC — all replicas share the same model files. |
| `zk-engine` | Stateless — scales freely. ZK proof generation is CPU-intensive. |
| `ebpf-ticket-server` | **Single replica only.** The signing key is held in process memory. If you need HA, externalise the key to a KMS and increase replicas. |
| `enterprise-dashboard` | Stateless — scales freely. |
| `redis` | Single replica StatefulSet. For HA, migrate to Redis Sentinel or Redis Cluster. |

### Vertical scaling

Edit the resource limits in the relevant YAML file and re-apply:

```bash
kubectl apply -n kasbah-guard -f deployment/kubernetes/onnx-inference.yaml
kubectl rollout status deployment/onnx-inference -n kasbah-guard
```

---

## Monitoring setup

### Accessing Grafana

```bash
# Port-forward Grafana to your local machine
kubectl port-forward -n kasbah-guard svc/grafana 3000:3000

# Open in browser
open http://localhost:3000
# Login: admin / <GF_SECURITY_ADMIN_PASSWORD from secrets.yaml>
```

### Accessing Prometheus

```bash
kubectl port-forward -n kasbah-guard svc/prometheus 9090:9090
open http://localhost:9090
```

### Alert rules

Ten alerting rules are defined in `monitoring/alerts.yaml`:

| Alert | Condition | Severity |
|-------|-----------|----------|
| `HighInferenceLatency` | avg inference > 500ms for 5m | warning |
| `HighRiskDetectionRate` | >10% DENY validations for 10m | warning |
| `CriticalRiskDetectionRate` | >50% DENY validations for 2m | critical |
| `ServiceDown` | 0 ready replicas for 2m | critical |
| `ReplicasMismatch` | desired != ready for 5m | warning |
| `HighErrorRate` | >5% 5xx errors for 5m | warning |
| `TicketServerErrors` | any 5xx on ticket server for 2m | critical |
| `LowCacheHitRate` | cache hits <50% for 15m | warning |
| `RedisMemoryHigh` | Redis memory >80% for 10m | warning |
| `PodCPUThrottling` | CPU throttled >25% for 10m | warning |

To receive alert notifications, configure an Alertmanager and update the
`alerting.alertmanagers` section in `monitoring/prometheus.yaml`.

### Metrics emitted by each service

Each service is expected to expose a `/metrics` endpoint in Prometheus format.
The prometheus.yaml scrape config uses pod annotations to discover them:

```yaml
annotations:
  prometheus.io/scrape: "true"
  prometheus.io/port: "8080"    # adjust per service
  prometheus.io/path: "/metrics"
```

---

## Rollback procedures

### Rolling back a single deployment

```bash
# View rollout history
kubectl rollout history deployment/onnx-inference -n kasbah-guard

# Roll back to previous version
kubectl rollout undo deployment/onnx-inference -n kasbah-guard

# Roll back to a specific revision
kubectl rollout undo deployment/onnx-inference -n kasbah-guard --to-revision=2

# Verify the rollback
kubectl rollout status deployment/onnx-inference -n kasbah-guard
```

### Rolling back a ConfigMap change

```bash
# Re-apply the previous configmap.yaml
kubectl apply -n kasbah-guard -f deployment/kubernetes/configmap.yaml

# Restart all deployments to pick up the change
kubectl rollout restart deployment -n kasbah-guard
```

### Full namespace teardown (destructive)

```bash
# WARNING: This deletes ALL resources including PVCs (data loss).
kubectl delete namespace kasbah-guard

# Then redeploy from scratch:
bash deployment/scripts/deploy.sh --yes
```

### Safe rollback with Helm (if using the chart)

```bash
# List Helm release history
helm history kasbah-guard -n kasbah-guard

# Roll back to revision 2
helm rollback kasbah-guard 2 -n kasbah-guard

# Verify
kubectl get pods -n kasbah-guard
```

---

## Multi-region setup

Kasbah Guard is designed to run in a single cluster by default. For
multi-region deployments:

### Option A: Independent clusters per region

Deploy the full stack independently in each region. Use a global load
balancer (Cloudflare, AWS Global Accelerator, or GCP Cloud Armor) to
route users to the nearest region.

```
User -> Cloudflare (anycast) -> nearest cluster
```

Steps:
1. Provision a Kubernetes cluster in each target region.
2. Run `deploy.sh` in each cluster (with region-specific kubeconfig).
3. Add each cluster's ingress IP to your DNS geo-routing rules.
4. Redis is local to each cluster — no cross-region replication needed
   for the caching tier.

### Option B: Shared Redis with regional app tiers

If you need consistent session state across regions:

1. Deploy Redis in one "primary" region using the StatefulSet.
2. In secondary regions, override `REDIS_URL` in the ConfigMap to point
   at the primary Redis (via a secure tunnel or VPN).
3. Deploy only the app-tier deployments (constitutional-ai, onnx-inference,
   zk-engine, ebpf-ticket-server, enterprise-dashboard) in secondary regions.

### eBPF Ticket Server in multi-region

The ticket server holds its signing key in process memory. For multi-region:
- Use a KMS (AWS KMS, GCP KMS, or HashiCorp Vault) to store the signing key.
- Update the ticket server to fetch the key from the KMS at startup.
- This allows safe horizontal scaling and multi-region deployment.

### Model files in multi-region

The ONNX model PVC uses `ReadOnlyMany`. For multi-region:
- Use a shared object store (S3, GCS) and an init container to download
  models at pod startup, OR
- Use a cloud-native distributed filesystem (e.g., AWS EFS, GCP Filestore)
  that supports multi-region ReadOnlyMany access.

---

## Troubleshooting

### Pods stuck in Pending

```bash
kubectl describe pod <pod-name> -n kasbah-guard
# Look for: Insufficient cpu/memory, PVC not bound, node selector mismatch
```

### Pods in CrashLoopBackOff

```bash
kubectl logs <pod-name> -n kasbah-guard --previous
# --previous shows logs from the crashed container, not the current restart
```

### onnx-inference pods not starting (init container waiting)

The init container waits for `constitutional-ai` to be ready before allowing
inference to start. Check constitutional-ai first:

```bash
kubectl get pods -n kasbah-guard -l app=constitutional-ai
kubectl logs -n kasbah-guard -l app=constitutional-ai
```

### Redis password mismatch

If Redis pods crash with `WRONGPASS`, the `REDIS_PASSWORD` in the secret
does not match the password used to initialise the Redis data volume. Either:
- Delete the PVC and redeploy (data loss), or
- Update the secret to match the existing password.

### Network policy blocking traffic

To temporarily disable all network policies for debugging:

```bash
kubectl delete networkpolicy --all -n kasbah-guard
# Re-apply after debugging:
kubectl apply -n kasbah-guard -f deployment/kubernetes/network-policy.yaml
```

### cert-manager not issuing TLS

```bash
kubectl describe certificate kasbah-guard-tls -n kasbah-guard
kubectl describe certificaterequest -n kasbah-guard
# Common cause: DNS A record not pointing to ingress IP yet
```

### Running the health check script

```bash
# Full check with default namespace
bash deployment/scripts/health-check.sh

# Custom namespace and timeout
bash deployment/scripts/health-check.sh --namespace my-namespace --timeout 15
```

---

*Generated for Kasbah Guard v1.0.0 — engine v3.5.2*
