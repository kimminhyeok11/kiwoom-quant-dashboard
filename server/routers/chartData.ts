/**
 * ì°¨íŠ¸ ?°ì´???¼ìš°?? * 
 * ?€?¥ëœ 1ë¶„ë´‰/?¼ë´‰ ?°ì´?°ë? ì°¨íŠ¸ ì»´í¬?ŒíŠ¸?©ìœ¼ë¡??œê³µ?©ë‹ˆ??
 * ?´ë¼?´ì–¸?¸ì—???€?„í”„?ˆì„ ë³€?˜ì? ?ì²´?ìœ¼ë¡??˜í–‰?©ë‹ˆ??
 */

import { z } from "zod";
import { asc, and, eq, desc, gte, lte, inArray, sql } from "drizzle-orm";
import { publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { intradayMinuteBars, localResearchDailyBars } from "../../drizzle/schema";
import { TRPCError } from "@trpc/server";

export const chartDataRouter = router({
  /**
   * ì¢…ëª©??1ë¶„ë´‰ ?°ì´??ì¡°íšŒ
   * - tradingDate: ?¹ì • ê±°ë˜??(?†ìœ¼ë©?ìµœê·¼ ?°ì´??
   * - symbol: 6?ë¦¬ ì¢…ëª©ì½”ë“œ
   * - days: ìµœê·¼ Nê±°ë˜??(ê¸°ë³¸ 5)
   */
  minuteBars: publicProcedure
    .input(z.object({
      symbol: z.string().regex(/^\d{6}$/),
      tradingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      days: z.number().int().min(1).max(60).default(5),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB ?°ê²° ë¶ˆê?" });

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
   * ì¢…ëª©???¼ë´‰ ?°ì´??ì¡°íšŒ
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
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB ?°ê²° ë¶ˆê?" });

      const conditions = [
        eq(localResearchDailyBars.symbol, input.symbol),
        sql`${localResearchDailyBars.adjustmentBasis}::text = 'adjusted'`,
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
   * ?˜ì§‘??ì¢…ëª© ëª©ë¡ (ì°¨íŠ¸?ì„œ ì¢…ëª© ? íƒ??
   */
  availableSymbols: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB ?°ê²° ë¶ˆê?" });

    // ?¼ë´‰???ˆëŠ” ì¢…ëª© ëª©ë¡
    const daily = await db
      .selectDistinct({ symbol: localResearchDailyBars.symbol })
      .from(localResearchDailyBars)
      .where(sql`${localResearchDailyBars.adjustmentBasis}::text = 'adjusted'`)
      .limit(100);

    // ë¶„ë´‰???ˆëŠ” ì¢…ëª© ëª©ë¡
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
