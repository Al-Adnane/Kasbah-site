/**
 * Generator Attribution Panel
 * Shows which AI model created the content
 */

'use strict';

class GeneratorAttributionPanel {
  constructor() {
    this.apiBase = 'https://api.bekasbah.com';
    this.updateInterval = 5000;
    this.authToken = '';
    this.init();
  }

  async init() {
    console.log('[Generator Panel] Initializing');
    this.authToken = await this.getAuthToken();
    this.setupEventListeners();
    await this.updateGenerators();
    setInterval(() => this.updateGenerators(), this.updateInterval);
  }

  setupEventListeners() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.type === 'DETECTION_COMPLETE') {
        const detection = request.data;
        if (detection && detection.kasbah && detection.kasbah.generator) {
          this.displayGenerator(detection.kasbah.generator);
        }
      }
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && changes.lastDetection) {
        const detection = changes.lastDetection.newValue;
        if (detection && detection.kasbah && detection.kasbah.generator) {
          this.displayGenerator(detection.kasbah.generator);
        }
      }
    });
  }

  async updateGenerators() {
    try {
      const response = await this.fetch(`${this.apiBase}/api/kasbah/generator/list`);
      if (response.ok) {
        const data = await response.json();
        this.renderGeneratorsList(data.generators || []);
      }
    } catch (error) {
      console.warn('[Generator Panel] Failed to fetch:', error);
    }
  }

  displayGenerator(generatorData) {
    if (!generatorData) return;

    const html = `
      <div class="generator-card">
        <div class="generator-name">${generatorData.generator_name || 'Unknown'}</div>
        <div class="generator-vendor">${generatorData.vendor || ''}</div>
        <div class="confidence-bar">
          <div class="confidence-fill" style="width: ${(generatorData.confidence * 100).toFixed(0)}%"></div>
        </div>
        <div class="confidence-text">
          Confidence: ${(generatorData.confidence * 100).toFixed(1)}%
        </div>
      </div>
    `;

    document.getElementById('generatorsList').innerHTML = html;
    this.updateTimestamp();
  }

  renderGeneratorsList(generators) {
    if (generators.length === 0) {
      document.getElementById('generatorsList').innerHTML = `
        <div class="empty-state">
          <div style="font-size: 32px; margin-bottom: 8px;">📊</div>
          <div>No generators detected yet</div>
        </div>
      `;
      return;
    }

    const html = generators
      .map(gen => `
        <div class="generator-card">
          <div class="generator-name">${gen.name || gen.generator_name}</div>
          <div class="generator-vendor">${gen.vendor || ''}</div>
          <div class="confidence-bar">
            <div class="confidence-fill" style="width: ${(gen.confidence_baseline * 100).toFixed(0)}%"></div>
          </div>
          <div class="confidence-text">
            Baseline: ${(gen.confidence_baseline * 100).toFixed(1)}%
          </div>
        </div>
      `)
      .join('');

    document.getElementById('generatorsList').innerHTML = html;
    this.updateTimestamp();
  }

  updateTimestamp() {
    const now = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    document.getElementById('lastUpdated').textContent = now;
  }

  fetch(url, options = {}) {
    return Promise.race([
      fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(this.authToken && { 'Authorization': `Bearer ${this.authToken}` })
        },
        ...options
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout')), 5000)
      )
    ]);
  }

  getAuthToken() {
    return new Promise((resolve) => {
      chrome.storage.local.get('authToken', (data) => {
        resolve(data.authToken || '');
      });
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new GeneratorAttributionPanel();
  });
} else {
  new GeneratorAttributionPanel();
}
