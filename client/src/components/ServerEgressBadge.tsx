import { trpc } from "@/lib/trpc";
import { Server } from "lucide-react";
import React from "react";

export function ServerEgressBadge() {
  const egressQuery = trpc.system.serverEgress.useQuery(undefined, { retry: false, staleTime: 10 * 60_000 });
  const value = egressQuery.data?.ip ?? (egressQuery.isLoading ? "확인 중" : "확인 불가");

  return <div aria-live="polite" className="flex items-center gap-2 rounded-xl border border-teal-300/20 bg-slate-900/60 px-3 py-2 text-left"><Server size={15} className="shrink-0 text-teal-300"/><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-teal-200">서버 REST IP</p><p className="font-mono text-xs font-semibold text-white">{value}</p></div></div>;
}
