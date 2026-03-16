import { describe, expect, it, vi, afterEach } from "vitest";
import * as db from "../server/db";
import { cancelAnalysisJob, enqueueAnalysisJob, getAnalysisJob, getAnalysisQueueStats } from "../server/analysis-queue";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("analysis queue", () => {
  it("completes immediately on user-scoped cache hit", async () => {
    vi.spyOn(db, "findUserCachedAnalysis").mockResolvedValue({
      id: 42,
      contractId: 7,
    } as any);

    const enqueued = enqueueAnalysisJob(
      {
        name: "Contract",
        text: "Some contract text with enough length",
        mode: "quick",
        contentType: "text",
      },
      123,
    );

    // Allow async worker tick
    await new Promise((r) => setTimeout(r, 10));

    const job = getAnalysisJob(enqueued.jobId, 123);
    expect(job).toMatchObject({
      status: "completed",
      analysisId: 42,
      contractId: 7,
      cached: true,
    });
  });

  it("does not expose job to another user", async () => {
    vi.spyOn(db, "findUserCachedAnalysis").mockResolvedValue({
      id: 10,
      contractId: 11,
    } as any);

    const enqueued = enqueueAnalysisJob(
      {
        name: "Contract",
        text: "Some contract text with enough length",
        mode: "quick",
        contentType: "text",
      },
      1,
    );

    await new Promise((r) => setTimeout(r, 10));

    expect(getAnalysisJob(enqueued.jobId, 999)).toBeNull();
  });



  it("allows cancelling a pending/processing job", async () => {
    vi.spyOn(db, "findUserCachedAnalysis").mockResolvedValue(null as any);
    vi.spyOn(db, "createContract").mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 20));
      return 500 as any;
    });
    vi.spyOn(db, "createAnalysis").mockResolvedValue(600 as any);

    const enqueued = enqueueAnalysisJob(
      {
        name: "Contract",
        text: "Some contract text with enough length",
        mode: "quick",
        contentType: "text",
      },
      777,
    );

    const cancelled = cancelAnalysisJob(enqueued.jobId, 777);
    expect(cancelled?.cancelled).toBe(true);

    const status = getAnalysisJob(enqueued.jobId, 777);
    expect(status?.status).toBe("cancelled");
  });

  it("allows re-enqueue after cancellation", async () => {
    vi.spyOn(db, "findUserCachedAnalysis").mockResolvedValue(null as any);

    const first = enqueueAnalysisJob(
      {
        name: "Contract",
        text: "Some contract text with enough length",
        mode: "quick",
        contentType: "text",
      },
      55,
    );

    cancelAnalysisJob(first.jobId, 55);

    const second = enqueueAnalysisJob(
      {
        name: "Contract",
        text: "Some contract text with enough length",
        mode: "quick",
        contentType: "text",
      },
      55,
    );

    expect(second.jobId).not.toBe(first.jobId);
    expect(second.deduped).toBe(false);
  });

  it("returns existing job for duplicate input from same user", async () => {
    vi.spyOn(db, "findUserCachedAnalysis").mockResolvedValue({
      id: 100,
      contractId: 200,
    } as any);

    const first = enqueueAnalysisJob(
      {
        name: "Contract",
        text: "Some contract text with enough length",
        mode: "quick",
        contentType: "text",
      },
      88,
    );

    const second = enqueueAnalysisJob(
      {
        name: "Contract",
        text: "Some contract text with enough length",
        mode: "quick",
        contentType: "text",
      },
      88,
    );

    expect(second.jobId).toBe(first.jobId);
    expect(second.deduped).toBe(true);
  });

  it("fails job when quota is exhausted", async () => {
    vi.spyOn(db, "findUserCachedAnalysis").mockResolvedValue(null as any);
    vi.spyOn(db, "consumeAnalysisQuota").mockResolvedValue({
      allowed: false,
      remaining: 0,
      plan: "free",
      monthlyLimit: 3,
      analysesThisMonth: 3,
    });
    const createContractSpy = vi.spyOn(db, "createContract");

    const enqueued = enqueueAnalysisJob(
      {
        name: "Contract",
        text: "Some contract text with enough length",
        mode: "quick",
        contentType: "text",
      },
      1,
    );

    await new Promise((r) => setTimeout(r, 10));

    const status = getAnalysisJob(enqueued.jobId, 1);
    expect(status?.status).toBe("failed");
    expect(status?.error).toContain("Monthly analysis limit reached");
    expect(createContractSpy).not.toHaveBeenCalled();
  });



  it("exposes queue stats for observability", async () => {
    vi.spyOn(db, "findUserCachedAnalysis").mockResolvedValue({
      id: 10,
      contractId: 11,
    } as any);

    const enqueued = enqueueAnalysisJob(
      {
        name: "Contract",
        text: "Some contract text with enough length",
        mode: "quick",
        contentType: "text",
      },
      1234,
    );

    await new Promise((r) => setTimeout(r, 10));

    const status = getAnalysisJob(enqueued.jobId, 1234);
    expect(status?.status).toBe("completed");

    const stats = getAnalysisQueueStats();
    expect(stats.jobsTracked).toBeGreaterThan(0);
    expect(stats.completed).toBeGreaterThan(0);
    expect(stats.config.maxConcurrency).toBeGreaterThan(0);
    expect(stats.config.maxQueueSize).toBeGreaterThan(0);
  });
  it("rolls back quota when queue job fails after quota consume", async () => {
    vi.spyOn(db, "findUserCachedAnalysis").mockResolvedValue(null as any);
    vi.spyOn(db, "consumeAnalysisQuota").mockResolvedValue({
      allowed: true,
      remaining: 2,
      plan: "free",
      monthlyLimit: 3,
      analysesThisMonth: 1,
    });
    const releaseSpy = vi.spyOn(db, "releaseAnalysisQuota").mockResolvedValue();
    vi.spyOn(db, "createContract").mockRejectedValue(new Error("db down"));

    const enqueued = enqueueAnalysisJob(
      {
        name: "Contract",
        text: "Some contract text with enough length",
        mode: "quick",
        contentType: "text",
      },
      99,
    );

    await new Promise((r) => setTimeout(r, 10));

    const status = getAnalysisJob(enqueued.jobId, 99);
    expect(status?.status).toBe("failed");
    expect(releaseSpy).toHaveBeenCalledWith(99);
  });
});
