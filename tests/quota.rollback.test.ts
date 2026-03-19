import { afterEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "../server/routers";
import type { TrpcContext } from "../server/_core/context";
import * as db from "../server/db";
import * as queue from "../server/analysis-queue";

function makeCtx(user: TrpcContext["user"]): TrpcContext {
  return {
    user,
    deviceId: user ? null : "dev-test-12345678",
    effectiveUserId: user?.id ?? 999,
    identityType: user ? "authenticated" : "anonymous_device",
    req: { headers: {}, socket: { remoteAddress: "127.0.0.1" } } as any,
    res: { clearCookie: () => {} } as any,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("analysis usage state", () => {
  it("returns usage fields on analysis enqueue without immediate consumption", async () => {
    vi.spyOn(queue, "enqueueAnalysisJob").mockReturnValue({ jobId: "job-1", status: "pending", deduped: false } as any);
    vi.spyOn(db, "getCreditUsageState").mockResolvedValue({
      remainingCredits: 3,
      totalCredits: 3,
      creditsConsumed: 0,
    });

    const caller = appRouter.createCaller(
      makeCtx({
        id: 123,
        openId: "u-123",
        name: "User",
        email: "u@example.com",
        loginMethod: "email",
        role: "user",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      } as any),
    );

    const result = await caller.contracts.analyzeText({
      name: "Contract",
      text: "Some contract text with enough length",
      mode: "standard",
    });

    expect(result).toMatchObject({
      jobId: "job-1",
      creditConsumed: false,
      cacheHit: false,
      remainingCredits: 3,
    });
  });
});
