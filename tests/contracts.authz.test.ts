import { afterEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "../server/routers";
import type { TrpcContext } from "../server/_core/context";
import * as db from "../server/db";
import * as queue from "../server/analysis-queue";
import * as analyzer from "../server/contract-analyzer";
import * as storage from "../server/storage";

function makeCtx(user: TrpcContext["user"]): TrpcContext {
  return {
    user,
    req: { headers: {}, socket: { remoteAddress: "127.0.0.1" } } as any,
    res: { clearCookie: () => {} } as any,
  };
}

const user = {
  id: 123,
  openId: "u-123",
  name: "User",
  email: "u@example.com",
  loginMethod: "email",
  role: "user",
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
} as any;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("contracts authz + v1 usage", () => {
  it("rejects unauthenticated usageStatus access", async () => {
    const caller = appRouter.createCaller(makeCtx(null));
    await expect(caller.contracts.usageStatus()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("enforces admin role for adminUsageStatus", async () => {
    const caller = appRouter.createCaller(makeCtx(user));
    await expect(caller.contracts.adminUsageStatus({ userId: 999 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns usage state for upload screen", async () => {
    vi.spyOn(db, "getCreditUsageState").mockResolvedValue({
      remainingCredits: 2,
      totalCredits: 3,
      creditsConsumed: 1,
    });

    const caller = appRouter.createCaller(makeCtx(user));
    const result = await caller.contracts.usageStatus();
    expect(result).toEqual({ remainingCredits: 2, totalCredits: 3, creditsConsumed: 1 });
  });

  it("returns enqueue response with usage/cache/credit fields", async () => {
    vi.spyOn(queue, "enqueueAnalysisJob").mockReturnValue({ jobId: "job-a", status: "pending", deduped: false } as any);
    vi.spyOn(db, "getCreditUsageState").mockResolvedValue({
      remainingCredits: 3,
      totalCredits: 3,
      creditsConsumed: 0,
    });

    const caller = appRouter.createCaller(makeCtx(user));
    const result = await caller.contracts.enqueueTextAsync({
      name: "Contract",
      text: "Some contract text with enough length",
      mode: "standard",
    });

    expect(result).toMatchObject({
      jobId: "job-a",
      deduped: false,
      cacheHit: false,
      creditConsumed: false,
      remainingCredits: 3,
    });
  });

  it("fills usage fields in getJobStatus when job has no usage snapshot", async () => {
    vi.spyOn(queue, "getAnalysisJob").mockReturnValue({
      jobId: "job-z",
      status: "pending",
      creditConsumed: false,
      cacheHit: false,
      remainingCredits: undefined,
    } as any);
    vi.spyOn(db, "getCreditUsageState").mockResolvedValue({
      remainingCredits: 1,
      totalCredits: 3,
      creditsConsumed: 2,
    });

    const caller = appRouter.createCaller(makeCtx(user));
    const result = await caller.contracts.getJobStatus({ jobId: "job-z" });
    expect(result).toMatchObject({
      jobId: "job-z",
      status: "pending",
      cacheHit: false,
      creditConsumed: false,
      remainingCredits: 1,
    });
  });

  it("returns analysis quality without subscription assumptions", async () => {
    vi.spyOn(db, "getAnalysisById").mockResolvedValue({
      id: 1,
      userId: 123,
      contractId: 5,
      summary: "Short summary",
      mainObligations: JSON.stringify(["One", "Two", "Three"]),
      potentialRisks: JSON.stringify([
        { title: "Risk 1", description: "Desc", severity: "low" },
        { title: "Risk 2", description: "Desc", severity: "medium" },
        { title: "Risk 3", description: "Desc", severity: "high" },
      ]),
      redFlags: JSON.stringify([
        { category: "other", title: "Flag 1", description: "Desc" },
        { category: "other", title: "Flag 2", description: "Desc" },
        { category: "other", title: "Flag 3", description: "Desc" },
      ]),
    } as any);

    const caller = appRouter.createCaller(makeCtx(user));
    const result = await caller.contracts.analysisQuality({ analysisId: 1 });
    expect(typeof result.score).toBe("number");
    expect(result).toHaveProperty("checks");
    expect(Array.isArray(result.suggestions)).toBe(true);
    expect((result as any).premiumUnlocked).toBeUndefined();
  });

  it("rejects too many images before enqueueing", async () => {
    const enqueueSpy = vi.spyOn(queue, "enqueueAnalysisJob");
    const caller = appRouter.createCaller(makeCtx(user));
    const tooManyImages = Array.from({ length: 11 }).map((_, idx) => ({
      base64: Buffer.from(`image-${idx}-very-long-content-for-testing`).toString("base64"),
      mimeType: "image/jpeg",
      size: 1000,
    }));

    await expect(
      caller.contracts.enqueueDocumentAsync({
        name: "Photo Contract",
        inputType: "images",
        images: tooManyImages,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(enqueueSpy).not.toHaveBeenCalled();
  });

  it("rejects unreadable OCR output before enqueueing", async () => {
    vi.spyOn(storage, "storagePut").mockResolvedValue({ url: "https://example.com/img.jpg", key: "img", size: 100 } as any);
    vi.spyOn(analyzer, "extractTextFromImages").mockResolvedValue("too short");
    const enqueueSpy = vi.spyOn(queue, "enqueueAnalysisJob");
    const caller = appRouter.createCaller(makeCtx(user));

    await expect(
      caller.contracts.enqueueDocumentAsync({
        name: "Photo Contract",
        inputType: "images",
        images: [
          {
            base64: Buffer.from("image-1-very-long-content-for-testing").toString("base64"),
            mimeType: "image/jpeg",
            size: 1000,
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(enqueueSpy).not.toHaveBeenCalled();
  });
});
