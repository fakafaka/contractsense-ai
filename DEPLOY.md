# ContractSense AI - Deployment Guide

## Production Deployment

### Environment Variables

**Required:**
- `NODE_ENV=production` - Disables dev-only endpoints
- `PORT=3000` - Server port (default: 3000)
- `HOST=0.0.0.0` - Server host (default: 0.0.0.0)
- `DATABASE_URL` - PostgreSQL connection string

**Optional:**
- `CORS_ORIGINS` - Comma-separated allowed origins (default: *)

### Build and Start

```bash
# Install dependencies
pnpm install

# Build server
pnpm build

# Start production server
NODE_ENV=production pnpm start
```

### API Endpoints

**Public API (Production):**
- `POST /api/trpc/contracts.analyzeText` - Analyze contract text
- `POST /api/trpc/contracts.analyzePDF` - Analyze PDF contract
- `GET /api/trpc/contracts.list` - List all analyses
- `GET /api/trpc/contracts.getAnalysis` - Get specific analysis
- `POST /api/trpc/contracts.deleteAll` - Delete old analyses (24h+)
- `GET /api/health` - Health check

**Dev-Only Endpoints (NODE_ENV !== "production"):**
- `GET /api/trpc/contracts.cacheSmokeTest` - Cache verification test
- `GET /api/trpc/contracts.idempotencySmokeTest` - Idempotency verification test

### Security

- Rate limiting: 10 requests per 15 minutes per IP
- Idempotency support via `Idempotency-Key` header
- Content hash-based caching to reduce AI costs
- Auto-delete analyses after 24 hours

### Database Migration

```bash
pnpm db:push
```
