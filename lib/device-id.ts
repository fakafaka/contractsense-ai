import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const DEVICE_ID_KEY = "contractsense_device_id";

function createDeviceId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `dev-${Date.now().toString(36)}-${rand}`;
}

export async function getOrCreateDeviceId(): Promise<string> {
  if (Platform.OS === "web") {
    if (typeof window === "undefined") {
      return createDeviceId();
    }
    const existing = window.localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const created = createDeviceId();
    window.localStorage.setItem(DEVICE_ID_KEY, created);
    return created;
  }

  const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (existing) return existing;
  const created = createDeviceId();
  await SecureStore.setItemAsync(DEVICE_ID_KEY, created);
  return created;
}

