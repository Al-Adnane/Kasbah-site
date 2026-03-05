// useAnimations.ts - Animation utilities for immersive scanner experience

import { useEffect, useState, useCallback } from 'react';

// Confetti animation effect
export function useConfetti() {
  const triggerConfetti = useCallback((element: HTMLElement | null) => {
    if (!element) return;

    // Create confetti pieces
    for (let i = 0; i < 30; i++) {
      const confetto = document.createElement('div');
      confetto.style.position = 'fixed';
      confetto.style.width = '10px';
      confetto.style.height = '10px';
      confetto.style.backgroundColor = ['#C1440E', '#00D084', '#FFD700', '#FF6B6B'][
        Math.floor(Math.random() * 4)
      ];
      confetto.style.borderRadius = '50%';
      confetto.style.zIndex = '9999';

      const rect = element.getBoundingClientRect();
      confetto.style.left = rect.left + rect.width / 2 + 'px';
      confetto.style.top = rect.top + rect.height / 2 + 'px';

      document.body.appendChild(confetto);

      // Animate confetti falling
      let x = (Math.random() - 0.5) * 200;
      let y = Math.random() * 300;
      let rotation = Math.random() * 360;

      const animate = () => {
        y += 2;
        rotation += Math.random() * 10;

        confetto.style.transform = `translate(${x}px, ${y}px) rotate(${rotation}deg)`;
        confetto.style.opacity = String(Math.max(0, 1 - y / 300));

        if (y < 300) {
          requestAnimationFrame(animate);
        } else {
          confetto.remove();
        }
      };

      animate();
    }
  }, []);

  return { triggerConfetti };
}

// Animated number counter
export function useCountUp(target: number, duration: number = 1000) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (count === target) return;

    const increment = target / (duration / 16);
    const timeout = setInterval(() => {
      setCount((prev) => Math.min(prev + increment, target));
    }, 16);

    return () => clearInterval(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  return Math.round(count);
}

// Animated gauge (circular progress)
export function useGaugeAnimation(value: number, max: number = 100) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const increment = value / 20;
    let current = 0;

    const interval = setInterval(() => {
      if (current < value) {
        current = Math.min(current + increment, value);
        setDisplayValue(current);
      } else {
        clearInterval(interval);
      }
    }, 30);

    return () => clearInterval(interval);
  }, [value]);

  const percentage = (displayValue / max) * 100;
  const circumference = 2 * Math.PI * 45; // radius = 45
  const offset = circumference - (percentage / 100) * circumference;

  return { percentage: displayValue, offset, circumference };
}

// Pulse animation for detected patterns
export function usePulseAnimation(trigger: boolean) {
  const [isPulsing, setIsPulsing] = useState(false);

  useEffect(() => {
    if (trigger) {
      setIsPulsing(true);
      const timeout = setTimeout(() => setIsPulsing(false), 600);
      return () => clearTimeout(timeout);
    }
  }, [trigger]);

  return isPulsing;
}

// Slide-in animation for results
export function useSlideIn(trigger: boolean, duration: number = 300) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (trigger) {
      setIsVisible(true);
    }
  }, [trigger]);

  return isVisible;
}

// Color transition animation for risk levels
export function getRiskColor(risk: number): string {
  if (risk <= 20) return '#10B981'; // Green - Safe
  if (risk <= 35) return '#3B82F6'; // Blue - Low risk
  if (risk <= 55) return '#F59E0B'; // Amber - Moderate
  if (risk <= 75) return '#EF4444'; // Red - High
  return '#991B1B'; // Dark red - Critical
}

export function getCCLColor(ccl: number): string {
  const colors = [
    '#10B981', // CCL-0: Benign (Green)
    '#3B82F6', // CCL-1: Low (Blue)
    '#F59E0B', // CCL-2: Moderate (Amber)
    '#EF4444', // CCL-3: High (Red)
    '#991B1B', // CCL-4: Critical (Dark Red)
    '#7F1D1D', // CCL-5: Systemic (Very Dark Red)
  ];
  return colors[Math.min(ccl, 5)];
}

export function getCCLLabel(ccl: number): string {
  const labels = ['Benign', 'Low Risk', 'Moderate', 'High Risk', 'Critical', 'Systemic'];
  return labels[Math.min(ccl, 5)] || 'Unknown';
}

// Smooth text highlight animation
export function highlightSecrets(text: string, violations: any[] = []) {
  let highlighted = text;

  violations.forEach((v) => {
    if (v.pattern) {
      const regex = new RegExp(`(${v.pattern})`, 'gi');
      highlighted = highlighted.replace(
        regex,
        '<mark style="background: #FEE2E2; padding: 2px 4px; border-radius: 3px; font-weight: 500;">$1</mark>'
      );
    }
  });

  return highlighted;
}

// Before/After animation
export function useBeforeAfterAnimation(trigger: boolean) {
  const [showBefore, setShowBefore] = useState(true);

  useEffect(() => {
    if (trigger) {
      const timeout = setTimeout(() => setShowBefore(false), 500);
      return () => clearTimeout(timeout);
    } else {
      setShowBefore(true);
    }
  }, [trigger]);

  return showBefore;
}
