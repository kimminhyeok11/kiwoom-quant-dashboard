import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  insertValues: vi.fn(),
  insert: vi.fn(),
  select: vi.fn(),
  updateSet: vi.fn(),
  update: vi.fn(),
}));

vi.mock("./db", () => ({ getDb: vi.fn(async () => database) }));

import { researchRouter } from "./routers/research";

function operatorContext() {
  return { req: {} as never, res: {} as never, user: { id: 90, openId: "research-operator", email: "SALAD20C@GMAIL.COM", role: "user" } };
}

describe("리서치 데이터셋·실험 API", () => {
  beforeEach(() => {
    database.insertValues.mockReset(); database.insert.mockReset(); database.select.mockReset(); database.updateSet.mockReset(); database.update.mockReset();
    database.insert.mockReturnValue({ values: database.insertValues });
    database.insertValues.mockReturnValue({ $returningId: async () => [{ id: 301 }] });
    database.update.mockReturnValue({ set: database.updateSet });
    database.updateSet.mockReturnValue({ where: async () => undefined });
  });

  it("운영자가 실제 종목 유니버스와 기간을 가진 초안 데이터셋을 만든다", async () => {
    const caller = researchRouter.createCaller(operatorContext() as never);
    await expect(caller.createDataset({ name: "KOSPI 연구 유니버스", versionKey: "krx-daily-r1", universe: [{ symbol: "005930", name: "삼성전자" }], startDate: "2020-01-02", endDate: "2025-12-30", adjustmentBasis: "unknown" })).resolves.toEqual({ id: 301, qualityStatus: "draft" });
    expect(database.insertValues).toHaveBeenCalledWith(expect.objectContaining({ userId: 90, qualityStatus: "draft", versionKey: "krx-daily-r1" }));
  });

  it("잘못된 기간의 데이터셋을 DB 기록 전에 거부한다", async () => {
    const caller = researchRouter.createCaller(operatorContext() as never);
    await expect(caller.createDataset({ name: "잘못된 기간", versionKey: "krx-daily-r2", universe: [{ symbol: "005930" }], startDate: "2025-12-30", endDate: "2020-01-02", adjustmentBasis: "unknown" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(database.insert).not.toHaveBeenCalled();
  });

  it("가격 조정 기준이 unknown인 데이터셋은 원본 수집 전에 거부한다", async () => {
    const draftDataset = { id: 8, userId: 90, qualityStatus: "draft", adjustmentBasis: "unknown", universeJson: [{ symbol: "005930" }], startDate: "2020-01-02", endDate: "2025-12-30" };
    database.select.mockImplementation(() => ({ from: () => ({ where: () => ({ limit: async () => [draftDataset] }) }) }));
    const caller = researchRouter.createCaller(operatorContext() as never);
    await expect(caller.collectDataset({ datasetId: 8, maxPagesPerSymbol: 3 })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(database.update).not.toHaveBeenCalled();
  });

  it("ready 데이터셋의 고정 일봉과 저장된 전략 스냅샷으로만 실험을 완료한다", async () => {
    const experiment = { id: 44, userId: 90, datasetId: 8, informationCutoffTradingDays: 1, validationStartDate: null, validationEndDate: null, strategySnapshotJson: { rulesJson: [{ id: "ma", type: "ma_position", enabled: true, weight: 100, config: { periods: "5,21,60" } }] }, assumptionsJson: { entryTiming: "next_open", feeRate: 0.00015, slippageBps: 5, maxHoldingDays: 3, maxConcurrentPositions: 10 } };
    const dataset = { id: 8, userId: 90, versionKey: "krx-daily-r1", qualityStatus: "ready" };
    const bars = Array.from({ length: 75 }, (_, index) => ({ datasetId: 8, symbol: "005930", date: `2026-02-${String((index % 28) + 1).padStart(2, "0")}`, open: 10_000 + index * 100 - 20, high: 10_000 + index * 100 + 50, low: 10_000 + index * 100 - 40, close: 10_000 + index * 100, volume: "100000", turnover: "60000000000" }));
    const selections: unknown[][] = [[experiment], [dataset], bars];
    database.select.mockImplementation(() => ({ from: () => ({ where: () => ({ limit: async () => selections.shift(), orderBy: async () => selections.shift() }) }) }));
    const caller = researchRouter.createCaller(operatorContext() as never);
    const result = await caller.runExperiment({ experimentId: 44, symbol: "005930", initialCapital: 10_000_000, minScore: 100 });
    expect(result).toMatchObject({ experimentId: 44, datasetVersionKey: "krx-daily-r1", symbol: "005930" });
    expect(result.result.tradeCount).toBeGreaterThan(0);
    expect(database.updateSet).toHaveBeenCalledWith(expect.objectContaining({ status: "completed", resultsJson: expect.objectContaining({ datasetVersionKey: "krx-daily-r1", informationCutoffTradingDays: 1 }) }));
  });

  it("ready 실제 데이터셋에서만 첫 세대의 중복 없는 고차원 조건식 유전자를 만든다", async () => {
    const dataset = { id: 8, userId: 90, qualityStatus: "ready" };
    database.select.mockImplementation(() => ({ from: () => ({ where: () => ({ limit: async () => [dataset] }) }) }));
    const returnedIds = [701, 702];
    database.insertValues.mockImplementation(() => ({ $returningId: async () => [{ id: returnedIds.shift() }] }));
    const caller = researchRouter.createCaller(operatorContext() as never);
    const result = await caller.createEvolutionSearch({ datasetId: 8, name: "세대 0 탐색", randomSeed: 20260814, configuration: { populationSize: 20, minRules: 10, maxRules: 12, maxDepth: 3, allowedRuleTypes: ["macd_rising", "ma_position", "high_return", "turnover"], eliteCount: 4, crossoverRate: 0.7, mutationRate: 0.2, minimumTrades: 3, maxDrawdownLimit: -25, holdingDays: 5, feeRate: 0.00015, slippageBps: 10, informationCutoffTradingDays: 1, entryTiming: "next_open" } });
    expect(result).toEqual({ searchId: 701, generationId: 702, uniqueCandidateCount: 20, status: "queued" });
    const candidatePayload = database.insertValues.mock.calls[2]?.[0] as Array<{ fingerprint: string; rootGenomeJson: { children: unknown[] } }>;
    expect(new Set(candidatePayload.map(item => item.fingerprint)).size).toBe(20);
    expect(candidatePayload.every(item => item.rootGenomeJson.children.length >= 2)).toBe(true);
  });

  it("초안 데이터셋에서는 진화형 조건식 생성 전 DB 기록을 거부한다", async () => {
    const dataset = { id: 8, userId: 90, qualityStatus: "draft" };
    database.select.mockImplementation(() => ({ from: () => ({ where: () => ({ limit: async () => [dataset] }) }) }));
    const caller = researchRouter.createCaller(operatorContext() as never);
    await expect(caller.createEvolutionSearch({ datasetId: 8, name: "준비 전 탐색", randomSeed: 1, configuration: { populationSize: 20, minRules: 10, maxRules: 12, maxDepth: 3, allowedRuleTypes: ["macd_rising"], eliteCount: 4, crossoverRate: 0.7, mutationRate: 0.2, minimumTrades: 3, maxDrawdownLimit: -25, holdingDays: 5, feeRate: 0.00015, slippageBps: 10, informationCutoffTradingDays: 1, entryTiming: "next_open" } })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(database.insert).not.toHaveBeenCalled();
  });

  it("고정 실제 일봉·비용·정보 절단 가정으로 유전자 후보를 평가하고 적합도를 기록한다", async () => {
    const candidate = { id: 55, searchId: 71, minimumScore: 10, rootGenomeJson: { id: "root", logic: "AND", enabled: true, children: [{ id: "turnover", type: "turnover", enabled: true, weight: 20, config: { days: 5, threshold: 1, unit: "억원", comparator: "이상" } }] } };
    const search = { id: 71, userId: 90, datasetId: 8, configurationJson: { populationSize: 20, minRules: 10, maxRules: 12, maxDepth: 3, allowedRuleTypes: ["turnover"], eliteCount: 4, crossoverRate: 0.7, mutationRate: 0.2, minimumTrades: 1, maxDrawdownLimit: -25, holdingDays: 3, feeRate: 0.00015, slippageBps: 5, informationCutoffTradingDays: 1, entryTiming: "next_open" } };
    const dataset = { id: 8, userId: 90, versionKey: "krx-daily-r1", qualityStatus: "ready" };
    const bars = Array.from({ length: 75 }, (_, index) => ({ datasetId: 8, symbol: "005930", date: `2026-03-${String((index % 28) + 1).padStart(2, "0")}`, open: 10_000 + index * 100 - 20, high: 10_000 + index * 100 + 50, low: 10_000 + index * 100 - 40, close: 10_000 + index * 100, volume: "100000", turnover: "60000000000" }));
    const selections: unknown[][] = [[candidate], [search], [dataset], bars];
    database.select.mockImplementation(() => ({ from: () => ({ where: () => ({ limit: async () => selections.shift(), orderBy: async () => selections.shift() }) }) }));
    const caller = researchRouter.createCaller(operatorContext() as never);
    const result = await caller.evaluateEvolutionCandidate({ candidateId: 55, symbol: "005930" });
    expect(result).toMatchObject({ candidateId: 55, datasetVersionKey: "krx-daily-r1", symbol: "005930", metrics: { tradeCount: expect.any(Number) }, fitnessScore: expect.any(Number) });
    expect(database.updateSet).toHaveBeenCalledWith(expect.objectContaining({ status: "evaluated", fitnessScore: expect.any(String), inSampleMetricsJson: expect.objectContaining({ datasetVersionKey: "krx-daily-r1", informationCutoffTradingDays: 1 }) }));
  });

  it("유전자 후보는 독립 검증 시작일 이후의 고정 일봉으로만 아웃오브샘플 성과를 기록한다", async () => {
    const candidate = { id: 55, searchId: 71, minimumScore: 10, rootGenomeJson: { id: "root", logic: "AND", enabled: true, children: [{ id: "turnover", type: "turnover", enabled: true, weight: 20, config: { days: 5, threshold: 1, unit: "억원", comparator: "이상" } }] } };
    const search = { id: 71, userId: 90, datasetId: 8, configurationJson: { populationSize: 20, minRules: 10, maxRules: 12, maxDepth: 3, allowedRuleTypes: ["turnover"], eliteCount: 4, crossoverRate: 0.7, mutationRate: 0.2, minimumTrades: 1, maxDrawdownLimit: -25, holdingDays: 3, feeRate: 0.00015, slippageBps: 5, informationCutoffTradingDays: 1, entryTiming: "next_open" } };
    const dataset = { id: 8, userId: 90, versionKey: "krx-daily-r1", qualityStatus: "ready" };
    const bars = Array.from({ length: 90 }, (_, index) => ({ datasetId: 8, symbol: "005930", date: `2024-${String(Math.floor(index / 20) + 1).padStart(2, "0")}-${String((index % 20) + 1).padStart(2, "0")}`, open: 10_000 + index * 100 - 20, high: 10_000 + index * 100 + 50, low: 10_000 + index * 100 - 40, close: 10_000 + index * 100, volume: "100000", turnover: "60000000000" }));
    const selections: unknown[][] = [[candidate], [search], [dataset], bars];
    database.select.mockImplementation(() => ({ from: () => ({ where: () => ({ limit: async () => selections.shift(), orderBy: async () => selections.shift() }) }) }));
    const caller = researchRouter.createCaller(operatorContext() as never);
    const result = await caller.validateEvolutionCandidate({ candidateId: 55, symbol: "005930", validationStartDate: "2024-04-01" });
    expect(result).toMatchObject({ candidateId: 55, datasetVersionKey: "krx-daily-r1", validationStartDate: "2024-04-01", metrics: { tradeCount: expect.any(Number) } });
    expect(database.updateSet).toHaveBeenCalledWith(expect.objectContaining({ outOfSampleMetricsJson: expect.objectContaining({ validationStartDate: "2024-04-01", datasetVersionKey: "krx-daily-r1" }) }));
  });

  it("생존 유전자는 고정 실제 일봉의 반복 폴드 워크포워드 성과를 기록한다", async () => {
    const candidate = { id: 55, searchId: 71, status: "survived", minimumScore: 10, rootGenomeJson: { id: "root", logic: "AND", enabled: true, children: [{ id: "turnover", type: "turnover", enabled: true, weight: 20, config: { days: 5, threshold: 1, unit: "억원", comparator: "이상" } }] } };
    const search = { id: 71, userId: 90, datasetId: 8, configurationJson: { populationSize: 20, minRules: 10, maxRules: 12, maxDepth: 3, allowedRuleTypes: ["turnover"], eliteCount: 4, crossoverRate: 0.7, mutationRate: 0.2, minimumTrades: 1, maxDrawdownLimit: -25, holdingDays: 3, feeRate: 0.00015, slippageBps: 5, informationCutoffTradingDays: 1, entryTiming: "next_open" } };
    const dataset = { id: 8, userId: 90, versionKey: "krx-daily-r1", qualityStatus: "ready" };
    const bars = Array.from({ length: 140 }, (_, index) => ({ datasetId: 8, symbol: "005930", date: `2024-${String(Math.floor(index / 20) + 1).padStart(2, "0")}-${String((index % 20) + 1).padStart(2, "0")}`, open: 10_000 + index * 100 - 20, high: 10_000 + index * 100 + 50, low: 10_000 + index * 100 - 40, close: 10_000 + index * 100, volume: "100000", turnover: "60000000000" }));
    const selections: unknown[][] = [[candidate], [search], [dataset], bars];
    database.select.mockImplementation(() => ({ from: () => ({ where: () => ({ limit: async () => selections.shift(), orderBy: async () => selections.shift() }) }) }));
    const caller = researchRouter.createCaller(operatorContext() as never);
    const result = await caller.runEvolutionCandidateWalkForward({ candidateId: 55, symbol: "005930", trainingDays: 60, validationDays: 20, stepDays: 20 });
    expect(result).toMatchObject({ candidateId: 55, datasetVersionKey: "krx-daily-r1", symbol: "005930", result: { foldCount: 4 } });
    expect(database.updateSet).toHaveBeenCalledWith(expect.objectContaining({ walkForwardMetricsJson: expect.objectContaining({ datasetVersionKey: "krx-daily-r1", configuration: expect.objectContaining({ trainingDays: 60, validationDays: 20 }) }) }));
  });

  it("생존 유전자의 선택 규칙 수치를 독립 확장 세대의 파생 후보로 저장한다", async () => {
    const parent = { id: 55, searchId: 71, status: "survived", minimumScore: 40, rootGenomeJson: { id: "root", logic: "AND", enabled: true, children: [{ id: "rsi", type: "rsi", enabled: true, weight: 10, config: { period: 14, threshold: 35, comparator: "이상" } }] } };
    const search = { id: 71, userId: 90, datasetId: 8, configurationJson: { populationSize: 20, minRules: 10, maxRules: 12, maxDepth: 3, allowedRuleTypes: ["rsi"], eliteCount: 4, crossoverRate: 0.7, mutationRate: 0.2, minimumTrades: 1, maxDrawdownLimit: -25, holdingDays: 3, feeRate: 0.00015, slippageBps: 5, informationCutoffTradingDays: 1, entryTiming: "next_open" } };
    const dataset = { id: 8, userId: 90, versionKey: "krx-daily-r1", qualityStatus: "ready" };
    const latestGeneration = { id: 101, generationNumber: 2 };
    const selections: unknown[][] = [[parent], [search], [dataset], [], [latestGeneration]];
    database.select.mockImplementation(() => ({ from: () => ({ where: () => ({ limit: async () => selections.shift(), orderBy: () => ({ limit: async () => selections.shift() }) }) }) }));
    const ids = [301, 302]; database.insertValues.mockImplementation(() => ({ $returningId: async () => [{ id: ids.shift() }] }));
    const caller = researchRouter.createCaller(operatorContext() as never);
    await expect(caller.manuallyExpandEvolutionCandidate({ candidateId: 55, change: { kind: "rule_numeric", targetNodeId: "rsi", key: "threshold", next: 40 } })).resolves.toMatchObject({ candidateId: 302, generationId: 301, generationNumber: 3, parentCandidateId: 55, mutation: { targetNodeId: "rsi", key: "threshold", previous: 35, next: 40 } });
    expect(database.insertValues).toHaveBeenNthCalledWith(2, expect.objectContaining({ origin: "manual_expand", parentCandidateIdsJson: [55], mutationJson: expect.objectContaining({ key: "threshold", next: 40 }) }));
  });

  it("세대별 후보·생존율·인샘플·아웃오브샘플 평균과 상위 후보를 연구자별로 집계한다", async () => {
    const search = { id: 71, userId: 90 };
    const generations = [{ id: 101, searchId: 71, generationNumber: 0, populationSize: 4, uniqueCandidateCount: 4, status: "completed" }];
    const candidates = [
      { id: 1, generationId: 101, searchId: 71, status: "survived", fitnessScore: "10.5", inSampleMetricsJson: { metrics: { totalReturn: 12 } }, outOfSampleMetricsJson: { metrics: { totalReturn: 4 } }, walkForwardMetricsJson: { result: { totalReturn: 3 } } },
      { id: 2, generationId: 101, searchId: 71, status: "rejected", fitnessScore: "5.5", inSampleMetricsJson: { metrics: { totalReturn: 8 } }, outOfSampleMetricsJson: { metrics: { totalReturn: -2 } }, walkForwardMetricsJson: { result: { totalReturn: 1 } } },
      { id: 3, generationId: 101, searchId: 71, status: "created", fitnessScore: null, inSampleMetricsJson: null, outOfSampleMetricsJson: null },
    ];
    const selections: unknown[][] = [[search], generations, candidates];
    database.select.mockImplementation(() => ({ from: () => ({ where: () => ({ limit: async () => selections.shift(), orderBy: async () => selections.shift() }) }) }));
    const caller = researchRouter.createCaller(operatorContext() as never);
    await expect(caller.listEvolutionGenerationSummaries({ searchId: 71 })).resolves.toMatchObject([{ generationId: 101, evaluatedCandidateCount: 2, survivorCandidateCount: 1, survivalRate: 0.5, averageInSampleReturn: 10, averageOutOfSampleReturn: 1, averageWalkForwardReturn: 2, bestCandidate: { id: 1, fitnessScore: "10.5" } }]);
  });

  it("평가 완료 후보를 선발해 원 세대 상태를 갱신하고 중복 없는 파생 유전자만 다음 세대에 저장한다", async () => {
    const root = (id: string) => ({ id, logic: "AND", enabled: true, children: Array.from({ length: 10 }, (_, index) => ({ id: `${id}-${index}`, type: "turnover", enabled: true, weight: 10 + index, config: { days: 5, threshold: 10 + index * 10, unit: "억원", comparator: "이상" } })) });
    const search = { id: 71, userId: 90, datasetId: 8, randomSeed: 20260814, configurationJson: { populationSize: 10, minRules: 10, maxRules: 10, maxDepth: 3, allowedRuleTypes: ["turnover"], eliteCount: 2, crossoverRate: 0.7, mutationRate: 0.2, minimumTrades: 1, maxDrawdownLimit: -25, holdingDays: 3, feeRate: 0.00015, slippageBps: 5, informationCutoffTradingDays: 1, entryTiming: "next_open" } };
    const generation = { id: 31, searchId: 71, generationNumber: 0 };
    const candidates = Array.from({ length: 4 }, (_, index) => ({ id: index + 1, searchId: 71, generationId: 31, fingerprint: `f${index}`, rootGenomeJson: root(`root-${index}`), minimumScore: 30, status: "evaluated", inSampleMetricsJson: { metrics: { totalReturn: 10 + index, maxDrawdown: -10, tradeCount: 10, winRate: 50 } }, fitnessScore: String(10 + index) }));
    const selections: unknown[][] = [[search], [{ id: 8, userId: 90, versionKey: "krx-daily-r1" }], [generation], candidates]; let orderByCalls = 0;
    database.select.mockImplementation(() => ({ from: () => ({ where: () => ({ limit: async () => selections.shift(), orderBy: () => { orderByCalls += 1; return orderByCalls === 1 ? { limit: async () => selections.shift() } : Promise.resolve(selections.shift()); } }) }) }));
    database.insertValues.mockImplementation(() => ({ $returningId: async () => [{ id: 81 }] }));
    const caller = researchRouter.createCaller(operatorContext() as never);
    const result = await caller.advanceEvolutionGeneration({ searchId: 71 });
    expect(result).toMatchObject({ searchId: 71, generationId: 81, generationNumber: 1, uniqueCandidateCount: 10, survivorCandidateIds: [4, 3] });
    const derived = database.insertValues.mock.calls.at(-1)?.[0] as Array<{ fingerprint: string; origin: string; parentCandidateIdsJson: number[] }>;
    expect(derived).toHaveLength(10); expect(new Set(derived.map(item => item.fingerprint)).size).toBe(10);
    expect(derived.every(item => ["crossover", "mutation"].includes(item.origin))).toBe(true);
  });
});
