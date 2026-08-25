import "dotenv/config";
import express, { type Express } from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { rankingRefreshHandler } from "../scheduled/rankingRefresh";
import { autonomousResearchHandler } from "../scheduled/autonomousResearch";
import { researchGovernanceHandler } from "../scheduled/researchGovernance";
import { minuteResearchHandler } from "../scheduled/minuteResearch";
import { trpcJsonFallback } from "./trpcJsonFallback";
import { registerLocalResearchNodeRoutes } from "../localResearchNode";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

export function registerApiRoutes(app: Express) {
  // The managed gateway supplies the client address through one trusted proxy hop.
  app.set("trust proxy", 1);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerOAuthRoutes(app);
  registerLocalResearchNodeRoutes(app);
  app.post("/api/scheduled/ranking-refresh", rankingRefreshHandler);
  app.post("/api/scheduled/autonomous-research", (req, res) => void autonomousResearchHandler(req, res));
  app.post("/api/scheduled/research-governance", (req, res) => void researchGovernanceHandler(req, res));
  app.post("/api/scheduled/minute-research", (req, res) => void minuteResearchHandler(req, res));
  // Public research results can change between requests; never let browsers or edges reuse a stale tRPC payload.
  app.use("/api/trpc", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store, private, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    next();
  });
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // Never let an unhandled API path fall through to Vite's HTML SPA fallback.
  app.use("/api/trpc", trpcJsonFallback);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  registerApiRoutes(app);
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

if (!process.env.VITEST) startServer().catch(console.error);
