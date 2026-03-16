# ContractSense AI - Deployment Guide

## 1) Backend production deployment

### Required environment variables

- `NODE_ENV=production`
- `PORT=3000`
- `HOST=0.0.0.0`
- `DATABASE_URL` (MySQL connection)
- `JWT_SECRET` (strong secret; required by session validation)
- `APP_ID` (must match issued session tokens)
- `CORS_ORIGINS` (comma-separated allow-list; required in production)

### Optional environment variables

- `OPS_METRICS_TOKEN` (Bearer token required for `/api/metrics`)
- `ANALYSIS_RETENTION_SWEEP_MS` (retention sweep interval)
- `ANALYSIS_QUEUE_CONCURRENCY`
- `ANALYSIS_QUEUE_MAX_SIZE`
- `ANALYSIS_JOB_TTL_MS`
- `PRIVACY_POLICY_URL` (mobile legal link target)
- `TERMS_OF_USE_URL` (mobile legal link target)
- `EAS_APPLE_ID` (optional fallback for strict App Store readiness check)
- `IOS_SUBSCRIPTION_PRODUCT_ID` (StoreKit subscription product id for premium)
- `ANDROID_SUBSCRIPTION_PRODUCT_ID` (Play Billing product id for premium)
- `APPLE_SHARED_SECRET` (App Store shared secret for server-side receipt verification)
- `APPLE_BUNDLE_ID` (expected iOS bundle identifier for receipt validation)

### Build and start

```bash
cp .env.example .env
# fill production secrets and URLs

pnpm install
pnpm build
NODE_ENV=production pnpm start
```

### Runtime endpoints

- `GET /api/health` – simple liveness
- `GET /api/ready` – readiness (includes retention staleness checks)
- `GET /api/metrics` – runtime metrics (requires `Authorization: Bearer <OPS_METRICS_TOKEN>` if token configured)
- `POST /api/trpc/*` – authenticated contract APIs (`enqueueTextAsync`, `enqueuePDFAsync`, `getJobStatus`, `cancelJob`, `subscriptionStatus`, `verifyAppleReceipt`, `analysisQuality`, etc.)

---

## 2) Mobile release (App Store / TestFlight)

### EAS setup

This repository includes `eas.json` with `development`, `preview`, and `production` profiles.

Use:

```bash
pnpm dlx eas build --platform ios --profile preview
pnpm dlx eas build --platform ios --profile production
pnpm dlx eas submit --platform ios --profile production
```

### Versioning requirements

App config uses:

- `version` for marketing version
- `ios.buildNumber` from `IOS_BUILD_NUMBER`
- `android.versionCode` from `ANDROID_VERSION_CODE`

Increment build numbers for every App Store/TestFlight upload.

### App Store readiness checklist (minimum)


### Pre-submit automated check

Run a quick readiness audit before every TestFlight/App Store submission (also executed in CI in non-strict mode):

```bash
pnpm appstore:check
# or strict mode (fails if required env vars are missing)
pnpm appstore:check -- --strict
```

- Publish real Privacy Policy URL and Terms URL.
- Configure App Store metadata (description, keywords, screenshots, age rating).
- If charging users: ship StoreKit subscriptions + restore purchase + server-side validation.
- Provide review notes and test credentials if backend auth is required.
- Verify production backend env (`CORS_ORIGINS`, `JWT_SECRET`, `APP_ID`) before submission.


### Optional strict CI gate

A dedicated GitHub Actions workflow (`App Store Readiness (Strict)`) can be triggered manually before release and runs:

```bash
pnpm -s appstore:check -- --strict
```

Provide required values via repository variables (`PRIVACY_POLICY_URL`, `TERMS_OF_USE_URL`, `IOS_BUILD_NUMBER`, `ANDROID_VERSION_CODE`, `IOS_SUBSCRIPTION_PRODUCT_ID`, `ANDROID_SUBSCRIPTION_PRODUCT_ID`, `APPLE_BUNDLE_ID`) plus `EAS_APPLE_ID`, and add `APPLE_SHARED_SECRET` as a repository secret.
