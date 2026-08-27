/**
 * 모의투자 서비스 레이어
 *
 * mockTrading 라우터에서 추출한 비즈니스 로직.
 * 라우터는 입력 검증 → 서비스 호출 → 응답 매핑만 담당.
 */

import { and, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { getDb } from "../db";
import { orderIntents, positionSnapshots, autoTradePolicies, tradingProfiles, users } from "../../drizzle/schema";
import { computeRealizedPnlFromOrders } from "../quant/pnl";

// === 공통 헬퍼 ===

export async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 불가");
  return db;
}

export async function getAdminId() {
  const db = await requireDb();
  const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin")).limit(1);
  return admin?.id ?? null;
}

/** 오늘 KST 시작 시각 */
export function todayKstStart(): Date {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
  return new Date(today + "T00:00:00+09:00");
}

// === 안전장치 서비스 ===

export interface SafetyStatusResult {
  active: boolean;
  killSwitch: boolean;
  safetyTriggered: boolean;
  limits: {
    dailyLossLimit: number;
    maxPositions: number;
    maxConcentration: number;
    totalCapital: number;
  } | null;
  todayStats: {
    realizedPnl: number;
    realizedPnlPercent: number;
    positionCount: number;
    maxPositionPercent: number;
    orderCount: number;
  } | null;
  triggers?: {
    dailyLoss: { triggered: boolean; current: number; limit: number };
    positionLimit: { triggered: boolean; current: number; limit: number };
    concentration: { triggered: boolean; current: number; limit: number };
  };
}

/**
 * 오늘 매도 실현 손익 계산 (공통: safetyStatus, checkAndTriggerSafety에서 사용)
 */
export async function computeTodayRealizedPnl() {
  const db = await requireDb();
  const todayStart = todayKstStart();

  const todayOrders = await db
    .select({ side: orderIntents.side, quantity: orderIntents.quantity, price: orderIntents.price, status: orderIntents.status, symbol: orderIntents.symbol })
    .from(orderIntents)
    .where(and(eq(orderIntents.executionOrigin, "local_node"), eq(orderIntents.status, "filled"), gte(orderIntents.createdAt, todayStart)));

  const todaySells = todayOrders.filter(o => o.side === "sell");
  let realizedPnl = 0;

  if (todaySells.length > 0) {
    const sellSymbols = Array.from(new Set(todaySells.map(o => o.symbol)));
    const buyHistory = await db
      .select({ symbol: orderIntents.symbol, price: orderIntents.price, quantity: orderIntents.quantity, side: orderIntents.side })
      .from(orderIntents)
      .where(and(
        eq(orderIntents.executionOrigin, "local_node"),
        eq(orderIntents.status, "filled"),
        eq(orderIntents.side, "buy"),
        inArray(orderIntents.symbol, sellSymbols),
      ));
    realizedPnl = computeRealizedPnlFromOrders(todaySells, buyHistory);
  }

  return { realizedPnl, todayOrders, todaySells };
}

/**
 * 현재 활성 포지션 조회 (최신 스냅샷에서 dedup)
 */
export async function getActivePositions() {
  const db = await requireDb();
  const snapshots = await db.select().from(positionSnapshots).orderBy(desc(positionSnapshots.capturedAt)).limit(50);
  const bySymbol = new Map<string, typeof snapshots[0]>();
  for (const snap of snapshots) {
    if (!bySymbol.has(snap.symbol)) bySymbol.set(snap.symbol, snap);
  }
  return Array.from(bySymbol.values()).filter(p => p.quantity > 0);
}

/**
 * 안전장치 상태 전체 계산
 */
export async function computeSafetyStatus(): Promise<SafetyStatusResult> {
  const db = await requireDb();

  const [policy] = await db.select().from(autoTradePolicies)
    .where(eq(autoTradePolicies.status, "active"))
    .orderBy(desc(autoTradePolicies.createdAt)).limit(1);

  if (!policy) {
    return { active: false, killSwitch: false, safetyTriggered: false, limits: null, todayStats: null };
  }

  const { realizedPnl, todayOrders } = await computeTodayRealizedPnl();
  const realizedPnlPercent = policy.totalCapital > 0 ? (realizedPnl / Number(policy.totalCapital)) * 100 : 0;

  const activePositions = await getActivePositions();
  const positionCount = activePositions.length;

  const maxPositionValue = Math.max(...activePositions.map(p => p.currentPrice * p.quantity), 0);
  const maxPositionPercent = Number(policy.totalCapital) > 0 ? (maxPositionValue / Number(policy.totalCapital)) * 100 : 0;

  const dailyLossLimit = Number(policy.dailyLossLimitPercent);
  const maxPositions = policy.maxConcurrentPositions;
  const dailyLossTriggered = realizedPnlPercent <= -dailyLossLimit;
  const positionLimitTriggered = positionCount >= maxPositions;
  const maxConcentration = 40;
  const concentrationTriggered = maxPositionPercent >= maxConcentration;
  const safetyTriggered = dailyLossTriggered;

  // 킬스위치 상태
  const adminId = await getAdminId();
  let killSwitch = false;
  if (adminId) {
    const existing = (await db.select().from(tradingProfiles).where(eq(tradingProfiles.userId, adminId)).limit(1))[0];
    killSwitch = existing?.killSwitch ?? false;
  }

  return {
    active: true,
    killSwitch,
    safetyTriggered,
    limits: {
      dailyLossLimit,
      maxPositions,
      maxConcentration,
      totalCapital: Number(policy.totalCapital),
    },
    todayStats: {
      realizedPnl,
      realizedPnlPercent: Number(realizedPnlPercent.toFixed(2)),
      positionCount,
      maxPositionPercent: Number(maxPositionPercent.toFixed(1)),
      orderCount: todayOrders.length,
    },
    triggers: {
      dailyLoss: { triggered: dailyLossTriggered, current: Number(realizedPnlPercent.toFixed(2)), limit: -dailyLossLimit },
      positionLimit: { triggered: positionLimitTriggered, current: positionCount, limit: maxPositions },
      concentration: { triggered: concentrationTriggered, current: Number(maxPositionPercent.toFixed(1)), limit: maxConcentration },
    },
  };
}

/**
 * 안전장치 체크 + 킬스위치 자동 발동
 */
export async function checkAndTriggerSafety() {
  const db = await requireDb();

  const [policy] = await db.select().from(autoTradePolicies)
    .where(eq(autoTradePolicies.status, "active"))
    .orderBy(desc(autoTradePolicies.createdAt)).limit(1);

  if (!policy) return { triggered: false, message: "활성 정책 없음" };

  const { realizedPnl } = await computeTodayRealizedPnl();
  const realizedPnlPercent = policy.totalCapital > 0 ? (realizedPnl / Number(policy.totalCapital)) * 100 : 0;
  const dailyLossLimit = Number(policy.dailyLossLimitPercent);
  const shouldTrigger = realizedPnlPercent <= -dailyLossLimit;

  if (shouldTrigger) {
    const adminId = await getAdminId();
    if (adminId) {
      const existing = (await db.select().from(tradingProfiles).where(eq(tradingProfiles.userId, adminId)).limit(1))[0];
      if (existing && !existing.killSwitch) {
        await db.update(tradingProfiles).set({ killSwitch: true }).where(eq(tradingProfiles.id, existing.id));
      }
    }
  }

  return { triggered: shouldTrigger, realizedPnlPercent: Number(realizedPnlPercent.toFixed(2)), limit: -dailyLossLimit };
}

/**
 * 킬스위치 수동 해제
 */
export async function resetKillSwitch() {
  const db = await requireDb();
  const adminId = await getAdminId();
  if (!adminId) return { success: false, message: "관리자 계정을 찾을 수 없습니다." };

  const existing = (await db.select().from(tradingProfiles).where(eq(tradingProfiles.userId, adminId)).limit(1))[0];
  if (existing) {
    await db.update(tradingProfiles).set({ killSwitch: false }).where(eq(tradingProfiles.id, existing.id));
  }
  return { success: true, message: "킬스위치가 해제되었습니다. 자동매매가 다시 활성화됩니다." };
}

// === 정책 관리 서비스 ===

/**
 * 활성 정책 중지 (supersede)
 */
export async function stopAutoTrade() {
  const db = await requireDb();
  const [current] = await db.select().from(autoTradePolicies)
    .where(eq(autoTradePolicies.status, "active"))
    .orderBy(desc(autoTradePolicies.version)).limit(1);

  if (current) {
    await db.update(autoTradePolicies).set({ status: "superseded" }).where(eq(autoTradePolicies.id, current.id));
  }
  return { status: "stopped" as const, message: "자동매매가 중지되었습니다. 수집기의 다음 실행부터 주문이 생성되지 않습니다." };
}

/**
 * 자동매매 토글
 */
export async function toggleAutoTrade(enabled: boolean) {
  const db = await requireDb();
  const adminId = await getAdminId();
  if (!adminId) throw new Error("관리자 계정이 필요합니다.");

  if (enabled) {
    const [policy] = await db.select().from(autoTradePolicies)
      .where(eq(autoTradePolicies.status, "active"))
      .orderBy(desc(autoTradePolicies.version)).limit(1);
    if (!policy) throw new Error("활성 자동매매 정책이 없습니다. 먼저 전략을 배포하세요.");
  }

  const existing = (await db.select().from(tradingProfiles).where(eq(tradingProfiles.userId, adminId)).limit(1))[0];
  if (existing) {
    await db.update(tradingProfiles).set({
      autoTradeEnabled: enabled,
      killSwitch: enabled ? false : existing.killSwitch,
    }).where(eq(tradingProfiles.id, existing.id));
  } else {
    await db.insert(tradingProfiles).values({ userId: adminId, autoTradeEnabled: enabled, killSwitch: false });
  }

  return {
    enabled,
    message: enabled
      ? "자동매매가 활성화되었습니다. 수집기 다음 실행 시 주문이 생성됩니다."
      : "자동매매가 일시정지되었습니다. 정책은 유지되며 수집기가 주문을 생성하지 않습니다.",
  };
}

/**
 * 다음 정책 버전 번호 조회
 */
export async function getNextPolicyVersion(userId: number) {
  const db = await requireDb();
  const [latest] = await db.select({ version: autoTradePolicies.version })
    .from(autoTradePolicies)
    .where(eq(autoTradePolicies.userId, userId))
    .orderBy(desc(autoTradePolicies.version)).limit(1);
  return (latest?.version ?? 0) + 1;
}

/**
 * autoTradeEnabled + killSwitch 프로필 설정
 */
export async function ensureAutoTradeProfile(userId: number, enabled: boolean) {
  const db = await requireDb();
  const existing = (await db.select().from(tradingProfiles).where(eq(tradingProfiles.userId, userId)).limit(1))[0];
  if (existing) {
    await db.update(tradingProfiles).set({ autoTradeEnabled: enabled, killSwitch: false }).where(eq(tradingProfiles.id, existing.id));
  } else {
    await db.insert(tradingProfiles).values({ userId, autoTradeEnabled: enabled, killSwitch: false });
  }
}

// === 주문 서비스 ===

/**
 * 수동 매도 주문 생성
 */
export async function createSellOrder(params: {
  symbol: string;
  name: string;
  quantity: number;
  price: number;
  reason: string;
}) {
  const db = await requireDb();
  const adminId = await getAdminId();
  if (!adminId) throw new Error("관리자 계정이 필요합니다.");

  const tradingDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
  const dedupeKey = `manual-sell:${params.symbol}:${tradingDate}:${Date.now()}`;

  const [intent] = await db.insert(orderIntents).values({
    userId: adminId,
    symbol: params.symbol,
    name: params.name,
    side: "sell",
    orderType: "limit",
    quantity: params.quantity,
    price: params.price,
    amount: params.quantity * params.price,
    status: "pending_confirmation",
    riskReasonsJson: [params.reason],
    executionOrigin: "local_node",
    dedupeKey,
  }).returning();

  return intent;
}

/**
 * 전체 청산 (보유 포지션 모두 매도 대기열)
 */
export async function liquidateAll() {
  const db = await requireDb();
  const adminId = await getAdminId();
  if (!adminId) throw new Error("관리자 계정이 필요합니다.");

  const activePositions = await getActivePositions();
  if (!activePositions.length) throw new Error("청산할 보유 종목이 없습니다.");

  const tradingDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
  const created: number[] = [];

  for (const pos of activePositions) {
    const dedupeKey = `liquidate-all:${pos.symbol}:${tradingDate}:${Date.now()}`;
    const [intent] = await db.insert(orderIntents).values({
      userId: adminId,
      symbol: pos.symbol,
      name: pos.name,
      side: "sell",
      orderType: "limit",
      quantity: pos.quantity,
      price: pos.currentPrice,
      amount: pos.quantity * pos.currentPrice,
      status: "pending_confirmation",
      riskReasonsJson: ["전체 청산"],
      executionOrigin: "local_node",
      dedupeKey,
    }).returning();
    created.push(intent.id);
  }

  return { count: created.length, symbols: activePositions.map(p => p.symbol) };
}

// === 성과 조회 서비스 ===

/**
 * 오늘 실현 손익 (라우터 todayPnl용)
 */
export async function getTodayPnlSummary() {
  const db = await requireDb();
  const todayStart = todayKstStart();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());

  const todayOrders = await db
    .select({ side: orderIntents.side, quantity: orderIntents.quantity, price: orderIntents.price, status: orderIntents.status, symbol: orderIntents.symbol })
    .from(orderIntents)
    .where(and(
      eq(orderIntents.executionOrigin, "local_node"),
      eq(orderIntents.status, "filled"),
      gte(orderIntents.createdAt, todayStart),
    ));

  const buyOrders = todayOrders.filter(o => o.side === "buy");
  const sellOrders = todayOrders.filter(o => o.side === "sell");
  const buyTotal = buyOrders.reduce((s, o) => s + o.price * o.quantity, 0);
  const sellTotal = sellOrders.reduce((s, o) => s + o.price * o.quantity, 0);

  let realizedPnl = 0;
  if (sellOrders.length > 0) {
    const sellSymbols = Array.from(new Set(sellOrders.map(o => o.symbol)));
    const buyHistory = await db
      .select({ symbol: orderIntents.symbol, price: orderIntents.price, quantity: orderIntents.quantity, side: orderIntents.side })
      .from(orderIntents)
      .where(and(
        eq(orderIntents.executionOrigin, "local_node"),
        eq(orderIntents.status, "filled"),
        eq(orderIntents.side, "buy"),
        inArray(orderIntents.symbol, sellSymbols),
      ));
    realizedPnl = computeRealizedPnlFromOrders(sellOrders, buyHistory);
  }

  return {
    tradingDate: today,
    buyTotal,
    sellTotal,
    realizedPnl,
    filledOrderCount: todayOrders.length,
    buyOrderCount: buyOrders.length,
    sellOrderCount: sellOrders.length,
  };
}


/**
 * 최근 N일간 실현 손익 요약 (feedbackHistory용)
 */
export async function getRecentPnlSummary(days: number = 30) {
  const db = await requireDb();
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const recentFilled = await db
    .select({ side: orderIntents.side, price: orderIntents.price, quantity: orderIntents.quantity, symbol: orderIntents.symbol })
    .from(orderIntents)
    .where(and(
      eq(orderIntents.executionOrigin, "local_node"),
      eq(orderIntents.status, "filled"),
      gte(orderIntents.createdAt, cutoff),
    ));

  const buys = recentFilled.filter(o => o.side === "buy");
  const sells = recentFilled.filter(o => o.side === "sell");

  const netPnl = sells.length > 0 ? computeRealizedPnlFromOrders(sells, buys) : 0;

  return {
    totalTrades: recentFilled.length,
    buyCount: buys.length,
    sellCount: sells.length,
    netPnl: Math.round(netPnl),
  };
}


// === 투자 성과 서비스 ===

export interface TradingSummaryResult {
  hasData: boolean;
  startDate: Date | null;
  totalDays: number;
  totalCapitalDeployed: number;
  totalTrades: number;
  totalBuys: number;
  totalSells: number;
  realizedPnl: number;
  realizedPnlPercent: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  avgWinPercent: number;
  avgLossPercent: number;
  bestTrade: { symbol: string; returnPct: number } | null;
  worstTrade: { symbol: string; returnPct: number } | null;
}

/**
 * 전체 기간 투자 성과 요약 (라운드트립 기반)
 */
export async function getTradingSummary(): Promise<TradingSummaryResult> {
  const db = await requireDb();

  const allFilled = await db
    .select({
      side: orderIntents.side,
      price: orderIntents.price,
      quantity: orderIntents.quantity,
      symbol: orderIntents.symbol,
      createdAt: orderIntents.createdAt,
    })
    .from(orderIntents)
    .where(and(
      eq(orderIntents.executionOrigin, "local_node"),
      eq(orderIntents.status, "filled"),
    ))
    .orderBy(orderIntents.createdAt);

  if (allFilled.length === 0) {
    return {
      hasData: false,
      startDate: null,
      totalDays: 0,
      totalCapitalDeployed: 0,
      totalTrades: 0,
      totalBuys: 0,
      totalSells: 0,
      realizedPnl: 0,
      realizedPnlPercent: 0,
      winCount: 0,
      lossCount: 0,
      winRate: 0,
      avgWinPercent: 0,
      avgLossPercent: 0,
      bestTrade: null,
      worstTrade: null,
    };
  }

  const startDate = allFilled[0].createdAt;
  const totalDays = Math.max(1, Math.ceil((Date.now() - new Date(startDate).getTime()) / (24 * 60 * 60 * 1000)));

  // 라운드트립 구성 (종목별 매수-매도 쌍)
  const bySymbol = new Map<string, { buys: typeof allFilled; sells: typeof allFilled }>();
  for (const o of allFilled) {
    const entry = bySymbol.get(o.symbol) ?? { buys: [], sells: [] };
    if (o.side === "buy") entry.buys.push(o);
    else entry.sells.push(o);
    bySymbol.set(o.symbol, entry);
  }

  let totalRealizedPnl = 0;
  let winCount = 0;
  let lossCount = 0;
  let totalWinPct = 0;
  let totalLossPct = 0;
  let bestReturn = -Infinity;
  let worstReturn = Infinity;
  let bestTrade: { symbol: string; returnPct: number } | null = null;
  let worstTrade: { symbol: string; returnPct: number } | null = null;

  for (const [symbol, { buys, sells }] of Array.from(bySymbol.entries())) {
    const sortedBuys = buys.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const sortedSells = sells.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const pairs = Math.min(sortedBuys.length, sortedSells.length);
    for (let i = 0; i < pairs; i++) {
      const buy = sortedBuys[i];
      const sell = sortedSells[i];
      const qty = Math.min(buy.quantity, sell.quantity);
      const pnl = (sell.price - buy.price) * qty;
      const returnPct = buy.price > 0 ? ((sell.price - buy.price) / buy.price) * 100 : 0;
      totalRealizedPnl += pnl;
      if (pnl >= 0) { winCount++; totalWinPct += returnPct; }
      else { lossCount++; totalLossPct += Math.abs(returnPct); }
      if (returnPct > bestReturn) { bestReturn = returnPct; bestTrade = { symbol, returnPct: Number(returnPct.toFixed(2)) }; }
      if (returnPct < worstReturn) { worstReturn = returnPct; worstTrade = { symbol, returnPct: Number(returnPct.toFixed(2)) }; }
    }
  }

  const totalRoundTrips = winCount + lossCount;
  const totalBuys = allFilled.filter(o => o.side === "buy");
  const totalCapitalDeployed = totalBuys.reduce((s, o) => s + o.price * o.quantity, 0);

  return {
    hasData: true,
    startDate,
    totalDays,
    totalCapitalDeployed,
    totalTrades: allFilled.length,
    totalBuys: totalBuys.length,
    totalSells: allFilled.filter(o => o.side === "sell").length,
    realizedPnl: totalRealizedPnl,
    realizedPnlPercent: totalCapitalDeployed > 0 ? Number(((totalRealizedPnl / totalCapitalDeployed) * 100).toFixed(2)) : 0,
    winCount,
    lossCount,
    winRate: totalRoundTrips > 0 ? Number(((winCount / totalRoundTrips) * 100).toFixed(1)) : 0,
    avgWinPercent: winCount > 0 ? Number((totalWinPct / winCount).toFixed(2)) : 0,
    avgLossPercent: lossCount > 0 ? Number((totalLossPct / lossCount).toFixed(2)) : 0,
    bestTrade: bestReturn > -Infinity ? bestTrade : null,
    worstTrade: worstReturn < Infinity ? worstTrade : null,
  };
}

/**
 * 컨트롤 패널 상태 조회
 */
export async function getControlPanelStatus() {
  const db = await requireDb();
  const adminId = await getAdminId();

  let profile: { autoTradeEnabled: boolean; killSwitch: boolean } | null = null;
  if (adminId) {
    const existing = (await db.select().from(tradingProfiles).where(eq(tradingProfiles.userId, adminId)).limit(1))[0];
    if (existing) profile = { autoTradeEnabled: existing.autoTradeEnabled ?? false, killSwitch: existing.killSwitch ?? false };
  }

  const [policy] = await db.select().from(autoTradePolicies)
    .where(eq(autoTradePolicies.status, "active"))
    .orderBy(desc(autoTradePolicies.version)).limit(1);

  return {
    autoTradeEnabled: profile?.autoTradeEnabled ?? false,
    killSwitch: profile?.killSwitch ?? false,
    hasActivePolicy: Boolean(policy),
    policy: policy ? {
      id: policy.id,
      version: policy.version,
      totalCapital: policy.totalCapital,
      maxConcurrentPositions: policy.maxConcurrentPositions,
      stopLossPercent: Number(policy.stopLossPercent),
      takeProfitPercent: Number(policy.takeProfitPercent),
      dailyLossLimitPercent: Number(policy.dailyLossLimitPercent),
      entryTiming: policy.entryTiming ?? "prev_close_next_open",
      maxOpenGapPercent: Number(policy.maxOpenGapPercent ?? "3"),
      positionSizingMode: policy.positionSizingMode ?? "half_kelly",
      positionSizingFixedPercent: Number(policy.positionSizingFixedPercent ?? "10"),
      createdAt: policy.createdAt,
    } : null,
  };
}
