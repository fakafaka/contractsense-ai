import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { resolveEffectiveIdentity } from "./identity";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  deviceId: string | null;
  effectiveUserId: number | null;
  identityType: "authenticated" | "anonymous_device" | null;
};

export async function createContext(opts: CreateExpressContextOptions): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  const identity = await resolveEffectiveIdentity(opts.req, user);

  return {
    req: opts.req,
    res: opts.res,
    user,
    deviceId: identity.deviceId,
    effectiveUserId: identity.effectiveUserId,
    identityType: identity.identityType,
  };
}
