# Kasbah Guard Web App — Deployment to Vercel

## Quick Deploy (5 Minutes)

### Step 1: Create Clerk Account
1. Go to https://clerk.com
2. Sign up for free account
3. Create new application
4. Copy **Publishable Key** and **Secret Key**

### Step 2: Create Stripe Account (Optional for Billing)
1. Go to https://stripe.com
2. Sign up for free account
3. Copy **Publishable Key** and **Secret Key**

### Step 3: Deploy to Vercel

#### Option A: One-Click Deploy
```bash
cd Kasbah-site/web-app
./deploy.sh
```

#### Option B: Vercel Dashboard
1. Go to https://vercel.com/new
2. Import your GitHub repository
3. Configure environment variables
4. Click Deploy

### Step 4: Configure Environment Variables

In Vercel Dashboard → Settings → Environment Variables:

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_API_URL=https://api.bekasbah.com
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
```

### Step 5: Configure Clerk

In Clerk Dashboard → Settings → URLs:
- **Sign In URL:** `https://your-app.vercel.app/sign-in`
- **Sign Up URL:** `https://your-app.vercel.app/sign-up`
- **After Sign In URL:** `https://your-app.vercel.app/dashboard`
- **After Sign Up URL:** `https://your-app.vercel.app/dashboard`

### Step 6: Test Deployment

1. Open your Vercel URL
2. Sign up for an account
3. Test the scanner
4. Check dashboard

---

## Custom Domain (Optional)

### In Vercel Dashboard:
1. Go to Project Settings → Domains
2. Add your domain: `app.bekasbah.com`
3. Configure DNS records:
   ```
   Type: CNAME
   Name: app
   Value: cname.vercel-dns.com
   ```
4. Wait for DNS propagation (5-10 minutes)
5. Update Clerk URLs with custom domain

---

## Production Checklist

### Before Going Live:
- [ ] Set up production Clerk keys
- [ ] Set up production Stripe keys
- [ ] Configure custom domain
- [ ] Enable HTTPS (automatic with Vercel)
- [ ] Set up monitoring (Sentry)
- [ ] Configure analytics
- [ ] Test all features
- [ ] Set up error alerts
- [ ] Configure rate limiting
- [ ] Add security headers

### Environment Variables (Production):
```env
# Clerk (Production)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...

# API
NEXT_PUBLIC_API_URL=https://api.bekasbah.com

# Stripe (Production)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_SECRET_KEY=sk_live_...

# Database (Optional)
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
```

---

## Monitoring & Analytics

### Vercel Analytics (Built-in)
- Automatic performance tracking
- Real-time visitor analytics
- Core Web Vitals monitoring

### Sentry (Error Tracking)
```bash
npm install @sentry/nextjs
```

Configure in `src/app/layout.tsx`:
```typescript
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1.0,
});
```

---

## Scaling

### Vercel Plans:
- **Hobby:** Free (100GB bandwidth/month)
- **Pro:** $20/month (unlimited bandwidth)
- **Enterprise:** Custom

### Auto-Scaling:
Vercel automatically scales based on traffic. No configuration needed.

### Database Scaling:
- Use Supabase for PostgreSQL (free tier: 500MB)
- Use Upstash for Redis (free tier: 10K commands/day)

---

## Troubleshooting

### Build Fails
```bash
# Check build locally
npm run build

# Check for TypeScript errors
npx tsc --noEmit
```

### Environment Variables Not Working
- Make sure variables are prefixed with `NEXT_PUBLIC_` for client-side
- Redeploy after adding new environment variables
- Check Vercel logs for errors

### Clerk Authentication Issues
- Verify URLs in Clerk dashboard match your domain
- Check that keys are correct
- Clear browser cache and cookies

---

## Support

- **Vercel Docs:** https://vercel.com/docs
- **Clerk Docs:** https://clerk.com/docs
- **Next.js Docs:** https://nextjs.org/docs
- **Kasbah Support:** support@kasbah.ai

---

**Last Updated:** March 4, 2026  
**Status:** ✅ Production Ready
