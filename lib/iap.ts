export const IAP_PRODUCT_ID = "contractsense_5_credits";

type PurchaseEvent = {
  transactionId?: string;
  transactionReceipt?: string;
  transactionReceiptData?: string;
};

function getIapModule(): any {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("react-native-iap");
  } catch (error) {
    throw new Error(
      "react-native-iap native module is not available. Build a dev client (not Expo Go), run expo prebuild, and rebuild the app.",
    );
  }
}

export async function initIapConnection() {
  console.log("[IAP] initIapConnection: starting");
  const iap = getIapModule();
  const result = await iap.initConnection();
  console.log("[IAP] initIapConnection: complete, result:", result);
}

export async function endIapConnection() {
  const iap = getIapModule();
  if (typeof iap.endConnection === "function") {
    await iap.endConnection();
  }
}

export async function getIapProducts() {
  console.log("[IAP] getIapProducts: fetching SKUs:", [IAP_PRODUCT_ID]);
  const iap = getIapModule();
  const products = await iap.getProducts({ skus: [IAP_PRODUCT_ID] });
  console.log("[IAP] getIapProducts: received", products?.length ?? 0, "product(s)");
  if (products && products.length > 0) {
    products.forEach((p: any, i: number) => {
      console.log(`[IAP] getIapProducts: product[${i}] productId=${p.productId} title=${p.title} localizedPrice=${p.localizedPrice} type=${p.type}`);
    });
  } else {
    console.warn("[IAP] getIapProducts: EMPTY — product not returned by the store. Check that:");
    console.warn("[IAP]   1. The In-App Purchase ID in App Store Connect is exactly:", IAP_PRODUCT_ID);
    console.warn("[IAP]   2. The IAP is in 'Ready to Submit' or 'Approved' state (not 'Missing Metadata')");
    console.warn("[IAP]   3. You are signed in to a Sandbox tester account on the device");
    console.warn("[IAP]   4. The app bundle ID in App Store Connect matches the running build");
    console.warn("[IAP]   5. Agreements, Tax, and Banking are complete in App Store Connect");
  }
  return products;
}

export async function requestFiveCreditsPurchase() {
  console.log("[IAP] requestFiveCreditsPurchase: requesting SKU:", IAP_PRODUCT_ID);
  const iap = getIapModule();
  // react-native-iap v12+ uses andDangerouslyFinishTransactionAutomaticallyIOS: false
  const params = { sku: IAP_PRODUCT_ID, andDangerouslyFinishTransactionAutomaticallyIOS: false };
  console.log("[IAP] requestFiveCreditsPurchase: params:", JSON.stringify(params));
  const result = await iap.requestPurchase(params);
  console.log("[IAP] requestFiveCreditsPurchase: result:", JSON.stringify(result));
  return result;
}

export async function getRestorePurchases() {
  const iap = getIapModule();
  return iap.getAvailablePurchases();
}

export function purchaseUpdatedListener(listener: (purchase: PurchaseEvent) => Promise<void> | void) {
  const iap = getIapModule();
  return iap.purchaseUpdatedListener(listener);
}

export function purchaseErrorListener(listener: (error: { message?: string }) => void) {
  const iap = getIapModule();
  return iap.purchaseErrorListener(listener);
}

export async function finishIapTransaction(purchase: PurchaseEvent) {
  const iap = getIapModule();
  await iap.finishTransaction({ purchase, isConsumable: true });
}
