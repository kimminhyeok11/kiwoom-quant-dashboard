import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve(process.cwd(), "client/src/App.tsx"), "utf8");
const profileSource = readFileSync(resolve(process.cwd(), "client/src/pages/Profile.tsx"), "utf8");
const gameEntrySource = readFileSync(resolve(process.cwd(), "client/src/pages/GameEntry.tsx"), "utf8");
const personalArenaSource = readFileSync(resolve(process.cwd(), "client/src/pages/PersonalArena.tsx"), "utf8");
const strategyArenaSource = readFileSync(resolve(process.cwd(), "client/src/components/StrategyArenaLab.tsx"), "utf8");
const topNavSource = readFileSync(resolve(process.cwd(), "client/src/components/ResearchTopNav.tsx"), "utf8");

describe("내 정보 아바타 설정 위치", () => {
  it("아바타 선택은 로그인 사용자의 내 정보 경로에서 제공한다", () => {
    expect(appSource).toContain('window.location.pathname === "/profile"');
    expect(appSource).toContain("<Profile/>");
    expect(profileSource).toContain("MY PROFILE");
    expect(profileSource).toContain("캐릭터 아바타");
    expect(profileSource).toContain("trpc.profile.updateAvatar.useMutation");
    expect(profileSource).toContain("utils.auth.me.setData");
  });

  it("공통 연구 내비게이션과 개인 아레나는 내 정보 진입점을 제공한다", () => {
    expect(appSource).toContain("<ResearchTopNav/>");
    expect(topNavSource).toContain('href="/profile"');
    expect(personalArenaSource).toContain('href="/profile"');
    expect(gameEntrySource).not.toContain("MINUTE DATA LEAGUE");
  });

  it("운영 연구소는 선택된 아바타를 공유 결과에 사용하지만 아바타 설정기를 노출하지 않는다", () => {
    expect(strategyArenaSource).toContain("getTrainerAvatar(trainerProfile.data?.avatarId)");
    expect(strategyArenaSource).not.toContain("TRAINER AVATAR");
    expect(strategyArenaSource).not.toContain("updateAvatar.mutate");
    expect(strategyArenaSource).not.toContain("TRAINER_AVATARS.map");
  });
});
