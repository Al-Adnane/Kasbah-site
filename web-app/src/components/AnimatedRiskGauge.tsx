// AnimatedRiskGauge.tsx - Circular animated risk gauge with CCL badge

'use client';

import { useGaugeAnimation, getRiskColor, getCCLColor, getCCLLabel } from '@/hooks/useAnimations';

interface AnimatedRiskGaugeProps {
  risk: number;
  ccl: number;
  confidence: number;
  animated?: boolean;
}

export function AnimatedRiskGauge({
  risk,
  ccl,
  confidence,
  animated = true,
}: AnimatedRiskGaugeProps) {
  const { percentage, offset, circumference } = useGaugeAnimation(risk, 100);
  const riskColor = getRiskColor(risk);
  const cclColor = getCCLColor(ccl);

  const getRiskLabel = (r: number) => {
    if (r <= 20) return 'Safe';
    if (r <= 35) return 'Low Risk';
    if (r <= 55) return 'Moderate';
    if (r <= 75) return 'High Risk';
    return 'Critical';
  };

  const getRecommendation = (r: number) => {
    if (r <= 20) return 'Safe to proceed';
    if (r <= 35) return 'Review before sharing';
    if (r <= 55) return 'Check for sensitive data';
    if (r <= 75) return 'Remove before committing';
    return 'DO NOT SHARE - Contains secrets';
  };

  return (
    <div className="flex flex-col items-center justify-center py-8">
      {/* Circular Risk Gauge */}
      <div className="relative w-40 h-40 mb-6">
        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
          {/* Background circle */}
          <circle cx="50" cy="50" r="45" fill="none" stroke="#e5e7eb" strokeWidth="8" />

          {/* Animated progress circle */}
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke={riskColor}
            strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={animated ? offset : circumference - (percentage / 100) * circumference}
            strokeLinecap="round"
            style={{
              transition: 'stroke-dashoffset 1s ease-out',
            }}
          />
        </svg>

        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-4xl font-bold" style={{ color: riskColor }}>
            {Math.round(percentage)}
          </div>
          <div className="text-xs text-gray-600">Risk Score</div>
        </div>
      </div>

      {/* CCL Badge */}
      <div
        className="px-4 py-2 rounded-full text-white font-semibold mb-4"
        style={{ backgroundColor: cclColor }}
      >
        CCL-{ccl} ({getCCLLabel(ccl)})
      </div>

      {/* Risk Level Label */}
      <div className="text-center mb-4">
        <h3 className="text-xl font-bold" style={{ color: riskColor }}>
          {getRiskLabel(risk)}
        </h3>
        <p className="text-sm text-gray-600 mt-1">{getRecommendation(risk)}</p>
      </div>

      {/* Confidence Indicator Bar */}
      <div className="w-full max-w-xs">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-gray-700">Detection Confidence</span>
          <span className="text-xs font-bold text-gray-900">{Math.round(confidence * 100)}%</span>
        </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-green-500 transition-all duration-300"
            style={{ width: `${confidence * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
