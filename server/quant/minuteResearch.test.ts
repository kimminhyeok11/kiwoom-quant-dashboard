import { describe, expect, it } from "vitest";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_MINUTE_RESEARCH_CONFIGURATION, enqueueMinuteResearchSweep, isMinuteResearchSweepStale, MINUTE_RESEARCH_EVALUATION_BATCH_SIZE, prepareStoredMinuteResearchDataset, qualificationReasons, summarizeMinuteResearchError, summarizeMinuteTrades, type MinuteResearchMetrics, type StoredMinuteResearchBar } from "./minuteResearch";
import type { MinuteValidationTrade } from "./minuteValidation";

function trade(returnPercent: number): MinuteValidationTrade {
  return {
    signalAt: new Date("2026-08-18T00:00:00.000Z"),
    entryAt: new Date("2026-08-18T00:01:00.000Z"),
    entryPrice: 10_000,
    exitAt: new Date("2026-08-18T00:10:00.000Z"),
    exitPrice: 10_000,
    exitReason: "time_exit",
    buyFee: 0,
    sellFee: 0,
    netPnl: 0,
    netReturnPercent: returnPercent,
  };
}

const metrics = (overrides: Partial<MinuteResearchMetrics> = {}): MinuteResearchMetrics => ({
  tradeCount: 30,
  winRate: 60,
  netReturnPercent: 4,
  expectancyPercent: 0.2,
  maxDrawdownPercent: -2,
  profitFactor: 1.5,
  positiveDayRate: 60,
  dailyReturnStdDev: 0.7,
  ...overrides,
});

const storedMinuteBars: StoredMinuteResearchBar[] = [
  { tradingDate: "2026-08-17", symbol: "000001", minuteAt: new Date("2026-08-17T00:00:00.000Z"), open: 100, high: 101, low: 99, close: 100, volume: 100 },
  { tradingDate: "2026-08-17", symbol: "000001", minuteAt: new Date("2026-08-17T00:01:00.000Z"), open: 100, high: 103, low: 100, close: 102, volume: 200 },
  { tradingDate: "2026-08-18", symbol: "000002", minuteAt: new Date("2026-08-18T00:00:00.000Z"), open: 200, high: 205, low: 198, close: 204, volume: 300 },
  { tradingDate: "2026-08-18", symbol: "000002", minuteAt: new Date("2026-08-18T00:01:00.000Z"), open: 204, high: 206, low: 203, close: 205, volume: 250 },
];

describe("1분봉 대량 연구 성과 요약", () => {
  it("긴 데이터베이스 오류는 원인 중심으로 축약해 스윕 실패 상태에 저장할 수 있다", () => {
    const rootCause = new Error("Data Too Long, field len 500, data len 2189");
    const error = Object.assign(new Error("Failed query: insert into minute_research_candidates " + "x".repeat(2_000)), { cause: rootCause });

    const message = summarizeMinuteResearchError(error);

    expect(message).toContain("Data Too Long");
    expect(message.length).toBeLessThanOrEqual(480);
  });

  it("저장된 1분봉 원본을 날짜·종목별 연구 데이터셋과 유동성 유니버스로 변환한다", () => {
    const dataset = prepareStoredMinuteResearchDataset(storedMinuteBars, 1);

    expect(dataset.dates).toEqual(["2026-08-17", "2026-08-18"]);
    expect(dataset.symbols).toEqual(["000002"]);
    expect(dataset.byDate["2026-08-17"]?.["000001"]?.map(bar => bar.close)).toEqual([100, 102]);
    expect(dataset.byDate["2026-08-18"]?.["000002"]?.[0]?.minuteAt).toEqual(new Date("2026-08-18T00:00:00.000Z"));
  });

  it("실현 수익률 순서로 누적 손익과 최대 낙폭을 계산한다", () => {
    const result = summarizeMinuteTrades([trade(2), trade(-3), trade(1)]);

    expect(result).toMatchObject({
      tradeCount: 3,
      winRate: 66.666667,
      netReturnPercent: 0,
      expectancyPercent: 0,
      maxDrawdownPercent: -3,
    });
  });

  it("독립 검증 수익률 또는 기대값이 음수이면 추천 목록 승격을 막는다", () => {
    const reasons = qualificationReasons({
      training: metrics(),
      validation: metrics({ netReturnPercent: -0.4, expectancyPercent: -0.02 }),
      config: DEFAULT_MINUTE_RESEARCH_CONFIGURATION,
    });

    expect(reasons).toContain("독립 검증 기대값이 0 이하입니다.");
    expect(reasons).toContain("독립 검증 누적 수익률이 0 이하입니다.");
  });

  it("손익비가 1 미만이면 양수 수익률처럼 보여도 승격하지 않는다", () => {
    const reasons = qualificationReasons({
      training: metrics({ profitFactor: 0.8 }),
      validation: metrics({ profitFactor: 0.9 }),
      config: DEFAULT_MINUTE_RESEARCH_CONFIGURATION,
    });

    expect(reasons).toContain("학습 손익비가 1 미만입니다.");
    expect(reasons).toContain("독립 검증 손익비가 1 미만입니다.");
  });

  it("일별 양수 비율이 낮은 조건식은 누적 수익률이 양수여도 승격하지 않는다", () => {
    const reasons = qualificationReasons({
      training: metrics({ positiveDayRate: 40 }),
      validation: metrics({ positiveDayRate: 35 }),
      config: DEFAULT_MINUTE_RESEARCH_CONFIGURATION,
    });

    expect(reasons).toContain("학습 양(+) 일수 비율이 45% 미만입니다.");
    expect(reasons).toContain("독립 검증 양(+) 일수 비율이 45% 미만입니다.");
  });

  it("검증일이 부족한 조건식은 양수 학습 성과만으로 승격하지 않는다", () => {
    const reasons = qualificationReasons({
      training: metrics(),
      validation: null,
      config: DEFAULT_MINUTE_RESEARCH_CONFIGURATION,
    });

    expect(reasons).toContain("독립 검증일이 부족합니다.");
  });

  it("10분 이상 갱신되지 않은 running 배틀만 중단된 실행으로 판정한다", () => {
    const now = new Date("2026-08-21T01:00:00.000Z");
    expect(isMinuteResearchSweepStale({ status: "running", startedAt: new Date("2026-08-21T00:40:00.000Z"), updatedAt: new Date("2026-08-21T00:49:59.000Z") }, now)).toBe(true);
    expect(isMinuteResearchSweepStale({ status: "running", startedAt: new Date("2026-08-21T00:50:00.000Z"), updatedAt: new Date("2026-08-21T00:55:00.000Z") }, now)).toBe(false);
    expect(isMinuteResearchSweepStale({ status: "completed", startedAt: new Date("2026-08-21T00:40:00.000Z"), updatedAt: new Date("2026-08-21T00:40:00.000Z") }, now)).toBe(false);
  });

  it("대량 연구는 HTTP 응답을 막지 않고 다음 이벤트 루프에 접수하며 중복 클릭을 재사용한다", async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    const runner = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));

    expect(enqueueMinuteResearchSweep(712, runner)).toEqual({ status: "queued", programId: 712, reused: false });
    expect(enqueueMinuteResearchSweep(712, runner)).toEqual({ status: "queued", programId: 712, reused: true });
    expect(runner).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(0);
    expect(runner).toHaveBeenCalledTimes(1);
    finish();
    await Promise.resolve();
    vi.useRealTimers();
  });

  it("대량 검증은 연결 점검·공용 데이터 목록 응답을 막지 않도록 한 조합씩 제어권을 양보한다", () => {
    expect(MINUTE_RESEARCH_EVALUATION_BATCH_SIZE).toBe(1);
  });
});
