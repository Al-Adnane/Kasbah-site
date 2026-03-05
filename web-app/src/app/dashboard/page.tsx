'use client'

import { useUser, useClerk, SignOutButton } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { 
  Shield, 
  AlertTriangle, 
  CheckCircle, 
  Upload, 
  FileText, 
  Activity,
  Settings,
  LogOut,
  Menu,
  X
} from 'lucide-react'

export default function Dashboard() {
  const { isLoaded, isSignedIn, user } = useUser()
  const router = useRouter()
  const [scans, setScans] = useState<any[]>([])
  const [stats, setStats] = useState({
    totalScans: 0,
    threatsDetected: 0,
    filesScanned: 0,
    apiCalls: 0
  })
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.push('/sign-in')
    }
    
    if (isSignedIn) {
      loadDashboardData()
    }
  }, [isLoaded, isSignedIn, router])

  const loadDashboardData = async () => {
    try {
      // Load stats
      const statsResponse = await fetch('/api/user/stats')
      if (statsResponse.ok) {
        const stats = await statsResponse.json()
        setStats(stats)
      }
      
      // Load recent scans
      const scansResponse = await fetch('/api/scans?limit=5')
      if (scansResponse.ok) {
        const { scans } = await scansResponse.json()
        setScans(scans.map((scan: any, index: number) => ({
          id: index + 1,
          type: scan.type,
          risk: scan.risk_score,
          decision: scan.decision,
          timestamp: new Date(scan.created_at),
          details: scan.violations?.[0]?.type || 'Scan completed'
        })))
      }
    } catch (error) {
      console.error('Dashboard data load failed:', error)
    }
  }

  if (!isLoaded || !isSignedIn) {
    return null
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b sticky top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Shield className="h-8 w-8 text-primary" />
              <h1 className="text-2xl font-bold">Kasbah Guard</h1>
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center space-x-6">
              <a href="/dashboard" className="text-primary font-medium">Dashboard</a>
              <a href="/scanner" className="hover:text-primary transition-colors">Scanner</a>
              <a href="/files" className="hover:text-primary transition-colors">Files</a>
              <a href="/api-console" className="hover:text-primary transition-colors">API</a>
              <a href="/integrations" className="hover:text-primary transition-colors">Integrations</a>
              <a href="/team" className="hover:text-primary transition-colors">Team</a>
              <a href="/settings" className="hover:text-primary transition-colors">
                <Settings className="h-5 w-5" />
              </a>
              <SignOutButton>
                <button className="flex items-center space-x-2 text-muted-foreground hover:text-primary transition-colors">
                  <LogOut className="h-5 w-5" />
                  <span>Sign Out</span>
                </button>
              </SignOutButton>
            </nav>

            {/* Mobile Menu Button */}
            <button 
              className="md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>

          {/* Mobile Navigation */}
          {mobileMenuOpen && (
            <motion.nav
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="md:hidden mt-4 pb-4 border-t pt-4"
            >
              <div className="flex flex-col space-y-4">
                <a href="/dashboard" className="text-primary font-medium">Dashboard</a>
                <a href="/scanner" className="hover:text-primary">Scanner</a>
                <a href="/files" className="hover:text-primary">Files</a>
                <a href="/api-console" className="hover:text-primary">API</a>
                <a href="/integrations" className="hover:text-primary">Integrations</a>
                <a href="/team" className="hover:text-primary">Team</a>
                <a href="/settings" className="hover:text-primary">Settings</a>
                <SignOutButton>
                  <button className="text-left text-red-500">Sign Out</button>
                </SignOutButton>
              </div>
            </motion.nav>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold mb-2">
            Welcome back, {user?.firstName}!
          </h2>
          <p className="text-muted-foreground">
            Here's what's happening with your security
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard
            title="Total Scans"
            value={stats.totalScans}
            icon={Activity}
            change="+12% from last week"
          />
          <StatCard
            title="Threats Detected"
            value={stats.threatsDetected}
            icon={AlertTriangle}
            change="+3 from last week"
            variant="warning"
          />
          <StatCard
            title="Files Scanned"
            value={stats.filesScanned}
            icon={FileText}
            change="+8 from last week"
          />
          <StatCard
            title="API Calls"
            value={stats.apiCalls}
            icon={Shield}
            change="+156 from last week"
          />
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <QuickActionCard
            title="Quick Scan"
            description="Scan text for secrets instantly"
            icon={Shield}
            href="/scanner"
            color="bg-blue-500"
          />
          <QuickActionCard
            title="Upload Files"
            description="Scan multiple files at once"
            icon={Upload}
            href="/files"
            color="bg-green-500"
          />
          <QuickActionCard
            title="View API Keys"
            description="Manage your API credentials"
            icon={Settings}
            href="/api-console"
            color="bg-purple-500"
          />
        </div>

        {/* Recent Scans */}
        <div className="border rounded-lg">
          <div className="p-6 border-b">
            <h3 className="text-xl font-semibold">Recent Scans</h3>
          </div>
          <div className="divide-y">
            {scans.map((scan) => (
              <div key={scan.id} className="p-4 flex items-center justify-between hover:bg-muted/50 transition-colors">
                <div className="flex items-center space-x-4">
                  <div className={`p-2 rounded-full ${
                    scan.decision === 'DENY' ? 'bg-red-100 text-red-600' :
                    scan.decision === 'WARN' ? 'bg-yellow-100 text-yellow-600' :
                    'bg-green-100 text-green-600'
                  }`}>
                    {scan.decision === 'DENY' ? <AlertTriangle className="h-5 w-5" /> :
                     scan.decision === 'WARN' ? <AlertTriangle className="h-5 w-5" /> :
                     <CheckCircle className="h-5 w-5" />}
                  </div>
                  <div>
                    <p className="font-medium">{scan.details}</p>
                    <p className="text-sm text-muted-foreground">
                      {scan.type} • {new Date(scan.timestamp).toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                    scan.decision === 'DENY' ? 'bg-red-100 text-red-700' :
                    scan.decision === 'WARN' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-green-100 text-green-700'
                  }`}>
                    {scan.decision}
                  </span>
                  <p className="text-sm text-muted-foreground mt-1">
                    Risk: {scan.risk}/100
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div className="p-4 border-t">
            <a href="/scanner" className="text-primary hover:underline text-sm font-medium">
              View all scans →
            </a>
          </div>
        </div>
      </main>
    </div>
  )
}

function StatCard({ 
  title, 
  value, 
  icon: Icon, 
  change,
  variant = 'default'
}: {
  title: string
  value: number
  icon: any
  change: string
  variant?: 'default' | 'warning'
}) {
  return (
    <div className="border rounded-lg p-6 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-medium text-muted-foreground">{title}</span>
        <Icon className={`h-5 w-5 ${
          variant === 'warning' ? 'text-yellow-600' : 'text-primary'
        }`} />
      </div>
      <div className="text-3xl font-bold mb-2">{value.toLocaleString()}</div>
      <p className="text-sm text-muted-foreground">{change}</p>
    </div>
  )
}

function QuickActionCard({
  title,
  description,
  icon: Icon,
  href,
  color
}: {
  title: string
  description: string
  icon: any
  href: string
  color: string
}) {
  return (
    <a 
      href={href}
      className="border rounded-lg p-6 hover:shadow-lg transition-all hover:-translate-y-1 group"
    >
      <div className={`${color} w-12 h-12 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
        <Icon className="h-6 w-6 text-white" />
      </div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground">{description}</p>
    </a>
  )
}
