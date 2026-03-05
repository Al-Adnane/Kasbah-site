#!/usr/bin/env python3
"""
train_stumps.py — Kasbah Guard ML Stumps Training Pipeline
===========================================================
Trains a 20-stump Gradient Boosted Decision Tree (GBM, max_depth=1)
on a labeled corpus of secrets vs. benign text.

Outputs the _ML_STUMPS array in detector.js-compatible format:
  [feat_idx, split_threshold, leaf_pos, leaf_neg, stump_weight]

Usage:
  # With real datasets (recommended):
  pip install scikit-learn numpy
  python scripts/train_stumps.py --pos-dir data/secrets/ --neg-dir data/benign/ --out detector_stumps.js

  # With synthetic data (for CI/development):
  python scripts/train_stumps.py --synthetic --out detector_stumps.js

  # Update detector.js in place:
  python scripts/train_stumps.py --synthetic --update-detector

Dataset Sources (for production training):
  Positives: gitleaks test fixtures  https://github.com/gitleaks/gitleaks/tree/master/cmd/generate/config/rules
             detect-secrets corpus   https://github.com/Yelp/detect-secrets/tree/master/testing/
             TruffleHog samples      https://github.com/trufflesecurity/trufflehog/tree/main/pkg/detectors
  Negatives: Common Crawl prose snippets, .env.example templates, code comments, README excerpts
"""

import argparse
import hashlib
import json
import math
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

# ── Optional sklearn import — graceful error if not installed ──
try:
    import numpy as np
    from sklearn.ensemble import GradientBoostingClassifier
    from sklearn.model_selection import train_test_split
    from sklearn.metrics import roc_auc_score, classification_report
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False

# ═══════════════════════════════════════════════════════════════════
# Feature extraction — mirrors mlExtractFeatures() in detector.js
# All 16 features must match exactly for inference parity.
# ═══════════════════════════════════════════════════════════════════

# Tier patterns matching detector.js tiered rule engine
TIER_PATTERNS = {
    'T1':  re.compile(
        r'(?:password|passwd|secret|token|credential|api[_\-]?key|auth[_\-]?key|private[_\-]?key)'
        r'[\s:="\']+([\w\-/+]{8,})',
        re.IGNORECASE
    ),
    'T1b': re.compile(
        r'-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----|'
        r'(?:ssh-rsa|ssh-ed25519|ecdsa-sha2)\s+[A-Za-z0-9+/]{40,}',
        re.IGNORECASE
    ),
    'T1c': re.compile(
        r'(?:AKIA[0-9A-Z]{16}|'                          # AWS key
        r'AIza[0-9A-Za-z\-_]{35}|'                      # Google API
        r'ya29\.[0-9A-Za-z\-_]+|'                        # Google OAuth
        r'sk-[A-Za-z0-9]{48}|'                           # OpenAI
        r'ghp_[A-Za-z0-9]{36}|'                          # GitHub PAT
        r'xoxb-[0-9]{11}-[0-9]{11}-[A-Za-z0-9]{24})',   # Slack Bot
        re.IGNORECASE
    ),
    'T1e': re.compile(
        r'(?:\b4[0-9]{12}(?:[0-9]{3})?\b|'              # Visa
        r'\b5[1-5][0-9]{14}\b|'                          # Mastercard
        r'\b3[47][0-9]{13}\b|'                           # Amex
        r'\b\d{3}-\d{2}-\d{4}\b)',                       # SSN
        re.IGNORECASE
    ),
    'T1f': re.compile(
        r'(?:patient[_\-\s]?id|mrn|diagnosis|icd[_\-]?\d+|'
        r'dob[\s:=]+\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})',
        re.IGNORECASE
    ),
    'T1g': re.compile(
        r'(?:proprietary|trade\s+secret|confidential|'
        r'intellectual\s+property|do\s+not\s+distribute)',
        re.IGNORECASE
    ),
    'T1h': re.compile(
        r'(?:non[\-\s]?disclosure|nda|attorney.client|'
        r'privileged\s+and\s+confidential|work\s+product)',
        re.IGNORECASE
    ),
    'T2':  re.compile(
        r'(?:[A-Za-z0-9+/]{40,}={0,2}|'               # Base64-ish 40+ chars
        r'[0-9a-f]{32,})',                               # Hex 32+ chars
        re.IGNORECASE
    ),
    'T3':  re.compile(
        r'(?:eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+|'  # JWT
        r'(?:[A-Z0-9]{20,})|'                           # uppercase tokens
        r'(?:xox[baprs]-[0-9A-Za-z\-]+))',              # Slack tokens
        re.IGNORECASE
    ),
}


def shannon_entropy(text: str) -> float:
    """Shannon entropy of character distribution, range [0, ~6]."""
    if not text:
        return 0.0
    freq = {}
    for ch in text:
        freq[ch] = freq.get(ch, 0) + 1
    n = len(text)
    return -sum((c / n) * math.log2(c / n) for c in freq.values())


def extract_features(text: str) -> list:
    """
    Extract 16-dimensional feature vector matching mlExtractFeatures() in detector.js.

    Features:
      f0  normalized entropy            (entropy / 6.0, clamped 0–1)
      f1  tier density                  (num_tiers / 10, clamped 0–1)
      f2  rule score proxy              (weighted tier hit count / 100, clamped 0–1)
      f3  has T1  (credential keyword + value)
      f4  has T1b (private key / SSH key)
      f5  has T1c (cloud API key — AWS/GCP/OpenAI/GitHub/Slack)
      f6  has T1e (financial — credit card / SSN)
      f7  has T1f (PHI — patient ID / diagnosis)
      f8  has T1g (IP / trade secret)
      f9  has T1h (legal — NDA / privilege)
      f10 has T2  (long base64/hex blob)
      f11 has T3  (JWT / uppercase token / Slack token)
      f12 text length                   (len / 5000, clamped 0–1)
      f13 digit ratio                   (digits / len)
      f14 uppercase ratio               (upper / len)
      f15 special char ratio            (non-alphanumeric-nonspace / len)
    """
    t = text or ''
    n = max(len(t), 1)
    entropy = shannon_entropy(t)

    hits = {}
    for tier, pat in TIER_PATTERNS.items():
        hits[tier] = 1 if pat.search(t) else 0

    # Approximate rule score: T1/T1x hits weighted higher
    rule_score = (
        hits['T1']  * 65 +
        hits['T1b'] * 80 +
        hits['T1c'] * 85 +
        hits['T1e'] * 70 +
        hits['T1f'] * 75 +
        hits['T1g'] * 50 +
        hits['T1h'] * 45 +
        hits['T2']  * 20 +
        hits['T3']  * 30
    )

    tier_count = sum(hits.values())

    return [
        min(entropy / 6.0, 1.0),                              # f0
        min(tier_count / 10.0, 1.0),                          # f1
        min(rule_score / 100.0, 1.0),                         # f2
        float(hits['T1']),                                     # f3
        float(hits['T1b']),                                    # f4
        float(hits['T1c']),                                    # f5
        float(hits['T1e']),                                    # f6
        float(hits['T1f']),                                    # f7
        float(hits['T1g']),                                    # f8
        float(hits['T1h']),                                    # f9
        float(hits['T2']),                                     # f10
        float(hits['T3']),                                     # f11
        min(len(t) / 5000.0, 1.0),                            # f12
        len(re.findall(r'\d', t)) / n,                        # f13
        len(re.findall(r'[A-Z]', t)) / n,                     # f14
        len(re.findall(r'[^a-zA-Z0-9\s]', t)) / n,           # f15
    ]


# ═══════════════════════════════════════════════════════════════════
# Synthetic dataset generator (for CI/development without real data)
# ═══════════════════════════════════════════════════════════════════

SYNTHETIC_POSITIVES = [
    # AWS keys
    "export AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE",
    "aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    "AWS_SECRET=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY123456",
    # GitHub PATs
    "GITHUB_TOKEN=ghp_1234567890abcdefghijklmnopqrstuvwxyz",
    "token: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh",
    # OpenAI
    "api_key = sk-proj-abcdefghijklmnopqrstuvwxyz1234567890ABCDEFGHIJKLMNOP",
    "OPENAI_API_KEY=sk-TESTKEY1234567890abcdefghijklmnopqrstuvwxyz",
    # Slack tokens
    "SLACK_BOT_TOKEN=TEST_SLACK_BOT_TOKEN_0000",
    # Private keys
    "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----",
    "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEA\n-----END PRIVATE KEY-----",
    # Credit card
    "Card number: 4532015112830366, exp 12/26, CVV 123",
    "Payment info: 5425233430109903",
    # SSN
    "SSN: 123-45-6789",
    "Social Security Number: 987-65-4321",
    # PHI
    "Patient MRN: 7823901, Diagnosis: ICD-10 J45.50",
    "DOB: 03/15/1985, Patient ID: PAT-00123456",
    # Database credentials
    "DATABASE_URL=postgresql://admin:s3cr3tP@ssw0rd@prod.db.internal:5432/users",
    "MONGO_URI=mongodb://root:MyS3cur3P4ss@cluster.mongodb.net/proddb",
    # JWT
    "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
    # Generic secrets
    "password='Sup3rS3cret!@#123'",
    "api_secret: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6'",
    "private_key=MIIEpAIBAAKCAQEA7mn3R8jQmMzjHkFqP5Y",
    # NDA / legal
    "PRIVILEGED AND CONFIDENTIAL — ATTORNEY-CLIENT COMMUNICATION\nDo not distribute.",
    "NON-DISCLOSURE AGREEMENT — This document contains trade secrets.",
    # Google API
    "GOOGLE_API_KEY=AIzaSyD1234567890abcdefghijklmnopqr",
    "google_token: ya29.A0ARrdaM-EXAMPLE_TOKEN_HERE",
]

SYNTHETIC_NEGATIVES = [
    # Normal prose
    "Hello, could you please review this pull request and let me know your thoughts?",
    "The meeting is scheduled for 3pm on Friday. Please bring your laptop.",
    "I've updated the README with the new installation instructions.",
    # Code comments
    "// This function calculates the Fibonacci sequence iteratively",
    "# Load configuration from environment variables",
    "/* TODO: Add unit tests for the payment module */",
    # Config templates
    "DATABASE_HOST=localhost",
    "PORT=3000",
    "NODE_ENV=development",
    "API_URL=https://api.example.com",
    # Example/placeholder values
    "api_key=YOUR_API_KEY_HERE",
    "password=<your_password>",
    "token=REPLACE_WITH_TOKEN",
    "secret=xxxxxxxxxxxxxxxxxxxx",
    # Normal emails
    "Please find the attached invoice for last month's services.",
    "Looking forward to our call tomorrow morning at 10am EST.",
    # Documentation
    "For more information, see the documentation at https://docs.example.com",
    "Example usage: kasbah scan --text 'hello world'",
    # Short benign texts
    "git commit -m 'Fix typo in README'",
    "npm install --save-dev typescript",
    "def fibonacci(n): return n if n <= 1 else fibonacci(n-1) + fibonacci(n-2)",
    # Markdown
    "## Getting Started\n\nClone the repository and run `npm install`.",
    "| Feature | Status |\n|---------|--------|\n| Auth | ✅ Done |",
    # Error messages
    "Error: Connection refused to localhost:5432",
    "Warning: deprecated method called in utils.js:42",
    "TypeError: Cannot read property 'id' of undefined",
    # Numbers that look like IDs but aren't secrets
    "Order ID: 7823901",
    "Invoice #: 2024-00123456",
    "Reference: 123-45",
]


def build_synthetic_dataset():
    """Build a balanced synthetic training corpus."""
    texts, labels = [], []
    for text in SYNTHETIC_POSITIVES:
        texts.append(text)
        labels.append(1)
    for text in SYNTHETIC_NEGATIVES:
        texts.append(text)
        labels.append(0)
    # Augment positives with minor variations
    augmented = []
    for text in SYNTHETIC_POSITIVES[:10]:
        augmented.append((text.replace('=', ': '), 1))
        augmented.append((text.lower(), 1))
    for t, l in augmented:
        texts.append(t)
        labels.append(l)
    return texts, labels


def load_dataset_from_dirs(pos_dir: str, neg_dir: str):
    """Load labeled samples from positive/negative directories."""
    texts, labels = [], []
    for path in Path(pos_dir).rglob('*'):
        if path.is_file():
            try:
                texts.append(path.read_text(errors='replace'))
                labels.append(1)
            except Exception as e:
                print(f"  SKIP {path.name} (pos): {e}", file=sys.stderr)
    for path in Path(neg_dir).rglob('*'):
        if path.is_file():
            try:
                texts.append(path.read_text(errors='replace'))
                labels.append(0)
            except Exception as e:
                print(f"  SKIP {path.name} (neg): {e}", file=sys.stderr)
    return texts, labels


# ═══════════════════════════════════════════════════════════════════
# Stump extraction from trained GBM
# ═══════════════════════════════════════════════════════════════════

def extract_stumps(clf, n_stumps: int = 20) -> list:
    """
    Extract [feat_idx, threshold, leaf_pos, leaf_neg, weight] from
    a trained GradientBoostingClassifier with max_depth=1.

    Each GBM estimator is a single-split DecisionTreeRegressor.
    We extract the split feature, threshold, and the two leaf values,
    then scale by the learning_rate to match the additive log-odds sum.
    """
    stumps = []
    lr = clf.learning_rate
    estimators = clf.estimators_

    for i, stage in enumerate(estimators[:n_stumps]):
        tree = stage[0].tree_
        # Node 0 is always the root (the split node in a depth-1 tree)
        feat = int(tree.feature[0])
        threshold = float(tree.threshold[0])
        # Left child (node 1) = feature <= threshold
        # Right child (node 2) = feature > threshold
        left_val = float(tree.value[1][0][0])   # leaf for feature <= threshold
        right_val = float(tree.value[2][0][0])  # leaf for feature > threshold
        # In GBM: leaf_pos = prediction when feature > threshold (positive direction)
        leaf_pos = round(right_val * lr, 6)
        leaf_neg = round(left_val * lr, 6)
        stumps.append([feat, round(threshold, 4), leaf_pos, leaf_neg, 1.0])

    return stumps


# ═══════════════════════════════════════════════════════════════════
# Output formatting
# ═══════════════════════════════════════════════════════════════════

FEATURE_NAMES = [
    'f0 entropy', 'f1 tier_density', 'f2 rule_score',
    'f3 has_T1', 'f4 has_T1b_key', 'f5 has_T1c_cloud_key',
    'f6 has_T1e_financial', 'f7 has_T1f_PHI', 'f8 has_T1g_IP',
    'f9 has_T1h_legal', 'f10 has_T2', 'f11 has_T3',
    'f12 text_length', 'f13 digit_ratio', 'f14 upper_ratio', 'f15 special_ratio',
]


def format_stumps_js(stumps: list, meta: dict) -> str:
    """Format stumps as the _ML_STUMPS JS array with provenance header."""
    lines = []
    lines.append(f"// TRAINED: {meta['date']}")
    lines.append(f"// dataset: {meta['dataset']}")
    lines.append(f"// n_samples: {meta['n_samples']} (pos={meta['n_pos']}, neg={meta['n_neg']})")
    lines.append(f"// val_auc: {meta['val_auc']:.4f}")
    lines.append(f"// train_auc: {meta['train_auc']:.4f}")
    lines.append(f"// n_stumps: {len(stumps)}, learning_rate: {meta['learning_rate']}")
    lines.append(f"// sha256_fingerprint: {meta['fingerprint']}")
    lines.append("var _ML_STUMPS = [")
    lines.append("  // [feat_idx, split_threshold, leaf_pos, leaf_neg, stump_weight]")
    for i, s in enumerate(stumps):
        fname = FEATURE_NAMES[s[0]] if s[0] < len(FEATURE_NAMES) else f'f{s[0]}'
        lines.append(f"  [{s[0]}, {s[1]}, {s[2]}, {s[3]}, {s[4]}],  // {fname}")
    lines.append("];")
    return '\n'.join(lines)


def patch_detector_js(stumps_js: str, detector_path: str):
    """Replace _ML_STUMPS array in detector.js with newly trained values."""
    text = Path(detector_path).read_text()
    # Match from `var _ML_STUMPS = [` to the closing `];`
    pattern = re.compile(
        r'(// TRAINED:.*?\n)?var _ML_STUMPS = \[.*?\];',
        re.DOTALL
    )
    if not pattern.search(text):
        print(f"ERROR: Could not find _ML_STUMPS in {detector_path}", file=sys.stderr)
        sys.exit(1)
    new_text = pattern.sub(stumps_js, text, count=1)
    Path(detector_path).write_text(new_text)
    print(f"✅ Patched _ML_STUMPS in {detector_path}")


# ═══════════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description='Train Kasbah Guard ML stumps')
    parser.add_argument('--synthetic', action='store_true',
                        help='Use synthetic dataset (no real data needed)')
    parser.add_argument('--pos-dir', type=str, default='',
                        help='Directory of positive (secret-containing) samples')
    parser.add_argument('--neg-dir', type=str, default='',
                        help='Directory of negative (benign) samples')
    parser.add_argument('--n-stumps', type=int, default=20,
                        help='Number of stumps to train (default: 20)')
    parser.add_argument('--learning-rate', type=float, default=0.1,
                        help='GBM learning rate (default: 0.1)')
    parser.add_argument('--out', type=str, default='',
                        help='Write _ML_STUMPS JS block to this file')
    parser.add_argument('--update-detector', action='store_true',
                        help='Patch _ML_STUMPS directly into all 6 detector.js copies')
    args = parser.parse_args()

    if not SKLEARN_AVAILABLE:
        print("ERROR: scikit-learn not installed. Run: pip install scikit-learn numpy", file=sys.stderr)
        sys.exit(1)

    # ── Load dataset ──
    if args.synthetic:
        print("Using synthetic dataset (development mode)")
        texts, labels = build_synthetic_dataset()
        dataset_name = 'synthetic-v1'
    elif args.pos_dir and args.neg_dir:
        print(f"Loading from {args.pos_dir} (pos) and {args.neg_dir} (neg)")
        texts, labels = load_dataset_from_dirs(args.pos_dir, args.neg_dir)
        dataset_name = f'{Path(args.pos_dir).name}+{Path(args.neg_dir).name}'
    else:
        print("ERROR: provide --synthetic OR both --pos-dir and --neg-dir", file=sys.stderr)
        sys.exit(1)

    print(f"Dataset: {len(texts)} samples ({sum(labels)} pos, {len(labels)-sum(labels)} neg)")

    # ── Extract features ──
    X = np.array([extract_features(t) for t in texts])
    y = np.array(labels)

    # ── Train/val split ──
    X_train, X_val, y_train, y_val = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    # ── Train GBM ──
    clf = GradientBoostingClassifier(
        n_estimators=args.n_stumps,
        max_depth=1,
        learning_rate=args.learning_rate,
        subsample=0.8,
        random_state=42,
    )
    clf.fit(X_train, y_train)

    # ── Evaluate ──
    train_auc = roc_auc_score(y_train, clf.predict_proba(X_train)[:, 1])
    val_auc = roc_auc_score(y_val, clf.predict_proba(X_val)[:, 1])
    print(f"Train AUC: {train_auc:.4f}")
    print(f"Val   AUC: {val_auc:.4f}")
    print(classification_report(y_val, clf.predict(X_val), target_names=['benign', 'secret']))

    # ── Extract stumps ──
    stumps = extract_stumps(clf, n_stumps=args.n_stumps)

    # ── Build metadata ──
    stumps_json = json.dumps(stumps)
    fingerprint = hashlib.sha256(stumps_json.encode()).hexdigest()[:16]
    meta = {
        'date': datetime.now(timezone.utc).strftime('%Y-%m-%d'),
        'dataset': dataset_name,
        'n_samples': len(texts),
        'n_pos': int(sum(labels)),
        'n_neg': int(len(labels) - sum(labels)),
        'val_auc': val_auc,
        'train_auc': train_auc,
        'learning_rate': args.learning_rate,
        'fingerprint': fingerprint,
    }

    # ── Format output ──
    stumps_js = format_stumps_js(stumps, meta)
    print("\n── Generated _ML_STUMPS ──")
    print(stumps_js)

    if args.out:
        Path(args.out).write_text(stumps_js)
        print(f"\n✅ Written to {args.out}")

    if args.update_detector:
        # All 6 detector.js copies
        script_dir = Path(__file__).parent
        repo_root = script_dir.parent
        detector_copies = [
            repo_root / 'kasbah-guard-dist/extensions/chrome/src/detector.js',
            repo_root / 'kasbah-guard-dist/extensions/firefox/src/detector.js',
            repo_root / 'kasbah-guard-dist/extensions/edge/src/detector.js',
            repo_root / 'kasbah-guard-dist/extensions/opera/src/detector.js',
            repo_root / 'kasbah-guard-dist/extensions/safari/Kasbah Guard/Kasbah Guard Extension/Resources/src/detector.js',
            repo_root / 'kasbah-guard-dist/apps/desktop/src-tauri/extension/src/detector.js',
        ]
        for path in detector_copies:
            if path.exists():
                patch_detector_js(stumps_js, str(path))
            else:
                print(f"SKIP: {path} not found")

        # Verify all copies now have same hash
        hashes = {}
        for path in detector_copies:
            if path.exists():
                h = hashlib.md5(path.read_bytes()).hexdigest()
                hashes[str(path)] = h
        unique = set(hashes.values())
        if len(unique) == 1:
            print(f"\n✅ All {len(hashes)} detector.js copies identical: {list(unique)[0]}")
        else:
            print(f"\n⚠️  Hash mismatch across detector.js copies:")
            for p, h in hashes.items():
                print(f"  {h}  {p}")


if __name__ == '__main__':
    main()
