import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { Activity, ArrowRight, CheckCircle2, Clock3, FlaskConical, Gauge, Loader2, Play, RefreshCw, ShieldCheck, TriangleAlert, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import React from "react";
import { toast } from "sonner";

type Page = "dashboard" | "builder" | "chart" | "backtest" | "observation" | "daytrade" | "paper" | "execution" | "activity";

const DEFAULTS = {
  combinationsPerSweep: 3000,
  maxUniverseSymbols: 20,
  lookbackTradingDays: 20,
  validationTradingDays: 5,
  minimumTrades: 24,
  minimumValidationTrades: 8,
  maxDrawdownPercent: -4,
  stopLossPercent: 1.5,
  takeProfitPercent: 3,
  maxHoldingBars: 45,
  feeRate: 0.0003,
  slippageBps: 8,
};

type Configuration = typeof DEFAULTS;

function MetricCard({ label, value, detail, tone = "teal", icon: Icon }: { label: string; value: string; detail: string; tone?: "teal" | "violet" | "amber" | "rose"; icon: typeof Activity }) {
  const styles = {
    teal: "border-teal-300/15 bg-teal-300/[0.045] text-teal-200",
    violet: "border-violet-300/15 bg-violet-300/[0.045] text-violet-200",
    amber: "border-amber-300/15 bg-amber-300/[0.045] text-amber-200",
    rose: "border-rose-300/15 bg-rose-300/[0.045] text-rose-200",
  }[tone];
  return <section className={cn("rounded-2xl border p-4 shadow-[0_18px_50px_rgba(0,0,0,0.13)]", styles)}><div className="flex items-start justify-between gap-3"><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</p><Icon size={16} /></div><p className="mt-5 font-mono text-2xl font-semibold tracking-tight text-white">{value}</p><p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">{detail}</p></section>;
}

function NumberControl({ label, value, onChange, min, step = 1, suffix }: { label: string; value: number; onChange: (value: number) => void; min?: number; step?: number; suffix?: string }) {
  return <label className="block"><span className="text-[10px] font-semibold uppercase tracking-[0.11em] text-slate-500">{label}</span><div className="relative mt-1.5"><Input type="number" min={min} step={step} value={Number.isFinite(value) ? value : ""} onChange={event => onChange(Number(event.target.value))} className="h-9 border-slate-700 bg-slate-950/70 pr-10 font-mono text-xs text-slate-100 focus-visible:ring-teal-300" />{suffix ? <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[10px] text-slate-500">{suffix}</span> : null}</div></label>;
}

function formatPercent(value: number | string | null | undefined) {
  const number = Number(value ?? 0);
  return `${number >= 0 ? "+" : ""}${number.toFixed(2)}%`;
}

function formulaLabel(value: unknown) {
  const root = value as { logic?: string; children?: unknown[] } | null;
  if (!root) return "조건식 정보 없음";
  return `${root.logic ?? "AND"} · 규칙 ${root.children?.length ?? 0}개`;
}

export function MinuteResearchWorkspace({ setActive }: { setActive: (page: Page) => void }) {
  const utils = trpc.useUtils();
  const dashboard = trpc.minuteResearch.dashboard.useQuery(undefined, { retry: false, refetchInterval: 30_000 });
  const [name, setName] = useState("1분봉 대량 조건식 검증");
  const [cronExpression, setCronExpression] = useState("0 30 7 * * 1-5");
  const [enabled, setEnabled] = useState(true);
  const [configuration, setConfiguration] = useState<Configuration>(DEFAULTS);

  useEffect(() => {
    const program = dashboard.data?.program;
    if (!program) return;
    setName(program.name);
    setCronExpression(program.cronExpression);
    setEnabled(program.status === "active");
    setConfiguration({ ...DEFAULTS, ...(program.configurationJson as Partial<Configuration>) });
  }, [dashboard.data?.program]);

  const saveProgram = trpc.minuteResearch.saveProgram.useMutation({
    onSuccess: async () => {
      await dashboard.refetch();
      toast.success("일별 1분봉 연구 프로그램을 저장했습니다. 예약 실행과 주문 전송은 분리되어 있습니다.");
    },
    onError: error => toast.error(error.message),
  });
  const runNow = trpc.minuteResearch.runNow.useMutation({
    onSuccess: result => {
      void dashboard.refetch();
      toast.message(result.reused ? "같은 연구 실행이 이미 접수되어 있습니다. 저장된 처리량을 곧 표시합니다." : "연구 실행을 접수했습니다. 실제 검증이 시작되면 저장된 처리량을 표시합니다.");
    },
    onError: error => toast.error(error.message),
  });

  const save = () => {
    const invalid = Object.values(configuration).some(value => !Number.isFinite(value));
    if (!name.trim() || !/^\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+$/.test(cronExpression) || invalid) {
      toast.error("프로그램 이름, 6필드 실행 시각, 수치 설정을 확인하세요.");
      return;
    }
    saveProgram.mutate({ name: name.trim(), cronExpression, configuration, enabled });
  };

  const latest = dashboard.data?.sweeps[0] ?? null;
  const latestSummary = latest?.summaryJson as { trainingDates?: string[]; validationDates?: string[]; symbolCount?: number; qualificationRule?: string } | null;
  const promoted = dashboard.data?.promoted ?? [];
  const cumulative = dashboard.data?.cumulative ?? [];
  const coverage = dashboard.data?.dataCoverage;
  const distribution = dashboard.data?.distribution;
  const failureReasons = dashboard.data?.failureReasons ?? [];
  const regimePerformance = dashboard.data?.regimePerformance ?? [];
  const symbolPerformance = dashboard.data?.symbolPerformance ?? [];
  const rejected = latest?.rejectedCount ?? 0;
  const researchReady = Boolean(coverage?.tradingDateCount);
  const programReady = Boolean(dashboard.data?.program && dashboard.data.program.status === "active");
  const configurationValue = useMemo(() => configuration.combinationsPerSweep.toLocaleString(), [configuration.combinationsPerSweep]);

  return <div className="enter-soft pb-8">
    <header className="relative overflow-hidden rounded-3xl border border-teal-300/15 bg-[radial-gradient(circle_at_80%_0%,rgba(45,212,191,0.16),transparent_36%),linear-gradient(145deg,rgba(12,23,34,0.98),rgba(12,17,27,0.98))] px-5 py-6 sm:px-7 sm:py-8">
      <div className="absolute -right-12 -top-20 h-64 w-64 rounded-full border border-teal-300/10" />
      <div className="relative grid gap-6 xl:grid-cols-[1.3fr_0.7fr] xl:items-end">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-teal-300">MINUTE-BAR RESEARCH ENGINE</p>
          <h1 className="mt-3 max-w-3xl text-3xl font-extrabold tracking-tight text-white sm:text-4xl">수천 개 조합을 돌리고, <span className="text-teal-300">재현되는 조건식</span>만 누적합니다.</h1>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-400">저장된 실제 1분봉을 매수·매도 가정과 비용에 맞춰 반복 평가합니다. 이 화면의 선별 결과는 연구 기록일 뿐 주문 후보나 주문 전송으로 이어지지 않습니다.</p>
          <div className="mt-5 flex flex-wrap gap-2"><span className="rounded-full border border-teal-300/20 bg-teal-300/10 px-3 py-1.5 text-[11px] font-semibold text-teal-100">미래 정보 미사용 · 다음 1분 시가 진입</span><span className="rounded-full border border-violet-300/20 bg-violet-300/10 px-3 py-1.5 text-[11px] font-semibold text-violet-100">학습/독립 검증 분리</span><span className="rounded-full border border-slate-700 bg-slate-950/45 px-3 py-1.5 text-[11px] font-semibold text-slate-300">주문 경로와 완전 분리</span></div>
        </div>
        <div className="rounded-2xl border border-slate-700/70 bg-slate-950/35 p-4"><div className="flex items-center gap-2"><div className={cn("h-2 w-2 rounded-full", programReady ? "bg-teal-300 shadow-[0_0_16px_rgba(45,212,191,0.9)]" : "bg-amber-300")} /><p className="text-xs font-semibold text-slate-200">{programReady ? "일별 연구 프로그램 활성" : "연구 프로그램 설정 필요"}</p></div><p className="mt-2 text-[11px] leading-relaxed text-slate-500">기본 실행 시각은 평일 16:30 KST입니다. 데이터가 추가되면 같은 조건식도 새 원본 지문으로 다시 검증되어 장기간 이력이 쌓입니다.</p><Button onClick={() => setActive("builder")} variant="outline" className="mt-4 w-full border-slate-700 bg-slate-900/80 text-slate-200 hover:bg-slate-800 hover:text-white">수동 조건식 연구실도 함께 보기 <ArrowRight className="ml-2" size={14}/></Button></div>
      </div>
    </header>

    <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="1분봉 원본 범위" value={coverage ? `${coverage.tradingDateCount}일` : "0일"} detail={coverage ? `${coverage.firstDate} ~ ${coverage.lastDate}` : "수집된 원본을 기다리고 있습니다."} icon={Activity}/>
      <MetricCard label="최근 조합 평가" value={latest ? latest.generatedCount.toLocaleString() : "—"} detail={latest ? `${latest.evaluatedCount.toLocaleString()}개 실제 조합 평가 완료` : "아직 실행 기록이 없습니다."} tone="violet" icon={FlaskConical}/>
      <MetricCard label="엄격 선별 통과" value={latest ? `${latest.promotedCount}개` : "—"} detail="독립 검증 기대값·수익률·낙폭·표본 기준 통과" icon={CheckCircle2}/>
      <MetricCard label="제외된 조합" value={latest ? `${rejected.toLocaleString()}개` : "—"} detail="음수 성과·낙폭·표본 부족 조건은 추천 목록에서 제외" tone="rose" icon={XCircle}/>
    </section>

    <section className="mt-5 grid gap-5 xl:grid-cols-[0.86fr_1.14fr]">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/35 p-5">
        <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-teal-300">RESEARCH PROGRAM</p><h2 className="mt-1 text-lg font-bold text-white">매일 반복할 탐색 규격</h2><p className="mt-1 text-xs leading-relaxed text-slate-500">이 규격·원본 범위·수수료 가정을 스윕마다 기록해 결과를 비교합니다.</p></div><Switch checked={enabled} onCheckedChange={setEnabled} aria-label="연구 프로그램 활성화" /></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="sm:col-span-2 text-[10px] font-semibold uppercase tracking-[0.11em] text-slate-500">프로그램 이름<Input value={name} onChange={event => setName(event.target.value)} className="mt-1.5 h-9 border-slate-700 bg-slate-950/70 text-xs text-slate-100" /></label><label className="sm:col-span-2 text-[10px] font-semibold uppercase tracking-[0.11em] text-slate-500">실행 시각 (UTC 6필드)<Input value={cronExpression} onChange={event => setCronExpression(event.target.value)} className="mt-1.5 h-9 border-slate-700 bg-slate-950/70 font-mono text-xs text-slate-100" /></label><NumberControl label="조합 수 / 스윕" value={configuration.combinationsPerSweep} min={100} onChange={value => setConfiguration(current => ({ ...current, combinationsPerSweep: value }))} suffix="개"/><NumberControl label="대상 종목 상한" value={configuration.maxUniverseSymbols} min={1} onChange={value => setConfiguration(current => ({ ...current, maxUniverseSymbols: value }))} suffix="종목"/><NumberControl label="원본 보관 기간" value={configuration.lookbackTradingDays} min={1} onChange={value => setConfiguration(current => ({ ...current, lookbackTradingDays: value }))} suffix="거래일"/><NumberControl label="독립 검증 기간" value={configuration.validationTradingDays} min={1} onChange={value => setConfiguration(current => ({ ...current, validationTradingDays: value }))} suffix="거래일"/></div>
        <details className="mt-4 rounded-xl border border-slate-800 bg-slate-950/30 p-3"><summary className="cursor-pointer text-xs font-semibold text-slate-300">성과 선별 가정과 비용 기준</summary><div className="mt-3 grid grid-cols-2 gap-3"><NumberControl label="최소 학습 거래" value={configuration.minimumTrades} min={1} onChange={value => setConfiguration(current => ({ ...current, minimumTrades: value }))}/><NumberControl label="최소 검증 거래" value={configuration.minimumValidationTrades} min={1} onChange={value => setConfiguration(current => ({ ...current, minimumValidationTrades: value }))}/><NumberControl label="허용 최대 낙폭" value={configuration.maxDrawdownPercent} step={0.1} onChange={value => setConfiguration(current => ({ ...current, maxDrawdownPercent: value }))} suffix="%"/><NumberControl label="수수료율" value={configuration.feeRate} step={0.0001} onChange={value => setConfiguration(current => ({ ...current, feeRate: value }))}/><NumberControl label="슬리피지" value={configuration.slippageBps} step={1} onChange={value => setConfiguration(current => ({ ...current, slippageBps: value }))} suffix="bps"/><NumberControl label="손절" value={configuration.stopLossPercent} step={0.1} onChange={value => setConfiguration(current => ({ ...current, stopLossPercent: value }))} suffix="%"/><NumberControl label="익절" value={configuration.takeProfitPercent} step={0.1} onChange={value => setConfiguration(current => ({ ...current, takeProfitPercent: value }))} suffix="%"/><NumberControl label="최대 보유" value={configuration.maxHoldingBars} min={1} onChange={value => setConfiguration(current => ({ ...current, maxHoldingBars: value }))} suffix="분"/></div></details>
        <div className="mt-5 flex flex-wrap gap-2"><Button onClick={save} disabled={saveProgram.isPending} className="bg-teal-300 text-slate-950 hover:bg-teal-200"><Clock3 className="mr-2" size={15}/>{saveProgram.isPending ? "저장 중" : "일별 연구 프로그램 저장"}</Button><Button onClick={() => runNow.mutate()} disabled={!researchReady || !programReady || runNow.isPending} variant="outline" className="border-violet-300/30 bg-violet-300/[0.06] text-violet-100 hover:bg-violet-300/15 hover:text-white"><Play className="mr-2" size={15}/>{runNow.isPending ? "실제 데이터 평가 중" : `${configurationValue}개 지금 검증`}</Button></div>
        {!researchReady ? <div className="mt-4 flex gap-2 rounded-xl border border-amber-300/15 bg-amber-300/[0.05] p-3 text-[11px] leading-relaxed text-amber-100"><TriangleAlert className="mt-0.5 shrink-0" size={15}/>저장된 1분봉 데이터가 생기면 실행할 수 있습니다. 데이터가 없는 상태에서 예시 성과나 임의 조합을 만들지 않습니다.</div> : null}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/35 p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-violet-300">CUMULATIVE SURVIVORS</p><h2 className="mt-1 text-lg font-bold text-white">여러 스윕에서 살아남은 조건식</h2><p className="mt-1 text-xs leading-relaxed text-slate-500">이 표에는 독립 검증을 통과한 조합만 표시합니다. 따라서 ‘좋다’는 평가는 단일 장중 손익이 아니라 반복 검증 횟수와 표본을 함께 봅니다.</p></div><Button onClick={() => dashboard.refetch()} variant="ghost" className="h-9 text-slate-400 hover:bg-slate-800 hover:text-white"><RefreshCw className={cn("mr-2", dashboard.isFetching && "animate-spin")} size={15}/>새로고침</Button></div>
        {cumulative.length ? <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[740px] text-left"><thead className="border-b border-slate-800 text-[10px] uppercase tracking-[0.12em] text-slate-500"><tr><th className="pb-3">조건식</th><th className="pb-3 text-right">통과 스윕</th><th className="pb-3 text-right">검증 거래</th><th className="pb-3 text-right">평균 OOS</th><th className="pb-3 text-right">OOS 기대값</th><th className="pb-3 text-right">최악 낙폭</th></tr></thead><tbody>{cumulative.map((item, index) => <tr key={item.strategyFingerprint} className="border-b border-slate-800/70 text-xs"><td className="py-3.5"><div className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-md bg-teal-300/10 font-mono text-[10px] text-teal-200">{index + 1}</span><div><p className="font-semibold text-slate-200">{formulaLabel(item.representative.rootGenomeJson)}</p><p className="mt-0.5 font-mono text-[10px] text-slate-500">{item.strategyFingerprint.slice(0, 12)}</p></div></div></td><td className="py-3.5 text-right font-mono text-slate-200">{item.verifiedSweepCount}</td><td className="py-3.5 text-right font-mono text-slate-200">{item.totalValidationTrades.toLocaleString()}</td><td className="py-3.5 text-right font-mono text-teal-200">{formatPercent(item.averageValidationReturnPercent)}</td><td className="py-3.5 text-right font-mono text-teal-200">{formatPercent(item.averageValidationExpectancyPercent)}</td><td className="py-3.5 text-right font-mono text-rose-200">{formatPercent(item.worstValidationMaxDrawdownPercent)}</td></tr>)}</tbody></table></div> : <div className="mt-5 flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-700 px-6 text-center"><Gauge className="mb-3 text-slate-600" size={28}/><p className="text-sm font-semibold text-slate-300">아직 누적 통과 조건식이 없습니다.</p><p className="mt-2 max-w-md text-xs leading-relaxed text-slate-500">이는 실패가 아니라 현재 데이터와 가정에서 재현성을 확인하지 못했다는 연구 결과입니다. 통과 조건식이 생길 때까지 음수·표본 부족 조합은 이 목록에 남기지 않습니다.</p></div>}</div>
    </section>

    <section className="mt-5 grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/35 p-5"><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-300">LATEST SWEEP LEDGER</p><h2 className="mt-1 text-lg font-bold text-white">최근 실제 검증 기록</h2></div><span className={cn("rounded-full px-2.5 py-1 text-[10px] font-semibold", latest?.status === "completed" ? "bg-teal-300/10 text-teal-100" : "bg-slate-800 text-slate-300")}>{latest?.status ?? "대기"}</span></div>{latest ? <div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-slate-950/40 p-3"><p className="text-[10px] text-slate-500">학습 원본</p><p className="mt-1 font-mono text-sm text-slate-200">{latestSummary?.trainingDates?.length ?? 0}일</p></div><div className="rounded-xl bg-slate-950/40 p-3"><p className="text-[10px] text-slate-500">독립 검증</p><p className="mt-1 font-mono text-sm text-slate-200">{latestSummary?.validationDates?.length ?? 0}일</p></div><div className="rounded-xl bg-slate-950/40 p-3"><p className="text-[10px] text-slate-500">유동성 유니버스</p><p className="mt-1 font-mono text-sm text-slate-200">{latestSummary?.symbolCount ?? 0}종목</p></div></div> : <p className="mt-5 text-xs leading-relaxed text-slate-500">저장된 프로그램을 활성화한 뒤 1분봉 데이터가 준비되면 최신 스윕이 이력으로 남습니다.</p>}<div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/30 p-3"><p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">선별 규칙</p><p className="mt-1.5 text-xs leading-relaxed text-slate-300">{latestSummary?.qualificationRule ?? "독립 검증 기간이 충분할 때만 수익률·기대값·낙폭·최소 표본 기준을 동시에 평가합니다."}</p></div></div>
      <div className="rounded-2xl border border-slate-800 bg-slate-900/35 p-5"><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-rose-300">WHY A MINUS CAN APPEAR</p><h2 className="mt-1 text-lg font-bold text-white">음수는 어디에 남아야 하는가</h2></div><ShieldCheck className="text-rose-200" size={20}/></div><p className="mt-4 text-xs leading-6 text-slate-400">기존 장중 모의 포지션의 ‘-’는 과거 검증 점수와 별개로, 당일 실제 가격·양방향 비용·진입 뒤 가격 변동을 반영한 관찰 손익입니다. 그래서 과거 점수가 높아도 하루 손익은 음수일 수 있습니다.</p><div className="mt-4 space-y-2"><div className="rounded-xl border border-teal-300/15 bg-teal-300/[0.045] p-3"><p className="text-xs font-semibold text-teal-100">이 연구 화면</p><p className="mt-1 text-[11px] leading-relaxed text-slate-400">독립 검증까지 양수이고 낙폭·표본 기준을 통과한 조건식만 생존 목록에 남깁니다.</p></div><div className="rounded-xl border border-rose-300/15 bg-rose-300/[0.045] p-3"><p className="text-xs font-semibold text-rose-100">제외 조합 이력</p><p className="mt-1 text-[11px] leading-relaxed text-slate-400">음수, 과도한 낙폭, 표본 부족은 버리지 않고 제외 사유로 저장합니다. 다음 파라미터 변이와 시장 국면 분석의 근거가 됩니다.</p></div></div></div>
    </section>

    <section className="mt-5 grid gap-5 xl:grid-cols-[1.04fr_0.96fr]">
      <article className="rounded-2xl border border-slate-800 bg-slate-900/35 p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-violet-300">RESULT DISTRIBUTION</p><h2 className="mt-1 text-lg font-bold text-white">최근 조합의 독립 검증 분포</h2><p className="mt-1 text-xs leading-relaxed text-slate-500">상위 조합만 보는 착시를 피하기 위해, 최근 스윕의 전체 독립 검증 결과를 구간별로 집계합니다.</p></div><FlaskConical className="text-violet-200" size={20}/></div>{distribution ? <><div className="mt-5 grid grid-cols-4 gap-2">{distribution.buckets.map(bucket => { const maximum = Math.max(...distribution.buckets.map(item => item.count), 1); return <div key={bucket.label} className="rounded-xl border border-slate-800 bg-slate-950/35 p-3"><div className="flex h-24 items-end"><div className="w-full rounded-t-md bg-violet-300/70 transition-all" style={{ height: `${Math.max(6, bucket.count / maximum * 100)}%` }}/></div><p className="mt-2 text-[10px] font-semibold text-slate-300">{bucket.label}</p><p className="mt-1 font-mono text-sm text-white">{bucket.count.toLocaleString()}</p></div>; })}</div><div className="mt-4 flex flex-wrap gap-2 text-[10px]">{Object.entries(distribution.statusCounts).map(([status, count]) => <span key={status} className="rounded-full border border-slate-700 bg-slate-950/50 px-2.5 py-1 text-slate-400">{status} <b className="ml-1 font-mono text-slate-200">{count}</b></span>)}</div></> : <p className="mt-5 text-xs text-slate-500">실행된 스윕이 생기면 성과 분포를 표시합니다.</p>}</article>
      <article className="rounded-2xl border border-slate-800 bg-slate-900/35 p-5"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-rose-300">REJECTION DIAGNOSTICS</p><h2 className="mt-1 text-lg font-bold text-white">조건식이 제외된 주요 이유</h2><p className="mt-1 text-xs leading-relaxed text-slate-500">제외는 삭제가 아닙니다. 다음 세대의 변이 범위와 데이터 보강 우선순위를 정하는 근거입니다.</p>{failureReasons.length ? <div className="mt-5 space-y-2">{failureReasons.map(reason => <div key={reason.reason} className="flex items-center justify-between gap-4 rounded-xl border border-rose-300/10 bg-rose-300/[0.035] px-3 py-2.5"><p className="text-xs text-slate-300">{reason.reason}</p><span className="font-mono text-xs text-rose-200">{reason.count.toLocaleString()}</span></div>)}</div> : <div className="mt-5 rounded-xl border border-dashed border-slate-700 px-4 py-9 text-center text-xs text-slate-500">아직 제외 사유가 집계되지 않았습니다.</div>}</article>
    </section>

    <section className="mt-5 rounded-2xl border border-slate-800 bg-slate-900/35 p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-teal-300">REGIME ROBUSTNESS</p><h2 className="mt-1 text-lg font-bold text-white">시장 국면·종목 단위 재현성</h2><p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-500">통과 조건식은 종목별 1분봉의 장중 방향과 변동폭에 따라 상승 추세·하락 추세·횡보·고변동으로 분류합니다. 같은 조건식이 어느 국면에서 약해지는지 누적 관찰합니다.</p></div><span className="rounded-full border border-teal-300/20 bg-teal-300/10 px-3 py-1.5 text-[10px] font-semibold text-teal-100">통과 조건식의 종목별 증거만 표시</span></div><div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">{regimePerformance.map(item => { const label = { trend_up: "상승 추세", trend_down: "하락 추세", range: "횡보", volatile: "고변동" }[item.regime]; return <article key={item.regime} className="rounded-xl border border-slate-800 bg-slate-950/35 p-4"><div className="flex items-center justify-between"><p className="text-xs font-semibold text-slate-200">{label}</p><span className="font-mono text-[10px] text-slate-500">{item.observationCount} 관측</span></div><p className={cn("mt-3 font-mono text-xl font-semibold", item.averageReturnPercent >= 0 ? "text-teal-200" : "text-rose-200")}>{formatPercent(item.averageReturnPercent)}</p><div className="mt-3 grid grid-cols-2 gap-2 text-[10px]"><div><p className="text-slate-500">기대값</p><p className="mt-1 font-mono text-slate-300">{formatPercent(item.averageExpectancyPercent)}</p></div><div><p className="text-slate-500">최악 낙폭</p><p className="mt-1 font-mono text-rose-200">{item.worstDrawdownPercent === null ? "—" : formatPercent(item.worstDrawdownPercent)}</p></div></div></article>; })}</div></section>
    <section className="mt-5 rounded-2xl border border-slate-800 bg-slate-900/35 p-5"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-300">SYMBOL EVIDENCE LEDGER</p><h2 className="mt-1 text-lg font-bold text-white">종목별 누적 검증 성과</h2><p className="mt-1 text-xs leading-relaxed text-slate-500">통과한 조건식이 실제로 평가된 종목별 증거를 누적합니다. 관측 횟수와 거래 수가 적은 종목은 결론이 아닌 추가 검증 대상입니다.</p></div>{symbolPerformance.length ? <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[680px] text-left"><thead className="border-b border-slate-800 text-[10px] uppercase tracking-[0.12em] text-slate-500"><tr><th className="pb-3">종목</th><th className="pb-3 text-right">관측</th><th className="pb-3 text-right">거래</th><th className="pb-3 text-right">평균 성과</th><th className="pb-3 text-right">평균 기대값</th><th className="pb-3 text-right">최악 낙폭</th></tr></thead><tbody>{symbolPerformance.map(item => <tr key={item.symbol} className="border-b border-slate-800/70 text-xs"><td className="py-3 font-mono text-slate-200">{item.symbol}</td><td className="py-3 text-right font-mono text-slate-300">{item.observationCount}</td><td className="py-3 text-right font-mono text-slate-300">{item.tradeCount}</td><td className={cn("py-3 text-right font-mono", item.averageReturnPercent >= 0 ? "text-teal-200" : "text-rose-200")}>{formatPercent(item.averageReturnPercent)}</td><td className="py-3 text-right font-mono text-slate-300">{formatPercent(item.averageExpectancyPercent)}</td><td className="py-3 text-right font-mono text-rose-200">{formatPercent(item.worstDrawdownPercent)}</td></tr>)}</tbody></table></div> : <p className="mt-5 rounded-xl border border-dashed border-slate-700 px-4 py-8 text-center text-xs text-slate-500">통과 조건식과 실제 1분봉 원본이 누적되면 종목별 성과가 이 표에 표시됩니다.</p>}</section>
  </div>;
}
