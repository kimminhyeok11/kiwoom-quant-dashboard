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
import { Database, FlaskConical, SlidersHorizontal, BarChart3, Clock, TrendingUp, Zap } from "lucide-react";

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

  const symbolCount = symbols.data?.length ?? 0;
  const positionCount = positions.data?.positions?.length ?? 0;
  const presetCount = presets.data?.length ?? 0;

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
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          icon={Database}
          label="수집된 종목 수"
          value={symbolCount}
          loading={symbols.isLoading}
          gradient="from-blue-500/10 to-blue-600/5"
          iconColor="text-blue-400"
        />
        <StatCard
          icon={SlidersHorizontal}
          label="저장된 조건식 수"
          value={presetCount}
          loading={presets.isLoading}
          gradient="from-purple-500/10 to-purple-600/5"
          iconColor="text-purple-400"
        />
        <StatCard
          icon={TrendingUp}
          label="모의투자 포지션 수"
          value={positionCount}
          loading={positions.isLoading}
          gradient="from-emerald-500/10 to-emerald-600/5"
          iconColor="text-emerald-400"
        />
      </div>

      {/* Quick Actions */}
      <div>
        <h3 className="mb-3 text-sm font-medium text-slate-300">빠른 실행</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <ActionCard
            icon={FlaskConical}
            label="원클릭 백테스트"
            description="랜덤 조건식 생성 → 자동 검증"
            onClick={() => onNavigate("backtest")}
            accentColor="border-teal-500/30 hover:border-teal-400/50"
            iconColor="text-teal-400"
          />
          <ActionCard
            icon={SlidersHorizontal}
            label="조건식 작성"
            description="고급 조건식 작성 · 파라미터 설정"
            onClick={() => onNavigate("builder")}
            accentColor="border-purple-500/30 hover:border-purple-400/50"
            iconColor="text-purple-400"
          />
          <ActionCard
            icon={BarChart3}
            label="차트 보기"
            description="캔들스틱 · 이평선 · 지표 분석"
            onClick={() => onNavigate("chart")}
            accentColor="border-blue-500/30 hover:border-blue-400/50"
            iconColor="text-blue-400"
          />
        </div>
      </div>

      {/* Recent Activity */}
      <div>
        <h3 className="mb-3 text-sm font-medium text-slate-300">최근 활동</h3>
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          {positionCount > 0 ? (
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
                <Zap size={14} className="text-emerald-400" />
              </div>
              <div>
                <p className="text-sm text-slate-300">모의투자 포지션 {positionCount}개 보유 중</p>
                <p className="text-xs text-slate-500">모의투자 현황에서 확인하세요</p>
              </div>
            </div>
          ) : presetCount > 0 ? (
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10">
                <SlidersHorizontal size={14} className="text-purple-400" />
              </div>
              <div>
                <p className="text-sm text-slate-300">저장된 조건식 {presetCount}개</p>
                <p className="text-xs text-slate-500">조건식 작성기에서 편집할 수 있습니다</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-700/50">
                <FlaskConical size={14} className="text-slate-500" />
              </div>
              <div>
                <p className="text-sm text-slate-400">아직 활동 기록이 없습니다</p>
                <p className="text-xs text-slate-500">원클릭 백테스트로 시작해보세요</p>
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
  loading,
  gradient,
  iconColor,
}: {
  icon: typeof Database;
  label: string;
  value: number;
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
        {loading ? <span className="inline-block h-7 w-12 animate-pulse rounded bg-slate-700" /> : value}
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
