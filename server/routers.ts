import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import * as db from "./db";
import { analyzeContract, evaluateAnalysisQuality, extractTextFromPDF, computeContentHash } from "./contract-analyzer";
import { storagePut } from "./storage";
import { checkRateLimit, checkIdempotency, saveIdempotency } from "./rate-limiter";
import { cancelAnalysisJob, enqueueAnalysisJob, getAnalysisJob } from "./analysis-queue";
import { verifyAppleSubscriptionReceipt } from "./billing";


function ensureAdmin(user: { role?: string }) {
  if (user.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Admin access required",
    });
  }
}

async function ensureModeAllowed(userId: number, mode: "quick" | "deep") {
  if (mode !== "deep") return;
  const subscription = await db.getOrCreateUserSubscription(userId);
  if (subscription.plan !== "premium") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Deep analysis is a premium feature. Please upgrade your plan.",
    });
  }
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // Contract analysis features
  contracts: router({
    enqueueTextAsync: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1).max(255),
          text: z.string().min(10),
          mode: z.enum(["quick", "deep"]).optional().default("quick"),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        await ensureModeAllowed(ctx.user.id, input.mode);
        return enqueueAnalysisJob(
          {
            name: input.name,
            text: input.text,
            mode: input.mode,
            contentType: "text",
          },
          ctx.user.id,
        );
      }),

    enqueuePDFAsync: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1).max(255),
          pdfBase64: z.string(),
          fileSize: z.number(),
          mode: z.enum(["quick", "deep"]).optional().default("quick"),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        await ensureModeAllowed(ctx.user.id, input.mode);
        if (input.fileSize > 10 * 1024 * 1024) {
          throw new Error("PDF file size must be less than 10MB");
        }

        const pdfBuffer = Buffer.from(input.pdfBase64, "base64");
        const text = await extractTextFromPDF(pdfBuffer);
        if (!text || text.length < 10) {
          throw new Error("Could not extract text from PDF. Please try uploading as text instead.");
        }

        const fileKey = `contracts/${ctx.user.id}/${Date.now()}-${input.name}`;
        const { url: fileUrl } = await storagePut(fileKey, pdfBuffer, "application/pdf");

        return enqueueAnalysisJob(
          {
            name: input.name,
            text,
            mode: input.mode,
            contentType: "pdf",
            fileUrl,
            fileSize: input.fileSize,
          },
          ctx.user.id,
        );
      }),

    getJobStatus: protectedProcedure
      .input(z.object({ jobId: z.string().min(1) }))
      .query(({ input, ctx }) => {
        const job = getAnalysisJob(input.jobId, ctx.user.id);
        if (!job) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
        }
        return job;
      }),


    adminSetSubscription: protectedProcedure
      .input(
        z.object({
          userId: z.number().int().positive(),
          plan: z.enum(["free", "premium"]),
          monthlyLimit: z.number().int().optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        ensureAdmin(ctx.user);

        const nextLimit =
          input.monthlyLimit !== undefined
            ? input.monthlyLimit
            : input.plan === "premium"
              ? -1
              : 3;

        if (nextLimit === 0 || nextLimit < -1) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "monthlyLimit must be -1 or a positive integer",
          });
        }

        const subscription = await db.setUserSubscriptionPlan(input.userId, input.plan, nextLimit);
        return {
          userId: subscription.userId,
          plan: subscription.plan,
          monthlyLimit: subscription.monthlyLimit,
          analysesThisMonth: subscription.analysesThisMonth,
          lastResetDate: subscription.lastResetDate,
        };
      }),

    verifyAppleReceipt: protectedProcedure
      .input(
        z.object({
          receiptData: z.string().min(10),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const verification = await verifyAppleSubscriptionReceipt(input.receiptData);

        if (!verification.active) {
          const subscription = await db.getOrCreateUserSubscription(ctx.user.id);
          return {
            active: false as const,
            planUpdated: false as const,
            plan: subscription.plan,
          };
        }

        const subscription = await db.setUserSubscriptionPlan(ctx.user.id, "premium", -1);
        return {
          active: true as const,
          planUpdated: true as const,
          plan: subscription.plan,
        };
      }),

    subscriptionStatus: protectedProcedure.query(async ({ ctx }) => {
      const subscription = await db.getUserSubscription(ctx.user.id);
      if (!subscription) {
        return {
          plan: "free" as const,
          analysesThisMonth: 0,
          monthlyLimit: 3,
          remaining: 3,
        };
      }

      const unlimited = subscription.monthlyLimit < 0 || subscription.plan === "premium";
      return {
        plan: subscription.plan,
        analysesThisMonth: subscription.analysesThisMonth,
        monthlyLimit: subscription.monthlyLimit,
        remaining: unlimited ? -1 : Math.max(0, subscription.monthlyLimit - subscription.analysesThisMonth),
      };
    }),

    cancelJob: protectedProcedure
      .input(z.object({ jobId: z.string().min(1) }))
      .mutation(({ input, ctx }) => {
        const job = cancelAnalysisJob(input.jobId, ctx.user.id);
        if (!job) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
        }
        return job;
      }),

    // Upload and analyze a contract (text)
    analyzeText: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1).max(255),
          text: z.string().min(10),
          mode: z.enum(["quick", "deep"]).optional().default("quick"),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const startTime = Date.now();
        const mode = input.mode || "quick";
        await ensureModeAllowed(ctx.user.id, mode);
        
        // Rate limiting (10 requests per 15 minutes per IP)
        const clientIp = ctx.req.ip || ctx.req.socket.remoteAddress || "unknown";
        const rateLimit = checkRateLimit(`analysis:${clientIp}`, { windowMs: 15 * 60 * 1000, max: 10 });
        if (!rateLimit.allowed) {
          throw new Error(`Rate limit exceeded. Try again in ${Math.ceil((rateLimit.resetAt - Date.now()) / 1000 / 60)} minutes.`);
        }
        
        // Idempotency check
        const idempotencyKey = ctx.req.headers["idempotency-key"] as string | undefined;
        if (idempotencyKey) {
          const cached = checkIdempotency(idempotencyKey);
          if (cached.exists) {
            console.log(`[Analysis] Idempotency hit for key ${idempotencyKey}`);
            return cached.result;
          }
        }
        
        // Check for cached analysis
        const contentHash = computeContentHash(input.text);
        console.log(`[Cache Test] contentHash: ${contentHash}, mode: ${mode}`);
        const cached = await db.findUserCachedAnalysis(ctx.user.id, contentHash, mode);
        console.log(`[Cache Test] db.findCachedAnalysis result: ${cached ? 'HIT' : 'MISS'}`);
        
        if (cached) {
          console.log(`[Cache Test] Returning cached analysis (analysisId: ${cached.id})`);
          return {
            analysisId: cached.id,
            contractId: cached.contractId,
            cached: true,
          };
        }

        const quota = await db.consumeAnalysisQuota(ctx.user.id);
        if (!quota.allowed) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `Monthly analysis limit reached (${quota.analysesThisMonth}/${quota.monthlyLimit}). Upgrade to premium for more analyses.`,
          });
        }
        let contractId: number | null = null;
        let quotaConsumed = true;
        try {
          // Create contract record (no user ID)
          contractId = await db.createContract({
            userId: ctx.user.id,
            name: input.name,
            contentType: "text",
            originalText: input.text,
          });

          // Analyze the contract
          console.log(`[Cache Test] Cache miss - calling AI model`);
          const analysis = await analyzeContract(input.text, mode);

          // Calculate processing time with defensive checks
          const endTime = Date.now();
          let processingTimeMs = endTime - startTime;
          
          // Defensive check: ensure processingTimeMs is always a valid integer
          if (!Number.isFinite(processingTimeMs) || isNaN(processingTimeMs) || processingTimeMs < 0) {
            console.warn('[Analysis] Invalid processingTimeMs:', processingTimeMs, 'startTime:', startTime, 'endTime:', endTime);
            processingTimeMs = 0;
          }
          processingTimeMs = Math.floor(processingTimeMs); // Ensure integer

          console.log('[Analysis] Processing time:', processingTimeMs, 'ms');

          // Log payload before DB insert
          console.log('[DB INSERT PAYLOAD]', JSON.stringify({ 
            contractId, 
            userId: ctx.user.id,
            processingTimeMs, 
            processingTimeType: typeof processingTimeMs,
            isNaN: isNaN(processingTimeMs),
            isFinite: Number.isFinite(processingTimeMs),
            summaryLen: analysis.summary?.length 
          }));

          // Generate delete token for secure deletion
          const deleteToken = computeContentHash(`${contractId}-${Date.now()}-${Math.random()}`);

          // Save analysis
          let analysisId: number;
          try {
            analysisId = await db.createAnalysis({
              contractId,
              userId: ctx.user.id,
              summary: analysis.summary,
              mainObligations: JSON.stringify(analysis.mainObligations),
              potentialRisks: JSON.stringify(analysis.potentialRisks),
              redFlags: JSON.stringify(analysis.redFlags),
              mode,
              contentHash,
              deleteToken,
              processingTimeMs,
            });
            console.log('[analyzeText] Analysis saved successfully with ID:', analysisId);
          } catch (error) {
            console.error('[analyzeText] FAILED to save analysis:', error);
            throw new Error(`Failed to save analysis: ${error instanceof Error ? error.message : String(error)}`);
          }
          
          const result = {
            contractId,
            analysisId,
            deleteToken,
          };
          
          // Save idempotency result
          if (idempotencyKey) {
            saveIdempotency(idempotencyKey, result);
          }

          quotaConsumed = false;
          return result;
        } catch (error) {
          if (contractId) {
            await db.deleteContract(contractId).catch((cleanupError) => {
              console.error('[analyzeText] Failed to cleanup contract after error:', cleanupError);
            });
          }
          if (quotaConsumed) {
            await db.releaseAnalysisQuota(ctx.user.id).catch((quotaError) => {
              console.error('[analyzeText] Failed to rollback quota:', quotaError);
            });
          }
          throw error;
        }
      }),

    // Upload and analyze a contract (PDF)
    analyzePDF: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1).max(255),
          pdfBase64: z.string(),
          fileSize: z.number(),
          mode: z.enum(["quick", "deep"]).optional().default("quick"),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const startTime = Date.now();
        const mode = input.mode || "quick";
        await ensureModeAllowed(ctx.user.id, mode);

        // Check file size (10MB limit)
        if (input.fileSize > 10 * 1024 * 1024) {
          throw new Error("PDF file size must be less than 10MB");
        }

        // Decode base64 PDF
        const pdfBuffer = Buffer.from(input.pdfBase64, "base64");

        // Extract text from PDF
        const text = await extractTextFromPDF(pdfBuffer);

        if (!text || text.length < 10) {
          throw new Error("Could not extract text from PDF. Please try uploading as text instead.");
        }
        
        // Check for cached analysis
        const contentHash = computeContentHash(text);
        const cached = await db.findUserCachedAnalysis(ctx.user.id, contentHash, mode);
        
        if (cached) {
          console.log(`[Analysis] Cache hit for hash ${contentHash}`);
          return {
            analysisId: cached.id,
            contractId: cached.contractId,
            cached: true,
          };
        }

        const quota = await db.consumeAnalysisQuota(ctx.user.id);
        if (!quota.allowed) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `Monthly analysis limit reached (${quota.analysesThisMonth}/${quota.monthlyLimit}). Upgrade to premium for more analyses.`,
          });
        }
        let contractId: number | null = null;
        let quotaConsumed = true;
        try {
          // Upload PDF to storage
          const fileKey = `contracts/${ctx.user.id}/${Date.now()}-${input.name}`;
          const { url: fileUrl } = await storagePut(fileKey, pdfBuffer, "application/pdf");

          // Create contract record (no user ID)
          contractId = await db.createContract({
            userId: ctx.user.id,
            name: input.name,
            contentType: "pdf",
            originalText: text,
            fileUrl,
            fileSize: input.fileSize,
          });

          // Analyze the contract
          const analysis = await analyzeContract(text, mode);

          // Calculate processing time with defensive checks
          const endTime = Date.now();
          let processingTimeMs = endTime - startTime;
          
          // Defensive check: ensure processingTimeMs is always a valid integer
          if (!Number.isFinite(processingTimeMs) || isNaN(processingTimeMs) || processingTimeMs < 0) {
            console.warn('[Analysis] Invalid processingTimeMs:', processingTimeMs, 'startTime:', startTime, 'endTime:', endTime);
            processingTimeMs = 0;
          }
          processingTimeMs = Math.floor(processingTimeMs); // Ensure integer

          console.log('[Analysis] Processing time:', processingTimeMs, 'ms');

          // Log payload before DB insert
          console.log('[DB INSERT PAYLOAD]', JSON.stringify({ 
            contractId, 
            userId: ctx.user.id, 
            processingTimeMs, 
            processingTimeType: typeof processingTimeMs,
            isNaN: isNaN(processingTimeMs),
            isFinite: Number.isFinite(processingTimeMs),
            summaryLen: analysis.summary?.length 
          }));

          // Generate delete token for secure deletion
          const deleteToken = computeContentHash(`${contractId}-${Date.now()}-${Math.random()}`);

          // Save analysis
          let analysisId: number;
          try {
            analysisId = await db.createAnalysis({
              contractId,
              userId: ctx.user.id,
              summary: analysis.summary,
              mainObligations: JSON.stringify(analysis.mainObligations),
              potentialRisks: JSON.stringify(analysis.potentialRisks),
              redFlags: JSON.stringify(analysis.redFlags),
              mode,
              contentHash,
              deleteToken,
              processingTimeMs,
            });
            console.log('[analyzeText] Analysis saved successfully with ID:', analysisId);
          } catch (error) {
            console.error('[analyzeText] FAILED to save analysis:', error);
            throw new Error(`Failed to save analysis: ${error instanceof Error ? error.message : String(error)}`);
          }

          quotaConsumed = false;
          return {
            contractId,
            analysisId,
            analysis,
          };
        } catch (error) {
          if (contractId) {
            await db.deleteContract(contractId).catch((cleanupError) => {
              console.error('[analyzePDF] Failed to cleanup contract after error:', cleanupError);
            });
          }
          if (quotaConsumed) {
            await db.releaseAnalysisQuota(ctx.user.id).catch((quotaError) => {
              console.error('[analyzePDF] Failed to rollback quota:', quotaError);
            });
          }
          throw error;
        }
      }),

    // Get all analyses (no user filter)
    list: protectedProcedure.query(async ({ ctx }) => {
      const analyses = await db.getUserAnalyses(ctx.user.id);
      const results = [];
      for (const analysis of analyses) {
        const contract = await db.getContractById(analysis.contractId);
        results.push({
          analysisId: analysis.id,
          createdAt: analysis.createdAt,
          title: contract?.name || "Untitled"
        });
      }
      return results;
    }),

    // DEV ONLY: Delete all old analyses (24h+)
    deleteAll: publicProcedure.mutation(async () => {
      if (process.env.NODE_ENV === "production") {
        throw new Error("deleteAll is not available in production");
      }
      const deleted = await db.deleteOldAnalyses();
      return { deleted };
    }),

    // Delete a specific report by deleteToken
    deleteReport: protectedProcedure
      .input(z.object({ deleteToken: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        const analysis = await db.getAnalysisByDeleteToken(input.deleteToken);
        if (!analysis) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Report not found or already deleted" });
        }
        if (analysis.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Forbidden" });
        }
        await db.deleteAnalysis(analysis.id);
        await db.deleteContract(analysis.contractId);
        return { success: true };
      }),

    // DEV ONLY: Cache smoke test
    cacheSmokeTest: publicProcedure.query(async () => {
      if (process.env.NODE_ENV === "production") {
        throw new Error("cacheSmokeTest is not available in production");
      }

      const testText = "This Service Agreement is between Provider and Client. Provider will deliver consulting services for $5000/month. Either party may terminate with 30 days notice.";
      const mode = "quick";

      console.log("\n=== CACHE SMOKE TEST START ===");

      // CALL 1
      console.log("\n--- CALL 1 ---");
      const contentHash1 = computeContentHash(testText);
      console.log(`contentHash: ${contentHash1}`);
      const cached1 = await db.findCachedAnalysis(contentHash1, mode);
      console.log(`Cache lookup: ${cached1 ? 'HIT' : 'MISS'}`);
      
      let result1;
      if (cached1) {
        console.log(`Model called: NO (cache hit)`);
        result1 = { analysisId: cached1.id, contractId: cached1.contractId, cached: true };
      } else {
        console.log(`Model called: YES (calling analyzeContract)`);
        const contractId = await db.createContract({
          userId: null,
          name: "Cache Test Contract",
          contentType: "text",
          originalText: testText,        });
        const analysis = await analyzeContract(testText, mode);
        const deleteToken1 = computeContentHash(`${contractId}-${Date.now()}-${Math.random()}`);
        const analysisId = await db.createAnalysis({
          contractId,
          mode,
          contentHash: contentHash1,
          summary: analysis.summary,
          mainObligations: JSON.stringify(analysis.mainObligations),
          potentialRisks: JSON.stringify(analysis.potentialRisks),
          redFlags: JSON.stringify(analysis.redFlags),
          deleteToken: deleteToken1,
          processingTimeMs: 0,
        });
        result1 = { analysisId, contractId, cached: false };
      }
      console.log(`Result 1: analysisId=${result1.analysisId}, cached=${result1.cached}`);

      // CALL 2 (identical input)
      console.log("\n--- CALL 2 ---");
      const contentHash2 = computeContentHash(testText);
      console.log(`contentHash: ${contentHash2}`);
      const cached2 = await db.findCachedAnalysis(contentHash2, mode);
      console.log(`Cache lookup: ${cached2 ? 'HIT' : 'MISS'}`);
      
      let result2;
      if (cached2) {
        console.log(`Model called: NO (cache hit)`);
        result2 = { analysisId: cached2.id, contractId: cached2.contractId, cached: true };
      } else {
        console.log(`Model called: YES (calling analyzeContract)`);
        const contractId = await db.createContract({
          userId: null,
          name: "Cache Test Contract 2",
          contentType: "text",
          originalText: testText,
        });
        const analysis = await analyzeContract(testText, mode);
        const deleteToken2 = computeContentHash(`${contractId}-${Date.now()}-${Math.random()}`);
        const analysisId = await db.createAnalysis({
          contractId,
          mode,
          contentHash: contentHash2,
          summary: analysis.summary,
          mainObligations: JSON.stringify(analysis.mainObligations),
          potentialRisks: JSON.stringify(analysis.potentialRisks),
          redFlags: JSON.stringify(analysis.redFlags),
          deleteToken: deleteToken2,
          processingTimeMs: 0,
        });
        result2 = { analysisId, contractId, cached: false };
      }
      console.log(`Result 2: analysisId=${result2.analysisId}, cached=${result2.cached}`);

      console.log("\n=== CACHE SMOKE TEST END ===");

      return {
        first: { analysisId: result1.analysisId, cached: result1.cached },
        second: { analysisId: result2.analysisId, cached: result2.cached },
        cacheWorking: result2.cached === true,
      };
    }),

    // DEV ONLY: Idempotency smoke test
    idempotencySmokeTest: publicProcedure.query(async ({ ctx }) => {
      if (process.env.NODE_ENV === "production") {
        throw new Error("idempotencySmokeTest is not available in production");
      }

      const testText = "This Service Agreement is between Provider and Client. Provider will deliver consulting services for $5000/month. Either party may terminate with 30 days notice.";
      const mode = "quick";
      const idempotencyKey = `test-idempotency-${Date.now()}`;

      console.log("\n=== IDEMPOTENCY SMOKE TEST START ===");
      console.log(`Idempotency-Key: ${idempotencyKey}`);

      // CALL 1
      console.log("\n--- CALL 1 ---");
      let idempotencyCheck1 = checkIdempotency(idempotencyKey);
      console.log(`Idempotency check: ${idempotencyCheck1.exists ? 'EXISTS' : 'NOT FOUND'}`);
      
      let result1;
      if (idempotencyCheck1.exists) {
        console.log(`Model called: NO (idempotency hit)`);
        result1 = idempotencyCheck1.result;
      } else {
        console.log(`Model called: YES (new request)`);
        const contentHash = computeContentHash(testText);
        const cached = await db.findCachedAnalysis(contentHash, mode);
        
        if (cached) {
          result1 = { analysisId: cached.id, contractId: cached.contractId, cached: true };
        } else {
          const contractId = await db.createContract({
            userId: null,
            name: "Idempotency Test Contract",
            contentType: "text",
            originalText: testText,
          });
          const analysis = await analyzeContract(testText, mode);
          const deleteToken = computeContentHash(`${contractId}-${Date.now()}-${Math.random()}`);
          const analysisId = await db.createAnalysis({
            contractId,
            mode,
            contentHash,
            summary: analysis.summary,
            mainObligations: JSON.stringify(analysis.mainObligations),
            potentialRisks: JSON.stringify(analysis.potentialRisks),
            redFlags: JSON.stringify(analysis.redFlags),
            deleteToken,
            processingTimeMs: 0,
          });
          result1 = { analysisId, contractId, cached: false };
        }
        saveIdempotency(idempotencyKey, result1);
      }
      console.log(`Result 1: analysisId=${result1.analysisId}, cached=${result1.cached}`);

      // CALL 2 (same idempotency key)
      console.log("\n--- CALL 2 ---");
      let idempotencyCheck2 = checkIdempotency(idempotencyKey);
      console.log(`Idempotency check: ${idempotencyCheck2.exists ? 'EXISTS' : 'NOT FOUND'}`);
      
      let result2;
      if (idempotencyCheck2.exists) {
        console.log(`Model called: NO (idempotency hit)`);
        result2 = idempotencyCheck2.result;
      } else {
        console.log(`Model called: YES (new request)`);
        const contentHash = computeContentHash(testText);
        const cached = await db.findCachedAnalysis(contentHash, mode);
        
        if (cached) {
          result2 = { analysisId: cached.id, contractId: cached.contractId, cached: true };
        } else {
          const contractId = await db.createContract({
            userId: null,
            name: "Idempotency Test Contract 2",
            contentType: "text",
            originalText: testText,
          });
          const analysis = await analyzeContract(testText, mode);
          const deleteToken = computeContentHash(`${contractId}-${Date.now()}-${Math.random()}`);
          const analysisId = await db.createAnalysis({
            contractId,
            mode,
            contentHash,
            summary: analysis.summary,
            mainObligations: JSON.stringify(analysis.mainObligations),
            potentialRisks: JSON.stringify(analysis.potentialRisks),
            redFlags: JSON.stringify(analysis.redFlags),
            deleteToken,
            processingTimeMs: 0,
          });
          result2 = { analysisId, contractId, cached: false };
        }
        saveIdempotency(idempotencyKey, result2);
      }
      console.log(`Result 2: analysisId=${result2.analysisId}, cached=${result2.cached}`);

      console.log("\n=== IDEMPOTENCY SMOKE TEST END ===");

      return {
        first: { analysisId: result1.analysisId, cached: result1.cached },
        second: { analysisId: result2.analysisId, cached: result2.cached },
        sameAnalysisId: result1.analysisId === result2.analysisId,
      };
    }),



    analysisQuality: protectedProcedure
      .input(z.object({ analysisId: z.number().int().positive() }))
      .query(async ({ input, ctx }) => {
        const analysis = await db.getAnalysisById(input.analysisId);
        if (!analysis) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Analysis not found" });
        }
        if (analysis.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Forbidden" });
        }

        const report = evaluateAnalysisQuality({
          summary: analysis.summary,
          mainObligations: JSON.parse(analysis.mainObligations),
          potentialRisks: JSON.parse(analysis.potentialRisks),
          redFlags: JSON.parse(analysis.redFlags),
          mode: analysis.mode as "quick" | "deep",
        });

        const subscription = await db.getOrCreateUserSubscription(ctx.user.id);
        if (subscription.plan !== "premium") {
          return {
            score: report.score,
            premiumUnlocked: false,
            message: "Upgrade to premium for detailed quality coaching.",
          };
        }

        return {
          score: report.score,
          premiumUnlocked: true,
          checks: report.checks,
          suggestions: report.suggestions,
        };
      }),
    // Get a specific analysis
    getAnalysis: protectedProcedure
      .input(z.object({ analysisId: z.number() }))
      .query(async ({ input, ctx }) => {
        const analysis = await db.getAnalysisById(input.analysisId);
        if (!analysis) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Analysis not found" });
        }
        if (analysis.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Forbidden" });
        }

        const contract = await db.getContractById(analysis.contractId);

        return {
          contract,
          analysis: {
            ...analysis,
            mainObligations: JSON.parse(analysis.mainObligations),
            potentialRisks: JSON.parse(analysis.potentialRisks),
            redFlags: JSON.parse(analysis.redFlags),
          },
        };
      }),

    // Delete a contract and its analysis
    delete: protectedProcedure
      .input(z.object({ contractId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const contract = await db.getContractById(input.contractId);
        if (!contract) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Contract not found" });
        }
        if (contract.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Forbidden" });
        }

        await db.deleteContract(input.contractId);
        return { success: true };
      }),

    deleteMyData: protectedProcedure.mutation(async ({ ctx }) => {
      const result = await db.deleteUserData(ctx.user.id);
      return {
        success: true,
        ...result,
      };
    }),
  }),
});

export type AppRouter = typeof appRouter;
