import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

type DeviceIdMocks = {
  secureGet: ReturnType<typeof vi.fn>;
  secureSet: ReturnType<typeof vi.fn>;
  asyncGet: ReturnType<typeof vi.fn>;
  asyncSet: ReturnType<typeof vi.fn>;
};

async function loadDeviceIdWithMocks(setup: (mocks: DeviceIdMocks) => void) {
  const mocks: DeviceIdMocks = {
    secureGet: vi.fn(),
    secureSet: vi.fn(),
    asyncGet: vi.fn(),
    asyncSet: vi.fn(),
  };

  setup(mocks);

  vi.doMock("react-native", () => ({
    Platform: { OS: "ios" },
  }));

  vi.doMock("expo-secure-store", () => ({
    getItemAsync: mocks.secureGet,
    setItemAsync: mocks.secureSet,
  }));

  vi.doMock("@react-native-async-storage/async-storage", () => ({
    default: {
      getItem: mocks.asyncGet,
      setItem: mocks.asyncSet,
    },
  }));

  const deviceId = await import("../lib/device-id");
  return { deviceId, mocks };
}

describe("getOrCreateDeviceId", () => {
  it("returns one stable id for concurrent calls", async () => {
    const { deviceId, mocks } = await loadDeviceIdWithMocks(({ secureGet, asyncGet, secureSet, asyncSet }) => {
      secureGet.mockResolvedValue(null);
      asyncGet.mockResolvedValue(null);
      secureSet.mockResolvedValue(undefined);
      asyncSet.mockResolvedValue(undefined);
    });

    const [a, b, c] = await Promise.all([
      deviceId.getOrCreateDeviceId(),
      deviceId.getOrCreateDeviceId(),
      deviceId.getOrCreateDeviceId(),
    ]);

    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(a).toMatch(/^dev-/);
    expect(mocks.secureGet).toHaveBeenCalledTimes(1);
    expect(mocks.asyncGet).toHaveBeenCalledTimes(1);
    expect(mocks.secureSet).toHaveBeenCalledTimes(1);
    expect(mocks.asyncSet).toHaveBeenCalledTimes(1);
  });

  it("reuses AsyncStorage id when SecureStore is empty", async () => {
    const existingId = "dev-existing-12345678";
    const { deviceId, mocks } = await loadDeviceIdWithMocks(({ secureGet, asyncGet, secureSet, asyncSet }) => {
      secureGet.mockResolvedValue(null);
      asyncGet.mockResolvedValue(existingId);
      secureSet.mockResolvedValue(undefined);
      asyncSet.mockResolvedValue(undefined);
    });

    const resolved = await deviceId.getOrCreateDeviceId();

    expect(resolved).toBe(existingId);
    expect(mocks.secureSet).toHaveBeenCalledWith("contractsense_device_id", existingId);
    expect(mocks.asyncSet).not.toHaveBeenCalled();
  });
});
