import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router, userOrDeviceProcedure } from "./_core/trpc";
import * as db from "./db";
import {
  evaluateAnalysisQuality,
  extractTextFromImages,
  extractTextFromPDF,
  getAnalysisScopeMetadata,
} from "./contract-analyzer";
import { storagePut } from "./storage";
import { cancelAnalysisJob, enqueueAnalysisJob, getAnalysisJob } from "./analysis-queue";

function ensureAdmin(user: { role?: string }) {
  if (user.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Admin access required",
    });
  }
}

type UnifiedInputType = "pdf" | "images" | "text";

async function ingestToUnifiedText(input: {
  userId: number;
  name: string;
  inputType: UnifiedInputType;
  text?: string;
  pdfBase64?: string;
  pdfFileSize?: number;
  images?: Array<{ base64: string; mimeType?: string; size?: number }>;
}) {
  if (input.inputType === "text") {
    const text = (input.text || "").trim();
    if (text.length < 10) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Please provide at least 10 characters of text." });
    }
    return { text, contentType: "text" as const };
  }

  if (input.inputType === "pdf") {
    if (!input.pdfBase64) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "PDF file is required." });
    }
    if ((input.pdfFileSize || 0) > 10 * 1024 * 1024) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "PDF file size must be less than 10MB." });
    }
    const pdfBuffer = Buffer.from(input.pdfBase64, "base64");
    const text = await extractTextFromPDF(pdfBuffer);
    if (!text || text.length < 10) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Could not extract text from PDF. Please try uploading as text instead.",
      });
    }
    const fileKey = `contracts/${input.userId}/${Date.now()}-${input.name}`;
    const { url: fileUrl } = await storagePut(fileKey, pdfBuffer, "application/pdf");
    return { text, contentType: "pdf" as const, fileUrl, fileSize: input.pdfFileSize };
  }

  const images = input.images || [];
  if (images.length === 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Please select at least one image." });
  }
  const uploadedImageUrls: string[] = [];
  for (let i = 0; i < images.length; i += 1) {
    const image = images[i];
    const buffer = Buffer.from(image.base64, "base64");
    const mimeType = image.mimeType || "image/jpeg";
    const fileKey = `contracts/${input.userId}/${Date.now()}-${i + 1}.${mimeType.includes("png") ? "png" : "jpg"}`;
    const uploaded = await storagePut(fileKey, buffer, mimeType);
    uploadedImageUrls.push(uploaded.url);
  }
  const text = await extractTextFromImages(uploadedImageUrls);
  if (!text || text.length < 10) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "We couldn't read the document. Please try a clearer photo or different file.",
    });
  }
  return { text, contentType: "images" as const };
}

async function enqueueUnifiedDocument(input: {
  userId: number;
  name: string;
  inputType: UnifiedInputType;
  text?: string;
  pdfBase64?: string;
  pdfFileSize?: number;
  images?: Array<{ base64: string; mimeType?: string; size?: number }>;
}) {
  const ingested = await ingestToUnifiedText(input);
  const scope = getAnalysisScopeMetadata(ingested.text);
  const queued = enqueueAnalysisJob(
    {
      name: input.name,
      text: ingested.text,
      mode: "standard",
      contentType: ingested.contentType,
      fileUrl: ingested.fileUrl,
      fileSize: ingested.fileSize,
    },
    input.userId,
  );
  const usage = await db.getCreditUsageState(input.userId);
  return {
    ...queued,
    remainingCredits: usage.remainingCredits,
    creditConsumed: false,
    cacheHit: false,
    truncated: scope.truncated,
    pagesAnalyzed: scope.pagesAnalyzed,
    analysisScopeNote: scope.analysisScopeNote,
  };
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

  contracts: router({
    enqueueDocumentAsync: userOrDeviceProcedure
      .input(
        z.object({
          name: z.string().min(1).max(255),
          inputType: z.enum(["pdf", "images", "text"]),
          text: z.string().optional(),
          pdfBase64: z.string().optional(),
          pdfFileSize: z.number().optional(),
          images: z
            .array(
              z.object({
                base64: z.string().min(20),
                mimeType: z.string().optional(),
                size: z.number().optional(),
              }),
            )
            .optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        return enqueueUnifiedDocument({
          userId: ctx.effectiveUserId,
          name: input.name,
          inputType: input.inputType,
          text: input.text,
          pdfBase64: input.pdfBase64,
          pdfFileSize: input.pdfFileSize,
          images: input.images,
        });
      }),

    usageStatus: userOrDeviceProcedure.query(async ({ ctx }) => {
      const usage = await db.getCreditUsageState(ctx.effectiveUserId);
      return usage;
    }),

    enqueueTextAsync: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1).max(255),
          text: z.string().min(10),
          mode: z.enum(["standard", "quick", "deep"]).optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        return enqueueUnifiedDocument({
          userId: ctx.user.id,
          name: input.name,
          inputType: "text",
          text: input.text,
        });
      }),

    analyzeText: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1).max(255),
          text: z.string().min(10),
          mode: z.enum(["standard", "quick", "deep"]).optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        return enqueueUnifiedDocument({
          userId: ctx.user.id,
          name: input.name,
          inputType: "text",
          text: input.text,
        });
      }),

    enqueuePDFAsync: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1).max(255),
          pdfBase64: z.string(),
          fileSize: z.number(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        return enqueueUnifiedDocument({
          userId: ctx.user.id,
          name: input.name,
          inputType: "pdf",
          pdfBase64: input.pdfBase64,
          pdfFileSize: input.fileSize,
        });
      }),

    analyzePDF: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1).max(255),
          pdfBase64: z.string(),
          fileSize: z.number(),
          mode: z.enum(["standard", "quick", "deep"]).optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        return enqueueUnifiedDocument({
          userId: ctx.user.id,
          name: input.name,
          inputType: "pdf",
          pdfBase64: input.pdfBase64,
          pdfFileSize: input.fileSize,
        });
      }),

    getJobStatus: userOrDeviceProcedure
      .input(z.object({ jobId: z.string().min(1) }))
      .query(async ({ input, ctx }) => {
        const job = getAnalysisJob(input.jobId, ctx.effectiveUserId);
        if (!job) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
        }
        if (job.remainingCredits === undefined) {
          const usage = await db.getCreditUsageState(ctx.effectiveUserId);
          return {
            ...job,
            remainingCredits: usage.remainingCredits,
            creditConsumed: false,
            cacheHit: false,
          };
        }
        return job;
      }),

    subscriptionStatus: userOrDeviceProcedure.query(async ({ ctx }) => {
      const usage = await db.getCreditUsageState(ctx.effectiveUserId);
      return {
        plan: "credits" as const,
        analysesThisMonth: usage.creditsConsumed,
        monthlyLimit: usage.totalCredits,
        remaining: usage.remainingCredits,
        remainingCredits: usage.remainingCredits,
      };
    }),

    verifyAppleReceipt: protectedProcedure
      .input(z.object({ receiptData: z.string().min(10) }))
      .mutation(async ({ ctx }) => {
        const usage = await db.getCreditUsageState(ctx.user.id);
        return {
          active: false as const,
          planUpdated: false as const,
          plan: "credits" as const,
          remainingCredits: usage.remainingCredits,
          message: "Subscription receipts are disabled in V1. Credit packs will be added in a later sprint.",        };
      }),

    adminSetSubscription: protectedProcedure
      .input(
        z.object({
          userId: z.number().int().positive(),
          plan: z.enum(["free", "premium"]).optional(),
          monthlyLimit: z.number().int().optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        ensureAdmin(ctx.user);
        const subscription = await db.setUserSubscriptionPlan(input.userId, "free", input.monthlyLimit ?? 3);
        return subscription;
      }),

    cancelJob: userOrDeviceProcedure
      .input(z.object({ jobId: z.string().min(1) }))
      .mutation(({ input, ctx }) => {
        const job = cancelAnalysisJob(input.jobId, ctx.effectiveUserId);
        if (!job) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
        }
        return job;
      }),

    list: protectedProcedure.query(async ({ ctx }) => {
      const analyses = await db.getUserAnalyses(ctx.user.id);
      const results = [];
      for (const analysis of analyses) {
        const contract = await db.getContractById(analysis.contractId);
        results.push({
          analysisId: analysis.id,
          createdAt: analysis.createdAt,
          title: contract?.name || "Untitled",
        });
      }
      return results;
    }),

    deleteAll: publicProcedure.mutation(async () => {
      if (process.env.NODE_ENV === "production") {
        throw new Error("deleteAll is not available in production");
      }
      const deleted = await db.deleteOldAnalyses();
      return { deleted };
    }),

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
          mode: "standard",
        });

        return {
          score: report.score,
          checks: report.checks,
          suggestions: report.suggestions,
        };
      }),

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
        const scope = getAnalysisScopeMetadata(contract?.originalText || "");

        return {
          contract,
          scope,
          analysis: {
            ...analysis,
            mainObligations: JSON.parse(analysis.mainObligations),
            potentialRisks: JSON.parse(analysis.potentialRisks),
            redFlags: JSON.parse(analysis.redFlags),
          },
        };
      }),

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

    adminUsageStatus: protectedProcedure
      .input(z.object({ userId: z.number().int().positive() }))
      .query(async ({ input, ctx }) => {
        ensureAdmin(ctx.user);
        return db.getCreditUsageState(input.userId);
      }),
  }),
});

export type AppRouter = typeof appRouter;
