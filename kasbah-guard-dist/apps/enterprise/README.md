# Kasbah Guard Enterprise Dashboard v1.0.0

Complete management console for Kasbah Guard secret detection.

**Features:**
- 📊 **Dashboard** — Real-time stats and overview
- 📋 **Policies** — Create and manage detection policies
- 📝 **Audit Logs** — View all detections and team activities
- 👥 **Team Management** — Add members, assign roles, control access
- 🔌 **Ecosystem** — Visualize 22 nature-inspired PPP modules
- 🧩 **Proofs** — Zero-knowledge proofs for detection verification

## Quick Start

```bash
# Install dependencies
npm install

# Start development server (port 3001)
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

Visit: http://localhost:3001

## Architecture

- **Frontend**: Next.js 14 (React 18 + TypeScript)
- **API Client**: Typed axios client with retry logic
- **State Management**: React hooks + localStorage
- **Styling**: Vanilla CSS with CSS variables

## API Integration

Dashboard calls the Kasbah API at `https://api.bekasbah.com`:

```
GET  /api/stats                   → Dashboard stats
GET  /api/policies                → List policies
POST /api/policies                → Create policy
PUT  /api/policies/:id            → Update policy
DELETE /api/policies/:id          → Delete policy

GET  /api/audit/recent            → Audit logs
GET  /api/team                    → Team members
POST /api/team                    → Add member
PUT  /api/team/:id                → Update member
DELETE /api/team/:id              → Remove member

GET  /health                      → API health check
```

## Environment Variables

```
NEXT_PUBLIC_API_BASE_URL=https://api.bekasbah.com
```

## Pages

### Dashboard (`/`)
- Overview stats
- Quick links to other pages
- Health status

### Policies (`/policies`)
- List all policies
- Create new policy
- Edit existing policies
- Delete policies

### Audit Logs (`/audit`)
- View detection history
- Filter by date, type, user
- Export logs

### Team (`/team`)
- Manage team members
- Assign roles (admin, member, viewer)
- Control access

### Ecosystem (`/ecosystem`)
- Visualize 22 PPP modules
- View module details and performance
- API integration stats

### Proofs (`/proofs`)
- Zero-knowledge proof verification
- Detection proof validation
- Cryptographic verification

## Development

```bash
# Type checking
tsc --noEmit

# Linting
npm run lint

# Format code
npx prettier --write .
```

## Deployment

```bash
# Build
npm run build

# Deploy to Vercel (or any Next.js hosting)
vercel
```

## Security

✅ **No Secrets Transmitted** — All processing via API
✅ **JWT Authentication** — Bearer token in Authorization header
✅ **HTTPS Only** — All API calls encrypted
✅ **Role-Based Access** — admin/member/viewer roles

## License

MIT
