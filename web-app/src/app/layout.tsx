import { ClerkProvider } from '@clerk/nextjs'

export const metadata = {
  title: 'Kasbah Guard — AI Security Platform',
  description: 'Protect your sensitive data from AI leaks with real-time detection',
  keywords: 'AI security, data protection, secret detection, DLP, compliance',
  authors: [{ name: 'Kasbah Guard', url: 'https://bekasbah.com' }],
  openGraph: {
    title: 'Kasbah Guard — AI Security Platform',
    description: 'Protect your sensitive data from AI leaks',
    url: 'https://app.bekasbah.com',
    siteName: 'Kasbah Guard',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🛡️</text></svg>" />
      </head>
      <body className="min-h-screen bg-white antialiased">
        <ClerkProvider>
          {children}
        </ClerkProvider>
      </body>
    </html>
  )
}
