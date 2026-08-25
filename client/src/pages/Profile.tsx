import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { startLogin } from "@/const";
import { getTrainerAvatar, TRAINER_AVATARS } from "@/lib/trainerAvatar";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, CheckCircle2, Loader2, LockKeyhole, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";

export default function Profile() {
  const { user, loading } = useAuth();
  const utils = trpc.useUtils();
  const profile = trpc.profile.me.useQuery(undefined, { enabled: Boolean(user), retry: false });
  const selectedAvatar = getTrainerAvatar(profile.data?.avatarId ?? user?.avatarId);
  const updateAvatar = trpc.profile.updateAvatar.useMutation({
    onSuccess: result => {
      utils.profile.me.setData(undefined, current => current ? { ...current, avatarId: result.avatarId } : current);
      utils.auth.me.setData(undefined, current => current ? { ...current, avatarId: result.avatarId } : current);
      toast.success("내 정보의 아바타를 변경했습니다.");
    },
    onError: error => toast.error(error.message),
  });
  const returnPath = user?.isOperator ? "/operator" : "/arena";

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-[#06101b] text-slate-300"><Loader2 className="mr-2 animate-spin" size={18}/>내 정보를 불러오는 중입니다.</main>;
  if (!user) return <main className="flex min-h-screen items-center justify-center bg-[#06101b] px-5 text-slate-100"><section className="w-full max-w-md rounded-3xl border border-cyan-200/20 bg-slate-900/80 p-8 text-center shadow-2xl"><LockKeyhole className="mx-auto text-cyan-200" size={30}/><h1 className="mt-5 text-2xl font-black">내 정보에 로그인하세요</h1><p className="mt-3 text-sm leading-6 text-slate-400">아바타와 개인 연구 공간은 로그인한 트레이너별로 관리됩니다.</p><Button onClick={() => startLogin()} className="mt-6 bg-cyan-300 font-bold text-slate-950 hover:bg-cyan-200">로그인</Button></section></main>;

  return <main data-testid="profile-page" className="min-h-screen bg-[#06101b] px-4 py-5 text-slate-100 sm:px-7 lg:px-10"><div className="mx-auto max-w-4xl"><header className="flex items-center justify-between gap-4"><a href={returnPath} className="inline-flex items-center gap-2 rounded-xl text-sm font-bold text-slate-300 transition hover:text-cyan-100"><ArrowLeft size={16}/>내 아레나로</a><a href="/" className="text-sm font-bold text-slate-400 transition hover:text-white">게임 홈</a></header><section className="mt-7 overflow-hidden rounded-[2rem] border border-cyan-200/20 bg-[radial-gradient(circle_at_85%_0%,rgba(34,211,238,0.16),transparent_33%),linear-gradient(135deg,#10243a,#08121d)] p-6 sm:p-8"><div className="flex flex-wrap items-start gap-5"><div className={`flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br ${selectedAvatar.tone} text-4xl shadow-xl`} aria-label={`${selectedAvatar.label} 프로필 아이콘`}>{selectedAvatar.emoji}</div><div className="min-w-0 flex-1"><p className="text-[11px] font-black tracking-[0.2em] text-cyan-200">MY PROFILE</p><h1 className="mt-2 truncate text-3xl font-black tracking-tight text-white">{profile.data?.name ?? user.name ?? "내 트레이너"}</h1><p className="mt-2 truncate text-sm text-slate-400">{profile.data?.email ?? user.email ?? "연결된 계정"}</p><span className="mt-4 inline-flex items-center gap-2 rounded-xl border border-teal-200/20 bg-teal-300/10 px-3 py-2 text-xs font-bold text-teal-100"><ShieldCheck size={14}/>{user.isOperator ? "운영 연구소 접근 가능" : "개인 연구 트레이너"}</span></div></div></section><section className="mt-6 rounded-[2rem] border border-slate-700 bg-slate-900/45 p-6 sm:p-8"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-[11px] font-black tracking-[0.18em] text-violet-200">TRAINER AVATAR</p><h2 className="mt-2 text-2xl font-black">캐릭터 아바타</h2><p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">선택한 아바타는 배틀 결과 공유 카드와 게임 홈의 트레이너 표시로 반영됩니다. 배틀 설정과는 별도로 여기에서만 변경합니다.</p></div><UserRound className="text-violet-200" size={24}/></div><div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">{TRAINER_AVATARS.map(avatar => <button key={avatar.id} type="button" aria-pressed={selectedAvatar.id === avatar.id} onClick={() => updateAvatar.mutate({ avatarId: avatar.id })} disabled={updateAvatar.isPending} className={`group rounded-2xl border p-4 text-left transition disabled:opacity-50 ${selectedAvatar.id === avatar.id ? "border-cyan-200/55 bg-cyan-300/10 shadow-[0_0_24px_rgba(34,211,238,0.08)]" : "border-slate-700 bg-slate-950/40 hover:-translate-y-0.5 hover:border-slate-500"}`}><span className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${avatar.tone} text-2xl`}>{avatar.emoji}</span><div className="mt-4 flex items-center justify-between gap-2"><span className="text-sm font-bold text-white">{avatar.label}</span>{selectedAvatar.id === avatar.id && <CheckCircle2 className="shrink-0 text-cyan-200" size={16}/>}</div><span className="mt-1 block text-xs text-slate-400">{selectedAvatar.id === avatar.id ? "현재 사용 중" : "이 아바타 선택"}</span></button>)}</div></section></div></main>;
}
