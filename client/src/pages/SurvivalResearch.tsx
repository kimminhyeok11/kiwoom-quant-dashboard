import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, Eye, FlaskConical, ShieldAlert, Trophy } from "lucide-react";
import { toast } from "sonner";

type RecordLike = Record<string, unknown>;

function asRecord(value: unknown): RecordLike {
  return value && typeof value === "object" ? value as RecordLike : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function percent(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `${parsed >= 0 ? "+" : ""}${parsed.toFixed(2)}%` : "—";
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-950/35 p-3 text-xs"><p className="text-slate-500">{label}</p><p className="mt-1 font-black text-white">{value}</p></div>;
}

function ablationVerdict(value: unknown) {
  const arenas = asArray(value).map(asRecord);
  const totalTrades = arenas.reduce((sum, arena) => sum + Number(arena.totalTradeCount ?? 0), 0);
  const hasNegativeReturn = arenas.some(arena => Number(arena.averageReturn ?? 0) <= 0);
  const hasExcessDrawdown = arenas.some(arena => Number(arena.worstDrawdown ?? Number.NEGATIVE_INFINITY) < -20);
  const averageWinRate = arenas.length ? arenas.reduce((sum, arena) => sum + Number(arena.averageWinRate ?? 0), 0) / arenas.length : 0;
  if (!arenas.length) return "판독 불가: 실제 아레나 결과가 없습니다.";
  if (hasNegativeReturn) return "원본 유지: 한 개 이상 아레나가 음수 수익률입니다.";
  if (hasExcessDrawdown) return "원본 유지: 한 개 이상 아레나가 최대 낙폭 기준을 벗어났습니다.";
  if (totalTrades < 120 || averageWinRate < 40) return `추가 표본 필요: 누적 ${totalTrades}회 · 평균 승률 ${averageWinRate.toFixed(2)}%로 승격 기준에 미달합니다.`;
  return "재판정 후보: 현 승격 기준을 충족했으므로 같은 조건으로 장부 재평가가 필요합니다.";
}

function ComplexRuleEvidence({ value }: { value: unknown }) {
  const rules = asArray(value).map(asRecord);
  if (!rules.length) return null;
  return <details className="mt-4 rounded-2xl border border-cyan-200/15 bg-cyan-300/[0.04] p-4">
    <summary className="cursor-pointer text-xs font-black text-cyan-100">복합 조건 구조 · 시간축 · 원문 근거 보기</summary>
    <p className="mt-2 text-[11px] leading-5 text-slate-400">각 규칙은 신호 시점까지 완료된 원본만 사용합니다. 시간축이 없는 원문 부분은 근사 또는 미지원으로 남기며, 임의로 성과 규칙에 넣지 않습니다.</p>
    <div className="mt-3 grid gap-2 md:grid-cols-2">{rules.map((rule, index) => {
      const config = asRecord(rule.config);
      const coverage = String(config.coverage ?? "연구 규칙");
      return <div key={`${String(rule.id ?? index)}`} className="rounded-xl border border-white/10 bg-slate-950/35 p-3 text-[11px]"><div className="flex items-center justify-between gap-2"><span className="font-black text-slate-100">{String(config.timeframe ?? "active")}</span><span className="rounded-md bg-cyan-200/10 px-1.5 py-0.5 text-cyan-100">{String(rule.type ?? "rule")}</span></div><p className="mt-2 leading-5 text-slate-300">{String(config.sourceRule ?? rule.id ?? "원문 근거 없음")}</p><p className="mt-1 text-slate-500">{coverage}</p></div>;
    })}</div>
  </details>;
}

function AblationEvidence({ value }: { value: unknown }) {
  const variants = asArray(value).map(asRecord);
  if (!variants.length) return null;
  return <details className="mt-4 rounded-2xl border border-white/10 bg-slate-950/25 p-4">
    <summary className="cursor-pointer text-xs font-black text-cyan-100">규칙 하나씩 제거한 실제 5분봉 비교 보기</summary>
    <p className="mt-2 text-[11px] leading-5 text-slate-400">각 비교는 나머지 규칙을 유지한 채 한 규칙만 제거했습니다. 이는 주문·체결 기록이 아닌 저장 원본의 연구 결과입니다.</p>
    <div className="mt-3 space-y-3">
      {variants.map((variant, index) => <div key={`${String(variant.removedRuleId ?? index)}`} className="rounded-xl border border-slate-700 bg-slate-900/40 p-3">
        <p className="text-xs font-bold text-slate-100">제거한 규칙: {String(variant.removedRuleSource ?? variant.removedRuleId ?? "—")}</p>
        <div className="mt-2 grid gap-2 md:grid-cols-2">{asArray(variant.perDataset).map((dataset, datasetIndex) => {
          const item = asRecord(dataset);
          return <div key={`${String(item.datasetId ?? datasetIndex)}`} className="rounded-lg bg-slate-950/35 p-2.5 text-[11px] text-slate-400"><p className="font-bold text-slate-200">{String(item.datasetName ?? "아레나")}</p><p className="mt-1">수익률 <span className="font-black text-cyan-100">{percent(item.averageReturn)}</span> · 거래 {String(item.totalTradeCount ?? 0)}회</p><p>승률 {percent(item.averageWinRate)} · 낙폭 {percent(item.worstDrawdown)}</p></div>;
        })}</div>
        <p className="mt-2 text-[11px] font-semibold text-amber-100">판독: {ablationVerdict(variant.perDataset)}</p>
      </div>)}
    </div>
  </details>;
}

function LongArenaEvidence({ value, decision, title = "60일 독립 아레나 재검증 보기" }: { value: unknown; decision: unknown; title?: string }) {
  const revalidation = asRecord(value);
  const verdict = asRecord(decision);
  const variants = asArray(revalidation.variants).map(asRecord);
  if (!variants.length) return null;
  return <details className="mt-4 rounded-2xl border border-rose-200/20 bg-rose-300/[0.04] p-4">
    <summary className="cursor-pointer text-xs font-black text-rose-100">{title}</summary>
    <p className="mt-2 text-[11px] leading-5 text-slate-400">{String(revalidation.datasetName ?? "긴 원본 아레나")}에서 원본과 단일 제거 후보를 같은 비용·지연 가정으로 다시 비교했습니다. 이 결과는 주문·체결이 아닌 저장된 읽기 전용 원본 연구입니다.</p>
    <div className="mt-3 grid gap-2 md:grid-cols-2">{variants.map((variant, index) => <div key={`${String(variant.id ?? index)}`} className="rounded-xl border border-white/10 bg-slate-950/35 p-3 text-[11px] text-slate-400"><p className="font-black text-slate-100">{String(variant.label ?? "조건식 후보")}</p><p className="mt-1">수익률 <span className="font-black text-cyan-100">{percent(variant.averageReturn)}</span> · 거래 {String(variant.totalTradeCount ?? 0)}회</p><p>승률 {percent(variant.averageWinRate)} · 낙폭 {percent(variant.worstDrawdown)}</p></div>)}</div>
    {verdict.reason ? <p className="mt-3 text-[11px] font-semibold leading-5 text-rose-100">장부 판독: {String(verdict.reason)}</p> : null}
  </details>;
}

function LedgerCard({ ledger }: { ledger: any }) {
  const evidence = asRecord(ledger.evidenceJson);
  const plan = asRecord(ledger.improvementPlanJson);
  const status = ledger.status as "promoted" | "observe" | "rejected";
  const tone = status === "promoted" ? "border-emerald-300/35 bg-emerald-300/[0.07]" : status === "observe" ? "border-amber-300/35 bg-amber-300/[0.07]" : "border-rose-300/35 bg-rose-300/[0.07]";
  const label = status === "promoted" ? "생존 카드" : status === "observe" ? "관찰 카드" : "제외 카드";
  const failures = asArray(evidence.failures).map(String);
  const arenas = asArray(evidence.arenas).map(asRecord);
  const rules = ledger.preset?.rulesJson;
  return <article className={`rounded-3xl border p-5 sm:p-6 ${tone}`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><div className="flex items-center gap-2">{status === "promoted" ? <CheckCircle2 className="text-emerald-200" size={19}/> : status === "observe" ? <Eye className="text-amber-200" size={19}/> : <ShieldAlert className="text-rose-200" size={19}/>}<p className="text-xs font-black tracking-[0.12em]">{label.toUpperCase()}</p></div><h3 className="mt-2 text-lg font-black text-white">{ledger.preset?.name ?? `조건식 카드 #${ledger.presetId}`}</h3><p className="mt-1 text-xs text-slate-400">판정 시각 {new Date(ledger.createdAt).toLocaleString("ko-KR")}</p></div>
      <span className="rounded-xl border border-white/10 bg-slate-950/35 px-3 py-2 text-xs font-black text-slate-100">{String(evidence.arenaCount ?? 0)}개 아레나</span>
    </div>
    <div className="mt-4 grid gap-2 sm:grid-cols-4"><Metric label="양수 아레나" value={`${String(evidence.positiveArenaCount ?? 0)}개`}/><Metric label="누적 거래" value={`${String(evidence.totalTradeCount ?? 0)}회`}/><Metric label="평균 승률" value={percent(evidence.averageWinRate)}/><Metric label="최대 낙폭" value={percent(evidence.worstDrawdown)}/></div>
    <div className="mt-4 grid gap-3 lg:grid-cols-2"><div className="rounded-2xl bg-slate-950/30 p-4"><p className="text-xs font-black text-slate-200">아레나별 근거</p><div className="mt-2 space-y-2">{arenas.map((arena, index) => <p key={`${String(arena.datasetId ?? index)}`} className="text-xs text-slate-400"><span className="font-bold text-slate-200">{String(arena.datasetName ?? "아레나")}</span> · 수익률 {percent(arena.averageReturn)} · 거래 {String(arena.totalTradeCount ?? 0)}회 · 낙폭 {percent(arena.worstDrawdown)}</p>)}</div></div><div className="rounded-2xl bg-slate-950/30 p-4"><p className="text-xs font-black text-slate-200">다음 개선 실험</p><p className="mt-2 text-xs leading-5 text-slate-400">{String(plan.nextAction ?? "기록된 지표 근거를 확인하세요.")}</p>{failures.length ? <p className="mt-2 text-xs text-amber-100">제외·관찰 사유: {failures.join(" · ")}</p> : null}</div></div>
    <ComplexRuleEvidence value={rules}/>
    <AblationEvidence value={evidence.ablationResults}/>
    <LongArenaEvidence value={evidence.longArenaRevalidation} decision={evidence.longArenaDecision}/>
    <LongArenaEvidence value={evidence.extendedArenaRevalidation} decision={evidence.longArenaDecision} title="16종목·60일 독립 아레나 재검증 보기"/>
  </article>;
}

export default function SurvivalResearch() {
  const { user, loading } = useAuth();
  const utils = trpc.useUtils();
  const presets = trpc.presets.list.useQuery(undefined, { enabled: Boolean(user), retry: false });
  const ledgers = trpc.survivalResearch.list.useQuery(undefined, { enabled: Boolean(user), retry: false });
  const candidates = (presets.data ?? []).filter(item => item.name.startsWith("제공 조건식") && Array.isArray(item.rulesJson) && item.rulesJson.length > 0);
  const evaluate = trpc.survivalResearch.evaluate.useMutation({ onSuccess: async result => { await utils.survivalResearch.list.invalidate(); toast.success(`${result.ledgers.length}개 조건식을 생존 기준으로 다시 판정했습니다.`); }, onError: error => toast.error(error.message) });
  const runEvaluation = () => { if (!user) { startLogin(); return; } if (!candidates.length) { toast.error("직접 평가 가능한 제공 조건식 카드가 아직 없습니다."); return; } evaluate.mutate({ presetIds: candidates.map(item => item.id) }); };
  return <main className="min-h-screen bg-[#06101b] text-slate-100"><div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:px-10"><section className="rounded-[2rem] border border-emerald-200/20 bg-[radial-gradient(circle_at_top_right,rgba(45,212,191,0.14),transparent_34%),linear-gradient(135deg,rgba(8,24,32,0.96),rgba(15,23,42,0.92))] p-6 sm:p-8"><div className="flex flex-wrap items-start justify-between gap-5"><div className="max-w-3xl"><p className="text-[10px] font-black tracking-[0.18em] text-emerald-200">SURVIVOR LEDGER · 다중 아레나 검증</p><h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">좋은 결과만 남기되,<br/><span className="text-emerald-200">한 번의 승리로 승격하지 않습니다.</span></h1><p className="mt-4 text-sm leading-6 text-slate-300">각 조건식은 서로 다른 실제 공용 아레나에서 수익률·거래 수·승률·최대 낙폭을 함께 검증합니다. 기준을 모두 통과한 카드만 생존 카드가 되며, 나머지는 관찰 또는 제외 사유와 다음 지표 실험을 남깁니다.</p></div><Button onClick={runEvaluation} disabled={loading || evaluate.isPending} className="bg-emerald-300 px-5 font-black text-slate-950 hover:bg-emerald-200">{evaluate.isPending ? "판정 기록 중…" : "현재 연구 기록으로 재판정"}</Button></div><div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{[["아레나", "2개 이상"],["수익률", "모두 양수"],["누적 거래", "120회 이상"],["평균 승률", "40% 이상"],["최대 낙폭", "-20% 이내"]].map(([label, value]) => <div key={label} className="rounded-2xl border border-emerald-200/15 bg-slate-950/35 p-3"><p className="text-[10px] font-bold text-slate-500">{label}</p><p className="mt-1 text-sm font-black text-emerald-100">{value}</p></div>)}</div></section>{!user ? <section className="mt-6 rounded-3xl border border-slate-700 bg-slate-900/40 p-6 text-center"><p className="font-black text-white">로그인하면 내 조건식의 생존 판정 기록을 볼 수 있습니다.</p><Button onClick={() => startLogin()} className="mt-4 bg-cyan-300 font-black text-slate-950 hover:bg-cyan-200">로그인하고 연구 기록 보기</Button></section> : <section className="mt-6"><div className="mb-4 flex items-center gap-2"><Trophy className="text-emerald-200" size={20}/><h2 className="text-xl font-black">누적 생존 판정 기록</h2></div>{ledgers.isLoading ? <p className="rounded-2xl border border-slate-700 bg-slate-900/35 p-5 text-sm text-slate-400">연구 장부를 불러오는 중입니다.</p> : !ledgers.data?.length ? <div className="rounded-3xl border border-dashed border-slate-700 bg-slate-900/35 p-7 text-center"><FlaskConical className="mx-auto text-cyan-200"/><p className="mt-3 font-black text-white">아직 생존 판정 기록이 없습니다.</p><p className="mt-1 text-sm text-slate-400">제공 조건식의 저장된 5분봉 연구 기록을 기준으로 재판정을 실행하세요.</p></div> : <div className="space-y-4">{ledgers.data.map((ledger: any) => <LedgerCard key={ledger.id} ledger={ledger}/>)}</div>}</section>}</div></main>;
}
