'use client';

import { useState, useCallback } from 'react';
import GlobalThresholds from './components/GlobalThresholds';
import UserExemptions from './components/UserExemptions';
import EscalationRules from './components/EscalationRules';
import styles from './policies.module.css';

type TabType = 'thresholds' | 'exemptions' | 'escalations';

export default function PoliciesPage() {
  const [activeTab, setActiveTab] = useState<TabType>('thresholds');
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefresh = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  return (
    <div className={styles.policiesPage}>
      <div className={styles.pageHeader}>
        <div className={styles.headerContent}>
          <h1>⚙️ Policy Management</h1>
          <p className={styles.subtitle}>Configure global risk thresholds, user exemptions, and escalation rules</p>
        </div>
        <button className={styles.refreshButton} onClick={handleRefresh}>
          🔄 Refresh
        </button>
      </div>

      <div className={styles.tabsContainer}>
        <div className={styles.tabs}>
          {[
            { id: 'thresholds', label: '🎯 Global Thresholds', icon: '🎯' },
            { id: 'exemptions', label: '✅ User Exemptions', icon: '✅' },
            { id: 'escalations', label: '🚨 Escalation Rules', icon: '🚨' },
          ].map((tab) => (
            <button
              key={tab.id}
              className={`${styles.tab} ${activeTab === tab.id ? styles.active : ''}`}
              onClick={() => setActiveTab(tab.id as TabType)}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.tabContent}>
        {activeTab === 'thresholds' && <GlobalThresholds key={`thresh-${refreshKey}`} onSave={handleRefresh} />}
        {activeTab === 'exemptions' && <UserExemptions key={`exempt-${refreshKey}`} onRefresh={handleRefresh} />}
        {activeTab === 'escalations' && <EscalationRules key={`escal-${refreshKey}`} onSave={handleRefresh} />}
      </div>

      <div className={styles.footer}>
        <p className={styles.footerText}>
          💡 Tip: Changes to global thresholds apply immediately to all new detections. Existing verdicts are not retroactively updated.
        </p>
        <nav className={styles.nav}>
          <a href="/admin" className={styles.navLink}>← Back to Admin Dashboard</a>
        </nav>
      </div>
    </div>
  );
}
