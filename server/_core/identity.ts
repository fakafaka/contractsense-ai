import type { Request } from "express";
import type { User } from "../../drizzle/schema";
import * as db from "../db";

const ANON_DEVICE_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

function readDeviceId(req: Request): string | null {
  const headerValue = req.headers["x-device-id"];
  const fromHeader = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  const fromBody = typeof req.body?.deviceId === "string" ? req.body.deviceId : undefined;
  const candidate = (fromHeader || fromBody || "").trim();
  if (!candidate || !ANON_DEVICE_ID_PATTERN.test(candidate)) {
    return null;
  }
  return candidate;
}

export async function resolveEffectiveIdentity(req: Request, user: User | null): Promise<{
  deviceId: string | null;
  effectiveUserId: number | null;
  identityType: "authenticated" | "anonymous_device" | null;
}> {
  if (user?.id) {
    return {
      deviceId: null,
      effectiveUserId: user.id,
      identityType: "authenticated",
    };
  }

  const deviceId = readDeviceId(req);
  if (!deviceId) {
    return {
      deviceId: null,
      effectiveUserId: null,
      identityType: null,
    };
  }

  const anonOpenId = `anon:${deviceId}`;
  await db.upsertUser({
    openId: anonOpenId,
    name: null,
    email: null,
    loginMethod: "anonymous_device",
    lastSignedIn: new Date(),
  });
  const anonUser = await db.getUserByOpenId(anonOpenId);

  return {
    deviceId,
    effectiveUserId: anonUser?.id ?? null,
    identityType: anonUser?.id ? "anonymous_device" : null,
  };
}

