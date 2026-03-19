# No-login migration plan (minimal, coherent)

## Scope and current constraints

- The app UX enters `welcome -> upload` without any login gate.
- Backend identity in tRPC is still session-based (`ctx.user`), and most `contracts.*` procedures are `protectedProcedure`.
- `/api/iap/validate` now has an anonymous fallback using `deviceId`, but no equivalent anonymous identity bridge exists for tRPC contract/analysis endpoints.

## Affected backend files/functions

### Must change now (blocking no-login core flow)

1. `server/_core/context.ts`
   - `createContext(...)`
   - Add `deviceId` and `resolvedUserId` to context, derived from auth session OR anonymous device identity.

2. `server/_core/trpc.ts`
   - `protectedProcedure`
   - Keep existing behavior for account-required routes, but add a minimal `userOrDeviceProcedure` middleware that requires `resolvedUserId` (not necessarily `ctx.user`).

3. `server/routers.ts`
   - `contracts.usageStatus`
   - `contracts.enqueueDocumentAsync`
   - `contracts.getJobStatus`
   - `contracts.cancelJob`
   - `contracts.subscriptionStatus`
   - `contracts.verifyAppleReceipt` (or keep disabled but still read by resolved user id)
   - These endpoints should use `resolvedUserId` for credits/jobs ownership.

4. `server/analysis-queue.ts`
   - Ensure job ownership lookup/cancel uses the same effective identity key (`resolvedUserId`) so no-login users can poll/cancel jobs consistently.

5. `server/_core/index.ts`
   - Keep `/api/iap/validate` anonymous-compatible.
   - Add `/api/iap/restore` with same identity resolver and transaction-id idempotency.

### Can change later (non-blocking for initial no-login launch)

1. `server/routers.ts`
   - `contracts.list`, `getAnalysis`, `deleteReport`, `delete`, `deleteMyData` can remain auth-gated initially if not part of the first no-login surface.

2. `server/_core/oauth.ts`
   - Keep OAuth routes unchanged for optional account mode / future migration path.

3. `app/oauth/callback.tsx`, `hooks/use-auth.ts`, `lib/_core/auth.ts`, `lib/_core/api.ts`
   - Keep as optional account-login capability; no blocking migration required if no-login is default.

## Backend endpoint plan

### `usageStatus`

- Requirement: return credits for anonymous device consistently.
- Plan:
  1. Resolve effective user id from auth session or `deviceId`.
  2. Call `db.getCreditUsageState(effectiveUserId)`.
  3. Keep response shape unchanged.

### `enqueueDocumentAsync` and analysis flow

- Requirement: allow upload/analyze without OAuth while preserving per-user isolation.
- Plan:
  1. Replace auth-only guard with `userOrDeviceProcedure`.
  2. Use `effectiveUserId` for:
     - storage path partitioning
     - queue ownership
     - credit consumption
  3. Keep existing job state machine unchanged; only identity source changes.

### IAP validate

- Already partially done:
  - supports auth or `deviceId` fallback
  - idempotent by transaction id
  - credits assigned to resolved user id
- Keep as the canonical ingestion point for purchase grants.

### Restore purchases

- Add `POST /api/iap/restore`:
  - input: `{ receipts?: string[], transactions?: string[] }` + `deviceId` (header/body fallback)
  - for each transaction in validated receipt(s):
    - if not in `iapPurchases`, insert + grant credits
    - if already exists, skip (idempotent)
  - return `restoredCount`, `duplicateCount`, `remainingCredits`

## Frontend plan

### Generate/store stable `deviceId`

1. Add `lib/device-id.ts`:
   - `getOrCreateDeviceId()`
   - native: `expo-secure-store`
   - web: `localStorage`
   - value: random UUID v4 string

2. Never rotate automatically (only reset on explicit user data reset / reinstall).

### Attach `deviceId` to requests

1. `lib/trpc.ts`
   - Add `x-device-id` header for every tRPC request.
   - Keep existing Authorization behavior for optional logged-in users.

2. IAP network calls
   - Introduce a small helper (`lib/iap-api.ts`) to call `/api/iap/validate` and `/api/iap/restore` with `x-device-id`.
   - Wire purchase listeners in `app/upload.tsx` to call validate/restore helpers after native purchase events.

## Smallest safe implementation order

1. Add shared device-id utility on frontend.
2. Attach `x-device-id` in `lib/trpc.ts`.
3. Extend backend context to resolve effective user id by session-or-device.
4. Add `userOrDeviceProcedure` middleware.
5. Migrate only these procedures first: `usageStatus`, `enqueueDocumentAsync`, `getJobStatus`, `cancelJob`, `subscriptionStatus`.
6. Add `/api/iap/restore`.
7. Wire frontend IAP validate/restore calls.
8. Keep remaining authenticated history/delete/admin endpoints unchanged until phase 2.

## Risks and consistency concerns

1. **Device-loss risk**: reinstall/new device loses anonymous linkage; restore must be receipt-driven, not local-state-driven.
2. **Header spoofing risk**: `deviceId` is not strong auth; acceptable for low-stakes anonymous credits but not admin or sensitive data.
3. **Cross-device data non-portability**: expected for anonymous mode unless explicit account-linking flow is added.
4. **Queue ownership drift**: if some endpoints still read `ctx.user.id` while others use device identity, job polling/cancel can fail.
5. **Partial migration risk**: flipping only IAP without usage/analyze endpoints leaves a broken “paid but cannot consume” experience.

