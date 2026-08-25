/**
 * 차트 데이터 라우터
 * 
 * 저장된 1분봉/일봉 데이터를 차트 컴포넌트용으로 제공합니다.
 * 클라이언트에서 타임프레임 변환은 자체적으로 수행합니다.
 */

import { z } from "zod";
import { asc, and, eq, desc, gte, lte, inArray } from "drizzle-orm";
import { publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { intradayMinuteBars, localResearchDailyBars } from "../../drizzle/schema";
import { TRPCError } from "@trpc/server";

export const chartDataRouter = router({
  /**
   * 종목의 1분봉 데이터 조회
   * - tradingDate: 특정 거래일 (없으면 최근 데이터)
   * - symbol: 6자리 종목코드
   * - days: 최근 N거래일 (기본 5)
   */
  minuteBars: publicProcedure
    .input(z.object({
      symbol: z.string().regex(/^\d{6}$/),
      tradingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      days: z.number().int().min(1).max(60).default(5),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 불가" });

      let query;
      if (input.tradingDate) {
        query = db
          .select({
            minuteAt: intradayMinuteBars.minuteAt,
            open: intradayMinuteBars.open,
            high: intradayMinuteBars.high,
            low: intradayMinuteBars.low,
            close: intradayMinuteBars.close,
            volume: intradayMinuteBars.volume,
          })
          .from(intradayMinuteBars)
          .where(and(
            eq(intradayMinuteBars.symbol, input.symbol),
            eq(intradayMinuteBars.tradingDate, input.tradingDate),
          ))
          .orderBy(asc(intradayMinuteBars.minuteAt));
      } else {
        // Get latest N trading days
        const latestDates = await db
          .selectDistinct({ tradingDate: intradayMinuteBars.tradingDate })
          .from(intradayMinuteBars)
          .where(eq(intradayMinuteBars.symbol, input.symbol))
          .orderBy(desc(intradayMinuteBars.tradingDate))
          .limit(input.days);

        if (!latestDates.length) {
          return { bars: [], tradingDates: [], symbol: input.symbol };
        }

        const dates = latestDates.map(d => d.tradingDate);
        query = db
          .select({
            minuteAt: intradayMinuteBars.minuteAt,
            open: intradayMinuteBars.open,
            high: intradayMinuteBars.high,
            low: intradayMinuteBars.low,
            close: intradayMinuteBars.close,
            volume: intradayMinuteBars.volume,
          })
          .from(intradayMinuteBars)
          .where(and(
            eq(intradayMinuteBars.symbol, input.symbol),
            inArray(intradayMinuteBars.tradingDate, dates),
          ))
          .orderBy(asc(intradayMinuteBars.minuteAt));
      }

      const rows = await query;
      const bars = rows.map(row => ({
        time: Math.floor(new Date(row.minuteAt).getTime() / 1000),
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volume: Number(row.volume),
      }));

      const tradingDates = Array.from(new Set(rows.map(r => {
        const d = new Date(r.minuteAt);
        return new Date(d.getTime() + 9 * 3600000).toISOString().slice(0, 10);
      }))).sort();

      return { bars, tradingDates, symbol: input.symbol };
    }),

  /**
   * 종목의 일봉 데이터 조회
   */
  dailyBars: publicProcedure
    .input(z.object({
      symbol: z.string().regex(/^\d{6}$/),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      limit: z.number().int().min(1).max(1000).default(600),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 불가" });

      const conditions = [
        eq(localResearchDailyBars.symbol, input.symbol),
        eq(localResearchDailyBars.adjustmentBasis, "adjusted"),
      ];
      if (input.startDate) conditions.push(gte(localResearchDailyBars.date, input.startDate));
      if (input.endDate) conditions.push(lte(localResearchDailyBars.date, input.endDate));

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
        .where(and(...conditions))
        .orderBy(asc(localResearchDailyBars.date))
        .limit(input.limit);

      const bars = rows.map(row => ({
        time: Math.floor(new Date(row.date + "T00:00:00+09:00").getTime() / 1000),
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volume: Number(row.volume),
        turnover: Number(row.turnover),
      }));

      return { bars, symbol: input.symbol, barCount: bars.length };
    }),

  /**
   * 수집된 종목 목록 (차트에서 종목 선택용)
   */
  availableSymbols: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 불가" });

    // 일봉이 있는 종목 목록
    const daily = await db
      .selectDistinct({ symbol: localResearchDailyBars.symbol })
      .from(localResearchDailyBars)
      .where(eq(localResearchDailyBars.adjustmentBasis, "adjusted"))
      .limit(100);

    // 분봉이 있는 종목 목록
    const minute = await db
      .selectDistinct({ symbol: intradayMinuteBars.symbol })
      .from(intradayMinuteBars)
      .limit(100);

    const symbols = new Map<string, { hasDaily: boolean; hasMinute: boolean }>();
    for (const row of daily) {
      symbols.set(row.symbol, { hasDaily: true, hasMinute: false });
    }
    for (const row of minute) {
      const existing = symbols.get(row.symbol);
      if (existing) existing.hasMinute = true;
      else symbols.set(row.symbol, { hasDaily: false, hasMinute: true });
    }

    return Array.from(symbols.entries()).map(([symbol, flags]) => ({
      symbol,
      ...flags,
    }));
  }),
});
