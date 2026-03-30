import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const DEVICE_ID_KEY = "contractsense_device_id";
const DEVICE_ID_FALLBACK_KEY = "contractsense_device_id_fallback";

let cachedDeviceId: string | null = null;
let pendingDeviceIdPromise: Promise<string> | null = null;

function createDeviceId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `dev-${Date.now().toString(36)}-${rand}`;
}

async function readSecureDeviceId(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(DEVICE_ID_KEY);
  } catch (error) {
    console.warn("[DeviceId] SecureStore read failed; falling back to AsyncStorage", error);
    return null;
  }
}

async function writeSecureDeviceId(deviceId: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId);
  } catch (error) {
    console.warn("[DeviceId] SecureStore write failed; retaining AsyncStorage fallback", error);
  }
}

async function readFallbackDeviceId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(DEVICE_ID_FALLBACK_KEY);
  } catch (error) {
    console.warn("[DeviceId] AsyncStorage read failed", error);
    return null;
  }
}

async function writeFallbackDeviceId(deviceId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(DEVICE_ID_FALLBACK_KEY, deviceId);
  } catch (error) {
    console.warn("[DeviceId] AsyncStorage write failed", error);
  }
}

export async function getOrCreateDeviceId(): Promise<string> {
  if (cachedDeviceId) {
    return cachedDeviceId;
  }

  if (Platform.OS === "web") {
    if (typeof window === "undefined") {
      cachedDeviceId = createDeviceId();
      return cachedDeviceId;
    }

    const existing = window.localStorage.getItem(DEVICE_ID_KEY);
    if (existing) {
      cachedDeviceId = existing;
      return existing;
    }

    const created = createDeviceId();
    window.localStorage.setItem(DEVICE_ID_KEY, created);
    cachedDeviceId = created;
    return created;
  }

  if (!pendingDeviceIdPromise) {
    pendingDeviceIdPromise = (async () => {
      const secureId = await readSecureDeviceId();
      if (secureId) {
        cachedDeviceId = secureId;
        await writeFallbackDeviceId(secureId);
        return secureId;
      }

      const fallbackId = await readFallbackDeviceId();
      if (fallbackId) {
        cachedDeviceId = fallbackId;
        await writeSecureDeviceId(fallbackId);
        return fallbackId;
      }

      const created = createDeviceId();
      cachedDeviceId = created;
      await Promise.all([writeSecureDeviceId(created), writeFallbackDeviceId(created)]);
      return created;
    })().finally(() => {
      pendingDeviceIdPromise = null;
    });
  }

  return pendingDeviceIdPromise;
}
