'use client'

import { useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Shield, Key, Copy, Trash, Plus, Check, RefreshCw } from 'lucide-react'

export default function ApiConsolePage() {
  const { isLoaded, isSignedIn } = useUser()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'keys' | 'test' | 'docs'>('keys')
  const [apiKeys, setApiKeys] = useState<any[]>([])
  const [loadingKeys, setLoadingKeys] = useState(true)

  useEffect(() => {
    loadApiKeys()
  }, [])

  const loadApiKeys = async () => {
    try {
      setLoadingKeys(true)
      const response = await fetch('/api/keys')
      if (response.ok) {
        const { keys } = await response.json()
        setApiKeys(keys)
      }
    } catch (error) {
      console.error('Failed to load API keys:', error)
    } finally {
      setLoadingKeys(false)
    }
  }
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const [testEndpoint, setTestEndpoint] = useState('/api/scan')
  const [testPayload, setTestPayload] = useState('{\n  "text": "AKIAIOSFODNN7EXAMPLE"\n}')
  const [testResult, setTestResult] = useState<any>(null)
  const [testing, setTesting] = useState(false)

  if (!isLoaded || !isSignedIn) {
    router.push('/sign-in')
    return null
  }

  const copyToClipboard = (text: string, id: number) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const createNewKey = async () => {
    try {
      const response = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `New Key ${apiKeys.length + 1}` })
      })

      if (!response.ok) throw new Error('Failed to create key')

      const newKey = await response.json()
      setApiKeys(prev => [...prev, newKey])
      
      // Show the key once (copy to clipboard)
      navigator.clipboard.writeText(newKey.key)
      alert('API key created and copied to clipboard!')
    } catch (error) {
      console.error('Failed to create API key:', error)
      alert('Failed to create API key')
    }
  }

  const deleteKey = async (id: number) => {
    if (!confirm('Are you sure you want to delete this API key?')) return

    try {
      const response = await fetch(`/api/keys?id=${id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Failed to delete key')

      setApiKeys(prev => prev.filter(key => key.id !== id))
    } catch (error) {
      console.error('Failed to delete API key:', error)
      alert('Failed to delete API key')
    }
  }

  const runTest = async () => {
    setTesting(true)
    try {
      const startTime = Date.now()
      const response = await fetch(testEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: testPayload
      })
      const endTime = Date.now()
      
      const data = await response.json()
      setTestResult({
        status: response.status,
        time: `${endTime - startTime}ms`,
        data
      })
    } catch (error) {
      setTestResult({
        status: 500,
        time: '0ms',
        data: { error: error instanceof Error ? error.message : 'Request failed' }
      })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Shield className="h-8 w-8 text-primary" />
              <h1 className="text-2xl font-bold">Kasbah Guard</h1>
            </div>
            <nav className="hidden md:flex space-x-6">
              <a href="/dashboard" className="hover:text-primary">Dashboard</a>
              <a href="/scanner" className="hover:text-primary">Scanner</a>
              <a href="/files" className="hover:text-primary">Files</a>
              <a href="/api-console" className="text-primary font-medium">API</a>
              <a href="/integrations" className="hover:text-primary">Integrations</a>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          {/* Title */}
          <div className="mb-8">
            <h2 className="text-3xl font-bold mb-2">API Console</h2>
            <p className="text-muted-foreground">
              Manage API keys and test endpoints
            </p>
          </div>

          {/* Tabs */}
          <div className="border-b mb-6">
            <div className="flex space-x-6">
              <button
                onClick={() => setActiveTab('keys')}
                className={`pb-3 px-1 border-b-2 transition-colors ${
                  activeTab === 'keys'
                    ? 'border-primary text-primary font-medium'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <Key className="h-4 w-4" />
                  <span>API Keys</span>
                </div>
              </button>
              <button
                onClick={() => setActiveTab('test')}
                className={`pb-3 px-1 border-b-2 transition-colors ${
                  activeTab === 'test'
                    ? 'border-primary text-primary font-medium'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <RefreshCw className="h-4 w-4" />
                  <span>Test Endpoint</span>
                </div>
              </button>
              <button
                onClick={() => setActiveTab('docs')}
                className={`pb-3 px-1 border-b-2 transition-colors ${
                  activeTab === 'docs'
                    ? 'border-primary text-primary font-medium'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <Shield className="h-4 w-4" />
                  <span>Documentation</span>
                </div>
              </button>
            </div>
          </div>

          {/* API Keys Tab */}
          {activeTab === 'keys' && (
            <div className="space-y-6">
              {/* Create Key Button */}
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Your API Keys</h3>
                <button
                  onClick={createNewKey}
                  className="flex items-center space-x-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90"
                >
                  <Plus className="h-4 w-4" />
                  <span>Create New Key</span>
                </button>
              </div>

              {/* Keys List */}
              <div className="space-y-4">
                {apiKeys.map((apiKey) => (
                  <div
                    key={apiKey.id}
                    className="border rounded-lg p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center space-x-3">
                        <Key className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <div className="font-medium">{apiKey.name}</div>
                          <div className="text-xs text-muted-foreground">
                            Created {apiKey.created} • Last used {apiKey.lastUsed}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => deleteKey(apiKey.id)}
                        className="text-muted-foreground hover:text-red-500"
                      >
                        <Trash className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="flex items-center space-x-3 bg-muted p-3 rounded font-mono text-sm">
                      <code className="flex-1 truncate">{apiKey.key}</code>
                      <button
                        onClick={() => copyToClipboard(apiKey.key, apiKey.id)}
                        className="flex items-center space-x-1 text-xs text-primary hover:underline"
                      >
                        {copiedId === apiKey.id ? (
                          <>
                            <Check className="h-3 w-3" />
                            <span>Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Usage Info */}
              <div className="border rounded-lg p-6 bg-muted/50">
                <h4 className="font-semibold mb-3">API Usage</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <div className="text-sm text-muted-foreground">Requests This Month</div>
                    <div className="text-2xl font-bold">1,543</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Rate Limit</div>
                    <div className="text-2xl font-bold">100/min</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Plan</div>
                    <div className="text-2xl font-bold">Pro</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Test Endpoint Tab */}
          {activeTab === 'test' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Request */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Endpoint
                    </label>
                    <select
                      value={testEndpoint}
                      onChange={(e) => setTestEndpoint(e.target.value)}
                      className="w-full p-3 border rounded-lg bg-background"
                    >
                      <option value="/api/scan">POST /api/scan</option>
                      <option value="/api/redact">POST /api/redact</option>
                      <option value="/api/stats">GET /api/stats</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Request Body
                    </label>
                    <textarea
                      value={testPayload}
                      onChange={(e) => setTestPayload(e.target.value)}
                      className="w-full h-64 p-4 border rounded-lg font-mono text-sm bg-background resize-none"
                    />
                  </div>
                  <button
                    onClick={runTest}
                    disabled={testing}
                    className="w-full bg-primary text-primary-foreground py-3 rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center space-x-2"
                  >
                    {testing ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                        <span>Sending...</span>
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-5 w-5" />
                        <span>Send Request</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Response */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Response
                    </label>
                    {testResult ? (
                      <div className="border rounded-lg overflow-hidden">
                        <div className="bg-muted p-3 flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <span className={`px-2 py-1 rounded text-sm font-medium ${
                              testResult.status === 200
                                ? 'bg-green-100 text-green-700'
                                : 'bg-red-100 text-red-700'
                            }`}>
                              {testResult.status}
                            </span>
                            <span className="text-sm text-muted-foreground">
                              {testResult.time}
                            </span>
                          </div>
                        </div>
                        <pre className="p-4 bg-background overflow-auto max-h-96 text-sm">
                          {JSON.stringify(testResult.data, null, 2)}
                        </pre>
                      </div>
                    ) : (
                      <div className="border rounded-lg p-12 text-center text-muted-foreground">
                        <RefreshCw className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>Send a request to see the response</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Documentation Tab */}
          {activeTab === 'docs' && (
            <div className="space-y-6">
              <div className="prose max-w-none">
                <h3 className="text-2xl font-bold mb-4">API Documentation</h3>
                
                <div className="space-y-8">
                  {/* Scan Endpoint */}
                  <div className="border rounded-lg p-6">
                    <div className="flex items-center space-x-3 mb-4">
                      <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-sm font-mono">POST</span>
                      <code className="text-lg font-semibold">/api/scan</code>
                    </div>
                    <p className="text-muted-foreground mb-4">
                      Scan text for secrets, PII, and sensitive data
                    </p>
                    <div className="bg-muted p-4 rounded-lg mb-4">
                      <div className="text-sm font-mono mb-2">Request:</div>
                      <pre className="text-sm overflow-auto">
{`{
  "text": "string (required)"
}`}
                      </pre>
                    </div>
                    <div className="bg-muted p-4 rounded-lg">
                      <div className="text-sm font-mono mb-2">Response:</div>
                      <pre className="text-sm overflow-auto">
{`{
  "risk": 0-100,
  "decision": "ALLOW" | "WARN" | "DENY",
  "reason": "string",
  "violations": [],
  "redacted": "string"
}`}
                      </pre>
                    </div>
                  </div>

                  {/* Redact Endpoint */}
                  <div className="border rounded-lg p-6">
                    <div className="flex items-center space-x-3 mb-4">
                      <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-sm font-mono">POST</span>
                      <code className="text-lg font-semibold">/api/redact</code>
                    </div>
                    <p className="text-muted-foreground mb-4">
                      Redact sensitive data from text
                    </p>
                    <div className="bg-muted p-4 rounded-lg">
                      <div className="text-sm font-mono mb-2">Request:</div>
                      <pre className="text-sm overflow-auto">
{`{
  "text": "string (required)"
}`}
                      </pre>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
