/**
 * 벌크 1분봉 수집 라우터
 *
 * 과거 1분봉 대량 수집 요청을 생성/관리한다.
 * 로컬 노드가 이 요청을 폴링하여 키움 API로 수집 후 업로드한다.
 */

import { desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { bulkMinuteCollectionRequests } from "../../drizzle/schema";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { runSurgeHypothesisAnalysis } from "../quant/surgeAnalysis";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("벌크 수집 데이터베이스를 사용할 수 없습니다.");
  return db;
}

/** 거래대금 상위 종목 기본 리스트 (KOSPI200 중 유동성 높은 50종목) */
const DEFAULT_SYMBOLS = [
  "005930", "000660", "005380", "035420", "051910", // 삼성전자, SK하이닉스, 현대차, NAVER, LG화학
  "006400", "035720", "005490", "068270", "028260", // 삼성SDI, 카카오, POSCO, 셀트리온, 삼성물산
  "003670", "105560", "055550", "034730", "012330", // 포스코퓨처엠, KB금융, 신한지주, SK, 현대모비스
  "066570", "096770", "032830", "003490", "011200", // LG전자, SK이노, 삼성생명, 대한항공, HMM
  "000270", "010130", "009150", "018260", "033780", // 기아, 고려아연, 삼성전기, 삼성에스디에스, KT&G
  "030200", "086790", "034020", "015760", "316140", // KT, 한화에어로, 두산에너빌, 한국전력, 우리금융
  "017670", "024110", "009540", "003550", "011170", // SK텔레콤, 기업은행, 한국조선해양, LG, 롯데케미칼
  "010950", "036570", "047050", "000810", "004020", // S-Oil, 엔씨소프트, 포스코인터, 삼성화재, 현대제철
  "078930", "138040", "161390", "021240", "004170", // GS, 메리츠금융, 한국타이어, 코웨이, 신세계
];

export const bulkMinuteCollectionRouter = router({
  /** 벌크 수집 요청 생성 */
  create: protectedProcedure.input(z.object({
    symbols: z.array(z.string().regex(/^\d{6}$/)).min(1).max(100).default(DEFAULT_SYMBOLS),
    targetDays: z.number().int().min(10).max(120).default(60),
  }).optional()).mutation(async ({ input }) => {
    const db = await requireDb();
    const symbols = input?.symbols ?? DEFAULT_SYMBOLS;
    const targetDays = input?.targetDays ?? 60;

    // 이미 진행 중인 요청이 있으면 재사용
    const [active] = await db.select().from(bulkMinuteCollectionRequests)
      .where(inArray(bulkMinuteCollectionRequests.status, ["queued", "running"]))
      .orderBy(desc(bulkMinuteCollectionRequests.requestedAt))
      .limit(1);

    if (active) return { status: "reused" as const, requestId: active.id, totalSymbols: active.totalSymbols, completedSymbols: active.completedSymbols };

    const [created] = await db.insert(bulkMinuteCollectionRequests).values({
      symbolsJson: symbols,
      targetDays,
      totalSymbols: symbols.length,
      completedSymbols: 0,
      acceptedBarCount: 0,
      progressJson: { stage: "queued", currentSymbol: null, message: "로컬 노드에서 수집 대기 중" },
    }).returning();

    return { status: "created" as const, requestId: created.id, totalSymbols: symbols.length, completedSymbols: 0 };
  }),

  /** 현재 수집 상태 조회 */
  status: protectedProcedure.query(async () => {
    const db = await requireDb();
    const [latest] = await db.select().from(bulkMinuteCollectionRequests)
      .orderBy(desc(bulkMinuteCollectionRequests.requestedAt))
      .limit(1);

    if (!latest) return null;

    return {
      id: latest.id,
      status: latest.status,
      symbols: latest.symbolsJson as string[],
      targetDays: latest.targetDays,
      totalSymbols: latest.totalSymbols,
      completedSymbols: latest.completedSymbols,
      acceptedBarCount: latest.acceptedBarCount,
      progress: latest.progressJson as { stage: string; currentSymbol: string | null; message: string } | null,
      lastError: latest.lastError,
      requestedAt: latest.requestedAt,
      startedAt: latest.startedAt,
      completedAt: latest.completedAt,
    };
  }),

  /** 로컬 노드용: 대기 중인 수집 요청 가져오기 (publicProcedure — 노드 토큰으로 인증) */
  pending: publicProcedure.query(async () => {
    const db = await requireDb();
    const [pending] = await db.select().from(bulkMinuteCollectionRequests)
      .where(inArray(bulkMinuteCollectionRequests.status, ["queued", "running"]))
      .orderBy(desc(bulkMinuteCollectionRequests.requestedAt))
      .limit(1);

    if (!pending) return null;

    return {
      id: pending.id,
      symbols: pending.symbolsJson as string[],
      targetDays: pending.targetDays,
      completedSymbols: pending.completedSymbols,
      totalSymbols: pending.totalSymbols,
    };
  }),

  /** 로컬 노드용: 진행 상태 업데이트 */
  updateProgress: publicProcedure.input(z.object({
    requestId: z.number().int().positive(),
    completedSymbols: z.number().int().min(0),
    acceptedBarCount: z.number().int().min(0),
    currentSymbol: z.string().nullable(),
    message: z.string().max(200),
    status: z.enum(["running", "completed", "failed"]).optional(),
    lastError: z.string().max(500).nullable().optional(),
  })).mutation(async ({ input }) => {
    const db = await requireDb();

    const updateData: Record<string, unknown> = {
      completedSymbols: input.completedSymbols,
      acceptedBarCount: input.acceptedBarCount,
      progressJson: { stage: input.status ?? "running", currentSymbol: input.currentSymbol, message: input.message },
      updatedAt: new Date(),
    };

    if (input.status === "running" && !updateData.startedAt) {
      updateData.startedAt = new Date();
      updateData.status = "running";
    }
    if (input.status === "completed") {
      updateData.status = "completed";
      updateData.completedAt = new Date();
    }
    if (input.status === "failed") {
      updateData.status = "failed";
      updateData.lastError = input.lastError ?? "알 수 없는 오류";
    }
    if (input.status) updateData.status = input.status;

    await db.update(bulkMinuteCollectionRequests)
      .set(updateData)
      .where(eq(bulkMinuteCollectionRequests.id, input.requestId));

    return { updated: true };
  }),

  /** 급등 종목 역분석 가설 검증 실행 — 수집 완료 후 또는 수동으로 트리거 */
  runSurgeAnalysis: protectedProcedure.query(async () => {
    return runSurgeHypothesisAnalysis();
  }),
});
