/**
 * 조건식 작성기 tRPC 라우터
 *
 * 고급 조건식의 저장/불러오기/삭제/복제/이름변경 및
 * 조건식 기반 백테스트 실행을 담당한다.
 */

import { z } from "zod";
import { and, asc, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { localResearchDailyBars, strategyPresets } from "../../drizzle/schema";
import { validateExpression } from "../../shared/expressionValidation";
import { runDailyBacktest } from "../quant/backtest";
import type { ConditionExpressionGroup } from "../../shared/trading";
import type { DailyBar } from "../quant/conditions";

export const conditionBuilderRouter = router({
  /**
   * 조건식 저장 (upsert)
   */
  save: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(120),
        description: z.string().max(500).optional(),
        expressionJson: z.unknown(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "DB 연결 불가",
        });

      const [saved] = await db
        .insert(strategyPresets)
        .values({
          userId: ctx.user.id,
          name: input.name,
          rulesJson: input.expressionJson,
          scoringJson: {
            description: input.description,
            savedAt: new Date().toISOString(),
          },
        })
        .returning();

      return { id: saved.id, name: saved.name };
    }),

  /**
   * 저장된 조건식 목록 (createdAt DESC, 최대 50개)
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db)
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "DB 연결 불가",
      });

    const presets = await db
      .select()
      .from(strategyPresets)
      .where(eq(strategyPresets.userId, ctx.user.id))
      .orderBy(desc(strategyPresets.createdAt))
      .limit(50);

    return presets.map((p) => ({
      id: p.id,
      name: p.name,
      rulesJson: p.rulesJson,
      scoringJson: p.scoringJson,
      createdAt: p.createdAt,
    }));
  }),

  /**
   * 단일 프리셋 불러오기
   */
  load: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "DB 연결 불가",
        });

      const [preset] = await db
        .select()
        .from(strategyPresets)
        .where(
          and(
            eq(strategyPresets.id, input.id),
            eq(strategyPresets.userId, ctx.user.id),
          ),
        )
        .limit(1);

      if (!preset) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "조건식을 찾을 수 없습니다",
        });
      }

      return preset;
    }),

  /**
   * 조건식 삭제
   */
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "DB 연결 불가",
        });

      const result = await db
        .delete(strategyPresets)
        .where(
          and(
            eq(strategyPresets.id, input.id),
            eq(strategyPresets.userId, ctx.user.id),
          ),
        )
        .returning();

      if (!result.length) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "삭제할 조건식을 찾을 수 없습니다",
        });
      }

      return { success: true };
    }),

  /**
   * 조건식 복제 (" (복사)" 접미사 추가)
   */
  duplicate: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "DB 연결 불가",
        });

      const [original] = await db
        .select()
        .from(strategyPresets)
        .where(
          and(
            eq(strategyPresets.id, input.id),
            eq(strategyPresets.userId, ctx.user.id),
          ),
        )
        .limit(1);

      if (!original) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "복제할 조건식을 찾을 수 없습니다",
        });
      }

      const newName = `${original.name} (복사)`;

      const [duplicated] = await db
        .insert(strategyPresets)
        .values({
          userId: ctx.user.id,
          name: newName,
          rulesJson: original.rulesJson,
          scoringJson: original.scoringJson,
        })
        .returning();

      return { id: duplicated.id, name: duplicated.name };
    }),

  /**
   * 조건식 이름 변경
   */
  rename: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(120),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "DB 연결 불가",
        });

      const result = await db
        .update(strategyPresets)
        .set({ name: input.name, updatedAt: new Date() })
        .where(
          and(
            eq(strategyPresets.id, input.id),
            eq(strategyPresets.userId, ctx.user.id),
          ),
        )
        .returning();

      if (!result.length) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "이름을 변경할 조건식을 찾을 수 없습니다",
        });
      }

      return { success: true };
    }),

  /**
   * 중복 이름 체크
   */
  checkNameExists: protectedProcedure
    .input(z.object({ name: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "DB 연결 불가",
        });

      const [existing] = await db
        .select({ id: strategyPresets.id })
        .from(strategyPresets)
        .where(
          and(
            eq(strategyPresets.userId, ctx.user.id),
            eq(strategyPresets.name, input.name),
          ),
        )
        .limit(1);

      return { exists: !!existing };
    }),

  /**
   * 조건식 백테스트 실행
   */
  runBacktest: protectedProcedure
    .input(
      z.object({
        expressionJson: z.unknown(),
        holdingDays: z.number().int().min(1).max(60).default(5),
        feeRate: z.number().min(0).max(0.01).default(0.0003),
        slippageBps: z.number().min(0).max(100).default(8),
        minScore: z.number().min(0).max(200).default(0),
      }),
    )
    .mutation(async ({ input }) => {
      // 1. 서버측 expression 검증
      const expression = input.expressionJson as ConditionExpressionGroup;
      const validationErrors = validateExpression(expression);
      if (validationErrors.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: validationErrors.map((e) => e.message).join("; "),
        });
      }

      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "DB 연결 불가",
        });

      // 2. 랜덤 종목 선택 (oneClickBacktest 패턴 재사용)
      const allSymbols = await db
        .selectDistinct({ symbol: localResearchDailyBars.symbol })
        .from(localResearchDailyBars)
        .where(eq(localResearchDailyBars.adjustmentBasis, "adjusted"))
        .limit(100);

      if (!allSymbols.length) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "백테스트할 일봉 데이터가 없습니다. 로컬 수집기로 데이터를 먼저 수집하세요.",
        });
      }

      const shuffled = allSymbols.sort(() => Math.random() - 0.5);
      const selectedSymbols = shuffled.slice(0, Math.min(5, shuffled.length));

      // 3. 선택된 종목의 일봉 로드
      const barsBySymbol: Record<string, DailyBar[]> = {};
      for (const { symbol } of selectedSymbols) {
        const rows = await db
          .select({
            date: localResearchDailyBars.date,
            open: localResearchDailyBars.open,
            high: localResearchDailyBars.high,
            low: localResearchDailyBars.low,
            close: localResearchDailyBars.close,
            volume: localResearchDailyBars.volume,
            turnover: localResearchDailyBars.turnover,
          })
          .from(localResearchDailyBars)
          .where(
            and(
              eq(localResearchDailyBars.symbol, symbol),
              eq(localResearchDailyBars.adjustmentBasis, "adjusted"),
            ),
          )
          .orderBy(asc(localResearchDailyBars.date))
          .limit(600);

        if (rows.length >= 60) {
          barsBySymbol[symbol] = rows.map((r) => ({
            date: r.date,
            open: r.open,
            high: r.high,
            low: r.low,
            close: r.close,
            volume: Number(r.volume),
            turnover: Number(r.turnover),
          }));
        }
      }

      const eligibleSymbols = Object.keys(barsBySymbol);
      if (!eligibleSymbols.length) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "60개 이상의 일봉이 있는 종목이 없습니다. 데이터를 더 수집하세요.",
        });
      }

      // 4. 각 종목별 백테스트 실행
      const feeRate = input.feeRate + input.slippageBps / 10000;
      const symbolResults: Array<{
        symbol: string;
        totalReturn: number;
        winRate: number;
        tradeCount: number;
        maxDrawdown: number;
        trades: Array<{
          entryDate: string;
          exitDate: string;
          entryPrice: number;
          exitPrice: number;
          returnPercent: number;
        }>;
      }> = [];

      for (const symbol of eligibleSymbols) {
        const bars = barsBySymbol[symbol];
        const maxStart = Math.max(0, bars.length - 60);
        const startIndex = Math.floor(Math.random() * maxStart);
        const slicedBars = bars.slice(startIndex);

        const result = runDailyBacktest({
          bars: slicedBars,
          expression,
          minScore: input.minScore,
          holdingDays: input.holdingDays,
          feeRate,
          entryDelayDays: 1,
          entryTiming: "open",
          maxOpenGapPercent: 3,
          stopLossPercent: 3,
          takeProfitPercent: 5,
        });

        symbolResults.push({
          symbol,
          totalReturn: Number(result.totalReturn.toFixed(2)),
          winRate: Number(result.winRate.toFixed(1)),
          tradeCount: result.tradeCount,
          maxDrawdown: Number(result.maxDrawdown.toFixed(2)),
          trades: result.trades.slice(-10),
        });
      }

      // 5. 평균 수익률/승률 계산
      const averageReturn =
        symbolResults.reduce((sum, r) => sum + r.totalReturn, 0) /
        symbolResults.length;
      const averageWinRate =
        symbolResults.reduce((sum, r) => sum + r.winRate, 0) /
        symbolResults.length;

      return {
        symbols: eligibleSymbols,
        results: symbolResults,
        averageReturn: Number(averageReturn.toFixed(2)),
        averageWinRate: Number(averageWinRate.toFixed(1)),
      };
    }),
});
