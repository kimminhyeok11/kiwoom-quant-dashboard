/**
 * 전략 품질 평가 패널
 *
 * - 채택된 프리셋의 품질 등급 (A~D) 산출
 * - Walk-Forward 과적합 검증
 * - 종목별 성과 분포
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { ShieldCheck, TrendingUp, AlertTriangle, Award, BarChart3, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export function StrategyQualityPanel({ presetId, presetName }: { presetId: number; presetName: string }) {
  const [showWalkForward, setShowWalkForward] = useState(false);

  const evaluateMutation = trpc.strategyQuality.evaluate.useMutation({
    onError: (err) => toast.error(err.message),
  });

  const walkForwardMutation = trpc.strategyQuality.walkForward.useMutation({
    onError: (err) => toast.error(err.message),
  });

  const handleEvaluate = () => {
    evaluateMutation.mutate({ presetId });
  };

  const handleWalkForward = () => {
    walkForwardMutation.mutate({ presetId });
    setShowWalkForward(true);
  };

  const result = evaluateMutation.data;
  const wfResult = walkForwardMutation.data;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-4">
      {/* Header + Trigger */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Award size={16} className="text-amber-400" />
          <h3 className="text-xs font-bold text-white">전략 품질 평가</h3>
          <span className="text-[10px] text-slate-500">"{presetName}"</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleEvaluate}
            disabled={evaluateMutation.isPending}
            className="flex items-center gap-1 rounded-lg bg-teal-500/10 px-3 py-1.5 text-[10px] font-bold text-teal-300 transition hover:bg-teal-500/20 disabled:opacity-50"
          >
            {evaluateMutation.isPending ? <RefreshCw size={11} className="animate-spin" /> : <ShieldCheck size={11} />}
            {evaluateMutation.isPending ? "평가 중..." : "등급 평가"}
          </button>
          <button
            onClick={handleWalkForward}
            disabled={walkForwardMutation.isPending}
            className="flex items-center gap-1 rounded-lg bg-violet-500/10 px-3 py-1.5 text-[10px] font-bold text-violet-300 transition hover:bg-violet-500/20 disabled:opacity-50"
          >
            {walkForwardMutation.isPending ? <RefreshCw size={11} className="animate-spin" /> : <BarChart3 size={11} />}
            {walkForwardMutation.isPending ? "검증 중..." : "과적합 검증"}
          </button>
        </div>
      </div>

      {/* 등급 평가 결과 */}
      {result && (
        <div className="mt-4">
          {/* 등급 배지 */}
          <div className="flex items-center gap-4">
            <div className={`flex h-14 w-14 items-center justify-center rounded-2xl text-2xl font-black ${
              result.overallGrade.grade === "A" ? "bg-emerald-500/20 text-emerald-300" :
              result.overallGrade.grade === "B" ? "bg-teal-500/20 text-teal-300" :
              result.overallGrade.grade === "C" ? "bg-amber-500/20 text-amber-300" :
              "bg-rose-500/20 text-rose-300"
            }`}>
              {result.overallGrade.grade}
            </div>
            <div>
              <p className="text-sm font-bold text-white">{result.overallGrade.label} ({result.overallGrade.totalScore}점)</p>
              <p className="mt-0.5 text-[11px] text-slate-400">{result.overallGrade.description}</p>
            </div>
          </div>

          {/* 점수 막대 */}
          <div className="mt-4 grid gap-2">
            <ScoreBar label="수익률" score={result.overallGrade.scores.returnScore} max={25} color="teal" />
            <ScoreBar label="승률" score={result.overallGrade.scores.winRateScore} max={25} color="blue" />
            <ScoreBar label="안정성 (낙폭)" score={result.overallGrade.scores.drawdownScore} max={25} color="violet" />
            <ScoreBar label="일관성 (익절 비율)" score={result.overallGrade.scores.consistencyScore} max={25} color="amber" />
          </div>

          {/* 핵심 수치 */}
          <div className="mt-4 grid grid-cols-4 gap-2 text-center text-[10px]">
            <div className="rounded-lg bg-slate-900/50 p-2">
              <p className="text-slate-500">평균 수익</p>
              <p className={`mt-1 font-mono font-bold ${result.avgReturn >= 0 ? "text-red-400" : "text-blue-400"}`}>{result.avgReturn >= 0 ? "+" : ""}{result.avgReturn}%</p>
            </div>
            <div className="rounded-lg bg-slate-900/50 p-2">
              <p className="text-slate-500">승률</p>
              <p className="mt-1 font-mono font-bold text-white">{result.avgWinRate}%</p>
            </div>
            <div className="rounded-lg bg-slate-900/50 p-2">
              <p className="text-slate-500">최대 낙폭</p>
              <p className="mt-1 font-mono font-bold text-rose-300">{result.worstDrawdown}%</p>
            </div>
            <div className="rounded-lg bg-slate-900/50 p-2">
              <p className="text-slate-500">총 거래</p>
              <p className="mt-1 font-mono font-bold text-white">{result.totalTrades}건</p>
            </div>
          </div>

          {/* 종목별 등급 */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {result.symbolResults.map(sr => (
              <span key={sr.symbol} className={`rounded px-2 py-0.5 text-[9px] font-bold ${
                sr.grade === "A" ? "bg-emerald-500/10 text-emerald-300" :
                sr.grade === "B" ? "bg-teal-500/10 text-teal-300" :
                sr.grade === "C" ? "bg-amber-500/10 text-amber-300" :
                "bg-rose-500/10 text-rose-300"
              }`}>
                {sr.symbol} {sr.grade} ({sr.totalReturn >= 0 ? "+" : ""}{sr.totalReturn}%)
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Walk-Forward 결과 */}
      {showWalkForward && wfResult && (
        <div className="mt-4 border-t border-slate-800 pt-4">
          <div className="flex items-center gap-2">
            <BarChart3 size={14} className="text-violet-400" />
            <h4 className="text-xs font-bold text-white">Walk-Forward 과적합 검증</h4>
          </div>

          {/* 판정 */}
          <div className={`mt-3 rounded-lg border p-3 ${
            wfResult.verdict.includes("가능") ? "border-emerald-500/20 bg-emerald-950/10" :
            wfResult.verdict.includes("조건부") ? "border-amber-500/20 bg-amber-950/10" :
            "border-rose-500/20 bg-rose-950/10"
          }`}>
            <p className={`text-xs font-bold ${
              wfResult.verdict.includes("가능") ? "text-emerald-300" :
              wfResult.verdict.includes("조건부") ? "text-amber-300" :
              "text-rose-300"
            }`}>
              {wfResult.verdict}
            </p>
            <div className="mt-2 grid grid-cols-4 gap-2 text-[9px]">
              <div><span className="text-slate-500">학습 평균</span> <span className="text-white">{wfResult.avgTrainReturn}%</span></div>
              <div><span className="text-slate-500">검증 평균</span> <span className={wfResult.avgTestReturn >= 0 ? "text-emerald-300" : "text-rose-300"}>{wfResult.avgTestReturn}%</span></div>
              <div><span className="text-slate-500">과적합 비율</span> <span className="text-white">{wfResult.avgOverfitRatio}</span></div>
              <div><span className="text-slate-500">양성 윈도우</span> <span className="text-white">{Math.round(wfResult.positiveWindowRatio * 100)}%</span></div>
            </div>
          </div>

          {/* 윈도우 테이블 */}
          {wfResult.windows.length > 0 && (
            <div className="mt-3 max-h-40 overflow-y-auto">
              <table className="w-full text-[9px]">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-500">
                    <th className="px-2 py-1 text-left">구간</th>
                    <th className="px-2 py-1 text-right">학습</th>
                    <th className="px-2 py-1 text-right">검증</th>
                    <th className="px-2 py-1 text-right">비율</th>
                  </tr>
                </thead>
                <tbody>
                  {wfResult.windows.map((w, i) => (
                    <tr key={i} className="border-b border-slate-800/30">
                      <td className="px-2 py-1 text-slate-400">{w.testStart.slice(5)}~{w.testEnd.slice(5)}</td>
                      <td className="px-2 py-1 text-right text-slate-300">{w.trainResult.totalReturn}%</td>
                      <td className={`px-2 py-1 text-right font-bold ${w.testResult.totalReturn >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{w.testResult.totalReturn}%</td>
                      <td className={`px-2 py-1 text-right ${w.overfitRatio >= 0.5 ? "text-white" : "text-rose-400"}`}>{w.overfitRatio}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ScoreBar({ label, score, max, color }: { label: string; score: number; max: number; color: string }) {
  const pct = Math.round((score / max) * 100);
  const colors: Record<string, string> = {
    teal: "bg-teal-500", blue: "bg-blue-500", violet: "bg-violet-500", amber: "bg-amber-500",
  };
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 text-[9px] text-slate-500">{label}</span>
      <div className="flex-1 rounded-full bg-slate-800 h-1.5">
        <div className={`h-1.5 rounded-full ${colors[color] || "bg-slate-500"}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-right text-[9px] text-slate-400">{score}/{max}</span>
    </div>
  );
}
