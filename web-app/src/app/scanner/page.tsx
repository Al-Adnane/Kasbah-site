'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function Scanner() {
  const router = useRouter()
  const [inputText, setInputText] = useState('')
  const [isScanning, setIsScanning] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [history, setHistory] = useState<any[]>([])
  const [dragActive, setDragActive] = useState(false)

  const handleScan = async () => {
    if (!inputText.trim()) return

    setIsScanning(true)
    
    try {
      const response = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputText })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.details || 'Scan failed')
      }

      const result = await response.json()
      setResult(result)
      setHistory(prev => [result, ...prev.slice(0, 9)])
    } catch (error) {
      console.error('Scan failed:', error)
      setResult({
        error: error instanceof Error ? error.message : 'Scan failed',
        risk: 0,
        decision: 'ERROR'
      })
    } finally {
      setIsScanning(false)
    }
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const reader = new FileReader()
      reader.onload = (e) => {
        const text = e.target?.result as string
        setInputText(text)
      }
      reader.readAsText(e.dataTransfer.files[0])
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <Link href="/" className="flex items-center space-x-2">
              <span className="text-3xl">🛡️</span>
              <span className="text-xl font-bold text-[#C1440E]">Kasbah Guard</span>
            </Link>
            <nav className="hidden md:flex space-x-8">
              <Link href="/scanner" className="text-[#C1440E] font-medium">Scanner</Link>
              <Link href="/files" className="text-gray-600 hover:text-[#C1440E] font-medium">Files</Link>
              <Link href="/dashboard" className="text-gray-600 hover:text-[#C1440E] font-medium">Dashboard</Link>
              <Link href="/api-console" className="text-gray-600 hover:text-[#C1440E] font-medium">API</Link>
            </nav>
            <div className="flex space-x-4">
              <Link href="/" className="text-gray-600 hover:text-[#C1440E] font-medium px-4 py-2">Home</Link>
              <Link href="/dashboard" className="btn-primary">Dashboard</Link>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-5xl mx-auto">
          {/* Title */}
          <div className="mb-8">
            <h2 className="text-3xl font-bold mb-2 text-gray-900">Web Scanner</h2>
            <p className="text-gray-600">
              Scan text for secrets, PII, and sensitive data in real-time
            </p>
          </div>

          {/* Input Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Text Input */}
            <div className="space-y-4">
              <div
                className={`border-2 border-dashed rounded-xl p-6 transition-colors ${
                  dragActive ? 'border-[#C1440E] bg-[#C1440E]/5' : 'border-gray-300 bg-white'
                }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <div className="flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <p className="text-center text-sm text-gray-600 mb-2">
                  Drag and drop a file here, or
                </p>
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Paste text to scan... (e.g., AKIAIOSFODNN7EXAMPLE)"
                  className="w-full h-48 p-4 border border-gray-300 rounded-lg bg-white resize-none focus:outline-none focus:ring-2 focus:ring-[#C1440E] focus:border-transparent"
                />
                <div className="flex items-center justify-between mt-4">
                  <button
                    onClick={() => setInputText('')}
                    className="flex items-center space-x-2 text-sm text-gray-600 hover:text-[#C1440E]"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    <span>Clear</span>
                  </button>
                  <button
                    onClick={handleScan}
                    disabled={!inputText.trim() || isScanning}
                    className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                  >
                    {isScanning ? (
                      <>
                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        <span>Scanning...</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                        <span>Scan</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Quick Tests */}
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Quick Tests</h3>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setInputText('AKIAIOSFODNN7EXAMPLE')}
                    className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                  >
                    AWS Key
                  </button>
                  <button
                    onClick={() => setInputText('ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')}
                    className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                  >
                    GitHub Token
                  </button>
                  <button
                    onClick={() => setInputText('sk-abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOP')}
                    className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                  >
                    OpenAI Key
                  </button>
                  <button
                    onClick={() => setInputText('123-45-6789')}
                    className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                  >
                    SSN
                  </button>
                  <button
                    onClick={() => setInputText('This is safe text with no secrets')}
                    className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                  >
                    Safe Text
                  </button>
                </div>
              </div>
            </div>

            {/* Results */}
            <div className="space-y-4">
              {result ? (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  {/* Result Header */}
                  <div className={`p-4 ${
                    result.decision === 'DENY' ? 'bg-red-500' :
                    result.decision === 'WARN' ? 'bg-yellow-500' :
                    result.decision === 'ERROR' ? 'bg-gray-500' :
                    'bg-green-500'
                  } text-white`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        {result.decision === 'DENY' ? (
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                        ) : result.decision === 'WARN' ? (
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                        ) : result.decision === 'ERROR' ? (
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        ) : (
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        )}
                        <div>
                          <div className="text-2xl font-bold">{result.decision}</div>
                          <div className="text-sm opacity-90">Risk: {result.risk}/100</div>
                        </div>
                      </div>
                      {result.latencyMs && (
                        <div className="text-right">
                          <div className="text-sm">Latency</div>
                          <div className="text-lg font-mono">{result.latencyMs}ms</div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Violations */}
                  {result.violations && result.violations.length > 0 && (
                    <div className="p-4 border-b border-gray-200">
                      <h3 className="text-sm font-semibold text-gray-900 mb-3">Detections</h3>
                      <div className="space-y-2">
                        {result.violations.map((v: any, i: number) => (
                          <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <div>
                              <div className="font-medium text-sm text-gray-900">{v.type}</div>
                              <div className="text-xs text-gray-500">{v.pattern}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-medium text-gray-900">Confidence: {(v.confidence * 100).toFixed(0)}%</div>
                              <div className="text-xs text-gray-500">Risk: {v.risk}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Redacted Text */}
                  {result.redacted && (
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-semibold text-gray-900">Redacted Output</h3>
                        <button
                          onClick={() => navigator.clipboard.writeText(result.redacted)}
                          className="flex items-center space-x-1 text-xs text-[#C1440E] hover:underline"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          <span>Copy</span>
                        </button>
                      </div>
                      <pre className="bg-gray-50 p-3 rounded-lg text-sm overflow-auto max-h-48 text-gray-900">
                        {result.redacted}
                      </pre>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                  <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  <p className="text-gray-500">Scan results will appear here</p>
                </div>
              )}

              {/* Scan History */}
              {history.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200">
                  <div className="p-4 border-b border-gray-200">
                    <h3 className="text-sm font-semibold text-gray-900">Recent Scans</h3>
                  </div>
                  <div className="max-h-64 overflow-auto">
                    {history.map((scan, i) => (
                      <div
                        key={i}
                        className="p-3 border-b border-gray-200 last:border-0 flex items-center justify-between hover:bg-gray-50"
                      >
                        <div className="flex items-center space-x-3">
                          <div className={`w-2 h-2 rounded-full ${
                            scan.decision === 'DENY' ? 'bg-red-500' :
                            scan.decision === 'WARN' ? 'bg-yellow-500' :
                            'bg-green-500'
                          }`} />
                          <span className="text-sm text-gray-900">{scan.reason || 'Scan completed'}</span>
                        </div>
                        <span className="text-xs text-gray-500">
                          Risk: {scan.risk}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Features */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <svg className="w-8 h-8 text-[#C1440E] mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">140+ Patterns</h3>
              <p className="text-gray-600">Detect AWS keys, GitHub tokens, SSNs, credit cards, and more</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <svg className="w-8 h-8 text-[#C1440E] mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">&lt;5ms Detection</h3>
              <p className="text-gray-600">Lightning-fast scanning with WebAssembly acceleration</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <svg className="w-8 h-8 text-[#C1440E] mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Zero False Positives</h3>
              <p className="text-gray-600">ML-powered detection with continuous learning</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
