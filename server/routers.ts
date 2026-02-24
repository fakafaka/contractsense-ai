import { z } from "zod";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import * as db from "./db";
import { analyzeContract, extractTextFromPDF, computeContentHash } from "./contract-analyzer";
import { storagePut } from "./storage";
import { checkRateLimit, checkIdempotency, saveIdempotency } from "./rate-limiter";

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

  // Contract analysis features (no authentication required)
  contracts: router({
    // Upload and analyze a contract (text)
    analyzeText: publicProcedure
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
        const cached = await db.findCachedAnalysis(contentHash, mode);
        console.log(`[Cache Test] db.findCachedAnalysis result: ${cached ? 'HIT' : 'MISS'}`);
        
        if (cached) {
          console.log(`[Cache Test] Returning cached analysis (analysisId: ${cached.id})`);
          return {
            analysisId: cached.id,
            contractId: cached.contractId,
            cached: true,
          };
        }

        // Create contract record (no user ID)
        const contractId = await db.createContract({
          userId: null, // No user authentication in MVP
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
          userId: null, 
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
            userId: null, // No user authentication in MVP
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
        
        return result;
      }),

    // Upload and analyze a contract (PDF)
    analyzePDF: publicProcedure
      .input(
        z.object({
          name: z.string().min(1).max(255),
          pdfBase64: z.string(),
          fileSize: z.number(),
          mode: z.enum(["quick", "deep"]).optional().default("quick"),
        })
      )
      .mutation(async ({ input }) => {
        const startTime = Date.now();
        const mode = input.mode || "quick";

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
        const cached = await db.findCachedAnalysis(contentHash, mode);
        
        if (cached) {
          console.log(`[Analysis] Cache hit for hash ${contentHash}`);
          return {
            analysisId: cached.id,
            contractId: cached.contractId,
            cached: true,
          };
        }

        // Upload PDF to storage
        const fileKey = `contracts/anonymous/${Date.now()}-${input.name}`;
        const { url: fileUrl } = await storagePut(fileKey, pdfBuffer, "application/pdf");

        // Create contract record (no user ID)
        const contractId = await db.createContract({
          userId: null, // No user authentication in MVP
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
          userId: null, 
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
            userId: null, // No user authentication in MVP
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

        return {
          contractId,
          analysisId,
          analysis,
        };
      }),

    // Get all analyses (no user filter)
    list: publicProcedure.query(async () => {
      const analyses = await db.getAllAnalyses();
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
    deleteReport: publicProcedure
      .input(z.object({ deleteToken: z.string().min(1) }))
      .mutation(async ({ input }) => {
        const analysis = await db.getAnalysisByDeleteToken(input.deleteToken);
        if (!analysis) {
          throw new Error("Report not found or already deleted");
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

    // Get a specific analysis
    getAnalysis: publicProcedure
      .input(z.object({ analysisId: z.number() }))
      .query(async ({ input }) => {
        const analysis = await db.getAnalysisById(input.analysisId);
        if (!analysis) {
          throw new Error("Analysis not found");
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
    delete: publicProcedure
      .input(z.object({ contractId: z.number() }))
      .mutation(async ({ input }) => {
        const contract = await db.getContractById(input.contractId);
        if (!contract) {
          throw new Error("Contract not found");
        }

        await db.deleteContract(input.contractId);
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
