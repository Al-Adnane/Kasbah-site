# Kasbah Guard Web App — Deployment Guide

## Quick Start

### 1. Install Dependencies
```bash
cd Kasbah-site/web-app
npm install
```

### 2. Set Up Environment Variables
```bash
cp .env.example .env.local
```

Edit `.env.local` with your credentials:
- **Clerk**: Sign up at https://clerk.com
- **Stripe**: Sign up at https://stripe.com
- **Database**: PostgreSQL connection string
- **Redis**: Redis connection string

### 3. Run Development Server
```bash
npm run dev
```

Open http://localhost:3000

### 4. Deploy to Production

#### Option A: Vercel (Recommended)
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

#### Option B: Docker
```bash
# Build Docker image
docker build -t kasbah-web-app .

# Run container
docker run -p 3000:3000 kasbah-web-app
```

#### Option C: Manual Build
```bash
# Build
npm run build

# Start
npm start
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | ✅ | Clerk publishable key |
| `CLERK_SECRET_KEY` | ✅ | Clerk secret key |
| `NEXT_PUBLIC_API_URL` | ✅ | Kasbah API URL |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | ⚠️ | Stripe publishable key |
| `STRIPE_SECRET_KEY` | ⚠️ | Stripe secret key |
| `DATABASE_URL` | ⚠️ | PostgreSQL connection |
| `REDIS_URL` | ⚠️ | Redis connection |

## Features

### Implemented
- ✅ User authentication (Clerk)
- ✅ Dashboard with stats
- ✅ Web scanner (text scanning)
- ✅ File upload scanning
- ✅ API console
- ✅ Responsive design
- ✅ Dark mode support
- ✅ Mobile navigation

### Coming Soon
- 🔄 Real API integration
- 🔄 File scanner pro
- 🔄 Slack integration
- 🔄 Discord integration
- 🔄 Team workspace
- 🔄 Billing & subscriptions
- 🔄 Admin console

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Auth:** Clerk
- **Payments:** Stripe
- **UI:** Tailwind CSS + shadcn/ui
- **Animations:** Framer Motion
- **Icons:** Lucide React
- **Hosting:** Vercel

## Project Structure

```
web-app/
├── src/
│   ├── app/
│   │   ├── dashboard/
│   │   ├── scanner/
│   │   ├── files/
│   │   ├── api-console/
│   │   ├── integrations/
│   │   ├── team/
│   │   ├── settings/
│   │   ├── sign-in/
│   │   ├── sign-up/
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── theme-provider.tsx
│   │   └── [ui components]
│   └── lib/
│       └── [utilities]
├── package.json
├── next.config.js
├── tsconfig.json
└── tailwind.config.js
```

## API Integration

### Scan Text
```typescript
const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/scan`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({ text })
})

const result = await response.json()
// result: { risk, decision, reason, violations, redacted }
```

### Get Scan History
```typescript
const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/scans`, {
  headers: { 'Authorization': `Bearer ${token}` }
})

const scans = await response.json()
```

## Security

- ✅ HTTPS only
- ✅ Environment variables for secrets
- ✅ Clerk for authentication
- ✅ Rate limiting via API
- ✅ Input sanitization
- ✅ XSS protection

## Monitoring

### Error Tracking
- Sentry integration recommended
- Configure in `src/app/layout.tsx`

### Analytics
- Vercel Analytics enabled by default
- Google Analytics optional

### Logging
- Console logs in development
- Structured logging in production

## Performance

### Targets
- First Contentful Paint: <1.5s
- Time to Interactive: <3.5s
- Lighthouse Score: >90

### Optimizations
- Image optimization via Next.js Image
- Code splitting via Next.js
- Edge functions for API routes
- ISR for static pages

## Support

- **Documentation:** https://docs.bekasbah.com
- **API Docs:** https://api.bekasbah.com/docs
- **Status:** https://status.bekasbah.com
- **Support:** support@kasbah.ai

---

**Last Updated:** March 4, 2026  
**Version:** 1.0.0
