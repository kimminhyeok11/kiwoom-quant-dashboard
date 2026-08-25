import type { ConditionExpressionGroup, ConditionRule } from "../../shared/trading";
import type { DailyBar } from "./conditions";
import { evaluateExpression } from "./conditions";

export type OfflineExitPolicy = {
  id: string;
  label: string;
  explanation: string;
  holdingDays: number;
  takeProfitPercent?: number;
  stopLossPercent?: number;
};

export const OFFLINE_EXIT_POLICIES: OfflineExitPolicy[] = [
  { id: "hold_5", label: "5거래일 보유", explanation: "현재 기준선입니다. 진입 뒤 5거래일 보유 후 종가에 청산합니다.", holdingDays: 5 },
  { id: "tp5_sl3_5d", label: "익절 5% · 손절 3%", explanation: "다음 거래일부터 일봉 고가·저가에 도달하면 청산하고, 미도달 시 5거래일 뒤 종가에 청산합니다.", holdingDays: 5, takeProfitPercent: 5, stopLossPercent: 3 },
  { id: "tp8_sl4_7d", label: "익절 8% · 손절 4%", explanation: "다음 거래일부터 목표 가격을 확인하고, 미도달 시 7거래일 뒤 종가에 청산합니다.", holdingDays: 7, takeProfitPercent: 8, stopLossPercent: 4 },
  { id: "tp12_sl6_10d", label: "익절 12% · 손절 6%", explanation: "다음 거래일부터 목표 가격을 확인하고, 미도달 시 10거래일 뒤 종가에 청산합니다.", holdingDays: 10, takeProfitPercent: 12, stopLossPercent: 6 },
];

type CandidateInput = {
  id: number;
  rootGenomeJson: unknown;
  minimumScore: number;
  fitnessScore: string | number | null;
  inSampleMetricsJson?: unknown;
  outOfSampleMetricsJson?: unknown;
  walkForwardMetricsJson?: unknown;
};
type Regime = "uptrend" | "downtrend" | "range";
type ExitReason = "fixed_holding" | "take_profit" | "stop_loss";
type Trade = { entryDate: string; exitDate: string; entryPrice: number; exitPrice: number; returnPercent: number; exitReason: ExitReason; holdingDays: number; regime: Regime };
type Metrics = { totalReturn: number; maxDrawdown: number; tradeCount: number; winRate: number; returnToDrawdown: number; takeProfitCount: number; stopLossCount: number; takeProfitRate: number; stopLossRate: number; profitFactor: number; expectancy: number; averageHoldingDays: number };
type Simulation = { metrics: Metrics; trades: Trade[] };

const ruleLabels: Record<string, string> = { macd_rising: "MACD 흐름", ma_position: "이동평균선 위치", high_return: "최근 고저 변동률", turnover: "거래대금", rsi: "RSI", bollinger: "볼린저 밴드", stochastic: "스토캐스틱", atr_percent: "ATR 변동성", volume_ratio: "거래량 비율" };
const regimeLabels: Record<Regime, string> = { uptrend: "상승 국면", downtrend: "하락 국면", range: "횡보·전환 국면" };

function isGroup(node: unknown): node is ConditionExpressionGroup {
  return Boolean(node && typeof node === "object" && "children" in node && Array.isArray((node as { children?: unknown }).children));
}

function collectRules(node: unknown): ConditionRule[] {
  if (!node || typeof node !== "object") return [];
  if (isGroup(node)) return node.children.flatMap(child => collectRules(child));
  return "type" in node ? [node as ConditionRule] : [];
}

function emptyMetrics(): Metrics {
  return { totalReturn: 0, maxDrawdown: 0, tradeCount: 0, winRate: 0, returnToDrawdown: 0, takeProfitCount: 0, stopLossCount: 0, takeProfitRate: 0, stopLossRate: 0, profitFactor: 0, expectancy: 0, averageHoldingDays: 0 };
}

function classifyRegime(bars: DailyBar[], index: number): Regime {
  if (index < 20) return "range";
  const window = bars.slice(index - 20, index + 1);
  const current = window[window.length - 1]?.close ?? 0;
  const movingAverage = window.reduce((sum, bar) => sum + bar.close, 0) / window.length;
  const start = window[0]?.close ?? current;
  const twentyDayChange = start > 0 ? (current / start - 1) * 100 : 0;
  if (current > movingAverage && twentyDayChange >= 3) return "uptrend";
  if (current < movingAverage && twentyDayChange <= -3) return "downtrend";
  return "range";
}

function metricsFromTrades(trades: Trade[]): Metrics {
  if (!trades.length) return emptyMetrics();
  let equity = 1;
  let highWaterMark = 1;
  let maxDrawdown = 0;
  for (const trade of trades) {
    equity *= 1 + trade.returnPercent / 100;
    highWaterMark = Math.max(highWaterMark, equity);
    maxDrawdown = Math.min(maxDrawdown, (equity - highWaterMark) / highWaterMark);
  }
  const winners = trades.filter(trade => trade.returnPercent > 0);
  const losers = trades.filter(trade => trade.returnPercent <= 0);
  const grossProfit = winners.reduce((sum, trade) => sum + trade.returnPercent, 0);
  const grossLoss = Math.abs(losers.reduce((sum, trade) => sum + trade.returnPercent, 0));
  const takeProfitCount = trades.filter(trade => trade.exitReason === "take_profit").length;
  const stopLossCount = trades.filter(trade => trade.exitReason === "stop_loss").length;
  const totalReturn = (equity - 1) * 100;
  const drawdown = maxDrawdown * 100;
  return {
    totalReturn,
    maxDrawdown: drawdown,
    tradeCount: trades.length,
    winRate: winners.length / trades.length * 100,
    returnToDrawdown: totalReturn / Math.max(Math.abs(drawdown), 0.01),
    takeProfitCount,
    stopLossCount,
    takeProfitRate: takeProfitCount / trades.length * 100,
    stopLossRate: stopLossCount / trades.length * 100,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Number.POSITIVE_INFINITY : 0,
    expectancy: trades.reduce((sum, trade) => sum + trade.returnPercent, 0) / trades.length,
    averageHoldingDays: trades.reduce((sum, trade) => sum + trade.holdingDays, 0) / trades.length,
  };
}

function simulatePolicy(input: { bars: DailyBar[]; root: ConditionExpressionGroup; minimumScore: number; policy: OfflineExitPolicy; feeRate: number; entryDelayDays: number }): Simulation {
  const trades: Trade[] = [];
  let position: { entryIndex: number; entryDate: string; entryPrice: number; regime: Regime } | null = null;
  let pendingEntryIndex: number | null = null;
  const close = (bar: DailyBar, index: number, exitPrice: number, exitReason: ExitReason) => {
    if (!position) return;
    const netReturn = (exitPrice - position.entryPrice) / position.entryPrice - input.feeRate * 2;
    trades.push({ entryDate: position.entryDate, exitDate: bar.date, entryPrice: position.entryPrice, exitPrice, returnPercent: netReturn * 100, exitReason, holdingDays: Math.max(1, index - position.entryIndex), regime: position.regime });
    position = null;
  };

  for (let index = 0; index < input.bars.length; index += 1) {
    const bar = input.bars[index]!;
    if (position && index > position.entryIndex) {
      const stopPrice = input.policy.stopLossPercent ? position.entryPrice * (1 - input.policy.stopLossPercent / 100) : null;
      const targetPrice = input.policy.takeProfitPercent ? position.entryPrice * (1 + input.policy.takeProfitPercent / 100) : null;
      // A daily bar does not reveal intraday order; when both levels appear, choose the protective stop first.
      if (stopPrice !== null && bar.low <= stopPrice) close(bar, index, stopPrice, "stop_loss");
      else if (targetPrice !== null && bar.high >= targetPrice) close(bar, index, targetPrice, "take_profit");
      else if (position && index - position.entryIndex >= input.policy.holdingDays) close(bar, index, bar.close, "fixed_holding");
    }
    if (!position && pendingEntryIndex !== null && index >= pendingEntryIndex) {
      position = { entryIndex: index, entryDate: bar.date, entryPrice: bar.open, regime: classifyRegime(input.bars, index) };
      pendingEntryIndex = null;
    }
    if (!position && pendingEntryIndex === null) {
      const signal = evaluateExpression(input.root, input.bars.slice(0, index + 1));
      if (signal.eligible && signal.score >= input.minimumScore && index + input.entryDelayDays < input.bars.length) pendingEntryIndex = index + input.entryDelayDays;
    }
  }
  return { metrics: metricsFromTrades(trades), trades };
}

function averageMetrics(metrics: Metrics[]): Metrics {
  if (!metrics.length) return emptyMetrics();
  const sum = (key: keyof Metrics) => metrics.reduce((total, item) => total + item[key], 0);
  return { totalReturn: sum("totalReturn") / metrics.length, maxDrawdown: sum("maxDrawdown") / metrics.length, tradeCount: sum("tradeCount"), winRate: sum("winRate") / metrics.length, returnToDrawdown: sum("returnToDrawdown") / metrics.length, takeProfitCount: sum("takeProfitCount"), stopLossCount: sum("stopLossCount"), takeProfitRate: sum("takeProfitRate") / metrics.length, stopLossRate: sum("stopLossRate") / metrics.length, profitFactor: sum("profitFactor") / metrics.length, expectancy: sum("expectancy") / metrics.length, averageHoldingDays: sum("averageHoldingDays") / metrics.length };
}

function numberFromMetrics(raw: unknown, key: string): number | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const direct = record[key];
  if (typeof direct === "number") return direct;
  if (typeof direct === "string" && Number.isFinite(Number(direct))) return Number(direct);
  if (record.metrics && typeof record.metrics === "object") return numberFromMetrics(record.metrics, key);
  return null;
}

function researchQuality(candidates: CandidateInput[]) {
  const oos = candidates.map(candidate => numberFromMetrics(candidate.outOfSampleMetricsJson, "totalReturn")).filter((value): value is number => value !== null);
  const walkForward = candidates.map(candidate => numberFromMetrics(candidate.walkForwardMetricsJson, "totalReturn")).filter((value): value is number => value !== null);
  const inSample = candidates.map(candidate => numberFromMetrics(candidate.inSampleMetricsJson, "totalReturn")).filter((value): value is number => value !== null);
  const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const positiveRate = (values: number[]) => values.length ? values.filter(value => value > 0).length / values.length * 100 : null;
  return {
    oosPositiveRate: positiveRate(oos),
    walkForwardPositiveRate: positiveRate(walkForward),
    averageOosReturn: average(oos),
    averageWalkForwardReturn: average(walkForward),
    averageInSampleReturn: average(inSample),
    candidateCountWithOos: oos.length,
    candidateCountWithWalkForward: walkForward.length,
    checklist: [
      { id: "oos", label: "독립 OOS 확인", status: oos.length > 0 && (positiveRate(oos) ?? 0) >= 50 ? "pass" : "watch", explanation: oos.length ? `상위 후보 중 ${(positiveRate(oos) ?? 0).toFixed(0)}%가 독립 OOS에서 양(+)의 결과를 보였습니다.` : "독립 OOS 결과가 없어 판단할 수 없습니다." },
      { id: "walk_forward", label: "반복 워크포워드 확인", status: walkForward.length > 0 && (positiveRate(walkForward) ?? 0) >= 50 ? "pass" : "watch", explanation: walkForward.length ? `상위 후보 중 ${(positiveRate(walkForward) ?? 0).toFixed(0)}%가 반복 검증에서 양(+)의 결과를 보였습니다.` : "워크포워드 결과가 없어 판단할 수 없습니다." },
      { id: "survivorship", label: "생존편향 경고", status: "warning", explanation: "현재 유동성 유니버스만 사용하므로 상장폐지·거래정지 종목이 빠졌을 수 있습니다." },
      { id: "execution", label: "일봉 체결 한계", status: "warning", explanation: "일봉에는 장중 가격 순서와 호가 체결이 없어, 익절·손절 동시 도달 시 보수적으로 손절을 우선 적용했습니다." },
    ],
  };
}

export function buildHistoricalResearchInsights(input: { candidates: CandidateInput[]; barsBySymbol: Record<string, DailyBar[]>; feeRate: number; entryDelayDays: number }) {
  const topCandidates = [...input.candidates].sort((left, right) => Number(right.fitnessScore ?? 0) - Number(left.fitnessScore ?? 0)).slice(0, 6);
  const ruleCounts = new Map<string, number>();
  for (const candidate of topCandidates) {
    const used = new Set(collectRules(candidate.rootGenomeJson).filter(rule => rule.enabled).map(rule => rule.type));
    for (const type of Array.from(used)) ruleCounts.set(type, (ruleCounts.get(type) ?? 0) + 1);
  }
  const commonRules = Array.from(ruleCounts.entries()).map(([type, candidateCount]) => ({ type, label: ruleLabels[type] ?? type, candidateCount, candidateRate: topCandidates.length ? candidateCount / topCandidates.length * 100 : 0 })).sort((left, right) => right.candidateCount - left.candidateCount || left.label.localeCompare(right.label));
  const perPolicy = OFFLINE_EXIT_POLICIES.map(policy => {
    const simulations: Simulation[] = [];
    for (const candidate of topCandidates) {
      for (const bars of Object.values(input.barsBySymbol)) {
        if (bars.length < 60) continue;
        simulations.push(simulatePolicy({ bars, root: candidate.rootGenomeJson as ConditionExpressionGroup, minimumScore: candidate.minimumScore, policy, feeRate: input.feeRate, entryDelayDays: input.entryDelayDays }));
      }
    }
    const regimeMetrics = (Object.keys(regimeLabels) as Regime[]).map(regime => ({ id: regime, label: regimeLabels[regime], metrics: averageMetrics(simulations.map(simulation => metricsFromTrades(simulation.trades.filter(trade => trade.regime === regime))).filter(metrics => metrics.tradeCount > 0)) }));
    return { ...policy, metrics: averageMetrics(simulations.map(simulation => simulation.metrics).filter(metrics => metrics.tradeCount > 0)), regimeMetrics };
  });
  const leastDrawdownPolicy = [...perPolicy].filter(item => item.metrics.tradeCount > 0).sort((left, right) => Math.abs(left.metrics.maxDrawdown) - Math.abs(right.metrics.maxDrawdown) || right.metrics.returnToDrawdown - left.metrics.returnToDrawdown)[0] ?? null;
  const bestReturnToDrawdownPolicy = [...perPolicy].filter(item => item.metrics.tradeCount > 0).sort((left, right) => right.metrics.returnToDrawdown - left.metrics.returnToDrawdown)[0] ?? null;
  return {
    candidateCount: topCandidates.length,
    commonRules,
    exitPolicies: perPolicy,
    leastDrawdownPolicyId: leastDrawdownPolicy?.id ?? null,
    bestReturnToDrawdownPolicyId: bestReturnToDrawdownPolicy?.id ?? null,
    researchQuality: researchQuality(topCandidates),
    methodology: { source: "저장된 조정 일봉", offline: true, entryTiming: `조건 충족 뒤 ${input.entryDelayDays}거래일 후 시가`, conservativeDailyBarRule: "같은 일봉에서 익절·손절가가 모두 닿으면 손절을 먼저 적용", regimeDefinition: "개별 종목의 20거래일 종가·이동평균 기준: 상승(+3% 이상·이평 위), 하락(-3% 이하·이평 아래), 그 외 횡보·전환", note: "정책 비교는 상위 후보와 고정 원본의 과거 연구입니다. 후보·종목별 단일 포지션을 순차 계산했으며, 포지션 동시보유·자본배분·세금·실시간 체결은 반영하지 않습니다." },
  };
}
