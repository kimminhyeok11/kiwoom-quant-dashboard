import { afterEach, describe, expect, it, vi } from "vitest";
import { buildLocalSnapshotRunKey, classifyPendingReuseRuns, PublicHistoricalBacktestRunner, selectFreshHistoricalUniverse } from "./publicHistoricalBacktest";
import type { getDb } from "../db";

describe("PublicHistoricalBacktestRunner", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("저장소가 없으면 브로커 호출 없이 안전한 대기 상태를 반환한다", async () => {
    const createClient = vi.fn();
    const runner = new PublicHistoricalBacktestRunner({ getDb: (async () => null) as typeof getDb, createClient: createClient as never });

    await expect(runner.run()).resolves.toEqual({ status: "waiting", runId: null, message: "백테스트 저장소를 사용할 수 없습니다.", reused: false });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("동시 공개 요청은 하나의 실행만 공유한다", async () => {
    let release: (() => void) | undefined;
    const pending = new Promise<null>(resolve => { release = () => resolve(null); });
    const getDbMock = vi.fn(() => pending);
    const runner = new PublicHistoricalBacktestRunner({ getDb: getDbMock as unknown as typeof getDb });

    const first = runner.run();
    const second = runner.run();
    release?.();

    await expect(Promise.all([first, second])).resolves.toEqual([
      { status: "waiting", runId: null, message: "백테스트 저장소를 사용할 수 없습니다.", reused: false },
      { status: "waiting", runId: null, message: "백테스트 저장소를 사용할 수 없습니다.", reused: false },
    ]);
    expect(getDbMock).toHaveBeenCalledTimes(1);
  });

  it("사용자가 직접 실행하면 보류 환경 변수와 무관하게 실제 원본 수집 경로를 시작한다", async () => {
    vi.stubEnv("AUTONOMOUS_RESEARCH_EXTERNAL_DATA_ENABLED", "false");
    const getDbMock = vi.fn(async () => null);
    const createClient = vi.fn();
    const runner = new PublicHistoricalBacktestRunner({ getDb: getDbMock as unknown as typeof getDb, createClient: createClient as never });

    await expect(runner.run()).resolves.toEqual({ status: "waiting", runId: null, message: "백테스트 저장소를 사용할 수 없습니다.", reused: false });
    expect(getDbMock).toHaveBeenCalledTimes(1);
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe("저장 실제 원본 재실행 복구", () => {
  it("최근 pending 재실행은 중복 실행하지 않고 진행 상태로 반환한다", () => {
    const now = new Date("2026-08-17T19:12:00.000Z");
    expect(classifyPendingReuseRuns([{ id: 7, runKey: "autonomous-v1:2026-08-15:historical:reuse:7", dataStatus: "pending", updatedAt: new Date("2026-08-17T19:11:30.000Z") }], now)).toEqual({ activeRunId: 7, staleRunIds: [] });
  });

  it("중단된 pending 재실행은 다음 요청에서 incomplete로 복구할 수 있게 분류한다", () => {
    const now = new Date("2026-08-17T19:12:00.000Z");
    expect(classifyPendingReuseRuns([{ id: 8, runKey: "autonomous-v1:2026-08-15:historical:reuse:8", dataStatus: "pending", updatedAt: new Date("2026-08-17T19:10:30.000Z") }], now)).toEqual({ activeRunId: null, staleRunIds: [8] });
  });

  it("불변 로컬 실제 일봉 스냅샷은 데이터셋 ID와 원본 지문으로 실행 키를 분리한다", () => {
    const first = buildLocalSnapshotRunKey({ datasetId: 1, referenceDate: "2026-08-18", versionKey: "local-ka10081:adjusted:005930:2024-02-28:2026-08-18:aaaaaaaaaaaaaaaa" });
    const repeated = buildLocalSnapshotRunKey({ datasetId: 1, referenceDate: "2026-08-18", versionKey: "local-ka10081:adjusted:005930:2024-02-28:2026-08-18:aaaaaaaaaaaaaaaa" });
    const revised = buildLocalSnapshotRunKey({ datasetId: 2, referenceDate: "2026-08-18", versionKey: "local-ka10081:adjusted:005930:2024-02-28:2026-08-18:bbbbbbbbbbbbbbbb" });
    expect(first).toBe("autonomous-v1:2026-08-18:historical:local:1:aaaaaaaaaaaaaaaa");
    expect(repeated).toBe(first);
    expect(revised).not.toBe(first);
  });
});

describe("실제 유니버스 선택", () => {
  it("거래대금 순위가 비어 있으면 직전 저장 실제 유니버스를 ka10081 수집 대상으로 재사용한다", () => {
    expect(selectFreshHistoricalUniverse([], [{ universeJson: [{ symbol: "005930", name: "삼성전자" }, { symbol: "000660", name: "SK하이닉스" }] }], 20)).toEqual({
      source: "stored_actual_universe",
      universe: [
        { symbol: "005930", name: "삼성전자", turnover: 0, price: 0, changeRate: 0 },
        { symbol: "000660", name: "SK하이닉스", turnover: 0, price: 0, changeRate: 0 },
      ],
    });
  });

  it("현재 거래대금 순위가 있으면 저장 유니버스보다 현재 실제 순위를 우선한다", () => {
    const current = [{ symbol: "035420", name: "NAVER", turnover: 1, price: 2, changeRate: 3 }];
    expect(selectFreshHistoricalUniverse(current, [{ universeJson: [{ symbol: "005930", name: "삼성전자" }] }], 20)).toEqual({ source: "kiwoom_ka10032", universe: current });
  });

  it("DB 드라이버가 JSON 배열을 문자열로 반환해도 저장 실제 유니버스를 복원한다", () => {
    expect(selectFreshHistoricalUniverse([], [{ universeJson: '[{"symbol":"005930","name":"삼성전자"}]' }], 20)).toEqual({
      source: "stored_actual_universe",
      universe: [{ symbol: "005930", name: "삼성전자", turnover: 0, price: 0, changeRate: 0 }],
    });
  });
});
