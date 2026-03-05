# Kasbah Guard Web App — Local Testing Commands

**Quick Start:** Run these commands to test the fully wired web app locally

---

## 1. Navigate to Web App

```bash
cd /Users/mac/Desktop/KasbahFinal/Kasbah-site/web-app
```

---

## 2. View Key Files

### View All API Routes
```bash
# Scan API route
cat src/app/api/scan/route.ts

# Files upload API route
cat src/app/api/files/upload/route.ts

# User stats API route
cat src/app/api/user/stats/route.ts

# API keys API route
cat src/app/api/keys/route.ts

# Scans history API route
cat src/app/api/scans/route.ts
```

### View All Pages
```bash
# Home page
cat src/app/page.tsx

# Dashboard page
cat src/app/dashboard/page.tsx

# Scanner page
cat src/app/scanner/page.tsx

# Files page
cat src/app/files/page.tsx

# API Console page
cat src/app/api-console/page.tsx

# Settings page
cat src/app/settings/page.tsx

# Sign In page
cat src/app/sign-in/[[...sign-in]]/page.tsx

# Sign Up page
cat src/app/sign-up/[[...sign-up]]/page.tsx
```

### View Configuration
```bash
# Package.json (dependencies)
cat package.json

# Next.js config
cat next.config.js

# TypeScript config
cat tsconfig.json

# Tailwind config
cat tailwind.config.js

# Environment template
cat .env.example
```

### View Documentation
```bash
# Complete update summary
cat COMPLETE_UPDATE_SUMMARY.md

# Backend wiring complete
cat BACKEND_WIRING_COMPLETE.md

# Frontend updated
cat FRONTEND_UPDATED.md

# Deployment guide
cat DEPLOYMENT.md

# Deploy to Vercel guide
cat DEPLOY_TO_VERCEL.md
```

---

## 3. Setup & Run Locally

### Install Dependencies
```bash
cd /Users/mac/Desktop/KasbahFinal/Kasbah-site/web-app
npm install
```

### Create Environment File
```bash
cp .env.example .env.local
```

### Edit Environment File
```bash
# Add your Kasbah API key
nano .env.local
# or
code .env.local
# or
vim .env.local
```

**Required in `.env.local`:**
```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_your-clerk-key
CLERK_SECRET_KEY=sk_test_your-clerk-secret
NEXT_PUBLIC_KASBAH_API_URL=https://api.bekasbah.com
KASBAH_API_KEY=your-kasbah-api-key
```

### Run Development Server
```bash
npm run dev
```

**Open in browser:** http://localhost:3000

---

## 4. Test All Features

### Test Scanner
```bash
# Open http://localhost:3000/scanner
# 1. Paste: AKIAIOSFODNN7EXAMPLE
# 2. Click Scan
# 3. Check results
```

### Test Files
```bash
# Open http://localhost:3000/files
# 1. Create test.txt with some text
# 2. Drag & drop file
# 3. Click Scan
# 4. Check results
```

### Test Dashboard
```bash
# Open http://localhost:3000/dashboard
# 1. Check stats load
# 2. Check recent scans
# 3. Click quick actions
```

### Test API Console
```bash
# Open http://localhost:3000/api-console
# 1. Go to API Keys tab
# 2. Click "Create New Key"
# 3. Copy the key
# 4. Delete the key
# 5. Go to Test Endpoint tab
# 6. Test /api/scan endpoint
```

---

## 5. Quick One-Liner Commands

### View Complete File Structure
```bash
find /Users/mac/Desktop/KasbahFinal/Kasbah-site/web-app -type f -name "*.tsx" -o -name "*.ts" -o -name "*.json" | head -30
```

### Count Lines of Code
```bash
cd /Users/mac/Desktop/KasbahFinal/Kasbah-site/web-app && find src -name "*.tsx" -o -name "*.ts" | xargs wc -l
```

### Check for TODOs
```bash
cd /Users/mac/Desktop/KasbahFinal/Kasbah-site/web-app && grep -r "TODO" src/
```

### Check for Console Logs
```bash
cd /Users/mac/Desktop/KasbahFinal/Kasbah-site/web-app && grep -r "console" src/
```

### View Package Dependencies
```bash
cd /Users/mac/Desktop/KasbahFinal/Kasbah-site/web-app && cat package.json | jq '.dependencies'
```

---

## 6. Build & Test Production

### Build for Production
```bash
cd /Users/mac/Desktop/KasbahFinal/Kasbah-site/web-app
npm run build
```

### Run Production Build Locally
```bash
npm start
```

**Open:** http://localhost:3000

### Run Linting
```bash
npm run lint
```

---

## 7. Deploy to Vercel

### Quick Deploy
```bash
cd /Users/mac/Desktop/KasbahFinal/Kasbah-site/web-app
./deploy.sh
```

### Manual Deploy
```bash
npx vercel --prod
```

---

## 8. Full Testing Script

Create a test script:

```bash
cat > test-local.sh << 'EOF'
#!/bin/bash

echo "========================================"
echo "Kasbah Guard Web App — Local Testing"
echo "========================================"
echo ""

cd /Users/mac/Desktop/KasbahFinal/Kasbah-site/web-app

echo "1. Installing dependencies..."
npm install

echo ""
echo "2. Checking environment file..."
if [ ! -f .env.local ]; then
  echo "⚠️  .env.local not found!"
  echo "Creating from .env.example..."
  cp .env.example .env.local
  echo "✏️  Edit .env.local with your API keys"
  exit 1
else
  echo "✅ .env.local found"
fi

echo ""
echo "3. Building for production..."
npm run build

echo ""
echo "4. Starting development server..."
echo "🌐 Open http://localhost:3000"
echo "📍 Scanner: http://localhost:3000/scanner"
echo "📁 Files: http://localhost:3000/files"
echo "📊 Dashboard: http://localhost:3000/dashboard"
echo "🔌 API Console: http://localhost:3000/api-console"
echo "⚙️  Settings: http://localhost:3000/settings"
echo ""
echo "Press Ctrl+C to stop"
echo "========================================"

npm run dev
EOF

chmod +x test-local.sh
./test-local.sh
```

---

## 9. Quick Status Check

```bash
cd /Users/mac/Desktop/KasbahFinal/Kasbah-site/web-app

echo "=== Web App Status ==="
echo ""
echo "📁 Files:"
find src/app -name "*.tsx" | wc -l | xargs echo "   Pages:"
find src/app/api -name "*.ts" | wc -l | xargs echo "   API Routes:"
echo ""
echo "📦 Dependencies:"
cat package.json | grep -c '"' | xargs echo "   Total:"
echo ""
echo "📝 Documentation:"
ls *.md | wc -l | xargs echo "   Files:"
echo ""
echo "✅ Status: Ready for testing"
```

---

## 10. Environment Variables Checklist

```bash
cd /Users/mac/Desktop/KasbahFinal/Kasbah-site/web-app

echo "=== Environment Variables Check ==="
echo ""

if [ -f .env.local ]; then
  echo "✅ .env.local exists"
  echo ""
  echo "Required variables:"
  grep -q "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY" .env.local && echo "✅ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY" || echo "❌ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"
  grep -q "CLERK_SECRET_KEY" .env.local && echo "✅ CLERK_SECRET_KEY" || echo "❌ CLERK_SECRET_KEY"
  grep -q "NEXT_PUBLIC_KASBAH_API_URL" .env.local && echo "✅ NEXT_PUBLIC_KASBAH_API_URL" || echo "❌ NEXT_PUBLIC_KASBAH_API_URL"
  grep -q "KASBAH_API_KEY" .env.local && echo "✅ KASBAH_API_KEY" || echo "❌ KASBAH_API_KEY"
else
  echo "❌ .env.local not found!"
  echo "Run: cp .env.example .env.local"
fi
```

---

## Summary

### Quick Start (3 Commands)
```bash
cd /Users/mac/Desktop/KasbahFinal/Kasbah-site/web-app
npm install
npm run dev
# Open http://localhost:3000
```

### View All Files
```bash
cat src/app/page.tsx
cat src/app/api/scan/route.ts
cat package.json
cat .env.example
```

### Test Features
```
http://localhost:3000/scanner      — Test text scanning
http://localhost:3000/files        — Test file upload
http://localhost:3000/dashboard    — Test dashboard
http://localhost:3000/api-console  — Test API keys
```

---

**Location:** `/Users/mac/Desktop/KasbahFinal/Kasbah-site/web-app/`  
**Status:** ✅ **Ready for Local Testing**
