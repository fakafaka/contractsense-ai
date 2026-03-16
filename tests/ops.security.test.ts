import { afterEach, describe, expect, it } from "vitest";
import { canAccessOpsEndpoints, isRetentionSweepHealthy } from "../server/_core/ops";
import type { RetentionSweepStats } from "../server/retention";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("ops endpoint security", () => {
  it("allows access when OPS_METRICS_TOKEN is not configured", () => {
    delete process.env.OPS_METRICS_TOKEN;
    const req = { headers: {}, query: {} } as any;
    expect(canAccessOpsEndpoints(req)).toBe(true);
  });

  it("allows access when bearer token matches", () => {
    process.env.OPS_METRICS_TOKEN = "secret-token";
    const req = { headers: { authorization: "Bearer secret-token" }, query: {} } as any;
    expect(canAccessOpsEndpoints(req)).toBe(true);
  });

  it("denies access when token does not match", () => {
    process.env.OPS_METRICS_TOKEN = "secret-token";
    const req = { headers: { authorization: "Bearer wrong" }, query: { token: "secret-token" } } as any;
    expect(canAccessOpsEndpoints(req)).toBe(false);
  });



  it("denies access when authorization header is malformed", () => {
    process.env.OPS_METRICS_TOKEN = "secret-token";
    const req = { headers: { authorization: "Basic secret-token" }, query: {} } as any;
    expect(canAccessOpsEndpoints(req)).toBe(false);
  });
  it("denies access when only query token is provided", () => {
    process.env.OPS_METRICS_TOKEN = "secret-token";
    const req = { headers: {}, query: { token: "secret-token" } } as any;
    expect(canAccessOpsEndpoints(req)).toBe(false);
  });
});

describe("retention readiness health", () => {
  const baseStats: RetentionSweepStats = {
    enabled: true,
    intervalMs: 60_000,
    lastRunAt: null,
    lastSuccessAt: null,
    lastErrorAt: null,
    lastDeletedCount: 0,
    totalDeleted: 0,
    runs: 0,
    failures: 0,
  };

  it("is healthy when retention is disabled", () => {
    const result = isRetentionSweepHealthy({ ...baseStats, enabled: false }, 1_000_000);
    expect(result.healthy).toBe(true);
  });

  it("is healthy when last run is within threshold", () => {
    const now = 1_000_000;
    const result = isRetentionSweepHealthy({ ...baseStats, lastRunAt: now - 30_000 }, now);
    expect(result.healthy).toBe(true);
  });

  it("is unhealthy when last run is stale", () => {
    const now = 1_000_000;
    const result = isRetentionSweepHealthy({ ...baseStats, lastRunAt: now - 600_000 }, now);
    expect(result.healthy).toBe(false);
    expect(result.ageMs).toBe(600_000);
  });
});
