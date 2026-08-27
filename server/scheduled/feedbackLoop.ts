/**
 * 매매 성과 자동 개선 루프 (Feedback Loop)
 *
 * 실투/모투 결과를 분석하여 자동매매 정책 파라미터를 개선합니다.
 * 매주 월요일 07:00 KST에 외부 cron이 POST /api/scheduled/feedback-loop 호출.
 *
 * 개선 흐름:
 *   1. 최근 N일 체결 내역 분석 (승률, 손익비, 평균 보유기간, 슬리피지)
 *   2. 최적 SL/TP 비율 재계산 (실제 수익/손실 분포 기반)
 *   3. Kelly 비율 재계산 (실제 승률 & 손익비 반영)
 *   4. 전략 카드 성과 순위 업데이트 (실전 결과 기반 가중치)
 *   5. 정책 조정 제안 → DB에 기록 + 텔레그램 알림
 *   6. (자동 적용 모드 시) 새 정책 버전 생성
 *
 * 안전장치:
 *   - 최소 10건 이상 거래가 있어야 조정 실행
 *   - 한 번에 SL/TP를 ±1% 이상 변경하지 않음
 *   - Kelly 비율은 Half-Kelly 이하로 제한
 *   - 킬스위치/자동매매 비활성 시 건너뜀
 */

import type { Request, Response } from "express";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  orderIntents,
  orderExecutions,
  autoTradePolicies,
  positionSnapshots,
  tradingProfiles,
  minuteResearchCandidates,
} from "../../drizzle/schema";
import { sendTelegram } from "../_core/notification";

// ─── 타입 ────────────────────────────────────────────────────

interface TradeResult {
  symbol: string;
  side: "buy" | "sell";
  price: number;
  quantity: number;
  createdAt: Date;
  candidateId: number | null;
}

interface RoundTrip {
  symbol: string;
  buyPrice: number;
  sellPrice: number;
  quantity: number;
  returnPct: number;
  holdingDays: number;
  candidateId: number | null;
}

interface FeedbackAnalysis {
  period: { from: string; to: string; days: number };
  trades: { total: number; buys: number; sells: number; roundTrips: number };
  performance: {
    winRate: number;
    avgWinPct: number;
    avgLossPct: number;
    profitFactor: number;
    avgHoldingDays: number;
    sharpeEstimate: number;
  };
  slippage: { avgPct: number; count: number };
  optimal: {
    stopLossPct: number;
    takeProfitPct: number;
    kellyFraction: number;
    halfKellyPct: number;
    suggestedMaxPositions: number;
  };
  adjustments: Array<{ parameter: string; current: number; suggested: number; reason: string }>;
  topCandidates: Array<{ candidateId: number; roundTrips: number; avgReturn: number; winRate: number }>;
}

// ─── 분석 로직 ───────────────────────────────────────────────

function buildRoundTrips(trades: TradeResult[]): RoundTrip[] {
  const bySymbol = new Map<string, { buys: TradeResult[]; sells: TradeResult[] }>();
  for (const t of trades) {
    const entry = bySymbol.get(t.symbol) ?? { buys: [], sells: [] };
    if (t.side === "buy") entry.buys.push(t);
    else entry.sells.push(t);
    bySymbol.set(t.symbol, entry);
  }

  const roundTrips: RoundTrip[] = [];
  for (const [symbol, { buys, sells }] of Array.from(bySymbol.entries())) {
    const sortedBuys = buys.sort((a: TradeResult, b: TradeResult) => a.createdAt.getTime() - b.createdAt.getTime());
    const sortedSells = sells.sort((a: TradeResult, b: TradeResult) => a.createdAt.getTime() - b.createdAt.getTime());
    const pairs = Math.min(sortedBuys.length, sortedSells.length);
    for (let i = 0; i < pairs; i++) {
      const buy = sortedBuys[i];
      const sell = sortedSells[i];
      const returnPct = ((sell.price - buy.price) / buy.price) * 100;
      const holdingMs = sell.createdAt.getTime() - buy.createdAt.getTime();
      const holdingDays = Math.max(1, Math.round(holdingMs / (24 * 60 * 60 * 1000)));
      roundTrips.push({
        symbol,
        buyPrice: buy.price,
        sellPrice: sell.price,
        quantity: Math.min(buy.quantity, sell.quantity),
        returnPct,
        holdingDays,
        candidateId: buy.candidateId,
      });
    }
  }
  return roundTrips;
}

function computeOptimalParameters(roundTrips: RoundTrip[], currentPolicy: {
  stopLossPct: number;
  takeProfitPct: number;
  maxPositions: number;
}) {
  if (roundTrips.length < 5) {
    return {
      stopLossPct: currentPolicy.stopLossPct,
      takeProfitPct: currentPolicy.takeProfitPct,
      kellyFraction: 0,
      halfKellyPct: 10,
      suggestedMaxPositions: currentPolicy.maxPositions,
    };
  }

  const wins = roundTrips.filter(t => t.returnPct > 0);
  const losses = roundTrips.filter(t => t.returnPct <= 0);
  const winRate = wins.length / roundTrips.length;
  const avgWin = wins.length ? wins.reduce((s, t) => s + t.returnPct, 0) / wins.length : 0;
  const avgLoss = losses.length ? Math.abs(losses.reduce((s, t) => s + t.returnPct, 0) / losses.length) : 1;

  // 최적 SL: 손실 분포의 75th percentile (극단 손실 제외)
  const lossAmounts = losses.map(t => Math.abs(t.returnPct)).sort((a, b) => a - b);
  const p75Loss = lossAmounts.length > 0 ? lossAmounts[Math.floor(lossAmounts.length * 0.75)] : currentPolicy.stopLossPct;

  // 최적 TP: 수익 분포의 median (너무 높으면 미도달이 많음)
  const winAmounts = wins.map(t => t.returnPct).sort((a, b) => a - b);
  const medianWin = winAmounts.length > 0 ? winAmounts[Math.floor(winAmounts.length * 0.5)] : currentPolicy.takeProfitPct;

  // Kelly 계산: f* = (W * B - L) / B, where W=winRate, B=avgWin/avgLoss, L=1-W
  const b = avgLoss > 0 ? avgWin / avgLoss : 1;
  const kellyFraction = Math.max(0, (winRate * b - (1 - winRate)) / b);
  const halfKellyPct = Math.min(25, Math.max(3, kellyFraction * 50));

  // 포지션 수: Kelly 기반 분산 (Kelly < 0.1이면 5개 이하)
  const suggestedMaxPositions = kellyFraction >= 0.2 ? 3 : kellyFraction >= 0.1 ? 5 : 7;

  // 점진적 조정 (±1% 제한)
  const clamp = (value: number, current: number, maxDelta: number) =>
    Math.max(current - maxDelta, Math.min(current + maxDelta, value));

  return {
    stopLossPct: Number(clamp(p75Loss, currentPolicy.stopLossPct, 1).toFixed(2)),
    takeProfitPct: Number(clamp(medianWin, currentPolicy.takeProfitPct, 1).toFixed(2)),
    kellyFraction: Number(kellyFraction.toFixed(4)),
    halfKellyPct: Number(halfKellyPct.toFixed(1)),
    suggestedMaxPositions,
  };
}

function buildCandidatePerformance(roundTrips: RoundTrip[]) {
  const byCandidateId = new Map<number, RoundTrip[]>();
  for (const rt of roundTrips) {
    if (!rt.candidateId) continue;
    const list = byCandidateId.get(rt.candidateId) ?? [];
    list.push(rt);
    byCandidateId.set(rt.candidateId, list);
  }

  return Array.from(byCandidateId.entries())
    .map(([candidateId, trips]) => ({
      candidateId,
      roundTrips: trips.length,
      avgReturn: Number((trips.reduce((s, t) => s + t.returnPct, 0) / trips.length).toFixed(2)),
      winRate: Number((trips.filter(t => t.returnPct > 0).length / trips.length * 100).toFixed(1)),
    }))
    .sort((a, b) => b.avgReturn - a.avgReturn);
}

// ─── 핸들러 ──────────────────────────────────────────────────

export async function feedbackLoopHandler(_req: Request, res: Response) {
  try {
    const db = await getDb();
    if (!db) return res.status(503).json({ error: "DB unavailable" });

    // 현재 활성 정책
    const [policy] = await db.select().from(autoTradePolicies).where(eq(autoTradePolicies.status, "active")).orderBy(desc(autoTradePolicies.createdAt)).limit(1);
    if (!policy) {
      return res.json({ ok: true, skipped: true, reason: "활성 정책 없음" });
    }

    // 최근 30일 체결 내역
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const filledOrders = await db
      .select({
        symbol: orderIntents.symbol,
        side: orderIntents.side,
        price: orderIntents.price,
        quantity: orderIntents.quantity,
        createdAt: orderIntents.createdAt,
        candidateId: orderIntents.sourceCandidateId,
      })
      .from(orderIntents)
      .where(and(
        eq(orderIntents.executionOrigin, "local_node"),
        eq(orderIntents.status, "filled"),
        gte(orderIntents.createdAt, thirtyDaysAgo),
      ))
      .orderBy(orderIntents.createdAt);

    const trades: TradeResult[] = filledOrders.map(o => ({
      symbol: o.symbol,
      side: o.side as "buy" | "sell",
      price: o.price,
      quantity: o.quantity,
      createdAt: new Date(o.createdAt),
      candidateId: o.candidateId,
    }));

    // 최소 거래 수 체크
    if (trades.length < 10) {
      return res.json({ ok: true, skipped: true, reason: `거래 수 부족 (${trades.length}/10)` });
    }

    // 라운드트립 구성
    const roundTrips = buildRoundTrips(trades);
    if (roundTrips.length < 5) {
      return res.json({ ok: true, skipped: true, reason: `완결 거래 부족 (${roundTrips.length}/5)` });
    }

    // 성과 분석
    const wins = roundTrips.filter(t => t.returnPct > 0);
    const losses = roundTrips.filter(t => t.returnPct <= 0);
    const winRate = wins.length / roundTrips.length;
    const avgWinPct = wins.length ? wins.reduce((s, t) => s + t.returnPct, 0) / wins.length : 0;
    const avgLossPct = losses.length ? Math.abs(losses.reduce((s, t) => s + t.returnPct, 0) / losses.length) : 0;
    const profitFactor = avgLossPct > 0 ? (avgWinPct * wins.length) / (avgLossPct * losses.length) : 0;
    const avgHolding = roundTrips.reduce((s, t) => s + t.holdingDays, 0) / roundTrips.length;
    const returns = roundTrips.map(t => t.returnPct);
    const meanReturn = returns.reduce((s, v) => s + v, 0) / returns.length;
    const stdReturn = Math.sqrt(returns.reduce((s, v) => s + (v - meanReturn) ** 2, 0) / returns.length);
    const sharpeEstimate = stdReturn > 0 ? (meanReturn / stdReturn) * Math.sqrt(252) : 0;

    // 슬리피지 (체결가 vs 계획가 비교)
    const executions = await db.select({
      plannedPrice: orderIntents.price,
      filledPrice: orderExecutions.filledPrice,
      side: orderIntents.side,
    }).from(orderIntents)
      .innerJoin(orderExecutions, eq(orderExecutions.orderIntentId, orderIntents.id))
      .where(and(
        eq(orderIntents.executionOrigin, "local_node"),
        eq(orderExecutions.executionStatus, "filled"),
        gte(orderIntents.createdAt, thirtyDaysAgo),
      ))
      .limit(200);

    const slippages = executions
      .filter(e => e.plannedPrice > 0 && e.filledPrice && e.filledPrice > 0)
      .map(e => {
        const slipPct = ((e.filledPrice! - e.plannedPrice) / e.plannedPrice) * 100;
        return e.side === "buy" ? slipPct : -slipPct;
      });
    const avgSlippage = slippages.length ? slippages.reduce((s, v) => s + v, 0) / slippages.length : 0;

    // 최적 파라미터 계산
    const currentParams = {
      stopLossPct: Number(policy.stopLossPercent),
      takeProfitPct: Number(policy.takeProfitPercent),
      maxPositions: policy.maxConcurrentPositions,
    };
    const optimal = computeOptimalParameters(roundTrips, currentParams);

    // 조정 사항 결정
    const adjustments: FeedbackAnalysis["adjustments"] = [];

    if (Math.abs(optimal.stopLossPct - currentParams.stopLossPct) >= 0.3) {
      adjustments.push({
        parameter: "stopLossPercent",
        current: currentParams.stopLossPct,
        suggested: optimal.stopLossPct,
        reason: `실제 손실 분포(P75)에서 ${optimal.stopLossPct.toFixed(1)}%가 최적`,
      });
    }

    if (Math.abs(optimal.takeProfitPct - currentParams.takeProfitPct) >= 0.5) {
      adjustments.push({
        parameter: "takeProfitPercent",
        current: currentParams.takeProfitPct,
        suggested: optimal.takeProfitPct,
        reason: `실제 수익 분포(중간값)에서 ${optimal.takeProfitPct.toFixed(1)}%가 최적`,
      });
    }

    if (optimal.suggestedMaxPositions !== currentParams.maxPositions) {
      adjustments.push({
        parameter: "maxConcurrentPositions",
        current: currentParams.maxPositions,
        suggested: optimal.suggestedMaxPositions,
        reason: `Kelly=${optimal.kellyFraction.toFixed(3)} 기반 분산 추천`,
      });
    }

    // 전략 카드 성과 순위
    const topCandidates = buildCandidatePerformance(roundTrips).slice(0, 10);

    // 분석 결과 구성
    const analysis: FeedbackAnalysis = {
      period: {
        from: thirtyDaysAgo.toISOString().slice(0, 10),
        to: new Date().toISOString().slice(0, 10),
        days: 30,
      },
      trades: { total: trades.length, buys: trades.filter(t => t.side === "buy").length, sells: trades.filter(t => t.side === "sell").length, roundTrips: roundTrips.length },
      performance: {
        winRate: Number((winRate * 100).toFixed(1)),
        avgWinPct: Number(avgWinPct.toFixed(2)),
        avgLossPct: Number(avgLossPct.toFixed(2)),
        profitFactor: Number(profitFactor.toFixed(2)),
        avgHoldingDays: Number(avgHolding.toFixed(1)),
        sharpeEstimate: Number(sharpeEstimate.toFixed(2)),
      },
      slippage: { avgPct: Number(avgSlippage.toFixed(3)), count: slippages.length },
      optimal,
      adjustments,
      topCandidates,
    };

    // 텔레그램 보고
    const tgLines: string[] = [];
    tgLines.push(`🔄 <b>피드백 루프 분석 완료</b>`);
    tgLines.push(`기간: ${analysis.period.from} ~ ${analysis.period.to}`);
    tgLines.push(``);
    tgLines.push(`<b>성과</b>`);
    tgLines.push(`승률 ${analysis.performance.winRate}% | 손익비 ${analysis.performance.profitFactor}`);
    tgLines.push(`평균 수익 +${analysis.performance.avgWinPct}% / 손실 -${analysis.performance.avgLossPct}%`);
    tgLines.push(`Sharpe ${analysis.performance.sharpeEstimate} | 보유 ${analysis.performance.avgHoldingDays}일`);
    tgLines.push(``);
    tgLines.push(`<b>최적 파라미터</b>`);
    tgLines.push(`SL: ${currentParams.stopLossPct}% → ${optimal.stopLossPct}%`);
    tgLines.push(`TP: ${currentParams.takeProfitPct}% → ${optimal.takeProfitPct}%`);
    tgLines.push(`Kelly: ${(optimal.kellyFraction * 100).toFixed(1)}% (Half: ${optimal.halfKellyPct}%)`);

    if (adjustments.length > 0) {
      tgLines.push(``);
      tgLines.push(`<b>조정 제안 (${adjustments.length}건)</b>`);
      for (const adj of adjustments) {
        tgLines.push(`  ${adj.parameter}: ${adj.current} → ${adj.suggested}`);
        tgLines.push(`  └ ${adj.reason}`);
      }
    }

    if (topCandidates.length > 0) {
      tgLines.push(``);
      tgLines.push(`<b>상위 전략 카드</b>`);
      for (const c of topCandidates.slice(0, 3)) {
        tgLines.push(`  #${c.candidateId}: ${c.roundTrips}건, 평균 ${c.avgReturn >= 0 ? "+" : ""}${c.avgReturn}%, 승률 ${c.winRate}%`);
      }
    }

    await sendTelegram(tgLines.join("\n"));

    // ─── 자동 적용 (조건부) ────────────────────────────────────

    // 자동 적용은 프로필에 autoTradeEnabled=true이고 killSwitch=false일 때만
    const profile = (await db.select().from(tradingProfiles).where(eq(tradingProfiles.userId, policy.userId)).limit(1))[0];
    let autoApplied = false;

    if (profile && profile.autoTradeEnabled && !profile.killSwitch && adjustments.length > 0) {
      // 새 정책 버전 생성 (기존 정책을 superseded하고 조정된 값 적용)
      const newStopLoss = adjustments.find(a => a.parameter === "stopLossPercent")?.suggested ?? Number(policy.stopLossPercent);
      const newTakeProfit = adjustments.find(a => a.parameter === "takeProfitPercent")?.suggested ?? Number(policy.takeProfitPercent);
      const newMaxPositions = adjustments.find(a => a.parameter === "maxConcurrentPositions")?.suggested ?? policy.maxConcurrentPositions;

      await db.update(autoTradePolicies).set({ status: "superseded" }).where(eq(autoTradePolicies.id, policy.id));

      // userId 스코핑으로 최대 version 조회 (unique constraint 충돌 방지)
      const [latestForUser] = await db.select({ version: autoTradePolicies.version })
        .from(autoTradePolicies)
        .where(eq(autoTradePolicies.userId, policy.userId))
        .orderBy(desc(autoTradePolicies.version))
        .limit(1);
      const nextVersion = (latestForUser?.version ?? 0) + 1;

      await db.insert(autoTradePolicies).values({
        userId: policy.userId,
        version: nextVersion,
        status: "active",
        totalCapital: policy.totalCapital,
        maxConcurrentPositions: newMaxPositions,
        stopLossPercent: String(newStopLoss),
        takeProfitPercent: String(newTakeProfit),
        dailyLossLimitPercent: policy.dailyLossLimitPercent,
        entryTiming: policy.entryTiming,
        maxOpenGapPercent: policy.maxOpenGapPercent,
        positionSizingMode: policy.positionSizingMode,
        positionSizingFixedPercent: policy.positionSizingFixedPercent,
      });

      autoApplied = true;
      await sendTelegram(`✅ <b>정책 자동 업데이트 적용</b>\nv${policy.version} → v${nextVersion}\nSL ${Number(policy.stopLossPercent)}%→${newStopLoss}%, TP ${Number(policy.takeProfitPercent)}%→${newTakeProfit}%, 종목 ${policy.maxConcurrentPositions}→${newMaxPositions}`);
    }

    return res.json({ ok: true, analysis, autoApplied });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await sendTelegram(`❌ <b>피드백 루프 오류</b>\n\n${message.slice(0, 200)}`);
    return res.status(500).json({ error: message });
  }
}
