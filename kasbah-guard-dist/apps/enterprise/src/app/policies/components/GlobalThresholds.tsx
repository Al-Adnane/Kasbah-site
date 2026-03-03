'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';
import styles from './GlobalThresholds.module.css';

interface GlobalThresholdsProps {
  onSave?: () => void;
}

interface ThresholdConfig {
  warn_threshold: number;
  block_threshold: number;
  deny_threshold: number;
  change_history: { timestamp: string; changed_by: string; old_value: number; new_value: number }[];
}

export default function GlobalThresholds({ onSave }: GlobalThresholdsProps) {
  const [config, setConfig] = useState<ThresholdConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [unsavedChanges, setUnsavedChanges] = useState(false);

  useEffect(() => {
    async function loadThresholds() {
      try {
        setLoading(true);
        // In a real app, fetch from API
        const defaultConfig: ThresholdConfig = {
          warn_threshold: 50,
          block_threshold: 75,
          deny_threshold: 90,
          change_history: [
            {
              timestamp: new Date(Date.now() - 86400000).toISOString(),
              changed_by: 'admin@company.com',
              old_value: 45,
              new_value: 50,
            },
          ],
        };
        setConfig(defaultConfig);
      } catch (error) {
        console.error('Failed to load thresholds:', error);
        setMessage('Failed to load threshold configuration');
      } finally {
        setLoading(false);
      }
    }

    loadThresholds();
  }, []);

  const handleThresholdChange = (field: keyof Omit<ThresholdConfig, 'change_history'>, value: number) => {
    if (!config) return;

    setConfig({
      ...config,
      [field]: Math.max(0, Math.min(100, value)),
    });
    setUnsavedChanges(true);
  };

  const handleSave = async () => {
    if (!config) return;

    try {
      setSaving(true);
      setMessage('');

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.bekasbah.com'}/api/admin/org/policies`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('kasbah_token') || ''}`,
        },
        body: JSON.stringify({
          warn_threshold: config.warn_threshold,
          block_threshold: config.block_threshold,
          deny_threshold: config.deny_threshold,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      setMessage('✅ Thresholds saved successfully');
      setUnsavedChanges(false);
      onSave?.();

      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error('Failed to save thresholds:', error);
      setMessage('❌ Failed to save thresholds');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    // Reload from API
    setUnsavedChanges(false);
    setMessage('');
  };

  if (loading) {
    return <div className={styles.loading}>Loading threshold configuration...</div>;
  }

  if (!config) {
    return <div className={styles.error}>Failed to load configuration</div>;
  }

  return (
    <div className={styles.globalThresholds}>
      <div className={styles.header}>
        <h2>Global Risk Thresholds</h2>
        <p className={styles.description}>Define organization-wide risk score thresholds for detection verdicts</p>
      </div>

      {message && <div className={`${styles.message} ${message.includes('✅') ? styles.success : styles.error}`}>{message}</div>}

      <div className={styles.thresholdGrid}>
        {/* WARN Threshold */}
        <div className={styles.thresholdCard}>
          <div className={styles.cardHeader}>
            <h3>⚠️ WARN Threshold</h3>
            <p className={styles.hint}>Risk score to trigger warning (0-100)</p>
          </div>

          <div className={styles.sliderContainer}>
            <input
              type="range"
              min="0"
              max="100"
              value={config.warn_threshold}
              onChange={(e) => handleThresholdChange('warn_threshold', parseInt(e.target.value))}
              className={styles.slider}
              style={{
                background: `linear-gradient(to right, #f59e0b 0%, #f59e0b ${config.warn_threshold}%, #e5e7eb ${config.warn_threshold}%, #e5e7eb 100%)`,
              }}
            />
            <div className={styles.valueDisplay}>
              <input
                type="number"
                min="0"
                max="100"
                value={config.warn_threshold}
                onChange={(e) => handleThresholdChange('warn_threshold', parseInt(e.target.value))}
                className={styles.numberInput}
              />
              <span className={styles.unit}>%</span>
            </div>
          </div>

          <div className={styles.thresholdInfo}>
            <span className={styles.label}>Severity:</span>
            <span className={styles.badge} style={{ backgroundColor: '#f59e0b20', color: '#f59e0b' }}>
              ⚠️ Warning
            </span>
          </div>
        </div>

        {/* BLOCK Threshold */}
        <div className={styles.thresholdCard}>
          <div className={styles.cardHeader}>
            <h3>🚫 BLOCK Threshold</h3>
            <p className={styles.hint}>Risk score to trigger block (0-100)</p>
          </div>

          <div className={styles.sliderContainer}>
            <input
              type="range"
              min="0"
              max="100"
              value={config.block_threshold}
              onChange={(e) => handleThresholdChange('block_threshold', parseInt(e.target.value))}
              className={styles.slider}
              style={{
                background: `linear-gradient(to right, #ef4444 0%, #ef4444 ${config.block_threshold}%, #e5e7eb ${config.block_threshold}%, #e5e7eb 100%)`,
              }}
            />
            <div className={styles.valueDisplay}>
              <input
                type="number"
                min="0"
                max="100"
                value={config.block_threshold}
                onChange={(e) => handleThresholdChange('block_threshold', parseInt(e.target.value))}
                className={styles.numberInput}
              />
              <span className={styles.unit}>%</span>
            </div>
          </div>

          <div className={styles.thresholdInfo}>
            <span className={styles.label}>Severity:</span>
            <span className={styles.badge} style={{ backgroundColor: '#ef444420', color: '#ef4444' }}>
              🚫 Blocked
            </span>
          </div>
        </div>

        {/* DENY Threshold */}
        <div className={styles.thresholdCard}>
          <div className={styles.cardHeader}>
            <h3>🛑 DENY Threshold</h3>
            <p className={styles.hint}>Risk score to trigger deny (0-100)</p>
          </div>

          <div className={styles.sliderContainer}>
            <input
              type="range"
              min="0"
              max="100"
              value={config.deny_threshold}
              onChange={(e) => handleThresholdChange('deny_threshold', parseInt(e.target.value))}
              className={styles.slider}
              style={{
                background: `linear-gradient(to right, #7c3aed 0%, #7c3aed ${config.deny_threshold}%, #e5e7eb ${config.deny_threshold}%, #e5e7eb 100%)`,
              }}
            />
            <div className={styles.valueDisplay}>
              <input
                type="number"
                min="0"
                max="100"
                value={config.deny_threshold}
                onChange={(e) => handleThresholdChange('deny_threshold', parseInt(e.target.value))}
                className={styles.numberInput}
              />
              <span className={styles.unit}>%</span>
            </div>
          </div>

          <div className={styles.thresholdInfo}>
            <span className={styles.label}>Severity:</span>
            <span className={styles.badge} style={{ backgroundColor: '#7c3aed20', color: '#7c3aed' }}>
              🛑 Denied
            </span>
          </div>
        </div>
      </div>

      {/* Change History */}
      {config.change_history && config.change_history.length > 0 && (
        <div className={styles.changeHistory}>
          <h3>Change History</h3>
          <div className={styles.historyList}>
            {config.change_history.map((change, idx) => (
              <div key={idx} className={styles.historyItem}>
                <div className={styles.historyTime}>{new Date(change.timestamp).toLocaleString()}</div>
                <div className={styles.historyDetail}>
                  <span className={styles.changedBy}>{change.changed_by}</span>
                  <span className={styles.change}>
                    changed from <code>{change.old_value}%</code> to <code>{change.new_value}%</code>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={styles.actions}>
        <button
          className={styles.saveButton}
          onClick={handleSave}
          disabled={!unsavedChanges || saving}
        >
          {saving ? '💾 Saving...' : '💾 Save Changes'}
        </button>
        <button
          className={styles.cancelButton}
          onClick={handleCancel}
          disabled={!unsavedChanges || saving}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
