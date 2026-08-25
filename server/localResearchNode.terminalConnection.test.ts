import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({ select: vi.fn(), insert: vi.fn(), terminalValues: vi.fn() }));
vi.mock("./db", () => ({ getDb: vi.fn(async () => dbMock) }));

import { registerLocalResearchNodeRoutes } from "./localResearchNode";

function chain(result: unknown) { return { from: () => ({ where: () => ({ limit: async () => result }) }) }; }
function orderedChain(result: unknown) { return { from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => result }) }) }) }; }

describe("키움 단말 인증 결과 동기화", () => {
  const token = process.env.LOCAL_RESEARCH_NODE_TOKEN;
  let server: ReturnType<express.Express["listen"]>;
  let baseUrl = "";

  beforeEach(async () => {
    vi.clearAllMocks();
    dbMock.select.mockReturnValue(chain([{ id: 7 }]));
    dbMock.insert.mockReturnValue({ values: dbMock.terminalValues });
    const app = express();
    app.use(express.json());
    registerLocalResearchNodeRoutes(app);
    server = await new Promise(resolve => { const instance = app.listen(0, () => resolve(instance)); });
    const address = server.address();
    baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  });

  afterEach(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });

  it("키움 API·서비스 왕복 증거를 저장하고 주문 API를 호출하지 않는다", async () => {
    const response = await fetch(`${baseUrl}/api/local-research-node/kiwoom-terminal-connection`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-research-node-token": token! },
      body: JSON.stringify({ terminalIp: "203.0.113.42", status: "connected", message: "키움 API·서비스 왕복을 확인했습니다. 주문·계좌 API는 호출하지 않았습니다.", verification: { oauth: "passed", apiRead: "passed", serviceSync: "passed", serviceReadBack: "passed", apiId: "ka10081", responseRows: 100 } }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "recorded", handlerVersion: "terminal-sync-owner-fallback-v2", terminalIp: "203.0.113.42", connection: "connected", roundTripVerified: true });
    expect(dbMock.insert).toHaveBeenCalledTimes(1);
    expect(dbMock.terminalValues).toHaveBeenCalledWith(expect.objectContaining({ userId: 7, terminalIp: "203.0.113.42", status: "connected", verificationJson: expect.objectContaining({ apiRead: "passed", serviceReadBack: "passed" }) }));
    expect(JSON.stringify(dbMock.terminalValues.mock.calls)).not.toMatch(/order|account|token|secret/i);
  });

  it("인증된 단말은 서비스가 저장한 최신 왕복 증거를 다시 읽어 확인할 수 있다", async () => {
    dbMock.select.mockReturnValueOnce(chain([{ id: 7 }])).mockReturnValueOnce(orderedChain([{ terminalIp: "203.0.113.42", status: "connected", errorCode: null, message: "왕복 확인", verificationJson: { oauth: "passed", apiRead: "passed", serviceSync: "passed", serviceReadBack: "passed", apiId: "ka10081", responseRows: 100 }, checkedAt: new Date("2026-08-21T00:00:00.000Z") }]));

    const response = await fetch(`${baseUrl}/api/local-research-node/kiwoom-terminal-connection?terminalIp=203.0.113.42`, { headers: { "x-research-node-token": token! } });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "recorded", terminalIp: "203.0.113.42", roundTripVerified: true, verification: { apiId: "ka10081", responseRows: 100 } });
  });

  it("설정된 소유자 계정을 찾지 못해도 단일 운영자만 있을 때 그 계정에 인증 결과를 안전하게 연결한다", async () => {
    dbMock.select.mockReturnValueOnce(chain([])).mockReturnValueOnce(chain([{ id: 19 }]));

    const response = await fetch(`${baseUrl}/api/local-research-node/kiwoom-terminal-connection`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-research-node-token": token! },
      body: JSON.stringify({ terminalIp: "203.0.113.42", status: "connected", message: "OAuth 토큰 발급 확인" }),
    });

    expect(response.status).toBe(200);
    expect(dbMock.terminalValues).toHaveBeenCalledWith(expect.objectContaining({ userId: 19, status: "connected" }));
  });

  it("운영자가 없거나 둘 이상이면 단말 인증 결과를 임의의 계정에 연결하지 않는다", async () => {
    dbMock.select.mockReturnValueOnce(chain([])).mockReturnValueOnce(chain([{ id: 19 }, { id: 20 }]));

    const response = await fetch(`${baseUrl}/api/local-research-node/kiwoom-terminal-connection`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-research-node-token": token! },
      body: JSON.stringify({ terminalIp: "203.0.113.42", status: "connected", message: "OAuth 토큰 발급 확인" }),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ handlerVersion: "terminal-sync-owner-fallback-v2" });
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("로컬 노드 토큰이 없거나 잘못되면 단말 인증 결과를 저장하지 않는다", async () => {
    const response = await fetch(`${baseUrl}/api/local-research-node/kiwoom-terminal-connection`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ terminalIp: "203.0.113.42", status: "failed", errorCode: "oauth_token_issue_failed", message: "인증 실패" }),
    });

    expect(response.status).toBe(401);
    expect(dbMock.insert).not.toHaveBeenCalled();
  });
});
