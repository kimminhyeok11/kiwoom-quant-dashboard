export const TRAINER_AVATARS = [
  { id: "nebula", label: "성운 마도사", emoji: "🧙", tone: "from-violet-300 to-cyan-300" },
  { id: "fox", label: "붉은 여우", emoji: "🦊", tone: "from-orange-300 to-rose-300" },
  { id: "robot", label: "연구 로봇", emoji: "🤖", tone: "from-sky-300 to-indigo-300" },
  { id: "tiger", label: "호랑이 탐험가", emoji: "🐯", tone: "from-amber-300 to-orange-300" },
  { id: "owl", label: "부엉이 분석가", emoji: "🦉", tone: "from-slate-300 to-violet-300" },
  { id: "dragon", label: "청룡 트레이너", emoji: "🐉", tone: "from-emerald-300 to-teal-300" },
] as const;

export type TrainerAvatarId = typeof TRAINER_AVATARS[number]["id"];

export function getTrainerAvatar(id?: string | null) {
  return TRAINER_AVATARS.find(avatar => avatar.id === id) ?? TRAINER_AVATARS[0];
}

export function rarityVisualClass(rarity: string) {
  if (rarity === "신화") return "pokemon-rarity-mythic";
  if (rarity === "전설") return "pokemon-rarity-legendary";
  if (rarity === "에픽") return "pokemon-rarity-epic";
  if (rarity === "레어") return "pokemon-rarity-rare";
  if (rarity === "고급") return "pokemon-rarity-uncommon";
  return "pokemon-rarity-common";
}
