/**
 * ═══════════════════════════════════════════════════════════════════════════
 * KASBAH GUARD - SOCIAL MEDIA EXTENSIONS
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Platform-specific content scripts for social media monitoring
 * Supports: Twitter, Facebook, Instagram, TikTok, YouTube
 */

// ═══════════════════════════════════════════════════════════════════════════
// TWITTER/X
// ═══════════════════════════════════════════════════════════════════════════

const TwitterMonitor = {
  init() {
    console.log('[Kasbah] Twitter monitor initialized');
    this.observeTweetBox();
    this.observeDMs();
  },

  observeTweetBox() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          const tweetBox = document.querySelector('[data-testid="tweetTextarea_0"]');
          if (tweetBox) {
            this.scanContent(tweetBox);
          }
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  },

  observeDMs() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const dmInput = document.querySelector('[data-testid="dmInput"]');
        if (dmInput) {
          this.scanContent(dmInput);
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  },

  scanContent(element) {
    const text = element.value || element.textContent || '';
    if (text.length > 50) {
      // Send to Kasbah for scanning
      this.sendToKasbah(text, 'twitter');
    }
  },

  async sendToKasbah(text, platform) {
    try {
      const response = await fetch('http://127.0.0.1:8788/preflight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          verb: 'paste',
          app: platform,
          content: text
        })
      });
      const result = await response.json();
      if (result.risk !== 'safe') {
        this.showWarning(result);
      }
    } catch (error) {
      console.error('[Kasbah] Scan failed:', error);
    }
  },

  showWarning(result) {
    // Show Kasbah warning modal
    console.log('[Kasbah] Warning:', result);
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// FACEBOOK
// ═══════════════════════════════════════════════════════════════════════════

const FacebookMonitor = {
  init() {
    console.log('[Kasbah] Facebook monitor initialized');
    this.observePostBox();
    this.observeMessenger();
  },

  observePostBox() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const postBox = document.querySelector('[aria-label="What\'s on your mind?"]');
        if (postBox) {
          this.scanContent(postBox);
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  },

  observeMessenger() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const msgInput = document.querySelector('[aria-label="Write a message..."]');
        if (msgInput) {
          this.scanContent(msgInput);
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  },

  scanContent(element) {
    const text = element.value || element.textContent || '';
    if (text.length > 50) {
      this.sendToKasbah(text, 'facebook');
    }
  },

  async sendToKasbah(text, platform) {
    try {
      const response = await fetch('http://127.0.0.1:8788/preflight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verb: 'paste', app: platform, content: text })
      });
      const result = await response.json();
      if (result.risk !== 'safe') {
        this.showWarning(result);
      }
    } catch (error) {
      console.error('[Kasbah] Scan failed:', error);
    }
  },

  showWarning(result) {
    console.log('[Kasbah] Warning:', result);
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// INSTAGRAM
// ═══════════════════════════════════════════════════════════════════════════

const InstagramMonitor = {
  init() {
    console.log('[Kasbah] Instagram monitor initialized');
    this.observeCaptionBox();
    this.observeDMs();
  },

  observeCaptionBox() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const captionBox = document.querySelector('textarea[aria-label="Write a caption..."]');
        if (captionBox) {
          this.scanContent(captionBox);
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  },

  observeDMs() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const msgInput = document.querySelector('textarea[aria-label="Message..."]');
        if (msgInput) {
          this.scanContent(msgInput);
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  },

  scanContent(element) {
    const text = element.value || element.textContent || '';
    if (text.length > 50) {
      this.sendToKasbah(text, 'instagram');
    }
  },

  async sendToKasbah(text, platform) {
    try {
      const response = await fetch('http://127.0.0.1:8788/preflight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verb: 'paste', app: platform, content: text })
      });
      const result = await response.json();
      if (result.risk !== 'safe') {
        this.showWarning(result);
      }
    } catch (error) {
      console.error('[Kasbah] Scan failed:', error);
    }
  },

  showWarning(result) {
    console.log('[Kasbah] Warning:', result);
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// TIKTOK
// ═══════════════════════════════════════════════════════════════════════════

const TikTokMonitor = {
  init() {
    console.log('[Kasbah] TikTok monitor initialized');
    this.observeVideoDescription();
    this.observeComments();
  },

  observeVideoDescription() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const descBox = document.querySelector('[placeholder="Add description..."]');
        if (descBox) {
          this.scanContent(descBox);
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  },

  observeComments() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const commentBox = document.querySelector('[placeholder="Add comment..."]');
        if (commentBox) {
          this.scanContent(commentBox);
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  },

  scanContent(element) {
    const text = element.value || element.textContent || '';
    if (text.length > 50) {
      this.sendToKasbah(text, 'tiktok');
    }
  },

  async sendToKasbah(text, platform) {
    try {
      const response = await fetch('http://127.0.0.1:8788/preflight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verb: 'paste', app: platform, content: text })
      });
      const result = await response.json();
      if (result.risk !== 'safe') {
        this.showWarning(result);
      }
    } catch (error) {
      console.error('[Kasbah] Scan failed:', error);
    }
  },

  showWarning(result) {
    console.log('[Kasbah] Warning:', result);
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// YOUTUBE
// ═══════════════════════════════════════════════════════════════════════════

const YouTubeMonitor = {
  init() {
    console.log('[Kasbah] YouTube monitor initialized');
    this.observeCommentBox();
    this.observeLiveChat();
  },

  observeCommentBox() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const commentBox = document.querySelector('#placeholder-area');
        if (commentBox) {
          this.scanContent(commentBox);
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  },

  observeLiveChat() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const chatInput = document.querySelector('#input[placeholder="Send a message"]');
        if (chatInput) {
          this.scanContent(chatInput);
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  },

  scanContent(element) {
    const text = element.value || element.textContent || '';
    if (text.length > 50) {
      this.sendToKasbah(text, 'youtube');
    }
  },

  async sendToKasbah(text, platform) {
    try {
      const response = await fetch('http://127.0.0.1:8788/preflight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verb: 'paste', app: platform, content: text })
      });
      const result = await response.json();
      if (result.risk !== 'safe') {
        this.showWarning(result);
      }
    } catch (error) {
      console.error('[Kasbah] Scan failed:', error);
    }
  },

  showWarning(result) {
    console.log('[Kasbah] Warning:', result);
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

(function init() {
  const hostname = window.location.hostname;

  if (hostname.includes('twitter.com') || hostname.includes('x.com')) {
    TwitterMonitor.init();
  } else if (hostname.includes('facebook.com')) {
    FacebookMonitor.init();
  } else if (hostname.includes('instagram.com')) {
    InstagramMonitor.init();
  } else if (hostname.includes('tiktok.com')) {
    TikTokMonitor.init();
  } else if (hostname.includes('youtube.com')) {
    YouTubeMonitor.init();
  }
})();

// Export for module usage
export { TwitterMonitor, FacebookMonitor, InstagramMonitor, TikTokMonitor, YouTubeMonitor };
