import { TRPCError } from "@trpc/server";

export const IAP_PRODUCT_ID = "contractsense_5_credits";
export const IAP_CREDITS_PER_PURCHASE = 5;

const APPLE_VERIFY_RECEIPT_PROD = "https://buy.itunes.apple.com/verifyReceipt";
const APPLE_VERIFY_RECEIPT_SANDBOX = "https://sandbox.itunes.apple.com/verifyReceipt";

type AppleInAppPurchase = {
  product_id?: string;
  transaction_id?: string;
  original_transaction_id?: string;
  purchase_date_ms?: string;
};

type AppleVerifyReceiptResponse = {
  status: number;
  receipt?: {
    bundle_id?: string;
    in_app?: AppleInAppPurchase[];
  };
  latest_receipt_info?: AppleInAppPurchase[];
};

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `${name} is not configured` });
  }
  return value;
}

async function callAppleVerifyReceipt(url: string, receiptData: string): Promise<AppleVerifyReceiptResponse> {
  const sharedSecret = requiredEnv("APPLE_SHARED_SECRET");
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      "receipt-data": receiptData,
      password: sharedSecret,
      "exclude-old-transactions": false,
    }),
  });

  if (!response.ok) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Apple verifyReceipt failed with HTTP ${response.status}` });
  }

  return (await response.json()) as AppleVerifyReceiptResponse;
}

function getAllPurchases(payload: AppleVerifyReceiptResponse): AppleInAppPurchase[] {
  return [...(payload.latest_receipt_info || []), ...(payload.receipt?.in_app || [])];
}

export async function validateAppleConsumableReceipt(receiptData: string, productId: string) {
  if (!receiptData || receiptData.trim().length < 10) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid receipt payload" });
  }
  if (productId !== IAP_PRODUCT_ID) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Unsupported product ID" });
  }

  let payload = await callAppleVerifyReceipt(APPLE_VERIFY_RECEIPT_PROD, receiptData);
  if (payload.status === 21007) {
    payload = await callAppleVerifyReceipt(APPLE_VERIFY_RECEIPT_SANDBOX, receiptData);
  }

  if (payload.status !== 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Receipt validation failed" });
  }

  const expectedBundleId = requiredEnv("APPLE_BUNDLE_ID");
  const bundleId = payload.receipt?.bundle_id;
  if (bundleId && bundleId !== expectedBundleId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Receipt bundle id mismatch" });
  }

  const purchase = getAllPurchases(payload).find((item) => item.product_id === productId);
  if (!purchase) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "No matching product found in receipt" });
  }

  const transactionId = purchase.transaction_id || purchase.original_transaction_id;
  if (!transactionId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Receipt transaction id missing" });
  }

  return {
    transactionId,
    productId,
  };
}
