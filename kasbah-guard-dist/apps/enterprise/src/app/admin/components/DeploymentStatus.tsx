'use client';

import { useEffect, useState } from 'react';
import { apiClient, DeploymentStatusData } from '@/lib/api';
import styles from './DeploymentStatus.module.css';

interface DeploymentStatusProps {
  onRefresh?: () => void;
}

export default function DeploymentStatus({ onRefresh }: DeploymentStatusProps) {
  const [deployment, setDeployment] = useState<DeploymentStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [rollbackLoading, setRollbackLoading] = useState(false);

  useEffect(() => {
    async function loadDeploymentStatus() {
      try {
        setLoading(true);
        const data = await apiClient.getDeploymentStatus();
        setDeployment(data);
      } catch (error) {
        console.error('Failed to load deployment status:', error);
      } finally {
        setLoading(false);
      }
    }

    loadDeploymentStatus();
  }, []);

  const handleRollback = async () => {
    if (window.confirm('Are you sure you want to rollback the deployment?')) {
      setRollbackLoading(true);
      try {
        // TODO: Call API endpoint for rollback
        console.log('Initiating rollback...');
        onRefresh?.();
      } finally {
        setRollbackLoading(false);
      }
    }
  };

  if (loading) {
    return <div className={styles.deploymentStatus}>Loading deployment status...</div>;
  }

  if (!deployment) {
    return <div className={styles.deploymentStatus}>Failed to load deployment data.</div>;
  }

  const platformsArray = [
    { name: 'Windows', ...deployment.platforms.windows, icon: '🪟' },
    { name: 'macOS', ...deployment.platforms.macos, icon: '🍎' },
    { name: 'Chromebook', ...deployment.platforms.chromebook, icon: '📱' },
  ];

  const lastSyncDate = new Date(deployment.last_sync);
  const syncMinutesAgo = Math.floor((Date.now() - lastSyncDate.getTime()) / 60000);

  return (
    <div className={styles.deploymentStatus}>
      <div className={styles.header}>
        <h2>Deployment Status</h2>
        <button className={styles.refreshButton} onClick={onRefresh} disabled={loading}>
          🔄 Refresh
        </button>
      </div>

      <div className={styles.mainProgress}>
        <div className={styles.progressLabel}>
          <span className={styles.label}>Overall Rollout</span>
          <span className={styles.percentage}>{deployment.rollout_percentage}%</span>
        </div>
        <div className={styles.progressBar}>
          <div
            className={styles.progressFill}
            style={{
              width: `${deployment.rollout_percentage}%`,
              backgroundColor: getStatusColor(deployment.rollout_percentage),
            }}
          />
        </div>
        <div className={styles.progressDetails}>
          <span className={styles.deployed}>
            {deployment.deployed_devices} / {deployment.total_devices} devices deployed
          </span>
        </div>
      </div>

      <div className={styles.platformBreakdown}>
        <h3>Platform Breakdown</h3>
        <div className={styles.platformGrid}>
          {platformsArray.map((platform) => (
            <div key={platform.name} className={styles.platformCard}>
              <div className={styles.platformHeader}>
                <span className={styles.platformIcon}>{platform.icon}</span>
                <span className={styles.platformName}>{platform.name}</span>
              </div>

              <div className={styles.platformProgress}>
                <div className={styles.platformLabel}>
                  <span className={styles.count}>
                    {platform.deployed} / {platform.total}
                  </span>
                  <span className={styles.percentage}>
                    {platform.total > 0 ? Math.round((platform.deployed / platform.total) * 100) : 0}%
                  </span>
                </div>
                <div className={styles.progressBar}>
                  <div
                    className={styles.progressFill}
                    style={{
                      width: `${platform.total > 0 ? (platform.deployed / platform.total) * 100 : 0}%`,
                      backgroundColor: getStatusColor(
                        platform.total > 0 ? (platform.deployed / platform.total) * 100 : 0
                      ),
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.syncInfo}>
        <div className={styles.syncDetail}>
          <span className={styles.label}>Last Sync:</span>
          <span className={styles.value}>
            {syncMinutesAgo < 1 ? 'Just now' : `${syncMinutesAgo} minute${syncMinutesAgo !== 1 ? 's' : ''} ago`} ({lastSyncDate.toLocaleString()})
          </span>
        </div>
      </div>

      {deployment.rollback_available && (
        <div className={styles.rollbackSection}>
          <button
            className={styles.rollbackButton}
            onClick={handleRollback}
            disabled={rollbackLoading}
          >
            {rollbackLoading ? 'Rolling back...' : '↶ Rollback Deployment'}
          </button>
        </div>
      )}
    </div>
  );
}

function getStatusColor(percentage: number): string {
  if (percentage >= 80) return '#10b981'; // Green
  if (percentage >= 50) return '#3b82f6'; // Blue
  if (percentage >= 20) return '#f59e0b'; // Amber
  return '#ef4444'; // Red
}
