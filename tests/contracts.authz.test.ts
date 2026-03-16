import { describe, expect, it, vi, afterEach } from "vitest";
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
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("contracts authz", () => {
  it("rejects unauthenticated access to protected contracts.list", async () => {
    const caller = appRouter.createCaller(makeCtx(null));
    await expect(caller.contracts.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects unauthenticated access to getJobStatus", async () => {
    const caller = appRouter.createCaller(makeCtx(null));
    await expect(caller.contracts.getJobStatus({ jobId: "job-1" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });


  it("rejects unauthenticated access to cancelJob", async () => {
    const caller = appRouter.createCaller(makeCtx(null));
    await expect(caller.contracts.cancelJob({ jobId: "job-1" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("rejects unauthenticated access to verifyAppleReceipt", async () => {
    const caller = appRouter.createCaller(makeCtx(null));
    await expect(caller.contracts.verifyAppleReceipt({ receiptData: "dummy-receipt-payload" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("rejects unauthenticated access to subscriptionStatus", async () => {
    const caller = appRouter.createCaller(makeCtx(null));
    await expect(caller.contracts.subscriptionStatus()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("rejects deleting contract owned by another user", async () => {
    vi.spyOn(db, "getContractById").mockResolvedValue({
      id: 1,
      userId: 999,
      name: "Test",
      contentType: "text",
      originalText: "text",
      fileUrl: null,
      fileSize: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

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

    await expect(caller.contracts.delete({ contractId: 1 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("rejects deleteMyData when unauthenticated", async () => {
    const caller = appRouter.createCaller(makeCtx(null));
    await expect(caller.contracts.deleteMyData()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("deleteMyData deletes data for authenticated user", async () => {
    const deleteSpy = vi
      .spyOn(db, "deleteUserData")
      .mockResolvedValue({ analysesDeleted: 2, contractsDeleted: 1 });

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

    const result = await caller.contracts.deleteMyData();

    expect(deleteSpy).toHaveBeenCalledWith(123);
    expect(result).toEqual({ success: true, analysesDeleted: 2, contractsDeleted: 1 });
  });



  it("rejects adminSetSubscription for non-admin users", async () => {
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
      caller.contracts.adminSetSubscription({ userId: 999, plan: "premium" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("upgrades user to premium when verifyAppleReceipt is active", async () => {
    vi.stubEnv("APPLE_SHARED_SECRET", "secret");
    vi.stubEnv("IOS_SUBSCRIPTION_PRODUCT_ID", "contractsense.premium.monthly");
    vi.stubEnv("APPLE_BUNDLE_ID", "com.contractsense.app");
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 0,
          latest_receipt_info: [
            {
              product_id: "contractsense.premium.monthly",
              expires_date_ms: "1700000005000",
            },
          ],
        }),
      }),
    );

    const setPlanSpy = vi.spyOn(db, "setUserSubscriptionPlan").mockResolvedValue({
      id: 1,
      userId: 123,
      plan: "premium",
      analysesThisMonth: 0,
      monthlyLimit: -1,
      lastResetDate: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

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

    const result = await caller.contracts.verifyAppleReceipt({ receiptData: "dummy-receipt-payload" });

    expect(result).toEqual({ active: true, planUpdated: true, plan: "premium" });
    expect(setPlanSpy).toHaveBeenCalledWith(123, "premium", -1);
  });


  it("returns unchanged plan when verifyAppleReceipt is inactive", async () => {
    vi.stubEnv("APPLE_SHARED_SECRET", "secret");
    vi.stubEnv("IOS_SUBSCRIPTION_PRODUCT_ID", "contractsense.premium.monthly");
    vi.stubEnv("APPLE_BUNDLE_ID", "com.contractsense.app");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: 0, latest_receipt_info: [] }),
      }),
    );

    const setPlanSpy = vi.spyOn(db, "setUserSubscriptionPlan").mockResolvedValue({} as any);
    vi.spyOn(db, "getOrCreateUserSubscription").mockResolvedValue({
      id: 1,
      userId: 123,
      plan: "free",
      analysesThisMonth: 1,
      monthlyLimit: 3,
      lastResetDate: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

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

    const result = await caller.contracts.verifyAppleReceipt({ receiptData: "dummy-receipt-payload" });

    expect(result).toEqual({ active: false, planUpdated: false, plan: "free" });
    expect(setPlanSpy).not.toHaveBeenCalled();
  });

  it("allows adminSetSubscription for admins", async () => {
    const setPlanSpy = vi.spyOn(db, "setUserSubscriptionPlan").mockResolvedValue({
      id: 1,
      userId: 999,
      plan: "premium",
      analysesThisMonth: 0,
      monthlyLimit: -1,
      lastResetDate: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const caller = appRouter.createCaller(
      makeCtx({
        id: 1,
        openId: "admin-1",
        name: "Admin",
        email: "admin@example.com",
        loginMethod: "email",
        role: "admin",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      } as any),
    );

    const result = await caller.contracts.adminSetSubscription({ userId: 999, plan: "premium" });

    expect(setPlanSpy).toHaveBeenCalledWith(999, "premium", -1);
    expect(result).toMatchObject({ userId: 999, plan: "premium", monthlyLimit: -1 });
  });


  it("rejects invalid monthlyLimit values for adminSetSubscription", async () => {
    const caller = appRouter.createCaller(
      makeCtx({
        id: 1,
        openId: "admin-1",
        name: "Admin",
        email: "admin@example.com",
        loginMethod: "email",
        role: "admin",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      } as any),
    );

    await expect(
      caller.contracts.adminSetSubscription({ userId: 999, plan: "free", monthlyLimit: 0 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });


  it("returns basic quality score for free plan", async () => {
    vi.spyOn(db, "getAnalysisById").mockResolvedValue({
      id: 77,
      contractId: 1,
      userId: 123,
      summary: "This agreement outlines payment terms and termination conditions.",
      mainObligations: JSON.stringify(["The document states payment is due monthly", "The agreement indicates notice is required", "This clause requires confidentiality"]),
      potentialRisks: JSON.stringify([
        { title: "Late fee exposure", description: "Late fees may apply for delays", severity: "medium" },
        { title: "Short notice", description: "Termination notice window is narrow", severity: "high" },
        { title: "Broad indemnity", description: "One party may bear wide liability", severity: "high" },
      ]),
      redFlags: JSON.stringify([
        { category: "payment", title: "Automatic renewals", description: "Charges may continue automatically" },
        { category: "termination", title: "One-sided exit", description: "Only one side can terminate early" },
        { category: "liability", title: "Unlimited damages", description: "Liability cap may be missing" },
      ]),
      mode: "quick",
      contentHash: null,
      deleteToken: "t",
      analysisVersion: "1.0",
      processingTimeMs: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    vi.spyOn(db, "getOrCreateUserSubscription").mockResolvedValue({
      id: 1,
      userId: 123,
      plan: "free",
      analysesThisMonth: 0,
      monthlyLimit: 3,
      lastResetDate: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

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

    const result = await caller.contracts.analysisQuality({ analysisId: 77 });
    expect(result).toMatchObject({ premiumUnlocked: false });
    expect(typeof (result as any).score).toBe("number");
  });

  it("returns detailed quality coaching for premium plan", async () => {
    vi.spyOn(db, "getAnalysisById").mockResolvedValue({
      id: 78,
      contractId: 1,
      userId: 123,
      summary: "This agreement outlines payment terms and termination conditions with specific notice periods.",
      mainObligations: JSON.stringify(["The document states payment is due monthly", "The agreement indicates notice is required", "This clause requires confidentiality"]),
      potentialRisks: JSON.stringify([
        { title: "Late fee exposure", description: "Late fees may apply for delays", severity: "medium" },
        { title: "Short notice", description: "Termination notice window is narrow", severity: "high" },
        { title: "Broad indemnity", description: "One party may bear wide liability", severity: "high" },
      ]),
      redFlags: JSON.stringify([
        { category: "payment", title: "Automatic renewals", description: "Charges may continue automatically" },
        { category: "termination", title: "One-sided exit", description: "Only one side can terminate early" },
        { category: "liability", title: "Unlimited damages", description: "Liability cap may be missing" },
      ]),
      mode: "deep",
      contentHash: null,
      deleteToken: "t",
      analysisVersion: "1.0",
      processingTimeMs: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    vi.spyOn(db, "getOrCreateUserSubscription").mockResolvedValue({
      id: 1,
      userId: 123,
      plan: "premium",
      analysesThisMonth: 0,
      monthlyLimit: -1,
      lastResetDate: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

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

    const result = await caller.contracts.analysisQuality({ analysisId: 78 });
    expect(result).toMatchObject({ premiumUnlocked: true });
    expect(Array.isArray((result as any).suggestions)).toBe(true);
  });
  it("blocks deep mode for free users", async () => {
    vi.spyOn(db, "getOrCreateUserSubscription").mockResolvedValue({
      id: 1,
      userId: 123,
      plan: "free",
      analysesThisMonth: 0,
      monthlyLimit: 3,
      lastResetDate: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

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
      caller.contracts.enqueueTextAsync({
        name: "Contract",
        text: "Some contract text with enough length",
        mode: "deep",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
