'use client';

import { useState, useCallback } from 'react';
import DeploymentOrchestrator from './components/DeploymentOrchestrator';
import styles from './deployment.module.css';

type PlatformType = 'windows' | 'macos' | 'chromebook';

interface Deployment {
  id: string;
  platform: PlatformType;
  rolloutPercent: number;
  status: 'planning' | 'deploying' | 'completed' | 'rolled_back';
  devicesTargeted: number;
  devicesDeployed: number;
  createdAt: string;
  completedAt?: string;
}

export default function DeploymentPage() {
  const [deployments, setDeployments] = useState<Deployment[]>([
    {
      id: 'dep-1',
      platform: 'windows',
      rolloutPercent: 100,
      status: 'completed',
      devicesTargeted: 500,
      devicesDeployed: 500,
      createdAt: new Date(Date.now() - 86400000 * 7).toISOString(),
      completedAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    },
    {
      id: 'dep-2',
      platform: 'macos',
      rolloutPercent: 50,
      status: 'deploying',
      devicesTargeted: 300,
      devicesDeployed: 150,
      createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    },
    {
      id: 'dep-3',
      platform: 'chromebook',
      rolloutPercent: 20,
      status: 'planning',
      devicesTargeted: 200,
      devicesDeployed: 0,
      createdAt: new Date().toISOString(),
    },
  ]);

  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefresh = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      planning: '#f59e0b',
      deploying: '#3b82f6',
      completed: '#10b981',
      rolled_back: '#ef4444',
    };
    return colors[status] || '#6b7280';
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      planning: '📋 Planning',
      deploying: '🚀 Deploying',
      completed: '✅ Completed',
      rolled_back: '↶ Rolled Back',
    };
    return labels[status] || status;
  };

  return (
    <div className={styles.deploymentPage}>
      <div className={styles.pageHeader}>
        <div className={styles.headerContent}>
          <h1>🚀 Deployment Management</h1>
          <p className={styles.subtitle}>Manage Kasbah Guard rollout across Windows, macOS, and Chromebooks</p>
        </div>
        <button className={styles.refreshButton} onClick={handleRefresh}>
          🔄 Refresh
        </button>
      </div>

      <div className={styles.mainContent}>
        <DeploymentOrchestrator key={`orchestrator-${refreshKey}`} onRefresh={handleRefresh} />
      </div>

      <div className={styles.deploymentHistory}>
        <h2>Deployment History</h2>

        <div className={styles.deploymentList}>
          {deployments.map((deployment) => (
            <div key={deployment.id} className={styles.deploymentCard}>
              <div className={styles.deploymentHeader}>
                <div className={styles.platformInfo}>
                  <div className={styles.platformIcon}>
                    {deployment.platform === 'windows' ? '🪟' : deployment.platform === 'macos' ? '🍎' : '📱'}
                  </div>
                  <div className={styles.platformDetails}>
                    <h3>{deployment.platform.charAt(0).toUpperCase() + deployment.platform.slice(1)}</h3>
                    <p>
                      {deployment.devicesDeployed} / {deployment.devicesTargeted} devices
                    </p>
                  </div>
                </div>
                <div className={styles.statusBadge} style={{ backgroundColor: getStatusColor(deployment.status) + '20', color: getStatusColor(deployment.status) }}>
                  {getStatusLabel(deployment.status)}
                </div>
              </div>

              <div className={styles.deploymentProgress}>
                <div className={styles.progressBar}>
                  <div
                    className={styles.progressFill}
                    style={{
                      width: `${(deployment.devicesDeployed / deployment.devicesTargeted) * 100}%`,
                      backgroundColor: getStatusColor(deployment.status),
                    }}
                  />
                </div>
                <span className={styles.progressText}>
                  {Math.round((deployment.devicesDeployed / deployment.devicesTargeted) * 100)}% complete
                </span>
              </div>

              <div className={styles.deploymentMeta}>
                <div className={styles.metaItem}>
                  <span className={styles.label}>Rollout:</span>
                  <span className={styles.value}>{deployment.rolloutPercent}%</span>
                </div>
                <div className={styles.metaItem}>
                  <span className={styles.label}>Started:</span>
                  <span className={styles.value}>{new Date(deployment.createdAt).toLocaleDateString()}</span>
                </div>
                {deployment.completedAt && (
                  <div className={styles.metaItem}>
                    <span className={styles.label}>Completed:</span>
                    <span className={styles.value}>{new Date(deployment.completedAt).toLocaleDateString()}</span>
                  </div>
                )}
              </div>

              {deployment.status === 'deploying' && (
                <div className={styles.deploymentActions}>
                  <button className={styles.pauseButton}>⏸ Pause</button>
                  <button className={styles.rollbackButton}>↶ Rollback</button>
                </div>
              )}

              {deployment.status === 'planning' && (
                <div className={styles.deploymentActions}>
                  <button className={styles.startButton}>▶ Start Deployment</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className={styles.guidelines}>
        <h2>Deployment Best Practices</h2>
        <div className={styles.guidelineGrid}>
          <div className={styles.guideline}>
            <span className={styles.icon}>🎯</span>
            <h4>Phased Rollout</h4>
            <p>Start with 5-20% of devices, monitor for issues, then expand to 50% and 100%</p>
          </div>

          <div className={styles.guideline}>
            <span className={styles.icon}>📊</span>
            <h4>Monitor Metrics</h4>
            <p>Track installation success, user adoption, and error rates during each phase</p>
          </div>

          <div className={styles.guideline}>
            <span className={styles.icon}>🔄</span>
            <h4>Rollback Ready</h4>
            <p>Always have a rollback plan prepared in case critical issues are discovered</p>
          </div>

          <div className={styles.guideline}>
            <span className={styles.icon}>📢</span>
            <h4>User Communication</h4>
            <p>Notify users before deployment with install instructions and support contact info</p>
          </div>
        </div>
      </div>
    </div>
  );
}
