import { TRPCError } from "@trpc/server";

const APPLE_VERIFY_RECEIPT_PROD = "https://buy.itunes.apple.com/verifyReceipt";
const APPLE_VERIFY_RECEIPT_SANDBOX = "https://sandbox.itunes.apple.com/verifyReceipt";

type AppleReceiptInApp = {
  product_id?: string;
  expires_date_ms?: string;
};

type AppleReceiptResponse = {
  status: number;
  receipt?: {
    in_app?: AppleReceiptInApp[];
    bundle_id?: string;
  };
  latest_receipt_info?: AppleReceiptInApp[];
  pending_renewal_info?: Array<Record<string, unknown>>;
};

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `${name} is not configured`,
    });
  }
  return value;
}

async function callAppleVerifyReceipt(url: string, receiptData: string): Promise<AppleReceiptResponse> {
  const sharedSecret = requiredEnv("APPLE_SHARED_SECRET");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      "receipt-data": receiptData,
      password: sharedSecret,
      "exclude-old-transactions": true,
    }),
  });

  if (!response.ok) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Apple verifyReceipt failed with HTTP ${response.status}`,
    });
  }

  return (await response.json()) as AppleReceiptResponse;
}

function ensureBundleIdMatch(receipt: AppleReceiptResponse, expectedBundleId: string) {
  const bundleId = receipt.receipt?.bundle_id;
  if (bundleId && bundleId !== expectedBundleId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Receipt bundle id does not match app bundle id",
    });
  }
}

function hasActiveSubscription(receipt: AppleReceiptResponse, productId: string): boolean {
  const now = Date.now();
  const allTransactions = [
    ...(receipt.latest_receipt_info || []),
    ...(receipt.receipt?.in_app || []),
  ];

  return allTransactions.some((item) => {
    if (item.product_id !== productId) return false;
    const expiresMs = Number(item.expires_date_ms || "0");
    return Number.isFinite(expiresMs) && expiresMs > now;
  });
}

export async function verifyAppleSubscriptionReceipt(receiptData: string): Promise<{ active: boolean }> {
  if (!receiptData || receiptData.trim().length < 10) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid receipt payload" });
  }

  const expectedProductId = requiredEnv("IOS_SUBSCRIPTION_PRODUCT_ID");
  const expectedBundleId = requiredEnv("APPLE_BUNDLE_ID");

  let result = await callAppleVerifyReceipt(APPLE_VERIFY_RECEIPT_PROD, receiptData);

  // Sandbox receipt sent to production endpoint.
  if (result.status === 21007) {
    result = await callAppleVerifyReceipt(APPLE_VERIFY_RECEIPT_SANDBOX, receiptData);
  }

  if (result.status !== 0) {
    return { active: false };
  }

  ensureBundleIdMatch(result, expectedBundleId);

  return {
    active: hasActiveSubscription(result, expectedProductId),
  };
}
