// Vercel Serverless Function entry point
// This file gets bundled by esbuild into dist/vercel-handler.js
import "dotenv/config";
import express from "express";
import type { IncomingMessage, ServerResponse } from "http";
import { registerApiRoutes } from "./_core/index";
import { serveStatic } from "./_core/vite";

const app = express();
registerApiRoutes(app);
serveStatic(app);

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return (app as any)(req, res);
}
