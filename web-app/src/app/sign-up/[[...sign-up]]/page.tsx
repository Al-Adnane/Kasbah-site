'use client'

import { SignUp } from '@clerk/nextjs'
import { motion } from 'framer-motion'
import { Shield, Check, Zap, Lock, Users, Award } from 'lucide-react'

export default function SignUpPage() {
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
              Start Protecting Your Data Today
            </h2>
            
            <p className="text-xl text-muted-foreground mb-8">
              Join thousands of developers and teams who trust Kasbah Guard.
            </p>

            <div className="space-y-4">
              <FeatureItem
                icon={Check}
                text="Free tier - 100 scans/month"
              />
              <FeatureItem
                icon={Zap}
                text="No credit card required"
              />
              <FeatureItem
                icon={Users}
                text="Trusted by 10,000+ users"
              />
              <FeatureItem
                icon={Award}
                text="Enterprise-grade security"
              />
            </div>
          </motion.div>

          {/* Testimonial */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.5 }}
            className="mt-12 p-6 bg-card rounded-lg border"
          >
            <p className="text-sm italic mb-4">
              "Kasbah Guard caught an AWS key I was about to paste into ChatGPT. 
              This tool is essential for any developer working with AI."
            </p>
            <div className="flex items-center space-x-3">
              <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
                <span className="text-primary font-bold">JD</span>
              </div>
              <div>
                <div className="font-semibold">John Doe</div>
                <div className="text-xs text-muted-foreground">Senior Developer @ Tech Corp</div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Right Side - Sign Up Form */}
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
              Create your free account
            </p>
          </div>

          <SignUp
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
            path="/sign-up"
            signInUrl="/sign-in"
            afterSignInUrl="/dashboard"
            afterSignUpUrl="/dashboard"
          />

          <div className="mt-8 text-center text-sm text-muted-foreground">
            <p>By signing up, you agree to our</p>
            <div className="flex items-center justify-center space-x-2 mt-2">
              <a href="/terms" className="text-primary hover:underline">Terms of Service</a>
              <span>•</span>
              <a href="/privacy" className="text-primary hover:underline">Privacy Policy</a>
            </div>
            <div className="flex items-center justify-center space-x-4 mt-4">
              <span className="flex items-center space-x-1">
                <Lock className="h-3 w-3" />
                <span>Secure signup</span>
              </span>
              <span className="flex items-center space-x-1">
                <Shield className="h-3 w-3" />
                <span>GDPR compliant</span>
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
