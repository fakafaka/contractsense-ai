import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyAppleSubscriptionReceipt } from "../server/billing";

function setBillingEnv() {
  vi.stubEnv("APPLE_SHARED_SECRET", "secret");
  vi.stubEnv("IOS_SUBSCRIPTION_PRODUCT_ID", "contractsense.premium.monthly");
  vi.stubEnv("APPLE_BUNDLE_ID", "com.contractsense.app");
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("verifyAppleSubscriptionReceipt", () => {
  it("returns active=true when production verification is successful", async () => {
    setBillingEnv();
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

    const result = await verifyAppleSubscriptionReceipt("dummy-receipt-payload");
    expect(result).toEqual({ active: true });
  });

  it("falls back to sandbox when production returns 21007", async () => {
    setBillingEnv();
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 21007 }) })
      .mockResolvedValueOnce({
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
      });

    vi.stubGlobal("fetch", fetchMock);

    const result = await verifyAppleSubscriptionReceipt("dummy-receipt-payload");

    expect(result).toEqual({ active: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toContain("sandbox.itunes.apple.com");
  });

  it("returns inactive when receipt is valid but expired", async () => {
    setBillingEnv();
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
              expires_date_ms: "1699999999000",
            },
          ],
        }),
      }),
    );

    const result = await verifyAppleSubscriptionReceipt("dummy-receipt-payload");
    expect(result).toEqual({ active: false });
  });

  it("rejects receipt when bundle id mismatches", async () => {
    setBillingEnv();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 0,
          receipt: {
            bundle_id: "com.other.app",
            in_app: [],
          },
        }),
      }),
    );

    await expect(verifyAppleSubscriptionReceipt("dummy-receipt-payload")).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Receipt bundle id does not match app bundle id",
    });
  });

  it("throws on missing required env", async () => {
    vi.stubEnv("IOS_SUBSCRIPTION_PRODUCT_ID", "contractsense.premium.monthly");
    vi.stubEnv("APPLE_BUNDLE_ID", "com.contractsense.app");
    vi.stubGlobal("fetch", vi.fn());

    await expect(verifyAppleSubscriptionReceipt("dummy-receipt-payload")).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "APPLE_SHARED_SECRET is not configured",
    });
  });
});
