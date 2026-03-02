/**
 * image-utils.ts — Image decoding and feature extraction
 *
 * Provides proper image decoding using the sharp library (Node.js environments)
 * with a lightweight pure-JS fallback for edge/worker environments.
 *
 * Exports:
 *  - decodeImageFromBase64(b64)  → DecodedImage
 *  - decodeImageFromBuffer(buf)  → DecodedImage
 *  - decodeImageFromURL(url)     → DecodedImage
 *  - extractFeatures(img)        → ImageFeatures
 *
 * Status: Production-Ready
 * Version: 1.0.0
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DecodedImage {
  /** Raw pixel data in RGBA order, row-major */
  data: Uint8ClampedArray;
  width: number;
  height: number;
  channels: number;
  /** true = decoded via sharp; false = lightweight fallback */
  decoded: boolean;
  /** Original byte size of the compressed image */
  byteSize: number;
}

export interface ImageFeatures {
  /** 256-bin normalised colour histogram (R+G+B combined) */
  colorHistogram: Float32Array;
  /** Per-channel mean [R, G, B] */
  channelMeans: [number, number, number];
  /** Per-channel std-dev [R, G, B] */
  channelStds: [number, number, number];
  /** R-G-B pairwise channel correlation coefficients */
  channelCorr: { rg: number; rb: number; gb: number };
  /** Laplacian variance (sharpness proxy) */
  laplacianVariance: number;
  /** Discrete Cosine Transform energy in low/mid/high bands */
  dctBands: { low: number; mid: number; high: number };
  /** 8-bin Local Binary Pattern histogram (simplified) */
  lbpHistogram: Float32Array;
  /** Noise kurtosis estimate over 8×8 residual blocks */
  noiseKurtosis: number;
  /** Power Spectral Density slope (log-log fit; natural ≈ −2) */
  psdSlope: number;
}

// ---------------------------------------------------------------------------
// Sharp availability guard
// ---------------------------------------------------------------------------

let _sharp: any = null;
let _sharpChecked = false;

async function getSharp(): Promise<any | null> {
  if (_sharpChecked) return _sharp;
  _sharpChecked = true;
  try {
    // Dynamic import so bundlers can tree-shake when not needed
    const mod = await import('sharp');
    _sharp = mod.default ?? mod;
  } catch {
    _sharp = null;
  }
  return _sharp;
}

// ---------------------------------------------------------------------------
// Decoding entry-points
// ---------------------------------------------------------------------------

/**
 * Decode a base-64 encoded image (with or without data-URL prefix).
 */
export async function decodeImageFromBase64(b64: string): Promise<DecodedImage> {
  // Strip optional data-URL header  e.g. "data:image/png;base64,"
  const raw = b64.replace(/^data:[^;]+;base64,/, '');
  const buffer = Buffer.from(raw, 'base64');
  return decodeImageFromBuffer(buffer);
}

/**
 * Decode an image from a raw Buffer / Uint8Array.
 */
export async function decodeImageFromBuffer(
  buf: Buffer | Uint8Array
): Promise<DecodedImage> {
  const byteSize = buf.byteLength;
  const sharp = await getSharp();

  if (sharp) {
    try {
      const { data, info } = await sharp(buf)
        .ensureAlpha()           // Force 4 channels: RGBA
        .raw()
        .toBuffer({ resolveWithObject: true });

      return {
        data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
        width: info.width,
        height: info.height,
        channels: 4,
        decoded: true,
        byteSize,
      };
    } catch {
      // Fall through to lightweight path
    }
  }

  return _lightweightDecode(buf, byteSize);
}

/**
 * Fetch an image from a URL and decode it.
 * Only call from server-side code that has fetch available.
 */
export async function decodeImageFromURL(url: string): Promise<DecodedImage> {
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Failed to fetch image: ${resp.status} ${resp.statusText}`);
  }
  const arrayBuf = await resp.arrayBuffer();
  return decodeImageFromBuffer(Buffer.from(arrayBuf));
}

// ---------------------------------------------------------------------------
// Lightweight pure-JS fallback (BMP 24-bit only; for edge environments)
// ---------------------------------------------------------------------------

function _lightweightDecode(buf: Buffer | Uint8Array, byteSize: number): DecodedImage {
  // Attempt minimal BMP 24-bit parsing
  if (
    buf.length > 54 &&
    buf[0] === 0x42 && buf[1] === 0x4d  // 'BM' signature
  ) {
    const view = new DataView(
      buf.buffer instanceof ArrayBuffer ? buf.buffer : buf.buffer,
      buf.byteOffset,
      buf.byteLength
    );
    const pixelOffset = view.getUint32(10, true);
    const width  = Math.abs(view.getInt32(18, true));
    const height = Math.abs(view.getInt32(22, true));
    const bpp    = view.getUint16(28, true);

    if (bpp === 24 && pixelOffset + width * height * 3 <= buf.length) {
      const data = new Uint8ClampedArray(width * height * 4);
      const rowSize = Math.ceil(width * 3 / 4) * 4; // BMP rows padded to 4-byte boundary

      for (let row = 0; row < height; row++) {
        // BMP rows are stored bottom-up
        const srcRow = height - 1 - row;
        const srcOffset = pixelOffset + srcRow * rowSize;
        const dstOffset = row * width * 4;

        for (let col = 0; col < width; col++) {
          const s = srcOffset + col * 3;
          const d = dstOffset + col * 4;
          data[d]   = buf[s + 2]; // R (BMP stores BGR)
          data[d+1] = buf[s + 1]; // G
          data[d+2] = buf[s];     // B
          data[d+3] = 255;        // A
        }
      }

      return { data, width, height, channels: 4, decoded: false, byteSize };
    }
  }

  // Absolute fallback: treat raw bytes as 1D grayscale strip
  const side = Math.max(1, Math.floor(Math.sqrt(buf.length)));
  const data = new Uint8ClampedArray(side * side * 4);
  for (let i = 0; i < side * side; i++) {
    const v = buf[i] ?? 128;
    data[i*4]   = v;
    data[i*4+1] = v;
    data[i*4+2] = v;
    data[i*4+3] = 255;
  }

  return { data, width: side, height: side, channels: 4, decoded: false, byteSize };
}

// ---------------------------------------------------------------------------
// Feature extraction
// ---------------------------------------------------------------------------

/**
 * Extract a comprehensive feature vector from a decoded image.
 * All computations are pure TypeScript — no native dependencies.
 */
export function extractFeatures(img: DecodedImage): ImageFeatures {
  const { data, width, height } = img;
  const n = width * height;

  // ── Channel separation ──────────────────────────────────────────────────
  const rArr = new Float32Array(n);
  const gArr = new Float32Array(n);
  const bArr = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    rArr[i] = data[i*4]   / 255;
    gArr[i] = data[i*4+1] / 255;
    bArr[i] = data[i*4+2] / 255;
  }

  // ── Colour histogram (256 bins, combined RGB) ──────────────────────────
  const colorHistogram = new Float32Array(256);
  for (let i = 0; i < n; i++) {
    colorHistogram[data[i*4]]++;
    colorHistogram[data[i*4+1]]++;
    colorHistogram[data[i*4+2]]++;
  }
  const histTotal = n * 3;
  for (let k = 0; k < 256; k++) colorHistogram[k] /= histTotal;

  // ── Per-channel stats ───────────────────────────────────────────────────
  function meanStd(arr: Float32Array): [number, number] {
    let sum = 0;
    for (let i = 0; i < arr.length; i++) sum += arr[i];
    const mean = sum / arr.length;
    let varAcc = 0;
    for (let i = 0; i < arr.length; i++) varAcc += (arr[i] - mean) ** 2;
    return [mean, Math.sqrt(varAcc / arr.length)];
  }

  const [rMean, rStd] = meanStd(rArr);
  const [gMean, gStd] = meanStd(gArr);
  const [bMean, bStd] = meanStd(bArr);

  // ── Channel correlation ─────────────────────────────────────────────────
  function corr(a: Float32Array, aMean: number, b: Float32Array, bMean: number): number {
    let cov = 0;
    for (let i = 0; i < a.length; i++) cov += (a[i] - aMean) * (b[i] - bMean);
    cov /= a.length;
    const denom = (rStd + 1e-9) * (gStd + 1e-9);
    return cov / denom;
  }

  const channelCorr = {
    rg: corr(rArr, rMean, gArr, gMean),
    rb: corr(rArr, rMean, bArr, bMean),
    gb: corr(gArr, gMean, bArr, bMean),
  };

  // ── Laplacian variance (sharpness) ──────────────────────────────────────
  // Use greyscale: Y = 0.299R + 0.587G + 0.114B
  const gray = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    gray[i] = 0.299 * rArr[i] + 0.587 * gArr[i] + 0.114 * bArr[i];
  }

  let lapSum = 0;
  let lapSumSq = 0;
  let lapCount = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const lap =
        gray[idx - width - 1] + gray[idx - width] + gray[idx - width + 1] +
        gray[idx - 1]         - 8 * gray[idx]      + gray[idx + 1] +
        gray[idx + width - 1] + gray[idx + width] + gray[idx + width + 1];
      lapSum   += lap;
      lapSumSq += lap * lap;
      lapCount++;
    }
  }

  const lapMean = lapCount > 0 ? lapSum / lapCount : 0;
  const laplacianVariance = lapCount > 0
    ? lapSumSq / lapCount - lapMean * lapMean
    : 0;

  // ── DCT energy bands (approximate via 8×8 block sum) ───────────────────
  const dctBands = _approximateDCTBands(gray, width, height);

  // ── LBP histogram (8-bin simplified) ──────────────────────────────────
  const lbpHistogram = _computeLBP(gray, width, height);

  // ── Noise kurtosis ──────────────────────────────────────────────────────
  const noiseKurtosis = _computeNoiseKurtosis(gray, width, height);

  // ── PSD slope ──────────────────────────────────────────────────────────
  const psdSlope = _computePSDSlope(gray, width, height);

  return {
    colorHistogram,
    channelMeans: [rMean, gMean, bMean],
    channelStds:  [rStd,  gStd,  bStd],
    channelCorr,
    laplacianVariance,
    dctBands,
    lbpHistogram,
    noiseKurtosis,
    psdSlope,
  };
}

// ---------------------------------------------------------------------------
// DCT band energy approximation
// ---------------------------------------------------------------------------

function _approximateDCTBands(
  gray: Float32Array,
  width: number,
  height: number
): { low: number; mid: number; high: number } {
  const BLOCK = 8;
  let low = 0, mid = 0, high = 0;
  let blocks = 0;

  for (let by = 0; by + BLOCK <= height; by += BLOCK) {
    for (let bx = 0; bx + BLOCK <= width; bx += BLOCK) {
      // Extract block
      const blk = new Float32Array(BLOCK * BLOCK);
      for (let r = 0; r < BLOCK; r++) {
        for (let c = 0; c < BLOCK; c++) {
          blk[r * BLOCK + c] = gray[(by + r) * width + (bx + c)];
        }
      }

      // 1D DCT approximation per row then per column
      const dct = _dct2d(blk, BLOCK);

      // Energy by zig-zag coefficient index
      for (let r = 0; r < BLOCK; r++) {
        for (let c = 0; c < BLOCK; c++) {
          const energy = dct[r * BLOCK + c] ** 2;
          const freq = r + c;
          if (freq < 3)            low  += energy;
          else if (freq < 8)       mid  += energy;
          else                     high += energy;
        }
      }
      blocks++;
    }
  }

  if (blocks === 0) return { low: 0, mid: 0, high: 0 };

  const total = low + mid + high + 1e-9;
  return { low: low / total, mid: mid / total, high: high / total };
}

/** Simplified 2D DCT-II on an N×N block */
function _dct2d(block: Float32Array, N: number): Float32Array {
  const out = new Float32Array(N * N);

  // Row-wise DCT
  const tmp = new Float32Array(N * N);
  for (let r = 0; r < N; r++) {
    for (let k = 0; k < N; k++) {
      let sum = 0;
      for (let n = 0; n < N; n++) {
        sum += block[r * N + n] * Math.cos((Math.PI / N) * (n + 0.5) * k);
      }
      tmp[r * N + k] = sum;
    }
  }

  // Column-wise DCT
  for (let c = 0; c < N; c++) {
    for (let k = 0; k < N; k++) {
      let sum = 0;
      for (let n = 0; n < N; n++) {
        sum += tmp[n * N + c] * Math.cos((Math.PI / N) * (n + 0.5) * k);
      }
      out[k * N + c] = sum;
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Local Binary Pattern (simplified 8-direction, 8-bin)
// ---------------------------------------------------------------------------

function _computeLBP(
  gray: Float32Array,
  width: number,
  height: number
): Float32Array {
  const hist = new Float32Array(8);
  let count = 0;

  const offsets = [
    [-1, -1], [-1, 0], [-1, 1],
    [ 0,  1],
    [ 1,  1], [ 1, 0], [ 1, -1],
    [ 0, -1],
  ];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const center = gray[y * width + x];
      let code = 0;
      let transitions = 0;
      let prev = gray[(y + offsets[7][0]) * width + (x + offsets[7][1])] >= center ? 1 : 0;

      for (let b = 0; b < 8; b++) {
        const [dy, dx] = offsets[b];
        const cur = gray[(y + dy) * width + (x + dx)] >= center ? 1 : 0;
        code |= cur << b;
        if (cur !== prev) transitions++;
        prev = cur;
      }

      // Uniform LBP: at most 2 transitions → map to 0-7 based on 1-count
      const bin = transitions <= 2
        ? Math.min(7, _popcount8(code))
        : 7;

      hist[bin]++;
      count++;
    }
  }

  if (count > 0) {
    for (let i = 0; i < 8; i++) hist[i] /= count;
  }

  return hist;
}

function _popcount8(x: number): number {
  let c = 0;
  for (let i = 0; i < 8; i++) c += (x >> i) & 1;
  return c;
}

// ---------------------------------------------------------------------------
// Noise kurtosis (over 8×8 residual blocks)
// ---------------------------------------------------------------------------

function _computeNoiseKurtosis(
  gray: Float32Array,
  width: number,
  height: number
): number {
  const BLOCK = 8;
  const residuals: number[] = [];

  for (let by = 0; by + BLOCK <= height; by += BLOCK) {
    for (let bx = 0; bx + BLOCK <= width; bx += BLOCK) {
      // Block mean
      let mean = 0;
      for (let r = 0; r < BLOCK; r++) {
        for (let c = 0; c < BLOCK; c++) {
          mean += gray[(by + r) * width + (bx + c)];
        }
      }
      mean /= BLOCK * BLOCK;

      // Residuals
      for (let r = 0; r < BLOCK; r++) {
        for (let c = 0; c < BLOCK; c++) {
          residuals.push(gray[(by + r) * width + (bx + c)] - mean);
        }
      }
    }
  }

  if (residuals.length < 4) return 3.0; // Normal kurtosis baseline

  const n = residuals.length;
  let m2 = 0, m4 = 0;
  for (const v of residuals) { m2 += v * v; m4 += v ** 4; }
  m2 /= n; m4 /= n;

  return m2 < 1e-10 ? 3.0 : m4 / (m2 * m2);
}

// ---------------------------------------------------------------------------
// PSD slope (1D radial power spectrum in log-log space, natural ≈ −2)
// ---------------------------------------------------------------------------

function _computePSDSlope(
  gray: Float32Array,
  width: number,
  height: number
): number {
  // Use a down-sampled row to keep computation light
  const W = Math.min(width, 256);
  const row = new Float32Array(W);
  const midY = Math.floor(height / 2);
  for (let x = 0; x < W; x++) {
    row[x] = gray[midY * width + Math.floor(x * width / W)];
  }

  // DFT magnitudes (real input → N/2 bins)
  const N = W;
  const half = Math.floor(N / 2);
  const power = new Float32Array(half);

  for (let k = 1; k <= half; k++) {
    let re = 0, im = 0;
    for (let n = 0; n < N; n++) {
      const angle = (-2 * Math.PI * k * n) / N;
      re += row[n] * Math.cos(angle);
      im += row[n] * Math.sin(angle);
    }
    power[k - 1] = re * re + im * im;
  }

  // Log-log linear regression to fit slope
  let sumX = 0, sumY = 0, sumXX = 0, sumXY = 0;
  let cnt = 0;

  for (let k = 0; k < half; k++) {
    if (power[k] <= 0) continue;
    const lx = Math.log(k + 1);
    const ly = Math.log(power[k]);
    sumX  += lx;
    sumY  += ly;
    sumXX += lx * lx;
    sumXY += lx * ly;
    cnt++;
  }

  if (cnt < 2) return -2.0;
  const denom = cnt * sumXX - sumX * sumX;
  if (Math.abs(denom) < 1e-10) return -2.0;

  return (cnt * sumXY - sumX * sumY) / denom;
}
