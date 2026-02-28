/**
 * Kasbah Guard Web Detector — app.js
 *
 * Loads kasbah_wasm.js from the public/wasm/ directory (relative path via
 * symlink or direct copy). Falls back to inline JS-based classify() if
 * WASM is unavailable.
 *
 * Zero server round-trips — all detection runs locally in the browser.
 */

// ─── WASM bootstrap ────────────────────────────────────────────────────────

let classify = null;
let redactText = null;

const WASM_URL = '../../public/wasm/kasbah_wasm.js';
const STATUS_EL = document.getElementById('status');

async function loadEngine() {
  try {
    const mod = await import(WASM_URL);
    await mod.default(); // init() — loads kasbah_wasm_bg.wasm
    classify = mod.classify;
    redactText = mod.redact_text ?? ((t) => t);
    setStatus('✅ Kasbah Detection Engine v3.5.2 ready · WASM mode', '#00D084');
  } catch (e) {
    // WASM unavailable — use lightweight JS fallback
    classify = jsFallbackClassify;
    redactText = jsFallbackRedact;
    setStatus('⚠️ Running in JS fallback mode (WASM unavailable)', '#e09a2a');
  }
}

// ─── JS Fallback (mirrors key patterns from detector.js v3.5.1) ────────────

const FALLBACK_PATTERNS = [
  { re: /\b\d{3}-\d{2}-\d{4}\b/, risk: 90, reason: 'SSN pattern' },
  { re: /\b4[0-9]{12}(?:[0-9]{3})?\b/, risk: 90, reason: 'Visa card number' },
  { re: /\bAKIA[0-9A-Z]{16}\b/, risk: 95, reason: 'AWS access key' },
  { re: /-----BEGIN\s+(RSA\s+)?PRIVATE KEY-----/, risk: 100, reason: 'Private key' },
  { re: /ghp_[A-Za-z0-9]{36}/, risk: 95, reason: 'GitHub PAT' },
  { re: /sk-[A-Za-z0-9]{48}/, risk: 95, reason: 'OpenAI API key' },
  { re: /mongodb(\+srv)?:\/\/[^@]+:[^@]+@/, risk: 90, reason: 'MongoDB connection string' },
  { re: /postgres(?:ql)?:\/\/[^@]+:[^@]+@/, risk: 90, reason: 'PostgreSQL connection string' },
  { re: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/, risk: 60, reason: 'Bearer token' },
  { re: /\b(?:\d[ -]?){13,16}\b/, risk: 70, reason: 'Possible card number' },
];

function jsFallbackClassify(text) {
  let maxRisk = 0;
  const reasons = [];
  for (const { re, risk, reason } of FALLBACK_PATTERNS) {
    if (re.test(text)) {
      if (risk > maxRisk) maxRisk = risk;
      reasons.push(reason);
    }
  }
  const decision = maxRisk >= 70 ? 'DENY' : maxRisk >= 40 ? 'WARN' : 'ALLOW';
  return { risk: maxRisk, decision, reason: reasons.slice(0, 3).join('; ') };
}

function jsFallbackRedact(text) {
  let out = text;
  const replacements = [
    [/\b\d{3}-\d{2}-\d{4}\b/g, '[REDACTED::SSN]'],
    [/\bAKIA[0-9A-Z]{16}\b/g, '[REDACTED::AWS_KEY]'],
    [/-----BEGIN[\s\S]*?-----END[^\n]+-----/g, '[REDACTED::PRIVATE_KEY]'],
    [/ghp_[A-Za-z0-9]{36}/g, '[REDACTED::GITHUB_PAT]'],
    [/sk-[A-Za-z0-9]{48}/g, '[REDACTED::OPENAI_KEY]'],
    [/mongodb(\+srv)?:\/\/[^@]+:[^@]+@/g, 'mongodb://[REDACTED]@'],
    [/postgres(?:ql)?:\/\/[^@]+:[^@]+@/g, 'postgresql://[REDACTED]@'],
  ];
  for (const [re, repl] of replacements) {
    out = out.replace(re, repl);
  }
  return out;
}

// ─── UI helpers ─────────────────────────────────────────────────────────────

function setStatus(msg, color = '#444') {
  STATUS_EL.textContent = msg;
  STATUS_EL.style.color = color;
}

function riskColor(risk) {
  return risk >= 70 ? '#e03c3c' : risk >= 40 ? '#e09a2a' : '#00D084';
}

function showResult({ risk, decision, reason }) {
  const panel = document.getElementById('result-panel');
  const color = riskColor(risk);

  panel.style.setProperty('--risk-color', color);

  document.getElementById('verdict-icon').textContent =
    decision === 'DENY' ? '🚫' : decision === 'WARN' ? '⚠️' : '✅';

  const label = risk >= 70 ? 'HIGH RISK' : risk >= 40 ? 'MODERATE' : 'SAFE';
  document.getElementById('verdict-label').textContent = label;
  document.getElementById('verdict-label').style.color = color;

  document.getElementById('risk-score').textContent = `Risk score: ${risk}/100`;

  const chip = document.getElementById('decision-chip');
  chip.textContent = decision;
  chip.style.background = color + '20';
  chip.style.color = color;
  chip.style.border = `1px solid ${color}40`;

  document.getElementById('risk-bar').style.width = `${risk}%`;
  document.getElementById('risk-bar').style.background = color;

  const reasonsEl = document.getElementById('reasons');
  reasonsEl.innerHTML = '';
  if (reason) {
    reason.split('; ').slice(0, 4).forEach((r) => {
      const li = document.createElement('li');
      li.textContent = r;
      reasonsEl.appendChild(li);
    });
  }

  panel.classList.remove('hidden');
}

// ─── Event wiring ────────────────────────────────────────────────────────────

let debounceTimer = null;

document.getElementById('scan-btn').addEventListener('click', doScan);
document.getElementById('redact-btn').addEventListener('click', doRedact);
document.getElementById('clear-btn').addEventListener('click', doClear);

// Preset buttons
document.querySelectorAll('.preset-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.getElementById('input').value = btn.dataset.text;
    doScan();
  });
});

// Live scan with debounce (400ms)
document.getElementById('input').addEventListener('input', () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(doScan, 400);
});

async function doScan() {
  if (!classify) { setStatus('Engine not ready yet…'); return; }
  const text = document.getElementById('input').value;
  if (!text.trim()) {
    document.getElementById('result-panel').classList.add('hidden');
    return;
  }
  const t0 = performance.now();
  const result = classify(text);
  const elapsed = (performance.now() - t0).toFixed(1);
  showResult(result);
  document.getElementById('perf').textContent = `Scanned in ${elapsed}ms · ${text.length} chars`;
}

function doRedact() {
  if (!redactText) return;
  const input = document.getElementById('input');
  const redacted = redactText(input.value);
  input.value = redacted;
  doScan();
}

function doClear() {
  document.getElementById('input').value = '';
  document.getElementById('result-panel').classList.add('hidden');
  setStatus('Ready', '#444');
}

// ─── Boot ────────────────────────────────────────────────────────────────────

loadEngine();
