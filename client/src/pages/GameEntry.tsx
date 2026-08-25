import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { startLogin } from "@/const";
import { cn } from "@/lib/utils";
import { BookOpen, ChevronRight, CircleCheckBig, CircleDot, Database, Dices, FlaskConical, LockKeyhole, Play, ShieldCheck, Sparkles, Swords, Trophy, UsersRound, X } from "lucide-react";
import { useEffect, useState } from "react";

type DeckId = "survivor" | "random" | "community";
type ArenaSize = 100 | 1_000 | 3_000;

const DECKS: Array<{ id: DeckId; name: string; subtitle: string; description: string; badge: string; tone: string; icon: typeof Sparkles }> = [
  { id: "survivor", name: "생존 지표 덱", subtitle: "검증에서 반복된 공통 지표", description: "기본 생존 지표를 중심에 두고 새 조건을 조합합니다.", badge: "균형형", tone: "from-cyan-300/25 via-teal-300/10 to-transparent border-cyan-200/35", icon: ShieldCheck },
  { id: "random", name: "랜덤 도전 덱", subtitle: "10개 이상 비중복 조건군", description: "지표 목차별로 하나씩 골라 전혀 다른 조합을 탐색합니다.", badge: "탐험형", tone: "from-violet-300/25 via-fuchsia-300/10 to-transparent border-violet-200/35", icon: Dices },
  { id: "community", name: "공개 컬렉션 덱", subtitle: "공개 카드에서 출발", description: "다른 트레이너가 남긴 카드와 계보를 살펴본 뒤 내 덱으로 이어갑니다.", badge: "수집형", tone: "from-amber-300/25 via-orange-300/10 to-transparent border-amber-200/35", icon: UsersRound },
];

const ARENAS: Array<{ value: ArenaSize; label: string; description: string }> = [
  { value: 100, label: "빠른 결과", description: "100개 조합 · 5일 검증" },
  { value: 1_000, label: "표준 확인", description: "1,000개 조합 · 10일 검증" },
  { value: 3_000, label: "대규모 탐색", description: "3,000개 조합 · 20일 검증" },
];

function navigate(path: string) {
  window.location.assign(path);
}

type TutorialStep = 0 | 1 | 2 | 3;

function FirstBattleTutorial({ open, onDismiss, onSelectDeck, onSelectArena, onBegin }: { open: boolean; onDismiss: () => void; onSelectDeck: () => void; onSelectArena: () => void; onBegin: () => void }) {
  const [step, setStep] = useState<TutorialStep>(0);
  useEffect(() => { if (open) setStep(0); }, [open]);
  const next = () => setStep(current => Math.min(3, current + 1) as TutorialStep);
  const content = [
    { eyebrow: "STEP 1 OF 4", icon: <ShieldCheck className="text-cyan-200" size={25}/>, title: "첫 덱은 생존 지표 덱으로 시작하세요", description: "먼저 여러 번의 검증에서 반복된 핵심 지표를 사용해 보세요. 처음에는 기준이 있는 덱이 결과를 읽기 쉽습니다.", action: "생존 지표 덱 선택", onAction: () => { onSelectDeck(); next(); } },
    { eyebrow: "STEP 2 OF 4", icon: <Dices className="text-violet-200" size={25}/>, title: "첫 배틀은 빠른 결과 단계면 충분합니다", description: "100개 조합의 작은 실제 검증으로 흐름을 익힌 뒤, 표준 확인과 대규모 탐색으로 넓혀가세요.", action: "빠른 결과 선택", onAction: () => { onSelectArena(); next(); } },
    { eyebrow: "STEP 3 OF 4", icon: <LockKeyhole className="text-amber-200" size={25}/>, title: "이 배틀은 연구용 검증입니다", description: "실제 저장 1분봉을 평가하지만 계좌 조회, 주문 생성, 주문 전송은 이 경로에서 호출하지 않습니다. 통과 카드만 내 포켓몬으로 수집됩니다.", action: "연구 전용 확인", onAction: next },
    { eyebrow: "STEP 4 OF 4", icon: <Swords className="text-teal-200" size={25}/>, title: "이제 첫 전략 카드를 보내세요", description: "배틀이 끝나면 통과 카드와 검증 지표를 내 개인 아레나에서 확인할 수 있습니다. 성과는 연구 결과이며 미래 수익을 보장하지 않습니다.", action: "첫 배틀 시작", onAction: onBegin },
  ][step];
  return <Dialog open={open} onOpenChange={value => { if (!value) onDismiss(); }}><DialogContent className="max-w-md border-cyan-200/20 bg-[#0b1828] p-0 text-slate-100 shadow-2xl"><section className="overflow-hidden rounded-lg"><div className="bg-[radial-gradient(circle_at_85%_0%,rgba(34,211,238,0.2),transparent_38%),linear-gradient(135deg,#10283b,#0b1220)] p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-black tracking-[0.2em] text-cyan-200">FIRST BATTLE TUTORIAL</p><p className="mt-2 text-xs font-bold text-slate-400">{content.eyebrow}</p></div><button type="button" onClick={onDismiss} aria-label="튜토리얼 닫기" className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"><X size={17}/></button></div><div className="mt-6 h-1.5 overflow-hidden rounded-full bg-slate-950/60"><div className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-teal-200 transition-all duration-200" style={{ width: `${(step + 1) * 25}%` }}/></div></div><div className="p-6"><div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-slate-950/45">{content.icon}</div><h2 className="mt-5 text-2xl font-black tracking-tight text-white">{content.title}</h2><p className="mt-3 text-sm leading-6 text-slate-400">{content.description}</p><Button onClick={content.onAction} className="mt-7 h-12 w-full bg-cyan-300 font-black text-slate-950 hover:bg-cyan-200"><CircleCheckBig className="mr-2" size={17}/>{content.action}<ChevronRight className="ml-1" size={17}/></Button>{step < 3 && <button type="button" onClick={onDismiss} className="mt-3 w-full text-xs font-semibold text-slate-500 transition hover:text-slate-300">나중에 둘러보기</button>}</div></section></DialogContent></Dialog>;
}

export default function GameEntry() {
  const { user, loading } = useAuth();
  const [deckId, setDeckId] = useState<DeckId>("survivor");
  const [arenaSize, setArenaSize] = useState<ArenaSize>(1_000);
  const selectedDeck = DECKS.find(deck => deck.id === deckId) ?? DECKS[0];
  const isCommunityDeck = deckId === "community";
  const trainerArenaPath = user?.isOperator ? "/operator" : "/arena";
  const tutorialStorageKey = user ? `strategy-arena:first-battle-v1:${user.id}` : null;
  const [showTutorial, setShowTutorial] = useState(false);

  useEffect(() => {
    if (!tutorialStorageKey || user?.isOperator) { setShowTutorial(false); return; }
    setShowTutorial(window.localStorage.getItem(tutorialStorageKey) !== "done");
  }, [tutorialStorageKey, user?.isOperator]);

  const dismissTutorial = () => {
    if (tutorialStorageKey) window.localStorage.setItem(tutorialStorageKey, "done");
    setShowTutorial(false);
  };

  const startBattle = () => {
    if (!user) {
      startLogin();
      return;
    }
    if (isCommunityDeck) {
      navigate("/collection");
      return;
    }
    const deck = deckId === "random" ? "random" : "survivor";
    navigate(`${trainerArenaPath}?deck=${deck}&size=${arenaSize}`);
  };
  const startTutorialBattle = () => { dismissTutorial(); startBattle(); };

  return <main data-testid="game-entry-page" className="min-h-screen overflow-hidden bg-[#06101b] text-slate-50 selection:bg-cyan-300/30">
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
      <div className="absolute left-[-18rem] top-[-14rem] h-[42rem] w-[42rem] rounded-full bg-cyan-400/[0.12] blur-[140px]" />
      <div className="absolute right-[-15rem] top-[10rem] h-[34rem] w-[34rem] rounded-full bg-violet-400/[0.11] blur-[130px]" />
      <div className="absolute inset-0 opacity-[0.16] [background-image:linear-gradient(rgba(148,163,184,0.14)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.14)_1px,transparent_1px)] [background-size:42px_42px]" />
    </div>

    <section className="relative z-10 mx-auto w-full max-w-7xl px-5 pb-14 pt-10 sm:px-8 lg:px-10 lg:pb-24 lg:pt-14">
      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(28rem,1.1fr)]">
        <div className="pt-2 lg:pt-10">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-cyan-200/20 bg-cyan-300/[0.08] px-3 py-1.5 text-[11px] font-bold tracking-[0.14em] text-cyan-100"><CircleDot size={13} className="text-cyan-300" />TODAY'S RESEARCH QUEST</div>
          <h1 className="max-w-xl text-4xl font-black leading-[1.04] tracking-[-0.055em] text-white sm:text-5xl lg:text-6xl">조건식을 고르고,<br /><span className="bg-gradient-to-r from-cyan-200 via-teal-200 to-violet-200 bg-clip-text text-transparent">데이터셋과 대결하세요.</span></h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-slate-300 sm:text-lg">포켓몬처럼 조건식 조합을 수집하고, 실제 1분봉 기록을 아레나로 삼아 반복 검증합니다. 승리한 카드는 내 포켓몬으로 남기고 공개 컬렉션에서 연구 계보를 이어갈 수 있습니다.</p>
          <div className="mt-8 flex flex-wrap gap-3 text-xs font-semibold text-slate-300"><span className="inline-flex items-center gap-2 rounded-xl border border-slate-700/75 bg-slate-900/70 px-3 py-2"><FlaskConical size={14} className="text-cyan-300" />연구용 검증</span><span className="inline-flex items-center gap-2 rounded-xl border border-slate-700/75 bg-slate-900/70 px-3 py-2"><LockKeyhole size={14} className="text-amber-200" />주문 전송과 분리</span>{user && !user.isOperator && <button type="button" onClick={() => setShowTutorial(true)} className="inline-flex items-center gap-2 rounded-xl border border-violet-200/25 bg-violet-300/10 px-3 py-2 text-violet-100 transition hover:bg-violet-300/20"><Sparkles size={14} />첫 배틀 튜토리얼</button>}</div>

          <div className="mt-10 grid gap-3 sm:grid-cols-3 lg:max-w-xl lg:grid-cols-1 xl:grid-cols-3">
            <a href="/datasets" className="group rounded-2xl border border-slate-700/70 bg-slate-900/50 p-4 transition hover:-translate-y-0.5 hover:border-cyan-200/35 hover:bg-slate-900"><Database size={17} className="text-cyan-200" /><p className="mt-4 text-sm font-bold text-white">공용 데이터</p><p className="mt-1 text-xs leading-5 text-slate-400">일봉·5분봉 아레나 원본</p></a>
            <a href="/collection" className="group rounded-2xl border border-slate-700/70 bg-slate-900/50 p-4 transition hover:-translate-y-0.5 hover:border-violet-200/35 hover:bg-slate-900"><UsersRound size={17} className="text-violet-200" /><p className="mt-4 text-sm font-bold text-white">공개 컬렉션</p><p className="mt-1 text-xs leading-5 text-slate-400">카드·댓글·포크 계보</p></a>
            <a href={trainerArenaPath} className="group rounded-2xl border border-slate-700/70 bg-slate-900/50 p-4 transition hover:-translate-y-0.5 hover:border-cyan-200/35 hover:bg-slate-900"><Trophy size={17} className="text-cyan-200" /><p className="mt-4 text-sm font-bold text-white">내 포켓몬</p><p className="mt-1 text-xs leading-5 text-slate-400">수집 카드와 성과 분석</p></a>
            <a href="/research" className="group rounded-2xl border border-slate-700/70 bg-slate-900/50 p-4 transition hover:-translate-y-0.5 hover:border-amber-200/35 hover:bg-slate-900"><BookOpen size={17} className="text-amber-200" /><p className="mt-4 text-sm font-bold text-white">연구 기록</p><p className="mt-1 text-xs leading-5 text-slate-400">실행 증거와 데이터 현황</p></a>
          </div>
        </div>

        <section aria-label="아레나 배틀 준비" className="relative overflow-hidden rounded-[2rem] border border-slate-600/60 bg-[#0b1828]/90 p-5 shadow-[0_28px_90px_rgba(0,0,0,0.38)] backdrop-blur-xl sm:p-7">
          <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/70 to-transparent" />
          <div className="flex items-start justify-between gap-4"><div><p className="text-[11px] font-black tracking-[0.2em] text-cyan-200">BATTLE SETUP</p><h2 className="mt-2 text-xl font-extrabold tracking-tight text-white">오늘의 덱을 선택하세요</h2></div><span className="rounded-2xl border border-violet-200/20 bg-violet-300/10 p-3 text-violet-100"><Sparkles size={19} /></span></div>

          <div className="mt-6 grid gap-3">
            {DECKS.map(deck => { const Icon = deck.icon; const selected = deck.id === deckId; return <button key={deck.id} type="button" onClick={() => setDeckId(deck.id)} className={cn("group relative overflow-hidden rounded-2xl border p-4 text-left transition duration-200 hover:-translate-y-0.5", selected ? `bg-gradient-to-r ${deck.tone} shadow-lg` : "border-slate-700/80 bg-slate-950/35 hover:border-slate-500/80")}><div className="relative flex items-center gap-3"><span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border", selected ? "border-white/20 bg-white/10 text-white" : "border-slate-700 bg-slate-900 text-slate-400")}><Icon size={18} /></span><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><strong className="text-sm text-white">{deck.name}</strong><span className="rounded-full bg-black/20 px-2 py-0.5 text-[10px] font-bold text-slate-200">{deck.badge}</span></span><span className="mt-1 block text-xs text-slate-300">{deck.subtitle}</span></span>{selected && <span className="h-4 w-4 rounded-full border-4 border-cyan-200 bg-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.8)]" aria-label="선택됨" />}</div>{selected && <p className="relative mt-3 border-t border-white/10 pt-3 text-xs leading-5 text-slate-200">{deck.description}</p>}</button>; })}
          </div>

          {!isCommunityDeck && <div className="mt-6"><div className="flex items-end justify-between"><div><p className="text-sm font-bold text-white">아레나 규모</p><p className="mt-1 text-xs text-slate-400">한 번의 연구 실행에서 대결할 조건식 조합 수입니다.</p></div><span className="font-mono text-sm font-bold text-cyan-200">{arenaSize.toLocaleString()} 조합</span></div><div className="mt-3 grid grid-cols-3 gap-2">{ARENAS.map(arena => <button key={arena.value} type="button" onClick={() => setArenaSize(arena.value)} className={cn("rounded-xl border p-3 text-left transition", arena.value === arenaSize ? "border-cyan-200/45 bg-cyan-300/10 shadow-[0_0_20px_rgba(34,211,238,0.08)]" : "border-slate-700/75 bg-slate-950/35 hover:border-slate-500")}><strong className="block text-xs text-white">{arena.label}</strong><span className="mt-1 block text-[10px] leading-4 text-slate-400">{arena.description}</span></button>)}</div></div>}

          <Button onClick={startBattle} className="mt-7 h-14 w-full rounded-2xl bg-gradient-to-r from-cyan-300 via-teal-300 to-cyan-200 text-base font-black text-slate-950 shadow-[0_12px_30px_rgba(45,212,191,0.22)] transition hover:brightness-110 active:scale-[0.98]">{!user ? <><LockKeyhole className="mr-2" size={18} />로그인하고 배틀 시작</> : isCommunityDeck ? <><UsersRound className="mr-2" size={18} />공개 카드 찾아보기</> : <><Play className="mr-2 fill-current" size={18} />{selectedDeck.name}으로 배틀 시작</>}<ChevronRight className="ml-1" size={18} /></Button>
          <p className="mt-3 text-center text-[11px] leading-5 text-slate-500">배틀 실행은 로그인 후 내 아레나에서 이루어지며, 실거래 주문을 생성하거나 전송하지 않습니다.</p>
        </section>
      </div>
    </section>
    <FirstBattleTutorial open={showTutorial} onDismiss={dismissTutorial} onSelectDeck={() => setDeckId("survivor")} onSelectArena={() => setArenaSize(100)} onBegin={startTutorialBattle}/>
  </main>;
}
