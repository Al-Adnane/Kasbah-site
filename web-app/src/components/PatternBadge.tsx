// PatternBadge.tsx - Animated pattern detection badge with remediation

'use client';

import { useState } from 'react';
import { getCCLColor, getCCLLabel } from '@/hooks/useAnimations';

interface PatternBadgeProps {
  type: string;
  pattern: string;
  confidence: number;
  risk: number;
  ccl: number;
  remediation?: string;
  animated?: boolean;
  onShowRemediation?: () => void;
}

export function PatternBadge({
  type,
  pattern,
  confidence,
  risk,
  ccl,
  remediation,
  animated = true,
  onShowRemediation,
}: PatternBadgeProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const cclColor = getCCLColor(ccl);

  return (
    <div
      className="bg-white border-l-4 rounded-lg p-4 transition-all duration-300 hover:shadow-lg cursor-pointer"
      style={{
        animation: animated ? 'slideIn 0.4s ease-out' : 'none',
        borderLeftColor: cclColor,
      }}
      onClick={() => setIsExpanded(!isExpanded)}
    >
      <style>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>

      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3 flex-1">
          {/* Pattern Icon with pulse */}
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white"
            style={{
              backgroundColor: cclColor,
              animation: animated ? 'pulse 2s ease-in-out' : 'none',
            }}
          >
            ⚠
          </div>

          <div className="flex-1">
            <div className="font-semibold text-gray-900">{type}</div>
            <div className="text-xs text-gray-500">{pattern}</div>
          </div>
        </div>

        {/* Confidence Score */}
        <div className="text-right">
          <div className="text-sm font-bold text-gray-900">{Math.round(confidence * 100)}%</div>
          <div className="text-xs text-gray-500">confidence</div>
        </div>
      </div>

      {/* CCL Badge */}
      <div className="mt-2 flex items-center gap-2">
        <div
          className="px-2 py-1 rounded-full text-white text-xs font-semibold"
          style={{ backgroundColor: cclColor }}
        >
          CCL-{ccl} ({getCCLLabel(ccl)})
        </div>
        <div className="text-xs text-gray-500">Risk: {risk}/100</div>
      </div>

      {/* Expanded remediation section */}
      {isExpanded && remediation && (
        <div className="mt-3 pt-3 border-t border-gray-200">
          <div className="text-sm text-gray-700 font-medium mb-2">Quick Fix:</div>
          <div className="text-sm text-gray-600 bg-gray-50 p-2 rounded mb-2">{remediation}</div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onShowRemediation?.();
            }}
            className="text-xs text-[#C1440E] hover:underline font-medium"
          >
            View full remediation →
          </button>
        </div>
      )}
    </div>
  );
}
