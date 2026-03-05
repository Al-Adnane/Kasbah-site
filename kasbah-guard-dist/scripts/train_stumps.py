#!/usr/bin/env python3
"""
train_stumps.py — Reproducible training pipeline for Kasbah Guard _ML_STUMPS

Trains 150 gradient-boosted decision stumps (max_depth=1) that power the
mlScore() function in detector.js. Exports results in the exact JS array format:
  [feat_idx, threshold, leaf_pos, leaf_neg, stump_weight]

Usage:
  python3 scripts/train_stumps.py [--output detector.js] [--top 20]

Requirements:
  pip install scikit-learn numpy

Datasets (positives):
  - gitleaks test fixtures: https://github.com/gitleaks/gitleaks (tests/testdata/repos/)
  - detect-secrets corpus:  https://github.com/Yelp/detect-secrets (testing/plugins/)
  Place raw text samples in:
    scripts/data/positives/   (files containing real secrets / PHI / PII)
    scripts/data/negatives/   (files with safe prose, config, comments)

If data/ is absent, synthetic samples are generated to demonstrate the pipeline.
Replace synthetic data with real corpora before production use.
# TRAINED: {date}, dataset: {sources}, n_samples: {N}, val_auc: {auc}
"""

import argparse
import datetime
import json
import math
import os
import re
import sys

try:
    import numpy as np
    from sklearn.ensemble import GradientBoostingClassifier
    from sklearn.model_selection import train_test_split
    from sklearn.metrics import roc_auc_score
except ImportError:
    print("ERROR: pip install scikit-learn numpy", file=sys.stderr)
    sys.exit(1)


# ── Feature extraction (mirrors mlExtractFeatures in detector.js) ──────────────

def shannon_entropy(text):
    if not text:
        return 0.0
    freq = {}
    for ch in text:
        freq[ch] = freq.get(ch, 0) + 1
    n = len(text)
    return -sum((c / n) * math.log2(c / n) for c in freq.values() if c > 0)


T1_PATTERNS = [
    (r'(?i)(password|passwd|pwd)\s*[=:]\s*\S+', 'T1:password'),
    (r'(?:[A-Za-z0-9+/]{40,}={0,2})', 'T1:base64'),
    (r'(?i)(secret|token|api[_-]?key)\s*[=:]\s*\S+', 'T1:secret'),
]
T1B_PATTERNS = [
    (r'(?i)(confidential|proprietary|trade\s+secret)', 'T1b:doc'),
    (r'(?i)(internal\s+use\s+only|not\s+for\s+distribution)', 'T1b:doc'),
]
T1C_PATTERNS = [
    (r'AKIA[0-9A-Z]{16}', 'T1c:aws_key'),
    (r'AIza[0-9A-Za-z_\-]{35}', 'T1c:gcp_key'),
    (r'sk-[A-Za-z0-9]{48}', 'T1c:openai'),
    (r'ghp_[A-Za-z0-9]{36}', 'T1c:github'),
    (r'(?i)Bearer\s+[A-Za-z0-9\-._~+/]+=*', 'T1c:bearer'),
]
T1E_PATTERNS = [
    (r'\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b', 'T1e:card'),
    (r'(?i)(bank\s+account|routing\s+number|swift\s+code)', 'T1e:financial'),
    (r'\b\d{3}-\d{2}-\d{4}\b', 'T1e:ssn'),
]
T1F_PATTERNS = [
    (r'(?i)(patient\s+id|medical\s+record|diagnosis|prescription)', 'T1f:phi'),
    (r'(?i)(dob|date\s+of\s+birth)\s*[=:]\s*\S+', 'T1f:phi'),
]
T1G_PATTERNS = [
    (r'(?i)(patent|trade\s+secret|intellectual\s+property)', 'T1g:ip'),
    (r'(?i)(proprietary\s+algorithm|source\s+code|unreleased)', 'T1g:ip'),
]
T1H_PATTERNS = [
    (r'(?i)(nda|non.disclosure|attorney.client|privileged)', 'T1h:legal'),
    (r'(?i)(settlement\s+agreement|sealed|court\s+order)', 'T1h:legal'),
]
T2_PATTERNS = [
    (r'(?i)(private|sensitive|restricted)\s+', 'T2:moderate'),
    (r'(?i)do\s+not\s+(share|distribute|disclose)', 'T2:moderate'),
]
T3_PATTERNS = [
    (r'(?i)(top\s+secret|classified|eyes\s+only)', 'T3:advanced'),
    (r'\b[A-Z]{2,}\d{4,}\b', 'T3:id_pattern'),
]


def extract_tiers(text):
    tiers = set()
    for pattern, tag in T1_PATTERNS:
        if re.search(pattern, text):
            tiers.add(tag[:2] + ':')  # normalise to prefix
    for pattern, tag in T1B_PATTERNS:
        if re.search(pattern, text):
            tiers.add('T1b:')
    for pattern, tag in T1C_PATTERNS:
        if re.search(pattern, text):
            tiers.add('T1c:')
    for pattern, tag in T1E_PATTERNS:
        if re.search(pattern, text):
            tiers.add('T1e:')
    for pattern, tag in T1F_PATTERNS:
        if re.search(pattern, text):
            tiers.add('T1f:')
    for pattern, tag in T1G_PATTERNS:
        if re.search(pattern, text):
            tiers.add('T1g:')
    for pattern, tag in T1H_PATTERNS:
        if re.search(pattern, text):
            tiers.add('T1h:')
    for pattern, tag in T2_PATTERNS:
        if re.search(pattern, text):
            tiers.add('T2:')
    for pattern, tag in T3_PATTERNS:
        if re.search(pattern, text):
            tiers.add('T3:')
    return list(tiers)


def rule_score(text, tiers):
    """Approximate the JS rule_score (0-100 → normalised 0-1)."""
    score = 0
    if any(t.startswith('T1c:') for t in tiers):
        score += 90
    elif any(t.startswith('T1:') or t.startswith('T1f:') or t.startswith('T1e:') for t in tiers):
        score += 75
    elif any(t.startswith('T1b:') or t.startswith('T1g:') or t.startswith('T1h:') for t in tiers):
        score += 60
    elif any(t.startswith('T2:') for t in tiers):
        score += 40
    elif any(t.startswith('T3:') for t in tiers):
        score += 25
    return min(score / 100.0, 1.0)


def extract_features(text):
    """16-feature vector matching mlExtractFeatures() in detector.js."""
    t = text or ''
    n = max(len(t), 1)
    entropy = shannon_entropy(t)
    tiers = extract_tiers(t)
    score = rule_score(t, tiers)

    return [
        min(entropy / 6.0, 1.0),                                          # f0: entropy
        min(len(tiers) / 10.0, 1.0),                                      # f1: tier_density
        score,                                                              # f2: rule_score
        1 if any(x.startswith('T1:') for x in tiers) else 0,             # f3: has_T1
        1 if any(x.startswith('T1b:') for x in tiers) else 0,            # f4: has_T1b
        1 if any(x.startswith('T1c:') for x in tiers) else 0,            # f5: has_T1c api secret
        1 if any(x.startswith('T1e:') for x in tiers) else 0,            # f6: has_T1e financial
        1 if any(x.startswith('T1f:') for x in tiers) else 0,            # f7: has_T1f PHI
        1 if any(x.startswith('T1g:') for x in tiers) else 0,            # f8: has_T1g IP
        1 if any(x.startswith('T1h:') for x in tiers) else 0,            # f9: has_T1h legal
        1 if any(x.startswith('T2:') for x in tiers) else 0,             # f10: has_T2
        1 if any(x.startswith('T3:') for x in tiers) else 0,             # f11: has_T3
        min(len(t) / 5000.0, 1.0),                                        # f12: text_length
        len(re.findall(r'\d', t)) / n,                                     # f13: digit_ratio
        len(re.findall(r'[A-Z]', t)) / n,                                  # f14: upper_ratio
        len(re.findall(r'[^a-zA-Z0-9\s]', t)) / n,                       # f15: special_ratio
    ]


# ── Dataset loading ─────────────────────────────────────────────────────────────

def load_from_dir(path):
    samples = []
    if not os.path.isdir(path):
        return samples
    for fname in os.listdir(path):
        fpath = os.path.join(path, fname)
        if os.path.isfile(fpath):
            try:
                with open(fpath, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
                    # Split into ~500-char chunks so each sample is tractable
                    for i in range(0, len(content), 500):
                        chunk = content[i:i + 500].strip()
                        if len(chunk) > 20:
                            samples.append(chunk)
            except Exception:
                pass
    return samples


def generate_synthetic_samples():
    """
    Synthetic fallback when real corpora are absent.
    Replace with real gitleaks/detect-secrets fixtures for production.
    """
    positives = [
        'AKIA1A2B3C4D5E6F7G8H',
        'password=SuperSecret123!',
        'api_key: sk-abc123defghijklmnopqrstuvwxyz1234567890abcd',
        'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0',
        'SSN: 123-45-6789',
        '4532 1234 5678 9012',
        'Patient ID: MR-9912345, Diagnosis: hypertension',
        'Top Secret - Eyes Only - NDA bound',
        'ghp_aAbBcCdDeEfFgGhHiIjJkKlLmMnNoOpP',
        'AIzaSyB1a2c3d4e5f6g7h8i9j0k1l2m3n4o5p6',
        'db_password: hunter2',
        'client_secret=a1b2c3d4e5f6g7h8i9j0',
        'CONFIDENTIAL: internal use only',
        'private_key = "-----BEGIN RSA PRIVATE KEY-----"',
        'credit_card = 5500 0000 0000 0004, cvv=123',
        'Date of birth: 1985-04-12, medical record 9988776',
        'patent pending - trade secret - not for distribution',
        'attorney-client privileged communication',
        'settlement agreement - sealed by court order',
        'Token: xoxp-XXXXXXXXXXX-YYYYYYYYYYY-ZZZZZZZZZZZ',
    ] * 30  # 600 positive samples

    negatives = [
        'The quick brown fox jumps over the lazy dog.',
        'config = { debug: false, version: "1.0.0" }',
        'TODO: add unit tests for the login form',
        'import React from "react";',
        '# This is a comment in a config file',
        'SELECT * FROM users WHERE active = 1',
        'function add(a, b) { return a + b; }',
        'Meeting scheduled for Tuesday at 3pm',
        'The weather today is partly cloudy with a high of 72F',
        'npm install --save-dev eslint',
        'docker run -it ubuntu bash',
        'git commit -m "fix typo in README"',
        'const x = 42; const y = "hello";',
        'pip install requests==2.28.0',
        'curl https://example.com/api/health',
        'echo "Hello, World!"',
        'ls -la /tmp',
        'cat /etc/hosts',
        '{ "name": "test", "version": "1.0.0" }',
        'def main(): print("starting")',
    ] * 50  # 1000 negative samples

    return positives, negatives


def load_dataset(data_dir):
    pos_dir = os.path.join(data_dir, 'positives')
    neg_dir = os.path.join(data_dir, 'negatives')

    positives = load_from_dir(pos_dir)
    negatives = load_from_dir(neg_dir)

    if not positives or not negatives:
        print(f"[train_stumps] No data found in {data_dir}/ — using synthetic samples.")
        print("[train_stumps] For production, place real corpora in scripts/data/positives/ and scripts/data/negatives/")
        positives, negatives = generate_synthetic_samples()

    return positives, negatives


# ── Training ────────────────────────────────────────────────────────────────────

def train(data_dir, n_stumps, random_state=42):
    positives, negatives = load_dataset(data_dir)

    texts = positives + negatives
    labels = [1] * len(positives) + [0] * len(negatives)

    print(f"[train_stumps] Dataset: {len(positives)} positives, {len(negatives)} negatives")

    X = np.array([extract_features(t) for t in texts])
    y = np.array(labels)

    X_train, X_val, y_train, y_val = train_test_split(
        X, y, test_size=0.2, random_state=random_state, stratify=y
    )

    clf = GradientBoostingClassifier(
        n_estimators=n_stumps,
        max_depth=1,          # decision stumps
        learning_rate=0.1,
        subsample=0.8,
        random_state=random_state,
    )
    clf.fit(X_train, y_train)

    val_probs = clf.predict_proba(X_val)[:, 1]
    auc = roc_auc_score(y_val, val_probs)
    print(f"[train_stumps] Validation AUC: {auc:.4f} (n_estimators={n_stumps})")

    return clf, auc, len(texts)


def extract_stumps(clf):
    """
    Extract [feat_idx, threshold, leaf_pos, leaf_neg, weight] from
    GradientBoostingClassifier's decision stumps (max_depth=1 trees).
    """
    stumps = []
    for i, tree_arr in enumerate(clf.estimators_):
        tree = tree_arr[0].tree_
        # Stump structure: node 0 = root split, nodes 1 & 2 = leaves
        feat_idx = int(tree.feature[0])
        threshold = float(tree.threshold[0])
        # Leaf values are in shape (n_node, n_outputs, max_n_classes)
        leaf_left = float(tree.value[1][0][0])   # node 1 = left (<=threshold)
        leaf_right = float(tree.value[2][0][0])  # node 2 = right (>threshold)
        weight = float(clf.learning_rate)

        # leaf_pos = value when feature > threshold (positive side)
        # leaf_neg = value when feature <= threshold (negative side)
        stumps.append([feat_idx, threshold, round(leaf_right, 4), round(leaf_left, 4), weight])

    return stumps


# ── JS export ──────────────────────────────────────────────────────────────────

FEATURE_NAMES = [
    'f0 entropy', 'f1 tier_density', 'f2 rule_score', 'f3 has_T1',
    'f4 has_T1b', 'f5 has_T1c_api', 'f6 has_T1e_fin', 'f7 has_T1f_phi',
    'f8 has_T1g_ip', 'f9 has_T1h_legal', 'f10 has_T2', 'f11 has_T3',
    'f12 text_len', 'f13 digit_ratio', 'f14 upper_ratio', 'f15 special_ratio',
]


def format_stumps_js(stumps, auc, n_samples, sources, top_n):
    """Format the top_n stumps as the _ML_STUMPS JS array."""
    date_str = datetime.date.today().isoformat()
    lines = [
        f'// TRAINED: {date_str}, dataset: {sources}, n_samples: {n_samples}, val_auc: {auc:.4f}',
        f'// Pipeline: sklearn GBC, n_estimators={len(stumps)}, max_depth=1, lr=0.1, subsample=0.8',
        f'// Feature vector: 16 features (f0–f15) — see mlExtractFeatures() in detector.js',
        f'// Top {top_n} stumps by |leaf_pos| exported (highest signal):',
        'var _ML_STUMPS = [',
        '  // [feat_idx, threshold, leaf_pos, leaf_neg, stump_weight]',
    ]

    # Sort stumps by abs(leaf_pos) descending — highest signal first
    ranked = sorted(stumps, key=lambda s: abs(s[2]), reverse=True)[:top_n]

    for s in ranked:
        feat = FEATURE_NAMES[s[0]] if s[0] < len(FEATURE_NAMES) else f'f{s[0]}'
        lines.append(f'  [{s[0]}, {s[1]:.4f}, {s[2]:.4f}, {s[3]:.4f}, {s[4]:.1f}],  // {feat}')

    lines.append('];')
    return '\n'.join(lines)


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='Train Kasbah Guard ML stumps')
    parser.add_argument('--data-dir', default=os.path.join(os.path.dirname(__file__), 'data'),
                        help='Directory with positives/ and negatives/ subdirs')
    parser.add_argument('--n-estimators', type=int, default=150,
                        help='Number of GBM trees to train (default: 150)')
    parser.add_argument('--top', type=int, default=20,
                        help='Number of top stumps to export (default: 20)')
    parser.add_argument('--sources', default='synthetic',
                        help='Dataset sources label for the header comment')
    parser.add_argument('--output', default=None,
                        help='Write _ML_STUMPS block to this file (default: print to stdout)')
    args = parser.parse_args()

    clf, auc, n_samples = train(args.data_dir, args.n_estimators)
    stumps = extract_stumps(clf)

    js_block = format_stumps_js(stumps, auc, n_samples, args.sources, args.top)

    if args.output:
        with open(args.output, 'w') as f:
            f.write(js_block + '\n')
        print(f"[train_stumps] Wrote {args.top} stumps to {args.output}")
    else:
        print('\n' + js_block)

    print(f"\n[train_stumps] Done — AUC={auc:.4f}, n_samples={n_samples}")
    print("[train_stumps] Copy the _ML_STUMPS block into detector.js and sync all 6 copies.")
    print("[train_stumps] Verify: node /tmp/kasbah-market-launch.cjs  # must stay 58/58")


if __name__ == '__main__':
    main()
