import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

// Open access: always return operator-level user (no login required)
const OPEN_ACCESS_USER: User = {
  id: 1,
  openId: "open-access-owner",
  name: "Owner",
  email: "salad20c@gmail.com",
  avatarId: "nebula",
  loginMethod: "open_access",
  role: "admin",
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  return {
    req: opts.req,
    res: opts.res,
    user: OPEN_ACCESS_USER,
  };
}
