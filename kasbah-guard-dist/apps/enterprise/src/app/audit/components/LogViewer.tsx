'use client';

import { useEffect, useState } from 'react';
import { apiClient, AuditLogEntry } from '@/lib/api';
import styles from './LogViewer.module.css';

interface LogViewerProps {
  limit?: number;
}

export default function LogViewer({ limit = 100 }: LogViewerProps) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterAction, setFilterAction] = useState('ALL');
  const [sortBy, setSortBy] = useState<'timestamp' | 'user'>('timestamp');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  useEffect(() => {
    async function loadLogs() {
      try {
        setLoading(true);
        const data = await apiClient.getAuditLogs(limit);
        setLogs(data);
      } catch (error) {
        console.error('Failed to load audit logs:', error);
      } finally {
        setLoading(false);
      }
    }

    loadLogs();
  }, [limit]);

  useEffect(() => {
    let filtered = logs;

    // Filter by search term
    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (log) =>
          log.user_email.toLowerCase().includes(lowerSearch) ||
          log.action.toLowerCase().includes(lowerSearch) ||
          log.resource_id.toLowerCase().includes(lowerSearch)
      );
    }

    // Filter by action type
    if (filterAction !== 'ALL') {
      filtered = filtered.filter((log) => log.action === filterAction);
    }

    // Sort
    filtered.sort((a, b) => {
      let compareVal = 0;
      if (sortBy === 'timestamp') {
        compareVal = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      } else {
        compareVal = a.user_email.localeCompare(b.user_email);
      }
      return sortOrder === 'desc' ? -compareVal : compareVal;
    });

    setFilteredLogs(filtered);
  }, [logs, searchTerm, filterAction, sortBy, sortOrder]);

  const handleVerifySignature = async (logId: string) => {
    setVerifyingId(logId);
    try {
      await apiClient.verifyAuditLogSignature(logId);
      // Update log with verification status
      setLogs(
        logs.map((log) =>
          log.id === logId ? { ...log, signature_valid: true } : log
        )
      );
    } catch (error) {
      console.error('Verification failed:', error);
    } finally {
      setVerifyingId(null);
    }
  };

  const handleExport = async () => {
    try {
      await apiClient.exportAuditLogs('csv');
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  const actions = [...new Set(logs.map((log) => log.action))];

  if (loading) {
    return <div className={styles.loading}>Loading audit logs...</div>;
  }

  return (
    <div className={styles.logViewer}>
      <div className={styles.header}>
        <h2>Audit Logs</h2>
        <button className={styles.exportButton} onClick={handleExport}>
          📥 Export CSV
        </button>
      </div>

      <div className={styles.controls}>
        <input
          type="text"
          placeholder="Search by user, action, or resource..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className={styles.searchInput}
        />

        <select
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
          className={styles.filterSelect}
        >
          <option value="ALL">All Actions</option>
          {actions.map((action) => (
            <option key={action} value={action}>
              {action}
            </option>
          ))}
        </select>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as any)}
          className={styles.sortSelect}
        >
          <option value="timestamp">Sort by Date</option>
          <option value="user">Sort by User</option>
        </select>

        <button
          className={styles.sortOrderButton}
          onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
        >
          {sortOrder === 'asc' ? '↑ Ascending' : '↓ Descending'}
        </button>
      </div>

      {filteredLogs.length === 0 ? (
        <div className={styles.empty}>No audit logs found</div>
      ) : (
        <div className={styles.table}>
          <div className={styles.tableHeader}>
            <div className={styles.col_timestamp}>Timestamp</div>
            <div className={styles.col_user}>User</div>
            <div className={styles.col_action}>Action</div>
            <div className={styles.col_resource}>Resource</div>
            <div className={styles.col_result}>Result</div>
            <div className={styles.col_verify}>Signature</div>
          </div>

          <div className={styles.tableBody}>
            {filteredLogs.map((log) => (
              <div key={log.id} className={`${styles.row} ${log.result === 'failure' ? styles.failure : ''}`}>
                <div className={styles.col_timestamp}>
                  {new Date(log.timestamp).toLocaleString()}
                </div>
                <div className={styles.col_user}>
                  <span className={styles.email}>{log.user_email}</span>
                </div>
                <div className={styles.col_action}>
                  <span className={styles.action}>{log.action}</span>
                </div>
                <div className={styles.col_resource}>
                  <code className={styles.code}>{log.resource_id}</code>
                </div>
                <div className={styles.col_result}>
                  <span className={`${styles.badge} ${log.result === 'success' ? styles.success : styles.failure}`}>
                    {log.result === 'success' ? '✓ Success' : '✗ Failed'}
                  </span>
                </div>
                <div className={styles.col_verify}>
                  {log.signature_valid ? (
                    <span className={styles.verified} title="Signature verified">
                      ✓ Valid
                    </span>
                  ) : (
                    <button
                      className={styles.verifyButton}
                      onClick={() => handleVerifySignature(log.id)}
                      disabled={verifyingId === log.id}
                    >
                      {verifyingId === log.id ? 'Verifying...' : 'Verify'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={styles.pagination}>
        Showing {filteredLogs.length} of {logs.length} logs
      </div>
    </div>
  );
}
