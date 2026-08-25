/**
 * 메인 대시보드 - 심플한 탭 네비게이션
 * 
 * 4개 탭:
 * 1. 원클릭 백테스트 - 조건식 생성/테스트/채택/육성
 * 2. 차트 - HTS급 종목 차트 (1분~월봉)
 * 3. 모의투자 - 포지션/체결/손익 현황
 * 4. 데이터 현황 - 수집 상태, IP 확인
 */

import { useState } from "react";
import { OneClickBacktest } from "./OneClickBacktest";
import { ChartPage } from "./ChartPage";
import { MockTradingDashboard } from "./MockTradingDashboard";
import { DataStatus } from "./DataStatus";
import { BarChart3, FlaskConical, TrendingUp, Database } from "lucide-react";

type Tab = "backtest" | "chart" | "trading" | "data";

const TABS: Array<{ id: Tab; label: string; icon: typeof FlaskConical }> = [
  { id: "backtest", label: "백테스트", icon: FlaskConical },
  { id: "chart", label: "차트", icon: BarChart3 },
  { id: "trading", label: "모의투자", icon: TrendingUp },
  { id: "data", label: "데이터", icon: Database },
];

export function MainDashboard() {
  const [tab, setTab] = useState<Tab>("backtest");

  return (
    <div className="flex min-h-screen flex-col bg-[#0a0e1a]">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <h1 className="text-base font-bold text-white">
          퀀트 백테스트
        </h1>
        <span className="text-[11px] text-slate-500">
          키움증권 REST API · 자동 조건식 연구
        </span>
      </header>

      {/* Tab navigation */}
      <nav className="flex border-b border-slate-800 px-4">
        {TABS.map(t => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition ${
                active
                  ? "border-teal-400 text-teal-300"
                  : "border-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              <Icon size={16} />
              {t.label}
            </button>
          );
        })}
      </nav>

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        {tab === "backtest" && <OneClickBacktest />}
        {tab === "chart" && <ChartPage />}
        {tab === "trading" && <MockTradingDashboard />}
        {tab === "data" && <DataStatus />}
      </main>
    </div>
  );
}
