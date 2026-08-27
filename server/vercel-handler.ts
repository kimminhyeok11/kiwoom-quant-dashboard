// Vercel Serverless Function entry point
// This file gets bundled by esbuild into api/index.js
import "dotenv/config";
import express from "express";
import type { IncomingMessage, ServerResponse } from "http";
import { registerApiRoutes } from "./_core/index";

const app = express();
registerApiRoutes(app);

// Vercel에서는 static 파일을 플랫폼이 직접 서빙하므로 serveStatic 불필요
// SPA fallback도 vercel.json의 routes에서 처리됨

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return (app as any)(req, res);
}
