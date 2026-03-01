/**
 * Kasbah Guard SDK — React Hook Example v1.0.0
 *
 * useKasbahGuard() — React hook for integrating secret detection
 * into React components with real-time scanning and UI feedback
 */

import { useCallback, useState } from 'react';
import { classify, ClassificationResult } from '../src';

/**
 * React hook for Kasbah Guard secret detection
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { result, scan, isLoading } = useKasbahGuard();
 *
 *   return (
 *     <div>
 *       <textarea onChange={(e) => scan(e.target.value)} />
 *       {result && (
 *         <div style={{ color: result.risk >= 70 ? 'red' : 'green' }}>
 *           Risk: {result.risk}% — {result.decision}
 *         </div>
 *       )}
 *     </div>
 *   );
 * }
 * ```
 */
export function useKasbahGuard() {
  const [result, setResult] = useState<ClassificationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const scan = useCallback((text: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const classificationResult = classify(text);
      setResult(classificationResult);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return {
    result,
    scan,
    reset,
    isLoading,
    error,
  };
}

/**
 * Example React component using useKasbahGuard()
 */
export function KasbahGuardDemo() {
  const { result, scan, isLoading } = useKasbahGuard();
  const [input, setInput] = useState('');

  const riskColor = result
    ? result.risk >= 70
      ? '#dc3545' // red
      : result.risk >= 40
        ? '#ffc107' // yellow
        : '#28a745' // green
    : '#ccc';

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px', fontFamily: 'monospace' }}>
      <h1>Kasbah Guard — Real-time Secret Detection</h1>

      <textarea
        placeholder="Paste text to scan for secrets (API keys, passwords, credit cards, etc.)"
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          scan(e.target.value);
        }}
        style={{
          width: '100%',
          height: '150px',
          padding: '10px',
          border: `2px solid ${riskColor}`,
          fontFamily: 'monospace',
          fontSize: '12px',
        }}
      />

      {isLoading && <p style={{ color: '#999' }}>Scanning...</p>}

      {result && (
        <div
          style={{
            marginTop: '20px',
            padding: '15px',
            backgroundColor: '#f5f5f5',
            borderLeft: `4px solid ${riskColor}`,
          }}
        >
          <h2 style={{ margin: '0 0 10px 0', color: riskColor }}>
            {result.risk >= 70
              ? '⚠️ HIGH RISK'
              : result.risk >= 40
                ? '⚠️ MEDIUM RISK'
                : '✅ LOW RISK'}
          </h2>

          <div style={{ marginBottom: '10px' }}>
            <strong>Score:</strong> {result.risk}/100
          </div>

          <div style={{ marginBottom: '10px' }}>
            <strong>Decision:</strong> <span style={{ color: riskColor }}>{result.decision}</span>
          </div>

          <div style={{ marginBottom: '10px' }}>
            <strong>Reason:</strong> {result.reason}
          </div>

          {result.detections.length > 0 && (
            <div style={{ marginBottom: '10px' }}>
              <strong>Detections:</strong>
              <ul style={{ margin: '5px 0 0 20px' }}>
                {result.detections.map((d, i) => (
                  <li key={i}>
                    {d.category} at position {d.start}-{d.end} ({d.confidence}% confidence)
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div style={{ fontSize: '11px', color: '#999' }}>
            Latency: {result.latency_ms}ms | Engine: {result.engine_version}
          </div>
        </div>
      )}
    </div>
  );
}

export default useKasbahGuard;
