# Camera Artifacts Detection Model

## Overview

Detects AI-generated image artifacts, JPEG blocking, deepfake compression
signatures, and camera sensor noise inconsistencies.  Used by Kasbah Guard's
egress gate to flag screenshots or images that appear to originate from
AI-generated or manipulated sources.

---

## Architecture — EfficientNet-B0 CNN

```
Input (224 × 224 × 3)  RGB float tensor, values in [0.0, 1.0]
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│  Stem Conv  3×3, stride 2, 32 filters, BN + SiLU               │
├─────────────────────────────────────────────────────────────────┤
│  MBConv1    3×3 dw, 1×,  16 ch,  no SE,  stride 1              │
│  MBConv6    3×3 dw, 6×,  24 ch,  SE 0.25, stride 2  ×2 blocks  │
│  MBConv6    5×5 dw, 6×,  40 ch,  SE 0.25, stride 2  ×2 blocks  │
│  MBConv6    3×3 dw, 6×,  80 ch,  SE 0.25, stride 2  ×3 blocks  │
│  MBConv6    5×5 dw, 6×, 112 ch,  SE 0.25, stride 1  ×3 blocks  │
│  MBConv6    5×5 dw, 6×, 192 ch,  SE 0.25, stride 2  ×4 blocks  │
│  MBConv6    3×3 dw, 6×, 320 ch,  SE 0.25, stride 1  ×1 block   │
├─────────────────────────────────────────────────────────────────┤
│  Head Conv  1×1, 1280 ch, BN + SiLU                             │
│  Global Average Pool  →  [batch, 1280]                          │
├─────────────────────────────────────────────────────────────────┤
│  Auxiliary input: artifact_score scalar  →  Dense(1)            │
│  Concatenate  →  [batch, 1281]                                  │
├─────────────────────────────────────────────────────────────────┤
│  Dropout(0.2)                                                   │
│  Dense(256, SiLU)                                               │
│  Dense(1, Sigmoid)   →  P(camera artifact)                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Input Shape

| Tensor            | Shape              | Type    | Range        |
|-------------------|--------------------|---------|--------------|
| `pixel_values`    | `[B, 224, 224, 3]` | float32 | `[0.0, 1.0]` |
| `artifact_score`  | `[B, 1]`           | float32 | `[0.0, 1.0]` |

The `artifact_score` is produced by
`VideoFrameExtractor::detect_compression_artifacts` and is appended as the
last element of the flat vector returned by
`VideoFrameExtractor::preprocess_for_camera_artifacts`.

Preprocessing (done in `kasbah-signal-processing`):
1. Load image (any format supported by the `image` crate).
2. Resize to 224 × 224 using bilinear interpolation.
3. Normalise pixels to `[0.0, 1.0]` (divide by 255).
4. Compute `artifact_score` via DCT block-boundary analysis.
5. Shape pixel tensor as `[1, 224, 224, 3]` for batch size 1.

---

## Output Shape

| Tensor        | Shape    | Type    | Interpretation                     |
|---------------|----------|---------|------------------------------------|
| `probability` | `[B, 1]` | float32 | P(AI-generated / camera artifact)  |

Decision threshold: **0.5** (configurable at inference time in `kasbah-onnx-runtime`).

---

## Training Data Requirements

| Category                   | Min. Samples | Notes                                      |
|----------------------------|--------------|--------------------------------------------|
| Real photographs           | 50,000       | Raw from DSLR/phone cameras, unedited      |
| AI-generated (diffusion)   | 50,000       | Stable Diffusion, Midjourney, DALL-E 3     |
| AI-generated (GAN)         | 20,000       | StyleGAN3, BigGAN outputs                  |
| Screenshot / screen-cap    | 10,000       | OS screenshots, browser captures          |
| JPEG-compressed (Q 10–50)  | 10,000       | Real photos re-saved at low quality        |
| Deepfake video frames      | 10,000       | FaceForensics++ dataset                    |

**Data split:** 80% train / 10% validation / 10% test.

**Augmentation:** random horizontal flip, colour jitter (±0.2 brightness,
±0.2 contrast), random 90° rotation.  Do NOT augment with JPEG re-compression
(it would corrupt the artifact signal).

---

## Performance Targets

| Metric              | Target   | Measurement Dataset        |
|---------------------|----------|----------------------------|
| AUC-ROC             | ≥ 0.95   | Held-out test set          |
| Precision @ 0.5     | ≥ 0.90   | Held-out test set          |
| Recall @ 0.5        | ≥ 0.90   | Held-out test set          |
| Latency (CPU)       | ≤ 50 ms  | M1 MacBook, batch size 1   |
| Latency (GPU)       | ≤ 5 ms   | NVIDIA T4, batch size 1    |
| ONNX model size     | ≤ 25 MB  | Post quantisation (INT8)   |

---

## Training Framework

```
Framework:   PyTorch 2.x + torchvision
Optimiser:   AdamW, lr = 1e-4, weight_decay = 1e-2
Scheduler:   Cosine annealing, T_max = 50 epochs
Loss:        Binary cross-entropy with label smoothing (0.05)
Batch size:  64
Mixed prec.: torch.cuda.amp (bfloat16)
```

---

## ONNX Export

```bash
# After training, export from PyTorch:
python -c "
import torch
import torchvision.models as models

model = EfficientNetArtifactDetector()          # project-local class
model.load_state_dict(torch.load('checkpoint_best.pth'))
model.eval()

dummy_pixels = torch.randn(1, 3, 224, 224)     # NCHW for PyTorch
dummy_score  = torch.randn(1, 1)

torch.onnx.export(
    model,
    (dummy_pixels, dummy_score),
    'camera-artifacts.onnx',
    input_names  = ['pixel_values', 'artifact_score'],
    output_names = ['probability'],
    dynamic_axes = {
        'pixel_values':  {0: 'batch'},
        'artifact_score':{0: 'batch'},
        'probability':   {0: 'batch'},
    },
    opset_version = 17,
)
"

# Quantise to INT8 for deployment:
python -m onnxruntime.quantization.quantize \
    --model_input  camera-artifacts.onnx \
    --model_output camera-artifacts-int8.onnx \
    --quant_format QOperator \
    --weight_type  QInt8
```

Place the final `.onnx` file in this directory alongside `model.md`.

---

## Integration

```rust
// In kasbah-onnx-runtime (future):
use kasbah_signal_processing::VideoFrameExtractor;

let vfe = VideoFrameExtractor::new();
let flat = vfe.preprocess_for_camera_artifacts("frame.jpg", 224)?;
// flat[0..224*224*3] → pixel_values tensor [1, 224, 224, 3]
// flat[224*224*3]    → artifact_score [1, 1]
```

---

## Changelog

| Version | Date       | Notes                                        |
|---------|------------|----------------------------------------------|
| 0.1.0   | 2026-02-28 | Architecture specification drafted            |
| —       | TBD        | Training data collection                      |
| —       | TBD        | First training run                            |
| —       | TBD        | ONNX export + integration test                |
