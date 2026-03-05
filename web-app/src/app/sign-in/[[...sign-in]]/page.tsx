'use client'

import { SignIn } from '@clerk/nextjs'
import { motion } from 'framer-motion'
import { Shield, Check, Zap, Lock } from 'lucide-react'

export default function SignInPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted flex">
      {/* Left Side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 items-center justify-center p-12">
        <div className="max-w-md space-y-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="flex items-center space-x-4 mb-8">
              <Shield className="h-12 w-12 text-primary" />
              <h1 className="text-4xl font-bold">Kasbah Guard</h1>
            </div>
            
            <h2 className="text-5xl font-bold mb-6">
              Protect Your Data from AI Leaks
            </h2>
            
            <p className="text-xl text-muted-foreground mb-8">
              Real-time detection of secrets, PII, and sensitive data across all your AI tools.
            </p>

            <div className="space-y-4">
              <FeatureItem
                icon={Check}
                text="140+ detection patterns"
              />
              <FeatureItem
                icon={Zap}
                text="<5ms detection latency"
              />
              <FeatureItem
                icon={Lock}
                text="Enterprise-grade security"
              />
            </div>
          </motion.div>
        </div>
      </div>

      {/* Right Side - Sign In Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="w-full max-w-md"
        >
          <div className="lg:hidden text-center mb-8">
            <div className="flex items-center justify-center space-x-3 mb-4">
              <Shield className="h-10 w-10 text-primary" />
              <h1 className="text-3xl font-bold">Kasbah Guard</h1>
            </div>
            <p className="text-muted-foreground">
              Sign in to protect your data
            </p>
          </div>

          <SignIn
            appearance={{
              elements: {
                formButtonPrimary: 'bg-primary hover:bg-primary/90',
                card: 'shadow-lg',
                headerTitle: 'text-2xl font-bold',
                headerSubtitle: 'text-muted-foreground',
                socialButtonsBlockButton: 'border',
                footerActionLink: 'text-primary hover:underline',
              }
            }}
            routing="path"
            path="/sign-in"
            signUpUrl="/sign-up"
            afterSignInUrl="/dashboard"
            afterSignUpUrl="/dashboard"
          />

          <div className="mt-8 text-center text-sm text-muted-foreground">
            <p>Protected by enterprise-grade security</p>
            <div className="flex items-center justify-center space-x-4 mt-2">
              <span className="flex items-center space-x-1">
                <Lock className="h-3 w-3" />
                <span>256-bit encryption</span>
              </span>
              <span className="flex items-center space-x-1">
                <Shield className="h-3 w-3" />
                <span>SOC2 compliant</span>
              </span>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}

function FeatureItem({ icon: Icon, text }: { icon: any, text: string }) {
  return (
    <div className="flex items-center space-x-3">
      <div className="flex-shrink-0">
        <Icon className="h-6 w-6 text-primary" />
      </div>
      <span className="text-lg">{text}</span>
    </div>
  )
}
