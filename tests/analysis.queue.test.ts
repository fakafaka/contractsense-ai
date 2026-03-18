import { describe, expect, it, vi, afterEach } from "vitest";
import * as db from "../server/db";
import { enqueueAnalysisJob, getAnalysisJob } from "../server/analysis-queue";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("analysis queue", () => {
  it("returns completed cache result without consuming credit", async () => {
    vi.spyOn(db, "findUserCachedAnalysis").mockResolvedValue({ id: 42, contractId: 7 } as any);
    vi.spyOn(db, "getCreditUsageState").mockResolvedValue({ remainingCredits: 2, totalCredits: 3, creditsConsumed: 1 });

    const enqueued = enqueueAnalysisJob(
      {
        name: "Contract",
        text: "Some contract text with enough length",
        mode: "standard",
        contentType: "text",
      },
      123,
    );

    await new Promise((r) => setTimeout(r, 10));

    const job = getAnalysisJob(enqueued.jobId, 123);
    expect(job).toMatchObject({
      status: "completed",
      analysisId: 42,
      contractId: 7,
      cacheHit: true,
      creditConsumed: false,
      remainingCredits: 2,
    });
  });

  it("dedupes in-flight job and avoids double credit consumption", async () => {
    vi.spyOn(db, "findUserCachedAnalysis").mockResolvedValue(null as any);
    const consumeSpy = vi.spyOn(db, "consumeAnalysisQuota").mockResolvedValue({
      allowed: true,
      remaining: 2,
      plan: "free",
      monthlyLimit: 3,
      analysesThisMonth: 1,
    });
    vi.spyOn(db, "createContract").mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 40));
      return 501;
    });
    vi.spyOn(db, "createAnalysis").mockResolvedValue(601 as any);

    const first = enqueueAnalysisJob(
      {
        name: "Contract",
        text: "Some contract text with enough length",
        mode: "standard",
        contentType: "text",
      },
      88,
    );

    const second = enqueueAnalysisJob(
      {
        name: "Contract",
        text: "Some contract text with enough length",
        mode: "standard",
        contentType: "text",
      },
      88,
    );

    expect(second.jobId).toBe(first.jobId);
    expect(second.deduped).toBe(true);

    await new Promise((r) => setTimeout(r, 80));
    expect(consumeSpy).toHaveBeenCalledTimes(1);
  });

  it("fails cleanly when no credits remain and does not create contract", async () => {
    vi.spyOn(db, "findUserCachedAnalysis").mockResolvedValue(null as any);
    vi.spyOn(db, "consumeAnalysisQuota").mockResolvedValue({
      allowed: false,
      remaining: 0,
      plan: "free",
      monthlyLimit: 3,
      analysesThisMonth: 3,
    });
    vi.spyOn(db, "getCreditUsageState").mockResolvedValue({ remainingCredits: 0, totalCredits: 3, creditsConsumed: 3 });
    const createContractSpy = vi.spyOn(db, "createContract");

    const enqueued = enqueueAnalysisJob(
      {
        name: "Contract",
        text: "Some contract text with enough length",
        mode: "standard",
        contentType: "text",
      },
      1,
    );

    await new Promise((r) => setTimeout(r, 10));

    const status = getAnalysisJob(enqueued.jobId, 1);
    expect(status?.status).toBe("failed");
    expect(status?.creditConsumed).toBe(false);
    expect(status?.remainingCredits).toBe(0);
    expect(createContractSpy).not.toHaveBeenCalled();
  });

  it("rolls back consumed credit once when job fails after consume", async () => {
    vi.spyOn(db, "findUserCachedAnalysis").mockResolvedValue(null as any);
    vi.spyOn(db, "consumeAnalysisQuota").mockResolvedValue({
      allowed: true,
      remaining: 2,
      plan: "free",
      monthlyLimit: 3,
      analysesThisMonth: 1,
    });
    const releaseSpy = vi.spyOn(db, "releaseAnalysisQuota").mockResolvedValue();
    vi.spyOn(db, "getCreditUsageState").mockResolvedValue({ remainingCredits: 3, totalCredits: 3, creditsConsumed: 0 });
    vi.spyOn(db, "createContract").mockRejectedValue(new Error("db down"));

    const enqueued = enqueueAnalysisJob(
      {
        name: "Contract",
        text: "Some contract text with enough length",
        mode: "standard",
        contentType: "text",
      },
      99,
    );

    await new Promise((r) => setTimeout(r, 20));

    const status = getAnalysisJob(enqueued.jobId, 99);
    expect(status?.status).toBe("failed");
    expect(releaseSpy).toHaveBeenCalledTimes(1);
    expect(releaseSpy).toHaveBeenCalledWith(99);
  });
});
