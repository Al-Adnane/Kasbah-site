'use client';

import { useState, useCallback } from 'react';
import styles from '../compliance.module.css';

interface ComplianceReportGeneratorProps {
  onReportGenerated: () => void;
}

export default function ComplianceReportGenerator({ onReportGenerated }: ComplianceReportGeneratorProps) {
  const [framework, setFramework] = useState<'soc2' | 'hipaa' | 'gdpr' | 'pci_dss'>('soc2');
  const [periodDays, setPeriodDays] = useState(30);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [generatedReport, setGeneratedReport] = useState<any>(null);

  const handleGenerateReport = useCallback(async () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsGenerating(true);

    try {
      const response = await fetch('/api/admin/compliance/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('kasbah_token')}`,
        },
        body: JSON.stringify({
          framework,
          period_days: periodDays,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        setErrorMessage(`❌ Failed to generate report: ${data.error || 'Unknown error'}`);
        setIsGenerating(false);
        return;
      }

      setGeneratedReport(data.report);
      setSuccessMessage(`✅ Report generated successfully! Report ID: ${data.report.report_id}`);

      // Refresh parent component to show new report in history
      setTimeout(() => {
        onReportGenerated();
      }, 1500);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setErrorMessage(`❌ Network error: ${errorMsg}`);
      setIsGenerating(false);
    }
  }, [framework, periodDays, onReportGenerated]);

  const handleExportPDF = useCallback(async () => {
    if (!generatedReport) return;

    try {
      const response = await fetch(`/api/admin/compliance/export/${generatedReport.report_id}?format=pdf`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('kasbah_token')}`,
        },
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `compliance-report-${generatedReport.framework}-${new Date().toISOString().split('T')[0]}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (err) {
      setErrorMessage(`❌ Failed to export PDF: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [generatedReport]);

  const getFrameworkDescription = (fw: string) => {
    const descriptions: Record<string, string> = {
      soc2: 'Service Organization Control framework covering Security, Availability, Processing Integrity, Confidentiality, and Privacy.',
      hipaa: 'Health Insurance Portability and Accountability Act requirements for healthcare data protection.',
      gdpr: 'General Data Protection Regulation with focus on personal data protection and breach notification.',
      pci_dss: 'Payment Card Industry Data Security Standard for organizations processing payment card data.',
    };
    return descriptions[fw] || '';
  };

  const getFrameworkIcon = (fw: string) => {
    const icons: Record<string, string> = {
      soc2: '🔐',
      hipaa: '🏥',
      gdpr: '🇪🇺',
      pci_dss: '💳',
    };
    return icons[fw] || '📋';
  };

  return (
    <div className={styles.generator}>
      <h3>📊 Generate Compliance Report</h3>
      <p className={styles.generatorSubtitle}>
        Create audit-ready compliance reports for regulatory requirements
      </p>

      <div className={styles.generatorForm}>
        <div className={styles.formGroup}>
          <label htmlFor="framework">Compliance Framework</label>
          <select
            id="framework"
            value={framework}
            onChange={(e) => setFramework(e.target.value as any)}
            disabled={isGenerating}
          >
            <option value="soc2">🔐 SOC 2 Type II</option>
            <option value="hipaa">🏥 HIPAA (Healthcare)</option>
            <option value="gdpr">🇪🇺 GDPR (EU/Privacy)</option>
            <option value="pci_dss">💳 PCI-DSS (Payment)</option>
          </select>
          <p className={styles.description}>{getFrameworkDescription(framework)}</p>
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="period">Reporting Period</label>
          <div className={styles.periodControl}>
            <input
              id="period"
              type="range"
              min="7"
              max="365"
              step="7"
              value={periodDays}
              onChange={(e) => setPeriodDays(Number(e.target.value))}
              disabled={isGenerating}
              className={styles.periodSlider}
            />
            <span className={styles.periodValue}>{periodDays} days</span>
          </div>
          <p className={styles.description}>
            Report period: Last {periodDays} days (from {new Date(Date.now() - periodDays * 86400000).toLocaleDateString()} to today)
          </p>
        </div>

        <div className={styles.frameworkInfo}>
          <div className={styles.infoBox}>
            <span className={styles.infoIcon}>ℹ️</span>
            <div>
              <strong>What's Included:</strong>
              <ul>
                <li>Executive summary with compliance status</li>
                <li>Detailed control mappings and findings</li>
                <li>Risk assessment and severity levels</li>
                <li>Remediation recommendations</li>
                <li>Audit-ready evidence documentation</li>
                <li>Signed timestamp and hash verification</li>
              </ul>
            </div>
          </div>
        </div>

        {errorMessage && <div className={styles.errorAlert}>{errorMessage}</div>}
        {successMessage && <div className={styles.successAlert}>{successMessage}</div>}

        <button
          className={styles.generateButton}
          onClick={handleGenerateReport}
          disabled={isGenerating}
        >
          {isGenerating ? '⏳ Generating report...' : '📊 Generate Report'}
        </button>
      </div>

      {generatedReport && (
        <div className={styles.generatedReportPreview}>
          <div className={styles.previewHeader}>
            <h4>📄 Report Preview</h4>
            <span className={styles.previewBadge}>{getFrameworkIcon(generatedReport.framework)} {generatedReport.framework.toUpperCase()}</span>
          </div>

          <div className={styles.previewContent}>
            <div className={styles.previewRow}>
              <span className={styles.previewLabel}>Report ID:</span>
              <span className={styles.previewValue}>{generatedReport.report_id}</span>
            </div>
            <div className={styles.previewRow}>
              <span className={styles.previewLabel}>Generated:</span>
              <span className={styles.previewValue}>{new Date(generatedReport.generated_at).toLocaleString()}</span>
            </div>
            <div className={styles.previewRow}>
              <span className={styles.previewLabel}>Status:</span>
              <span className={styles.previewValue} style={{ color: generatedReport.status === 'compliant' ? '#10b981' : '#ef4444' }}>
                {generatedReport.status.toUpperCase()}
              </span>
            </div>
            <div className={styles.previewRow}>
              <span className={styles.previewLabel}>Issues Found:</span>
              <span className={styles.previewValue}>{generatedReport.issues_found}</span>
            </div>
            {generatedReport.critical_issues > 0 && (
              <div className={styles.previewRow}>
                <span className={styles.previewLabel}>🔴 Critical Issues:</span>
                <span className={styles.previewValue} style={{ color: '#dc2626', fontWeight: 'bold' }}>
                  {generatedReport.critical_issues}
                </span>
              </div>
            )}
          </div>

          <div className={styles.previewActions}>
            <button className={styles.exportButton} onClick={handleExportPDF}>
              ⬇️ Export as PDF
            </button>
            <button className={styles.copyButton} onClick={() => {
              navigator.clipboard.writeText(JSON.stringify(generatedReport, null, 2));
              setSuccessMessage('✅ Report copied to clipboard');
            }}>
              📋 Copy JSON
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
