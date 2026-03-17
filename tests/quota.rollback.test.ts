import { afterEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "../server/routers";
import type { TrpcContext } from "../server/_core/context";
import * as db from "../server/db";

function makeCtx(user: TrpcContext["user"]): TrpcContext {
  return {
    user,
    req: { headers: {}, socket: { remoteAddress: "127.0.0.1" } } as any,
    res: { clearCookie: () => {} } as any,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("quota rollback", () => {
  it("rolls back consumed quota when sync analyzeText fails", async () => {
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

    await expect(
      caller.contracts.analyzeText({
        name: "Contract",
        text: "Some contract text with enough length",
        mode: "quick",
      }),
    ).rejects.toThrow();

    expect(releaseSpy).toHaveBeenCalledWith(123);
  });
});
