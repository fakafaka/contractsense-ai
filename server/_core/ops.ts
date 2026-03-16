import { timingSafeEqual } from "crypto";
import type express from "express";
import type { RetentionSweepStats } from "../retention";

function safeTokenEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function parseBearerToken(authorization: string | undefined) {
  if (!authorization) return null;
  const [scheme, token] = authorization.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  return token;
}

export function canAccessOpsEndpoints(req: express.Request): boolean {
  const expectedToken = process.env.OPS_METRICS_TOKEN;
  if (!expectedToken) return true;

  const providedToken = parseBearerToken(req.headers.authorization);
  if (!providedToken) return false;

  return safeTokenEquals(providedToken, expectedToken);
}

export function isRetentionSweepHealthy(retention: RetentionSweepStats, now = Date.now()) {
  const staleThresholdMs = Math.max(retention.intervalMs * 2, 5 * 60 * 1000);

  if (!retention.enabled || !retention.lastRunAt) {
    return {
      healthy: true,
      staleThresholdMs,
      ageMs: 0,
    } as const;
  }

  const ageMs = now - retention.lastRunAt;
  return {
    healthy: ageMs <= staleThresholdMs,
    staleThresholdMs,
    ageMs,
  } as const;
}
