/**
 * Kasbah Guard - Localization Utility
 * Handles browser language detection and message translation
 */

let MESSAGES = {};
let currentLanguage = 'en';

// Load messages from messages.json
async function loadMessages() {
  try {
    const response = await fetch(chrome.runtime.getURL('i18n/messages.json'));
    MESSAGES = await response.json();
  } catch (error) {
    console.error('[Kasbah] Failed to load localization messages:', error);
    // Fallback to inline English messages
    MESSAGES = {
      'en': {
        'detected': 'Detected',
        'sensitive_content': 'Sensitive content',
        'we_detected_risky': 'We detected something risky',
        'email_detected': 'Email detected',
        'password_detected': 'Password detected',
        'api_key_detected': 'API key detected',
        'credit_card_detected': 'Credit card detected',
        'block': 'BLOCK',
        'allow': 'Allow'
      }
    };
  }
}

// Detect user's browser language
function detectLanguage() {
  // Get browser language
  const browserLang = (navigator.language || navigator.userLanguage || 'en').split('-')[0].toLowerCase();

  // List of supported languages
  const supported = ['en', 'fr', 'es', 'de', 'it', 'pt', 'ja', 'zh'];

  // Use browser language if supported, else default to English
  currentLanguage = supported.includes(browserLang) ? browserLang : 'en';

  // Store in storage for consistency
  chrome.storage.local.set({ userLanguage: currentLanguage });

  return currentLanguage;
}

// Get localized message
function getMessage(key) {
  // Load current language from storage if available
  if (!MESSAGES[currentLanguage]) {
    currentLanguage = 'en';
  }

  const message = MESSAGES[currentLanguage]?.[key] || MESSAGES['en']?.[key] || key;
  return message;
}

// Format message with parameters
function formatMessage(key, params = {}) {
  let message = getMessage(key);

  // Replace placeholders like {{param}}
  Object.keys(params).forEach(param => {
    message = message.replace(`{{${param}}}`, params[param]);
  });

  return message;
}

// Initialize localization on load
async function initializeLocalization() {
  await loadMessages();
  detectLanguage();

  // Log current language
  console.log(`[Kasbah] Language: ${currentLanguage}`);
}

// Make functions available globally
if (typeof window !== 'undefined') {
  window.i18n = {
    getMessage,
    formatMessage,
    getLanguage: () => currentLanguage,
    setLanguage: (lang) => {
      if (MESSAGES[lang]) {
        currentLanguage = lang;
        chrome.storage.local.set({ userLanguage: lang });
      }
    },
    init: initializeLocalization
  };
}

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getMessage,
    formatMessage,
    detectLanguage,
    initializeLocalization
  };
}
