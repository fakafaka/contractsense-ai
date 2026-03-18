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
  const iap = getIapModule();
  await iap.initConnection();
}

export async function endIapConnection() {
  const iap = getIapModule();
  if (typeof iap.endConnection === "function") {
    await iap.endConnection();
  }
}

export async function getIapProducts() {
  const iap = getIapModule();
  return iap.getProducts({ skus: [IAP_PRODUCT_ID] });
}

export async function requestFiveCreditsPurchase() {
  const iap = getIapModule();
  return iap.requestPurchase({ sku: IAP_PRODUCT_ID });
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
