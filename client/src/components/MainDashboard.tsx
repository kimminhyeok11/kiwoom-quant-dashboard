/**
 * 메인 대시보드 - 체계적이면서 심플한 탭 네비게이션
 * 
 * 메인 탭:
 * 1. 백테스트 - 원클릭 백테스트 + 조건식 육성
 * 2. 차트 - HTS급 종목 차트 (1분~월봉)
 * 3. 모의투자 - 데이트레이드 실험 + 포지션/체결/손익
 * 4. 연구 - 자율 연구 결과 + 생존 조건식 + 데이터 현황
 */

import { useState } from "react";
import { OneClickBacktest } from "./OneClickBacktest";
import { ChartPage } from "./ChartPage";
import { MockTradingDashboard } from "./MockTradingDashboard";
import { DataStatus } from "./DataStatus";
import { DayTradingExperimentPanel } from "./DayTradingExperimentPanel";
import { ConditionBuilderPage } from "../pages/ConditionBuilderPage";
import { HomeSummary } from "./HomeSummary";
import { BarChart3, FlaskConical, TrendingUp, Database, Activity, Menu, X, SlidersHorizontal, Home } from "lucide-react";

type Tab = "home" | "backtest" | "chart" | "trading" | "daytrade" | "data" | "builder";

const TABS: Array<{ id: Tab; label: string; shortLabel: string; icon: typeof FlaskConical; description: string }> = [
  { id: "home", label: "홈", shortLabel: "홈", icon: Home, description: "전체 현황 요약 · 빠른 실행" },
  { id: "backtest", label: "원클릭 백테스트", shortLabel: "백테스트", icon: FlaskConical, description: "랜덤 조건식 생성 → 자동 검증 → 채택 → 육성" },
  { id: "chart", label: "종목 차트", shortLabel: "차트", icon: BarChart3, description: "캔들스틱 · 이평선 · MACD · 볼린저 (1분~월봉)" },
  { id: "daytrade", label: "데이트레이드 실험", shortLabel: "실험", icon: Activity, description: "생존 조건식의 실시간 모의투자 추적" },
  { id: "trading", label: "모의투자 현황", shortLabel: "모의투자", icon: TrendingUp, description: "키움 모의투자 포지션 · 체결 · 손익" },
  { id: "data", label: "데이터 현황", shortLabel: "데이터", icon: Database, description: "수집 상태 · IP 확인 · 사용 방법" },
  { id: "builder", label: "조건식 작성기", shortLabel: "조건식", icon: SlidersHorizontal, description: "고급 조건식 작성 · 파라미터 설정 · 논리 조합 · 즉시 백테스트" },
];

export function MainDashboard() {
  const [tab, setTab] = useState<Tab>("home");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const currentTab = TABS.find(t => t.id === tab)!;

  return (
    <div className="flex min-h-screen flex-col bg-[#0a0e1a]">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-white lg:hidden"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <h1 className="text-base font-bold text-white">퀀트 백테스트</h1>
        </div>
        <div className="hidden items-center gap-4 sm:flex">
          <span className="rounded-full border border-slate-700 bg-slate-800/50 px-3 py-1 text-[10px] text-slate-400">
            키움증권 REST API
          </span>
          <span className="text-[10px] text-slate-500">자동 조건식 연구 · 모의투자</span>
        </div>
      </header>

      {/* Desktop tab navigation */}
      <nav className="hidden border-b border-slate-800 px-4 lg:flex">
        {TABS.map(t => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-medium transition ${
                active
                  ? "border-teal-400 text-teal-300"
                  : "border-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              <Icon size={15} />
              {t.label}
            </button>
          );
        })}
      </nav>

      {/* Mobile tab navigation */}
      <nav className="flex overflow-x-auto border-b border-slate-800 px-2 lg:hidden">
        {TABS.map(t => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setMobileMenuOpen(false); }}
              className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-medium transition ${
                active
                  ? "border-teal-400 text-teal-300"
                  : "border-transparent text-slate-500"
              }`}
            >
              <Icon size={13} />
              {t.shortLabel}
            </button>
          );
        })}
      </nav>

      {/* Mobile menu overlay */}
      {mobileMenuOpen && (
        <div className="absolute inset-x-0 top-14 z-50 border-b border-slate-700 bg-[#0a0e1a]/95 p-4 backdrop-blur-lg lg:hidden">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => { setTab(t.id); setMobileMenuOpen(false); }}
                className={`flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left transition ${
                  tab === t.id ? "bg-teal-500/10 text-teal-300" : "text-slate-300 hover:bg-slate-800"
                }`}
              >
                <Icon size={18} />
                <div>
                  <p className="text-sm font-medium">{t.label}</p>
                  <p className="text-[11px] text-slate-500">{t.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Page description */}
      <div className="border-b border-slate-800/50 bg-slate-900/30 px-5 py-2">
        <p className="text-[11px] text-slate-500">{currentTab.description}</p>
      </div>

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        {tab === "home" && <HomeSummary onNavigate={(t) => setTab(t as Tab)} />}
        {tab === "backtest" && <OneClickBacktest />}
        {tab === "chart" && <ChartPage />}
        {tab === "daytrade" && <DayTradingExperimentPanel />}
        {tab === "trading" && <MockTradingDashboard />}
        {tab === "data" && <DataStatus />}
        {tab === "builder" && <ConditionBuilderPage />}
      </main>
    </div>
  );
}
