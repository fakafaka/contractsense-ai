import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Contracts table - stores uploaded contracts
export const contracts = mysqlTable("contracts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"), // Nullable - no authentication in MVP
  name: varchar("name", { length: 255 }).notNull(),
  contentType: mysqlEnum("contentType", ["pdf", "text", "images"]).notNull(),
  originalText: text("originalText").notNull(),
  fileUrl: varchar("fileUrl", { length: 512 }), // S3 URL for PDF files
  fileSize: int("fileSize"), // File size in bytes
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// Analyses table - stores AI-generated contract analyses
export const analyses = mysqlTable("analyses", {
  id: int("id").autoincrement().primaryKey(),
  contractId: int("contractId").notNull(),
  userId: int("userId"), // Nullable - no authentication in MVP
  
  // Analysis results
  summary: text("summary").notNull(), // Plain English summary
  mainObligations: text("mainObligations").notNull(), // JSON array of obligations
  potentialRisks: text("potentialRisks").notNull(), // JSON array of risks
  redFlags: text("redFlags").notNull(), // JSON array of red flags
  
  // Metadata
  analysisVersion: varchar("analysisVersion", { length: 16 }).default("1.0").notNull(),
  processingTimeMs: int("processingTimeMs").notNull().default(0), // Time taken to analyze, defaults to 0 if unavailable
  mode: mysqlEnum("mode", ["standard"]).default("standard").notNull(), // Single V1 analysis mode
  contentHash: varchar("contentHash", { length: 64 }), // SHA256 hash for deduplication
  deleteToken: varchar("deleteToken", { length: 64 }).notNull(), // Unique token for secure deletion
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// User subscription tracking
export const userSubscriptions = mysqlTable("userSubscriptions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  plan: mysqlEnum("plan", ["free", "premium"]).default("free").notNull(),
  analysesThisMonth: int("analysesThisMonth").default(0).notNull(),
  monthlyLimit: int("monthlyLimit").default(3).notNull(), // Free: 3, Premium: unlimited (-1)
  lastResetDate: timestamp("lastResetDate").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// Credit-based usage model (V1 source of truth for analysis consumption)
export const userCredits = mysqlTable("userCredits", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  freeCreditsGranted: int("freeCreditsGranted").default(3).notNull(),
  paidCreditsGranted: int("paidCreditsGranted").default(0).notNull(),
  creditsConsumed: int("creditsConsumed").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const iapPurchases = mysqlTable("iapPurchases", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  transactionId: varchar("transactionId", { length: 128 }).notNull().unique(),
  productId: varchar("productId", { length: 128 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Contract = typeof contracts.$inferSelect;
export type InsertContract = typeof contracts.$inferInsert;

export type Analysis = typeof analyses.$inferSelect;
export type InsertAnalysis = typeof analyses.$inferInsert;

export type UserSubscription = typeof userSubscriptions.$inferSelect;
export type InsertUserSubscription = typeof userSubscriptions.$inferInsert;
export type UserCredits = typeof userCredits.$inferSelect;
export type InsertUserCredits = typeof userCredits.$inferInsert;
export type IapPurchase = typeof iapPurchases.$inferSelect;
export type InsertIapPurchase = typeof iapPurchases.$inferInsert;
