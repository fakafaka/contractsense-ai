import { TRPCError } from "@trpc/server";
import * as db from "./db";
import {
  analyzeContract,
  buildAnalysisCacheKey,
  computeContentHash,
  getAnalysisScopeMetadata,
  type AnalysisMode,
} from "./contract-analyzer";

export type AnalysisJobStatus = "pending" | "processing" | "completed" | "failed" | "cancelled";

type QueueJobInput = {
  name: string;
  text: string;
  mode: AnalysisMode;
  contentType: "text" | "pdf" | "images";
  cacheIdentity?: string;
  fileUrl?: string;
  fileSize?: number;
};


export type AnalysisQueueStats = {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  cancelled: number;
  inFlight: number;
  queueDepth: number;
  jobsTracked: number;
  dedupeEntries: number;
  config: {
    maxConcurrency: number;
    maxQueueSize: number;
    jobTtlMs: number;
    maxTextChars: number;
  };
};

type QueueJob = {
  id: string;
  userId: number;
  status: AnalysisJobStatus;
  createdAt: number;
  updatedAt: number;
  dedupeKey: string;
  input: QueueJobInput;
  result?: {
    analysisId: number;
    contractId: number;
    cacheHit: boolean;
    creditConsumed: boolean;
    remainingCredits: number;
    truncated: boolean;
    pagesAnalyzed: number;
    analysisScopeNote: string;
  };
  error?: string;
};

const jobs = new Map<string, QueueJob>();
const queue: string[] = [];
const dedupeIndex = new Map<string, string>();

const MAX_CONCURRENCY = Math.max(1, Number(process.env.ANALYSIS_QUEUE_CONCURRENCY || 2));
const JOB_TTL_MS = Math.max(10 * 60 * 1000, Number(process.env.ANALYSIS_JOB_TTL_MS || 24 * 60 * 60 * 1000));
const MAX_QUEUE_SIZE = Math.max(10, Number(process.env.ANALYSIS_QUEUE_MAX_SIZE || 100));
const MAX_TEXT_CHARS = Math.max(1000, Number(process.env.ANALYSIS_QUEUE_MAX_TEXT_CHARS || 200_000));

let inFlight = 0;

function makeJobId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function makeDedupeKey(userId: number, input: QueueJobInput) {
  const cacheKey = buildAnalysisCacheKey(input.contentType, input.text, input.cacheIdentity || "");
  return `${userId}:${cacheKey}`;
}

function isCancelled(job: QueueJob) {
  return job.status === "cancelled";
}

function cleanupJobs() {
  const now = Date.now();
  for (const [id, job] of jobs.entries()) {
    if (now - job.updatedAt > JOB_TTL_MS) {
      jobs.delete(id);
      if (dedupeIndex.get(job.dedupeKey) === id) {
        dedupeIndex.delete(job.dedupeKey);
      }
    }
  }
}

const cleanupTimer = setInterval(cleanupJobs, 15 * 60 * 1000);
if (typeof (cleanupTimer as any).unref === "function") {
  (cleanupTimer as any).unref();
}

async function processJob(job: QueueJob) {
  if (isCancelled(job)) return;
  const startedAt = Date.now();
  let createdContractId: number | null = null;
  let creditConsumed = false;
  let creditReleased = false;
  job.status = "processing";
  job.updatedAt = startedAt;
  try {
    const mode = job.input.mode;
    if (job.input.text.length > MAX_TEXT_CHARS) {
      throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: `Contract text too large (max ${MAX_TEXT_CHARS} chars)` });
    }
    const contentHash = buildAnalysisCacheKey(job.input.contentType, job.input.text, job.input.cacheIdentity || "");
    const scope = getAnalysisScopeMetadata(job.input.text);

    const cached = await db.findUserCachedAnalysis(job.userId, contentHash);
    if (cached) {
      const usage = await db.getCreditUsageState(job.userId);
      job.status = "completed";
      job.updatedAt = Date.now();
      job.result = {
        analysisId: cached.id,
        contractId: cached.contractId,
        cacheHit: true,
        creditConsumed: false,
        remainingCredits: usage.remainingCredits,
        truncated: scope.truncated,
        pagesAnalyzed: scope.pagesAnalyzed,
        analysisScopeNote: scope.analysisScopeNote,
      };
      return;
    }

    if (isCancelled(job)) return;

    const creditDecision = await db.consumeAnalysisQuota(job.userId);
    if (!creditDecision.allowed) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "No analysis credits remaining. New users receive 3 free analyses in V1.",
      });
    }
    creditConsumed = true;

    createdContractId = await db.createContract({
      userId: job.userId,
      name: job.input.name,
      contentType: job.input.contentType,
      originalText: job.input.text,
      fileUrl: job.input.fileUrl,
      fileSize: job.input.fileSize,
    });

    const analysis = await analyzeContract(job.input.text, mode);
    if (isCancelled(job)) {
      await db.deleteContract(createdContractId);
      return;
    }
    const processingTimeMs = Math.max(0, Math.floor(Date.now() - startedAt));
    const deleteToken = computeContentHash(`${createdContractId}-${Date.now()}-${Math.random()}`);

    const analysisId = await db.createAnalysis({
      contractId: createdContractId,
      userId: job.userId,
      summary: analysis.summary,
      mainObligations: JSON.stringify(analysis.mainObligations),
      potentialRisks: JSON.stringify(analysis.potentialRisks),
      redFlags: JSON.stringify(analysis.redFlags),
      mode,
      contentHash,
      deleteToken,
      processingTimeMs,
    });

    job.status = "completed";
    job.updatedAt = Date.now();
    job.result = {
      analysisId,
      contractId: createdContractId,
      cacheHit: false,
      creditConsumed: true,
      remainingCredits: creditDecision.remaining,
      truncated: analysis.scope.truncated,
      pagesAnalyzed: analysis.scope.pagesAnalyzed,
      analysisScopeNote: analysis.scope.analysisScopeNote,
    };
  } catch (error) {
    if (creditConsumed && !creditReleased) {
      creditReleased = true;
      try {
        await db.releaseAnalysisQuota(job.userId);
      } catch (quotaError) {
        console.error("[Queue] Failed to rollback consumed credit", quotaError);
      }
    }

    if (createdContractId) {
      try {
        await db.deleteContract(createdContractId);
      } catch (cleanupError) {
        console.error("[Queue] Failed to cleanup contract after job error", cleanupError);
      }
    }
    if (!isCancelled(job)) {
      job.status = "failed";
      job.updatedAt = Date.now();
      job.error = error instanceof Error ? error.message : String(error);
      const usage = await db.getCreditUsageState(job.userId).catch(() => null);
      if (usage) {
        job.result = {
          analysisId: 0,
          contractId: 0,
          cacheHit: false,
          creditConsumed: false,
          remainingCredits: usage.remainingCredits,
          truncated: false,
          pagesAnalyzed: 0,
          analysisScopeNote: "",
        };
      }
    }
  }
}

async function runNext() {
  while (inFlight < MAX_CONCURRENCY && queue.length > 0) {
    const jobId = queue.shift();
    if (!jobId) continue;
    const job = jobs.get(jobId);
    if (!job || job.status !== "pending") continue;

    inFlight++;
    processJob(job).finally(() => {
        inFlight--;
        void runNext();
      });
  }
}

export function enqueueAnalysisJob(input: QueueJobInput, userId: number) {
  if (queue.length >= MAX_QUEUE_SIZE) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Analysis queue is currently full. Please try again shortly.",
    });
  }

  const dedupeKey = makeDedupeKey(userId, input);
  const existingId = dedupeIndex.get(dedupeKey);
  if (existingId) {
    const existing = jobs.get(existingId);
    if (existing) {
      if (existing.status === "pending" || existing.status === "processing") {
        return { jobId: existing.id, status: existing.status as AnalysisJobStatus, deduped: true };
      }
      // Completed/failed/cancelled jobs should not block new submissions.
      dedupeIndex.delete(dedupeKey);
    } else {
      dedupeIndex.delete(dedupeKey);
    }
  }

  const id = makeJobId();
  const now = Date.now();
  const job: QueueJob = {
    id,
    userId,
    status: "pending",
    createdAt: now,
    updatedAt: now,
    input,
    dedupeKey,
  };
  jobs.set(id, job);
  dedupeIndex.set(dedupeKey, id);
  queue.push(id);
  void runNext();
  return { jobId: id, status: job.status as AnalysisJobStatus, deduped: false };
}


export function cancelAnalysisJob(jobId: string, userId: number) {
  const job = jobs.get(jobId);
  if (!job || job.userId !== userId) return null;
  if (job.status === "completed" || job.status === "failed") {
    return { jobId: job.id, status: job.status as AnalysisJobStatus, cancelled: false };
  }
  job.status = "cancelled";
  job.updatedAt = Date.now();
  if (dedupeIndex.get(job.dedupeKey) === job.id) {
    dedupeIndex.delete(job.dedupeKey);
  }
  return { jobId: job.id, status: job.status as AnalysisJobStatus, cancelled: true };
}

export function getAnalysisJob(jobId: string, userId: number) {
  const job = jobs.get(jobId);
  if (!job || job.userId !== userId) return null;
  return {
    jobId: job.id,
    status: job.status,
    analysisId: job.result?.analysisId,
    contractId: job.result?.contractId,
    cacheHit: job.result?.cacheHit ?? false,
    creditConsumed: job.result?.creditConsumed ?? false,
    remainingCredits: job.result?.remainingCredits,
    error: job.error,
    truncated: job.result?.truncated ?? false,
    pagesAnalyzed: job.result?.pagesAnalyzed ?? 0,
    analysisScopeNote: job.result?.analysisScopeNote ?? "",
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}


export function getAnalysisQueueStats(): AnalysisQueueStats {
  let pending = 0;
  let processing = 0;
  let completed = 0;
  let failed = 0;
  let cancelled = 0;

  for (const job of jobs.values()) {
    if (job.status === "pending") pending += 1;
    if (job.status === "processing") processing += 1;
    if (job.status === "completed") completed += 1;
    if (job.status === "failed") failed += 1;
    if (job.status === "cancelled") cancelled += 1;
  }

  return {
    pending,
    processing,
    completed,
    failed,
    cancelled,
    inFlight,
    queueDepth: queue.length,
    jobsTracked: jobs.size,
    dedupeEntries: dedupeIndex.size,
    config: {
      maxConcurrency: MAX_CONCURRENCY,
      maxQueueSize: MAX_QUEUE_SIZE,
      jobTtlMs: JOB_TTL_MS,
      maxTextChars: MAX_TEXT_CHARS,
    },
  };
}
