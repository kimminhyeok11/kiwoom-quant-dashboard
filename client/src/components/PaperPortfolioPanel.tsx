import { useState } from "react";
import React from "react";
import { CircleAlert, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { OrderDraftPanel } from "@/components/OrderDraftPanel";

export function PaperPortfolioPanel({ showOrderDrafts = false }: { showOrderDrafts?: boolean }) {
  const utils = trpc.useUtils();
  const observations = trpc.paperPortfolio.latestActualObservations.useQuery({ limit: 12 }, { retry: false, refetchInterval: 60_000 });
  const portfolios = trpc.paperPortfolio.list.useQuery(undefined, { retry: false, refetchInterval: 60_000 });
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const open = trpc.paperPortfolio.openFromObservation.useMutation({
    onSuccess: result => {
      utils.paperPortfolio.list.invalidate();
      toast.success(`${result.symbol} ${result.quantity.toLocaleString()}주를 실제 가격 기반 모의 추적에 추가했습니다.`);
    },
    onError: error => toast.error(error.message),
  });
  const createOrderDraft = trpc.orders.createFromResearchObservation.useMutation({
    onSuccess: result => toast.success(result.status === "pending_confirmation" ? `주문 초안 #${result.id}을 만들었습니다. 실제 전송 전 최종 확인이 필요합니다.` : `주문 초안 #${result.id}은 현재 위험 한도로 차단되었습니다.`),
    onError: error => toast.error(error.message),
  });

  const quantityOf = (observationId: number) => Number(quantities[observationId] ?? "1");
  const validateQuantity = (observationId: number) => {
    const quantity = quantityOf(observationId);
    if (!Number.isInteger(quantity) || quantity < 1) {
      toast.error("수량은 1주 이상의 정수여야 합니다.");
      return null;
    }
    return quantity;
  };
  const start = (observationId: number) => {
    const quantity = validateQuantity(observationId);
    if (quantity) open.mutate({ observationId, quantity });
  };
  const draftOrder = (observationId: number) => {
    const quantity = validateQuantity(observationId);
    if (quantity) createOrderDraft.mutate({ observationId, quantity });
  };
  const positions = portfolios.data?.flatMap(portfolio => portfolio.positions.filter(position => position.status === "open").map(position => ({ portfolio, position }))) ?? [];

  return <section className="mt-5 frosted-panel rounded-2xl p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="font-bold text-white">실제 가격 기반 모의 포트폴리오</h2>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">키움에서 저장된 실제 가격 관찰만 진입·평가 가격으로 사용합니다. 임의 시세·가상 수익률은 만들지 않으며, 실제 계좌 매수와는 별개입니다.</p>
      </div>
      <WalletCards className="text-teal-300" size={22}/>
    </div>
    <div className="mt-5 grid gap-5 xl:grid-cols-2">
      <div className="rounded-xl border border-slate-800 bg-slate-950/25 p-4">
        <p className="text-sm font-semibold text-slate-200">실제 가격 관찰 후보</p>
        <p className="mt-1 text-[11px] text-slate-500">관찰만으로 매수되지는 않습니다. 아래 버튼을 눌러야 연구용 모의 추적 또는 주문 초안이 생성됩니다.</p>
        {observations.data?.length ? <div className="mt-3 space-y-2">{observations.data.map(item => <div key={item.id} className="rounded-lg border border-slate-800 bg-slate-950/35 p-3">
          <div className="flex items-center justify-between gap-3">
            <div><p className="text-sm font-semibold text-slate-200">{item.name ?? item.symbol}</p><p className="mt-1 font-mono text-[10px] text-slate-500">{item.symbol} · {item.source}</p></div>
            <p className="font-mono text-sm text-teal-200">{item.price.toLocaleString()}원</p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Input aria-label={`${item.symbol} 수량`} value={quantities[item.id] ?? "1"} onChange={event => setQuantities(current => ({ ...current, [item.id]: event.target.value.replace(/\D/g, "") }))} inputMode="numeric" className="h-8 w-24 border-slate-700 bg-slate-900 font-mono text-xs text-slate-100"/>
            <Button size="sm" onClick={() => start(item.id)} disabled={open.isPending} className="bg-teal-300 text-slate-950 hover:bg-teal-200">모의 추적 시작</Button>
            <Button size="sm" variant="outline" onClick={() => draftOrder(item.id)} disabled={createOrderDraft.isPending} className="border-amber-300/30 bg-amber-300/5 text-amber-100 hover:bg-amber-300/10 hover:text-amber-50">주문 초안 만들기</Button>
          </div>
        </div>)}</div> : <p className="mt-4 text-xs leading-relaxed text-slate-500">새 실제 가격 관찰이 없어서 시작할 수 없습니다. OAuth·장중 수집이 완료되면 조건식 후보의 키움 가격이 표시됩니다.</p>}
      </div>
      <div className="rounded-xl border border-slate-800 bg-slate-950/25 p-4">
        <p className="text-sm font-semibold text-slate-200">추적 중인 모의 포지션</p>
        {positions.length ? <div className="mt-3 space-y-2">{positions.map(({ portfolio, position }) => <div key={position.id} className="rounded-lg border border-slate-800 bg-slate-950/35 p-3">
          <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold text-slate-200">{position.name}</p><p className="mt-1 font-mono text-[10px] text-slate-500">{position.symbol} · {position.quantity.toLocaleString()}주 · 모의 진입 {position.entryPrice.toLocaleString()}원</p></div><div className="text-right"><p className="font-mono text-xs text-slate-300">현재 {position.latestPrice.toLocaleString()}원</p><p className={`mt-1 font-mono text-xs ${position.unrealizedPnl >= 0 ? "text-teal-200" : "text-rose-300"}`}>{position.unrealizedPnl >= 0 ? "+" : ""}{position.unrealizedPnl.toLocaleString()}원</p></div></div>
          <p className="mt-2 text-[10px] text-slate-500">{portfolio.name} · 실제 계좌 보유 아님</p>
        </div>)}</div> : <div className="mt-4 flex items-center gap-2 text-xs text-slate-500"><CircleAlert size={15}/>실제 가격으로 시작한 모의 포지션이 없습니다.</div>}
      </div>
    </div>
    {showOrderDrafts && <OrderDraftPanel />}
  </section>;
}
