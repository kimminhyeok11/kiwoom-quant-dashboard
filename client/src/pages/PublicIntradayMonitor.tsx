import { Activity, CircleAlert, TrendingUp } from "lucide-react";
import { DayTradingExperimentPanel } from "@/components/DayTradingExperimentPanel";
import { useAuth } from "@/_core/hooks/useAuth";
import { PublicMarketNav } from "@/components/PublicMarketNav";
import { trpc } from "@/lib/trpc";
import React from "react";

const formatWon = (value: number) => `${Math.round(value).toLocaleString()}원`;
const formatTimestamp = (value?: Date | string | null) => value ? new Date(value).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—";
export const LIVE_QUOTE_FRESH_SECONDS = 90;

export function getQuoteFreshness(observedAt?: Date | string | null, now = new Date()) {
  if (!observedAt || Number.isNaN(new Date(observedAt).getTime())) return { status: "waiting" as const, ageSeconds: null };
  const ageSeconds = Math.max(0, Math.floor((now.getTime() - new Date(observedAt).getTime()) / 1_000));
  return { status: ageSeconds <= LIVE_QUOTE_FRESH_SECONDS ? "fresh" as const : "delayed" as const, ageSeconds };
}

const formatAge = (seconds: number | null) => seconds === null ? "실제 시세 기록 없음" : seconds < 60 ? `${seconds}초 전` : `${Math.floor(seconds / 60)}분 ${seconds % 60}초 전`;

export default function PublicIntradayMonitor() {
  const { user } = useAuth();
  const retryTransientQuery = { retry: 2, retryDelay: (attempt: number) => Math.min(1_000 * 2 ** attempt, 4_000) };
  const latest = trpc.autonomousResearch.latest.useQuery(undefined, { ...retryTransientQuery, refetchInterval: 15_000 });
  const history = trpc.autonomousResearch.dayTradeHistory.useQuery(undefined, { ...retryTransientQuery, refetchInterval: 15_000 });
  const minuteValidation = trpc.autonomousResearch.minuteValidationHistory.useQuery(undefined, { ...retryTransientQuery, refetchInterval: 15_000 });
  const minuteCollectionStatus = trpc.autonomousResearch.minuteCollectionStatus.useQuery(undefined, { ...retryTransientQuery, refetchInterval: 5_000 });
  const minuteBackfillStatus = trpc.autonomousResearch.minuteBackfillStatus.useQuery(undefined, { ...retryTransientQuery, refetchInterval: 60_000 });
  const mockOrderOperation = trpc.autonomousResearch.mockOrderOperationStatus.useQuery(undefined, { ...retryTransientQuery, enabled: Boolean(user?.isOperator), refetchInterval: user?.isOperator ? 15_000 : false });
  const utils = trpc.useUtils();
  const requestMinuteCollection = trpc.autonomousResearch.requestMinuteCollection.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.autonomousResearch.minuteCollectionStatus.invalidate(),
        utils.autonomousResearch.minuteValidationHistory.invalidate(),
        utils.autonomousResearch.dayTradeHistory.invalidate(),
        utils.autonomousResearch.mockOrderOperationStatus.invalidate(),
      ]);
    },
  });

  const positions = history.data?.positions ?? [];
  const conditionStats = history.data?.conditionStats ?? [];
  const latestSyncEvent = history.data?.latestSyncEvent ?? null;
  const latestExperiment = history.data?.experiments[0] ?? null;
  const mockOperation = mockOrderOperation.data;
  const marketClosed = latestExperiment?.status === "closed" || mockOperation?.status === "market_closed";
  const netPnl = positions.reduce((total, position) => total + Number(position.netPnl), 0);
  const latestObservedAt = positions.reduce<Date | string | null>((latestAt, position) => {
    if (!position.lastObservedAt) return latestAt;
    return !latestAt || new Date(position.lastObservedAt).getTime() > new Date(latestAt).getTime() ? position.lastObservedAt : latestAt;
  }, null);
  const observedAt = latestObservedAt ?? latest.data?.run?.lastObservedAt ?? null;
  const quoteFreshness = getQuoteFreshness(observedAt);
  const quoteStatus = marketClosed ? "장 마감 · 최종 가격 확정" : quoteFreshness.status === "fresh" ? "실제 시세 추적 중" : quoteFreshness.status === "delayed" ? "시세 갱신 지연" : "실제 시세 대기";
  const quoteTone = marketClosed || quoteFreshness.status === "fresh" ? "text-teal-200" : quoteFreshness.status === "delayed" ? "text-amber-200" : "text-slate-300";
  const syncStatus = latestSyncEvent?.status === "success" ? "로컬 수집 성공" : latestSyncEvent?.status === "partial" ? "일부 종목 수집 실패" : latestSyncEvent?.status === "failed" ? "로컬 수집 실패" : "로컬 수집 기록 대기";
  const syncTone = latestSyncEvent?.status === "success" ? "text-teal-200" : latestSyncEvent?.status === "partial" || latestSyncEvent?.status === "failed" ? "text-amber-200" : "text-slate-400";
  const mockStatusLabel = mockOperation?.status === "market_closed" ? "장 마감 · 최종 청산 확정" : mockOperation?.status === "ready" ? "모의 주문 계획 준비" : mockOperation?.status === "waiting_for_intraday_experiment" ? "장중 실험 생성 대기" : mockOperation?.status === "waiting_for_signals" ? "당일 신호 대기" : mockOperation?.status === "kill_switch" ? "킬 스위치 작동" : mockOperation?.status === "automatic_execution_paused" ? "자동 실행 일시 중지" : mockOperation?.status === "waiting_for_policy" ? "정책 대기" : "운영 상태 확인 중";
  const mockStatusTone = mockOperation?.status === "ready" || mockOperation?.status === "market_closed" ? "text-teal-200" : mockOperation?.status === "kill_switch" || mockOperation?.status === "automatic_execution_paused" ? "text-amber-200" : "text-slate-300";
  const minuteResults = minuteValidation.data?.results ?? [];
  const minuteBarCount = minuteResults.reduce((total, result) => total + result.barCount, 0);
  const minuteTradeCount = minuteResults.reduce((total, result) => total + result.tradeCount, 0);
  const minuteNetPnl = minuteResults.reduce((total, result) => total + result.netPnl, 0);
  const minuteSelection = minuteValidation.data?.selection;
  const minuteRequest = minuteCollectionStatus.data;
  const minuteRequestLabel = marketClosed ? "장 마감 · 수집 종료" : minuteRequest?.status === "queued" ? "로컬 수집기 대기" : minuteRequest?.status === "running" ? "로컬 1분봉 수집 중" : minuteRequest?.status === "completed" ? "최근 1분봉 수집 완료" : minuteRequest?.status === "failed" ? "최근 1분봉 수집 실패" : "수집 요청 없음";
  const minuteRequestTone = marketClosed || minuteRequest?.status === "completed" ? "text-teal-200" : minuteRequest?.status === "failed" ? "text-rose-200" : minuteRequest?.status === "queued" || minuteRequest?.status === "running" ? "text-amber-200" : "text-slate-400";
  const backfill = minuteBackfillStatus.data;
  const intradayQueryError = history.error ?? latest.error ?? minuteValidation.error ?? minuteCollectionStatus.error ?? minuteBackfillStatus.error ?? (user?.isOperator ? mockOrderOperation.error : null);

  return <main data-ui-version="market-close-monitor-7cdb95a0" className="research-dashboard min-h-screen bg-[#090e16] px-4 py-6 text-slate-100 sm:px-7 lg:px-10">
    <PublicMarketNav active="intraday" />
    <div className="mx-auto max-w-7xl">
      <header className="mb-8 border-b border-slate-700/70 pb-6 pl-16">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-teal-300/80">LIVE · ACTUAL-PRICE PAPER TRACKING</p>
        <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-white md:text-5xl">장중 실시간 조건식 성과</h1>
        <p className="mt-3 max-w-3xl text-base leading-relaxed text-slate-300">실제 키움 일봉 생존 조건식과 저장된 ka10080 1분봉을 같은 유동성 유니버스에서 연결합니다. 장 마감 뒤에는 마지막 실제 가격으로 청산 성과를 확정하며, 새 수집·주문 후보는 다음 거래일까지 중단됩니다.</p>
      </header>

      <section aria-label="장중 실제 시세 상태" className="border-b border-slate-800 pb-6">
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">시세 상태</p><p className={`mt-2 text-xl font-extrabold ${quoteTone}`}>{quoteStatus}</p><p className="mt-1 text-xs text-slate-400">{marketClosed ? "마지막 실제 1분봉 가격을 청산 기준으로 확정했습니다." : quoteFreshness.status === "fresh" ? "90초 이내 실제 시세입니다." : quoteFreshness.status === "delayed" ? "90초를 넘긴 기록입니다. 다음 수집 전에는 최신 성과로 해석하지 마세요." : "실제 시세가 수집되면 자동으로 표시합니다."}</p></div>
          <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">포지션</p><p className="mt-2 font-mono text-2xl font-bold text-white">{positions.length}개</p><p className="mt-1 text-xs text-slate-400">{marketClosed ? "마감 청산 기록 기준" : "실제 가격 관찰 기준"}</p></div>
          <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">수수료 차감 순손익</p><p className={`mt-2 font-mono text-2xl font-bold ${netPnl >= 0 ? "text-teal-100" : "text-rose-100"}`}>{netPnl >= 0 ? "+" : ""}{formatWon(netPnl)}</p><p className="mt-1 text-xs text-slate-400">{marketClosed ? "당일 청산 확정 순손익" : "저장된 포지션 순손익 합계"}</p></div>
          <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">마지막 실제 시세</p><p className="mt-2 font-mono text-lg font-bold text-white">{formatTimestamp(observedAt)}</p><p className={`mt-1 text-xs ${!marketClosed && quoteFreshness.status === "delayed" ? "text-amber-200" : "text-slate-400"}`}>{marketClosed ? `마감 확정 ${formatTimestamp(latestExperiment?.closedAt)}` : `${formatAge(quoteFreshness.ageSeconds)} · 장중 수집 기록 기준`}</p></div>
        </div>
        <div className="mt-5 flex gap-3 border-t border-slate-800 pt-4"><Activity className={`mt-0.5 shrink-0 ${syncTone}`} size={18} /><div><p className={`text-sm font-bold ${syncTone}`}>{syncStatus}{latestSyncEvent ? ` · ${formatTimestamp(latestSyncEvent.createdAt)}` : ""}</p><p className="mt-1 text-xs leading-relaxed text-slate-400">{latestSyncEvent ? `${latestSyncEvent.quoteCount}개 수집${latestSyncEvent.rejectedQuoteCount ? ` · ${latestSyncEvent.rejectedQuoteCount}개 미반영` : ""}${latestSyncEvent.message ? ` · ${latestSyncEvent.message}` : ""}` : "로컬 지정 IP 수집기가 실제 가격을 동기화하면 상세 상태가 표시됩니다."}</p></div></div>
      </section>

      {intradayQueryError ? <section className="py-14 text-center"><CircleAlert className="mx-auto mb-3 text-rose-300" size={28} /><p className="font-bold text-slate-200">장중 기록을 불러오지 못했습니다.</p><p className="mt-2 text-sm text-slate-500">{intradayQueryError.message}</p><p className="mt-2 text-xs text-slate-600">일시적인 게이트웨이·서버 재시작 응답은 자동으로 재시도합니다. 지속되면 다음 갱신 주기에 다시 확인합니다.</p></section> : <>
        {backfill?.barCount ? <section className="mt-8 border-y border-teal-200/20 py-5" aria-label="연도 다종목 실제 분봉 원본"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-200">YEAR-TO-DATE MULTI-SYMBOL MINUTE DATA</p><h2 className="mt-2 text-xl font-extrabold text-white">{backfill.year}년 다종목 실제 1분봉 원본</h2><p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-300">최근 30거래일 평균 거래대금 기준으로 선발한 키움 ka10080 원본입니다. 당일 관찰·분 단위 검증·주문 계획은 동일한 저장 원본을 재사용합니다.</p></div><p className="font-mono text-xs text-slate-400">{formatTimestamp(backfill.lastCapturedAt)} 동기화</p></div><div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4"><Metric label="종목" value={`${backfill.symbolCount.toLocaleString()}개`} tone="text-teal-100" /><Metric label="거래일" value={`${backfill.tradingDateCount.toLocaleString()}일`} /><Metric label="저장 1분봉" value={`${backfill.barCount.toLocaleString()}개`} /><Metric label="기간" value={`${backfill.firstTradingDate ?? "—"} ~ ${backfill.lastTradingDate ?? "—"}`} compact /></div></section> : null}

        {user?.isOperator && <section className="mt-8 border-y border-teal-200/20 py-6" aria-label="모의 주문 자동 실행 상태">
          <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-200">MOCK ORDER AUTOMATION · LOCAL IP EXECUTOR</p><h2 className="mt-2 text-2xl font-extrabold text-white">다종목 모의 주문 계획</h2><p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-300">모의투자 주문은 로컬 지정 IP 실행기에서만 전송하며, 공개 화면은 실제 원본·정책·최종 청산 또는 현재 주문 후보만 표시합니다.</p></div><div className="text-right"><p className={`text-lg font-extrabold ${mockStatusTone}`}>{mockStatusLabel}</p><p className="mt-1 text-xs text-slate-500">{mockOperation?.executionMode === "mock" ? "모의투자 모드" : "—"} · {mockOperation?.localExecutor ?? "상태 대기"}</p></div></div>
          {mockOperation?.policy ? <div className="mt-5 grid grid-cols-2 gap-4 border-y border-slate-800 py-4 sm:grid-cols-3 xl:grid-cols-6"><Metric label="총 운용 자본" value={formatWon(mockOperation.policy.totalCapital)} /><Metric label="최대 보유" value={`${mockOperation.policy.maxConcurrentPositions}종목`} /><Metric label="손절 / 익절" value={`-${mockOperation.policy.stopLossPercent}% / +${mockOperation.policy.takeProfitPercent}%`} /><Metric label="일일 손실 차단" value={`-${mockOperation.policy.dailyLossLimitPercent}%`} /><Metric label="정책 버전" value={`v${mockOperation.policy.version}`} /><Metric label="킬 스위치" value={mockOperation.policy.enabled ? "해제" : "차단"} tone={mockOperation.policy.enabled ? "text-teal-100" : "text-amber-200"} /></div> : null}
          <div className="mt-5 flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-bold text-white">{marketClosed ? "최종 청산 결과" : "현재 주문 후보"}</p><p className="mt-1 text-xs text-slate-500">장중 실험 #{mockOperation?.experiment?.id ?? "—"} · 신호 {mockOperation?.experiment?.signalCount ?? 0}개 · 포지션 {mockOperation?.experiment?.selectedPositionCount ?? 0}개{marketClosed ? ` · ${formatTimestamp(mockOperation?.experiment?.closedAt)}` : ""}</p></div>{marketClosed ? <p className={`font-mono text-lg font-bold ${(mockOperation?.experiment?.netPnl ?? netPnl) >= 0 ? "text-teal-100" : "text-rose-100"}`}>{(mockOperation?.experiment?.netPnl ?? netPnl) >= 0 ? "+" : ""}{formatWon(mockOperation?.experiment?.netPnl ?? netPnl)} · {(mockOperation?.experiment?.netReturnPercent ?? 0).toFixed(2)}%</p> : <p className="font-mono text-xs text-slate-500">자동 선발 {mockOperation?.selectedOrders.length ?? 0}개</p>}</div>
          {!marketClosed && mockOperation?.selectedOrders.length ? <div className="mt-4 grid gap-x-8 gap-y-4 md:grid-cols-2 xl:grid-cols-3">{mockOperation.selectedOrders.map(order => <article key={order.dedupeKey ?? `${order.candidateId}:${order.symbol}`} className="border-b border-slate-800 pb-4"><p className="font-mono text-[11px] text-slate-500">{order.symbol} · 조건식 {order.candidateFingerprint.slice(0, 12)}…</p><p className="mt-2 text-base font-bold text-white">{order.name}</p><p className="mt-2 text-xs text-slate-400">기준가 <b className="ml-1 font-mono text-slate-100">{formatWon(order.referencePrice)}</b> · 신호 <b className="font-mono text-teal-100">{order.signalCount}</b></p></article>)}</div> : <p className="mt-4 text-sm text-slate-500">{marketClosed ? "당일 주문 후보 생성은 종료됐습니다. 아래의 데이트레이드 기록에서 종목별 실제 청산 가격과 수수료 차감 성과를 확인할 수 있습니다." : "당일 실제 신호가 확정되면 최대 보유 한도까지 종목별 주문 후보가 표시됩니다."}</p>}
          <section className="mt-6 border-t border-slate-800 pt-5" aria-label="당일 모의 주문 체결 이력"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-200">MOCK ORDER EXECUTION HISTORY</p><h3 className="mt-1 text-base font-bold text-white">당일 모의 주문·체결 이력</h3><p className="mt-1 text-xs text-slate-400">로컬 실행기가 서버에 동기화한 실제 모의투자 주문 기록만 표시합니다.</p></div><p className="font-mono text-xs text-slate-500">기록 {mockOperation?.recentExecutions.length ?? 0}건</p></div>{mockOperation?.recentExecutions.length ? <div className="mt-4 grid gap-x-8 gap-y-4 md:grid-cols-2 xl:grid-cols-3">{mockOperation.recentExecutions.map(item => <article key={`${item.orderIntentId}:${item.executionStatus}:${item.executedAt}`} className="border-b border-slate-800 pb-4"><p className="font-mono text-[11px] text-slate-500">{formatTimestamp(item.executedAt)} · 주문 #{item.orderIntentId}</p><div className="mt-2 flex items-start justify-between gap-3"><div><p className="text-base font-bold text-white">{item.name} <span className="font-mono text-xs text-slate-500">{item.symbol}</span></p><p className="mt-1 text-xs text-slate-400">{item.side === "buy" ? "매수" : "매도"} · 주문 {item.quantity.toLocaleString()}주 · {formatWon(item.price)}</p></div><span className={`shrink-0 text-xs font-bold ${item.executionStatus === "filled" ? "text-teal-100" : item.executionStatus === "rejected" ? "text-rose-100" : "text-amber-200"}`}>{item.executionStatus === "filled" ? "체결" : item.executionStatus === "rejected" ? "거부" : item.executionStatus === "submitted" ? "전송" : "미체결"}</span></div><p className="mt-2 text-xs text-slate-500">{item.executionStatus === "filled" ? `체결 ${(item.filledQuantity ?? 0).toLocaleString()}주 · ${formatWon(item.filledPrice ?? item.price)}` : item.brokerOrderId ? `모의 주문번호 ${item.brokerOrderId}` : "로컬 실행기 동기화 기록"}</p></article>)}</div> : <p className="mt-4 text-sm text-slate-500">아직 로컬 실행기에서 동기화된 모의 주문·체결 이력이 없습니다. 당일 실제 신호와 키움 모의 API 응답이 기록되면 이 영역에 순서대로 표시됩니다.</p>}</section>
        </section>}

        <DayTradingExperimentPanel />

        <section className="mt-8 border-t border-slate-800 pt-6" aria-label="당일 1분봉 조건식 검증"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-200">ONE-MINUTE ACTUAL-BAR VALIDATION</p><h2 className="mt-2 text-2xl font-extrabold text-white">당일 1분봉 조건식 검증</h2><p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-300">저장된 완결 1분봉만 사용하며, 신호 뒤 다음 완결 1분봉 시가에 진입합니다. 같은 봉에서 손절·익절이 함께 닿으면 손절을 우선해 낙관적인 체결을 피합니다.</p></div><button type="button" onClick={() => requestMinuteCollection.mutate()} disabled={!user || marketClosed || requestMinuteCollection.isPending || minuteRequest?.status === "queued" || minuteRequest?.status === "running"} className="shrink-0 rounded-md border border-teal-200/45 px-4 py-2 text-sm font-bold text-teal-100 transition hover:bg-teal-200/10 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500">{!user ? "로그인 후 1분봉 조회" : marketClosed ? "장 마감 · 수집 종료" : requestMinuteCollection.isPending ? "수집 요청 중…" : minuteRequest?.status === "queued" || minuteRequest?.status === "running" ? "로컬 수집 진행 중" : "지금 1분봉 조회"}</button></div><div className="mt-4 flex gap-3 border-y border-slate-800 py-3"><Activity className={`mt-0.5 shrink-0 ${minuteRequestTone}`} size={18} /><div><p className={`text-sm font-bold ${minuteRequestTone}`}>{minuteRequestLabel}{minuteRequest ? ` · ${formatTimestamp(minuteRequest.updatedAt)}` : ""}</p><p className="mt-1 text-xs leading-relaxed text-slate-400">{marketClosed ? "당일 최종 실제 분봉이 청산값으로 확정되어 다음 거래일까지 새 수집 요청을 만들지 않습니다." : minuteRequest?.status === "completed" ? `${minuteRequest.acceptedBarCount.toLocaleString()}개 완결 1분봉을 반영했습니다${minuteRequest.rejectedBarCount ? ` · ${minuteRequest.rejectedBarCount}개 제외` : ""}.` : minuteRequest?.status === "failed" ? minuteRequest.lastError ?? "로컬 지정 IP의 OAuth·1분봉 조회 로그를 확인하세요." : !user ? "수집 요청은 로그인한 사용자만 등록할 수 있습니다." : "버튼을 누르면 수집 요청을 등록합니다. 로컬 수집기가 다음 실행 때 실제 1분봉을 내려받습니다."}</p></div></div><div className="mt-5 grid gap-5 md:grid-cols-4"><Metric label="저장 1분봉" value={`${minuteBarCount.toLocaleString()}개`} /><Metric label="검증 거래" value={`${minuteTradeCount.toLocaleString()}건`} /><Metric label="수수료 차감 순손익" value={`${minuteNetPnl >= 0 ? "+" : ""}${formatWon(minuteNetPnl)}`} tone={minuteNetPnl >= 0 ? "text-teal-100" : "text-rose-100"} /><Metric label="자동 선발 생존" value={`${minuteSelection?.survivingCandidateCount ?? 0}개`} tone="text-teal-100" /></div><div className="mt-5 border-y border-slate-800 py-4"><p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-200">DAY-TRADE AUTO SELECTION</p><p className="mt-2 text-sm font-bold text-white">실제 1분봉 기반 자동 평가·선발</p><p className="mt-2 text-xs text-slate-500">분 단위 상태: 학습 {minuteSelection?.learningCandidateCount ?? 0}개 · 관찰 {minuteSelection?.watchingCandidateCount ?? 0}개 · 생존 {minuteSelection?.survivingCandidateCount ?? 0}개 · 탈락 {minuteSelection?.rejectedCandidateCount ?? 0}개</p></div></section>

        <section className="mt-8 border-t border-slate-800 pt-6"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-200">CONDITION-LEVEL LIVE SCOREBOARD</p><h2 className="mt-2 text-2xl font-extrabold text-white">조건식별 누적 장중 성과</h2><p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-300">실제 가격으로 저장한 장중 모의 기록만 집계합니다. 실주문·체결 성과와는 별개입니다.</p></div><p className="font-mono text-xs text-slate-500">기록 조건식 {conditionStats.length}개</p></div>{conditionStats.length ? <div className="mt-5 grid gap-x-8 gap-y-5 md:grid-cols-2 xl:grid-cols-3">{conditionStats.map(stat => <article key={stat.candidateFingerprint} className="border-b border-slate-800 pb-5"><p className="font-mono text-[11px] text-slate-500">조건식 {stat.candidateFingerprint.slice(0, 12)}…</p><p className={`mt-2 font-mono text-2xl font-bold ${stat.netPnl >= 0 ? "text-teal-100" : "text-rose-100"}`}>{stat.netPnl >= 0 ? "+" : ""}{formatWon(stat.netPnl)}</p><p className="mt-3 text-xs text-slate-400">실험일 {stat.experimentDays}일 · 승률 {stat.winRate.toFixed(1)}% · 손익비 {stat.profitFactor === null ? "∞" : stat.profitFactor.toFixed(2)}</p></article>)}</div> : <div className="py-14 text-center"><TrendingUp className="mx-auto mb-3 text-slate-600" size={28} /><p className="font-bold text-slate-300">조건식별 장중 성과를 기다리고 있습니다.</p><p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-slate-500">실제 시세에서 생존 조건식이 신호를 만들면 가상 진입·청산·수수료 차감 성과가 이곳에 기록됩니다.</p></div>}</section>
      </>}
    </div>
  </main>;
}

function Metric({ label, value, tone = "text-white", compact = false }: { label: string; value: string; tone?: string; compact?: boolean }) {
  return <div><p className="text-xs text-slate-500">{label}</p><p className={`mt-1 font-mono font-bold ${compact ? "text-sm" : "text-2xl"} ${tone}`}>{value}</p></div>;
}
