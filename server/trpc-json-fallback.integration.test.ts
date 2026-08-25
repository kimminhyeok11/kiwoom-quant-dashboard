import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import { registerApiRoutes } from "./_core/index";

describe("tRPC server JSON fallback", () => {
  let closeServer: (() => Promise<void>) | undefined;

  afterEach(async () => { await closeServer?.(); closeServer = undefined; });

  it("returns a tRPC-shaped JSON 404 instead of an HTML SPA fallback for an unhandled API path", async () => {
    const app = express();
    registerApiRoutes(app);
    app.use((_req, res) => res.type("text/html").send("<!doctype html><html><body>SPA fallback</body></html>"));
    const server = await new Promise<import("http").Server>(resolve => {
      const created = app.listen(0, () => resolve(created));
    });
    closeServer = () => new Promise(resolve => server.close(() => resolve()));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("테스트 서버 포트를 확인할 수 없습니다.");

    const response = await fetch(`http://127.0.0.1:${address.port}/api/trpc/missing.procedure`);
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ error: { json: expect.objectContaining({ data: expect.objectContaining({ code: "NOT_FOUND", httpStatus: 404 }) }) } }));
  });

  it("returns a tRPC-shaped JSON authorization error instead of an HTML SPA fallback for a registered research procedure", async () => {
    const app = express();
    registerApiRoutes(app);
    app.use((_req, res) => res.type("text/html").send("<!doctype html><html><body>SPA fallback</body></html>"));
    const server = await new Promise<import("http").Server>(resolve => {
      const created = app.listen(0, () => resolve(created));
    });
    closeServer = () => new Promise(resolve => server.close(() => resolve()));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("테스트 서버 포트를 확인할 수 없습니다.");

    const response = await fetch(`http://127.0.0.1:${address.port}/api/trpc/research.listDatasets`);
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ error: { json: expect.objectContaining({ data: expect.objectContaining({ httpStatus: expect.any(Number) }) }) } }));
  });
});
