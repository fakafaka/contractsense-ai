/**
 * Simple in-memory rate limiter
 * For production, use Redis or similar
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Clean up old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt < now) {
      store.delete(key);
    }
  }
}, 5 * 60 * 1000);

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  max: number; // Max requests per window
}

export function checkRateLimit(identifier: string, config: RateLimitConfig): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const entry = store.get(identifier);
  
  if (!entry || entry.resetAt < now) {
    // New window
    const resetAt = now + config.windowMs;
    store.set(identifier, { count: 1, resetAt });
    return { allowed: true, remaining: config.max - 1, resetAt };
  }
  
  if (entry.count >= config.max) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }
  
  entry.count++;
  return { allowed: true, remaining: config.max - entry.count, resetAt: entry.resetAt };
}

// Idempotency store (keep for 24h)
const idempotencyStore = new Map<string, { result: any; expiresAt: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of idempotencyStore.entries()) {
    if (entry.expiresAt < now) {
      idempotencyStore.delete(key);
    }
  }
}, 60 * 60 * 1000); // Clean every hour

export function checkIdempotency(key: string): { exists: boolean; result?: any } {
  const entry = idempotencyStore.get(key);
  if (!entry || entry.expiresAt < Date.now()) {
    return { exists: false };
  }
  return { exists: true, result: entry.result };
}

export function saveIdempotency(key: string, result: any, ttlMs: number = 24 * 60 * 60 * 1000): void {
  idempotencyStore.set(key, {
    result,
    expiresAt: Date.now() + ttlMs,
  });
}
