'use client'

import Link from 'next/link'
import { useState } from 'react'

export default function Home() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <div className="min-h-screen">
      {/* Navigation */}
      <nav className="bg-white border-b border-gray-100 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            {/* Logo */}
            <Link href="/" className="flex items-center space-x-2">
              <span className="text-3xl">🛡️</span>
              <span className="text-xl font-bold text-[#C1440E]">Kasbah Guard</span>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center space-x-8">
              <Link href="/scanner" className="text-gray-600 hover:text-[#C1440E] font-medium transition-colors">
                Scanner
              </Link>
              <Link href="/files" className="text-gray-600 hover:text-[#C1440E] font-medium transition-colors">
                Files
              </Link>
              <Link href="/dashboard" className="text-gray-600 hover:text-[#C1440E] font-medium transition-colors">
                Dashboard
              </Link>
              <Link href="/api-console" className="text-gray-600 hover:text-[#C1440E] font-medium transition-colors">
                API
              </Link>
            </div>

            {/* CTA Buttons */}
            <div className="hidden md:flex items-center space-x-4">
              <Link href="/sign-in" className="text-gray-600 hover:text-[#C1440E] font-medium px-4 py-2 transition-colors">
                Sign In
              </Link>
              <Link href="/sign-up" className="btn-primary">
                Get Started Free
              </Link>
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg hover:bg-gray-100"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>

          {/* Mobile Menu */}
          {mobileMenuOpen && (
            <div className="md:hidden py-4 border-t border-gray-100">
              <div className="flex flex-col space-y-4">
                <Link href="/scanner" className="text-gray-600 hover:text-[#C1440E] font-medium">Scanner</Link>
                <Link href="/files" className="text-gray-600 hover:text-[#C1440E] font-medium">Files</Link>
                <Link href="/dashboard" className="text-gray-600 hover:text-[#C1440E] font-medium">Dashboard</Link>
                <Link href="/api-console" className="text-gray-600 hover:text-[#C1440E] font-medium">API</Link>
                <div className="pt-4 border-t border-gray-100 flex flex-col space-y-3">
                  <Link href="/sign-in" className="text-center text-gray-600 hover:text-[#C1440E] font-medium py-2">
                    Sign In
                  </Link>
                  <Link href="/sign-up" className="btn-primary w-full">
                    Get Started Free
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <section className="gradient-hero text-white py-20 md:py-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="text-4xl md:text-6xl font-bold mb-6 leading-tight">
              Protect Your Data from{' '}
              <span className="text-yellow-300">AI Leaks</span>
            </h1>
            <p className="text-xl md:text-2xl mb-8 text-white/90 leading-relaxed">
              Real-time detection of secrets, PII, and sensitive data across all your AI tools. 
              Stop accidental leaks before they happen.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link href="/scanner" className="btn-primary text-lg px-8 py-4">
                Start Scanning Free
                <svg className="ml-2 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
              <Link href="/dashboard" className="btn-secondary text-lg px-8 py-4 bg-transparent border-white text-white hover:bg-white hover:text-[#C1440E]">
                View Dashboard
              </Link>
            </div>

            {/* Trust Indicators */}
            <div className="mt-12 pt-8 border-t border-white/20">
              <p className="text-sm text-white/70 mb-4">Trusted by security teams at</p>
              <div className="flex flex-wrap gap-8 items-center opacity-70">
                <span className="text-lg font-semibold">Tech Corp</span>
                <span className="text-lg font-semibold">SecureIO</span>
                <span className="text-lg font-semibold">DataSafe</span>
                <span className="text-lg font-semibold">CloudGuard</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-3 gap-8">
            <div className="text-center">
              <div className="text-4xl md:text-5xl font-bold text-[#C1440E] mb-2">140+</div>
              <div className="text-gray-600 font-medium">Detection Patterns</div>
            </div>
            <div className="text-center">
              <div className="text-4xl md:text-5xl font-bold text-[#C1440E] mb-2">&lt;5ms</div>
              <div className="text-gray-600 font-medium">Detection Speed</div>
            </div>
            <div className="text-center">
              <div className="text-4xl md:text-5xl font-bold text-[#C1440E] mb-2">95%</div>
              <div className="text-gray-600 font-medium">Accuracy Rate</div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Products - Simplified */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Everything You Need to Stay Secure
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Powerful tools to detect and prevent data leaks across your entire workflow
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Scanner */}
            <Link href="/scanner" className="card group">
              <div className="w-14 h-14 bg-[#C1440E]/10 rounded-xl flex items-center justify-center mb-4 group-hover:bg-[#C1440E]/20 transition-colors">
                <span className="text-3xl">🔍</span>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-[#C1440E] transition-colors">
                Web Scanner
              </h3>
              <p className="text-gray-600 mb-4">
                Scan text in real-time for secrets, API keys, and PII before sending to AI
              </p>
              <div className="flex items-center text-[#C1440E] font-semibold">
                Try Free
                <svg className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>

            {/* Files */}
            <Link href="/files" className="card group">
              <div className="w-14 h-14 bg-[#C1440E]/10 rounded-xl flex items-center justify-center mb-4 group-hover:bg-[#C1440E]/20 transition-colors">
                <span className="text-3xl">📁</span>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-[#C1440E] transition-colors">
                File Scanner
              </h3>
              <p className="text-gray-600 mb-4">
                Batch scan multiple files and folders for sensitive information
              </p>
              <div className="flex items-center text-[#C1440E] font-semibold">
                Try Free
                <svg className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>

            {/* Dashboard */}
            <Link href="/dashboard" className="card group">
              <div className="w-14 h-14 bg-[#C1440E]/10 rounded-xl flex items-center justify-center mb-4 group-hover:bg-[#C1440E]/20 transition-colors">
                <span className="text-3xl">📊</span>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-[#C1440E] transition-colors">
                Dashboard
              </h3>
              <p className="text-gray-600 mb-4">
                View scan history, statistics, and security analytics
              </p>
              <div className="flex items-center text-[#C1440E] font-semibold">
                View Dashboard
                <svg className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>

            {/* API */}
            <Link href="/api-console" className="card group">
              <div className="w-14 h-14 bg-[#C1440E]/10 rounded-xl flex items-center justify-center mb-4 group-hover:bg-[#C1440E]/20 transition-colors">
                <span className="text-3xl">🔌</span>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-[#C1440E] transition-colors">
                API Console
              </h3>
              <p className="text-gray-600 mb-4">
                Manage API keys and integrate scanning into your workflow
              </p>
              <div className="flex items-center text-[#C1440E] font-semibold">
                Manage Keys
                <svg className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>
          </div>

          {/* More Products */}
          <div className="mt-12 text-center">
            <p className="text-gray-600 mb-6">Plus integrations for your favorite tools</p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link href="/integrations/slack" className="px-6 py-3 bg-white border border-gray-200 rounded-lg hover:border-[#C1440E] hover:text-[#C1440E] transition-colors font-medium">
                💬 Slack
              </Link>
              <Link href="/integrations/discord" className="px-6 py-3 bg-white border border-gray-200 rounded-lg hover:border-[#C1440E] hover:text-[#C1440E] transition-colors font-medium">
                🎮 Discord
              </Link>
              <Link href="/sdks" className="px-6 py-3 bg-white border border-gray-200 rounded-lg hover:border-[#C1440E] hover:text-[#C1440E] transition-colors font-medium">
                📦 SDKs
              </Link>
              <Link href="/cli" className="px-6 py-3 bg-white border border-gray-200 rounded-lg hover:border-[#C1440E] hover:text-[#C1440E] transition-colors font-medium">
                💻 CLI
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Why Security Teams Choose Kasbah
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-[#C1440E]/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <span className="text-4xl">🎯</span>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">
                140+ Detection Patterns
              </h3>
              <p className="text-gray-600 text-lg">
                Detect AWS keys, GitHub tokens, SSNs, credit cards, and more with 95% accuracy
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-[#C1440E]/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <span className="text-4xl">⚡</span>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">
                &lt;5ms Detection
              </h3>
              <p className="text-gray-600 text-lg">
                Lightning-fast scanning that doesn&apos;t interrupt your workflow
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-[#C1440E]/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <span className="text-4xl">🔒</span>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">
                Zero False Positives
              </h3>
              <p className="text-gray-600 text-lg">
                ML-powered detection smart enough to know real secrets from test data
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="gradient-hero text-white py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            Ready to Protect Your Data?
          </h2>
          <p className="text-xl mb-8 text-white/90">
            Join thousands of developers and teams who trust Kasbah Guard
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/sign-up" className="btn-primary text-lg px-8 py-4 bg-white text-[#C1440E] hover:bg-gray-100">
              Get Started Free
            </Link>
            <Link href="/dashboard" className="btn-secondary text-lg px-8 py-4">
              View Demo
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#0F172A] text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8">
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center space-x-2 mb-4">
                <span className="text-2xl">🛡️</span>
                <span className="text-lg font-bold">Kasbah Guard</span>
              </div>
              <p className="text-gray-400 text-sm">
                Protecting your data from AI leaks since 2026.
              </p>
            </div>

            <div>
              <h4 className="font-semibold mb-4 text-sm uppercase tracking-wider text-gray-400">Products</h4>
              <ul className="space-y-2">
                <li><Link href="/scanner" className="text-gray-300 hover:text-white transition-colors">Web Scanner</Link></li>
                <li><Link href="/files" className="text-gray-300 hover:text-white transition-colors">File Scanner</Link></li>
                <li><Link href="/dashboard" className="text-gray-300 hover:text-white transition-colors">Dashboard</Link></li>
                <li><Link href="/api-console" className="text-gray-300 hover:text-white transition-colors">API Console</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4 text-sm uppercase tracking-wider text-gray-400">Resources</h4>
              <ul className="space-y-2">
                <li><Link href="/docs" className="text-gray-300 hover:text-white transition-colors">Documentation</Link></li>
                <li><Link href="/api" className="text-gray-300 hover:text-white transition-colors">API Reference</Link></li>
                <li><Link href="/blog" className="text-gray-300 hover:text-white transition-colors">Blog</Link></li>
                <li><Link href="/support" className="text-gray-300 hover:text-white transition-colors">Support</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4 text-sm uppercase tracking-wider text-gray-400">Company</h4>
              <ul className="space-y-2">
                <li><Link href="/privacy" className="text-gray-300 hover:text-white transition-colors">Privacy</Link></li>
                <li><Link href="/terms" className="text-gray-300 hover:text-white transition-colors">Terms</Link></li>
                <li><Link href="/contact" className="text-gray-300 hover:text-white transition-colors">Contact</Link></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-gray-800 mt-12 pt-8 text-center text-gray-400 text-sm">
            <p>© 2026 Kasbah Guard. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
