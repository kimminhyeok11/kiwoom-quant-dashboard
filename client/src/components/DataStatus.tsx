/**
 * 데이터 수집 현황
 * 
 * - 수집된 종목/일봉/분봉 수
 * - 현재 공인 IP
 * - 서버 연결 상태
 * - 키움 OAuth 상태
 */

import { trpc } from "@/lib/trpc";
import { Database, Globe, RefreshCw, CheckCircle2, XCircle, Wifi } from "lucide-react";

export function DataStatus() {
  const symbols = trpc.chartData.availableSymbols.useQuery(undefined, { staleTime: 30000 });
  const brokerStatus = trpc.quant.brokerStatus.useQuery(undefined, { staleTime: 30000, retry: false });

  const dailyCount = (symbols.data ?? []).filter(s => s.hasDaily).length;
  const minuteCount = (symbols.data ?? []).filter(s => s.hasMinute).length;
  const totalCount = (symbols.data ?? []).length;

  return (
    <div className="flex flex-col gap-5 p-4">
      <div>
        <h1 className="text-xl font-bold text-white">데이터 현황</h1>
        <p className="mt-1 text-xs text-slate-400">
          로컬 수집기(바탕화면 키움수집기 폴더)에서 매일 데이터가 이곳에 쌓입니다.
        </p>
      </div>

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
          detail={symbols.isError ? symbols.error.message : "Vercel 배포 정상"}
        />
      </div>

      {/* Instructions */}
      <section className="rounded-xl border border-slate-800 bg-slate-950/30 p-5">
        <h2 className="text-sm font-bold text-white">사용 방법</h2>
        <ol className="mt-3 space-y-3 text-xs text-slate-400">
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
            <span><span className="font-medium text-white">일봉수집.bat</span> 더블클릭 → 데이터 수집 시작</span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-500/20 text-[10px] font-bold text-teal-300">4</span>
            <span>데이터 쌓이면 → <span className="font-medium text-white">백테스트</span> 탭에서 원클릭 실행</span>
          </li>
        </ol>
      </section>

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
    </div>
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
