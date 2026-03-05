'use client';

import { useState, useRef, useEffect } from 'react';
import { scanText, PATTERN_DATABASE } from '@/lib/scanner';
import { AnimatedRiskGauge } from '@/components/AnimatedRiskGauge';
import { PatternBadge } from '@/components/PatternBadge';
import { useConfetti, useSlideIn } from '@/hooks/useAnimations';

export default function Scanner() {
  const [inputText, setInputText] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [showPatternExplorer, setShowPatternExplorer] = useState(false);
  const [selectedPattern, setSelectedPattern] = useState<any>(null);
  const [showTour, setShowTour] = useState(false);
  const [showBeforeAfter, setShowBeforeAfter] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);
  const { triggerConfetti } = useConfetti();
  const isResultVisible = useSlideIn(!!result);

  // Show tour on first scan
  useEffect(() => {
    const hasScanned = localStorage.getItem('kasbah-scanned');
    setShowTour(!hasScanned);
  }, []);

  const handleScan = async () => {
    if (!inputText.trim()) return;

    setIsScanning(true);
    const scanResult = await scanText(inputText);

    setResult(scanResult);
    setHistory([scanResult, ...history].slice(0, 10));
    setShowTour(false);
    localStorage.setItem('kasbah-scanned', 'true');

    // Trigger confetti if safe
    if (scanResult.decision === 'ALLOW' && resultRef.current) {
      setTimeout(() => {
        triggerConfetti(resultRef.current);
      }, 300);
    }

    setIsScanning(false);
  };

  const handlePasteExample = (exampleText: string) => {
    setInputText(exampleText);
  };

  const handleClear = () => {
    setInputText('');
    setResult(null);
    setShowBeforeAfter(false);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = e.dataTransfer.files;
    if (files && files[0]) {
      const file = files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        setInputText(text);
      };
      reader.readAsText(file);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <h1 className="text-3xl font-bold" style={{ color: '#C1440E' }}>
            Kasbah Secret Scanner
          </h1>
          <p className="text-gray-600 mt-1">100% local processing • No data sent to servers</p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Guided Tour Modal */}
        {showTour && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40">
            <div className="bg-white rounded-lg shadow-2xl p-8 max-w-md">
              <h2 className="text-2xl font-bold mb-4">Welcome to Kasbah Scanner</h2>
              <div className="space-y-4 mb-6 text-gray-700">
                <div className="flex gap-3">
                  <span className="text-2xl">🔍</span>
                  <div>
                    <h3 className="font-semibold">Real-time Detection</h3>
                    <p className="text-sm">Instantly scan for 50+ secret formats</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="text-2xl">🛡️</span>
                  <div>
                    <h3 className="font-semibold">100% Local</h3>
                    <p className="text-sm">All detection happens in your browser</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="text-2xl">⚡</span>
                  <div>
                    <h3 className="font-semibold">Instant Results</h3>
                    <p className="text-sm">Get remediation guidance immediately</p>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowTour(false)}
                className="w-full px-4 py-2 rounded-lg font-semibold text-white transition-all"
                style={{ backgroundColor: '#C1440E' }}
              >
                Got it, let&apos;s scan!
              </button>
            </div>
          </div>
        )}

        {/* Pattern Explorer Modal */}
        {showPatternExplorer && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40 overflow-y-auto">
            <div className="bg-white rounded-lg shadow-2xl p-8 max-w-2xl my-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold">Pattern Explorer</h2>
                <button
                  onClick={() => {
                    setShowPatternExplorer(false);
                    setSelectedPattern(null);
                  }}
                  className="text-gray-500 hover:text-gray-700 text-2xl"
                >
                  ×
                </button>
              </div>

              {selectedPattern ? (
                <div className="space-y-4">
                  <h3 className="text-xl font-bold">{selectedPattern.type}</h3>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Example Format:
                    </label>
                    <code className="block bg-gray-100 p-3 rounded text-sm overflow-x-auto">
                      {selectedPattern.example}
                    </code>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-xs text-gray-600">Risk Score</p>
                      <p className="text-lg font-bold" style={{ color: '#C1440E' }}>
                        {selectedPattern.risk}/100
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600">False Positive Rate</p>
                      <p className="text-lg font-bold">{selectedPattern.fpRate}%</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600">CCL Level</p>
                      <p className="text-lg font-bold">{selectedPattern.ccl}</p>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Remediation Steps:
                    </label>
                    <p className="text-gray-700">{selectedPattern.remediation}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setInputText(selectedPattern.example);
                        setShowPatternExplorer(false);
                        setSelectedPattern(null);
                      }}
                      className="px-4 py-2 rounded-lg font-semibold text-white transition-all"
                      style={{ backgroundColor: '#C1440E' }}
                    >
                      Test This Pattern
                    </button>
                    <button
                      onClick={() => setSelectedPattern(null)}
                      className="px-4 py-2 rounded-lg font-semibold text-gray-700 border border-gray-300 hover:bg-gray-50"
                    >
                      Back
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-96 overflow-y-auto">
                  {PATTERN_DATABASE.map((pattern) => (
                    <button
                      key={pattern.id}
                      onClick={() => setSelectedPattern(pattern)}
                      className="p-4 border border-gray-200 rounded-lg hover:border-gray-400 hover:shadow-md transition-all text-left"
                    >
                      <h4 className="font-semibold text-gray-900">{pattern.type}</h4>
                      <p className="text-xs text-gray-500 mt-1">Risk: {pattern.risk}/100</p>
                      <p className="text-xs text-gray-500">Category: {pattern.category}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Main Scanner Area */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Input Section */}
          <div className="space-y-4">
            <h2 className="text-xl font-bold mb-4">Paste Your Code</h2>

            {/* Drag and Drop Area */}
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-lg p-6 text-center transition-all cursor-pointer ${
                dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-gray-50 hover:border-gray-400'
              }`}
            >
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Paste code, credentials, or files here... or drag & drop a file"
                className="w-full h-40 bg-transparent border-none focus:outline-none resize-none placeholder-gray-400"
              />
            </div>

            {/* Quick Test Buttons */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handlePasteExample('AKIAIOSFODNN7EXAMPLE')}
                className="px-3 py-2 text-xs rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 transition-all"
              >
                Test AWS Key
              </button>
              <button
                onClick={() => handlePasteExample('ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')}
                className="px-3 py-2 text-xs rounded-lg bg-purple-100 text-purple-700 hover:bg-purple-200 transition-all"
              >
                Test GitHub Token
              </button>
              <button
                onClick={() => handlePasteExample('sk-abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUV')}
                className="px-3 py-2 text-xs rounded-lg bg-green-100 text-green-700 hover:bg-green-200 transition-all"
              >
                Test OpenAI Key
              </button>
              <button
                onClick={() => handlePasteExample('123-45-6789')}
                className="px-3 py-2 text-xs rounded-lg bg-red-100 text-red-700 hover:bg-red-200 transition-all"
              >
                Test SSN
              </button>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleScan}
                disabled={isScanning || !inputText.trim()}
                className="flex-1 px-4 py-3 rounded-lg font-semibold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg"
                style={{ backgroundColor: '#C1440E' }}
              >
                {isScanning ? 'Scanning...' : 'Scan Now'}
              </button>
              <button
                onClick={handleClear}
                className="px-4 py-3 rounded-lg font-semibold text-gray-700 border border-gray-300 hover:bg-gray-50"
              >
                Clear
              </button>
            </div>

            {/* Features */}
            <div className="space-y-3 mt-6">
              <h3 className="font-semibold text-gray-900">Features</h3>
              <div className="grid grid-cols-1 gap-2">
                {[
                  { icon: '🔍', title: '50+ Patterns', desc: 'AWS, GitHub, APIs, PII, more' },
                  { icon: '⚡', title: '<1ms Detection', desc: 'Local processing only' },
                  { icon: '🔒', title: '100% Private', desc: 'Zero data transmission' },
                ].map((feature, i) => (
                  <div key={i} className="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-all">
                    <div className="flex items-start gap-3">
                      <span className="text-xl">{feature.icon}</span>
                      <div>
                        <h4 className="font-semibold text-sm text-gray-900">{feature.title}</h4>
                        <p className="text-xs text-gray-600">{feature.desc}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Results Section */}
          <div>
            {result && isResultVisible && (
              <div ref={resultRef} className="space-y-6 animate-fade-in">
                <h2 className="text-xl font-bold mb-4">Scan Results</h2>

                {/* Risk Gauge */}
                <AnimatedRiskGauge risk={result.risk} ccl={result.ccl} confidence={result.confidence} />

                {/* Decision Banner */}
                <div
                  className="p-4 rounded-lg text-center text-white font-semibold"
                  style={{
                    backgroundColor:
                      result.decision === 'ALLOW'
                        ? '#10B981'
                        : result.decision === 'WARN'
                          ? '#F59E0B'
                          : '#EF4444',
                  }}
                >
                  {result.message}
                </div>

                {/* Pattern Violations */}
                {result.violations.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="font-semibold text-gray-900">Detected Patterns</h3>
                    {result.violations.map((violation: any, i: number) => (
                      <PatternBadge
                        key={i}
                        type={violation.type}
                        pattern={violation.pattern}
                        confidence={violation.confidence}
                        risk={violation.risk}
                        ccl={violation.ccl}
                        remediation={PATTERN_DATABASE.find((p) => p.type === violation.type)?.remediation}
                        animated={true}
                      />
                    ))}
                  </div>
                )}

                {/* Before/After Preview */}
                {result.redacted !== inputText && (
                  <div className="space-y-3 border-t pt-4">
                    <button
                      onClick={() => setShowBeforeAfter(!showBeforeAfter)}
                      className="w-full px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 font-semibold text-gray-900 transition-all"
                    >
                      {showBeforeAfter ? 'Hide Before/After' : 'Show Before/After'}
                    </button>

                    {showBeforeAfter && (
                      <div className="grid grid-cols-1 gap-4">
                        <div>
                          <p className="text-xs font-semibold text-red-600 mb-2">BEFORE (Unsafe)</p>
                          <pre className="bg-red-50 p-3 rounded text-xs text-red-900 overflow-x-auto max-h-32">
                            {inputText}
                          </pre>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-green-600 mb-2">AFTER (Safe)</p>
                          <pre className="bg-green-50 p-3 rounded text-xs text-green-900 overflow-x-auto max-h-32">
                            {result.redacted}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Latency Badge */}
                <div className="text-xs text-gray-500 text-center pt-2">
                  Scanned in {result.latency.toFixed(1)}ms • 100% local processing
                </div>

                {/* Pattern Explorer Link */}
                <button
                  onClick={() => setShowPatternExplorer(true)}
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 font-semibold text-gray-900 transition-all"
                >
                  Explore All Patterns
                </button>
              </div>
            )}

            {!result && (
              <div className="text-center py-12 text-gray-500">
                <p className="text-lg mb-2">👀</p>
                <p>Paste code above to get started</p>
              </div>
            )}
          </div>
        </div>

        {/* Scan History */}
        {history.length > 1 && (
          <div className="mt-12 pt-8 border-t">
            <h3 className="text-lg font-semibold mb-4">Recent Scans</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {history.slice(1, 4).map((scan, i) => (
                <div
                  key={i}
                  onClick={() => {
                    setResult(scan);
                    setInputText('');
                  }}
                  className="p-4 border rounded-lg hover:shadow-md cursor-pointer transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-gray-900">{scan.decision}</div>
                    <div className="text-sm" style={{ color: scan.decision === 'ALLOW' ? '#10B981' : '#EF4444' }}>
                      {scan.risk}/100
                    </div>
                  </div>
                  <p className="text-xs text-gray-600 mt-2 truncate">{scan.message}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in {
          animation: fadeIn 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
