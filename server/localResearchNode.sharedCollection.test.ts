import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({ select: vi.fn(), update: vi.fn(), insert: vi.fn() }));
vi.mock("./db", () => ({ getDb: vi.fn(async () => dbMock) }));

import { registerLocalResearchNodeRoutes } from "./localResearchNode";

function queuedRequest() {
  return { id: 17, requestedByUserId: 3, randomSeed: 91, symbolCount: 2, sampleDays: 5, status: "queued", requestFingerprint: "q".repeat(64), plannedUniverseJson: null, datasetId: null, acceptedDailyBarCount: 0, acceptedFiveMinuteBarCount: 0, progressJson: null, resumeCount: 0, lastError: null, requestedAt: new Date("2026-08-20T00:00:00.000Z"), startedAt: null, completedAt: null };
}
function chain(result: unknown) { return { from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => result }), limit: async () => result }) }) }; }
function samplePayload() {
  const universe = [{ symbol: "005930", name: "삼성전자" }, { symbol: "000660", name: "SK하이닉스" }];
  const dates = Array.from({ length: 72 }, (_, index) => new Date(Date.UTC(2025, 9, 1 + index)).toISOString().slice(0, 10));
  return { requestId: 17, universe, dailyBars: universe.flatMap((item, stockIndex) => dates.map((date, index) => ({ symbol: item.symbol, date, open: 70_000 + stockIndex * 1_000 + index, high: 70_500 + stockIndex * 1_000 + index, low: 69_800 + stockIndex * 1_000 + index, close: 70_200 + stockIndex * 1_000 + index, volume: 1_000 + index, turnover: 70_200_000 + index }))), fiveMinuteBars: universe.flatMap((item, stockIndex) => dates.map((date, index) => ({ symbol: item.symbol, intervalAt: `${date}T00:00:00.000Z`, open: 70_000 + stockIndex * 1_000 + index, high: 70_500 + stockIndex * 1_000 + index, low: 69_800 + stockIndex * 1_000 + index, close: 70_200 + stockIndex * 1_000 + index, volume: 1_000 + index }))) };
}

describe("고정 IP 공용 데이터셋 수집 라우트", () => {
  const token = process.env.LOCAL_RESEARCH_NODE_TOKEN;
  let server: ReturnType<express.Express["listen"]>;
  let baseUrl = "";
  beforeEach(async () => {
    vi.clearAllMocks();
    dbMock.update.mockReturnValue({ set: () => ({ where: async () => undefined }) });
    dbMock.insert.mockReturnValue({ values: () => ({ $returningId: async () => [{ id: 991 }] }) });
    const app = express(); app.use(express.json({ limit: "5mb" })); registerLocalResearchNodeRoutes(app);
    server = await new Promise(resolve => { const instance = app.listen(0, () => resolve(instance)); });
    const address = server.address(); baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  });
  afterEach(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });

  it("등록된 지정 단말만 대기 요청을 running으로 가져가며 주문 라우트를 호출하지 않는다", async () => {
    dbMock.select.mockReturnValue(chain([queuedRequest()]));
    const denied = await fetch(`${baseUrl}/api/local-research-node/shared-dataset-collection-plan`);
    const accepted = await fetch(`${baseUrl}/api/local-research-node/shared-dataset-collection-plan`, { headers: { "x-research-node-token": token! } });

    expect(denied.status).toBe(401);
    expect(accepted.status).toBe(200);
    await expect(accepted.json()).resolves.toMatchObject({ status: "ready", mode: "manual_shared_dataset_read_only_collection", request: { id: 17, symbolCount: 2, sampleDays: 5 } });
    expect(dbMock.update).toHaveBeenCalledTimes(1);
  });

  it("같은 실제 원본 지문이 이미 있으면 새 데이터셋·주문 없이 기존 공용 스냅샷을 재사용하고 completed로 기록한다", async () => {
    const active = { ...queuedRequest(), status: "running", startedAt: new Date() };
    const existing = { id: 404, versionKey: "shared-local:existing", barCount: 130, minuteBarCount: 10, qualityStatus: "ready", visibility: "shared_public" };
    dbMock.select.mockReturnValueOnce(chain([active])).mockReturnValueOnce(chain([existing]));
    const response = await fetch(`${baseUrl}/api/local-research-node/shared-dataset-collection-sync`, { method: "POST", headers: { "Content-Type": "application/json", "x-research-node-token": token! }, body: JSON.stringify(samplePayload()) });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "reused", requestId: 17, datasetId: 404, versionKey: "shared-local:existing" });
    expect(dbMock.insert).not.toHaveBeenCalled();
    expect(dbMock.update).toHaveBeenCalledTimes(1);
  });

  it("지정 단말 수집기는 주문·계좌 경로 없이 종목별 진행 증거만 기록한다", async () => {
    const response = await fetch(`${baseUrl}/api/local-research-node/shared-dataset-collection-progress`, { method: "POST", headers: { "Content-Type": "application/json", "x-research-node-token": token! }, body: JSON.stringify({ requestId: 17, stage: "five_minute_bars", message: "5분봉을 읽고 있습니다.", totalSymbols: 10, completedDailySymbols: 10, completedFiveMinuteSymbols: 4 }) });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "progress_recorded" });
    expect(dbMock.update).toHaveBeenCalledTimes(1);
  });
});
