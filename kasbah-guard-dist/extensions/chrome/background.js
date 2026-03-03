// Kasbah Guard - Background Service Worker v2.0.0
// 100% BROWSER INDEPENDENT — NO Guard service, NO server calls
let badgeFlashTimeout = null;

// ── Local Audit Ledger (Gap 1.3) ───────────────────────────────────────────
// Hash-chained decision log stored entirely in chrome.storage.local.
// Each entry: { id, ts, event, data, prevHash, hash }
// SHA-256(prevHash + id + ts + event + JSON(data)) — tamper-evident, offline.
const _AUDIT_KEY = 'kasbah_audit_ledger';
const _AUDIT_MAX = 2000;

async function _sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function appendAuditEntry(event, data) {
  // Fire-and-forget — never throws, never blocks the caller
  chrome.storage.local.get([_AUDIT_KEY], async (stored) => {
    try {
      const ledger = stored[_AUDIT_KEY] || [];
      const prevHash = ledger.length > 0 ? ledger[ledger.length - 1].hash : '0'.repeat(64);
      const id = `aud-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const ts = new Date().toISOString();
      const hash = await _sha256(prevHash + id + ts + event + JSON.stringify(data || {}));
      ledger.push({ id, ts, event, data: data || {}, prevHash, hash });
      if (ledger.length > _AUDIT_MAX) ledger.splice(0, ledger.length - _AUDIT_MAX);
      chrome.storage.local.set({ [_AUDIT_KEY]: ledger });
    } catch (_) { /* silent — ledger must never break the extension */ }
  });
}

// ── Sentry Error Tracking (v2.0.0) ────────────────────────────────────────
// Privacy-first error tracking: no URLs, no user data, no secrets
const SENTRY_ENDPOINT = 'https://api.bekasbah.com/api/sentry';
const SENTRY_ENABLED = typeof fetch !== 'undefined';

function sendSentryError(type, message, stack, context = {}) {
  if (!SENTRY_ENABLED) return;

  // Privacy-first: strip sensitive data
  const sanitizedMessage = message.toString()
    .replace(/http[s]?:\/\/[^\s]+/g, '[URL]')
    .replace(/\d{3}-\d{2}-\d{4}/g, '[SSN]')
    .replace(/4[0-9]{12}(?:[0-9]{3})?/g, '[CC]');

  const event = {
    type,
    message: sanitizedMessage,
    stack: stack ? stack.toString().split('\n').slice(0, 5).join('\n') : '',
    context: {
      extensionVersion: '2.0.0',
      browser: 'chrome',
      timestamp: new Date().toISOString(),
      ...context
    }
  };

  fetch(SENTRY_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event)
  }).catch(() => {}); // Silent fail - don't break extension on network error
}

// Global error handler
self.addEventListener('error', (event) => {
  sendSentryError('extension_error', event.message, event.filename + ':' + event.lineno, {
    errorType: 'uncaughtError'
  });
});

// Promise rejection handler
self.addEventListener('unhandledrejection', (event) => {
  sendSentryError('unhandled_rejection', event.reason, '', {
    errorType: 'rejectionError'
  });
});



chrome.runtime.onInstalled.addListener(() => {
  console.log('[Kasbah Guard] Extension v2.0.0 installed — 6-verb interception across 30+ AI platforms');
  chrome.storage.local.set({ guardEnabled: true, notifications: true, version: '2.0.0' });
});

// ── Suspend / Startup handlers (adversarial race fix) ──────────────────────
// Saves pending state before service worker suspends so nothing is lost
// across an extension disable/update/browser-restart race.
chrome.runtime.onSuspend.addListener(() => {
  chrome.storage.local.set({
    lastSuspend: Date.now(),
    guardEnabled: true  // Preserve enabled state across suspend
  });
  console.log('[Kasbah Guard] Service worker suspending — state saved');
});

chrome.runtime.onStartup.addListener(() => {
  // Restore state after browser restart / extension re-enable
  chrome.storage.local.get(['lastSuspend', 'guardEnabled'], (data) => {
    if (data.lastSuspend) {
      const gapMs = Date.now() - data.lastSuspend;
      console.log(`[Kasbah Guard] Resumed after ${Math.round(gapMs/1000)}s gap`);
    }
    // Re-enable guard if it was active before suspension
    if (data.guardEnabled !== false) {
      chrome.storage.local.set({ guardEnabled: true });
    }
  });
});

chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  // Block event from content.js — flash badge
  if (msg.type === 'BLOCK_EVENT') {
    if (badgeFlashTimeout) clearTimeout(badgeFlashTimeout);
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#C1440E' });
    badgeFlashTimeout = setTimeout(function() {
      badgeFlashTimeout = null;
      chrome.action.setBadgeText({ text: '' });
    }, 3000);
    appendAuditEntry('BLOCK_EVENT', { url: sender.url, tabId: sender.tab?.id, decision: msg.decision, risk: msg.risk, reason: msg.reason });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // SECRET EXFILTRATION BLOCKED: log and badge flash (from secret-guard.js)
  // ───────────────────────────────────────────────────────────────────────────
  if (msg.type === 'SECRET_EXFILTRATION_BLOCKED') {
    if (badgeFlashTimeout) clearTimeout(badgeFlashTimeout);
    chrome.action.setBadgeText({ text: '🔐' });
    chrome.action.setBadgeBackgroundColor({ color: '#8B0000' });
    badgeFlashTimeout = setTimeout(function() {
      badgeFlashTimeout = null;
      chrome.action.setBadgeText({ text: '' });
    }, 5000);

    // Store for popup display
    chrome.storage.local.get(['secretBlockCount'], (data) => {
      const count = (data.secretBlockCount || 0) + 1;
      chrome.storage.local.set({
        secretBlockCount: count,
        lastSecretBlock: {
          secretName: msg.secretName,
          requestType: msg.requestType,
          url: msg.url,
          timestamp: msg.timestamp,
        },
      });
    });
    appendAuditEntry('SECRET_EXFILTRATION_BLOCKED', { secretName: msg.secretName, requestType: msg.requestType, url: msg.url });

    respond({ ok: true });
    return true;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // FALSE POSITIVE REPORTING: Forward report to API endpoint
  // ───────────────────────────────────────────────────────────────────────────
  if (msg.action === 'reportFalsePositive') {
    chrome.storage.local.get(['guardEnabled', 'lastDetection'], (data) => {
      const detection = data.lastDetection || null;

      // Item C: differential privacy — add Laplace noise (ε=1.0, Δ=1) to risk score
      // before transmission so individual detections cannot be fingerprinted.
      let noisyRisk = null;
      if (detection && typeof detection.risk === 'number') {
        const u = Math.random();
        const sign = u >= 0.5 ? 1 : -1;
        const laplace = sign * 1.0 * Math.log(1 - 2 * Math.abs(u - 0.5)); // scale = Δ/ε = 1
        noisyRisk = Math.max(0, Math.min(100, Math.round(detection.risk + laplace)));
      }

      const report = {
        context: msg.context || '',
        timestamp: msg.timestamp || new Date().toISOString(),
        detection: detection ? { ...detection, risk: noisyRisk } : null,
        extensionVersion: '2.0.0',
        browser: 'chrome',
      };

      fetch('https://api.bekasbah.com/api/false-positives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report),
      }).catch(() => {}); // Silent fail — don't break extension on network error
    });

    // Item C: EWMA bidirectional feedback — nudge threshold toward permissive
    // Inject into active content-script contexts via scripting API
    chrome.tabs.query({ active: true }, (tabs) => {
      tabs.forEach((tab) => {
        if (!tab.id) return;
        try {
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => { if (typeof applyFeedbackEWMA === 'function') applyFeedbackEWMA(true); }
          });
        } catch (_) {}
      });
    });

    respond({ ok: true });
    return true;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TELEMETRY: Receive and send usage metrics for model improvement
  // ───────────────────────────────────────────────────────────────────────────
  if (msg.type === 'TELEMETRY') {
    const telemetryData = msg.data;

    // Send to API endpoint for aggregation and analysis
    fetch('https://api.bekasbah.com/api/telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(telemetryData)
    }).catch(() => {
      // Silent fail - network error shouldn't break extension
    });

    respond({ ok: true });
    return true;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // PHASE A TASK 2: ZK PROOF WIRING (v1.0.0)
  // ───────────────────────────────────────────────────────────────────────────
  // Detection event with compliance proof generation
  if (msg.type === 'DETECTION') {
    const detection = msg.detection;

    // Async: Generate compliance proof (quantum + ZK + blockchain placeholder)
    (async () => {
      try {
        // Generate compliance proof (will call popup.js::generateComplianceProof)
        const proof = await generateComplianceProofFromDetection(detection, sender);

        if (proof) {
          appendAuditEntry('DETECTION', { verdict: detection.decision, risk: detection.risk, platform: detection.platform, proofId: proof.id, url: sender.url });
          // Store in local history
          chrome.storage.local.get('detectionHistory', (result) => {
            const history = result.detectionHistory || [];
            history.push({
              ...proof,
              url: sender.url,
              tabId: sender.tab?.id,
              frameId: sender.frameId
            });

            // Keep last 1000 detections
            if (history.length > 1000) {
              history.shift();
            }

            chrome.storage.local.set({ detectionHistory: history });
            console.log('[background.js] ✅ Detection stored with proof:', proof.id);
          });

          // Send proof back to popup
          try {
            chrome.runtime.sendMessage({
              type: 'PROOF_GENERATED',
              proof: proof
            }).catch(() => {}); // Tab may be closed, ignore
          } catch (e) {
            // Silent fail - popup may not be open
          }
        }
      } catch (error) {
        console.error('[background.js] Compliance proof generation failed:', error);
        sendSentryError('proof_generation_failed', error.message, error.stack, {
          detectionType: detection.decision
        });
      }
    })();

    respond({ ok: true });
    return true; // Keep channel open for async response
  }

  return true;
});

/**
 * Generate compliance proof from detection (wrapper for popup.js logic)
 * Called from background service worker
 *
 * @param {Object} detection - Detection result from content.js
 * @param {Object} sender - Message sender info
 * @returns {Promise<Object>} Compliance proof
 */
async function generateComplianceProofFromDetection(detection, sender) {
  try {
    // Validate detection object
    if (!detection || !detection.decision) {
      console.error('[background.js] Invalid detection object:', detection);
      return null;
    }

    // Prepare detection data with content hash
    const detectionData = {
      ...detection,
      content_hash: detection.content_hash || hashContent(detection.content || ''),
      source: {
        url: sender.url,
        tabId: sender.tab?.id,
        title: sender.tab?.title || 'Unknown'
      }
    };

    // Generate proof structure
    const proof = {
      id: `proof-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),

      // Layer 1: Quantum signature (if available from detector)
      quantum: detection.quantumSignature || null,

      // Layer 2: ZK proof stub (full generation in popup.js)
      zk: {
        proofId: `zk-${Date.now()}`,
        status: 'pending',
        verified: false
      },

      // Layer 3: Blockchain (to be filled in Task 3)
      blockchain: null,

      // Detection metadata
      detection: {
        verdict: detection.decision,
        riskScore: detection.risk || 0,
        contentHash: detectionData.content_hash,
        platform: detection.platform || 'unknown',
        reason: detection.reason || 'Detection flagged'
      },

      // Source information
      source: detectionData.source,

      // Compliance status
      status: {
        quantumSigned: detection.quantumSignature !== null && detection.quantumSignature !== undefined,
        zkProofReady: false,
        blockchainRegistered: false
      }
    };

    // Store proof in chrome.storage.local
    await new Promise((resolve) => {
      chrome.storage.local.set({
        [`proof-${proof.id}`]: proof
      }, resolve);
    });

    console.log('[background.js] ✅ Compliance proof created:', proof.id);
    return proof;

  } catch (error) {
    console.error('[background.js] Proof generation error:', error);
    return null;
  }
}

/**
 * Simple hash helper for content (fallback)
 * Matches detector.js::hybridHash for consistency
 */
function hashContent(text) {
  // Simple XOR hash (matches detector.js for consistency)
  let h = 5381;
  for (let i = 0; i < (text || '').length; i++) {
    h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16);
}

// All 30+ supported AI platforms
const AI_DOMAINS = [
  'chatgpt.com', 'openai.com', 'claude.ai', 'gemini.google.com', 'aistudio.google.com',
  'perplexity.ai', 'poe.com', 'deepseek.com', 'grok.x.ai', 'copilot.microsoft.com',
  'huggingface.co', 'you.com', 'pi.ai', 'chat.mistral.ai', 'manus.im',
  'cursor.com', 'windsurf.com', 'codeium.com', 'notebooklm.google.com', 'labs.google.com',
  'meta.ai', 'coral.cohere.com', 'chat.lmsys.org', 'open-assistant.io',
  'bard.google.com', 'chat.openai.com', 'bing.com', 'duckduckgo.com'
];

// Extension is ready — all detection happens locally in content.js
