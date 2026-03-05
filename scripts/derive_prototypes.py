#!/usr/bin/env python3
"""
derive_prototypes.py — Kasbah Guard Image Prototype Derivation Pipeline
========================================================================
Derives K-means centroids for each AI image generator class and calibrates
the AI_THRESHOLD via Youden's J statistic on the ROC curve.

Outputs updated PROTOS, NATURAL_PROTO, AI_THRESHOLD, and PROTOTYPE_VERSION
constants for kasbah-frontier-image.js.

Feature vector: [kurt/10, |psdSlope|/5, dct_high_band, checkerboard_var]
Matches kasbah-frontier-image.js feature extraction exactly.

Usage:
  # With real image datasets:
  pip install scikit-learn numpy Pillow scipy
  python scripts/derive_prototypes.py --data-dir data/images/ --out prototypes.js

  # With synthetic data (for CI/development):
  python scripts/derive_prototypes.py --synthetic --out prototypes.js

  # Update frontier image JS in place:
  python scripts/derive_prototypes.py --synthetic --update-js

Dataset Layout (for real data):
  data/images/
    natural/          ← pristine photos (FF++ reference, FFHQ, etc.)
    stable-diffusion/ ← SD-generated images (FF++ DFDC frames)
    dall-e/           ← DALL-E 3 generated images
    midjourney/       ← Midjourney v6 generated images
    stylegan3/        ← StyleGAN3 generated images
    flux/             ← FLUX.1 generated images

  Recommended: 200+ images per class, 256×256 or larger PNG/JPEG.

Dataset Sources:
  FaceForensics++: https://github.com/ondyari/FaceForensics
  DFDC:            https://ai.facebook.com/datasets/dfdc/
  FFHQ:            https://github.com/NVlabs/ffhq-dataset

References:
  Rössler et al., "FaceForensics++", ICCV 2019
  Dolhansky et al., "DFDC", 2020
  Youden, W.J., "Index for rating diagnostic tests", Cancer, 1950
"""

import argparse
import hashlib
import json
import math
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

# ── Optional dependency imports ──
try:
    import numpy as np
    NUMPY_AVAILABLE = True
except ImportError:
    NUMPY_AVAILABLE = False

try:
    from PIL import Image
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False

try:
    from sklearn.cluster import KMeans
    from sklearn.metrics import roc_auc_score, roc_curve
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False


# ═══════════════════════════════════════════════════════════════════
# Feature extraction — mirrors kasbah-frontier-image.js exactly
# ═══════════════════════════════════════════════════════════════════

def to_gray(img_array: 'np.ndarray') -> 'np.ndarray':
    """
    Convert RGBA/RGB image array to grayscale float [0,1].
    Matches toGray() in kasbah-frontier-image.js:
      g[i] = (R*0.299 + G*0.587 + B*0.114) / 255
    """
    if img_array.ndim == 3 and img_array.shape[2] >= 3:
        r = img_array[:, :, 0].astype(float)
        g = img_array[:, :, 1].astype(float)
        b = img_array[:, :, 2].astype(float)
        return (r * 0.299 + g * 0.587 + b * 0.114) / 255.0
    elif img_array.ndim == 2:
        return img_array.astype(float) / 255.0
    return img_array[:, :, 0].astype(float) / 255.0


def noise_kurtosis(gray: 'np.ndarray') -> float:
    """
    Compute noise kurtosis from 8×8 block residuals.
    Matches noiseKurtosis() in kasbah-frontier-image.js.
    Natural images: high kurtosis (~6). AI images: lower (~3–4).
    """
    H, W = gray.shape
    B = 8
    residuals = []
    for by in range(0, H - B + 1, B):
        for bx in range(0, W - B + 1, B):
            block = gray[by:by+B, bx:bx+B]
            mean = block.mean()
            residuals.extend((block - mean).flatten().tolist())
    residuals = np.array(residuals)
    if len(residuals) < 4:
        return 3.0
    m2 = np.mean(residuals ** 2)
    m4 = np.mean(residuals ** 4)
    return float(m4 / (m2 * m2)) if m2 > 1e-10 else 3.0


def dft_power(row: 'np.ndarray') -> 'np.ndarray':
    """
    Compute power spectrum of a 1D signal via DFT.
    Returns the first half (positive frequencies).
    """
    n = len(row)
    power = np.zeros(n // 2)
    for k in range(n // 2):
        re = np.sum(row * np.cos(2 * math.pi * k * np.arange(n) / n))
        im = np.sum(row * np.sin(2 * math.pi * k * np.arange(n) / n))
        power[k] = re * re + im * im
    return power


def psd_slope(gray: 'np.ndarray') -> float:
    """
    Compute log-log PSD slope along center row.
    Matches psdSlope() in kasbah-frontier-image.js.
    Natural images: steeper slope (~-2). AI images: flatter (~-3 to -3.4).
    """
    H, W = gray.shape
    W_sample = min(W, 128)
    mid_y = H // 2
    xs = np.arange(W_sample) * W // W_sample
    xs = np.clip(xs, 0, W - 1).astype(int)
    row = gray[mid_y, xs]

    power = dft_power(row)
    half = len(power)

    lx_vals, ly_vals = [], []
    for k in range(half):
        if power[k] > 0:
            lx_vals.append(math.log(k + 1))
            ly_vals.append(math.log(power[k]))

    if len(lx_vals) < 2:
        return -2.0

    lx = np.array(lx_vals)
    ly = np.array(ly_vals)
    cnt = len(lx)
    sum_x, sum_y = lx.sum(), ly.sum()
    sum_xx, sum_xy = (lx * lx).sum(), (lx * ly).sum()
    denom = cnt * sum_xx - sum_x * sum_x
    if abs(denom) < 1e-10:
        return -2.0
    return float((cnt * sum_xy - sum_x * sum_y) / denom)


def dct_bands(gray: 'np.ndarray') -> dict:
    """
    Compute DCT energy in low/mid/high frequency bands over 8×8 blocks.
    Matches dctBands() in kasbah-frontier-image.js.
    Returns {'low': float, 'mid': float, 'high': float} (normalized).
    AI images: more high-frequency energy.
    """
    H, W = gray.shape
    B = 8
    low = mid = high = 0.0

    for by in range(0, H - B + 1, B):
        for bx in range(0, W - B + 1, B):
            block = gray[by:by+B, bx:bx+B].copy()
            # Row DCT then column DCT (matching JS implementation)
            tmp = np.zeros((B, B))
            for r in range(B):
                for k in range(B):
                    tmp[r, k] = sum(
                        block[r, n] * math.cos((math.pi / B) * (n + 0.5) * k)
                        for n in range(B)
                    )
            out = np.zeros((B, B))
            for c in range(B):
                for k in range(B):
                    out[k, c] = sum(
                        tmp[n, c] * math.cos((math.pi / B) * (n + 0.5) * k)
                        for n in range(B)
                    )
            for r in range(B):
                for c in range(B):
                    e = out[r, c] ** 2
                    freq = r + c
                    if freq < 3:
                        low += e
                    elif freq < 8:
                        mid += e
                    else:
                        high += e

    tot = low + mid + high + 1e-9
    return {'low': low / tot, 'mid': mid / tot, 'high': high / tot}


def checkerboard_var(img_array: 'np.ndarray') -> float:
    """
    Compute checkerboard pattern variance (detects GAN spectral artifacts).
    Matches checkerboardVar() in kasbah-frontier-image.js.
    AI images: higher checkerboard variance.
    """
    H, W = img_array.shape[:2]
    H_s, W_s = min(H, 64), min(W, 64)
    even = odd = count = 0.0

    for y in range(H_s):
        for x in range(W_s):
            if img_array.ndim == 3:
                r, g, b = img_array[y, x, 0], img_array[y, x, 1], img_array[y, x, 2]
                v = (float(r) + float(g) + float(b)) / 3.0 / 255.0
            else:
                v = float(img_array[y, x]) / 255.0
            if (x + y) % 2 == 0:
                even += v
            else:
                odd += v
            count += 1

    if count < 2:
        return 0.0
    return min(1.0, abs(even - odd) / (count / 2) * 10)


def extract_features(img_path: str) -> list:
    """
    Extract 4-D feature vector from an image file.
    Vector: [kurt/10, |psdSlope|/5, dct_high_band, checkerboard_var]
    All values in [0, 1].
    """
    img = Image.open(img_path).convert('RGB')
    # Resize to 256×256 for consistent feature extraction
    img = img.resize((256, 256), Image.LANCZOS)
    arr = np.array(img)

    gray = to_gray(arr)
    kurt = noise_kurtosis(gray)
    slope = psd_slope(gray)
    bands = dct_bands(gray)
    cb_var = checkerboard_var(arr)

    return [
        min(1.0, kurt / 10.0),         # f0: normalized kurtosis
        min(1.0, abs(slope) / 5.0),    # f1: normalized |PSD slope|
        bands['high'],                  # f2: DCT high-frequency energy ratio
        cb_var,                         # f3: checkerboard variance
    ]


# ═══════════════════════════════════════════════════════════════════
# Synthetic dataset (for CI — derived from the documented FF++/DFDC
# expected feature ranges in kasbah-frontier-image.js lines 466-490)
# ═══════════════════════════════════════════════════════════════════

# Generator centroids with variance (from FF++/DFDC documentation)
SYNTHETIC_PARAMS = {
    'natural':          {'mean': [0.62, 0.42, 0.08, 0.03], 'std': [0.06, 0.05, 0.02, 0.01]},
    'stable-diffusion': {'mean': [0.35, 0.64, 0.28, 0.38], 'std': [0.05, 0.05, 0.04, 0.08]},
    'dall-e':           {'mean': [0.32, 0.60, 0.24, 0.18], 'std': [0.04, 0.05, 0.03, 0.05]},
    'midjourney':       {'mean': [0.34, 0.62, 0.26, 0.29], 'std': [0.04, 0.05, 0.03, 0.06]},
    'stylegan3':        {'mean': [0.37, 0.68, 0.31, 0.52], 'std': [0.05, 0.06, 0.04, 0.10]},
    'flux':             {'mean': [0.33, 0.66, 0.30, 0.22], 'std': [0.04, 0.05, 0.03, 0.05]},
}

N_SYNTHETIC = 120  # samples per class


def build_synthetic_dataset() -> tuple:
    """
    Generate synthetic feature vectors using Gaussian sampling
    around the documented FF++/DFDC centroids.
    """
    rng = np.random.RandomState(42)
    features, labels, classes = [], [], []

    for cls, params in SYNTHETIC_PARAMS.items():
        mean = np.array(params['mean'])
        std = np.array(params['std'])
        samples = rng.normal(loc=mean, scale=std, size=(N_SYNTHETIC, 4))
        # Clamp to [0, 1]
        samples = np.clip(samples, 0.0, 1.0)
        for s in samples:
            features.append(s.tolist())
            labels.append(0 if cls == 'natural' else 1)
            classes.append(cls)

    return features, labels, classes


def load_dataset_from_dirs(data_dir: str) -> tuple:
    """Load features from labeled image directories."""
    if not PIL_AVAILABLE:
        print("ERROR: Pillow not installed. Run: pip install Pillow", file=sys.stderr)
        sys.exit(1)

    features, labels, classes = [], [], []
    data_path = Path(data_dir)
    generator_classes = [
        d.name for d in data_path.iterdir()
        if d.is_dir() and d.name != '__pycache__'
    ]

    for cls in generator_classes:
        cls_dir = data_path / cls
        is_ai = cls != 'natural'
        img_files = list(cls_dir.glob('*.jpg')) + list(cls_dir.glob('*.jpeg')) + \
                    list(cls_dir.glob('*.png')) + list(cls_dir.glob('*.webp'))
        print(f"  {cls}: {len(img_files)} images")
        for img_path in img_files:
            try:
                feat = extract_features(str(img_path))
                features.append(feat)
                labels.append(1 if is_ai else 0)
                classes.append(cls)
            except Exception as e:
                print(f"  SKIP {img_path.name}: {e}")

    return features, labels, classes


# ═══════════════════════════════════════════════════════════════════
# K-means centroid derivation
# ═══════════════════════════════════════════════════════════════════

def derive_centroids(features: list, classes: list, k: int = 1) -> dict:
    """
    Derive K-means centroids per generator class.
    k=1 for a single centroid (mean), k=3 for three sub-cluster centroids
    (captures within-class variance for models like StyleGAN3).
    Returns the centroid closest to the class mean as the representative prototype.
    """
    centroids = {}
    all_classes = sorted(set(classes))

    for cls in all_classes:
        cls_features = np.array([
            features[i] for i, c in enumerate(classes) if c == cls
        ])
        if len(cls_features) == 0:
            continue

        if k == 1 or len(cls_features) < k * 2:
            # Not enough samples for k clusters — use mean
            centroid = cls_features.mean(axis=0)
        else:
            km = KMeans(n_clusters=k, random_state=42, n_init=10)
            km.fit(cls_features)
            # Pick centroid closest to the class mean
            class_mean = cls_features.mean(axis=0)
            dists = np.linalg.norm(km.cluster_centers_ - class_mean, axis=1)
            centroid = km.cluster_centers_[np.argmin(dists)]

        centroids[cls] = [round(float(v), 4) for v in centroid]

    return centroids


# ═══════════════════════════════════════════════════════════════════
# Threshold calibration via Youden's J
# ═══════════════════════════════════════════════════════════════════

def l2dist(a, b):
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))


def score_sample(feat: list, centroids: dict, natural_proto: list) -> float:
    """
    Score a feature vector using the L2 distance ratio (matching metaLearning() in JS).
    Returns score in [0, 1] — higher = more likely AI-generated.
    """
    ai_keys = {k: v for k, v in centroids.items() if k != 'natural'}
    if not ai_keys:
        return 0.0
    min_ai_dist = min(l2dist(feat, proto) for proto in ai_keys.values())
    nat_dist = l2dist(feat, natural_proto)
    return min(1.0, nat_dist / (nat_dist + min_ai_dist + 1e-9))


def calibrate_threshold(features: list, labels: list,
                         centroids: dict, natural_proto: list) -> tuple:
    """
    Calibrate AI_THRESHOLD via Youden's J statistic:
      J = sensitivity + specificity - 1 = TPR - FPR
    Returns (optimal_threshold, auc).
    """
    scores = [score_sample(f, centroids, natural_proto) for f in features]
    auc = roc_auc_score(labels, scores)
    fpr, tpr, thresholds = roc_curve(labels, scores)
    j_scores = tpr - fpr
    best_idx = int(np.argmax(j_scores))
    optimal_threshold = float(thresholds[best_idx])
    return round(optimal_threshold, 4), round(auc, 4)


# ═══════════════════════════════════════════════════════════════════
# Output formatting
# ═══════════════════════════════════════════════════════════════════

def format_prototypes_js(centroids: dict, natural_proto: list,
                          threshold: float, meta: dict) -> str:
    """Format prototype constants as JS code with provenance header."""
    lines = []
    lines.append(f"// PROTOTYPE_VERSION: {meta['version']}")
    lines.append(f"// dataset: {meta['dataset']}")
    lines.append(f"// n_samples: {meta['n_samples']}")
    lines.append(f"// val_auc: {meta['val_auc']}")
    lines.append(f"// threshold_method: Youden's J on ROC curve")
    lines.append(f"// date: {meta['date']}")
    lines.append(f"// sha256_fingerprint: {meta['fingerprint']}")
    lines.append("")

    lines.append("var PROTOTYPE_VERSION = {")
    lines.append(f"  version: '{meta['version']}',")
    lines.append(f"  dataset: '{meta['dataset']}',")
    lines.append(f"  date: '{meta['date']}',")
    lines.append(f"  n_samples: {meta['n_samples']},")
    lines.append(f"  val_auc: {meta['val_auc']}")
    lines.append("};")
    lines.append("")

    lines.append("var PROTOS = {")
    ai_gens = {k: v for k, v in centroids.items() if k != 'natural'}
    for gen, proto in ai_gens.items():
        proto_str = '[' + ', '.join(str(v) for v in proto) + ']'
        lines.append(f"  '{gen}': {proto_str},")
    lines.append("};")
    lines.append("")

    nat_str = '[' + ', '.join(str(v) for v in natural_proto) + ']'
    lines.append(f"// Natural (pristine) centroid from reference set")
    lines.append(f"var NATURAL_PROTO = {nat_str};")
    lines.append("")

    lines.append(f"// Optimal threshold calibrated via Youden's J (AUC: {meta['val_auc']})")
    lines.append(f"var AI_THRESHOLD = {threshold};")

    return '\n'.join(lines)


def patch_frontier_image_js(proto_js: str, js_path: str):
    """Patch PROTOS, NATURAL_PROTO, AI_THRESHOLD, PROTOTYPE_VERSION into the JS file."""
    text = Path(js_path).read_text()

    # Patch AI_THRESHOLD
    text = re.sub(
        r'var AI_THRESHOLD\s*=\s*[\d.]+;',
        lambda m: [l for l in proto_js.split('\n') if 'var AI_THRESHOLD' in l][0],
        text
    )

    # Patch PROTOS block
    new_protos = re.search(r'var PROTOS = \{.*?\};', proto_js, re.DOTALL)
    old_protos = re.search(r'var PROTOS = \{.*?\};', text, re.DOTALL)
    if new_protos and old_protos:
        text = text[:old_protos.start()] + new_protos.group() + text[old_protos.end():]

    # Patch NATURAL_PROTO
    new_nat = re.search(r'var NATURAL_PROTO = \[.*?\];', proto_js)
    old_nat = re.search(r'var NATURAL_PROTO = \[.*?\];', text)
    if new_nat and old_nat:
        text = text[:old_nat.start()] + new_nat.group() + text[old_nat.end():]

    # Add or update PROTOTYPE_VERSION
    new_pv = re.search(r'var PROTOTYPE_VERSION = \{.*?\};', proto_js, re.DOTALL)
    old_pv = re.search(r'var PROTOTYPE_VERSION = \{.*?\};', text, re.DOTALL)
    if new_pv:
        if old_pv:
            text = text[:old_pv.start()] + new_pv.group() + text[old_pv.end():]
        else:
            # Insert before PROTOS
            protos_pos = text.find('var PROTOS')
            if protos_pos >= 0:
                text = text[:protos_pos] + new_pv.group() + '\n' + text[protos_pos:]

    Path(js_path).write_text(text)
    print(f"✅ Patched {js_path}")


# ═══════════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description='Derive Kasbah Guard image detection prototypes'
    )
    parser.add_argument('--synthetic', action='store_true',
                        help='Use synthetic dataset (no real images needed)')
    parser.add_argument('--data-dir', type=str, default='',
                        help='Root directory with per-generator subdirectories')
    parser.add_argument('--k', type=int, default=3,
                        help='K-means clusters per class (default: 3, uses closest to mean)')
    parser.add_argument('--out', type=str, default='',
                        help='Write prototype JS block to this file')
    parser.add_argument('--update-js', action='store_true',
                        help='Patch prototypes directly into kasbah-frontier-image.js')
    parser.add_argument('--version', type=str, default='1.1.0',
                        help='Prototype version string (default: 1.1.0)')
    args = parser.parse_args()

    if not NUMPY_AVAILABLE:
        print("ERROR: numpy not installed. Run: pip install numpy", file=sys.stderr)
        sys.exit(1)
    if not SKLEARN_AVAILABLE:
        print("ERROR: scikit-learn not installed. Run: pip install scikit-learn", file=sys.stderr)
        sys.exit(1)

    # ── Load dataset ──
    if args.synthetic:
        print("Using synthetic dataset (development mode)")
        features, labels, classes = build_synthetic_dataset()
        dataset_name = 'synthetic-FF++v1+DFDC-preview'
    elif args.data_dir:
        print(f"Loading images from {args.data_dir}")
        features, labels, classes = load_dataset_from_dirs(args.data_dir)
        dataset_name = Path(args.data_dir).name
    else:
        print("ERROR: provide --synthetic OR --data-dir", file=sys.stderr)
        sys.exit(1)

    print(f"Dataset: {len(features)} samples across {len(set(classes))} classes")
    for cls in sorted(set(classes)):
        n = sum(1 for c in classes if c == cls)
        print(f"  {cls}: {n} samples")

    # ── Derive centroids ──
    centroids = derive_centroids(features, classes, k=args.k)
    natural_proto = centroids.get('natural', [0.62, 0.42, 0.08, 0.03])

    print("\nDerived centroids:")
    for cls, proto in centroids.items():
        print(f"  {cls:20s}: {proto}")

    # ── Calibrate threshold ──
    threshold, auc = calibrate_threshold(features, labels, centroids, natural_proto)
    print(f"\nAUC: {auc:.4f}")
    print(f"Optimal threshold (Youden's J): {threshold:.4f}")

    # ── Build metadata ──
    proto_json = json.dumps({'centroids': centroids, 'natural': natural_proto,
                              'threshold': threshold})
    fingerprint = hashlib.sha256(proto_json.encode()).hexdigest()[:16]
    meta = {
        'version': args.version,
        'dataset': dataset_name,
        'n_samples': len(features),
        'val_auc': auc,
        'date': datetime.now(timezone.utc).strftime('%Y-%m'),
        'fingerprint': fingerprint,
    }

    # ── Format output ──
    proto_js = format_prototypes_js(centroids, natural_proto, threshold, meta)
    print("\n── Generated prototype constants ──")
    print(proto_js)

    if args.out:
        Path(args.out).write_text(proto_js)
        print(f"\n✅ Written to {args.out}")

    if args.update_js:
        script_dir = Path(__file__).parent
        repo_root = script_dir.parent
        # Find all copies of kasbah-frontier-image.js
        js_copies = list(repo_root.rglob('kasbah-frontier-image.js'))
        if not js_copies:
            print("ERROR: No kasbah-frontier-image.js found under repo root", file=sys.stderr)
            sys.exit(1)
        for js_path in js_copies:
            patch_frontier_image_js(proto_js, str(js_path))
        print(f"\n✅ Updated {len(js_copies)} kasbah-frontier-image.js file(s)")


if __name__ == '__main__':
    main()
