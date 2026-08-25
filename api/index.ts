import "dotenv/config";
import express from "express";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { registerApiRoutes } from "../server/_core/index";

const app = express();
registerApiRoutes(app);

// Vercel serverless handler
export default function handler(req: VercelRequest, res: VercelResponse) {
  // Vercel already parses the body, so we need to pass it through
  if (req.body && !req.headers["content-type"]?.includes("multipart")) {
    (req as any)._body = true;
    (req as any).body = req.body;
  }
  return app(req as any, res as any);
}
