'use client';

import { useState, useEffect } from 'react';
import styles from '../compliance.module.css';

interface ComplianceReportViewerProps {
  report: any;
  onClose: () => void;
}

export default function ComplianceReportViewer({ report, onClose }: ComplianceReportViewerProps) {
  const [reportDetails, setReportDetails] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['summary']));

  useEffect(() => {
    const loadReportDetails = async () => {
      try {
        const response = await fetch(`/api/admin/compliance/reports/${report.report_id}`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('kasbah_token')}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setReportDetails(data.report);
        }
      } catch (err) {
        console.error('Failed to load report details:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadReportDetails();
  }, [report.report_id]);

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return '#dc2626';
      case 'high': return '#ea580c';
      case 'medium': return '#f59e0b';
      case 'low': return '#10b981';
      default: return '#6b7280';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return '🔴';
      case 'high': return '🟠';
      case 'medium': return '🟡';
      case 'low': return '🟢';
      default: return '⚪';
    }
  };

  if (isLoading) {
    return (
      <div className={styles.modal} onClick={onClose}>
        <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
          <div className={styles.loadingSpinner}>⏳ Loading report details...</div>
        </div>
      </div>
    );
  }

  if (!reportDetails) {
    return (
      <div className={styles.modal} onClick={onClose}>
        <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
          <p>Failed to load report details</p>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.modal} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>📋 Compliance Report: {report.framework.toUpperCase()}</h2>
          <button className={styles.closeButton} onClick={onClose}>✕</button>
        </div>

        <div className={styles.reportContainer}>
          {/* Summary Section */}
          <div className={styles.section}>
            <div
              className={styles.sectionHeader}
              onClick={() => toggleSection('summary')}
            >
              <span className={styles.sectionTitle}>📊 Executive Summary</span>
              <span className={styles.sectionToggle}>
                {expandedSections.has('summary') ? '▼' : '▶'}
              </span>
            </div>
            {expandedSections.has('summary') && (
              <div className={styles.sectionContent}>
                <div className={styles.summaryGrid}>
                  <div className={styles.summaryBox}>
                    <span className={styles.summaryLabel}>Status</span>
                    <span className={styles.summaryValue} style={{
                      color: reportDetails.status === 'compliant' ? '#10b981' : '#ef4444'
                    }}>
                      {reportDetails.status.toUpperCase()}
                    </span>
                  </div>
                  <div className={styles.summaryBox}>
                    <span className={styles.summaryLabel}>Total Issues</span>
                    <span className={styles.summaryValue}>{reportDetails.total_issues || 0}</span>
                  </div>
                  <div className={styles.summaryBox}>
                    <span className={styles.summaryLabel}>Critical</span>
                    <span className={styles.summaryValue} style={{ color: '#dc2626' }}>
                      {reportDetails.critical_count || 0}
                    </span>
                  </div>
                  <div className={styles.summaryBox}>
                    <span className={styles.summaryLabel}>Period</span>
                    <span className={styles.summaryValue}>{reportDetails.period}</span>
                  </div>
                </div>
                {reportDetails.summary && (
                  <p className={styles.summaryText}>{reportDetails.summary}</p>
                )}
              </div>
            )}
          </div>

          {/* Controls & Requirements */}
          {reportDetails.controls && (
            <div className={styles.section}>
              <div
                className={styles.sectionHeader}
                onClick={() => toggleSection('controls')}
              >
                <span className={styles.sectionTitle}>🔐 Controls & Requirements</span>
                <span className={styles.sectionToggle}>
                  {expandedSections.has('controls') ? '▼' : '▶'}
                </span>
              </div>
              {expandedSections.has('controls') && (
                <div className={styles.sectionContent}>
                  <div className={styles.controlsList}>
                    {reportDetails.controls.map((control: any, idx: number) => (
                      <div key={idx} className={styles.controlItem}>
                        <div className={styles.controlHeader}>
                          <span className={styles.controlId}>{control.id}</span>
                          <span className={styles.controlName}>{control.name}</span>
                          <span className={styles.controlStatus} style={{
                            background: control.status === 'compliant' ? '#d1fae5' : '#fee2e2',
                            color: control.status === 'compliant' ? '#065f46' : '#7f1d1d'
                          }}>
                            {control.status}
                          </span>
                        </div>
                        <p className={styles.controlDescription}>{control.description}</p>
                        {control.findings && control.findings.length > 0 && (
                          <div className={styles.findingsList}>
                            <strong>Findings:</strong>
                            <ul>
                              {control.findings.map((finding: string, fIdx: number) => (
                                <li key={fIdx}>{finding}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Violations & Issues */}
          {reportDetails.violations && reportDetails.violations.length > 0 && (
            <div className={styles.section}>
              <div
                className={styles.sectionHeader}
                onClick={() => toggleSection('violations')}
              >
                <span className={styles.sectionTitle}>⚠️ Violations & Issues ({reportDetails.violations.length})</span>
                <span className={styles.sectionToggle}>
                  {expandedSections.has('violations') ? '▼' : '▶'}
                </span>
              </div>
              {expandedSections.has('violations') && (
                <div className={styles.sectionContent}>
                  <div className={styles.violationsList}>
                    {reportDetails.violations.map((violation: any, idx: number) => (
                      <div key={idx} className={styles.violationItem} style={{
                        borderLeftColor: getSeverityColor(violation.severity)
                      }}>
                        <div className={styles.violationHeader}>
                          <span>{getSeverityIcon(violation.severity)} {violation.severity.toUpperCase()}</span>
                          <span className={styles.violationTitle}>{violation.title}</span>
                        </div>
                        <p>{violation.description}</p>
                        {violation.remediation && (
                          <div className={styles.remediation}>
                            <strong>🔧 Remediation:</strong>
                            <p>{violation.remediation}</p>
                          </div>
                        )}
                        {violation.deadline && (
                          <div className={styles.deadline}>
                            <strong>📅 Deadline:</strong> {violation.deadline}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Audit Trail */}
          {reportDetails.audit_trail && (
            <div className={styles.section}>
              <div
                className={styles.sectionHeader}
                onClick={() => toggleSection('audit')}
              >
                <span className={styles.sectionTitle}>📝 Audit Trail & Evidence</span>
                <span className={styles.sectionToggle}>
                  {expandedSections.has('audit') ? '▼' : '▶'}
                </span>
              </div>
              {expandedSections.has('audit') && (
                <div className={styles.sectionContent}>
                  <div className={styles.auditInfo}>
                    <p><strong>Report Hash:</strong> <code>{reportDetails.report_hash}</code></p>
                    <p><strong>Generated:</strong> {new Date(reportDetails.generated_at).toLocaleString()}</p>
                    <p><strong>Signature:</strong> <code className={styles.signatureCode}>{reportDetails.signature?.substring(0, 80)}...</code></p>
                    <p className={styles.auditNote}>
                      ✅ This report has been cryptographically signed and can be used as evidence in regulatory audits.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Recommendations */}
          {reportDetails.recommendations && (
            <div className={styles.section}>
              <div
                className={styles.sectionHeader}
                onClick={() => toggleSection('recommendations')}
              >
                <span className={styles.sectionTitle}>💡 Recommendations</span>
                <span className={styles.sectionToggle}>
                  {expandedSections.has('recommendations') ? '▼' : '▶'}
                </span>
              </div>
              {expandedSections.has('recommendations') && (
                <div className={styles.sectionContent}>
                  <ul className={styles.recommendationsList}>
                    {reportDetails.recommendations.map((rec: string, idx: number) => (
                      <li key={idx}>{rec}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <div className={styles.modalFooter}>
          <button className={styles.closeButtonLarge} onClick={onClose}>Close</button>
          <a href={`/api/admin/compliance/export/${report.report_id}?format=pdf`} className={styles.exportLink}>
            ⬇️ Export PDF
          </a>
        </div>
      </div>
    </div>
  );
}
