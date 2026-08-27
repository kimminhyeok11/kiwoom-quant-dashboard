/**
 * 데이터 수집 현황 + 수집 제어
 *
 * - 수집된 종목/일봉/분봉 수
 * - 수집기 연결 상태
 * - 일봉/분봉 수집 시작 버튼 (웹에서 직접 트리거)
 * - 수집 진행 상태 모니터링
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Database, Globe, CheckCircle2, Wifi, Clock, Signal, Play, RefreshCw, BarChart3, Timer, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export function DataStatus() {
  const symbols = trpc.chartData.availableSymbols.useQuery(undefined, { staleTime: 30000 });
  const brokerStatus = trpc.quant.brokerStatus.useQuery(undefined, { staleTime: 30000, retry: false });
  const collectorStatus = trpc.network.collectorStatus.useQuery(undefined, { staleTime: 15000, refetchInterval: 30000 });
  const collectionStatus = trpc.dataCollection.collectionStatus.useQuery(undefined, { refetchInterval: 10000 });

  const dailyCount = (symbols.data ?? []).filter(s => s.hasDaily).length;
  const minuteCount = (symbols.data ?? []).filter(s => s.hasMinute).length;
  const totalCount = (symbols.data ?? []).length;

  const lastSync = collectorStatus.data?.lastSyncAt ? new Date(collectorStatus.data.lastSyncAt) : null;
  const lastSyncStr = lastSync
    ? lastSync.toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : "기록 없음";
  const syncAgo = lastSync ? getTimeAgo(lastSync) : null;

  // 수집 뮤테이션
  const dailyCollect = trpc.dataCollection.requestDailyCollection.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      collectionStatus.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const minuteCollect = trpc.dataCollection.requestMinuteCollection.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      collectionStatus.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const isConnected = collectorStatus.data?.connected ?? false;
  const dailyReq = collectionStatus.data?.daily;
  const minuteReq = collectionStatus.data?.minute;
  const isDailyRunning = dailyReq?.status === "queued" || dailyReq?.status === "running";
  const isMinuteRunning = minuteReq?.status === "queued" || minuteReq?.status === "running";

  return (
    <div className="flex flex-col gap-5 p-4">
      <div>
        <h1 className="text-xl font-bold text-white">데이터 수집</h1>
        <p className="mt-1 text-xs text-slate-400">
          시세 데이터를 수집하고 관리합니다. 버튼을 눌러 수집을 시작하세요.
        </p>
      </div>

      {/* Connection Status Banner */}
      <div className={`flex items-center gap-3 rounded-xl border p-4 ${
        isConnected
          ? "border-emerald-500/30 bg-emerald-950/20"
          : "border-amber-500/30 bg-amber-950/20"
      }`}>
        <div className={`flex h-10 w-10 items-center justify-center rounded-full ${
          isConnected ? "bg-emerald-500/20" : "bg-amber-500/20"
        }`}>
          <Signal size={18} className={isConnected ? "text-emerald-400" : "text-amber-400"} />
        </div>
        <div className="flex-1">
          <p className={`text-sm font-medium ${isConnected ? "text-emerald-300" : "text-amber-300"}`}>
            {isConnected ? "수집기 연결됨" : "수집기 미연결"}
            {collectorStatus.data?.roundTripVerified && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-300">
                <CheckCircle2 size={10} /> 왕복 검증 완료
              </span>
            )}
          </p>
          <p className="text-xs text-slate-400">
            {collectorStatus.data?.terminalIp && (
              <span className="mr-2">IP: {collectorStatus.data.terminalIp}</span>
            )}
            <span className="inline-flex items-center gap-1">
              <Clock size={10} />
              마지막 동기화: {lastSyncStr}
              {syncAgo && <span className="text-slate-500">({syncAgo})</span>}
            </span>
          </p>
        </div>
      </div>

      {/* Collection Controls */}
      <section className="rounded-xl border border-slate-800 bg-slate-950/30 p-5">
        <h2 className="mb-4 text-sm font-bold text-white">수집 시작</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {/* 일봉 수집 */}
          <div className="rounded-xl border border-slate-700/50 bg-slate-900/30 p-4">
            <div className="flex items-center gap-2">
              <BarChart3 size={16} className="text-teal-400" />
              <h3 className="text-xs font-bold text-white">일봉 데이터 수집</h3>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
              전 종목의 일봉(시가/고가/저가/종가/거래량)을 수집합니다. 백테스트에 필수입니다.
            </p>
            {dailyReq && (
              <div className="mt-3 rounded-lg bg-slate-800/50 px-3 py-2 text-[10px]">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">최근 요청</span>
                  <StatusBadge status={dailyReq.status} />
                </div>
                {dailyReq.acceptedBarCount > 0 && (
                  <p className="mt-1 text-slate-500">수집 완료: {dailyReq.acceptedBarCount.toLocaleString()}봉</p>
                )}
                {dailyReq.lastError && (
                  <p className="mt-1 text-rose-400">{dailyReq.lastError}</p>
                )}
              </div>
            )}
            <button
              onClick={() => dailyCollect.mutate({})}
              disabled={dailyCollect.isPending || isDailyRunning}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-teal-500/10 py-2.5 text-xs font-bold text-teal-300 transition hover:bg-teal-500/20 disabled:opacity-50"
            >
              {isDailyRunning ? (
                <><RefreshCw size={14} className="animate-spin" /> 수집 진행 중...</>
              ) : dailyCollect.isPending ? (
                <><RefreshCw size={14} className="animate-spin" /> 요청 중...</>
              ) : (
                <><Play size={14} /> 일봉 수집 시작</>
              )}
            </button>
          </div>

          {/* 분봉 수집 */}
          <div className="rounded-xl border border-slate-700/50 bg-slate-900/30 p-4">
            <div className="flex items-center gap-2">
              <Timer size={16} className="text-violet-400" />
              <h3 className="text-xs font-bold text-white">분봉 데이터 수집</h3>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
              오늘의 1분봉 데이터를 수집합니다. 장중 단기매매 검증에 사용됩니다.
            </p>
            {minuteReq && (
              <div className="mt-3 rounded-lg bg-slate-800/50 px-3 py-2 text-[10px]">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">{minuteReq.tradingDate}</span>
                  <StatusBadge status={minuteReq.status} />
                </div>
                {minuteReq.acceptedBarCount > 0 && (
                  <p className="mt-1 text-slate-500">수집 완료: {minuteReq.acceptedBarCount.toLocaleString()}봉</p>
                )}
                {minuteReq.lastError && (
                  <p className="mt-1 text-rose-400">{minuteReq.lastError}</p>
                )}
              </div>
            )}
            <button
              onClick={() => minuteCollect.mutate({})}
              disabled={minuteCollect.isPending || isMinuteRunning}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-violet-500/10 py-2.5 text-xs font-bold text-violet-300 transition hover:bg-violet-500/20 disabled:opacity-50"
            >
              {isMinuteRunning ? (
                <><RefreshCw size={14} className="animate-spin" /> 수집 진행 중...</>
              ) : minuteCollect.isPending ? (
                <><RefreshCw size={14} className="animate-spin" /> 요청 중...</>
              ) : (
                <><Play size={14} /> 분봉 수집 시작</>
              )}
            </button>
          </div>
        </div>

        {/* 수집기 미연결 시 안내 */}
        {!isConnected && (
          <div className="mt-4 flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-950/10 p-3">
            <AlertCircle size={16} className="mt-0.5 shrink-0 text-amber-400" />
            <div className="text-[11px] leading-relaxed text-amber-200/80">
              <p className="font-bold">수집기가 연결되지 않았습니다</p>
              <p className="mt-1 text-slate-400">
                수집 요청은 대기열에 저장됩니다. 로컬 PC에서 수집기를 실행하면 자동으로 처리됩니다.
                아직 수집기를 설치하지 않았다면 아래 가이드를 참고하세요.
              </p>
            </div>
          </div>
        )}
      </section>

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          icon={Database}
          label="수집된 종목"
          value={`${totalCount}개`}
          detail={`일봉 ${dailyCount}개 · 분봉 ${minuteCount}개`}
        />
        <Card
          icon={Wifi}
          label="키움 API"
          value={brokerStatus.data?.mode === "live" ? "실투자" : brokerStatus.data?.mode === "mock" ? "모의투자" : "미연결"}
          detail={brokerStatus.data?.hasCredentials ? "자격 증명 있음" : "자격 증명 없음"}
        />
        <Card
          icon={Globe}
          label="지정단말"
          value={brokerStatus.data?.fixedIpRegistered ? "등록됨" : "미등록"}
          detail="키움 OpenAPI 사이트에서 IP 등록 필요"
        />
        <Card
          icon={CheckCircle2}
          label="서버 상태"
          value={symbols.isError ? "오류" : "정상"}
          detail={symbols.isError ? symbols.error.message : "서버 연결 정상"}
        />
      </div>

      {/* Symbol list */}
      {(symbols.data ?? []).length > 0 && (
        <section className="rounded-xl border border-slate-800 bg-slate-950/30 p-5">
          <h2 className="text-sm font-bold text-white">수집된 종목 목록</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {(symbols.data ?? []).map(s => (
              <span
                key={s.symbol}
                className="rounded-md border border-slate-700 bg-slate-800/50 px-2 py-1 font-mono text-xs text-slate-300"
              >
                {s.symbol}
                {s.hasDaily && <span className="ml-1 text-[9px] text-teal-400">D</span>}
                {s.hasMinute && <span className="ml-0.5 text-[9px] text-violet-400">M</span>}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Setup Guide (collapsed) */}
      <details className="rounded-xl border border-slate-800 bg-slate-950/30 p-5">
        <summary className="cursor-pointer text-sm font-bold text-white">
          처음 설치 가이드
        </summary>
        <ol className="mt-4 space-y-3 text-xs text-slate-400">
          <li className="flex gap-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-500/20 text-[10px] font-bold text-teal-300">1</span>
            <span>바탕화면 → <span className="font-medium text-white">키움수집기</span> 폴더 → <span className="font-medium text-white">IP확인.bat</span> 더블클릭 → IP 확인</span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-500/20 text-[10px] font-bold text-teal-300">2</span>
            <span><a href="https://openapi.kiwoom.com" target="_blank" rel="noopener" className="text-teal-300 underline">openapi.kiwoom.com</a> → 계좌 App Key 관리 → 현재 IP 등록</span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-500/20 text-[10px] font-bold text-teal-300">3</span>
            <span><span className="font-medium text-white">수집기실행.bat</span> 더블클릭 → 수집기 상주 모드로 실행</span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-500/20 text-[10px] font-bold text-teal-300">4</span>
            <span>이 페이지에서 <span className="font-medium text-white">"일봉 수집 시작"</span> 또는 <span className="font-medium text-white">"분봉 수집 시작"</span> 클릭</span>
          </li>
        </ol>
      </details>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    queued: "bg-amber-500/10 text-amber-300",
    running: "bg-teal-500/10 text-teal-300",
    completed: "bg-emerald-500/10 text-emerald-300",
    failed: "bg-rose-500/10 text-rose-300",
    cancelled: "bg-slate-500/10 text-slate-400",
  };
  const labels: Record<string, string> = {
    queued: "대기 중",
    running: "수집 중",
    completed: "완료",
    failed: "실패",
    cancelled: "취소됨",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${styles[status] ?? styles.cancelled}`}>
      {labels[status] ?? status}
    </span>
  );
}

function Card({ icon: Icon, label, value, detail }: { icon: typeof Database; label: string; value: string; detail: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-4">
      <div className="flex items-center gap-2">
        <Icon size={14} className="text-slate-500" />
        <span className="text-[11px] text-slate-500">{label}</span>
      </div>
      <p className="mt-2 font-mono text-lg font-bold text-white">{value}</p>
      <p className="mt-1 text-[10px] text-slate-500">{detail}</p>
    </div>
  );
}

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "방금 전";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}
