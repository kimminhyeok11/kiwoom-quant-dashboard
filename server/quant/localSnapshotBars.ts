import { and, asc, desc, eq, like } from "drizzle-orm";
import { researchDailyBars, researchDatasets } from "../../drizzle/schema";
import { getDb } from "../db";
import type { DailyBar } from "./conditions";

export async function getLatestLocalSnapshotBars(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, symbol: string): Promise<{ bars: DailyBar[]; datasetId: number; versionKey: string } | null> {
  const datasets = await db.select().from(researchDatasets)
    .where(and(eq(researchDatasets.qualityStatus, "ready"), like(researchDatasets.versionKey, "local-ka10081:%")))
    .orderBy(desc(researchDatasets.readyAt), desc(researchDatasets.id)).limit(12);
  for (const dataset of datasets) {
    const rows = await db.select().from(researchDailyBars).where(and(eq(researchDailyBars.datasetId, dataset.id), eq(researchDailyBars.symbol, symbol))).orderBy(asc(researchDailyBars.date));
    if (!rows.length) continue;
    return { datasetId: dataset.id, versionKey: dataset.versionKey, bars: rows.map(bar => ({ date: bar.date, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: Number(bar.volume), turnover: Number(bar.turnover) })) };
  }
  return null;
}
