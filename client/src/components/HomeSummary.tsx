/**
 * 홈 요약 대시보드
 *
 * - 환영 메시지 + 현재 시간
 * - 빠른 통계: 수집된 종목 수, 저장된 조건식 수, 모의투자 포지션 수
 * - 빠른 실행 버튼: 원클릭 백테스트, 조건식 작성, 차트 보기
 * - 최근 활동 (선택)
 */

import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Database, FlaskConical, SlidersHorizontal, BarChart3, Clock, TrendingUp, Zap, Activity, CandlestickChart, Target } from "lucide-react";
import { RecommendedStrategies } from "./RecommendedStrategies";

interface HomeSummaryProps {
  onNavigate: (tab: string) => void;
}

export function HomeSummary({ onNavigate }: HomeSummaryProps) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const symbols = trpc.chartData.availableSymbols.useQuery(undefined, { staleTime: 60_000 });
  const positions = trpc.mockTrading.positions.useQuery(undefined, { staleTime: 60_000 });
  const presets = trpc.conditionBuilder.list.useQuery(undefined, { staleTime: 60_000 });
  const research = trpc.autonomousResearch.latest.useQuery(undefined, { staleTime: 60_000 });
  const performance = trpc.performanceTracker.summary.useQuery(undefined, { staleTime: 60_000 });

  const symbolCount = symbols.data?.length ?? 0;
  const positionCount = positions.data?.positions?.length ?? 0;
  const presetCount = presets.data?.length ?? 0;
  const realizedPnl = performance.data?.realizedPnl ?? 0;
  const winRate = performance.data?.winRate;

  // 자율 연구 결과
  const historicalRun = research.data?.historical?.run;
  const historicalCandidates = research.data?.historical?.candidates ?? [];
  const survivorCount = historicalCandidates.filter((c: { status?: string }) => c.status === "survived").length;
  const totalBarCount = symbolCount * 600; // 종목당 약 600봉 수집

  const greeting = getGreeting(now);
  const timeStr = now.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  const dateStr = now.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "long" });

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      {/* Welcome */}
      <div className="rounded-xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-teal-950/30 p-6">
        <p className="text-sm text-slate-400">{dateStr}</p>
        <h2 className="mt-1 text-2xl font-bold text-white">{greeting}</h2>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
          <Clock size={12} />
          {timeStr}
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Database}
          label="수집된 종목"
          value={symbolCount}
          suffix="종목"
          loading={symbols.isLoading}
          gradient="from-blue-500/10 to-blue-600/5"
          iconColor="text-blue-400"
        />
        <StatCard
          icon={CandlestickChart}
          label="누적 일봉"
          value={totalBarCount}
          suffix="봉"
          loading={symbols.isLoading}
          gradient="from-cyan-500/10 to-cyan-600/5"
          iconColor="text-cyan-400"
        />
        <StatCard
          icon={SlidersHorizontal}
          label="저장된 조건식"
          value={presetCount}
          suffix="개"
          loading={presets.isLoading}
          gradient="from-purple-500/10 to-purple-600/5"
          iconColor="text-purple-400"
        />
        <StatCard
          icon={TrendingUp}
          label="모의 포지션"
          value={positionCount}
          suffix="개"
          loading={positions.isLoading}
          gradient="from-emerald-500/10 to-emerald-600/5"
          iconColor="text-emerald-400"
        />
      </div>

      {/* 실투 성과 배너 (거래 이력이 있을 때) */}
      {performance.data && performance.data.roundTripCount > 0 && (
        <button
          onClick={() => onNavigate("performance")}
          className="flex items-center gap-4 rounded-xl border border-slate-800 bg-gradient-to-r from-slate-900 to-slate-900/50 p-4 text-left transition hover:border-teal-500/30"
        >
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${realizedPnl >= 0 ? "bg-red-500/10" : "bg-blue-500/10"}`}>
            <Target size={18} className={realizedPnl >= 0 ? "text-red-400" : "text-blue-400"} />
          </div>
          <div className="flex-1">
            <p className="text-xs text-slate-400">실투 누적 성과</p>
            <p className={`text-lg font-bold ${realizedPnl >= 0 ? "text-red-400" : "text-blue-400"}`}>
              {realizedPnl >= 0 ? "+" : ""}{realizedPnl.toLocaleString()}원
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-slate-500">{performance.data.roundTripCount}건 완결</p>
            {winRate !== undefined && winRate !== null && (
              <p className={`text-sm font-bold ${winRate >= 50 ? "text-emerald-300" : "text-amber-300"}`}>
                승률 {winRate}%
              </p>
            )}
          </div>
          <span className="text-xs text-teal-400">상세 →</span>
        </button>
      )}

      {/* Quick Actions — 3단계 플로우 가이드 */}
      <div>
        <h3 className="mb-3 text-sm font-medium text-slate-300">시작하기</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <ActionCard
            icon={FlaskConical}
            label="1단계: 전략 설계"
            description="조건식 자동 생성 또는 직접 작성"
            onClick={() => onNavigate("backtest")}
            accentColor="border-teal-500/30 hover:border-teal-400/50"
            iconColor="text-teal-400"
          />
          <ActionCard
            icon={SlidersHorizontal}
            label="2단계: 성과 검증"
            description="과거 데이터로 수익률 확인"
            onClick={() => onNavigate("intraday")}
            accentColor="border-purple-500/30 hover:border-purple-400/50"
            iconColor="text-purple-400"
          />
          <ActionCard
            icon={BarChart3}
            label="3단계: 실전 운용"
            description="검증된 전략을 모의투자에 배포"
            onClick={() => onNavigate("trading")}
            accentColor="border-blue-500/30 hover:border-blue-400/50"
            iconColor="text-blue-400"
          />
        </div>
      </div>

      {/* Recommended Strategies */}
      <RecommendedStrategies />

      {/* Recent Activity */}
      <div>
        <h3 className="mb-3 text-sm font-medium text-slate-300">최근 활동</h3>
        <div className="flex flex-col gap-2">
          {/* 자율 연구 완료 */}
          {historicalRun && historicalRun.phase === "completed" && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500/10">
                  <Activity size={14} className="text-teal-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-slate-300">
                    자동 연구 완료 — {historicalCandidates.length}개 전략 중 <span className="font-semibold text-teal-300">{survivorCount}개 검증 통과</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    {historicalRun.tradingDate} · {(historicalRun.universeJson as Array<{symbol: string}>)?.length ?? 0}종목 분석
                  </p>
                </div>
                <button
                  onClick={() => onNavigate("backtest")}
                  className="shrink-0 rounded-lg border border-teal-500/30 px-3 py-1.5 text-xs font-medium text-teal-400 transition hover:bg-teal-500/10"
                >
                  백테스트
                </button>
              </div>
            </div>
          )}

          {/* 모의투자 포지션 */}
          {positionCount > 0 && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
                  <Zap size={14} className="text-emerald-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-slate-300">모의투자 포지션 {positionCount}개 운용 중</p>
                  <p className="text-xs text-slate-500">실전 운용 탭에서 상세 확인</p>
                </div>
              </div>
            </div>
          )}

          {/* 저장된 조건식 */}
          {presetCount > 0 && !positionCount && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10">
                  <SlidersHorizontal size={14} className="text-purple-400" />
                </div>
                <div>
                  <p className="text-sm text-slate-300">저장된 조건식 {presetCount}개</p>
                  <p className="text-xs text-slate-500">조건식 작성기에서 편집할 수 있습니다</p>
                </div>
              </div>
            </div>
          )}

          {/* 아무 활동 없을 때 */}
          {!historicalRun && !positionCount && !presetCount && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-700/50">
                  <FlaskConical size={14} className="text-slate-500" />
                </div>
                <div>
                  <p className="text-sm text-slate-400">아직 활동 기록이 없습니다</p>
                  <p className="text-xs text-slate-500">원클릭 백테스트로 시작해보세요</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Helpers ─── */

function getGreeting(date: Date): string {
  const h = date.getHours();
  if (h < 6) return "좋은 새벽이에요 🌙";
  if (h < 12) return "좋은 아침이에요 ☀️";
  if (h < 18) return "좋은 오후에요 🌤️";
  return "좋은 저녁이에요 🌆";
}

/* ─── Sub-components ─── */

function StatCard({
  icon: Icon,
  label,
  value,
  suffix,
  loading,
  gradient,
  iconColor,
}: {
  icon: typeof Database;
  label: string;
  value: number;
  suffix?: string;
  loading: boolean;
  gradient: string;
  iconColor: string;
}) {
  return (
    <div className={`rounded-xl border border-slate-800 bg-gradient-to-br ${gradient} p-4`}>
      <div className="flex items-center gap-2">
        <Icon size={16} className={iconColor} />
        <span className="text-xs text-slate-400">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold text-white">
        {loading ? (
          <span className="inline-block h-7 w-12 animate-pulse rounded bg-slate-700" />
        ) : (
          <>
            {value.toLocaleString()}
            {suffix && <span className="ml-1 text-sm font-normal text-slate-500">{suffix}</span>}
          </>
        )}
      </p>
    </div>
  );
}

function ActionCard({
  icon: Icon,
  label,
  description,
  onClick,
  accentColor,
  iconColor,
}: {
  icon: typeof Database;
  label: string;
  description: string;
  onClick: () => void;
  accentColor: string;
  iconColor: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-left transition hover:bg-slate-800/70 ${accentColor}`}
    >
      <Icon size={20} className={iconColor} />
      <div>
        <p className="text-sm font-medium text-white">{label}</p>
        <p className="mt-0.5 text-xs text-slate-500">{description}</p>
      </div>
    </button>
  );
}
