/**
 * 시장 국면 판단 모듈
 *
 * 검증된 사실:
 * - 상승장(대표종목 20일선 위)에서 변동성 높은 종목의 오버나이트 갭 = PF 1.7
 * - 하락장에서 같은 전략 = PF 0.77
 * - 시장 국면이 전략 수익의 가장 큰 결정 변수
 *
 * 이 모듈은 현재 시장 국면을 판단하고, 국면별 데이터 기반 가이드를 제공한다.
 */

import { desc, eq, sql } from "drizzle-orm";
import { localResearchDailyBars } from "../../drizzle/schema";
import { getDb } from "../db";

export type MarketRegime = "bull" | "bear" | "transition";

export type RegimeAnalysis = {
  regime: MarketRegime;
  regimeLabel: string;
  confidence: number; // 0~100
  referenceSymbol: string;
  referencePrice: number;
  ma20: number;
  ma60: number;
  deviationFromMa20Pct: number;
  consecutiveDaysAboveMa20: number;
  lastUpdated: string;
  // 검증 기반 가이드
  guide: {
    summary: string;
    gapStrategyExpected: string; // 오버나이트 갭 전략 기대값
    riskLevel: "low" | "moderate" | "high";
    recommendation: string;
    evidence: string;
  };
  // 변동성 상위 종목 (상승장에서만 의미 있음)
  highVolatilitySymbols: Array<{
    symbol: string;
    volatilityPct: number;
    prevReturn: number;
    turnover: number;
    gapRelevance: string;
  }>;
};

/**
 * 현재 시장 국면을 분석한다.
 * 대표종목(005930 삼성전자)의 20일선/60일선 기준.
 */
export async function analyzeMarketRegime(): Promise<RegimeAnalysis | null> {
  const db = await getDb();
  if (!db) return null;

  // 대표종목 최근 60일 일봉
  const refSymbol = "005930"; // 삼성전자
  const refBars = await db.select()
    .from(localResearchDailyBars)
    .where(eq(localResearchDailyBars.symbol, refSymbol))
    .orderBy(desc(localResearchDailyBars.date))
    .limit(65);

  if (refBars.length < 25) return null;

  const sorted = refBars.sort((a, b) => a.date.localeCompare(b.date));
  const closes = sorted.map(b => Number(b.close));
  const latest = closes[closes.length - 1];
  const latestDate = sorted[sorted.length - 1].date;

  // 이동평균 계산
  const ma20 = mean(closes.slice(-20));
  const ma60 = closes.length >= 60 ? mean(closes.slice(-60)) : mean(closes);
  const deviationFromMa20Pct = ((latest / ma20) - 1) * 100;

  // 20일선 위 연속일수
  let consecutiveDays = 0;
  for (let i = closes.length - 1; i >= 0; i--) {
    const ma = i >= 20 ? mean(closes.slice(i - 19, i + 1)) : mean(closes.slice(0, i + 1));
    if (closes[i] > ma) consecutiveDays++;
    else break;
  }

  // 국면 판단
  let regime: MarketRegime;
  let confidence: number;

  if (latest > ma20 && ma20 > ma60) {
    regime = "bull";
    confidence = Math.min(95, 50 + consecutiveDays * 3 + Math.max(0, deviationFromMa20Pct * 5));
  } else if (latest < ma20 && ma20 < ma60) {
    regime = "bear";
    confidence = Math.min(95, 50 + Math.abs(deviationFromMa20Pct) * 5);
  } else {
    regime = "transition";
    confidence = 40 + Math.abs(deviationFromMa20Pct) * 3;
  }
  confidence = Math.max(20, Math.min(95, Math.round(confidence)));

  // 전 종목 최근 1일 변동성 조회
  const allRecentBars = await db.select()
    .from(localResearchDailyBars)
    .where(eq(localResearchDailyBars.date, latestDate))
    .orderBy(desc(localResearchDailyBars.turnover))
    .limit(40);

  const highVolSymbols = allRecentBars
    .filter(b => Number(b.open) > 0)
    .map(b => ({
      symbol: b.symbol,
      volatilityPct: ((Number(b.high) - Number(b.low)) / Number(b.open)) * 100,
      prevReturn: ((Number(b.close) / Number(b.open)) - 1) * 100,
      turnover: Number(b.turnover),
      gapRelevance: "",
    }))
    .filter(b => b.volatilityPct > 3)
    .sort((a, b) => b.volatilityPct - a.volatilityPct)
    .slice(0, 10);

  // 국면별 가이드 (검증 데이터 기반)
  const guide = getRegimeGuide(regime, highVolSymbols.length);

  // 갭 전략 관련성 표시
  highVolSymbols.forEach(s => {
    if (regime === "bull") {
      s.gapRelevance = s.volatilityPct > 4 ? "갭 전략 적합 (상승장+변동성>4%)" : "관찰 대상";
    } else if (regime === "bear") {
      s.gapRelevance = "비추천 (하락장에서 갭 전략 PF 0.77)";
    } else {
      s.gapRelevance = "국면 불확실 — 보수적 접근 권장";
    }
  });

  return {
    regime,
    regimeLabel: regime === "bull" ? "상승 국면" : regime === "bear" ? "하락 국면" : "전환 국면",
    confidence,
    referenceSymbol: refSymbol,
    referencePrice: latest,
    ma20: Math.round(ma20),
    ma60: Math.round(ma60),
    deviationFromMa20Pct: Math.round(deviationFromMa20Pct * 100) / 100,
    consecutiveDaysAboveMa20: consecutiveDays,
    lastUpdated: latestDate,
    guide,
    highVolatilitySymbols: highVolSymbols,
  };
}

function getRegimeGuide(regime: MarketRegime, highVolCount: number) {
  if (regime === "bull") {
    return {
      summary: "상승 국면 — 데이터 기반 공격 가능 구간",
      gapStrategyExpected: "양의 기대값 (7년 검증 PF 1.70, 승률 51.5%, 7,986회 표본)",
      riskLevel: "moderate" as const,
      recommendation: `변동성>4% 종목 ${highVolCount}개 중 갭 전략 적용 가능. 단, 시장 국면 전환 시 즉시 중단.`,
      evidence: "일봉 7년(2019-2026) 40종목 검증. 상승장(20일선 위) 976일간 오버나이트 갭 전략 PF 1.70. 기간 분할 4가지 모두 OOS 양수, 종목 서브셋 양쪽 양수.",
    };
  }
  if (regime === "bear") {
    return {
      summary: "하락 국면 — 데이터 기반 방어 구간",
      gapStrategyExpected: "음의 기대값 (7년 검증 PF 0.77, 7,361회 표본)",
      riskLevel: "high" as const,
      recommendation: "기계적 전략 적용 불가 구간. 현금 비중 확대 또는 거래 축소 권장.",
      evidence: "일봉 7년 검증. 하락장(20일선 아래) 804일간 모든 전략이 음의 기대값. 연도별 2022·2024년 확인.",
    };
  }
  return {
    summary: "전환 국면 — 방향 미확정, 관망 권장",
    gapStrategyExpected: "불확실 (상승 전환 시 양의 기대값 가능, 하락 전환 시 음)",
    riskLevel: "moderate" as const,
    recommendation: "국면 확정까지 포지션 축소. 20일선 위 안착 확인 후 재진입.",
    evidence: "20일선과 60일선 사이에서 방향이 결정되지 않은 상태. 과거 데이터에서 이 구간은 수익 분산이 큼.",
  };
}

function mean(v: number[]) { return v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0; }
