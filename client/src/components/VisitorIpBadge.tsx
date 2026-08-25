import { trpc } from "@/lib/trpc";
import { Globe2 } from "lucide-react";
import React, { useEffect, useState } from "react";

type BrowserIpState = { ip: string | null; loading: boolean };

function isIpv4(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const octets = value.trim().split(".");
  return octets.length === 4 && octets.every(octet => /^\d{1,3}$/.test(octet) && Number(octet) >= 0 && Number(octet) <= 255);
}

export function VisitorIpBadge({ compact = false }: { compact?: boolean }) {
  const visitorQuery = trpc.network?.visitorIp?.useQuery;
  const visitor = visitorQuery ? visitorQuery(undefined, { retry: false, staleTime: 25_000, refetchInterval: 30_000 }) : { data: null, isLoading: false };
  const [browserIp, setBrowserIp] = useState<BrowserIpState>({ ip: null, loading: true });

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("https://api.ipify.org?format=json", { signal: controller.signal, cache: "no-store" });
        const body = await response.json() as { ip?: unknown };
        if (response.ok && isIpv4(body.ip)) setBrowserIp({ ip: body.ip.trim(), loading: false });
        else setBrowserIp({ ip: null, loading: false });
      } catch {
        if (!controller.signal.aborted) setBrowserIp({ ip: null, loading: false });
      }
    })();
    return () => controller.abort();
  }, []);

  const serverIpv4 = isIpv4(visitor.data?.ip) ? visitor.data.ip : null;
  const value = browserIp.ip ?? serverIpv4 ?? (browserIp.loading || visitor.isLoading ? "IPv4 확인 중" : "IPv4 확인 불가");
  const sourceLabel = browserIp.ip ? "이 브라우저 인터넷 IPv4 · 키움 등록 주소 아님" : serverIpv4 ? "서버 요청 IPv4 · 키움 등록 주소 아님" : "브라우저 IPv4 응답 대기";
  return <div data-testid="visitor-ip-badge" aria-live="polite" className={`flex shrink-0 items-center gap-2 rounded-xl border border-teal-300/20 bg-slate-900/60 text-left ${compact ? "min-w-[13.5rem] px-2.5 py-1.5" : "px-3 py-2"}`}><Globe2 size={15} className="shrink-0 text-teal-300"/><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-teal-200">현재 브라우저 IPv4</p><p className="font-mono text-xs font-semibold text-white">{value}</p>{compact && <p className="mt-0.5 text-[9px] text-slate-500">{sourceLabel}</p>}</div></div>;
}
