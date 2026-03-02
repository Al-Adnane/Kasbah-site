'use client';

import { useEffect, useState } from 'react';
import styles from './EscalationRules.module.css';

interface NotificationChannel {
  type: 'email' | 'webhook' | 'slack';
  recipient: string;
  enabled: boolean;
}

interface EscalationRule {
  id: string;
  name: string;
  risk_threshold: number;
  channels: NotificationChannel[];
  enabled: boolean;
  description: string;
}

interface EscalationRulesProps {
  onSave?: () => void;
}

export default function EscalationRules({ onSave }: EscalationRulesProps) {
  const [rules, setRules] = useState<EscalationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [editingRule, setEditingRule] = useState<EscalationRule | null>(null);
  const [testingChannel, setTestingChannel] = useState<string | null>(null);

  useEffect(() => {
    async function loadRules() {
      try {
        setLoading(true);
        // Mock data
        const mockRules: EscalationRule[] = [
          {
            id: 'rule-1',
            name: 'Critical Detection',
            risk_threshold: 90,
            enabled: true,
            description: 'Notify SOC team immediately when risk exceeds 90%',
            channels: [
              { type: 'email', recipient: 'soc-team@company.com', enabled: true },
              { type: 'slack', recipient: 'https://hooks.slack.com/...', enabled: true },
            ],
          },
          {
            id: 'rule-2',
            name: 'High Risk Detection',
            risk_threshold: 75,
            enabled: true,
            description: 'Notify manager for high-risk detections',
            channels: [
              { type: 'email', recipient: 'manager@company.com', enabled: true },
              { type: 'webhook', recipient: 'https://api.company.com/webhook', enabled: false },
            ],
          },
        ];
        setRules(mockRules);
      } catch (error) {
        console.error('Failed to load escalation rules:', error);
        setMessage('Failed to load escalation rules');
      } finally {
        setLoading(false);
      }
    }

    loadRules();
  }, []);

  const handleUpdateRule = (ruleId: string, updates: Partial<EscalationRule>) => {
    setRules(rules.map((rule) => (rule.id === ruleId ? { ...rule, ...updates } : rule)));
  };

  const handleAddChannel = (ruleId: string) => {
    setRules(
      rules.map((rule) =>
        rule.id === ruleId
          ? {
              ...rule,
              channels: [
                ...rule.channels,
                { type: 'email', recipient: '', enabled: true },
              ],
            }
          : rule
      )
    );
  };

  const handleRemoveChannel = (ruleId: string, index: number) => {
    setRules(
      rules.map((rule) =>
        rule.id === ruleId
          ? { ...rule, channels: rule.channels.filter((_, i) => i !== index) }
          : rule
      )
    );
  };

  const handleTestChannel = async (ruleId: string, channelIndex: number) => {
    const rule = rules.find((r) => r.id === ruleId);
    if (!rule) return;

    const channel = rule.channels[channelIndex];
    setTestingChannel(`${ruleId}-${channelIndex}`);

    try {
      // In production, call API to send test notification
      // await apiClient.testNotificationChannel(ruleId, channel);

      console.log(`Testing notification to ${channel.recipient}...`);
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Simulate API call

      setMessage(`✅ Test notification sent to ${channel.recipient}`);
    } catch (error) {
      console.error('Failed to test channel:', error);
      setMessage('❌ Failed to send test notification');
    } finally {
      setTestingChannel(null);
      setTimeout(() => setMessage(''), 3000);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      // In production, call API to save rules
      // await apiClient.updateEscalationRules(rules);

      setMessage('✅ Escalation rules saved successfully');
      onSave?.();

      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error('Failed to save rules:', error);
      setMessage('❌ Failed to save escalation rules');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className={styles.loading}>Loading escalation rules...</div>;
  }

  return (
    <div className={styles.escalationRules}>
      <div className={styles.header}>
        <h2>Escalation Rules</h2>
        <p className={styles.description}>Configure automated notifications based on risk thresholds</p>
      </div>

      {message && <div className={`${styles.message} ${message.includes('✅') ? styles.success : styles.error}`}>{message}</div>}

      <div className={styles.rulesList}>
        {rules.map((rule) => (
          <div key={rule.id} className={`${styles.ruleCard} ${rule.enabled ? '' : styles.disabled}`}>
            <div className={styles.ruleHeader}>
              <div className={styles.ruleTitle}>
                <h3>{rule.name}</h3>
                <p className={styles.description}>{rule.description}</p>
              </div>
              <div className={styles.ruleStatus}>
                <label className={styles.toggle}>
                  <input
                    type="checkbox"
                    checked={rule.enabled}
                    onChange={(e) => handleUpdateRule(rule.id, { enabled: e.target.checked })}
                  />
                  <span className={styles.slider}></span>
                </label>
                <span className={styles.statusText}>{rule.enabled ? 'Enabled' : 'Disabled'}</span>
              </div>
            </div>

            <div className={styles.ruleBody}>
              <div className={styles.thresholdSection}>
                <label className={styles.label}>Risk Threshold</label>
                <div className={styles.thresholdControl}>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={rule.risk_threshold}
                    onChange={(e) => handleUpdateRule(rule.id, { risk_threshold: parseInt(e.target.value) })}
                    className={styles.slider}
                    style={{
                      background: `linear-gradient(to right, #ef4444 0%, #ef4444 ${rule.risk_threshold}%, #e5e7eb ${rule.risk_threshold}%, #e5e7eb 100%)`,
                    }}
                  />
                  <div className={styles.thresholdValue}>
                    <span>{rule.risk_threshold}%</span>
                  </div>
                </div>
              </div>

              <div className={styles.channelsSection}>
                <div className={styles.sectionHeader}>
                  <label className={styles.label}>Notification Channels</label>
                  <button
                    className={styles.addChannelButton}
                    onClick={() => handleAddChannel(rule.id)}
                    disabled={!rule.enabled}
                  >
                    + Add Channel
                  </button>
                </div>

                {rule.channels.length === 0 ? (
                  <div className={styles.emptyChannels}>No notification channels configured</div>
                ) : (
                  <div className={styles.channelsList}>
                    {rule.channels.map((channel, idx) => (
                      <div key={idx} className={styles.channelItem}>
                        <div className={styles.channelType}>
                          <select
                            value={channel.type}
                            onChange={(e) => {
                              const newChannels = [...rule.channels];
                              newChannels[idx] = { ...channel, type: e.target.value as any };
                              handleUpdateRule(rule.id, { channels: newChannels });
                            }}
                            className={styles.typeSelect}
                            disabled={!rule.enabled}
                          >
                            <option value="email">📧 Email</option>
                            <option value="slack">💬 Slack</option>
                            <option value="webhook">🔗 Webhook</option>
                          </select>
                        </div>

                        <div className={styles.channelRecipient}>
                          <input
                            type="text"
                            placeholder={channel.type === 'email' ? 'email@company.com' : channel.type === 'slack' ? 'https://hooks.slack.com/...' : 'https://api.company.com/webhook'}
                            value={channel.recipient}
                            onChange={(e) => {
                              const newChannels = [...rule.channels];
                              newChannels[idx] = { ...channel, recipient: e.target.value };
                              handleUpdateRule(rule.id, { channels: newChannels });
                            }}
                            className={styles.recipientInput}
                            disabled={!rule.enabled}
                          />
                        </div>

                        <div className={styles.channelToggle}>
                          <label className={styles.toggle}>
                            <input
                              type="checkbox"
                              checked={channel.enabled}
                              onChange={(e) => {
                                const newChannels = [...rule.channels];
                                newChannels[idx] = { ...channel, enabled: e.target.checked };
                                handleUpdateRule(rule.id, { channels: newChannels });
                              }}
                              disabled={!rule.enabled}
                            />
                            <span className={styles.slider}></span>
                          </label>
                        </div>

                        <button
                          className={styles.testButton}
                          onClick={() => handleTestChannel(rule.id, idx)}
                          disabled={!rule.enabled || !channel.enabled || testingChannel === `${rule.id}-${idx}`}
                          title="Send test notification"
                        >
                          {testingChannel === `${rule.id}-${idx}` ? '⏳ Testing...' : '🧪 Test'}
                        </button>

                        <button
                          className={styles.removeChannelButton}
                          onClick={() => handleRemoveChannel(rule.id, idx)}
                          disabled={!rule.enabled}
                          title="Remove channel"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className={styles.actions}>
        <button className={styles.saveButton} onClick={handleSave} disabled={saving}>
          {saving ? '💾 Saving...' : '💾 Save Escalation Rules'}
        </button>
      </div>
    </div>
  );
}
