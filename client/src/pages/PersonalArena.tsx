import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { ArrowLeft, CheckCircle2, Dices, FlaskConical, Loader2, LockKeyhole, Play, ShieldCheck, Sparkles, Swords, Trophy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type ArenaSize = 100 | 1_000 | 3_000;

const ARENAS: Array<{ value: ArenaSize; label: string; description: string }> = [
  { value: 100, label: "빠른 결과", description: "100개 · 5일" },
  { value: 1_000, label: "표준 확인", description: "1,000개 · 10일" },
  { value: 3_000, label: "대규모 탐색", description: "3,000개 · 20일" },
];

function initialArenaChoice() {
  const query = new URLSearchParams(window.location.search);
  const size = Number(query.get("size"));
  return {
    useSurvivorCore: query.get("deck") !== "random",
    size: size === 100 || size === 1_000 || size === 3_000 ? size : 1_000 as ArenaSize,
    sharedDatasetIds: Array.from(new Set((query.get("sharedDatasetIds") ?? "").split(",").map(value => Number(value)).filter(value => Number.isInteger(value) && value > 0))).slice(0, 12),
    sharedTimeframe: query.get("timeframe") === "five_minute" ? "five_minute" as const : "daily" as const,
    sharedPresetId: Number(query.get("presetId")) || null,
  };
}

export default function PersonalArena() {
  const { user, loading } = useAuth();
  const startingChoice = useMemo(initialArenaChoice, []);
  const [useSurvivorCore, setUseSurvivorCore] = useState(startingChoice.useSurvivorCore);
  const [combinationCount, setCombinationCount] = useState<ArenaSize>(startingChoice.size);
  const [sharedPresetId, setSharedPresetId] = useState<number | null>(startingChoice.sharedPresetId);
  const [sharedBattleResults, setSharedBattleResults] = useState<Array<{ datasetId: number; datasetName: string; averageReturn: number | null; averageWinRate: number | null; totalTradeCount: number; worstDrawdown: number | null }> | null>(null);
  const utils = trpc.useUtils();
  const dashboard = trpc.minuteResearch.personalDashboard.useQuery(undefined, { enabled: Boolean(user), retry: false, refetchInterval: 30_000 });
  const sharedDatasets = trpc.sharedDatasets.listPublic.useQuery(undefined, { enabled: startingChoice.sharedDatasetIds.length >= 2, retry: false });
  const sharedPresets = trpc.presets.list.useQuery(undefined, { enabled: Boolean(user) && startingChoice.sharedDatasetIds.length >= 2, retry: false });
  const runMinuteResearch = trpc.minuteResearch.runPersonal.useMutation({
    onSuccess: async result => {
      await utils.minuteResearch.personalDashboard.invalidate();
      if (result.status === "waiting_for_data") toast.message("아레나가 열릴 실제 1분봉 데이터를 기다리고 있습니다.");
      else toast.success(result.status === "reused" ? "같은 데이터와 덱의 기존 개인 배틀 기록을 불러왔습니다." : `${(result.generatedCount ?? 0).toLocaleString()}개 조건식 조합의 개인 배틀을 완료했습니다.`);
    },
    onError: error => toast.error(error.message),
  });
  const runSharedBattle = trpc.sharedDatasets.runMultiDatasetBacktest.useMutation({
    onSuccess: result => {
      setSharedBattleResults(result.ranked);
      toast.success(`${result.totalDatasetCount}개 공용 원본에서 조건식 카드 배틀을 완료했습니다.`);
    },
    onError: error => toast.error(error.message),
  });
  const isSharedBattle = startingChoice.sharedDatasetIds.length >= 2;
  const sharedArenaDatasets = useMemo(() => sharedDatasets.data?.items.filter(dataset => startingChoice.sharedDatasetIds.includes(dataset.id)) ?? [], [sharedDatasets.data, startingChoice.sharedDatasetIds]);
  useEffect(() => { if (!sharedPresetId && sharedPresets.data?.[0]) setSharedPresetId(sharedPresets.data[0].id); }, [sharedPresetId, sharedPresets.data]);
  const runPersonal = {
    isPending: isSharedBattle ? runSharedBattle.isPending : runMinuteResearch.isPending,
    mutate: (configuration: Parameters<typeof runMinuteResearch.mutate>[0]) => {
      if (isSharedBattle) {
        if (!sharedPresetId) { toast.error("공용 데이터 아레나에서 사용할 내 조건식 카드를 선택하세요."); return; }
        runSharedBattle.mutate({ datasetIds: startingChoice.sharedDatasetIds, presetId: sharedPresetId, timeframe: startingChoice.sharedTimeframe, minScore: 70, holdingBars: startingChoice.sharedTimeframe === "daily" ? 5 : 12, feeRate: 0.0003, slippageBps: 8 });
        return;
      }
      runMinuteResearch.mutate(configuration);
    },
  };
  const latestSweep = dashboard.data?.sweeps[0];
  const promoted = dashboard.data?.promoted ?? [];
  const isRunning = runPersonal.isPending || latestSweep?.status === "running";
  const selectedArena = ARENAS.find(arena => arena.value === combinationCount) ?? ARENAS[1];
  const configuration = useMemo(() => ({
    combinationsPerSweep: combinationCount,
    maxUniverseSymbols: selectedArena.value === 100 ? 4 : selectedArena.value === 1_000 ? 10 : 20,
    lookbackTradingDays: selectedArena.value === 100 ? 5 : selectedArena.value === 1_000 ? 10 : 20,
    validationTradingDays: selectedArena.value === 100 ? 2 : selectedArena.value === 1_000 ? 3 : 5,
    minimumTrades: 24,
    minimumValidationTrades: 8,
    maxDrawdownPercent: -4,
    stopLossPercent: 1.5,
    takeProfitPercent: 3,
    maxHoldingBars: 45,
    feeRate: 0.0003,
    slippageBps: 8,
    explorationMode: useSurvivorCore ? "survivor_core" as const : "diverse_random" as const,
  }), [combinationCount, selectedArena.value, useSurvivorCore]);

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-[#06101b] text-slate-300"><Loader2 className="mr-2 animate-spin" size={18} />트레이너 정보를 확인하는 중입니다.</main>;
  if (!user) return <main className="flex min-h-screen items-center justify-center bg-[#06101b] px-5 text-slate-100"><section className="w-full max-w-md rounded-3xl border border-cyan-200/20 bg-slate-900/80 p-8 text-center shadow-2xl"><LockKeyhole className="mx-auto text-cyan-200" size={30} /><h1 className="mt-5 text-2xl font-black">개인 아레나에 입장하세요</h1><p className="mt-3 text-sm leading-6 text-slate-400">로그인하면 내 조건식 조합을 연구용 실제 1분봉 데이터로 대결할 수 있습니다. 주문·계좌·주문 전송 기능은 이 경로에 포함되지 않습니다.</p><Button onClick={() => startLogin()} className="mt-6 bg-cyan-300 font-bold text-slate-950 hover:bg-cyan-200">로그인하고 개인 아레나 열기</Button></section></main>;
  if (user.isOperator && !isSharedBattle) return <main className="flex min-h-screen items-center justify-center bg-[#06101b] px-5 text-slate-100"><section className="w-full max-w-md rounded-3xl border border-teal-200/20 bg-slate-900/80 p-8 text-center shadow-2xl"><ShieldCheck className="mx-auto text-teal-200" size={30} /><h1 className="mt-5 text-2xl font-black">운영자 연구소로 이동하세요</h1><p className="mt-3 text-sm leading-6 text-slate-400">운영자 계정은 개인 아레나와 분리된 예약 실행·연구 프로그램 관리 화면을 사용합니다.</p><a href="/operator" className="mt-6 inline-flex h-11 items-center rounded-xl bg-teal-300 px-5 text-sm font-bold text-slate-950 transition hover:bg-teal-200">운영자 연구소 열기</a></section></main>;

  return <main data-testid="personal-arena-page" className="min-h-screen bg-[#06101b] px-4 py-5 text-slate-100 sm:px-7 lg:px-10"><div className="mx-auto max-w-6xl"><header className="flex flex-wrap items-center justify-between gap-4"><a href="/" className="inline-flex items-center gap-2 rounded-xl text-sm font-bold text-slate-300 transition hover:text-cyan-100"><ArrowLeft size={16} />게임 아레나로</a><div className="flex items-center gap-3"><a href="/datasets" className="text-sm font-bold text-slate-300 transition hover:text-cyan-100">공용 데이터</a><a href="/profile" className="text-sm font-bold text-slate-300 transition hover:text-cyan-100">내 정보</a><span className="inline-flex items-center gap-2 rounded-full border border-cyan-200/20 bg-cyan-300/10 px-3 py-1.5 text-xs font-bold text-cyan-100"><ShieldCheck size={14} />내 연구 전용 · 주문 전송 분리</span></div></header>
    <section className="relative mt-6 overflow-hidden rounded-[2rem] border border-cyan-200/20 bg-[radial-gradient(circle_at_85%_15%,rgba(34,211,238,0.16),transparent_28%),linear-gradient(135deg,#102438,#08121d)] p-6 sm:p-8"><div className="absolute -right-20 -top-20 h-72 w-72 rounded-full border border-cyan-200/10"/><div className="relative grid gap-7 lg:grid-cols-[0.85fr_1.15fr] lg:items-center"><div><p className="text-[11px] font-black tracking-[0.2em] text-cyan-200">PERSONAL RESEARCH ARENA</p><h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">내 첫 전략 카드를<br/><span className="text-cyan-200">데이터와 대결시키세요.</span></h1><p className="mt-4 max-w-lg text-sm leading-6 text-slate-300">이 공간은 로그인한 트레이너의 연구 기록만 표시합니다. 실제 저장 1분봉을 평가하지만, 키움 토큰·계좌 조회·주문 API는 호출하지 않습니다.</p><div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold"><span className="rounded-xl border border-slate-700 bg-slate-950/35 px-3 py-2 text-slate-300"><FlaskConical className="mr-1.5 inline text-cyan-200" size={14}/>조건식 반복 검증</span><span className="rounded-xl border border-slate-700 bg-slate-950/35 px-3 py-2 text-slate-300"><LockKeyhole className="mr-1.5 inline text-amber-200" size={14}/>계좌·주문 미접근</span></div></div>
      <section aria-label="개인 배틀 설정" className="rounded-3xl border border-slate-600/70 bg-slate-950/45 p-5 shadow-xl"><div className="flex items-center justify-between"><div><p className="text-[10px] font-black tracking-[0.18em] text-cyan-200">BATTLE SETUP</p><h2 className="mt-1 text-lg font-extrabold">덱과 규모를 정하세요</h2></div><Swords className="text-cyan-200" size={22}/></div><div className="mt-5 grid gap-2 sm:grid-cols-2"><button type="button" onClick={() => setUseSurvivorCore(true)} className={cn("rounded-2xl border p-4 text-left transition", useSurvivorCore ? "border-cyan-200/50 bg-cyan-300/10" : "border-slate-700 bg-slate-900/45 hover:border-slate-500")}><ShieldCheck className="text-cyan-200" size={18}/><strong className="mt-3 block text-sm">생존 지표 덱</strong><span className="mt-1 block text-xs leading-5 text-slate-400">검증에서 반복된 핵심 지표부터</span></button><button type="button" onClick={() => setUseSurvivorCore(false)} className={cn("rounded-2xl border p-4 text-left transition", !useSurvivorCore ? "border-violet-200/50 bg-violet-300/10" : "border-slate-700 bg-slate-900/45 hover:border-slate-500")}><Dices className="text-violet-200" size={18}/><strong className="mt-3 block text-sm">랜덤 도전 덱</strong><span className="mt-1 block text-xs leading-5 text-slate-400">10개 이상 비중복 규칙군 탐험</span></button></div><div className="mt-5 grid grid-cols-3 gap-2">{ARENAS.map(arena => <button key={arena.value} type="button" onClick={() => setCombinationCount(arena.value)} className={cn("rounded-xl border p-3 text-left transition", combinationCount === arena.value ? "border-cyan-200/45 bg-cyan-300/10" : "border-slate-700 bg-slate-900/45 hover:border-slate-500")}><strong className="block text-xs text-white">{arena.label}</strong><span className="mt-1 block text-[10px] text-slate-400">{arena.description}</span></button>)}</div><Button onClick={() => runPersonal.mutate(configuration)} disabled={isRunning} className="mt-5 h-12 w-full bg-cyan-300 font-black text-slate-950 hover:bg-cyan-200"><Play className="mr-2 fill-current" size={17}/>{isRunning ? "개인 배틀 진행 중" : `${combinationCount.toLocaleString()} 조합 배틀 시작`}</Button></section></div></section>
    <section className="mt-6 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]"><article className="rounded-3xl border border-slate-700 bg-slate-900/40 p-6"><p className="text-[10px] font-black tracking-[0.18em] text-violet-200">MY LATEST BATTLE</p><h2 className="mt-2 text-xl font-extrabold">최근 개인 배틀 기록</h2>{latestSweep ? <div className="mt-5 grid grid-cols-3 gap-3"><div className="rounded-2xl bg-slate-950/55 p-3"><p className="text-[10px] text-slate-500">대결 조합</p><p className="mt-1 font-mono text-lg text-white">{latestSweep.generatedCount.toLocaleString()}</p></div><div className="rounded-2xl bg-slate-950/55 p-3"><p className="text-[10px] text-slate-500">통과 카드</p><p className="mt-1 font-mono text-lg text-cyan-200">{latestSweep.promotedCount}</p></div><div className="rounded-2xl bg-slate-950/55 p-3"><p className="text-[10px] text-slate-500">상태</p><p className="mt-1 text-sm font-bold text-slate-200">{latestSweep.status === "completed" ? "완료" : latestSweep.status}</p></div></div> : <p className="mt-5 rounded-2xl border border-dashed border-slate-700 p-5 text-sm leading-6 text-slate-400">아직 내 개인 배틀 기록이 없습니다. 위에서 덱과 규모를 고른 뒤 첫 대결을 시작해 보세요.</p>}<p className="mt-5 text-xs leading-5 text-slate-500">성과는 연구용 검증 결과이며 미래 수익 또는 투자 판단을 보장하지 않습니다.</p></article><article className="rounded-3xl border border-slate-700 bg-slate-900/40 p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-black tracking-[0.18em] text-amber-200">MY POKÉMON</p><h2 className="mt-2 text-xl font-extrabold">내가 수집한 생존 카드</h2></div><Trophy className="text-amber-200" size={22}/></div>{promoted.length ? <div className="mt-5 grid gap-3 sm:grid-cols-2">{promoted.slice(0, 4).map((card, index) => <div key={card.id} className="rounded-2xl border border-slate-700 bg-slate-950/45 p-4"><div className="flex items-center justify-between"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-300/10 text-xs font-bold text-amber-100">{index + 1}</span><CheckCircle2 className="text-cyan-200" size={16}/></div><p className="mt-4 font-mono text-xs text-slate-200">{card.strategyFingerprint.slice(0, 12)}</p><p className="mt-2 text-xs text-slate-400">OOS {Number(card.validationReturnPercent).toFixed(2)}% · 승률 {Number(card.winRate).toFixed(1)}%</p></div>)}</div> : <p className="mt-5 rounded-2xl border border-dashed border-slate-700 p-5 text-sm leading-6 text-slate-400">독립 검증 기준을 통과한 카드가 여기 수집됩니다. 통과하지 못한 조합도 기록에는 남지만 내 포켓몬으로 승격되지는 않습니다.</p>}</article></section>
    {isSharedBattle ? <SharedArenaLoadout datasets={sharedArenaDatasets} timeframe={startingChoice.sharedTimeframe} presetId={sharedPresetId} presets={sharedPresets.data ?? []} onPresetChange={setSharedPresetId} results={sharedBattleResults} /> : null}
  </div></main>;
}

function SharedArenaLoadout({ datasets, timeframe, presetId, presets, onPresetChange, results }: { datasets: Array<{ id: number; name: string; startDate: string; endDate: string }>; timeframe: "daily" | "five_minute"; presetId: number | null; presets: Array<{ id: number; name: string }>; onPresetChange: (id: number | null) => void; results: Array<{ datasetId: number; datasetName: string; averageReturn: number | null; averageWinRate: number | null; totalTradeCount: number; worstDrawdown: number | null }> | null }) {
  return <section data-testid="shared-arena-loadout" className="mt-6 rounded-3xl border border-amber-200/30 bg-amber-200/[0.05] p-5 sm:p-6"><p className="text-[10px] font-black tracking-[0.18em] text-amber-200">SHARED ARENA LOADOUT</p><h2 className="mt-2 text-xl font-black text-white">선택한 공용 원본으로 조건식 카드 배틀</h2><p className="mt-2 text-xs leading-5 text-slate-400">{timeframe === "daily" ? "일봉" : "5분봉"} 원본 {datasets.length}개에 같은 조건식 카드를 반복 적용합니다. 주문·계좌 경로는 호출하지 않습니다.</p><div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr]"><div className="rounded-2xl border border-slate-700 bg-slate-950/45 p-4"><p className="text-xs font-bold text-slate-300">선택 공용 데이터 아레나</p><div className="mt-3 flex flex-wrap gap-2">{datasets.length ? datasets.map(dataset => <span key={dataset.id} className="rounded-xl border border-cyan-200/25 bg-cyan-300/10 px-3 py-2 text-xs font-bold text-cyan-100">{dataset.name} · {dataset.startDate}~{dataset.endDate}</span>) : <span className="text-xs text-slate-500">선택 원본을 불러오는 중입니다.</span>}</div></div><label className="rounded-2xl border border-slate-700 bg-slate-950/45 p-4 text-xs font-bold text-slate-300">배틀에 사용할 내 조건식 카드<select aria-label="공용 아레나 조건식 카드" value={presetId ?? ""} onChange={event => onPresetChange(event.target.value ? Number(event.target.value) : null)} className="mt-3 h-10 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-white"><option value="">조건식 카드 선택</option>{presets.map(preset => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select></label></div>{results ? <div data-testid="shared-arena-scoreboard" className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{results.map((result, index) => <article key={result.datasetId} className="rounded-2xl border border-teal-200/20 bg-slate-950/45 p-4"><p className="text-[10px] font-black text-amber-200">#{index + 1} DATASET BATTLE</p><p className="mt-2 text-sm font-bold text-white">{result.datasetName}</p><p className="mt-3 font-mono text-2xl font-black text-teal-100">{Number(result.averageReturn ?? 0) >= 0 ? "+" : ""}{Number(result.averageReturn ?? 0).toFixed(2)}%</p><p className="mt-2 text-[11px] text-slate-400">승률 {Number(result.averageWinRate ?? 0).toFixed(1)}% · 거래 {result.totalTradeCount}회 · 낙폭 {Number(result.worstDrawdown ?? 0).toFixed(2)}%</p></article>)}</div> : null}</section>;
}
