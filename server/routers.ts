import { z } from "zod";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";
import { analyzeContract, extractTextFromPDF } from "./contract-analyzer";
import { storagePut } from "./storage";

export const appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
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
    // Get user's subscription info and usage
    getUsage: protectedProcedure.query(async ({ ctx }) => {
      const usage = await db.canUserAnalyze(ctx.user.id);
      const subscription = await db.getUserSubscription(ctx.user.id);
      return {
        ...usage,
        plan: subscription?.plan || "free",
        analysesThisMonth: subscription?.analysesThisMonth || 0,
      };
    }),

    // Upload and analyze a contract (text)
    analyzeText: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1).max(255),
          text: z.string().min(10),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const startTime = Date.now();

        // Check if user can analyze
        const usage = await db.canUserAnalyze(ctx.user.id);
        if (!usage.canAnalyze) {
          throw new Error(
            `You've reached your monthly limit of ${usage.limit} analyses. Upgrade to Premium for unlimited analyses.`
          );
        }

        // Create contract record
        const contractId = await db.createContract({
          userId: ctx.user.id,
          name: input.name,
          contentType: "text",
          originalText: input.text,
        });

        // Analyze the contract
        const analysis = await analyzeContract(input.text);

        // Save analysis
        const analysisId = await db.createAnalysis({
          contractId,
          userId: ctx.user.id,
          summary: analysis.summary,
          mainObligations: JSON.stringify(analysis.mainObligations),
          potentialRisks: JSON.stringify(analysis.potentialRisks),
          redFlags: JSON.stringify(analysis.redFlags),
          riskLevel: analysis.riskLevel,
          processingTimeMs: Date.now() - startTime,
        });

        // Increment usage counter
        await db.incrementAnalysisCount(ctx.user.id);

        return {
          contractId,
          analysisId,
          analysis,
        };
      }),

    // Upload and analyze a contract (PDF)
    analyzePDF: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1).max(255),
          pdfBase64: z.string(),
          fileSize: z.number(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const startTime = Date.now();

        // Check file size (10MB limit)
        if (input.fileSize > 10 * 1024 * 1024) {
          throw new Error("PDF file size must be less than 10MB");
        }

        // Check if user can analyze
        const usage = await db.canUserAnalyze(ctx.user.id);
        if (!usage.canAnalyze) {
          throw new Error(
            `You've reached your monthly limit of ${usage.limit} analyses. Upgrade to Premium for unlimited analyses.`
          );
        }

        // Decode base64 PDF
        const pdfBuffer = Buffer.from(input.pdfBase64, "base64");

        // Extract text from PDF
        const text = await extractTextFromPDF(pdfBuffer);

        if (!text || text.length < 10) {
          throw new Error("Could not extract text from PDF. Please try uploading as text instead.");
        }

        // Upload PDF to storage
        const fileKey = `contracts/${ctx.user.id}/${Date.now()}-${input.name}`;
        const { url: fileUrl } = await storagePut(fileKey, pdfBuffer, "application/pdf");

        // Create contract record
        const contractId = await db.createContract({
          userId: ctx.user.id,
          name: input.name,
          contentType: "pdf",
          originalText: text,
          fileUrl,
          fileSize: input.fileSize,
        });

        // Analyze the contract
        const analysis = await analyzeContract(text);

        // Save analysis
        const analysisId = await db.createAnalysis({
          contractId,
          userId: ctx.user.id,
          summary: analysis.summary,
          mainObligations: JSON.stringify(analysis.mainObligations),
          potentialRisks: JSON.stringify(analysis.potentialRisks),
          redFlags: JSON.stringify(analysis.redFlags),
          riskLevel: analysis.riskLevel,
          processingTimeMs: Date.now() - startTime,
        });

        // Increment usage counter
        await db.incrementAnalysisCount(ctx.user.id);

        return {
          contractId,
          analysisId,
          analysis,
        };
      }),

    // Get all user's contracts with analyses
    list: protectedProcedure.query(async ({ ctx }) => {
      const contractsWithAnalyses = await db.getUserContractsWithAnalyses(ctx.user.id);
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
    getAnalysis: protectedProcedure
      .input(z.object({ analysisId: z.number() }))
      .query(async ({ ctx, input }) => {
        const analysis = await db.getAnalysisById(input.analysisId);
        if (!analysis) {
          throw new Error("Analysis not found");
        }

        // Verify ownership
        if (analysis.userId !== ctx.user.id) {
          throw new Error("Unauthorized");
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
      .mutation(async ({ ctx, input }) => {
        const contract = await db.getContractById(input.contractId);
        if (!contract) {
          throw new Error("Contract not found");
        }

        // Verify ownership
        if (contract.userId !== ctx.user.id) {
          throw new Error("Unauthorized");
        }

        await db.deleteContract(input.contractId);
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
