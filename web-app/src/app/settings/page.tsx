'use client'

export const dynamic = 'force-dynamic'

import { useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { motion } from 'framer-motion'
import { 
  Shield, 
  Settings as SettingsIcon, 
  Bell, 
  CreditCard, 
  Key, 
  Globe,
  Save,
  Trash,
  Check
} from 'lucide-react'

export default function SettingsPage() {
  const { isLoaded, isSignedIn, user } = useUser()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'notifications' | 'billing'>('profile')
  const [saved, setSaved] = useState(false)

  if (!isLoaded || !isSignedIn) {
    router.push('/sign-in')
    return null
  }

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
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
              <a href="/api-console" className="hover:text-primary">API</a>
              <a href="/settings" className="text-primary font-medium">Settings</a>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-5xl mx-auto">
          {/* Title */}
          <div className="mb-8">
            <h2 className="text-3xl font-bold mb-2">Settings</h2>
            <p className="text-muted-foreground">
              Manage your account and preferences
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {/* Sidebar Navigation */}
            <div className="space-y-2">
              <SidebarButton
                icon={SettingsIcon}
                label="Profile"
                active={activeTab === 'profile'}
                onClick={() => setActiveTab('profile')}
              />
              <SidebarButton
                icon={Key}
                label="Security"
                active={activeTab === 'security'}
                onClick={() => setActiveTab('security')}
              />
              <SidebarButton
                icon={Bell}
                label="Notifications"
                active={activeTab === 'notifications'}
                onClick={() => setActiveTab('notifications')}
              />
              <SidebarButton
                icon={CreditCard}
                label="Billing"
                active={activeTab === 'billing'}
                onClick={() => setActiveTab('billing')}
              />
            </div>

            {/* Content Area */}
            <div className="md:col-span-3 space-y-6">
              {/* Profile Tab */}
              {activeTab === 'profile' && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6"
                >
                  <div className="border rounded-lg p-6">
                    <h3 className="text-lg font-semibold mb-4">Profile Information</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">Email</label>
                        <input
                          type="email"
                          defaultValue={user?.emailAddresses[0]?.emailAddress}
                          className="w-full p-3 border rounded-lg bg-background"
                          disabled
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Email is managed by your authentication provider
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Full Name</label>
                        <input
                          type="text"
                          defaultValue={`${user?.firstName || ''} ${user?.lastName || ''}`}
                          className="w-full p-3 border rounded-lg bg-background"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Timezone</label>
                        <select className="w-full p-3 border rounded-lg bg-background">
                          <option>UTC</option>
                          <option>America/New_York</option>
                          <option>America/Los_Angeles</option>
                          <option>Europe/London</option>
                          <option>Europe/Paris</option>
                          <option>Asia/Tokyo</option>
                        </select>
                      </div>
                      <button
                        onClick={handleSave}
                        className="flex items-center space-x-2 bg-primary text-primary-foreground px-6 py-2 rounded-lg hover:bg-primary/90"
                      >
                        {saved ? (
                          <>
                            <Check className="h-4 w-4" />
                            <span>Saved!</span>
                          </>
                        ) : (
                          <>
                            <Save className="h-4 w-4" />
                            <span>Save Changes</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="border rounded-lg p-6">
                    <h3 className="text-lg font-semibold mb-4 text-red-600">Danger Zone</h3>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">Delete Account</div>
                          <div className="text-sm text-muted-foreground">
                            Permanently delete your account and all data
                          </div>
                        </div>
                        <button className="flex items-center space-x-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700">
                          <Trash className="h-4 w-4" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Security Tab */}
              {activeTab === 'security' && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6"
                >
                  <div className="border rounded-lg p-6">
                    <h3 className="text-lg font-semibold mb-4">Security Settings</h3>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">Two-Factor Authentication</div>
                          <div className="text-sm text-muted-foreground">
                            Add an extra layer of security
                          </div>
                        </div>
                        <button className="bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90">
                          Enable 2FA
                        </button>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">Session Management</div>
                          <div className="text-sm text-muted-foreground">
                            Manage your active sessions
                          </div>
                        </div>
                        <button className="text-primary hover:underline">
                          View Sessions
                        </button>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">Change Password</div>
                          <div className="text-sm text-muted-foreground">
                            Update your password
                          </div>
                        </div>
                        <button className="text-primary hover:underline">
                          Change Password
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Notifications Tab */}
              {activeTab === 'notifications' && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6"
                >
                  <div className="border rounded-lg p-6">
                    <h3 className="text-lg font-semibold mb-4">Notification Preferences</h3>
                    <div className="space-y-4">
                      <ToggleSetting
                        label="Email Notifications"
                        description="Receive email updates about your scans"
                        defaultChecked={true}
                      />
                      <ToggleSetting
                        label="Threat Alerts"
                        description="Get notified when threats are detected"
                        defaultChecked={true}
                      />
                      <ToggleSetting
                        label="Weekly Reports"
                        description="Receive weekly summary of your security activity"
                        defaultChecked={false}
                      />
                      <ToggleSetting
                        label="Product Updates"
                        description="Stay informed about new features and improvements"
                        defaultChecked={true}
                      />
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Billing Tab */}
              {activeTab === 'billing' && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6"
                >
                  <div className="border rounded-lg p-6">
                    <h3 className="text-lg font-semibold mb-4">Current Plan</h3>
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <div className="text-2xl font-bold">Free</div>
                        <div className="text-sm text-muted-foreground">
                          100 scans/month
                        </div>
                      </div>
                      <button className="bg-primary text-primary-foreground px-6 py-2 rounded-lg hover:bg-primary/90">
                        Upgrade Plan
                      </button>
                    </div>
                    <div className="border-t pt-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm">Scans used this month</span>
                        <span className="text-sm font-medium">27 / 100</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div className="bg-primary h-2 rounded-full" style={{ width: '27%' }}></div>
                      </div>
                    </div>
                  </div>

                  <div className="border rounded-lg p-6">
                    <h3 className="text-lg font-semibold mb-4">Payment Method</h3>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <CreditCard className="h-6 w-6 text-muted-foreground" />
                        <div>
                          <div className="font-medium">No payment method</div>
                          <div className="text-sm text-muted-foreground">
                            Add a payment method to upgrade your plan
                          </div>
                        </div>
                      </div>
                      <button className="text-primary hover:underline">
                        Add Payment Method
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

function SidebarButton({ icon: Icon, label, active, onClick }: {
  icon: any
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
        active
          ? 'bg-primary text-primary-foreground'
          : 'hover:bg-muted'
      }`}
    >
      <Icon className="h-5 w-5" />
      <span className="font-medium">{label}</span>
    </button>
  )
}

function ToggleSetting({ label, description, defaultChecked }: {
  label: string
  description: string
  defaultChecked: boolean
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="font-medium">{label}</div>
        <div className="text-sm text-muted-foreground">{description}</div>
      </div>
      <label className="relative inline-flex items-center cursor-pointer">
        <input type="checkbox" defaultChecked={defaultChecked} className="sr-only peer" />
        <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
      </label>
    </div>
  )
}
