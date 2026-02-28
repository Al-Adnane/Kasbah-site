/**
 * @kasbah/guard — React hook example
 *
 * useKasbahGuard() — real-time sensitive data detection for form fields.
 *
 * @example
 * ```tsx
 * function SecureTextarea() {
 *   const { value, onChange, risk, decision, warning } = useKasbahGuard('');
 *   return (
 *     <>
 *       <textarea value={value} onChange={onChange} />
 *       {warning && <p style={{ color: 'red' }}>{warning}</p>}
 *     </>
 *   );
 * }
 * ```
 */

import { useState, useCallback, useRef } from 'react';
import { classify, type ClassifyResult } from '@kasbah/guard';

interface KasbahGuardHook {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => void;
  risk: number;
  decision: string;
  result: ClassifyResult | null;
  warning: string | null;
}

export function useKasbahGuard(initialValue = '', debounceMs = 300): KasbahGuardHook {
  const [value, setValue] = useState(initialValue);
  const [result, setResult] = useState<ClassifyResult | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    const text = e.target.value;
    setValue(text);

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (text.length > 0) {
        setResult(classify(text));
      } else {
        setResult(null);
      }
    }, debounceMs);
  }, [debounceMs]);

  const warning = result && result.decision !== 'ALLOW'
    ? `⚠️ ${result.decision}: ${result.reason}`
    : null;

  return {
    value,
    onChange,
    risk: result?.risk ?? 0,
    decision: result?.decision ?? 'ALLOW',
    result,
    warning,
  };
}
