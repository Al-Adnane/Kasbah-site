/**
 * Kasbah Guard — Production Background Script
 * 
 * Enhanced with error tracking and monitoring.
 */

import { captureError, captureMessage, initSentry } from './sentry.js';
import { trackDetection, trackError, trackPerformance, getHealthStatus } from './monitoring.js';

// Initialize production monitoring
initSentry();

console.log('[Kasbah] Background service worker started');

// Track extension install/update
chrome.runtime.onInstalled.addListener(async (details) => {
  const { reason } = details;
  
  if (reason === 'install') {
    captureMessage('Extension installed', 'info');
  } else if (reason === 'update') {
    captureMessage(`Extension updated from ${details.previousVersion}`, 'info');
  }
  
  // Open welcome page on install
  if (reason === 'install') {
    chrome.tabs.create({ url: 'popup/welcome.html' });
  }
});

// Health check endpoint (called by popup)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const startTime = performance.now();
  
  try {
    switch (message.type) {
      case 'HEALTH_CHECK':
        getHealthStatus().then(sendResponse);
        break;
      
      case 'SCAN_TEXT':
        // Forward to content script
        chrome.tabs.sendMessage(sender.tab.id, message).then(sendResponse);
        break;
      
      case 'REPORT_ERROR':
        captureError(message.error, message.context);
        sendResponse({ ok: true });
        break;
      
      default:
        sendResponse({ error: 'Unknown message type' });
    }
  } catch (error) {
    captureError(error, `message_handler:${message.type}`);
    sendResponse({ error: error.message });
  }
  
  // Track performance
  const duration = performance.now() - startTime;
  trackPerformance(`message:${message.type}`, duration);
  
  return true; // Keep channel open for async response
});

// Alarm for daily tasks
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'daily_cleanup') {
    try {
      // Clean up old storage
      const now = Date.now();
      const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
      
      // Clear old detection history
      const storage = await chrome.storage.local.get(['detectionHistory']);
      if (storage.detectionHistory) {
        const filtered = storage.detectionHistory.filter(d => d.timestamp > thirtyDaysAgo);
        await chrome.storage.local.set({ detectionHistory: filtered });
      }
      
      captureMessage('Daily cleanup completed', 'info');
    } catch (error) {
      captureError(error, 'daily_cleanup');
    }
  }
});

// Set up daily cleanup alarm
chrome.alarms.create('daily_cleanup', {
  periodInMinutes: 24 * 60,
});

// Track extension lifecycle
chrome.runtime.onSuspend.addListener(() => {
  captureMessage('Service worker suspending', 'info');
});

chrome.runtime.onStartup.addListener(() => {
  captureMessage('Service worker started', 'info');
});

// Handle extension uninstall (can't track, but can show survey)
// Note: Chrome doesn't allow tracking uninstalls, but we can show a survey URL
// in the uninstall survey page if user provides one in manifest

console.log('[Kasbah] Background service worker ready');
