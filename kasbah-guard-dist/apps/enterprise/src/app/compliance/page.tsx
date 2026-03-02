'use client';

import { useState, useCallback, useEffect } from 'react';
import ComplianceReportGenerator from './components/ComplianceReportGenerator';
import ComplianceReportViewer from './components/ComplianceReportViewer';
import styles from './compliance.module.css';

interface ComplianceReport {
  report_id: string;
  framework: 'soc2' | 'hipaa' | 'gdpr' | 'pci_dss';
  generated_at: string;
  period_start: string;
  period_end: string;
  status: 'compliant' | 'non_compliant' | 'requires_attention';
  issues_found: number;
  critical_issues: number;
  summary: string;
}

export default function CompliancePage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [reports, setReports] = useState<ComplianceReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<ComplianceReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'generator' | 'viewer'>('generator');

  const handleRefresh = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  // Load compliance reports on mount
  useEffect(() => {
    const loadReports = async () => {
      try {
        const response = await fetch('/api/admin/compliance/reports', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('kasbah_token')}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setReports(data.reports || []);
        }
      } catch (err) {
        console.error('Failed to load compliance reports:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadReports();
  }, [refreshKey]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'compliant': return '✅';
      case 'non_compliant': return '❌';
      case 'requires_attention': return '⚠️';
      default: return '❓';
    }
  };

  const getFrameworkLabel = (framework: string) => {
    const labels: Record<string, string> = {
      soc2: '🔐 SOC 2 Type II',
      hipaa: '🏥 HIPAA',
      gdpr: '🇪🇺 GDPR',
      pci_dss: '💳 PCI-DSS',
    };
    return labels[framework] || framework;
  };

  return (
    <div className={styles.compliancePage}>
      <div className={styles.pageHeader}>
        <div className={styles.headerContent}>
          <h1>📋 Compliance & Reporting</h1>
          <p className={styles.subtitle}>Generate audit-ready compliance reports and track regulatory requirements</p>
        </div>
        <button className={styles.refreshButton} onClick={handleRefresh}>
          🔄 Refresh
        </button>
      </div>

      <div className={styles.tabContainer}>
        <button
          className={`${styles.tabButton} ${activeTab === 'generator' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('generator')}
        >
          📊 Generate Report
        </button>
        <button
          className={`${styles.tabButton} ${activeTab === 'viewer' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('viewer')}
        >
          📁 Report History ({reports.length})
        </button>
      </div>

      {activeTab === 'generator' && (
        <div className={styles.mainContent}>
          <ComplianceReportGenerator key={`generator-${refreshKey}`} onReportGenerated={handleRefresh} />
        </div>
      )}

      {activeTab === 'viewer' && (
        <div className={styles.mainContent}>
          {isLoading ? (
            <div className={styles.loadingSpinner}>⏳ Loading reports...</div>
          ) : reports.length === 0 ? (
            <div className={styles.emptyState}>
              <p>📭 No compliance reports generated yet</p>
              <p>Switch to the "Generate Report" tab to create your first compliance report</p>
            </div>
          ) : (
            <>
              <div className={styles.reportsList}>
                {reports.map((report) => (
                  <div
                    key={report.report_id}
                    className={styles.reportCard}
                    onClick={() => setSelectedReport(report)}
                  >
                    <div className={styles.reportHeader}>
                      <div className={styles.frameworkBadge}>
                        {getFrameworkLabel(report.framework)}
                      </div>
                      <div className={styles.statusBadge} data-status={report.status}>
                        {getStatusIcon(report.status)} {report.status.replace('_', ' ').toUpperCase()}
                      </div>
                    </div>

                    <div className={styles.reportMeta}>
                      <div className={styles.metaItem}>
                        <span className={styles.label}>Generated</span>
                        <span className={styles.value}>{new Date(report.generated_at).toLocaleDateString()}</span>
                      </div>
                      <div className={styles.metaItem}>
                        <span className={styles.label}>Issues Found</span>
                        <span className={styles.value}>{report.issues_found}</span>
                      </div>
                      <div className={styles.metaItem}>
                        <span className={styles.label}>Critical</span>
                        <span className={styles.value} style={{ color: '#ef4444' }}>
                          {report.critical_issues}
                        </span>
                      </div>
                    </div>

                    <p className={styles.reportSummary}>{report.summary}</p>

                    <div className={styles.reportActions}>
                      <button className={styles.viewButton}>👁️ View Details</button>
                      <button className={styles.exportButton}>⬇️ Export PDF</button>
                    </div>
                  </div>
                ))}
              </div>

              {selectedReport && (
                <ComplianceReportViewer report={selectedReport} onClose={() => setSelectedReport(null)} />
              )}
            </>
          )}
        </div>
      )}

      <div className={styles.guidelines}>
        <h2>Compliance Framework Quick Reference</h2>
        <div className={styles.guidelineGrid}>
          <div className={styles.guideline}>
            <span className={styles.icon}>🔐</span>
            <h4>SOC 2 Type II</h4>
            <p>Security, Availability, Processing Integrity, Confidentiality, Privacy (5 trust services criteria)</p>
          </div>

          <div className={styles.guideline}>
            <span className={styles.icon}>🏥</span>
            <h4>HIPAA</h4>
            <p>Healthcare compliance with breach notification requirements (45 CFR 164). 72-hour notification deadline.</p>
          </div>

          <div className={styles.guideline}>
            <span className={styles.icon}>🇪🇺</span>
            <h4>GDPR</h4>
            <p>General Data Protection Regulation with Article 33 breach notification. Up to 4% of global revenue in fines.</p>
          </div>

          <div className={styles.guideline}>
            <span className={styles.icon}>💳</span>
            <h4>PCI-DSS</h4>
            <p>Payment Card Industry Data Security Standard with 12 requirements for cardholder data protection.</p>
          </div>
        </div>
      </div>

      <div className={styles.bestPractices}>
        <h2>Compliance Best Practices</h2>
        <div className={styles.practicesList}>
          <div className={styles.practice}>
            <span className={styles.number}>1</span>
            <div>
              <h4>Generate Reports Monthly</h4>
              <p>Establish a monthly compliance reporting cadence to track trends and identify issues early</p>
            </div>
          </div>

          <div className={styles.practice}>
            <span className={styles.number}>2</span>
            <div>
              <h4>Document Remediation</h4>
              <p>Keep detailed records of all remediation actions taken in response to compliance findings</p>
            </div>
          </div>

          <div className={styles.practice}>
            <span className={styles.number}>3</span>
            <div>
              <h4>Schedule Audits</h4>
              <p>Plan third-party audits 1-2 months before compliance deadlines to ensure adequate preparation</p>
            </div>
          </div>

          <div className={styles.practice}>
            <span className={styles.number}>4</span>
            <div>
              <h4>Breach Response Plan</h4>
              <p>Maintain a documented breach response procedure and test it annually with tabletop exercises</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
