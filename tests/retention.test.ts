import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("retention config", () => {
  it("enables sweep in production", async () => {
    (process.env as any).NODE_ENV = "production";
    const mod = await import("../server/retention");
    expect(mod.shouldEnableRetentionSweep()).toBe(true);
  });

  it("disables sweep in dev by default", async () => {
    (process.env as any).NODE_ENV = "development";
    delete process.env.ENABLE_RETENTION_SWEEP_DEV;
    const mod = await import("../server/retention");
    expect(mod.shouldEnableRetentionSweep()).toBe(false);
  });

  it("uses safe default interval for invalid values", async () => {
    process.env.ANALYSIS_RETENTION_SWEEP_MS = "10";
    const mod = await import("../server/retention");
    expect(mod.getRetentionSweepIntervalMs()).toBe(60 * 60 * 1000);
  });

  it("runs sweep on startup when enabled", async () => {
    (process.env as any).NODE_ENV = "production";

    vi.useFakeTimers();

    const db = await import("../server/db");
    const sweepSpy = vi.spyOn(db, "deleteOldAnalyses").mockResolvedValue(0);

    const mod = await import("../server/retention");
    const stop = mod.startRetentionSweep();

    await vi.runOnlyPendingTimersAsync();

    expect(stop).toBeTypeOf("function");
    expect(sweepSpy).toHaveBeenCalled();

    stop?.();
  });


  it("tracks retention stats after startup sweep", async () => {
    (process.env as any).NODE_ENV = "production";

    vi.useFakeTimers();

    const db = await import("../server/db");
    vi.spyOn(db, "deleteOldAnalyses").mockResolvedValue(2);

    const mod = await import("../server/retention");
    const stop = mod.startRetentionSweep();

    await vi.runOnlyPendingTimersAsync();

    const stats = mod.getRetentionSweepStats();
    expect(stats.enabled).toBe(true);
    expect(stats.runs).toBeGreaterThan(0);
    expect(stats.totalDeleted).toBeGreaterThanOrEqual(2);
    expect(stats.lastSuccessAt).not.toBeNull();

    stop?.();
  });

});
