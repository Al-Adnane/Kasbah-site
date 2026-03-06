'use client'

export const dynamic = 'force-dynamic'

import { useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { motion } from 'framer-motion'
import { 
  Shield, 
  Upload, 
  FileText, 
  CheckCircle, 
  AlertTriangle,
  Trash,
  Download,
  FolderOpen
} from 'lucide-react'

export default function FilesPage() {
  const { isLoaded, isSignedIn } = useUser()
  const router = useRouter()
  const [files, setFiles] = useState<File[]>([])
  const [scanning, setScanning] = useState(false)
  const [results, setResults] = useState<any[]>([])
  const [dragActive, setDragActive] = useState(false)

  if (!isLoaded || !isSignedIn) {
    router.push('/sign-in')
    return null
  }

  const handleFiles = (selectedFiles: FileList | null) => {
    if (selectedFiles) {
      setFiles(prev => [...prev, ...Array.from(selectedFiles)])
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
    if (e.dataTransfer.files) {
      handleFiles(e.dataTransfer.files)
    }
  }

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }

  const scanFiles = async () => {
    if (files.length === 0) return

    setScanning(true)
    
    try {
      const formData = new FormData()
      files.forEach(file => formData.append('files', file))

      const response = await fetch('/api/files/upload', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.details || 'Scan failed')
      }

      const { results } = await response.json()
      setResults(results)
    } catch (error) {
      console.error('File scan failed:', error)
      setResults([{
        error: error instanceof Error ? error.message : 'Scan failed',
        name: 'Error',
        size: 0,
        risk: 0,
        decision: 'ERROR'
      }])
    } finally {
      setScanning(false)
    }
  }

  const downloadReport = () => {
    const report = JSON.stringify(results, null, 2)
    const blob = new Blob([report], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `scan-report-${Date.now()}.json`
    a.click()
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
              <a href="/files" className="text-primary font-medium">Files</a>
              <a href="/api-console" className="hover:text-primary">API</a>
              <a href="/integrations" className="hover:text-primary">Integrations</a>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-5xl mx-auto">
          {/* Title */}
          <div className="mb-8">
            <h2 className="text-3xl font-bold mb-2">File Scanner</h2>
            <p className="text-muted-foreground">
              Scan multiple files and folders for secrets
            </p>
          </div>

          {/* Upload Area */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* File Upload */}
            <div className="space-y-4">
              <div
                className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
                  dragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'
                }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <FolderOpen className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">
                  Drop files here
                </h3>
                <p className="text-muted-foreground mb-4">
                  or click to browse
                </p>
                <input
                  type="file"
                  multiple
                  onChange={(e) => handleFiles(e.target.files)}
                  className="hidden"
                  id="file-input"
                />
                <label
                  htmlFor="file-input"
                  className="inline-block bg-primary text-primary-foreground px-6 py-2 rounded-lg hover:bg-primary/90 cursor-pointer"
                >
                  Select Files
                </label>
                <p className="text-xs text-muted-foreground mt-4">
                  Supports: .txt, .js, .ts, .py, .json, .env, .md, and more
                </p>
              </div>

              {/* File List */}
              {files.length > 0 && (
                <div className="border rounded-lg">
                  <div className="p-4 border-b flex items-center justify-between">
                    <h3 className="text-sm font-semibold">
                      {files.length} file{files.length !== 1 ? 's' : ''} selected
                    </h3>
                    <button
                      onClick={() => setFiles([])}
                      className="text-sm text-muted-foreground hover:text-primary"
                    >
                      Clear all
                    </button>
                  </div>
                  <div className="max-h-64 overflow-auto">
                    {files.map((file, index) => (
                      <div
                        key={index}
                        className="p-3 border-b last:border-0 flex items-center justify-between hover:bg-muted/50"
                      >
                        <div className="flex items-center space-x-3">
                          <FileText className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <div className="font-medium text-sm">{file.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {(file.size / 1024).toFixed(2)} KB
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => removeFile(index)}
                          className="text-muted-foreground hover:text-red-500"
                        >
                          <Trash className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="p-4">
                    <button
                      onClick={scanFiles}
                      disabled={scanning || files.length === 0}
                      className="w-full bg-primary text-primary-foreground py-3 rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                    >
                      {scanning ? (
                        <>
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                          <span>Scanning...</span>
                        </>
                      ) : (
                        <>
                          <Shield className="h-5 w-5" />
                          <span>Scan {files.length} File{files.length !== 1 ? 's' : ''}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Results */}
            <div className="space-y-4">
              {results.length > 0 ? (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="border rounded-lg"
                >
                  <div className="p-4 border-b flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Scan Results</h3>
                    <button
                      onClick={downloadReport}
                      className="flex items-center space-x-2 text-sm text-primary hover:underline"
                    >
                      <Download className="h-4 w-4" />
                      <span>Download Report</span>
                    </button>
                  </div>
                  <div className="divide-y">
                    {results.map((result, index) => (
                      <div
                        key={index}
                        className="p-4 flex items-center justify-between hover:bg-muted/50"
                      >
                        <div className="flex items-center space-x-3">
                          <div className={`p-2 rounded-full ${
                            result.decision === 'DENY' ? 'bg-red-100 text-red-600' :
                            result.decision === 'WARN' ? 'bg-yellow-100 text-yellow-600' :
                            'bg-green-100 text-green-600'
                          }`}>
                            {result.decision === 'DENY' ? (
                              <AlertTriangle className="h-5 w-5" />
                            ) : result.decision === 'WARN' ? (
                              <AlertTriangle className="h-5 w-5" />
                            ) : (
                              <CheckCircle className="h-5 w-5" />
                            )}
                          </div>
                          <div>
                            <div className="font-medium">{result.name}</div>
                            <div className="text-sm text-muted-foreground">
                              {result.details}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                            result.decision === 'DENY' ? 'bg-red-100 text-red-700' :
                            result.decision === 'WARN' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-green-100 text-green-700'
                          }`}>
                            {result.decision}
                          </span>
                          <div className="text-sm text-muted-foreground mt-1">
                            Risk: {result.risk}/100
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              ) : (
                <div className="border rounded-lg p-12 text-center text-muted-foreground">
                  <Shield className="h-16 w-16 mx-auto mb-4 opacity-50" />
                  <h3 className="text-lg font-semibold mb-2">No results yet</h3>
                  <p>Upload and scan files to see results here</p>
                </div>
              )}

              {/* Features */}
              <div className="grid grid-cols-1 gap-4">
                <FeatureCard
                  icon={Upload}
                  title="Batch Scanning"
                  description="Scan up to 100 files at once"
                />
                <FeatureCard
                  icon={FileText}
                  title="All File Types"
                  description="Code, configs, documents, and more"
                />
                <FeatureCard
                  icon={Download}
                  title="Export Reports"
                  description="Download JSON/PDF reports"
                />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

function FeatureCard({ icon: Icon, title, description }: {
  icon: any
  title: string
  description: string
}) {
  return (
    <div className="border rounded-lg p-4">
      <Icon className="h-6 w-6 text-primary mb-2" />
      <h3 className="text-sm font-semibold mb-1">{title}</h3>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  )
}
