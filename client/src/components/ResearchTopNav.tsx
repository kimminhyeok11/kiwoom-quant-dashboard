import { Button } from "@/components/ui/button";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { useAuth } from "@/_core/hooks/useAuth";
import { ChevronRight, Clock3, Database, FlaskConical, Link2, Loader2, MapPin, ShieldAlert, ShieldCheck, Swords, Trophy, UserRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ServerEgressBadge } from "./ServerEgressBadge";
import { VisitorIpBadge } from "./VisitorIpBadge";

type JourneyStep = "connection" | "dataset" | "battle" | "results";

export function currentJourneyStep(path: string): JourneyStep | null {
  if (path === "/datasets" || path === "/connection-audit" || path === "/connection") return path === "/datasets" ? "dataset" : "connection";
  if (path === "/arena" || path === "/operator") return "battle";
  if (path === "/research" || path === "/intraday") return "results";
  return null;
}

export function ResearchTopNav() {
  const { user, loading } = useAuth();
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null);
  const currentPath = window.location.pathname;
  const battlePath = user?.isOperator ? "/operator" : "/arena";
  const activeStep = currentJourneyStep(currentPath);
  const brokerStatus = trpc.quant.brokerStatus.useQuery(undefined, { retry: false, staleTime: 60_000 });
  const terminalStatus = trpc.network.myKiwoomTerminalStatus.useQuery(undefined, { enabled: Boolean(user), refetchInterval: user ? 5_000 : false, staleTime: 2_000 });
  const terminalDiagnostics = trpc.network.myKiwoomTerminalDiagnostics.useQuery(undefined, { enabled: Boolean(user), refetchInterval: user ? 5_000 : false, staleTime: 2_000 });
  const verifyConnection = trpc.quant.verifyOAuthConnection.useMutation({
    onSuccess: result => {
      setConnectionMessage(result.message);
      if (result.status === "connected") toast.success("서버 키움 REST 읽기 전용 연결을 확인했습니다.");
      else toast.error(result.message);
      void brokerStatus.refetch();
    },
    onError: error => { setConnectionMessage(error.message); toast.error(error.message); },
  });

  const terminal = terminalStatus.data;
  const oauthState = brokerStatus.data?.oauth?.state;
  const terminalRoundTripVerified = Boolean(terminal?.roundTripVerified);
  const connectionLabel = !user ? "로그인 후 점검" : terminalStatus.isLoading ? "단말 기록 확인 중" : terminal?.status === "connected" && terminalRoundTripVerified ? "최근 왕복 확인 완료" : terminal?.status === "connected" ? "최근 OAuth만 확인됨" : terminal ? "최근 단말 점검 필요" : oauthState === "cached" ? "서버 확인 완료" : "단말 기록 없음";
  const terminalMessage = !terminal ? "현재 컴퓨터에서 점검 파일을 실행하면 등록 IP와 인증 결과가 기록됩니다." : terminalRoundTripVerified ? `최근 단말 점검 기록: 등록 IP ${terminal.terminalIp}에서 OAuth 토큰, 키움 API 읽기, 서비스 동기화, 저장 결과 재확인을 모두 확인했습니다.` : terminal.status === "connected" ? `최근 단말 점검 기록: 등록 IP ${terminal.terminalIp}에서 OAuth 토큰 발급만 기록되었습니다. 최신 점검 스크립트를 실행해 키움 API 읽기와 서비스 저장 결과 재확인을 완료하세요.` : `최근 단말 점검 기록: 등록 IP ${terminal.terminalIp} 인증이 실패했습니다${terminal.errorCode ? ` (${terminal.errorCode})` : ""}.`;
  const lastCheckLabel = terminal?.checkedAt ? `단말 점검 ${new Date(terminal.checkedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : terminalStatus.isFetching ? "단말 상태 갱신 중" : "단말 기록 없음";
  const journey = [
    { id: "connection" as const, href: "/connection-audit", label: "1. 단말 연결", detail: "인증·읽기 확인" },
    { id: "dataset" as const, href: "/datasets", label: "2. 데이터셋 모으기", detail: "수집·보관·선택" },
    { id: "battle" as const, href: battlePath, label: "3. 조건식 배틀", detail: user?.isOperator ? "대량 연구소" : "내 카드 재생" },
    { id: "results" as const, href: "/research", label: "4. 연구 결과 보기", detail: "성과·근거 기록" },
  ];
  const activeIndex = activeStep ? journey.findIndex(step => step.id === activeStep) : -1;
  const nextStep = activeIndex < 0 ? journey[0] : journey[Math.min(activeIndex + 1, journey.length - 1)];
  const connect = () => { if (!user) { startLogin(); return; } verifyConnection.mutate(); };

  return <header data-testid="research-top-nav" className="sticky top-0 z-[90] border-b border-cyan-100/10 bg-[#07111b]/95 shadow-[0_12px_40px_rgba(0,0,0,0.24)] backdrop-blur-xl">
    <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-7 lg:px-10">
      <a href="/" className="flex items-center gap-2.5 text-white"><span className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-200/25 bg-cyan-300/10 text-cyan-100"><FlaskConical size={18}/></span><span><strong className="block text-sm tracking-[0.08em]">STRATEGY ARENA</strong><span className="block text-[9px] font-bold tracking-[0.18em] text-cyan-200/75">RESEARCH CONSOLE</span></span></a>
      <nav aria-label="핵심 연구 메뉴" className="order-3 flex w-full items-center gap-1 overflow-x-auto pb-0.5 sm:order-none sm:w-auto sm:overflow-visible"><a href="/" title="게임 흐름 시작과 첫 연구 준비" className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-bold transition", currentPath === "/" ? "bg-cyan-300/15 text-cyan-100" : "text-slate-400 hover:bg-slate-800 hover:text-white")}><FlaskConical size={14}/>게임 시작</a><a href="/datasets" title="실제 원본을 수집하고 공용 보관소에서 선택" className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-bold transition", currentPath === "/datasets" ? "bg-cyan-300/15 text-cyan-100" : "text-slate-400 hover:bg-slate-800 hover:text-white")}><Database size={14}/>데이터셋</a><a href={battlePath} title="내 조건식 카드를 원본 데이터에 재생" className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-bold transition", activeStep === "battle" ? "bg-cyan-300/15 text-cyan-100" : "text-slate-400 hover:bg-slate-800 hover:text-white")}><Swords size={14}/>조건식 배틀</a><a href="/research" title="성과와 판정 근거가 저장된 연구 기록 확인" className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-bold transition", currentPath === "/research" ? "bg-cyan-300/15 text-cyan-100" : "text-slate-400 hover:bg-slate-800 hover:text-white")}><MapPin size={14}/>연구 기록</a><a href="/survivors" title="여러 실제 아레나를 통과한 조건식만 생존 카드로 보존" className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-bold transition", currentPath === "/survivors" ? "bg-emerald-300/15 text-emerald-100" : "text-slate-400 hover:bg-slate-800 hover:text-white")}><ShieldCheck size={14}/>생존 카드</a><a href="/collection" title="공개 조건식 카드를 살펴보고 내 컬렉션에 저장" className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-bold transition", currentPath === "/collection" ? "bg-violet-300/15 text-violet-100" : "text-slate-400 hover:bg-slate-800 hover:text-white")}><Trophy size={14}/>카드 도감</a></nav>
      <div className="flex items-center gap-2"><a href="/connection-audit" className={cn("hidden rounded-xl border px-3 py-2 text-left text-xs font-bold transition lg:block", terminalRoundTripVerified ? "border-teal-300/30 bg-teal-300/10 text-teal-100" : "border-amber-300/30 bg-amber-300/10 text-amber-100")}><span className="block text-[9px] tracking-[0.1em] text-slate-400">키움 단말 · 최근 기록</span>{connectionLabel}</a><Button type="button" size="sm" onClick={connect} disabled={verifyConnection.isPending || loading} className="h-10 bg-cyan-300 px-3 text-xs font-black text-slate-950 hover:bg-cyan-200"><Link2 className="mr-1.5" size={14}/>{verifyConnection.isPending ? <Loader2 className="animate-spin" size={14}/> : "서버 REST 확인"}</Button>{user ? <a href="/profile" aria-label="내 정보" className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 text-xs font-bold text-slate-100 transition hover:border-cyan-200/40 hover:text-cyan-100"><UserRound size={14}/><span className="hidden sm:inline">내 정보</span></a> : <Button type="button" variant="outline" size="sm" onClick={() => startLogin()} className="h-10 border-slate-700 px-3 text-xs font-bold text-slate-200 hover:bg-slate-800">로그인</Button>}</div>
    </div>
    <div className="border-t border-white/[0.05] bg-slate-950/35"><div className="mx-auto flex max-w-7xl items-center gap-2 overflow-x-auto px-4 py-2 sm:px-7 lg:px-10" aria-label="연구 여정">{journey.map((step, index) => <a key={step.id} href={step.href} className={cn("flex min-w-[9.5rem] items-center gap-2 rounded-lg px-2 py-1.5 text-left transition", activeStep === step.id ? "bg-cyan-300/10 text-cyan-100" : "text-slate-500 hover:bg-slate-800 hover:text-slate-300")}><span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-black", activeStep === step.id ? "border-cyan-200/50 bg-cyan-300/20" : index < activeIndex ? "border-teal-300/35 text-teal-200" : "border-slate-700")}>{index < activeIndex ? "✓" : index + 1}</span><span><span className="block text-[10px] font-black">{step.label}</span><span className="block text-[9px] text-slate-500">{step.detail}</span></span></a>)}<a href={nextStep.href} className="ml-auto hidden shrink-0 items-center gap-1 text-[11px] font-bold text-cyan-100 hover:text-cyan-200 lg:inline-flex">{activeIndex < 0 ? "시작" : "다음"}: {nextStep.label}<ChevronRight size={14}/></a></div></div>
    <div data-testid="global-live-connection-status" className="border-t border-cyan-100/[0.07] bg-[#061019]/92"><div className="mx-auto flex max-w-7xl items-center gap-2 overflow-x-auto px-4 py-2 sm:px-7 lg:px-10"><VisitorIpBadge compact/><a href="/connection-audit" className={cn("flex shrink-0 items-center gap-2 rounded-xl border px-2.5 py-1.5 text-left transition hover:border-cyan-200/45", terminalRoundTripVerified ? "border-teal-300/30 bg-teal-300/[0.08] text-teal-100" : "border-amber-300/30 bg-amber-300/[0.08] text-amber-100")}><span className={cn("h-2 w-2 rounded-full", terminalRoundTripVerified ? "bg-teal-300 shadow-[0_0_10px_rgba(45,212,191,0.8)]" : "bg-amber-300")}/><span><span className="block text-[10px] font-black">키움 등록 단말 IPv4 · {connectionLabel}</span><span className="block font-mono text-[10px] text-slate-400">{terminal?.terminalIp ?? "등록 단말 미확인"} · {lastCheckLabel}</span></span></a><span className="ml-auto hidden shrink-0 items-center gap-1 text-[10px] text-slate-500 sm:inline-flex"><Clock3 size={12}/> 브라우저 IP 30초 · 단말 기록 5초 자동 갱신</span><a href="/connection-audit" className="shrink-0 text-[11px] font-bold text-cyan-100 hover:text-cyan-200">상세 점검</a></div></div>
    {currentPath === "/connection-audit" && <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-2 text-[11px] sm:px-7 lg:px-10"><ServerEgressBadge/><p className="text-cyan-100/85">{connectionMessage ?? terminalMessage}</p></div>}
    {currentPath === "/connection-audit" && user && <details data-testid="terminal-diagnostic-history" className="mx-auto mb-2 max-w-7xl rounded-lg border border-slate-700/80 bg-slate-950/45 px-3 py-2 text-[11px]"><summary className="flex cursor-pointer list-none items-center gap-2 font-semibold text-slate-300 hover:text-cyan-100"><ShieldAlert size={14} className="text-amber-200"/>왜 연결이 안 되는지 추적하기<ChevronRight size={13} className="ml-auto text-slate-500"/></summary><div className="mt-3 space-y-2 border-t border-slate-800 pt-2">{terminalDiagnostics.data?.length ? terminalDiagnostics.data.map((check, index) => <div key={`${check.terminalIp}:${check.checkedAt.toISOString()}:${index}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-md bg-slate-900/60 px-2.5 py-2"><span className={check.roundTripVerified ? "font-bold text-teal-100" : check.status === "connected" ? "font-bold text-amber-100" : "font-bold text-rose-200"}>{check.roundTripVerified ? "키움 API·서비스 왕복 확인 완료" : check.status === "connected" ? "OAuth·키움 API 확인 후 서비스 재확인 대기" : check.diagnosis.title}</span><span className="font-mono text-slate-300">{check.terminalIp}</span><span className="text-slate-500">{new Date(check.checkedAt).toLocaleString("ko-KR")}</span><span className="basis-full text-slate-400">{check.errorCode ? `오류 코드 ${check.errorCode} · ` : ""}{check.diagnosis.nextAction}</span></div>) : <p className="text-slate-500">아직 단말 점검 기록이 없습니다. 현재 컴퓨터에서 check-kiwoom-rest-connection.cmd를 실행하면 실패 원인이 이곳에 쌓입니다.</p>}</div></details>}
  </header>;
}
