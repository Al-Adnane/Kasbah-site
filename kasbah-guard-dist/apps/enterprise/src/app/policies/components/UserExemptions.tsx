'use client';

import { useEffect, useState } from 'react';
import styles from './UserExemptions.module.css';

interface ExemptUser {
  id: string;
  email: string;
  name: string;
  reason: string;
  added_at: string;
  added_by: string;
  expires_at?: string;
}

interface UserExemptionsProps {
  onRefresh?: () => void;
}

export default function UserExemptions({ onRefresh }: UserExemptionsProps) {
  const [exemptions, setExemptions] = useState<ExemptUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newExemption, setNewExemption] = useState({ email: '', reason: '', expiresIn: '' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    async function loadExemptions() {
      try {
        setLoading(true);
        // Mock data - in production, fetch from API
        const mockData: ExemptUser[] = [
          {
            id: 'ex-1',
            email: 'developer@company.com',
            name: 'John Developer',
            reason: 'Development environment - frequent test credentials',
            added_at: new Date(Date.now() - 604800000).toISOString(),
            added_by: 'admin@company.com',
          },
          {
            id: 'ex-2',
            email: 'ci-system@company.com',
            name: 'CI/CD System',
            reason: 'Automated deployment system',
            added_at: new Date(Date.now() - 2592000000).toISOString(),
            added_by: 'admin@company.com',
            expires_at: new Date(Date.now() + 5184000000).toISOString(),
          },
        ];
        setExemptions(mockData);
      } catch (error) {
        console.error('Failed to load exemptions:', error);
        setMessage('Failed to load exemptions');
      } finally {
        setLoading(false);
      }
    }

    loadExemptions();
  }, []);

  const filteredExemptions = exemptions.filter(
    (ex) =>
      ex.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ex.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ex.reason.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAddExemption = async () => {
    if (!newExemption.email || !newExemption.reason) {
      setMessage('❌ Email and reason are required');
      return;
    }

    try {
      setSaving(true);
      // In production, call API to add exemption
      // await apiClient.addExemption(newExemption);

      const newEx: ExemptUser = {
        id: `ex-${Date.now()}`,
        email: newExemption.email,
        name: newExemption.email.split('@')[0],
        reason: newExemption.reason,
        added_at: new Date().toISOString(),
        added_by: 'current-user@company.com',
        expires_at: newExemption.expiresIn ? new Date(Date.now() + parseInt(newExemption.expiresIn) * 86400000).toISOString() : undefined,
      };

      setExemptions([...exemptions, newEx]);
      setShowModal(false);
      setNewExemption({ email: '', reason: '', expiresIn: '' });
      setMessage('✅ Exemption added successfully');

      setTimeout(() => setMessage(''), 3000);
      onRefresh?.();
    } catch (error) {
      console.error('Failed to add exemption:', error);
      setMessage('❌ Failed to add exemption');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveExemption = async (id: string, email: string) => {
    if (window.confirm(`Remove exemption for ${email}?`)) {
      try {
        // In production, call API to remove
        // await apiClient.removeExemption(id);

        setExemptions(exemptions.filter((ex) => ex.id !== id));
        setMessage('✅ Exemption removed');
        setTimeout(() => setMessage(''), 3000);
      } catch (error) {
        console.error('Failed to remove exemption:', error);
        setMessage('❌ Failed to remove exemption');
      }
    }
  };

  return (
    <div className={styles.userExemptions}>
      <div className={styles.header}>
        <h2>User Exemptions</h2>
        <p className={styles.description}>Allow specific users to bypass detection thresholds</p>
      </div>

      {message && <div className={`${styles.message} ${message.includes('✅') ? styles.success : styles.error}`}>{message}</div>}

      <div className={styles.controls}>
        <input
          type="text"
          placeholder="Search by email, name, or reason..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className={styles.searchInput}
        />
        <button className={styles.addButton} onClick={() => setShowModal(true)}>
          + Add Exemption
        </button>
      </div>

      {loading ? (
        <div className={styles.loading}>Loading exemptions...</div>
      ) : filteredExemptions.length === 0 ? (
        <div className={styles.empty}>No exemptions found. Add one to get started.</div>
      ) : (
        <div className={styles.exemptionsList}>
          {filteredExemptions.map((exemption) => {
            const addedDate = new Date(exemption.added_at);
            const isExpiring = exemption.expires_at && new Date(exemption.expires_at) < new Date(Date.now() + 604800000);
            const daysUntilExpiry = exemption.expires_at ? Math.ceil((new Date(exemption.expires_at).getTime() - Date.now()) / 86400000) : null;

            return (
              <div key={exemption.id} className={`${styles.exemptionItem} ${isExpiring ? styles.expiring : ''}`}>
                <div className={styles.exemptionContent}>
                  <div className={styles.userInfo}>
                    <div className={styles.avatar}>{exemption.email[0].toUpperCase()}</div>
                    <div className={styles.details}>
                      <div className={styles.email}>{exemption.email}</div>
                      <div className={styles.name}>{exemption.name}</div>
                    </div>
                  </div>

                  <div className={styles.exemptionDetails}>
                    <div className={styles.reason}>
                      <span className={styles.label}>Reason:</span>
                      <span className={styles.value}>{exemption.reason}</span>
                    </div>

                    <div className={styles.meta}>
                      <div className={styles.addedInfo}>
                        <span className={styles.label}>Added:</span>
                        <span className={styles.value}>
                          {addedDate.toLocaleDateString()} by {exemption.added_by}
                        </span>
                      </div>

                      {exemption.expires_at && (
                        <div className={`${styles.expiresInfo} ${isExpiring ? styles.warning : ''}`}>
                          <span className={styles.label}>Expires:</span>
                          <span className={styles.value}>
                            {new Date(exemption.expires_at).toLocaleDateString()} ({daysUntilExpiry} days)
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className={styles.actions}>
                  <button
                    className={styles.removeButton}
                    onClick={() => handleRemoveExemption(exemption.id, exemption.email)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal for adding new exemption */}
      {showModal && (
        <div className={styles.modalOverlay} onClick={() => !saving && setShowModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>Add New Exemption</h3>
              <button className={styles.closeButton} onClick={() => setShowModal(false)} disabled={saving}>
                ✕
              </button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Email Address</label>
                <input
                  type="email"
                  placeholder="user@company.com"
                  value={newExemption.email}
                  onChange={(e) => setNewExemption({ ...newExemption, email: e.target.value })}
                  className={styles.input}
                  disabled={saving}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Reason for Exemption</label>
                <textarea
                  placeholder="e.g., Development environment, CI/CD system, Testing service..."
                  value={newExemption.reason}
                  onChange={(e) => setNewExemption({ ...newExemption, reason: e.target.value })}
                  className={styles.textarea}
                  rows={4}
                  disabled={saving}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Expiration (days, optional)</label>
                <input
                  type="number"
                  placeholder="Leave empty for no expiration"
                  value={newExemption.expiresIn}
                  onChange={(e) => setNewExemption({ ...newExemption, expiresIn: e.target.value })}
                  className={styles.input}
                  min="1"
                  disabled={saving}
                />
                <span className={styles.hint}>Number of days until exemption expires</span>
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button className={styles.cancelButton} onClick={() => setShowModal(false)} disabled={saving}>
                Cancel
              </button>
              <button className={styles.submitButton} onClick={handleAddExemption} disabled={saving}>
                {saving ? 'Adding...' : 'Add Exemption'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
