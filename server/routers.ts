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
        const cached = await db.findCachedAnalysis(contentHash, mode);
        
        if (cached) {
          console.log(`[Analysis] Cache hit for hash ${contentHash}`);
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

    // Delete all user data (for privacy compliance)
    deleteAll: publicProcedure.mutation(async () => {
      // Delete old analyses (24h+)
      const deleted = await db.deleteOldAnalyses();
      return { deleted };
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
