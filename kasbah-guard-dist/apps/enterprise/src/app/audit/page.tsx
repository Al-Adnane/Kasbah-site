'use client';

import LogViewer from './components/LogViewer';
import styles from './audit.module.css';

export default function AuditPage() {
  return (
    <div className={styles.auditPage}>
      <div className={styles.pageHeader}>
        <div className={styles.headerContent}>
          <h1>📋 Audit Logs</h1>
          <p className={styles.subtitle}>Cryptographically signed immutable audit trail of all organizational actions</p>
        </div>
      </div>

      <div className={styles.mainContent}>
        <LogViewer limit={200} />
      </div>

      <div className={styles.footer}>
        <div className={styles.footerInfo}>
          <div className={styles.infoItem}>
            <span className={styles.icon}>🔐</span>
            <div>
              <p className={styles.label}>Cryptographic Signatures</p>
              <p className={styles.description}>All log entries are signed with SHA-256 HMAC for tamper detection</p>
            </div>
          </div>

          <div className={styles.infoItem}>
            <span className={styles.icon}>⏰</span>
            <div>
              <p className={styles.label}>Immutable Records</p>
              <p className={styles.description}>Logs cannot be modified or deleted, only marked as archived</p>
            </div>
          </div>

          <div className={styles.infoItem}>
            <span className={styles.icon}>🔍</span>
            <div>
              <p className={styles.label}>Searchable & Filterable</p>
              <p className={styles.description}>Search by user, action, resource, or timestamp with sorting options</p>
            </div>
          </div>

          <div className={styles.infoItem}>
            <span className={styles.icon}>📊</span>
            <div>
              <p className={styles.label}>Exportable</p>
              <p className={styles.description}>Export audit logs to CSV for compliance reports and archival</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
