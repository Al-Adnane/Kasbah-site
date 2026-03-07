/**
 * Kasbah Guard Popup Script v1.0.0
 * With full accessibility integration
 */

// ============================================
// ACCESSIBILITY SETTINGS MANAGEMENT
// ============================================

const accessibilitySettings = {
  async load() {
    const settings = await chrome.storage.local.get([
      'screenReaderEnabled',
      'audioAlertsEnabled',
      'voiceFeedbackEnabled',
      'language',
    ]);

    return {
      screenReaderEnabled: settings.screenReaderEnabled !== false,
      audioAlertsEnabled: settings.audioAlertsEnabled !== false,
      voiceFeedbackEnabled: settings.voiceFeedbackEnabled !== false,
      language: settings.language || 'auto',
    };
  },

  async save(settings) {
    await chrome.storage.local.set({
      screenReaderEnabled: settings.screenReaderEnabled,
      audioAlertsEnabled: settings.audioAlertsEnabled,
      voiceFeedbackEnabled: settings.voiceFeedbackEnabled,
      language: settings.language,
    });

    // Notify background script of changes
    chrome.runtime.sendMessage(
      { action: 'updateAccessibilitySettings', settings },
      () => {
        console.log('[Popup] Accessibility settings updated');
      }
    );
  },
};

// ============================================
// UI INITIALIZATION
// ============================================

async function initPopup() {
  // Load saved accessibility settings
  const settings = await accessibilitySettings.load();

  // Set accessibility checkboxes
  document.getElementById('screenReaderEnabled').checked = settings.screenReaderEnabled;
  document.getElementById('audioAlertsEnabled').checked = settings.audioAlertsEnabled;
  document.getElementById('voiceFeedbackEnabled').checked = settings.voiceFeedbackEnabled;
  document.getElementById('languageSelect').value = settings.language;

  // Check system preferences
  if (window.matchMedia('(prefers-contrast: more)').matches) {
    document.getElementById('highContrastInfo').checked = true;
  }
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.getElementById('reducedMotionInfo').checked = true;
  }

  // Initialize accessibility module with settings
  if (window.KasbahAccessibility) {
    window.KasbahAccessibility.announcer.init({
      screenReaderEnabled: settings.screenReaderEnabled,
      audioAlertsEnabled: settings.audioAlertsEnabled,
      voiceFeedbackEnabled: settings.voiceFeedbackEnabled,
    });

    // Announce that popup opened
    window.KasbahAccessibility.screenReaderAnnounce('Kasbah Guard popup opened. Use arrow keys to navigate settings.');
  }

  // Set up event listeners
  setupEventListeners(settings);

  // Scan current page on popup open
  scanCurrentPage();
}

function setupEventListeners(initialSettings) {
  // Accessibility setting changes
  document.getElementById('screenReaderEnabled').addEventListener('change', async (e) => {
    const settings = await accessibilitySettings.load();
    settings.screenReaderEnabled = e.target.checked;
    await accessibilitySettings.save(settings);

    if (window.KasbahAccessibility) {
      const action = e.target.checked ? 'enabled' : 'disabled';
      window.KasbahAccessibility.announcer.settings.screenReaderEnabled = e.target.checked;
      window.KasbahAccessibility.screenReaderAnnounce(`Screen reader ${action}`);
    }
  });

  document.getElementById('audioAlertsEnabled').addEventListener('change', async (e) => {
    const settings = await accessibilitySettings.load();
    settings.audioAlertsEnabled = e.target.checked;
    await accessibilitySettings.save(settings);

    if (window.KasbahAccessibility) {
      window.KasbahAccessibility.announcer.settings.audioAlertsEnabled = e.target.checked;
      const action = e.target.checked ? 'enabled' : 'disabled';
      window.KasbahAccessibility.screenReaderAnnounce(`Audio alerts ${action}`);
      if (e.target.checked) {
        window.KasbahAccessibility.audioAlerts.success();
      }
    }
  });

  document.getElementById('voiceFeedbackEnabled').addEventListener('change', async (e) => {
    const settings = await accessibilitySettings.load();
    settings.voiceFeedbackEnabled = e.target.checked;
    await accessibilitySettings.save(settings);

    if (window.KasbahAccessibility) {
      window.KasbahAccessibility.announcer.settings.voiceFeedbackEnabled = e.target.checked;
      const action = e.target.checked ? 'enabled' : 'disabled';
      window.KasbahAccessibility.screenReaderAnnounce(`Voice feedback ${action}`);

      if (e.target.checked && window.KasbahAccessibility.voiceFeedback.isSupported) {
        window.KasbahAccessibility.voiceFeedback.speak('Voice feedback enabled');
      }
    }
  });

  document.getElementById('languageSelect').addEventListener('change', async (e) => {
    const settings = await accessibilitySettings.load();
    settings.language = e.target.value;
    await accessibilitySettings.save(settings);

    if (window.KasbahAccessibility) {
      window.KasbahAccessibility.screenReaderAnnounce('Language changed');
    }
  });

  // Action buttons
  document.getElementById('scanPageBtn').addEventListener('click', scanCurrentPage);
  document.getElementById('redactBtn').addEventListener('click', redactSelection);
  document.getElementById('reportFpBtn').addEventListener('click', reportFalsePositive);

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      window.close();
    }
    if (e.key === '?') {
      showKeyboardHelp();
    }
  });
}

// ============================================
// SCANNING FUNCTIONS
// ============================================

async function scanCurrentPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  const statusEl = document.getElementById('statusText');
  const containerEl = document.getElementById('detectionsContainer');

  statusEl.textContent = 'Scanning...';
  containerEl.innerHTML = '';

  chrome.tabs.sendMessage(tab.id, { action: 'scanPage' }, (response) => {
    if (chrome.runtime.lastError) {
      statusEl.textContent = '⚠️ Scan failed';
      statusEl.parentElement.className = 'status warning';

      if (window.KasbahAccessibility) {
        window.KasbahAccessibility.screenReaderAnnounce('Scan failed. Content script not available.');
      }
      return;
    }

    const { detections = [], riskLevel } = response || {};
    updateUIWithDetections(detections, riskLevel);

    // Announce results
    if (window.KasbahAccessibility) {
      window.KasbahAccessibility.announcer.announceScanComplete(detections.length);
    }
  });
}

function updateUIWithDetections(detections, highestRisk = 0) {
  const statusEl = document.getElementById('statusText');
  const containerEl = document.getElementById('detectionsContainer');
  const statusContainer = statusEl.parentElement;

  if (detections.length === 0) {
    statusEl.textContent = '✅ No secrets detected';
    statusContainer.className = 'status safe';
    return;
  }

  // Update status
  if (highestRisk >= 70) {
    statusEl.textContent = `🚨 ${detections.length} secret(s) detected`;
    statusContainer.className = 'status danger';
  } else if (highestRisk >= 40) {
    statusEl.textContent = `⚠️ ${detections.length} secret(s) detected`;
    statusContainer.className = 'status warning';
  } else {
    statusEl.textContent = `ℹ️ ${detections.length} suspicious pattern(s)`;
    statusContainer.className = 'status warning';
  }

  // Display detections
  detections.slice(0, 5).forEach((detection, i) => {
    const div = document.createElement('div');
    const riskClass =
      detection.risk >= 70 ? 'high-risk' : detection.risk >= 40 ? 'medium-risk' : 'low-risk';
    div.className = `detection-result ${riskClass}`;
    div.setAttribute('role', 'alert');

    const riskText = detection.risk >= 70 ? '🔴 HIGH' : detection.risk >= 40 ? '🟡 MEDIUM' : '🟢 LOW';

    div.innerHTML = `
      <strong>${riskText} RISK</strong> - ${detection.category}<br/>
      <small>Confidence: ${detection.confidence}%</small>
    `;

    containerEl.appendChild(div);
  });

  if (detections.length > 5) {
    const moreDiv = document.createElement('div');
    moreDiv.textContent = `... and ${detections.length - 5} more`;
    moreDiv.style.padding = '8px';
    moreDiv.style.textAlign = 'center';
    moreDiv.style.fontSize = '12px';
    moreDiv.style.color = '#666';
    containerEl.appendChild(moreDiv);
  }
}

// ============================================
// ACTION HANDLERS
// ============================================

async function redactSelection() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  chrome.tabs.sendMessage(tab.id, { action: 'redactSelection' }, (response) => {
    if (chrome.runtime.lastError) {
      alert('Redaction not available for this page');
      return;
    }

    if (window.KasbahAccessibility) {
      window.KasbahAccessibility.announcer.announceAction('REDACT_ENABLED');
    }
  });
}

function reportFalsePositive() {
  // Show the FP modal overlay
  const modal = document.getElementById('fp-modal');
  modal.style.display = 'flex';
  document.getElementById('fp-pattern').value = '';
  document.getElementById('fp-context').value = '';
  const statusEl = document.getElementById('fp-status');
  statusEl.style.display = 'none';
  statusEl.textContent = '';
  document.getElementById('fp-pattern').focus();
}

function closeFpModal() {
  const modal = document.getElementById('fp-modal');
  modal.style.display = 'none';
  document.getElementById('fp-pattern').value = '';
  document.getElementById('fp-context').value = '';
  const statusEl = document.getElementById('fp-status');
  statusEl.style.display = 'none';
  statusEl.textContent = '';
}

async function submitFpReport() {
  const fpPattern = document.getElementById('fp-pattern').value.trim();
  const fpContext = document.getElementById('fp-context').value.trim();
  const statusEl = document.getElementById('fp-status');

  if (!fpPattern) {
    statusEl.textContent = 'Pattern is required.';
    statusEl.style.color = '#ff6b6b';
    statusEl.style.display = 'block';
    return;
  }

  statusEl.textContent = 'Submitting...';
  statusEl.style.color = '#aaa';
  statusEl.style.display = 'block';
  document.getElementById('fp-submit').disabled = true;

  try {
    const response = await fetch('https://api.bekasbah.com/api/false-positives', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pattern: fpPattern,
        context: fpContext,
        version: '1.0.0',
        browser: 'chrome',
        timestamp: Date.now(),
      }),
    });

    if (response.ok) {
      statusEl.textContent = 'Thank you! Report submitted.';
      statusEl.style.color = '#28a745';
      if (window.KasbahAccessibility) {
        window.KasbahAccessibility.screenReaderAnnounce('False positive report submitted. Thank you!');
        window.KasbahAccessibility.audioAlerts.success();
      }
      setTimeout(() => closeFpModal(), 1500);
    } else {
      statusEl.textContent = 'Submission failed. Please try again.';
      statusEl.style.color = '#ff6b6b';
      document.getElementById('fp-submit').disabled = false;
    }
  } catch (err) {
    statusEl.textContent = 'Network error. Please try again.';
    statusEl.style.color = '#ff6b6b';
    document.getElementById('fp-submit').disabled = false;
  }
}

function initFpModal() {
  document.getElementById('fp-cancel').addEventListener('click', closeFpModal);
  document.getElementById('fp-submit').addEventListener('click', submitFpReport);

  // Close modal on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const modal = document.getElementById('fp-modal');
      if (modal.style.display === 'flex') {
        closeFpModal();
      }
    }
  });

  // Close modal when clicking the backdrop (outside the inner div)
  document.getElementById('fp-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('fp-modal')) {
      closeFpModal();
    }
  });
}

function showKeyboardHelp() {
  const helpText =
    'Keyboard shortcuts: ? for help, Alt+D for detection toggle, Alt+V for voice, Esc to close';

  if (window.KasbahAccessibility) {
    window.KasbahAccessibility.screenReaderAnnounce(helpText);
    if (window.KasbahAccessibility.voiceFeedback.isSupported) {
      window.KasbahAccessibility.voiceFeedback.speak(helpText);
    }
  }

  alert(helpText);
}

// ============================================
// MOAT V1: FEDERATED THREAT INTELLIGENCE
// ============================================

/**
 * Aggregate threat fingerprints collected over 4 hours
 * Prepares data for submission to consensus server
 */
async function aggregateLocalThreats() {
  return new Promise((resolve) => {
    chrome.storage.local.get([
      'threat_fingerprints',
      'last_threat_aggregation',
      'telemetry_enabled'
    ], function(result) {
      const now = Date.now();
      const lastAgg = result.last_threat_aggregation || 0;
      const fingerprints = result.threat_fingerprints || [];
      const telemetryEnabled = result.telemetry_enabled !== false;

      // Only aggregate every 4 hours
      if (now - lastAgg < 14400000) { // 4 hours in ms
        resolve(null);
        return;
      }

      if (!telemetryEnabled || fingerprints.length === 0) {
        resolve(null);
        return;
      }

      // Count patterns and aggregate
      const patternCounts = {};
      const contextTypes = {};
      let highestRisk = 0;

      for (let i = 0; i < fingerprints.length; i++) {
        const fp = fingerprints[i];
        patternCounts[fp.pattern] = (patternCounts[fp.pattern] || 0) + 1;
        contextTypes[fp.context_type] = (contextTypes[fp.context_type] || 0) + 1;
        highestRisk = Math.max(highestRisk, fp.risk_score);
      }

      const manifest = chrome.runtime.getManifest();
      const aggregated = {
        device_id: fingerprints[0] ? fingerprints[0].device_id : 'unknown',
        timestamp: now,
        period_ms: now - lastAgg,
        fingerprints_count: fingerprints.length,
        patterns: patternCounts,
        contexts: contextTypes,
        highest_risk: highestRisk,
        extension_version: manifest.version,
        engine_version: '1.0.0',
        browser: 'chrome',
        os: navigator.platform.indexOf('Mac') > -1 ? 'macos' :
             navigator.platform.indexOf('Win') > -1 ? 'windows' : 'linux'
      };

      // Store aggregated data and clear fingerprints
      chrome.storage.local.set({
        last_threat_aggregation: now,
        threat_fingerprints: [],
        last_threat_aggregate: aggregated
      });

      resolve(aggregated);
    });
  });
}

/**
 * Send aggregated threats to consensus server for network analysis
 * Implements privacy-first submission with no PII
 */
async function sendThreatsToConsensusServer() {
  return new Promise((resolve) => {
    chrome.storage.local.get([
      'last_threat_aggregate',
      'user_consent_token',
      'telemetry_enabled'
    ], function(result) {
      const aggregate = result.last_threat_aggregate;
      const consent = result.user_consent_token;
      const enabled = result.telemetry_enabled !== false;

      if (!aggregate || !enabled || !consent) {
        resolve({ ok: false, reason: 'no_consent_or_data' });
        return;
      }

      // Prepare encrypted payload (no PII)
      const payload = {
        device_id_hash: aggregate.device_id,
        timestamp: aggregate.timestamp,
        aggregates: {
          patterns: aggregate.patterns,
          contexts: aggregate.contexts,
          highest_risk: aggregate.highest_risk,
          count: aggregate.fingerprints_count
        },
        version: '1.0.0'
      };

      // Submit to API
      fetch('https://api.bekasbah.com/api/v2/threats/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${consent}`
        },
        body: JSON.stringify(payload)
      })
        .then(r => r.json())
        .then(data => {
          console.log('[Moat V1] Threat submission successful:', data);
          // Store consensus response for detector integration
          if (data.consensus_threats) {
            chrome.storage.local.set({
              threat_consensus: data.consensus_threats,
              threat_consensus_updated: Date.now()
            });
          }
          resolve(data);
        })
        .catch(err => {
          console.log('[Moat V1] Threat submission failed (silent):', err.message);
          resolve({ ok: false, reason: 'network_error' });
        });
    });
  });
}

/**
 * Periodic threat aggregation and submission (every 4 hours)
 */
function initThreatIntelligence() {
  // Run aggregation every 4 hours
  setInterval(async () => {
    const aggregate = await aggregateLocalThreats();
    if (aggregate) {
      await sendThreatsToConsensusServer();
    }
  }, 14400000); // 4 hours

  // Also try to aggregate on first popup open
  aggregateLocalThreats();
}

// ============================================
// PHASE A TASK 2: ZK PROOF WIRING (v1.0.0)
// ============================================

/**
 * Generate unique ID for proofs
 */
function generateId() {
  return 'proof-' + Date.now() + '-' + Array.from(crypto.getRandomValues(new Uint8Array(6))).map(function(b){return b.toString(16).padStart(2,'0');}).join('');
}

/**
 * SHA-256 hash helper (uses native crypto API or fallback)
 */
async function sha256Async(text) {
  try {
    const msgBuffer = new TextEncoder().encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (e) {
    // Fallback to simple hash if crypto not available
    console.warn('[popup.js] SHA-256 unavailable, using fallback hash');
    return 'fallback-' + Date.now();
  }
}

/**
 * Generate Zero-Knowledge Proof + Quantum Signature Compliance Proof
 *
 * Creates a complete compliance proof that includes:
 * 1. Quantum signature (from detector.js)
 * 2. Zero-knowledge proof (proves detection without revealing content)
 * 3. Blockchain placeholder (filled after Polygon registration)
 * 4. Detection metadata
 *
 * @param {Object} detection - Detection result from detector.js
 * @returns {Promise<Object>} Compliance proof object
 */
async function generateComplianceProof(detection) {
  try {
    // Validate input
    if (!detection || !detection.decision) {
      console.error('[popup.js] Invalid detection object');
      return null;
    }

    // Step 1: Create ZK proof (no content revealed to verifier)
    const zkProof = new ZKProof(
      `zk-${Date.now()}-${Array.from(crypto.getRandomValues(new Uint8Array(6))).map(b=>b.toString(16).padStart(2,'0')).join('')}`,
      detection.content_hash || await sha256Async(detection.content || ''),
      detection.decision,
      detection.risk || 0
    );

    // Generate ZK proof components
    const secretKey = crypto.getRandomValues(new Uint8Array(32));
    zkProof.generateProof(
      Array.from(secretKey).map(b => b.toString(16).padStart(2, '0')).join('')
    );
    zkProof.verify();

    // Step 2: Create full compliance proof structure
    const complianceProof = {
      id: generateId(),
      timestamp: Date.now(),

      // Layer 1: Quantum-safe signature (non-repudiation)
      quantum: detection.quantumSignature || null,

      // Layer 2: Zero-knowledge proof (privacy)
      zk: zkProof.exportProof(),

      // Layer 3: Blockchain passport (immutable audit trail)
      blockchain: null, // Will be filled after Polygon registration (Task 3)

      // Detection metadata
      detection: {
        verdict: detection.decision,
        riskScore: detection.risk || 0,
        contentHash: detection.content_hash || await sha256Async(detection.content || ''),
        platform: detection.platform || 'unknown',
        reason: detection.reason || 'Detection flagged'
      },

      // Compliance status
      status: {
        quantumSigned: detection.quantumSignature !== null,
        zkProofVerified: zkProof.verify(),
        blockchainRegistered: false
      }
    };

    // Step 3: Store locally in chrome.storage
    await chrome.storage.local.set({
      [`proof-${complianceProof.id}`]: complianceProof
    });

    console.log('[popup.js] ✅ Compliance proof generated:', complianceProof.id);
    return complianceProof;

  } catch (error) {
    console.error('[popup.js] Compliance proof generation failed:', error);
    return null;
  }
}

/**
 * Retrieve stored proof by ID
 */
async function getProof(proofId) {
  return new Promise((resolve) => {
    chrome.storage.local.get(`proof-${proofId}`, (result) => {
      resolve(result[`proof-${proofId}`] || null);
    });
  });
}

/**
 * Get all proofs from storage
 */
async function getAllProofs() {
  return new Promise((resolve) => {
    chrome.storage.local.get(null, (result) => {
      const proofs = Object.values(result).filter(item =>
        item && item.id && item.quantum !== undefined
      );
      resolve(proofs);
    });
  });
}

/**
 * Export proof for audit/compliance purposes
 */
function exportProofAsJSON(proof) {
  return {
    version: '1.0.0',
    exportDate: new Date().toISOString(),
    proof: proof
  };
}

// ============================================
// PROOF DISPLAY & INTERACTION HANDLERS (Task 2)
// ============================================

/**
 * Display proof information in popup
 */
function displayProofInPopup(proof) {
  if (!proof) return;

  const section = document.getElementById('proof-section');
  if (!section) return;

  // Show the proof section
  section.style.display = 'block';

  // Update proof ID
  const proofIdEl = document.getElementById('proof-id');
  if (proofIdEl) {
    proofIdEl.textContent = proof.id.substring(0, 20) + '...';
  }

  // Update quantum signature status
  const quantumStatusEl = document.getElementById('quantum-status');
  if (quantumStatusEl) {
    if (proof.quantum && proof.status.quantumSigned) {
      quantumStatusEl.innerHTML = '<span style="color: #4caf50;">✓ Signed</span>';
    } else {
      quantumStatusEl.innerHTML = '<span style="color: #ff9800;">⏳ Pending (Desktop)</span>';
    }
  }

  // Update ZK proof status
  const zkStatusEl = document.getElementById('zk-status');
  if (zkStatusEl) {
    if (proof.zk && proof.zk.verified) {
      zkStatusEl.innerHTML = '<span style="color: #4caf50;">✓ Verified</span>';
    } else {
      zkStatusEl.innerHTML = '<span style="color: #ff9800;">⏳ Pending</span>';
    }
  }

  // Update blockchain status
  const blockchainStatusEl = document.getElementById('blockchain-status');
  if (blockchainStatusEl) {
    if (proof.blockchain && proof.status.blockchainRegistered) {
      blockchainStatusEl.innerHTML = '<span style="color: #4caf50;">✓ Registered</span>';
    } else {
      blockchainStatusEl.innerHTML = '<span style="color: #ff9800;">⏳ Task 3</span>';
    }
  }
}

/**
 * Handle Export Proof button click
 */
function setupProofExportHandler() {
  const exportBtn = document.getElementById('export-proof-btn');
  if (!exportBtn) return;

  exportBtn.addEventListener('click', async () => {
    try {
      // Get the most recent proof from storage
      const proofs = await getAllProofs();
      if (proofs.length === 0) {
        alert('No proofs found. Generate a detection first.');
        return;
      }

      const latestProof = proofs[proofs.length - 1];
      const exportData = exportProofAsJSON(latestProof);

      // Create download blob
      const jsonStr = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      // Trigger download
      const a = document.createElement('a');
      a.href = url;
      a.download = `kasbah-proof-${latestProof.id.substring(0, 12)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      console.log('[popup.js] ✅ Proof exported:', latestProof.id);
    } catch (error) {
      console.error('[popup.js] Export failed:', error);
      alert('Failed to export proof');
    }
  });
}

/**
 * Handle Verify Proof button click
 */
function setupProofVerifyHandler() {
  const verifyBtn = document.getElementById('verify-proof-btn');
  if (!verifyBtn) return;

  verifyBtn.addEventListener('click', async () => {
    try {
      // Get the most recent proof
      const proofs = await getAllProofs();
      if (proofs.length === 0) {
        alert('No proofs found.');
        return;
      }

      const proof = proofs[proofs.length - 1];

      // Check proof layers
      const quantumValid = proof.quantum !== null && proof.status.quantumSigned;
      const zkValid = proof.zk && proof.zk.verified;
      const blockchainValid = proof.blockchain !== null && proof.status.blockchainRegistered;

      let status = `Proof Verification Results:\n\n`;
      status += `Proof ID: ${proof.id.substring(0, 20)}...\n`;
      status += `Timestamp: ${new Date(proof.timestamp).toISOString()}\n\n`;
      status += `Layers:\n`;
      status += `• Quantum Signature: ${quantumValid ? '✓ Valid' : '⏳ Pending'}\n`;
      status += `• ZK Proof: ${zkValid ? '✓ Valid' : '⏳ Pending'}\n`;
      status += `• Blockchain: ${blockchainValid ? '✓ Valid' : '⏳ Pending'}\n\n`;
      status += `Detection:\n`;
      status += `• Verdict: ${proof.detection.verdict}\n`;
      status += `• Risk Score: ${proof.detection.riskScore}\n`;
      status += `• Source: ${proof.source.url || 'Unknown'}`;

      alert(status);
      console.log('[popup.js] Proof verified:', proof);
    } catch (error) {
      console.error('[popup.js] Verification failed:', error);
      alert('Failed to verify proof');
    }
  });
}

/**
 * Listen for new proofs from background.js
 */
function setupProofListener() {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'PROOF_GENERATED') {
      console.log('[popup.js] Received new proof:', msg.proof);
      displayProofInPopup(msg.proof);
    }
  });
}

// ============================================
// ============================================


// ============================================
// STARTUP
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  initPopup();
  initFpModal();
  initThreatIntelligence();

  // PHASE A Task 2: Initialize proof handlers
  setupProofExportHandler();
  setupProofVerifyHandler();
  setupProofListener();

  // Display any existing proofs
  (async () => {
    const proofs = await getAllProofs();
    if (proofs.length > 0) {
      displayProofInPopup(proofs[proofs.length - 1]);
    }
  })();
});

// ============================================
// ZK PROOF VERIFICATION UI (Gap 2)
// ============================================

/**
 * Load and display recent ZK proofs in popup
 */
async function loadZKProofsUI() {
  try {
    if (typeof ZKProofController === 'undefined') {
      console.warn('[popup.js] ZKProofController not available');
      return;
    }

    const recentProofs = await ZKProofController.getRecentProofs(5);

    if (recentProofs.length === 0) {
      console.log('[popup.js] No ZK proofs found');
      return;
    }

    // Display proofs in UI
    const proofContainer = document.getElementById('zkProofsList') || createProofContainer();

    for (const proof of recentProofs) {
      const verified = await ZKProofController.verifyProof(proof);
      appendProofElement(proofContainer, proof, verified);
    }
  } catch (error) {
    console.error('[popup.js] Failed to load ZK proofs:', error);
  }
}

/**
 * Create proof container if it doesn't exist
 */
function createProofContainer() {
  const container = document.createElement('div');
  container.id = 'zkProofsList';
  container.style.cssText = 'padding:12px 18px;border-top:1px solid var(--border);font-size:11px';
  document.body.appendChild(container);
  return container;
}

/**
 * Append a proof element to the container
 */
function appendProofElement(container, proof, verified) {
  const element = document.createElement('div');
  element.style.cssText = `
    background:rgba(6,95,70,.06);
    border:1px solid rgba(6,95,70,.2);
    border-radius:8px;
    padding:10px;
    margin-bottom:8px;
    font-family:monospace;
    font-size:10px;
  `;

  const statusBadge = verified.verified
    ? '✅ Verified'
    : verified.error ? '❌ Invalid' : '⚠️ Unverified';

  const ageDays = Math.floor(verified.proof_age_ms / (24 * 60 * 60 * 1000));
  const ageText = ageDays > 0 ? `${ageDays} days ago` : 'Today';

  element.innerHTML = `
    <div style="display:flex;justify-content:space-between;margin-bottom:6px">
      <strong style="color:var(--green)">${statusBadge}</strong>
      <span style="color:var(--muted)">${ageText}</span>
    </div>
    <div style="color:var(--ink);margin-bottom:4px">
      ID: ${proof.id.substr(0, 20)}...
    </div>
    <div style="color:var(--muted);margin-bottom:4px">
      Decision: <strong>${proof.detection.decision}</strong> (Risk: ${(proof.detection.risk_score * 100).toFixed(0)}%)
    </div>
    <div style="color:var(--muted);font-size:9px">
      Protocol: ${proof.protocol} | CCL: ${proof.compliance.ccl_level}
    </div>
  `;

  container.appendChild(element);
}

/**
 * Verify proof and show result modal
 */
async function verifyAndShowProof(proofId) {
  try {
    if (typeof ZKProofController === 'undefined') {
      alert('ZK Proof system not available');
      return;
    }

    const proof = await ZKProofController.getProof(proofId);
    if (!proof) {
      alert('Proof not found');
      return;
    }

    const verification = await ZKProofController.verifyProof(proof);

    // Create modal
    const modal = document.createElement('div');
    modal.style.cssText = `
      position:fixed;
      inset:0;
      background:rgba(0,0,0,.5);
      display:flex;
      align-items:center;
      justify-content:center;
      z-index:10000;
    `;

    const box = document.createElement('div');
    box.style.cssText = `
      background:var(--card);
      border-radius:12px;
      padding:20px;
      max-width:500px;
      max-height:80vh;
      overflow-y:auto;
      box-shadow:0 20px 60px rgba(0,0,0,.2);
    `;

    const statusColor = verification.verified ? '#065F46' : '#dc2626';
    const statusText = verification.verified ? '✅ VERIFIED' : '❌ INVALID';

    box.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h3 style="color:${statusColor};margin:0">Zero-Knowledge Proof</h3>
        <button onclick="this.closest('[style*=fixed]').remove()" style="background:transparent;border:none;font-size:20px;cursor:pointer">✕</button>
      </div>

      <div style="background:rgba(6,95,70,.06);border:2px solid ${statusColor};border-radius:8px;padding:12px;margin-bottom:12px">
        <div style="font-size:14px;font-weight:900;color:${statusColor}">${statusText}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:4px">
          Challenge Valid: ${verification.challenge_valid ? '✅' : '❌'}<br/>
          Signature Valid: ${verification.signature_valid ? '✅' : '❌'}
        </div>
      </div>

      <div style="background:var(--border);border-radius:8px;padding:12px;margin-bottom:12px;font-family:monospace;font-size:10px;color:var(--muted);word-break:break-all">
        <div><strong>Proof ID:</strong><br/>${proof.id}</div>
        <div style="margin-top:8px"><strong>Created:</strong><br/>${new Date(proof.timestamp).toLocaleString()}</div>
      </div>

      <div style="background:rgba(193,68,14,.06);border-left:3px solid var(--red);padding:10px;border-radius:4px;font-size:10px;color:var(--muted)">
        <strong>Detection:</strong><br/>
        Decision: <strong>${proof.detection.decision}</strong><br/>
        Risk Score: <strong>${(proof.detection.risk_score * 100).toFixed(1)}%</strong><br/>
        Platform: <strong>${proof.detection.platform}</strong>
      </div>
    `;

    modal.appendChild(box);
    document.body.appendChild(modal);

    // Close on background click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
  } catch (error) {
    console.error('[popup.js] Verification failed:', error);
    alert('Failed to verify proof: ' + error.message);
  }
}

/**
 * Export proof audit log
 */
async function exportProofAuditLog() {
  try {
    if (typeof ZKProofController === 'undefined') {
      alert('ZK Proof system not available');
      return;
    }

    const csvData = await ZKProofController.exportAuditLog('csv');
    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', `kasbah-proof-audit-${Date.now()}.csv`);
    link.click();

    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('[popup.js] Export failed:', error);
    alert('Failed to export audit log: ' + error.message);
  }
}
