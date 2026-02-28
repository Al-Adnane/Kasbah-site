# Silent-Speech Detection Model

## Overview

Detects silent or subvocalised speech patterns — micro-muscle movements in the
throat, jaw, or lips that occur when a user is mentally rehearsing or
subvocalising text — from audio captured by a standard microphone.  Used by
Kasbah Guard to flag potential side-channel leakage of sensitive text via
audio emanation.

---

## Architecture — Bidirectional LSTM with Self-Attention

```
Input  [B, T, 39]   MFCC (13) + Δ (13) + ΔΔ (13) per frame
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│  Layer Norm (39)                                                │
├─────────────────────────────────────────────────────────────────┤
│  Bi-LSTM #1    hidden=256, dropout=0.3  →  [B, T, 512]         │
│  Bi-LSTM #2    hidden=256, dropout=0.3  →  [B, T, 512]         │
│  Bi-LSTM #3    hidden=128, dropout=0.2  →  [B, T, 256]         │
├─────────────────────────────────────────────────────────────────┤
│  Multi-Head Self-Attention                                      │
│    heads=8, d_model=256, d_ff=1024, dropout=0.1                │
│    →  [B, T, 256]                                               │
├─────────────────────────────────────────────────────────────────┤
│  Temporal Average Pooling  →  [B, 256]                          │
├─────────────────────────────────────────────────────────────────┤
│  Dense(128, ReLU)                                               │
│  Dropout(0.3)                                                   │
│  Dense(2, Softmax)   →  [P(no-speech), P(silent-speech)]       │
└─────────────────────────────────────────────────────────────────┘
```

Total parameters (approximate): **8.4M** (fp32) / **2.1M** (INT8 quantised).

---

## Input Shape

| Tensor        | Shape        | Type    | Notes                                  |
|---------------|--------------|---------|----------------------------------------|
| `mfcc_input`  | `[B, T, 39]` | float32 | T = variable number of 10 ms frames    |

**Feature computation** (done by `AudioPreprocessor::preprocess_for_silent_speech`):

1. Load 16 kHz mono WAV.
2. Peak-normalise to `[-1, 1]`.
3. Pre-emphasis filter (α = 0.97).
4. STFT: FFT size 512, hop 160 samples (10 ms @ 16 kHz).
5. Mel filterbank: 40 filters, 0 Hz – 8 kHz.
6. Log compression.
7. DCT-II → 13 MFCCs per frame.
8. Compute Δ and ΔΔ with context window ±2 frames.
9. Interleave → 39 features per frame.
10. Reshape flat output `[T × 39]` → `[1, T, 39]` for batch size 1.

Maximum supported sequence length: **1000 frames** (10 seconds).

---

## Output Shape

| Tensor        | Shape      | Type    | Interpretation                   |
|---------------|------------|---------|----------------------------------|
| `class_probs` | `[B, 2]`   | float32 | `[:,0]` no-speech, `[:,1]` silent-speech |

Decision threshold: **0.5** on `class_probs[:, 1]` (configurable).

---

## Training Data Requirements

| Split      | Positive (silent-speech) | Negative (ambient / breath noise) |
|------------|--------------------------|-----------------------------------|
| Train      | 10,000 clips             | 10,000 clips                      |
| Validation | 1,000 clips              | 1,000 clips                       |
| Test       | 1,000 clips              | 1,000 clips                       |

**Clip length:** 1–10 seconds (variable; pad/truncate to 10 s max for batching).

**Recording conditions:**
- Quiet office (SNR > 30 dB)
- Moderate noise (SNR 10–20 dB) with augmentation
- Multiple microphone types (condenser, dynamic, MEMS)
- Speakers: ≥ 100 unique subjects, balanced gender and age

**Subvocalisation categories to capture:**
- Counting silently
- Reading text mentally
- Typing passwords mentally
- Ambient breath / swallow noise (negatives)

**Augmentation:**
- Additive Gaussian noise (SNR 5–30 dB)
- Room impulse response convolution (OpenSLR26 RIRs)
- Time-stretch ×0.9–1.1, pitch-shift ±2 semitones
- Random gain scaling (0.5–2.0)

---

## Performance Targets

| Metric            | Target   | Measurement Dataset       |
|-------------------|----------|---------------------------|
| AUC-ROC           | ≥ 0.92   | Held-out test set         |
| F1 @ 0.5 thresh.  | ≥ 0.88   | Held-out test set         |
| False positive rate| ≤ 5%    | Ambient-noise-only clips  |
| Latency (CPU)     | ≤ 30 ms  | M1 MacBook, T=100 frames  |
| Latency (GPU)     | ≤ 3 ms   | NVIDIA T4, T=100 frames   |
| ONNX model size   | ≤ 10 MB  | Post quantisation (INT8)  |

---

## Training Framework

```
Framework:   PyTorch 2.x
Optimiser:   Adam, lr = 1e-3 → 1e-5 (ReduceLROnPlateau, patience=5)
Loss:        Cross-entropy with class weights [1.0, 2.0] (silent-speech upweighted)
Batch size:  32 (dynamic padding within batch)
Epochs:      100 (early stopping: patience 10 on validation F1)
Gradient clip: max_norm = 5.0
Mixed prec.: torch.cuda.amp (bfloat16)
```

---

## ONNX Export

```bash
# After training, export from PyTorch:
python -c "
import torch

model = SilentSpeechLSTM()          # project-local class
model.load_state_dict(torch.load('checkpoint_best.pth'))
model.eval()

# T=100 frames (1 second of audio at 10 ms hop)
dummy = torch.randn(1, 100, 39)

torch.onnx.export(
    model,
    dummy,
    'silent-speech.onnx',
    input_names  = ['mfcc_input'],
    output_names = ['class_probs'],
    dynamic_axes = {
        'mfcc_input':  {0: 'batch', 1: 'time'},
        'class_probs': {0: 'batch'},
    },
    opset_version = 17,
)
print('Exported silent-speech.onnx')
"

# Quantise to INT8 for low-latency CPU inference:
python -m onnxruntime.quantization.quantize \
    --model_input  silent-speech.onnx \
    --model_output silent-speech-int8.onnx \
    --quant_format QOperator \
    --weight_type  QInt8

# Verify:
python -c "
import onnxruntime as ort, numpy as np
sess = ort.InferenceSession('silent-speech-int8.onnx')
out = sess.run(None, {'mfcc_input': np.random.randn(1,100,39).astype('float32')})
print('Output shape:', out[0].shape)   # expect (1, 2)
"
```

Place the final `.onnx` file in this directory alongside `model.md`.

---

## Integration

```rust
// In kasbah-onnx-runtime (future):
use kasbah_signal_processing::AudioPreprocessor;

let ap = AudioPreprocessor::new();
let samples = ap.load_wav("mic_capture.wav")?;
let samples = ap.normalize(samples);
let flat = ap.preprocess_for_silent_speech(&samples)?;

// flat.len() == T * 39
let n_frames = flat.len() / 39;

// Reshape to ONNX input [1, T, 39] and run inference via kasbah-onnx-runtime
// class_probs[0][1] > 0.5  →  silent-speech detected
```

---

## Changelog

| Version | Date       | Notes                                            |
|---------|------------|--------------------------------------------------|
| 0.1.0   | 2026-02-28 | Architecture specification drafted                |
| —       | TBD        | Training data collection (IRB-approved study)     |
| —       | TBD        | First training run                                |
| —       | TBD        | Ablation: LSTM depth vs. attention layers         |
| —       | TBD        | ONNX export + latency benchmark                   |
