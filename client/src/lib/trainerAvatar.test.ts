import { describe, expect, it } from "vitest";
import { getTrainerAvatar, rarityVisualClass, TRAINER_AVATARS } from "./trainerAvatar";

describe("트레이너 아바타와 희귀도 시각 등급", () => {
  it("허용된 캐릭터 아바타를 제공하고 알 수 없는 값에는 기본 성운 마도사를 사용한다", () => {
    expect(TRAINER_AVATARS).toHaveLength(6);
    expect(getTrainerAvatar("dragon").label).toBe("청룡 트레이너");
    expect(getTrainerAvatar("unknown").id).toBe("nebula");
  });

  it("희귀도마다 고유한 홀로그램 테두리 클래스를 반환한다", () => {
    expect(rarityVisualClass("레어")).toBe("pokemon-rarity-rare");
    expect(rarityVisualClass("에픽")).toBe("pokemon-rarity-epic");
    expect(rarityVisualClass("전설")).toBe("pokemon-rarity-legendary");
    expect(rarityVisualClass("신화")).toBe("pokemon-rarity-mythic");
  });
});
