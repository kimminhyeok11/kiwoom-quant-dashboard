import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const homeSource = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");

describe("재현 가능한 리서치 백테스트 화면", () => {
  it("운영자 프리셋과 저장된 실행 결과를 조회한다", () => {
    expect(homeSource).toContain("trpc.presets.list.useQuery");
    expect(homeSource).toContain("trpc.backtests.list.useQuery");
    expect(homeSource).toContain("trpc.quant.dailyBars.useQuery");
    expect(homeSource).toContain("trpc.backtests.run.useMutation");
    expect(homeSource).toContain("저장된 실험 결과");
  });

  it("실제 일봉 수집 전에는 예시 성과를 표시하지 않는다", () => {
    expect(homeSource).toContain("저장된 리서치 실험이 없습니다.");
    expect(homeSource).toContain("예시 시세나 임의 수익률은 사용하지 않습니다.");
  });

  it("프리셋과 실행 결과 조회의 로딩·오류 재시도 상태를 렌더링한다", () => {
    expect(homeSource).toContain("리서치 설정과 저장된 실험 결과를 불러오는 중입니다.");
    expect(homeSource).toContain("리서치 실험 데이터를 불러오지 못했습니다.");
    expect(homeSource).toContain("다시 시도");
  });
});
