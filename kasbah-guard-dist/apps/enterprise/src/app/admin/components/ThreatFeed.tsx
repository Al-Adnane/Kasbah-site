'use client';

import { useEffect, useState } from 'react';
import { apiClient, ThreatDetection } from '@/lib/api';
import styles from './ThreatFeed.module.css';

interface ThreatFeedProps {
  period?: '24h' | '7d' | '30d';
  maxItems?: number;
}

export default function ThreatFeed({ period = '24h', maxItems = 20 }: ThreatFeedProps) {
  const [threats, setThreats] = useState<ThreatDetection[]>([]);
  const [loading, setLoading] = useState(true);
  const [filteredThreats, setFilteredThreats] = useState<ThreatDetection[]>([]);
  const [selectedSeverity, setSelectedSeverity] = useState<'ALL' | 'WARN' | 'BLOCK' | 'DENY'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    async function loadThreats() {
      try {
        setLoading(true);
        const data = await apiClient.getAdminThreats(period);
        setThreats(data.slice(0, maxItems));
      } catch (error) {
        console.error('Failed to load threats:', error);
      } finally {
        setLoading(false);
      }
    }

    loadThreats();
  }, [period, maxItems]);

  useEffect(() => {
    let filtered = threats;

    if (selectedSeverity !== 'ALL') {
      filtered = filtered.filter((t) => t.severity === selectedSeverity);
    }

    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.pattern.toLowerCase().includes(lowerSearch) ||
          t.user_id.toLowerCase().includes(lowerSearch) ||
          t.source.toLowerCase().includes(lowerSearch)
      );
    }

    setFilteredThreats(filtered);
  }, [threats, selectedSeverity, searchTerm]);

  const getSeverityColor = (severity: 'WARN' | 'BLOCK' | 'DENY') => {
    const colors: Record<'WARN' | 'BLOCK' | 'DENY', string> = {
      WARN: '#f59e0b',
      BLOCK: '#ef4444',
      DENY: '#7c3aed',
    };
    return colors[severity];
  };

  const getSeverityLabel = (severity: 'WARN' | 'BLOCK' | 'DENY') => {
    const labels: Record<'WARN' | 'BLOCK' | 'DENY', string> = {
      WARN: '⚠️ Warning',
      BLOCK: '🚫 Blocked',
      DENY: '🛑 Denied',
    };
    return labels[severity];
  };

  return (
    <div className={styles.threatFeed}>
      <div className={styles.header}>
        <h2>Recent Threat Detections</h2>
        <div className={styles.controls}>
          <input
            type="text"
            placeholder="Search by pattern, user, or source..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={styles.searchInput}
          />
          <div className={styles.severityFilter}>
            {(['ALL', 'WARN', 'BLOCK', 'DENY'] as const).map((severity) => (
              <button
                key={severity}
                className={`${styles.filterButton} ${selectedSeverity === severity ? styles.active : ''}`}
                onClick={() => setSelectedSeverity(severity)}
              >
                {severity === 'ALL' ? 'All' : getSeverityLabel(severity)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className={styles.loading}>Loading threat data...</div>
      ) : filteredThreats.length === 0 ? (
        <div className={styles.empty}>No threats found matching your filters.</div>
      ) : (
        <div className={styles.threatList}>
          {filteredThreats.map((threat) => (
            <div
              key={threat.id}
              className={styles.threatItem}
              style={{ borderLeftColor: getSeverityColor(threat.severity) }}
            >
              <div className={styles.threatHeader}>
                <div className={styles.severity} style={{ backgroundColor: getSeverityColor(threat.severity) }}>
                  {getSeverityLabel(threat.severity)}
                </div>
                <div className={styles.timestamp}>{new Date(threat.timestamp).toLocaleString()}</div>
                <div className={styles.riskScore} style={{ color: getSeverityColor(threat.severity) }}>
                  Risk: {threat.risk_score}%
                </div>
              </div>

              <div className={styles.threatContent}>
                <div className={styles.pattern}>
                  <span className={styles.label}>Pattern:</span>
                  <code className={styles.code}>{threat.pattern}</code>
                </div>

                <div className={styles.details}>
                  <div className={styles.detail}>
                    <span className={styles.label}>User:</span>
                    <span className={styles.value}>{threat.user_id}</span>
                  </div>
                  <div className={styles.detail}>
                    <span className={styles.label}>Source:</span>
                    <span className={styles.value}>{threat.source}</span>
                  </div>
                  <div className={styles.detail}>
                    <span className={styles.label}>Action:</span>
                    <span className={styles.value}>{threat.action_taken}</span>
                  </div>
                </div>
              </div>

              <div className={styles.threatFooter}>
                <button className={styles.exemptionLink}>Add Exemption</button>
                <button className={styles.detailsLink}>View Details</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {threats.length > 0 && filteredThreats.length > 0 && (
        <div className={styles.pagination}>
          Showing {filteredThreats.length} of {threats.length} threats
        </div>
      )}
    </div>
  );
}
