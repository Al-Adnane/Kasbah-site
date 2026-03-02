'use client';

import { useState, useCallback } from 'react';
import QuickStats from './components/QuickStats';
import ThreatFeed from './components/ThreatFeed';
import DeploymentStatus from './components/DeploymentStatus';
import styles from './admin.module.css';

export default function AdminDashboard() {
  const [selectedPeriod, setSelectedPeriod] = useState<'24h' | '7d' | '30d'>('24h');
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefresh = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  const handlePeriodChange = (period: '24h' | '7d' | '30d') => {
    setSelectedPeriod(period);
  };

  return (
    <div className={styles.adminDashboard}>
      <div className={styles.pageHeader}>
        <div className={styles.headerContent}>
          <h1>🛡️ Admin Dashboard</h1>
          <p className={styles.subtitle}>Enterprise-wide threat monitoring, policies, and deployment management</p>
        </div>
        <button className={styles.refreshAllButton} onClick={handleRefresh}>
          🔄 Refresh All
        </button>
      </div>

      <div className={styles.mainGrid}>
        {/* Quick Stats Section */}
        <section className={styles.quickStatsSection}>
          <QuickStats key={`stats-${refreshKey}`} period={selectedPeriod} onPeriodChange={handlePeriodChange} />
        </section>

        {/* Deployment Status Section */}
        <section className={styles.deploymentSection}>
          <DeploymentStatus key={`deployment-${refreshKey}`} onRefresh={handleRefresh} />
        </section>

        {/* Threat Feed Section */}
        <section className={styles.threatFeedSection}>
          <ThreatFeed key={`threats-${refreshKey}`} period={selectedPeriod} maxItems={20} />
        </section>

        {/* Recent Escalations Section */}
        <section className={styles.escalationsSection}>
          <RecentEscalations key={`escalations-${refreshKey}`} />
        </section>
      </div>

      {/* Quick Actions Footer */}
      <div className={styles.quickActions}>
        <h3>Quick Actions</h3>
        <div className={styles.actionButtons}>
          <a href="/policies" className={styles.actionButton}>
            ⚙️ Manage Policies
          </a>
          <a href="/team" className={styles.actionButton}>
            👥 Manage Team
          </a>
          <a href="/audit" className={styles.actionButton}>
            📋 View Audit Logs
          </a>
          <a href="/deployment" className={styles.actionButton}>
            🚀 Deployment Settings
          </a>
        </div>
      </div>
    </div>
  );
}

// Recent Escalations Component
import { useEffect, useState } from 'react';
import { apiClient, Escalation } from '@/lib/api';

function RecentEscalations() {
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadEscalations() {
      try {
        setLoading(true);
        const data = await apiClient.getAdminEscalations(10);
        setEscalations(data);
      } catch (error) {
        console.error('Failed to load escalations:', error);
      } finally {
        setLoading(false);
      }
    }

    loadEscalations();
  }, []);

  const getPriorityColor = (priority: string) => {
    const colors: Record<string, string> = {
      critical: '#7c3aed',
      high: '#ef4444',
      medium: '#f59e0b',
      low: '#3b82f6',
    };
    return colors[priority] || '#6b7280';
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { color: string; label: string }> = {
      open: { color: '#ef4444', label: '🔴 Open' },
      in_progress: { color: '#f59e0b', label: '🟡 In Progress' },
      resolved: { color: '#10b981', label: '🟢 Resolved' },
    };
    return badges[status] || { color: '#6b7280', label: status };
  };

  return (
    <div className={styles.escalationsBox}>
      <div className={styles.header}>
        <h2>Recent Escalations</h2>
        <a href="/escalations" className={styles.viewAll}>
          View All →
        </a>
      </div>

      {loading ? (
        <div className={styles.loading}>Loading escalations...</div>
      ) : escalations.length === 0 ? (
        <div className={styles.empty}>No escalations at this time.</div>
      ) : (
        <div className={styles.escalationsList}>
          {escalations.map((escalation) => {
            const statusBadge = getStatusBadge(escalation.status);
            return (
              <div key={escalation.id} className={styles.escalationItem}>
                <div className={styles.escalationLeft}>
                  <div
                    className={styles.priorityDot}
                    style={{ backgroundColor: getPriorityColor(escalation.priority) }}
                    title={escalation.priority}
                  />
                  <div className={styles.escalationInfo}>
                    <div className={styles.escalationTitle}>{escalation.rule_triggered}</div>
                    <div className={styles.escalationMeta}>
                      {new Date(escalation.timestamp).toLocaleString()} • Risk: {escalation.risk_score}%
                    </div>
                  </div>
                </div>

                <div className={styles.escalationRight}>
                  <div
                    className={styles.statusBadge}
                    style={{ backgroundColor: statusBadge.color + '20', color: statusBadge.color }}
                  >
                    {statusBadge.label}
                  </div>
                  <div className={styles.assignedTo}>{escalation.assigned_to}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
