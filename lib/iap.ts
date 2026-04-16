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
  console.log("[IAP] getIapProducts: received", products?.length ?? 0, "products:", JSON.stringify(products));
  return products;
}

export async function requestFiveCreditsPurchase() {
  console.log("[IAP] requestFiveCreditsPurchase: requesting SKU:", IAP_PRODUCT_ID);
  const iap = getIapModule();
  const result = await iap.requestPurchase({ sku: IAP_PRODUCT_ID });
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
