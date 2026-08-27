/**
 * 메인 대시보드 — 상용 서비스 수준 3단계 플로우
 *
 * 핵심 동선:
 *   1. 전략 설계 — 조건식 자동 생성 · 수동 작성 · 패턴 학습
 *   2. 검증 — 일봉/분봉 백테스트 · 차트 분석
 *   3. 실행 — 모의투자 포지션 · 자동매매 · 실시간 모니터링
 *
 * 보조:
 *   - 홈(대시보드) — 전체 현황 + 빠른 실행 + 다음 단계 안내
 *   - 데이터 — 수집 상태 (설정 영역)
 */

import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { OneClickBacktest } from "./OneClickBacktest";
import { ChartPage } from "./ChartPage";
import { MockTradingDashboard } from "./MockTradingDashboard";
import { MockTradingControlPanel } from "./MockTradingControlPanel";
import { DataStatus } from "./DataStatus";
import { DayTradingExperimentPanel } from "./DayTradingExperimentPanel";
import { DayTradeBacktest } from "./DayTradeBacktest";
import { StrategyCompare } from "./StrategyCompare";
import { PatternLearning } from "./PatternLearning";
import { ConditionBuilderPage } from "../pages/ConditionBuilderPage";
import { HomeSummary } from "./HomeSummary";
import { PerformanceReport } from "./PerformanceReport";
import {
  BarChart3,
  FlaskConical,
  TrendingUp,
  Database,
  Menu,
  X,
  SlidersHorizontal,
  LayoutDashboard,
  Lightbulb,
  ShieldCheck,
  Rocket,
  ChevronRight,
  Brain,
  Timer,
} from "lucide-react";

// ─── 타입 정의 ────────────────────────────────────────────────────────────────

type Section = "home" | "strategy" | "validate" | "execute" | "data";
type SubPage =
  | "overview"
  | "auto-generate"
  | "manual-builder"
  | "pattern-learn"
  | "daily-backtest"
  | "intraday-backtest"
  | "strategy-compare"
  | "chart-analysis"
  | "mock-trading"
  | "control-panel"
  | "live-monitor"
  | "performance"
  | "data-status";

interface NavItem {
  section: Section;
  label: string;
  icon: typeof FlaskConical;
  description: string;
  subPages: Array<{ id: SubPage; label: string; icon: typeof FlaskConical }>;
}

// ─── 네비게이션 구조 ──────────────────────────────────────────────────────────

const NAV: NavItem[] = [
  {
    section: "home",
    label: "대시보드",
    icon: LayoutDashboard,
    description: "전체 현황 · 빠른 실행 · 다음 단계 안내",
    subPages: [{ id: "overview", label: "대시보드", icon: LayoutDashboard }],
  },
  {
    section: "strategy",
    label: "전략 설계",
    icon: Lightbulb,
    description: "매매 조건식을 만들고 최적화합니다",
    subPages: [
      { id: "auto-generate", label: "자동 생성", icon: FlaskConical },
      { id: "manual-builder", label: "직접 작성", icon: SlidersHorizontal },
      { id: "pattern-learn", label: "패턴 분석", icon: Brain },
    ],
  },
  {
    section: "validate",
    label: "성과 검증",
    icon: ShieldCheck,
    description: "과거 데이터로 전략의 수익성을 검증합니다",
    subPages: [
      { id: "daily-backtest", label: "일봉 검증", icon: FlaskConical },
      { id: "intraday-backtest", label: "분봉 검증", icon: Timer },
      { id: "strategy-compare", label: "전략 비교", icon: BarChart3 },
      { id: "chart-analysis", label: "차트 분석", icon: BarChart3 },
    ],
  },
  {
    section: "execute",
    label: "실전 운용",
    icon: Rocket,
    description: "검증된 전략으로 모의투자를 실행합니다",
    subPages: [
      { id: "mock-trading", label: "모의투자", icon: TrendingUp },
      { id: "control-panel", label: "제어판", icon: SlidersHorizontal },
      { id: "live-monitor", label: "AI 시뮬레이션", icon: Rocket },
      { id: "performance", label: "성과 리포트", icon: BarChart3 },
    ],
  },
  {
    section: "data",
    label: "데이터",
    icon: Database,
    description: "시세 데이터 수집 상태를 관리합니다",
    subPages: [{ id: "data-status", label: "수집 현황", icon: Database }],
  },
];

// ─── 플로우 단계 표시 ─────────────────────────────────────────────────────────

const FLOW_STEPS: Array<{ section: Section; step: number; label: string }> = [
  { section: "strategy", step: 1, label: "설계" },
  { section: "validate", step: 2, label: "검증" },
  { section: "execute", step: 3, label: "운용" },
];

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

export function MainDashboard() {
  const [location, setLocation] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // URL에서 section/subPage 파싱: /strategy/auto-generate → section=strategy, subPage=auto-generate
  const { section, subPage } = useMemo(() => {
    const parts = location.replace(/^\//, "").split("/");
    const sec = (parts[0] || "home") as Section;
    const validSection = NAV.find(n => n.section === sec) ? sec : "home";
    const sub = parts[1] as SubPage | undefined;
    const navItem = NAV.find(n => n.section === validSection)!;
    const validSub = navItem.subPages.find(sp => sp.id === sub)?.id ?? navItem.subPages[0].id;
    return { section: validSection, subPage: validSub };
  }, [location]);

  const currentNav = NAV.find(n => n.section === section)!;
  const currentStep = FLOW_STEPS.find(f => f.section === section);

  function navigate(sec: Section, sub?: SubPage) {
    const target = sub ?? NAV.find(n => n.section === sec)!.subPages[0].id;
    const navItem = NAV.find(n => n.section === sec)!;
    // home 섹션은 /로, 서브페이지가 1개인 섹션은 /section으로, 여러개면 /section/sub로
    if (sec === "home") setLocation("/");
    else if (navItem.subPages.length === 1) setLocation(`/${sec}`);
    else setLocation(`/${sec}/${target}`);
    setMobileMenuOpen(false);
  }

  // HomeSummary에서 기존 탭 id로 네비게이션할 때의 호환 매핑
  function handleLegacyNavigate(tab: string) {
    const map: Record<string, [Section, SubPage]> = {
      backtest: ["strategy", "auto-generate"],
      builder: ["strategy", "manual-builder"],
      learn: ["strategy", "pattern-learn"],
      intraday: ["validate", "intraday-backtest"],
      chart: ["validate", "chart-analysis"],
      trading: ["execute", "mock-trading"],
      daytrade: ["execute", "live-monitor"],
      performance: ["execute", "performance"],
      data: ["data", "data-status"],
    };
    const target = map[tab];
    if (target) navigate(target[0], target[1]);
    else navigate("home", "overview");
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#0a0e1a]">
      {/* ─── Top Header ──────────────────────────────────────────── */}
      <header className="flex items-center justify-between border-b border-slate-800 bg-[#0a0e1a]/95 px-4 py-3 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-white lg:hidden"
            aria-label="메뉴"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-cyan-600">
              <FlaskConical size={16} className="text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white">퀀트 전략 연구소</h1>
              <p className="hidden text-[10px] text-slate-500 sm:block">키움증권 · 자동 조건식 연구 · 모의투자</p>
            </div>
          </div>
        </div>

        {/* 3단계 플로우 인디케이터 */}
        <div className="hidden items-center gap-1 md:flex">
          {FLOW_STEPS.map((step, idx) => {
            const isActive = currentStep?.section === step.section;
            const isPast = currentStep ? step.step < currentStep.step : false;
            return (
              <button
                key={step.section}
                onClick={() => navigate(step.section)}
                className="flex items-center gap-1"
              >
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-black transition ${
                    isActive
                      ? "bg-teal-500 text-white shadow-lg shadow-teal-500/30"
                      : isPast
                        ? "bg-teal-500/20 text-teal-300"
                        : "bg-slate-800 text-slate-500"
                  }`}
                >
                  {step.step}
                </span>
                <span
                  className={`text-xs font-medium ${
                    isActive ? "text-teal-300" : "text-slate-500"
                  }`}
                >
                  {step.label}
                </span>
                {idx < FLOW_STEPS.length - 1 && (
                  <ChevronRight size={12} className="mx-1 text-slate-700" />
                )}
              </button>
            );
          })}
        </div>

        <div className="hidden items-center gap-2 lg:flex">
          <span className="rounded-full border border-slate-700 bg-slate-800/50 px-3 py-1 text-[10px] text-slate-400">
            종가 확정 → 시가 매수
          </span>
        </div>
      </header>

      {/* ─── Desktop Navigation ──────────────────────────────────── */}
      <div className="hidden border-b border-slate-800 lg:block">
        <div className="flex items-center">
          {/* Section tabs */}
          <nav className="flex flex-1 px-4" aria-label="메인 메뉴">
            {NAV.map(item => {
              const Icon = item.icon;
              const active = section === item.section;
              return (
                <button
                  key={item.section}
                  onClick={() => navigate(item.section)}
                  className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition ${
                    active
                      ? "border-teal-400 text-teal-300"
                      : "border-transparent text-slate-500 hover:text-slate-300"
                  }`}
                >
                  <Icon size={15} />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sub-page tabs (shown when section has multiple sub-pages) */}
        {currentNav.subPages.length > 1 && (
          <div className="flex border-t border-slate-800/50 bg-slate-900/30 px-6">
            {currentNav.subPages.map(sp => {
              const Icon = sp.icon;
              const active = subPage === sp.id;
              return (
                <button
                  key={sp.id}
                  onClick={() => navigate(section, sp.id)}
                  className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition ${
                    active
                      ? "border-b-2 border-teal-400/60 text-teal-200"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  <Icon size={13} />
                  {sp.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Mobile Navigation ───────────────────────────────────── */}
      <nav className="flex overflow-x-auto border-b border-slate-800 px-2 lg:hidden">
        {NAV.map(item => {
          const Icon = item.icon;
          const active = section === item.section;
          return (
            <button
              key={item.section}
              onClick={() => navigate(item.section)}
              className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-medium transition ${
                active
                  ? "border-teal-400 text-teal-300"
                  : "border-transparent text-slate-500"
              }`}
            >
              <Icon size={13} />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Mobile sub-pages */}
      {currentNav.subPages.length > 1 && (
        <div className="flex overflow-x-auto border-b border-slate-800/50 bg-slate-900/20 px-3 lg:hidden">
          {currentNav.subPages.map(sp => {
            const active = subPage === sp.id;
            return (
              <button
                key={sp.id}
                onClick={() => navigate(section, sp.id)}
                className={`shrink-0 px-3 py-2 text-[11px] font-medium transition ${
                  active ? "text-teal-300" : "text-slate-500"
                }`}
              >
                {sp.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Mobile menu overlay */}
      {mobileMenuOpen && (
        <div className="absolute inset-x-0 top-14 z-50 border-b border-slate-700 bg-[#0a0e1a]/95 p-4 backdrop-blur-lg lg:hidden">
          {NAV.map(item => {
            const Icon = item.icon;
            return (
              <button
                key={item.section}
                onClick={() => navigate(item.section)}
                className={`flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left transition ${
                  section === item.section
                    ? "bg-teal-500/10 text-teal-300"
                    : "text-slate-300 hover:bg-slate-800"
                }`}
              >
                <Icon size={18} />
                <div>
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-[11px] text-slate-500">{item.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* ─── Page Description Bar ────────────────────────────────── */}
      <div className="border-b border-slate-800/50 bg-slate-900/30 px-5 py-2">
        <p className="text-[11px] text-slate-500">
          {currentStep && (
            <span className="mr-2 rounded bg-teal-500/10 px-1.5 py-0.5 text-[10px] font-bold text-teal-400">
              STEP {currentStep.step}
            </span>
          )}
          {currentNav.description}
        </p>
      </div>

      {/* ─── Content ─────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">
        {/* Home */}
        {section === "home" && <HomeSummary onNavigate={handleLegacyNavigate} />}

        {/* Strategy (전략 설계) */}
        {section === "strategy" && subPage === "auto-generate" && <OneClickBacktest />}
        {section === "strategy" && subPage === "manual-builder" && <ConditionBuilderPage />}
        {section === "strategy" && subPage === "pattern-learn" && <PatternLearning />}

        {/* Validate (성과 검증) */}
        {section === "validate" && subPage === "daily-backtest" && <OneClickBacktest />}
        {section === "validate" && subPage === "intraday-backtest" && <DayTradeBacktest />}
        {section === "validate" && subPage === "strategy-compare" && <StrategyCompare />}
        {section === "validate" && subPage === "chart-analysis" && <ChartPage />}

        {/* Execute (실전 운용) */}
        {section === "execute" && subPage === "mock-trading" && <MockTradingDashboard />}
        {section === "execute" && subPage === "control-panel" && <MockTradingControlPanel />}
        {section === "execute" && subPage === "live-monitor" && <DayTradingExperimentPanel />}
        {section === "execute" && subPage === "performance" && <PerformanceReport />}

        {/* Data (데이터) */}
        {section === "data" && <DataStatus />}
      </main>
    </div>
  );
}
