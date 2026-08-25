import { Archive, CalendarDays, CheckCircle2, CirclePlay, Database, Layers3, RotateCcw, ShieldCheck, UsersRound } from "lucide-react";
import { cn } from "@/lib/utils";

export type DatasetCollectionProfile = {
  id: "quick" | "standard" | "large" | "deep_context";
  label: string;
  symbolCount: number;
  sampleDays: number;
  detail: string;
  emphasis: string;
};

export const DATASET_COLLECTION_PROFILES: DatasetCollectionProfile[] = [
  { id: "quick", label: "빠른 탐색", symbolCount: 4, sampleDays: 5, detail: "수집기와 조건식 연결을 빠르게 점검합니다.", emphasis: "bg-slate-900/55 border-slate-700" },
  { id: "standard", label: "표준 검증", symbolCount: 10, sampleDays: 15, detail: "여러 종목·여러 장세를 비교하는 기본 연구 원본입니다.", emphasis: "bg-cyan-300/[0.09] border-cyan-200/45" },
  { id: "large", label: "대규모 보관", symbolCount: 16, sampleDays: 20, detail: "장기 비교용 원본을 모읍니다. 단말 수집 시간이 더 필요합니다.", emphasis: "bg-violet-300/[0.09] border-violet-200/45" },
  { id: "deep_context", label: "정교 조건 검증", symbolCount: 8, sampleDays: 60, detail: "완료 일봉·상위 시간축 조건의 표본을 늘립니다. 5분봉 원본이 커져 수집 시간이 더 필요합니다.", emphasis: "bg-emerald-300/[0.09] border-emerald-200/45" },
];

type CollectionRequest = {
  id: number;
  status: string;
  symbolCount: number;
  sampleDays: number;
  resumeCount?: number;
  progressJson?: unknown;
  lastError?: string | null;
};

type VaultSummary = {
  datasetCount: number;
  dailyBarCount: number;
  fiveMinuteBarCount: number;
  retention: string;
};

function requestProgress(request?: CollectionRequest) {
  if (!request?.progressJson || typeof request.progressJson !== "object") return null;
  const progress = request.progressJson as Record<string, unknown>;
  const total = Number(progress.totalSymbols ?? request.symbolCount);
  return {
    stage: typeof progress.stage === "string" ? progress.stage : "collecting",
    message: typeof progress.message === "string" ? progress.message : "수집 진행 증거를 기다리고 있습니다.",
    total: Number.isFinite(total) && total > 0 ? total : request.symbolCount,
    daily: Number(progress.completedDailySymbols ?? 0),
    fiveMinute: Number(progress.completedFiveMinuteSymbols ?? 0),
  };
}

export function DatasetCollectionControlPanel({
  profileId,
  onProfileChange,
  onRequest,
  onResume,
  isRequesting,
  isResuming,
  terminalReady,
  canRequest,
  terminalMessage,
  request,
  vault,
}: {
  profileId: DatasetCollectionProfile["id"];
  onProfileChange: (id: DatasetCollectionProfile["id"]) => void;
  onRequest: () => void;
  onResume: () => void;
  isRequesting: boolean;
  isResuming: boolean;
  terminalReady: boolean;
  canRequest: boolean;
  terminalMessage: string;
  request?: CollectionRequest;
  vault?: VaultSummary;
}) {
  const selected = DATASET_COLLECTION_PROFILES.find(profile => profile.id === profileId) ?? DATASET_COLLECTION_PROFILES[1]!;
  const resumable = request?.status === "failed" || request?.status === "cancelled";
  const progress = requestProgress(request);
  return <section data-testid="dataset-collection-control" className="mt-6 rounded-[2rem] border border-cyan-200/20 bg-[linear-gradient(135deg,rgba(8,32,47,0.92),rgba(12,20,40,0.88))] p-5 sm:p-7"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-[10px] font-black tracking-[0.18em] text-cyan-200">DATASET COLLECTION GUIDE</p><h2 className="mt-2 text-2xl font-black text-white">데이터셋 모으기 · 보관하기 · 비교하기</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">이 화면은 조건식을 검증할 실제 경기장을 만드는 곳입니다. 규모를 고르고 요청을 만든 뒤, 사용자 PC의 수집기를 실행하면 일봉·5분봉 원본이 버전 고정되어 공용 보관소에 쌓입니다.</p></div><div className={cn("rounded-2xl border px-4 py-3 text-xs", terminalReady ? "border-teal-300/30 bg-teal-300/[0.08] text-teal-100" : "border-amber-300/30 bg-amber-300/[0.08] text-amber-100")}><div className="flex items-center gap-2 font-black"><ShieldCheck size={15}/>{terminalReady ? "준비됨" : canRequest ? "로그인 후 단말 인증" : "단말 인증 필요"}</div><p className="mt-1 max-w-[18rem] leading-5 text-slate-300">{terminalMessage}</p></div></div><div className="mt-6 grid gap-3 lg:grid-cols-4">{DATASET_COLLECTION_PROFILES.map(profile => <button key={profile.id} type="button" onClick={() => onProfileChange(profile.id)} className={cn("rounded-2xl border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-cyan-200", profile.emphasis, profile.id === profileId && "ring-2 ring-cyan-200/70")}><div className="flex items-center justify-between gap-3"><span className="text-sm font-black text-white">{profile.label}</span>{profile.id === profileId && <CheckCircle2 className="text-cyan-200" size={18}/>}</div><div className="mt-3 flex gap-2"><span className="rounded-lg bg-slate-950/55 px-2 py-1 text-[11px] font-black text-cyan-100"><UsersRound className="mr-1 inline" size={12}/>{profile.symbolCount}종목</span><span className="rounded-lg bg-slate-950/55 px-2 py-1 text-[11px] font-black text-cyan-100"><CalendarDays className="mr-1 inline" size={12}/>{profile.sampleDays}거래일</span></div><p className="mt-3 text-xs leading-5 text-slate-400">{profile.detail}</p></button>)}</div><div className="mt-5 grid gap-3 lg:grid-cols-[1.15fr_0.85fr]"><div className="rounded-2xl border border-slate-700 bg-slate-950/35 p-4"><p className="text-xs font-black text-slate-100">3단계로 수집합니다</p><ol className="mt-3 grid gap-2 sm:grid-cols-3"><li className="rounded-xl bg-slate-900/55 p-3 text-xs text-slate-300"><span className="font-black text-cyan-100">1. 규모 선택</span><p className="mt-1 text-slate-500">현재: {selected.label} · {selected.symbolCount}종목 · {selected.sampleDays}일</p></li><li className="rounded-xl bg-slate-900/55 p-3 text-xs text-slate-300"><span className="font-black text-cyan-100">2. 요청 만들기</span><p className="mt-1 text-slate-500">아래 버튼으로 수집 대기열을 만듭니다.</p></li><li className="rounded-xl bg-slate-900/55 p-3 text-xs text-slate-300"><span className="font-black text-cyan-100">3. PC 수집기 실행</span><p className="mt-1 text-slate-500">`run-shared-dataset-collector.cmd`가 실제 원본을 읽습니다.</p></li></ol><button type="button" onClick={onRequest} disabled={isRequesting || !canRequest} className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-xl bg-cyan-300 px-4 text-sm font-black text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-45"><CirclePlay className="mr-2" size={17}/>{isRequesting ? "수집 요청 생성 중" : `${selected.label} 데이터셋 요청 만들기`}</button></div><div className="rounded-2xl border border-slate-700 bg-slate-950/35 p-4"><div className="flex items-center gap-2"><Archive className="text-violet-200" size={17}/><p className="text-xs font-black text-slate-100">공용 보관소 현황</p></div><div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-xl bg-slate-900/55 p-2"><p className="text-slate-500">데이터셋</p><p className="mt-1 font-mono font-black text-white">{vault?.datasetCount?.toLocaleString() ?? "—"}</p></div><div className="rounded-xl bg-slate-900/55 p-2"><p className="text-slate-500">일봉</p><p className="mt-1 font-mono font-black text-white">{vault?.dailyBarCount?.toLocaleString() ?? "—"}</p></div><div className="rounded-xl bg-slate-900/55 p-2"><p className="text-slate-500">5분봉</p><p className="mt-1 font-mono font-black text-white">{vault?.fiveMinuteBarCount?.toLocaleString() ?? "—"}</p></div></div><p className="mt-3 text-[11px] leading-5 text-slate-500">{vault?.retention ?? "완료된 원본은 버전과 지문을 함께 보관합니다."}</p></div></div>{request && <div className={cn("mt-4 rounded-2xl border p-4", resumable ? "border-amber-300/30 bg-amber-300/[0.07]" : "border-slate-700 bg-slate-950/35")}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black text-slate-100">최근 수집 요청 #{request.id} · {request.status.toUpperCase()}</p><p className="mt-1 text-xs leading-5 text-slate-400">{progress?.message ?? "지정 단말의 수집 상태를 확인하고 있습니다."}{request.resumeCount ? ` · 재개 ${request.resumeCount}회` : ""}</p>{progress && <p className="mt-2 text-[11px] text-cyan-100">일봉 {Math.min(progress.daily, progress.total)}/{progress.total}종목 · 5분봉 {Math.min(progress.fiveMinute, progress.total)}/{progress.total}종목</p>}</div>{resumable && <button type="button" onClick={onResume} disabled={isResuming || !terminalReady} className="inline-flex items-center rounded-xl border border-amber-200/40 bg-amber-200/10 px-3 py-2 text-xs font-black text-amber-100 disabled:opacity-50"><RotateCcw className="mr-1.5" size={14}/>{isResuming ? "재개 준비 중" : "이 지점부터 다시 이어가기"}</button>}</div><p className="mt-3 text-[11px] leading-5 text-slate-500">수집기는 종목별 일봉·5분봉 완료 지점을 PC에 저장합니다. 중단되면 같은 요청을 재개해 이미 받은 원본은 다시 읽지 않고 이어갑니다.</p></div>}</section>;
}
