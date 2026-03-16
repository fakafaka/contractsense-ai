import * as db from "./db";

const DEFAULT_SWEEP_MS = 60 * 60 * 1000; // 1 hour
const MIN_SWEEP_MS = 60 * 1000; // 1 minute

export function getRetentionSweepIntervalMs(): number {
  const raw = process.env.ANALYSIS_RETENTION_SWEEP_MS;
  const parsed = raw ? Number(raw) : DEFAULT_SWEEP_MS;
  if (!Number.isFinite(parsed) || parsed < MIN_SWEEP_MS) {
    return DEFAULT_SWEEP_MS;
  }
  return Math.floor(parsed);
}

export function shouldEnableRetentionSweep(): boolean {
  if (process.env.NODE_ENV === "production") return true;
  return process.env.ENABLE_RETENTION_SWEEP_DEV === "true";
}

export type RetentionSweepStats = {
  enabled: boolean;
  intervalMs: number;
  lastRunAt: number | null;
  lastSuccessAt: number | null;
  lastErrorAt: number | null;
  lastDeletedCount: number;
  totalDeleted: number;
  runs: number;
  failures: number;
};

const retentionStats: RetentionSweepStats = {
  enabled: false,
  intervalMs: getRetentionSweepIntervalMs(),
  lastRunAt: null,
  lastSuccessAt: null,
  lastErrorAt: null,
  lastDeletedCount: 0,
  totalDeleted: 0,
  runs: 0,
  failures: 0,
};

export function getRetentionSweepStats(): RetentionSweepStats {
  return { ...retentionStats };
}

async function runRetentionSweep() {
  retentionStats.runs += 1;
  retentionStats.lastRunAt = Date.now();
  try {
    const deleted = await db.deleteOldAnalyses();
    retentionStats.lastSuccessAt = Date.now();
    retentionStats.lastDeletedCount = deleted;
    retentionStats.totalDeleted += deleted;
    if (deleted > 0) {
      console.log(`[Retention] Deleted ${deleted} expired analyses`);
    }
  } catch (error) {
    retentionStats.failures += 1;
    retentionStats.lastErrorAt = Date.now();
    console.error("[Retention] Sweep failed", error);
  }
}

export function startRetentionSweep(): (() => void) | null {
  retentionStats.enabled = shouldEnableRetentionSweep();
  retentionStats.intervalMs = getRetentionSweepIntervalMs();

  if (!retentionStats.enabled) {
    return null;
  }

  const intervalMs = retentionStats.intervalMs;
  const timer = setInterval(() => {
    void runRetentionSweep();
  }, intervalMs);

  // Avoid keeping the process alive because of this timer.
  if (typeof (timer as any).unref === "function") {
    (timer as any).unref();
  }

  // Run once on startup (fire-and-forget).
  void runRetentionSweep();

  console.log(`[Retention] Sweep job enabled; interval=${intervalMs}ms`);

  return () => clearInterval(timer);
}
