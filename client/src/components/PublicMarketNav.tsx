import { Activity, Menu, X } from "lucide-react";
import React, { useState } from "react";

type PublicMarketNavProps = { active: "arena" | "research" | "intraday" };

const items = [
  { id: "arena", label: "게임 아레나", detail: "덱 선택·아레나 배틀 시작", path: "/" },
  { id: "research", label: "연구 기록", detail: "고정 원본·누적 검증", path: "/research" },
  { id: "intraday", label: "장중 실시간 성과", detail: "실제 시세 기반 모의 추적", path: "/intraday" },
] as const;

export function PublicMarketNav({ active }: PublicMarketNavProps) {
  const [open, setOpen] = useState(false);
  const navigate = (path: string) => { setOpen(false); window.location.assign(path); };

  return <div className="public-market-nav fixed left-4 top-5 z-[70] sm:left-7 lg:left-[clamp(2rem,5vw,6rem)]">
    <button type="button" aria-label={open ? "공개 기능 메뉴 닫기" : "공개 기능 메뉴 열기"} aria-expanded={open} onClick={() => setOpen(value => !value)} className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-800/90 text-slate-100 shadow-lg shadow-black/20 transition hover:bg-teal-300 hover:text-slate-950 active:scale-[0.97]">
      {open ? <X size={20}/> : <Menu size={21}/>} 
    </button>
    {open && <>
      <button type="button" aria-label="공개 기능 메뉴 닫기" onClick={() => setOpen(false)} className="fixed inset-0 -z-10 cursor-default bg-transparent"/>
      <nav aria-label="공개 기능 메뉴" className="absolute left-0 top-14 w-72 rounded-2xl bg-[#101824] p-2 shadow-2xl shadow-black/40">
        {items.map(item => <button key={item.id} type="button" onClick={() => navigate(item.path)} className={`block w-full rounded-xl px-4 py-3 text-left transition ${active === item.id ? "bg-teal-300/15 text-teal-100" : "text-slate-100 hover:bg-slate-800"}`}>
          <span className="flex items-center gap-2 text-sm font-bold">{item.id === "intraday" && <Activity size={15}/>} {item.label}</span>
          <span className="mt-1 block text-xs font-normal text-slate-400">{item.detail}</span>
        </button>)}
      </nav>
    </>}
  </div>;
}
