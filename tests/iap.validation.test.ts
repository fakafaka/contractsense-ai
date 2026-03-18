import { afterEach, describe, expect, it, vi } from "vitest";
import { IAP_PRODUCT_ID, validateAppleConsumableReceipt } from "../server/iap";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("iap receipt validation", () => {
  it("validates consumable receipt via production response", async () => {
    vi.stubEnv("APPLE_SHARED_SECRET", "secret");
    vi.stubEnv("APPLE_BUNDLE_ID", "ai.contractsense.app");

    vi.spyOn(global, "fetch" as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 0,
        receipt: {
          bundle_id: "ai.contractsense.app",
          in_app: [{ product_id: IAP_PRODUCT_ID, transaction_id: "tx-1" }],
        },
      }),
    } as any);

    const result = await validateAppleConsumableReceipt("dummy-receipt-payload", IAP_PRODUCT_ID);
    expect(result).toEqual({ transactionId: "tx-1", productId: IAP_PRODUCT_ID });
  });

  it("falls back to sandbox for 21007", async () => {
    vi.stubEnv("APPLE_SHARED_SECRET", "secret");
    vi.stubEnv("APPLE_BUNDLE_ID", "ai.contractsense.app");

    const fetchMock = vi.spyOn(global, "fetch" as any);
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ status: 21007 }) } as any);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 0,
        receipt: { bundle_id: "ai.contractsense.app", in_app: [{ product_id: IAP_PRODUCT_ID, transaction_id: "tx-2" }] },
      }),
    } as any);

    const result = await validateAppleConsumableReceipt("dummy-receipt-payload", IAP_PRODUCT_ID);
    expect(result.transactionId).toBe("tx-2");
  });
});
