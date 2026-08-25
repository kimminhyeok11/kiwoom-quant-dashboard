import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { TrpcContext } from "../_core/context";
import { appRouter } from "../routers";

function anonymousContext(): TrpcContext {
  return { user: null, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

describe("strategyCards 커뮤니티 접근 경계", () => {
  it("내 포켓몬 분석과 댓글·즐겨찾기 변경은 로그인 사용자만 실행할 수 있다", async () => {
    const caller = appRouter.createCaller(anonymousContext());

    await expect(caller.strategyCards.myCollectionAnalysis()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.strategyCards.addComment({ cardId: 1, body: "검증 근거를 확인했습니다." })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.strategyCards.toggleFavorite({ cardId: 1 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("공개 댓글 목록은 비로그인 사용자도 조회할 수 있다", async () => {
    const caller = appRouter.createCaller(anonymousContext());
    const comments = await caller.strategyCards.listComments({ cardId: 999_999_999 });

    expect(Array.isArray(comments)).toBe(true);
  });
});

describe("strategyCards collection analysis responsiveness", () => {
  it("limits analysis source rows and indexes daily battle rows by candidate before rendering card histories", () => {
    const source = readFileSync(resolve(process.cwd(), "server/routers/strategyCards.ts"), "utf8");
    expect(source).toContain("limit(360)");
    expect(source).toContain("limit(1_200)");
    expect(source).toContain("limit(1_500)");
    expect(source).toContain("const dailyByCandidate = new Map<number, typeof daily>()");
    expect(source).toContain("dailyByCandidate.get(candidate.id) ?? []");
  });
});
