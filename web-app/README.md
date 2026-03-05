# Kasbah Guard Web App

Full-featured web application for Kasbah Guard AI Security Platform.

## Features

- 🔐 **Authentication** - Secure login/signup with Clerk
- 🔍 **Web Scanner** - Real-time text scanning for secrets
- 📁 **File Scanner** - Upload and scan multiple files
- 🔌 **API Console** - Manage API keys and test endpoints
- 💬 **Integrations** - Slack, Discord, and more
- 👥 **Team** - Collaborate with your team
- ⚙️ **Settings** - Customize your experience

## Quick Start

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Open http://localhost:3000
```

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions.

## Tech Stack

- **Next.js 14** - React framework
- **TypeScript** - Type safety
- **Clerk** - Authentication
- **Stripe** - Payments
- **Tailwind CSS** - Styling
- **Framer Motion** - Animations

## Environment Setup

1. Copy `.env.example` to `.env.local`
2. Fill in your credentials:
   - Clerk API keys
   - Stripe API keys
   - Database URL
   - Redis URL

## Project Structure

```
src/
├── app/              # Next.js app router pages
├── components/       # Reusable components
└── lib/             # Utilities and helpers
```

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Clerk Documentation](https://clerk.com/docs)
- [Tailwind CSS](https://tailwindcss.com/docs)

## License

MIT
