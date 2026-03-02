'use client';

import { useEffect, useState } from 'react';
import { apiClient, QuickStatsData } from '@/lib/api';
import styles from './QuickStats.module.css';

interface QuickStatsProps {
  period?: '24h' | '7d' | '30d';
  onPeriodChange?: (period: '24h' | '7d' | '30d') => void;
}

export default function QuickStats({ period = '24h', onPeriodChange }: QuickStatsProps) {
  const [stats, setStats] = useState<QuickStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState<'24h' | '7d' | '30d'>(period);

  useEffect(() => {
    async function loadStats() {
      try {
        setLoading(true);
        const data = await apiClient.getAdminStats(selectedPeriod);
        setStats(data);
      } catch (error) {
        console.error('Failed to load quick stats:', error);
      } finally {
        setLoading(false);
      }
    }

    loadStats();
  }, [selectedPeriod]);

  const handlePeriodChange = (newPeriod: '24h' | '7d' | '30d') => {
    setSelectedPeriod(newPeriod);
    onPeriodChange?.(newPeriod);
  };

  const kpis = [
    {
      label: 'Total Detections',
      value: stats?.total_detections ?? 0,
      icon: '🔍',
      color: '#3b82f6',
    },
    {
      label: 'Blocked',
      value: stats?.blocked_count ?? 0,
      icon: '🚫',
      color: '#ef4444',
    },
    {
      label: 'Exemptions',
      value: stats?.exemption_count ?? 0,
      icon: '✓',
      color: '#10b981',
    },
    {
      label: 'Active Users',
      value: stats?.active_users ?? 0,
      icon: '👥',
      color: '#f59e0b',
    },
  ];

  return (
    <div className={styles.quickStats}>
      <div className={styles.header}>
        <h2>Key Performance Indicators</h2>
        <div className={styles.periodSelector}>
          {(['24h', '7d', '30d'] as const).map((p) => (
            <button
              key={p}
              className={`${styles.periodButton} ${selectedPeriod === p ? styles.active : ''}`}
              onClick={() => handlePeriodChange(p)}
              disabled={loading}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className={styles.loading}>Loading KPIs...</div>
      ) : (
        <div className={styles.kpiGrid}>
          {kpis.map((kpi) => (
            <div key={kpi.label} className={styles.kpiCard} style={{ borderLeftColor: kpi.color }}>
              <div className={styles.kpiIcon}>{kpi.icon}</div>
              <div className={styles.kpiContent}>
                <div className={styles.kpiLabel}>{kpi.label}</div>
                <div className={styles.kpiValue}>{kpi.value.toLocaleString()}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {stats?.trend_data && stats.trend_data.length > 0 && (
        <div className={styles.trendSection}>
          <h3>Trend ({selectedPeriod})</h3>
          <div className={styles.sparkline}>
            {stats.trend_data.map((point, idx) => {
              const maxVal = Math.max(...stats.trend_data.map((d) => d.count)) || 1;
              const height = (point.count / maxVal) * 60;
              return (
                <div
                  key={idx}
                  className={styles.sparklineBar}
                  style={{ height: `${height}px` }}
                  title={`${point.timestamp}: ${point.count}`}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
