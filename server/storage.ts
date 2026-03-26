import fs from "node:fs/promises";
import path from "node:path";

export const LOCAL_UPLOADS_PUBLIC_PATH = "/uploads";

function normalizeKey(relKey: string): string {
  const normalized = relKey.replace(/^\/+/, "").replace(/\\/g, "/");
  const safeParts = normalized.split("/").filter((part) => part && part !== "." && part !== "..");
  if (safeParts.length === 0) {
    throw new Error("Invalid storage key");
  }
  return safeParts.join("/");
}

export function getUploadsRootDir(): string {
  return process.env.LOCAL_UPLOADS_DIR?.trim() || path.join(process.cwd(), "uploads");
}

function getPublicBaseUrl(): string {
  const base =
    process.env.STORAGE_PUBLIC_BASE_URL?.trim() ||
    process.env.EXPO_PUBLIC_API_BASE_URL?.trim() ||
    `http://${process.env.HOST || "0.0.0.0"}:${process.env.PORT || "3000"}`;
  return base.replace(/\/+$/, "");
}

function buildPublicUrl(key: string): string {
  return `${getPublicBaseUrl()}${LOCAL_UPLOADS_PUBLIC_PATH}/${key}`;
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  _contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  const uploadsRoot = getUploadsRootDir();
  const fullPath = path.join(uploadsRoot, key);

  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, data);

  return {
    key,
    url: buildPublicUrl(key),
  };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  const uploadsRoot = getUploadsRootDir();
  const fullPath = path.join(uploadsRoot, key);
  await fs.access(fullPath);
  return {
    key,
    url: buildPublicUrl(key),
  };
}