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
  // Open report modal (simplified)
  const context = prompt('Describe why this is a false positive (optional):');

  if (context !== null) {
    chrome.runtime.sendMessage(
      {
        action: 'reportFalsePositive',
        context,
        timestamp: new Date().toISOString(),
      },
      () => {
        if (window.KasbahAccessibility) {
          window.KasbahAccessibility.screenReaderAnnounce('False positive report submitted. Thank you!');
          window.KasbahAccessibility.audioAlerts.success();
        }
      }
    );
  }
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
// STARTUP
// ============================================

document.addEventListener('DOMContentLoaded', initPopup);
