'use client';

import { useState, useCallback, useEffect } from 'react';
import styles from '../deployment.module.css';

interface DeploymentRequest {
  platform: 'windows' | 'macos' | 'chromebook';
  rolloutPercent: number;
  targetOU?: string;
  dryRun: boolean;
}

interface DeploymentResponse {
  ok: boolean;
  deployment_id?: string;
  status?: string;
  devices_targeted?: number;
  devices_deployed?: number;
  error?: string;
}

interface DeploymentOrchestrationProps {
  onRefresh: () => void;
}

export default function DeploymentOrchestrator({ onRefresh }: DeploymentOrchestrationProps) {
  const [platform, setPlatform] = useState<'windows' | 'macos' | 'chromebook'>('windows');
  const [rolloutPercent, setRolloutPercent] = useState(20);
  const [targetOU, setTargetOU] = useState('');
  const [dryRun, setDryRun] = useState(true);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deploymentId, setDeploymentId] = useState<string | null>(null);
  const [deploymentStatus, setDeploymentStatus] = useState<string>('idle');
  const [progress, setProgress] = useState(0);
  const [devicesDeployed, setDevicesDeployed] = useState(0);
  const [devicesTargeted, setDevicesTargeted] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Poll deployment status every 2 seconds
  useEffect(() => {
    if (!deploymentId || deploymentStatus === 'completed' || deploymentStatus === 'rolled_back') {
      return;
    }

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/admin/org/deployment/status/${deploymentId}`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('kasbah_token')}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setDeploymentStatus(data.status);
          setProgress(data.progress);
          setDevicesDeployed(data.devices_deployed);
          setDevicesTargeted(data.devices_targeted);

          if (data.status === 'completed') {
            setSuccessMessage(`✅ Deployment completed successfully! ${data.devices_deployed}/${data.devices_targeted} devices deployed.`);
            onRefresh();
          } else if (data.status === 'rolled_back') {
            setErrorMessage(`⚠️ Deployment was rolled back. ${data.devices_deployed} devices were affected.`);
          }
        }
      } catch (err) {
        console.error('Failed to poll deployment status:', err);
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [deploymentId, deploymentStatus, onRefresh]);

  const handleStartDeployment = useCallback(async () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsDeploying(true);

    try {
      const request: DeploymentRequest = {
        platform,
        rolloutPercent,
        dryRun,
      };

      if (targetOU) {
        request.targetOU = targetOU;
      }

      const response = await fetch('/api/admin/org/deployment/rollout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('kasbah_token')}`,
        },
        body: JSON.stringify(request),
      });

      const data: DeploymentResponse = await response.json();

      if (!response.ok || !data.ok) {
        setErrorMessage(`❌ Deployment failed: ${data.error || 'Unknown error'}`);
        setIsDeploying(false);
        return;
      }

      if (dryRun) {
        setSuccessMessage(
          `✅ Dry run completed! Would deploy to ${data.devices_targeted} ${platform} devices (${rolloutPercent}% rollout).`
        );
        setIsDeploying(false);
      } else {
        setDeploymentId(data.deployment_id || null);
        setDeploymentStatus('deploying');
        setProgress(0);
        setDevicesDeployed(0);
        setDevicesTargeted(data.devices_targeted || 0);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setErrorMessage(`❌ Network error: ${errorMsg}`);
      setIsDeploying(false);
    }
  }, [platform, rolloutPercent, dryRun, targetOU]);

  const handlePauseDeployment = useCallback(async () => {
    if (!deploymentId) return;

    try {
      const response = await fetch(`/api/admin/org/deployment/pause/${deploymentId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('kasbah_token')}`,
        },
      });

      if (response.ok) {
        setDeploymentStatus('paused');
        setSuccessMessage('⏸ Deployment paused. You can resume or rollback.');
      }
    } catch (err) {
      setErrorMessage(`❌ Failed to pause: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [deploymentId]);

  const handleResumeDeployment = useCallback(async () => {
    if (!deploymentId) return;

    try {
      const response = await fetch(`/api/admin/org/deployment/resume/${deploymentId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('kasbah_token')}`,
        },
      });

      if (response.ok) {
        setDeploymentStatus('deploying');
        setSuccessMessage('▶ Deployment resumed.');
      }
    } catch (err) {
      setErrorMessage(`❌ Failed to resume: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [deploymentId]);

  const handleRollback = useCallback(async () => {
    if (!deploymentId) return;

    if (!window.confirm('Are you sure you want to rollback this deployment? This will uninstall the extension from deployed devices.')) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/org/deployment/rollback/${deploymentId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('kasbah_token')}`,
        },
      });

      const data = await response.json();

      if (response.ok && data.ok) {
        setDeploymentStatus('rolled_back');
        setErrorMessage(`⚠️ Rollback initiated. ${data.devices_affected || 0} devices will be affected.`);
      }
    } catch (err) {
      setErrorMessage(`❌ Failed to rollback: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [deploymentId]);

  const getPlatformIcon = () => {
    switch (platform) {
      case 'windows': return '🪟';
      case 'macos': return '🍎';
      case 'chromebook': return '📱';
      default: return '💻';
    }
  };

  const getStatusColor = () => {
    switch (deploymentStatus) {
      case 'deploying': return '#3b82f6';
      case 'paused': return '#f59e0b';
      case 'completed': return '#10b981';
      case 'rolled_back': return '#ef4444';
      default: return '#6b7280';
    }
  };

  return (
    <div className={styles.orchestrator}>
      {deploymentStatus === 'idle' ? (
        <div className={styles.orchestratorForm}>
          <h3>🚀 Launch Deployment</h3>
          <p className={styles.formSubtitle}>Select platform, rollout percentage, and target devices</p>

          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label htmlFor="platform">Platform</label>
              <select
                id="platform"
                value={platform}
                onChange={(e) => setPlatform(e.target.value as 'windows' | 'macos' | 'chromebook')}
                disabled={isDeploying}
              >
                <option value="windows">🪟 Windows</option>
                <option value="macos">🍎 macOS</option>
                <option value="chromebook">📱 Chromebook</option>
              </select>
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="rollout">Rollout Percentage</label>
              <div className={styles.rolloutControl}>
                <input
                  id="rollout"
                  type="range"
                  min="5"
                  max="100"
                  step="5"
                  value={rolloutPercent}
                  onChange={(e) => setRolloutPercent(Number(e.target.value))}
                  disabled={isDeploying}
                  className={styles.rolloutSlider}
                />
                <span className={styles.rolloutValue}>{rolloutPercent}%</span>
              </div>
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="targetOU">Target Organizational Unit (optional)</label>
              <input
                id="targetOU"
                type="text"
                value={targetOU}
                onChange={(e) => setTargetOU(e.target.value)}
                disabled={isDeploying}
                placeholder={
                  platform === 'windows'
                    ? 'OU=Engineering,DC=company,DC=com'
                    : platform === 'macos'
                    ? 'Jamf smart group name'
                    : 'Google Workspace org unit'
                }
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={dryRun}
                  onChange={(e) => setDryRun(e.target.checked)}
                  disabled={isDeploying}
                />
                <span>🧪 Dry Run (simulation only)</span>
              </label>
            </div>
          </div>

          <div className={styles.phaseRecommendation}>
            <strong>📋 Recommended Phased Rollout:</strong>
            <div className={styles.phaseList}>
              <div className={rolloutPercent >= 5 ? styles.phaseActive : ''}>Phase 1: 5% (30 devices) → Monitor 1 hour</div>
              <div className={rolloutPercent >= 20 ? styles.phaseActive : ''}>Phase 2: 20% (120 devices) → Monitor 4 hours</div>
              <div className={rolloutPercent >= 50 ? styles.phaseActive : ''}>Phase 3: 50% (300 devices) → Monitor 8 hours</div>
              <div className={rolloutPercent === 100 ? styles.phaseActive : ''}>Phase 4: 100% (600 devices) → Full rollout</div>
            </div>
          </div>

          {errorMessage && <div className={styles.errorAlert}>{errorMessage}</div>}
          {successMessage && <div className={styles.successAlert}>{successMessage}</div>}

          <button
            className={styles.deployButton}
            onClick={handleStartDeployment}
            disabled={isDeploying}
          >
            {isDeploying ? '⏳ Starting deployment...' : '🚀 Start Deployment'}
          </button>
        </div>
      ) : (
        <div className={styles.orchestratorProgress}>
          <div className={styles.progressHeader}>
            <div className={styles.platformBadge}>
              <span className={styles.platformIcon}>{getPlatformIcon()}</span>
              <span className={styles.platformName}>
                {platform.charAt(0).toUpperCase() + platform.slice(1)} Deployment
              </span>
            </div>
            <div className={styles.statusBadge} style={{ backgroundColor: getStatusColor() + '20', color: getStatusColor() }}>
              {deploymentStatus === 'deploying' && '🚀 Deploying'}
              {deploymentStatus === 'paused' && '⏸ Paused'}
              {deploymentStatus === 'completed' && '✅ Completed'}
              {deploymentStatus === 'rolled_back' && '↶ Rolled Back'}
            </div>
          </div>

          <div className={styles.progressMetrics}>
            <div className={styles.metricBox}>
              <div className={styles.metricLabel}>Devices Deployed</div>
              <div className={styles.metricValue}>{devicesDeployed}</div>
            </div>
            <div className={styles.metricBox}>
              <div className={styles.metricLabel}>Devices Targeted</div>
              <div className={styles.metricValue}>{devicesTargeted}</div>
            </div>
            <div className={styles.metricBox}>
              <div className={styles.metricLabel}>Progress</div>
              <div className={styles.metricValue}>{progress}%</div>
            </div>
            <div className={styles.metricBox}>
              <div className={styles.metricLabel}>Rollout</div>
              <div className={styles.metricValue}>{rolloutPercent}%</div>
            </div>
          </div>

          <div className={styles.progressBarContainer}>
            <div className={styles.progressBar}>
              <div
                className={styles.progressFill}
                style={{
                  width: `${progress}%`,
                  backgroundColor: getStatusColor(),
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
            <span className={styles.progressPercentage}>{progress}% complete</span>
          </div>

          <div className={styles.progressTimeline}>
            <div className={progress >= 25 ? styles.timelineStepActive : styles.timelineStep}>
              <span className={styles.timelineDot}>①</span>
              <span>Devices scanning (0-25%)</span>
            </div>
            <div className={progress >= 50 ? styles.timelineStepActive : styles.timelineStep}>
              <span className={styles.timelineDot}>②</span>
              <span>Installing extension (25-50%)</span>
            </div>
            <div className={progress >= 75 ? styles.timelineStepActive : styles.timelineStep}>
              <span className={styles.timelineDot}>③</span>
              <span>Verifying installation (50-75%)</span>
            </div>
            <div className={progress === 100 ? styles.timelineStepActive : styles.timelineStep}>
              <span className={styles.timelineDot}>④</span>
              <span>Finalizing (75-100%)</span>
            </div>
          </div>

          {errorMessage && <div className={styles.errorAlert}>{errorMessage}</div>}
          {successMessage && <div className={styles.successAlert}>{successMessage}</div>}

          <div className={styles.actionButtons}>
            {(deploymentStatus === 'deploying' || deploymentStatus === 'paused') && (
              <>
                {deploymentStatus === 'deploying' && (
                  <button className={styles.pauseButton} onClick={handlePauseDeployment}>
                    ⏸ Pause Deployment
                  </button>
                )}
                {deploymentStatus === 'paused' && (
                  <button className={styles.resumeButton} onClick={handleResumeDeployment}>
                    ▶ Resume Deployment
                  </button>
                )}
                <button className={styles.rollbackButton} onClick={handleRollback}>
                  ↶ Rollback Deployment
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
