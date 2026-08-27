/**
 * Vercel Serverless Function — 최소 진입점
 * vite.ts를 일절 import하지 않음 (lightningcss 네이티브 바인딩 문제 방지)
 */
import "dotenv/config";
import express from "express";
import type { IncomingMessage, ServerResponse } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./_core/oauth";
import { appRouter } from "./routers";
import { createContext } from "./_core/context";
import { registerLocalResearchNodeRoutes } from "./localResearchNode";
import { trpcJsonFallback } from "./_core/trpcJsonFallback";
import { rankingRefreshHandler } from "./scheduled/rankingRefresh";
import { autonomousResearchHandler } from "./scheduled/autonomousResearch";
import { researchGovernanceHandler } from "./scheduled/researchGovernance";
import { minuteResearchHandler } from "./scheduled/minuteResearch";

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

registerOAuthRoutes(app);
registerLocalResearchNodeRoutes(app);

app.post("/api/scheduled/ranking-refresh", rankingRefreshHandler);
app.post("/api/scheduled/autonomous-research", (req, res) => void autonomousResearchHandler(req, res));
app.post("/api/scheduled/research-governance", (req, res) => void researchGovernanceHandler(req, res));
app.post("/api/scheduled/minute-research", (req, res) => void minuteResearchHandler(req, res));

app.use("/api/trpc", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store, private, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});

app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));
app.use("/api/trpc", trpcJsonFallback);

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return (app as any)(req, res);
}
