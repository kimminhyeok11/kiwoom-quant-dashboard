import "dotenv/config";
import express from "express";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { registerApiRoutes } from "../server/_core/index";

const app = express();
registerApiRoutes(app);

export default function handler(req: VercelRequest, res: VercelResponse) {
  return app(req as any, res as any);
}
