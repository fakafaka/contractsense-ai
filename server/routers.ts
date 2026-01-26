import { z } from "zod";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import * as db from "./db";
import { analyzeContract, extractTextFromPDF } from "./contract-analyzer";
import { storagePut } from "./storage";

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
        })
      )
      .mutation(async ({ input }) => {
        const startTime = Date.now();

        // Create contract record (no user ID)
        const contractId = await db.createContract({
          userId: null, // No user authentication in MVP
          name: input.name,
          contentType: "text",
          originalText: input.text,
        });

        // Analyze the contract
        const analysis = await analyzeContract(input.text);

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

        // Save analysis
        const analysisId = await db.createAnalysis({
          contractId,
          userId: null, // No user authentication in MVP
          summary: analysis.summary,
          mainObligations: JSON.stringify(analysis.mainObligations),
          potentialRisks: JSON.stringify(analysis.potentialRisks),
          redFlags: JSON.stringify(analysis.redFlags),
          processingTimeMs,
        });

        return {
          contractId,
          analysisId,
          analysis,
        };
      }),

    // Upload and analyze a contract (PDF)
    analyzePDF: publicProcedure
      .input(
        z.object({
          name: z.string().min(1).max(255),
          pdfBase64: z.string(),
          fileSize: z.number(),
        })
      )
      .mutation(async ({ input }) => {
        const startTime = Date.now();

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
        const analysis = await analyzeContract(text);

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

        // Save analysis
        const analysisId = await db.createAnalysis({
          contractId,
          userId: null, // No user authentication in MVP
          summary: analysis.summary,
          mainObligations: JSON.stringify(analysis.mainObligations),
          potentialRisks: JSON.stringify(analysis.potentialRisks),
          redFlags: JSON.stringify(analysis.redFlags),
          processingTimeMs,
        });

        return {
          contractId,
          analysisId,
          analysis,
        };
      }),

    // Get all contracts with analyses (no user filter)
    list: publicProcedure.query(async () => {
      const contractsWithAnalyses = await db.getAllContractsWithAnalyses();
      return contractsWithAnalyses.map((item) => ({
        contract: item.contract,
        analysis: item.analysis
          ? {
              ...item.analysis,
              mainObligations: JSON.parse(item.analysis.mainObligations),
              potentialRisks: JSON.parse(item.analysis.potentialRisks),
              redFlags: JSON.parse(item.analysis.redFlags),
            }
          : null,
      }));
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
