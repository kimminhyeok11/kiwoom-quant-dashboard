import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import { buildIntradayMinuteCollectionPlan, buildLocalAutoOrderPlan, buildLocalDailyDatasetVersion, buildLocalDailyUniverseDatasetVersion, closeIntradayCandidateSimulation, getLocalIntradayBootstrapState, registerLocalResearchNodeRoutes, selectClosedIntradayMinuteBars, selectFreshIntradayQuotes, selectLiquidMinuteBackfillUniverse, selectLocalDailyCollectionUniverse, selectSharedCollectionPayload, selectValidLocalDailyBars, shouldCloseIntradayExperiment } from "./localResearchNode";

describe("local research node health endpoint", () => {
  const originalToken = process.env.LOCAL_RESEARCH_NODE_TOKEN;

  afterEach(() => {
    if (originalToken === undefined) delete process.env.LOCAL_RESEARCH_NODE_TOKEN;
    else process.env.LOCAL_RESEARCH_NODE_TOKEN = originalToken;
  });

  it("accepts the configured shared token without exposing it and blocks unauthenticated access", async () => {
    const configuredToken = process.env.LOCAL_RESEARCH_NODE_TOKEN;
    expect(configuredToken).toBeTruthy();
    const app = express();
    registerLocalResearchNodeRoutes(app);
    const server = await new Promise<ReturnType<typeof app.listen>>(resolve => {
      const instance = app.listen(0, () => resolve(instance));
    });
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    try {
      const denied = await fetch(`http://127.0.0.1:${port}/api/local-research-node/health`);
      expect(denied.status).toBe(401);
      const accepted = await fetch(`http://127.0.0.1:${port}/api/local-research-node/health`, { headers: { "x-research-node-token": configuredToken! } });
      expect(accepted.status).toBe(200);
      const body = await accepted.json() as { status: string; allowed: string[]; blocked: string[] };
      expect(body).toEqual(expect.objectContaining({ status: "ready", allowed: expect.arrayContaining(["daily_bar_sync", "auto_order_plan", "execution_sync", "position_sync"]), blocked: expect.arrayContaining(["manual_web_order_transmission"]) }));
      expect(JSON.stringify(body)).not.toContain(configuredToken!);
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
});

describe("local automatic order plan", () => {
  it("실시간 모의투자 생존 후보를 적합도 순서로 최대 보유 종목 수만큼 선발한다", () => {
    const plan = buildLocalAutoOrderPlan({
      experimentId: 8,
      tradingDate: "2026-08-18",
      policyVersion: "day-trade-v1",
      totalCapital: 10_000_000,
      maxPositions: 2,
      positions: [
        { candidateId: 1, candidateFingerprint: "a".repeat(64), symbol: "005930", name: "삼성전자", entryPrice: 70_000, lastPrice: 71_000, signalCount: 2 },
        { candidateId: 2, candidateFingerprint: "b".repeat(64), symbol: "000660", name: "SK하이닉스", entryPrice: 150_000, lastPrice: null, signalCount: 1 },
        { candidateId: 3, candidateFingerprint: "c".repeat(64), symbol: "035420", name: "NAVER", entryPrice: 200_000, lastPrice: 201_000, signalCount: 3 },
      ],
      fitnessByCandidateId: new Map([[1, 3], [2, 7], [3, 5]]),
    });
    expect(plan).toMatchObject({ status: "ready", mode: "automatic_trading", selectedPositionCount: 2, totalCapital: 10_000_000 });
    expect(plan.orders.map(item => item.symbol)).toEqual(["000660", "035420"]);
    expect(plan.orders.map(item => item.dedupeKey)).toEqual(["auto:2026-08-18:day-trade-v1:2:000660:buy", "auto:2026-08-18:day-trade-v1:3:035420:buy"]);
    expect(plan.quotes).toEqual(expect.arrayContaining([{ symbol: "005930", name: "삼성전자", price: 71_000 }, { symbol: "000660", name: "SK하이닉스", price: 150_000 }]));
  });
});

describe("local multi-symbol minute backfill universe", () => {
  it("최근 실제 30거래일 평균 거래대금 기준으로 종목을 선발하고 한도를 적용한다", () => {
    const rows = Array.from({ length: 30 }, (_, index) => {
      const day = String(index + 1).padStart(2, "0");
      return [
        { symbol: "005930", date: `2026-08-${day}`, turnover: "15000000000" },
        { symbol: "000660", date: `2026-08-${day}`, turnover: "9000000000" },
        { symbol: "035420", date: `2026-08-${day}`, turnover: "30000000000" },
      ];
    }).flat();
    const selected = selectLiquidMinuteBackfillUniverse({ bars: rows, knownNames: [{ symbol: "005930", name: "삼성전자" }, { symbol: "000660", name: "SK하이닉스" }, { symbol: "035420", name: "NAVER" }], thresholdWon: 10_000_000_000, maxSymbols: 1 });
    expect(selected).toEqual([{ symbol: "035420", name: "NAVER", observedDays: 30, averageTurnover: 30_000_000_000 }]);
  });
});

describe("local intraday quote synchronization", () => {
  it("기록된 시세보다 새롭고 종목별로 가장 최근인 실제 가격만 반영한다", () => {
    const result = selectFreshIntradayQuotes({
      lastObservedAtBySymbol: new Map([["005930", new Date("2026-08-18T04:15:55.000Z")]]),
      quotes: [
        { symbol: "005930", price: 271_000, observedAt: new Date("2026-08-18T04:15:54.000Z") },
        { symbol: "005930", price: 271_500, observedAt: new Date("2026-08-18T04:16:20.000Z") },
        { symbol: "005930", price: 271_750, observedAt: new Date("2026-08-18T04:16:30.000Z") },
        { symbol: "000660", price: 300_000, observedAt: new Date("2026-08-18T04:16:10.000Z") },
      ],
    });

    expect(result.ignored).toBe(1);
    expect(result.latestBySymbol.get("005930")).toMatchObject({ price: 271_750, observedAt: new Date("2026-08-18T04:16:30.000Z") });
    expect(result.latestBySymbol.get("000660")).toMatchObject({ price: 300_000 });
  });
});

describe("local intraday minute-bar synchronization", () => {
  it("현재 진행 중인 분봉과 다른 거래일·비정상 OHLC를 거부하고 완결된 1분봉만 보존한다", () => {
    const result = selectClosedIntradayMinuteBars({
      tradingDate: "2026-08-18",
      capturedAt: new Date("2026-08-18T00:04:30.000Z"),
      bars: [
        { symbol: "005930", minuteAt: new Date("2026-08-18T00:03:00.000Z"), open: 70_000, high: 70_200, low: 69_900, close: 70_100, volume: 1_000 },
        { symbol: "005930", minuteAt: new Date("2026-08-18T00:04:00.000Z"), open: 70_100, high: 70_200, low: 70_000, close: 70_150, volume: 900 },
        { symbol: "005930", minuteAt: new Date("2026-08-17T00:03:00.000Z"), open: 70_000, high: 70_200, low: 69_900, close: 70_100, volume: 1_000 },
        { symbol: "005930", minuteAt: new Date("2026-08-18T00:02:00.000Z"), open: 70_000, high: 69_900, low: 70_100, close: 70_000, volume: 1_000 },
      ],
    });
    expect(result.bars).toEqual([expect.objectContaining({ minuteAt: new Date("2026-08-18T00:03:00.000Z"), close: 70_100 })]);
    expect(result.rejected).toBe(3);
    expect(result.rejectedReasons).toMatchObject({ unfinished: 1, tradingDate: 1, ohlc: 1 });
  });
});

describe("local intraday experiment bootstrap", () => {
  it("최초 실험이 없어도 저장 유동성 유니버스로 첫 분봉 수집 계획을 반환한다", () => {
    const plan = buildIntradayMinuteCollectionPlan({
      tradingDate: "2026-08-20",
      experiment: null,
      request: null,
      quotes: [{ symbol: "005930", name: "삼성전자" }, { symbol: "000660", name: "SK하이닉스" }],
    });

    expect(plan).toEqual(expect.objectContaining({
      status: "ready",
      mode: "scheduled_collection_bootstrap",
      experimentId: null,
      tradingDate: "2026-08-20",
      quotes: [{ symbol: "005930", name: "삼성전자" }, { symbol: "000660", name: "SK하이닉스" }],
    }));
  });

  it("최초 실험이 없어도 장 마감 시각 이후에는 새 분봉 수집을 시작하지 않는다", () => {
    expect(shouldCloseIntradayExperiment({ tradingDate: "2026-08-20", capturedAt: new Date("2026-08-20T06:31:00.000Z") })).toBe(true);
  });

  it("당일 실제 1분봉·생존 조건식·실제 일봉이 모두 있어야 장중 모의 실험을 시작한다", () => {
    expect(getLocalIntradayBootstrapState({ minuteBarCount: 0, sourceCandidateCount: 12, dailySymbolCount: 19 })).toBe("waiting_for_minute_bars");
    expect(getLocalIntradayBootstrapState({ minuteBarCount: 19, sourceCandidateCount: 0, dailySymbolCount: 19 })).toBe("waiting_for_survivors");
    expect(getLocalIntradayBootstrapState({ minuteBarCount: 19, sourceCandidateCount: 12, dailySymbolCount: 0 })).toBe("waiting_for_daily_bars");
    expect(getLocalIntradayBootstrapState({ minuteBarCount: 19, sourceCandidateCount: 12, dailySymbolCount: 19 })).toBe("ready");
  });

  it("한국 장 마감 최종 분봉 동기화에서만 같은 거래일의 실험을 종료한다", () => {
    expect(shouldCloseIntradayExperiment({ tradingDate: "2026-08-19", capturedAt: new Date("2026-08-19T06:30:00.000Z") })).toBe(false);
    expect(shouldCloseIntradayExperiment({ tradingDate: "2026-08-19", capturedAt: new Date("2026-08-19T06:31:00.000Z") })).toBe(true);
    expect(shouldCloseIntradayExperiment({ tradingDate: "2026-08-19", capturedAt: new Date("2026-08-20T06:31:00.000Z") })).toBe(false);
  });

  it("장 마감 시 마지막 실제 1분봉 가격과 관찰 시각을 종목별 청산값으로 확정한다", () => {
    const closed = closeIntradayCandidateSimulation({
      status: "tracking",
      entries: [
        { symbol: "005930", entryPrice: 70_000, lastPrice: 71_200, lastObservedAt: "2026-08-19T06:30:00.000Z" },
        { symbol: "000660", entryPrice: 150_000, lastPrice: 149_000 },
      ],
    }, new Date("2026-08-19T06:31:00.000Z")) as { status: string; closedAt: string; entries: Array<{ exitPrice: number; exitAt: string }> };

    expect(closed).toMatchObject({ status: "closed", closedAt: "2026-08-19T06:31:00.000Z" });
    expect(closed.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ exitPrice: 71_200, exitAt: "2026-08-19T06:30:00.000Z" }),
      expect.objectContaining({ exitPrice: 149_000, exitAt: "2026-08-19T06:31:00.000Z" }),
    ]));
  });
});

describe("local daily-bar synchronization", () => {
  it("실제 ka10081 일봉만 날짜별 최신 원본으로 정규화하고 비정상 OHLC를 거부한다", () => {
    const result = selectValidLocalDailyBars({
      bars: [
        { date: "2026-08-14", open: 70_000, high: 71_000, low: 69_800, close: 70_500, volume: 1_200_000, turnover: 84_600_000_000 },
        { date: "2026-08-14", open: 70_000, high: 71_500, low: 69_800, close: 71_000, volume: 1_300_000, turnover: 92_300_000_000 },
        { date: "2026-08-15", open: 71_000, high: 70_500, low: 69_800, close: 70_900, volume: 1_000, turnover: 70_900_000 },
        { date: "20260818", open: 71_000, high: 71_300, low: 70_900, close: 71_100, volume: 1_000, turnover: 71_100_000 },
      ],
    });

    expect(result.rejected).toBe(2);
    expect(result.deduplicated).toBe(1);
    expect(result.bars).toEqual([expect.objectContaining({ date: "2026-08-14", close: 71_000, turnover: 92_300_000_000 })]);
  });

  it("실제 원본 지문이 같으면 같은 불변 데이터셋 버전을, 원본이 바뀌면 새 버전을 만든다", () => {
    const baseline = buildLocalDailyDatasetVersion({
      symbol: "005930",
      adjustmentBasis: "adjusted",
      bars: [
        { date: "2026-08-14", rawFingerprint: "a".repeat(64) },
        { date: "2026-08-18", rawFingerprint: "b".repeat(64) },
      ],
    });
    const reordered = buildLocalDailyDatasetVersion({
      symbol: "005930",
      adjustmentBasis: "adjusted",
      bars: [
        { date: "2026-08-18", rawFingerprint: "b".repeat(64) },
        { date: "2026-08-14", rawFingerprint: "a".repeat(64) },
      ],
    });
    const revised = buildLocalDailyDatasetVersion({
      symbol: "005930",
      adjustmentBasis: "adjusted",
      bars: [
        { date: "2026-08-14", rawFingerprint: "a".repeat(64) },
        { date: "2026-08-18", rawFingerprint: "c".repeat(64) },
      ],
    });

    expect(baseline.versionKey).toContain("local-ka10081:adjusted:005930:2026-08-14:2026-08-18:");
    expect(reordered).toEqual(baseline);
    expect(revised.versionKey).not.toBe(baseline.versionKey);
    expect(revised.sourceFingerprint).not.toBe(baseline.sourceFingerprint);
  });

  it("최신 단일 종목 스냅샷은 건너뛰고 저장된 다종목 실제 유니버스를 일봉 수집 대상으로 선택한다", () => {
    const universe = selectLocalDailyCollectionUniverse([
      { universeJson: [{ symbol: "005930", name: "삼성전자" }] },
      { universeJson: '[{"symbol":"000660","name":"SK하이닉스"},{"symbol":"005930","name":"삼성전자"},{"symbol":"000660","name":"중복"},{"symbol":"bad","name":"제외"}]' },
    ]);
    expect(universe).toEqual([{ symbol: "000660", name: "SK하이닉스" }, { symbol: "005930", name: "삼성전자" }]);
  });

  it("다종목 불변 스냅샷은 종목 구성과 원본 지문이 같을 때만 같은 버전을 재사용한다", () => {
    const baseline = buildLocalDailyUniverseDatasetVersion({
      symbols: ["000660", "005930"], adjustmentBasis: "adjusted",
      bars: [{ symbol: "005930", date: "2026-08-18", rawFingerprint: "a".repeat(64) }, { symbol: "000660", date: "2026-08-18", rawFingerprint: "b".repeat(64) }],
    });
    const repeated = buildLocalDailyUniverseDatasetVersion({
      symbols: ["005930", "000660"], adjustmentBasis: "adjusted",
      bars: [{ symbol: "000660", date: "2026-08-18", rawFingerprint: "b".repeat(64) }, { symbol: "005930", date: "2026-08-18", rawFingerprint: "a".repeat(64) }],
    });
    const revised = buildLocalDailyUniverseDatasetVersion({
      symbols: ["000660", "005930"], adjustmentBasis: "adjusted",
      bars: [{ symbol: "005930", date: "2026-08-18", rawFingerprint: "c".repeat(64) }, { symbol: "000660", date: "2026-08-18", rawFingerprint: "b".repeat(64) }],
    });
    expect(baseline.versionKey).toContain("local-ka10081:adjusted:universe:");
    expect(repeated).toEqual(baseline);
    expect(revised.versionKey).not.toBe(baseline.versionKey);
  });
});

describe("고정 IP 공용 일봉·5분봉 원본 스냅샷", () => {
  it("같은 랜덤 시드와 실제 원본은 같은 평가 구간을 선택하며 주문 데이터 없이 일봉·5분봉만 보존한다", () => {
    const universe = [{ symbol: "005930", name: "삼성전자" }, { symbol: "000660", name: "SK하이닉스" }];
    const dates = Array.from({ length: 72 }, (_, index) => new Date(Date.UTC(2025, 9, 1 + index)).toISOString().slice(0, 10));
    const dailyBars = universe.flatMap((item, itemIndex) => dates.map((date, index) => ({ symbol: item.symbol, date, open: 70_000 + itemIndex * 1_000 + index, high: 70_500 + itemIndex * 1_000 + index, low: 69_800 + itemIndex * 1_000 + index, close: 70_200 + itemIndex * 1_000 + index, volume: 1_000 + index, turnover: 70_200_000 + index })));
    const fiveMinuteBars = universe.flatMap((item, itemIndex) => dates.map((date, index) => ({ symbol: item.symbol, intervalAt: `${date}T00:00:00.000Z`, open: 70_000 + itemIndex * 1_000 + index, high: 70_500 + itemIndex * 1_000 + index, low: 69_800 + itemIndex * 1_000 + index, close: 70_200 + itemIndex * 1_000 + index, volume: 1_000 + index })));
    const input = { universe, dailyBars, fiveMinuteBars, sampleDays: 5, randomSeed: 21 };

    const first = selectSharedCollectionPayload(input);
    const repeated = selectSharedCollectionPayload(input);

    expect(first).not.toHaveProperty("error");
    expect(first).toEqual(repeated);
    if ("error" in first) throw new Error(first.error);
    expect(first.selectedDailyBars.every(bar => universe.some(item => item.symbol === bar.symbol))).toBe(true);
    expect(first.selectedFiveMinuteBars.every(bar => bar.tradingDate >= first.window.evaluationStartDate && bar.tradingDate <= first.window.endDate)).toBe(true);
  });
});
