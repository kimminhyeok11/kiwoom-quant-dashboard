/**
 * 시장 국면 대시보드
 *
 * 데이터 검증 기반:
 * - 7년 일봉 40종목 + 1분봉 6개월 45종목 검증 결과
 * - 상승장에서만 갭 전략 유효 (PF 1.7), 하락장에서는 손실 (PF 0.77)
 * - "자동 매매 시그널"이 아닌 "의사결정 지원 도구"
 */

import { trpc } from "@/lib/trpc";
import { AlertTriangle, Shield, TrendingDown, TrendingUp, Activity } from "lucide-react";

const KRX_SYMBOL_NAMES: Record<string, string> = {
  "005930": "삼성전자", "000660": "SK하이닉스", "005380": "현대차", "035420": "NAVER", "051910": "LG화학",
  "006400": "삼성SDI", "035720": "카카오", "005490": "POSCO홀딩스", "068270": "셀트리온", "028260": "삼성물산",
  "003670": "포스코퓨처엠", "105560": "KB금융", "055550": "신한지주", "034730": "SK", "012330": "현대모비스",
  "066570": "LG전자", "096770": "SK이노베이션", "032830": "삼성생명", "003490": "대한항공", "011200": "HMM",
  "000270": "기아", "010130": "고려아연", "009150": "삼성전기", "018260": "삼성에스디에스", "033780": "KT&G",
  "030200": "KT", "086790": "한화에어로스페이스", "034020": "두산에너빌리티", "015760": "한국전력", "316140": "우리금융지주",
  "017670": "SK텔레콤", "024110": "기업은행", "009540": "한국조선해양", "003550": "LG", "011170": "롯데케미칼",
  "010950": "S-Oil", "036570": "엔씨소프트", "047050": "포스코인터내셔널", "000810": "삼성화재", "004020": "현대제철",
  "078930": "GS", "138040": "메리츠금융지주", "161390": "한국타이어앤테크놀로지", "021240": "코웨이", "004170": "신세계",
};

export function MarketRegimePanel() {
  const regime = trpc.minuteResearch.marketRegime.useQuery(undefined, {
    retry: 2,
    refetchInterval: 300_000, // 5분마다
  });

  const data = regime.data;

  if (regime.isLoading) {
    return <section className="mt-5 rounded-2xl border border-slate-800 bg-slate-900/35 p-5">
      <p className="text-xs text-slate-500">시장 국면 분석 중...</p>
    </section>;
  }

  if (!data) {
    return <section className="mt-5 rounded-2xl border border-slate-800 bg-slate-900/35 p-5">
      <p className="text-xs text-slate-500">일봉 데이터가 부족하여 시장 국면을 판단할 수 없습니다.</p>
    </section>;
  }

  const regimeColor = data.regime === "bull" ? "teal" : data.regime === "bear" ? "rose" : "amber";
  const RegimeIcon = data.regime === "bull" ? TrendingUp : data.regime === "bear" ? TrendingDown : Activity;

  return (
    <section className={`mt-5 rounded-2xl border border-${regimeColor}-300/25 bg-slate-900/35 p-5`}>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className={`text-[10px] font-bold uppercase tracking-[0.16em] text-${regimeColor}-300`}>
            MARKET REGIME · DATA-DRIVEN
          </p>
          <h2 className="mt-1 text-lg font-bold text-white">{data.guide.summary}</h2>
          <p className="mt-1 text-xs text-slate-500">
            기준: {KRX_SYMBOL_NAMES[data.referenceSymbol] ?? data.referenceSymbol} {data.referencePrice.toLocaleString()}원 |
            20일선 {data.ma20.toLocaleString()}원 ({data.deviationFromMa20Pct > 0 ? "+" : ""}{data.deviationFromMa20Pct}%) |
            갱신: {data.lastUpdated}
          </p>
        </div>
        <div className={`flex items-center gap-2 rounded-full border border-${regimeColor}-300/30 bg-${regimeColor}-300/[0.08] px-3 py-1.5`}>
          <RegimeIcon size={14} className={`text-${regimeColor}-200`} />
          <span className={`text-xs font-bold text-${regimeColor}-100`}>{data.regimeLabel}</span>
          <span className="text-[10px] text-slate-400">{data.confidence}%</span>
        </div>
      </div>

      {/* Strategy Guide */}
      <div className={`mt-4 rounded-xl border border-${regimeColor}-300/20 bg-${regimeColor}-300/[0.04] p-4`}>
        <div className="flex items-start gap-3">
          {data.guide.riskLevel === "high" ? <AlertTriangle size={16} className="mt-0.5 shrink-0 text-rose-300" /> : <Shield size={16} className="mt-0.5 shrink-0 text-teal-300" />}
          <div>
            <p className="text-xs font-bold text-white">{data.guide.recommendation}</p>
            <p className="mt-2 text-[11px] text-slate-400">
              갭 전략 기대값: <span className={data.regime === "bull" ? "text-teal-200" : "text-rose-300"}>{data.guide.gapStrategyExpected}</span>
            </p>
            <p className="mt-1 text-[10px] text-slate-500">{data.guide.evidence}</p>
          </div>
        </div>
      </div>

      {/* High Volatility Symbols */}
      {data.highVolatilitySymbols.length > 0 && (
        <div className="mt-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
            변동성 상위 종목 ({data.regime === "bull" ? "갭 전략 적용 가능" : "관찰용"})
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {data.highVolatilitySymbols.slice(0, 6).map(s => (
              <div key={s.symbol} className="rounded-lg border border-slate-800 bg-slate-950/40 p-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-200">
                    {KRX_SYMBOL_NAMES[s.symbol] ?? s.symbol}
                  </span>
                  <span className="font-mono text-[10px] text-slate-500">{s.symbol}</span>
                </div>
                <div className="mt-1.5 flex items-center gap-3 text-[10px]">
                  <span className="text-amber-200">변동 {s.volatilityPct.toFixed(1)}%</span>
                  <span className={s.prevReturn >= 0 ? "text-teal-200" : "text-rose-300"}>
                    {s.prevReturn >= 0 ? "+" : ""}{s.prevReturn.toFixed(1)}%
                  </span>
                </div>
                <p className="mt-1 text-[9px] text-slate-500">{s.gapRelevance}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Verification Transparency */}
      <details className="mt-4">
        <summary className="cursor-pointer text-[10px] font-semibold text-slate-500 hover:text-slate-300">
          검증 근거 보기
        </summary>
        <div className="mt-2 rounded-lg border border-slate-800 bg-slate-950/30 p-3 text-[10px] leading-relaxed text-slate-500">
          <p className="font-bold text-slate-300">이 판단은 다음 검증을 거쳤습니다:</p>
          <ul className="mt-2 space-y-1">
            <li>✅ 일봉 7년(2019~2026) 40종목 70,362건 Walk-Forward 시뮬레이션</li>
            <li>✅ 기간 분할 4가지(50/50, 60/40, 70/30, 80/20) 전부 OOS 양수 확인</li>
            <li>✅ 종목 서브셋(A/B그룹) 양쪽 양수 확인</li>
            <li>⚠️ 연도별 4/8년만 양수 (상승장 연도에 집중)</li>
            <li>❌ 하락장에서는 모든 기계적 전략이 음의 기대값</li>
          </ul>
          <p className="mt-2 font-bold text-amber-200">결론: 시장 국면 판단이 전략보다 중요합니다.</p>
          <p className="mt-1">기계적 시그널을 맹신하지 마세요. 이 도구는 "데이터가 말하는 현재 국면"을 투명하게 보여줄 뿐입니다.</p>
        </div>
      </details>
    </section>
  );
}
