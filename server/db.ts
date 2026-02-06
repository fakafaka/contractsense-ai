import { eq, desc, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { 
  InsertUser, 
  users,
  contracts,
  analyses,
  userSubscriptions,
  type Contract,
  type Analysis,
  type InsertContract,
  type InsertAnalysis,
  type UserSubscription,
  type InsertUserSubscription
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ============================================
// Contract Operations
// ============================================

export async function createContract(data: InsertContract): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(contracts).values(data) as any;
  return Number(result.insertId);
}

export async function getContractById(contractId: number): Promise<Contract | null> {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.select().from(contracts).where(eq(contracts.id, contractId)).limit(1);
  return result[0] || null;
}

export async function getUserContracts(userId: number): Promise<Contract[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(contracts).where(eq(contracts.userId, userId)).orderBy(desc(contracts.createdAt));
}

export async function deleteContract(contractId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Delete associated analyses first
  await db.delete(analyses).where(eq(analyses.contractId, contractId));
  
  // Delete contract
  await db.delete(contracts).where(eq(contracts.id, contractId));
}

// ============================================
// Analysis Operations
// ============================================

export async function createAnalysis(data: InsertAnalysis): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // ABSOLUTE LAST-LINE DEFENSE: Aggressively sanitize all numeric fields to guarantee NaN can never reach DB
  console.log('[createAnalysis] BEFORE SANITIZATION:', { contractId: data.contractId, processingTimeMs: data.processingTimeMs });
  
  // Sanitize processingTimeMs
  const pt = Number(data.processingTimeMs);
  data.processingTimeMs = Number.isFinite(pt) ? Math.floor(pt) : 0;
  
  // Sanitize contractId
  const cid = Number(data.contractId);
  data.contractId = Number.isFinite(cid) ? cid : 0;
  
  console.log('[createAnalysis] AFTER SANITIZATION:', { contractId: data.contractId, processingTimeMs: data.processingTimeMs });

  // Log the exact data being inserted
  console.log('[createAnalysis data]', JSON.stringify({
    contractId: data.contractId,
    userId: data.userId,
    processingTimeMs: data.processingTimeMs,
    processingTimeType: typeof data.processingTimeMs,
    isNaN: isNaN(data.processingTimeMs as any),
    isFinite: Number.isFinite(data.processingTimeMs),
    summaryLen: data.summary?.length,
    fullData: data
  }, null, 2));
  
  const result = await db.insert(analyses).values(data) as any;
  return Number(result.insertId);
}

export async function getAnalysisById(analysisId: number): Promise<Analysis | null> {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.select().from(analyses).where(eq(analyses.id, analysisId)).limit(1);
  return result[0] || null;
}

export async function getAnalysisByContractId(contractId: number): Promise<Analysis | null> {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.select().from(analyses).where(eq(analyses.contractId, contractId)).limit(1);
  return result[0] || null;
}

export async function getUserAnalyses(userId: number): Promise<Analysis[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(analyses).where(eq(analyses.userId, userId)).orderBy(desc(analyses.createdAt));
}

export async function deleteAnalysis(analysisId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.delete(analyses).where(eq(analyses.id, analysisId));
}

// ============================================
// Subscription Operations
// ============================================

export async function getUserSubscription(userId: number): Promise<UserSubscription | null> {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.select().from(userSubscriptions).where(eq(userSubscriptions.userId, userId)).limit(1);
  return result[0] || null;
}

export async function createUserSubscription(data: InsertUserSubscription): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(userSubscriptions).values(data) as any;
  return Number(result.insertId);
}

export async function incrementAnalysisCount(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Get current subscription
  const subscription = await getUserSubscription(userId);
  
  if (!subscription) {
    // Create new subscription if doesn't exist
    await createUserSubscription({
      userId,
      plan: "free",
      analysesThisMonth: 1,
      monthlyLimit: 3,
      lastResetDate: new Date(),
    });
    return;
  }
  
  // Check if we need to reset the counter (new month)
  const now = new Date();
  const lastReset = new Date(subscription.lastResetDate);
  const isNewMonth = now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear();
  
  if (isNewMonth) {
    // Reset counter for new month
    await db.update(userSubscriptions)
      .set({ 
        analysesThisMonth: 1, 
        lastResetDate: now 
      })
      .where(eq(userSubscriptions.userId, userId));
  } else {
    // Increment counter
    await db.update(userSubscriptions)
      .set({ 
        analysesThisMonth: subscription.analysesThisMonth + 1 
      })
      .where(eq(userSubscriptions.userId, userId));
  }
}

export async function canUserAnalyze(userId: number): Promise<{ canAnalyze: boolean; remaining: number; limit: number }> {
  const subscription = await getUserSubscription(userId);
  
  if (!subscription) {
    // New user, can analyze
    return { canAnalyze: true, remaining: 3, limit: 3 };
  }
  
  // Check if we need to reset the counter (new month)
  const now = new Date();
  const lastReset = new Date(subscription.lastResetDate);
  const isNewMonth = now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear();
  
  if (isNewMonth) {
    // New month, reset counter
    return { canAnalyze: true, remaining: subscription.monthlyLimit, limit: subscription.monthlyLimit };
  }
  
  // Premium users have unlimited analyses
  if (subscription.plan === "premium" || subscription.monthlyLimit === -1) {
    return { canAnalyze: true, remaining: -1, limit: -1 };
  }
  
  const remaining = subscription.monthlyLimit - subscription.analysesThisMonth;
  return { 
    canAnalyze: remaining > 0, 
    remaining: Math.max(0, remaining), 
    limit: subscription.monthlyLimit 
  };
}

// ============================================
// Combined Operations
// ============================================

export interface ContractWithAnalysis {
  contract: Contract;
  analysis: Analysis | null;
}

export async function getUserContractsWithAnalyses(userId: number): Promise<ContractWithAnalysis[]> {
  const db = await getDb();
  if (!db) return [];
  
  const userContracts = await getUserContracts(userId);
  
  const results: ContractWithAnalysis[] = [];
  for (const contract of userContracts) {
    const analysis = await getAnalysisByContractId(contract.id);
    results.push({ contract, analysis });
  }
  
  return results;
}

export async function getAllContractsWithAnalyses(): Promise<ContractWithAnalysis[]> {
  const db = await getDb();
  if (!db) return [];
  
  const allContracts = await db.select().from(contracts).orderBy(desc(contracts.createdAt));
  
  const results: ContractWithAnalysis[] = [];
  for (const contract of allContracts) {
    const analysis = await getAnalysisByContractId(contract.id);
    results.push({ contract, analysis });
  }
  
  return results;
}
