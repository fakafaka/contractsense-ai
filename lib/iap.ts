export const IAP_PRODUCT_ID = "contractsense_5_credits";

let loadedProducts: any[] = [];

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
  // react-native-iap v14: getProducts was renamed to fetchProducts
  const fetchFn = iap.fetchProducts ?? iap.getProducts;
  if (!fetchFn) {
    console.error("[IAP] getIapProducts: neither fetchProducts nor getProducts found on iap module");
    return [];
  }
  try {
    const products = await fetchFn({ skus: [IAP_PRODUCT_ID] });
    console.log("[IAP] getIapProducts: received", products?.length ?? 0, "products:", JSON.stringify(products));
    if (!products || products.length === 0) {
      console.warn(
        "[IAP] getIapProducts: empty result — verify product ID '" + IAP_PRODUCT_ID + "' matches App Store Connect exactly, " +
        "the app bundle ID matches the IAP configuration, and the product is in 'Ready to Submit' or 'Approved' state.",
      );
    }
    loadedProducts = products ?? [];
    return loadedProducts;
  } catch (err: any) {
    console.error("[IAP] getIapProducts: error fetching products:", err?.message ?? err, "code:", err?.code);
    throw err;
  }
}

export async function requestFiveCreditsPurchase() {
  if (loadedProducts.length === 0) {
    throw new Error("Product not available. Please check your internet connection and try again.");
  }
  console.log("[IAP] requestFiveCreditsPurchase: requesting SKU:", IAP_PRODUCT_ID);
  const iap = getIapModule();
  // react-native-iap v14: requestPurchase API changed — platform-specific request is nested under `request.apple` for iOS
  const result = await iap.requestPurchase({
    request: {
      apple: { sku: IAP_PRODUCT_ID },
      google: { skus: [IAP_PRODUCT_ID] },
    },
    type: "in-app",
  });
  console.log("[IAP] requestFiveCreditsPurchase: result:", result);
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
