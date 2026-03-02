'use client';

import { useState, useCallback } from 'react';
import UserList from './components/UserList';
import styles from './team.module.css';

export default function TeamPage() {
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefresh = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  return (
    <div className={styles.teamPage}>
      <div className={styles.pageHeader}>
        <div className={styles.headerContent}>
          <h1>👥 Team Management</h1>
          <p className={styles.subtitle}>Manage team members, roles, and permissions</p>
        </div>
        <button className={styles.refreshButton} onClick={handleRefresh}>
          🔄 Refresh
        </button>
      </div>

      <div className={styles.mainContent}>
        <UserList key={`users-${refreshKey}`} onRefresh={handleRefresh} />
      </div>

      <div className={styles.footer}>
        <div className={styles.infoSection}>
          <h3>Roles & Permissions</h3>

          <div className={styles.roleCard}>
            <div className={styles.roleIcon}>👑</div>
            <div className={styles.roleInfo}>
              <h4>Admin</h4>
              <p>Full access to all resources, policies, and team management</p>
            </div>
          </div>

          <div className={styles.roleCard}>
            <div className={styles.roleIcon}>🔍</div>
            <div className={styles.roleInfo}>
              <h4>Member</h4>
              <p>Can view dashboards, manage exemptions, and access audit logs</p>
            </div>
          </div>

          <div className={styles.roleCard}>
            <div className={styles.roleIcon}>👁️</div>
            <div className={styles.roleInfo}>
              <h4>Viewer</h4>
              <p>Read-only access to dashboards and reports</p>
            </div>
          </div>
        </div>

        <div className={styles.bestPractices}>
          <h3>Best Practices</h3>
          <ul>
            <li>Use the principle of least privilege when assigning roles</li>
            <li>Regularly review team member access and remove inactive users</li>
            <li>Keep audit logs enabled to track administrative changes</li>
            <li>Use strong passwords and enable 2FA for admin accounts</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
