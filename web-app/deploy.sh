#!/bin/bash

# Kasbah Guard Web App — Production Deployment Script
# Deploys to Vercel with all environment variables

set -e

echo "========================================"
echo "Kasbah Guard Web App — Deployment"
echo "========================================"
echo ""

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI not installed"
    echo "Install with: npm i -g vercel"
    exit 1
fi

echo "✓ Vercel CLI installed"

# Check if .env.local exists
if [ ! -f .env.local ]; then
    echo "❌ .env.local not found"
    echo "Copy .env.example to .env.local and fill in your credentials"
    exit 1
fi

echo "✓ .env.local found"

# Load environment variables
set -a
source .env.local
set +a

echo "✓ Environment variables loaded"

# Deploy to Vercel
echo ""
echo "Deploying to Vercel..."
echo ""

vercel --prod --yes

echo ""
echo "========================================"
echo "✅ Deployment Complete!"
echo "========================================"
echo ""
echo "Your app is now live at:"
echo "https://your-app.vercel.app"
echo ""
echo "Next steps:"
echo "1. Configure custom domain in Vercel dashboard"
echo "2. Set up production environment variables"
echo "3. Monitor deployment logs"
echo ""
