import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { getAnalysisQueueStats } from "../analysis-queue";
import { createContext } from "./context";
import { getRetentionSweepStats, startRetentionSweep } from "../retention";
import { canAccessOpsEndpoints, isRetentionSweepHealthy } from "./ops";

async function startServer() {
  const app = express();
  const server = createServer(app);
  app.set("trust proxy", 1);
  const stopRetentionSweep = startRetentionSweep();

  const allowedOrigins = (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  const isProduction = process.env.NODE_ENV === "production";

  if (isProduction && allowedOrigins.length === 0) {
    throw new Error("CORS_ORIGINS must be configured in production");
  }

  if (isProduction && allowedOrigins.includes("*")) {
    throw new Error("CORS_ORIGINS cannot contain '*' in production when credentials are enabled");
  }

  const allowAllOrigins = !isProduction && (allowedOrigins.length === 0 || allowedOrigins.includes("*"));

  // CORS policy: allow-list origins from CORS_ORIGINS (comma-separated).
  // If unset or contains "*", fallback to allow-all behavior for compatibility.
  app.use((req, res, next) => {
    const origin = req.headers.origin;

    if (origin && (allowAllOrigins || allowedOrigins.includes(origin))) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header("Vary", "Origin");
    }

    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization, Idempotency-Key",
    );
    if (origin && (allowAllOrigins || allowedOrigins.includes(origin))) {
      res.header("Access-Control-Allow-Credentials", "true");
    }

    // Handle preflight requests
    if (req.method === "OPTIONS") {
      if (origin && !allowAllOrigins && !allowedOrigins.includes(origin)) {
        res.sendStatus(403);
        return;
      }
      res.sendStatus(200);
      return;
    }

    if (origin && !allowAllOrigins && !allowedOrigins.includes(origin)) {
      res.status(403).json({ error: "CORS origin denied" });
      return;
    }

    next();
  });

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  registerOAuthRoutes(app);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });


  app.get("/api/ready", (_req, res) => {
    const retention = getRetentionSweepStats();
    const { healthy, ageMs, staleThresholdMs } = isRetentionSweepHealthy(retention);

    if (!healthy) {
      res.status(503).json({
        ok: false,
        reason: "retention_sweep_stale",
        ageMs,
        staleThresholdMs,
      });
      return;
    }

    res.json({ ok: true });
  });

  app.get("/api/metrics", (req, res) => {
    if (!canAccessOpsEndpoints(req)) {
      res.status(401).json({ ok: false, error: "Unauthorized" });
      return;
    }
    const retention = getRetentionSweepStats();
    const queue = getAnalysisQueueStats();
    res.json({
      timestamp: Date.now(),
      uptimeSec: Math.floor(process.uptime()),
      memory: process.memoryUsage(),
      retention,
      queue,
    });
  });
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  const PORT = Number(process.env.PORT || 3000);
  const HOST = process.env.HOST || "0.0.0.0";


  let isShuttingDown = false;
  const shutdown = (signal: "SIGINT" | "SIGTERM") => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`[api] received ${signal}, shutting down`);
    stopRetentionSweep?.();
    server.close((error) => {
      if (error) {
        console.error("[api] server close failed", error);
        process.exitCode = 1;
      }
      process.exit();
    });

    const forceShutdownTimer = setTimeout(() => {
      console.error("[api] forced shutdown after timeout");
      process.exit(1);
    }, 10_000);
    if (typeof (forceShutdownTimer as any).unref === "function") {
      (forceShutdownTimer as any).unref();
    }
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  server.listen(PORT, HOST, () => {
    const version = "v2.0";
    const timestamp = new Date().toISOString();
    console.log(`[BACKEND VERSION] ${version} ${timestamp}`);
    console.log(`[api] server listening on ${HOST}:${PORT}`);
  });
}

startServer().catch(console.error);
