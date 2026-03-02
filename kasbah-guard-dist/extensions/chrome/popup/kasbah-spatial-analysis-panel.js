/**
 * Spatial Intelligence Monitor Panel JavaScript
 *
 * Fetches real-time spatial analysis data and renders dashboard metrics.
 * Integrates with background.js to receive detection events.
 *
 * Status: Production-Ready
 * Version: 1.0.0
 */

'use strict';

class SpatialMonitorPanel {
  constructor() {
    this.apiBase = 'https://api.bekasbah.com';
    this.updateInterval = 5000; // 5 seconds
    this.authToken = '';

    this.init();
  }

  /**
   * Initialize the panel
   */
  async init() {
    console.log('[Spatial Panel] Initializing');

    // Get auth token from storage
    this.authToken = await this.getAuthToken();

    // Set up event listeners
    this.setupEventListeners();

    // Initial load
    await this.updateMetrics();

    // Set up periodic updates
    setInterval(() => this.updateMetrics(), this.updateInterval);

    // Update timestamp
    this.updateTimestamp();
    setInterval(() => this.updateTimestamp(), 1000);
  }

  /**
   * Set up event listeners
   */
  setupEventListeners() {
    // Listen for detection results from background script
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.type === 'SPATIAL_ANALYSIS_COMPLETE') {
        this.displayResult(request.data);
      }
    });

    // Listen for storage changes
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && changes.lastDetection) {
        const detection = changes.lastDetection.newValue;
        if (detection && detection.kasbah && detection.kasbah.spatial) {
          this.displayResult(detection.kasbah.spatial);
        }
      }
    });
  }

  /**
   * Fetch spatial metrics from API
   */
  async updateMetrics() {
    try {
      const response = await this.fetch(`${this.apiBase}/api/kasbah/spatial/status`);

      if (response.ok) {
        const data = await response.json();
        this.renderMetrics(data);
      } else {
        console.warn('[Spatial Panel] API error:', response.status);
        this.setStatusBadge('pending', 'API Unavailable');
      }
    } catch (error) {
      console.warn('[Spatial Panel] Failed to fetch metrics:', error);
      this.setStatusBadge('pending', 'Connection Error');
    }
  }

  /**
   * Display detection result
   */
  displayResult(spatial) {
    if (!spatial) return;

    const metrics = {
      geometry_score: spatial.geometry_score || 0,
      physics_score: spatial.physics_score || 0,
      lighting_score: spatial.lighting_score || 0,
      overall_score: spatial.overall_score || 0,
      anomalies: spatial.anomalies || []
    };

    this.renderMetrics(metrics);
  }

  /**
   * Render metrics to the page
   */
  renderMetrics(data) {
    // Geometry Score
    const geometryScore = (data.geometry_score * 100).toFixed(0);
    document.getElementById('geometryScore').textContent = geometryScore + '%';
    document.getElementById('geometryBar').style.width = geometryScore + '%';

    // Physics Score
    const physicsScore = (data.physics_score * 100).toFixed(0);
    document.getElementById('physicsScore').textContent = physicsScore + '%';
    document.getElementById('physicsBar').style.width = physicsScore + '%';

    // Lighting Score
    const lightingScore = (data.lighting_score * 100).toFixed(0);
    document.getElementById('lightingScore').textContent = lightingScore + '%';
    document.getElementById('lightingBar').style.width = lightingScore + '%';

    // Overall Score
    const overallScore = (data.overall_score * 100).toFixed(0);
    document.getElementById('overallScore').textContent = overallScore + '%';
    document.getElementById('overallBar').style.width = overallScore + '%';

    // Update status badge
    if (overallScore >= 90) {
      this.setStatusBadge('operational', 'Excellent');
    } else if (overallScore >= 70) {
      this.setStatusBadge('operational', 'Good');
    } else {
      this.setStatusBadge('pending', 'Review');
    }

    // Display anomalies
    this.displayAnomalies(data.anomalies || []);
  }

  /**
   * Display anomalies
   */
  displayAnomalies(anomalies) {
    const container = document.getElementById('anomalyContainer');

    if (anomalies.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">✓</div>
          <div>No anomalies detected</div>
        </div>
      `;
      return;
    }

    const anomalyHTML = anomalies
      .map(anomaly => {
        const severity = anomaly.severity || 'info';
        return `
          <li class="anomaly-item ${severity}">
            <strong>${anomaly.category || 'Anomaly'}:</strong> ${anomaly.description || anomaly}
          </li>
        `;
      })
      .join('');

    container.innerHTML = `<ul class="anomaly-list">${anomalyHTML}</ul>`;
  }

  /**
   * Set status badge
   */
  setStatusBadge(status, text) {
    const badge = document.getElementById('statusBadge');
    if (badge) {
      badge.className = `status-badge ${status}`;
      badge.textContent = text || (status === 'operational' ? 'Operational' : 'Pending');
    }
  }

  /**
   * Update timestamp
   */
  updateTimestamp() {
    const now = new Date();
    const time = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    document.getElementById('lastUpdated').textContent = time;
  }

  /**
   * Fetch with error handling
   */
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

  /**
   * Get auth token from storage
   */
  getAuthToken() {
    return new Promise((resolve) => {
      chrome.storage.local.get('authToken', (data) => {
        resolve(data.authToken || '');
      });
    });
  }
}

// Initialize on document ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new SpatialMonitorPanel();
  });
} else {
  new SpatialMonitorPanel();
}
