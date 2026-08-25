import { and, desc, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { researchDatasets, sharedDatasetBacktests, strategyPresets, strategySurvivalLedgers } from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { evaluateSurvivalEvidence, type ArenaEvidence, SURVIVAL_CRITERIA } from "../quant/survivalSelection";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "생존 카드 연구 데이터베이스를 사용할 수 없습니다." });
  return db;
}

function numberAt(value: unknown, key: string) {
  const candidate = value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;
  const number = Number(candidate);
  return Number.isFinite(number) ? number : 0;
}

function sourceRules(preset: { rulesJson: unknown }) {
  return Array.isArray(preset.rulesJson) ? preset.rulesJson.flatMap(rule => {
    if (!rule || typeof rule !== "object") return [];
    const config = (rule as { config?: unknown }).config;
    if (!config || typeof config !== "object") return [];
    const sourceRule = (config as Record<string, unknown>).sourceRule;
    return typeof sourceRule === "string" ? [sourceRule] : [];
  }) : [];
}

export const survivalResearchRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const ledgers = await db.select().from(strategySurvivalLedgers).where(eq(strategySurvivalLedgers.userId, ctx.user.id)).orderBy(desc(strategySurvivalLedgers.createdAt)).limit(30);
    if (!ledgers.length) return [];
    const presetIds = Array.from(new Set(ledgers.map(item => item.presetId)));
    const presets = await db.select({ id: strategyPresets.id, name: strategyPresets.name, rulesJson: strategyPresets.rulesJson }).from(strategyPresets).where(and(eq(strategyPresets.userId, ctx.user.id), inArray(strategyPresets.id, presetIds)));
    return ledgers.map(ledger => ({ ...ledger, preset: presets.find(preset => preset.id === ledger.presetId) ?? null }));
  }),

  evaluate: protectedProcedure.input(z.object({ presetIds: z.array(z.number().int().positive()).min(1).max(12) })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const presets = await db.select().from(strategyPresets).where(and(eq(strategyPresets.userId, ctx.user.id), inArray(strategyPresets.id, input.presetIds)));
    if (!presets.length) throw new TRPCError({ code: "NOT_FOUND", message: "평가할 내 조건식 카드를 찾지 못했습니다." });
    const records = await db.select().from(sharedDatasetBacktests).where(and(eq(sharedDatasetBacktests.userId, ctx.user.id), eq(sharedDatasetBacktests.timeframe, "five_minute"))).orderBy(desc(sharedDatasetBacktests.createdAt));
    const datasets = await db.select({ id: researchDatasets.id, name: researchDatasets.name }).from(researchDatasets);
    const saved = [] as Array<{ id: number; presetId: number; datasetId: number; resultsJson: unknown }>;
    const seen = new Set<string>();
    for (const record of records) {
      if (!input.presetIds.includes(record.presetId)) continue;
      const key = `${record.presetId}:${record.datasetId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      saved.push(record);
    }
    const ledgerRows = [];
    for (const preset of presets) {
      const arenas: ArenaEvidence[] = saved.filter(record => record.presetId === preset.id).map(record => {
        const result = record.resultsJson;
        const dataset = datasets.find(item => item.id === record.datasetId);
        return {
          datasetId: record.datasetId,
          datasetName: dataset?.name ?? `데이터셋 #${record.datasetId}`,
          averageReturn: numberAt(result, "averageReturn"),
          averageWinRate: numberAt(result, "averageWinRate"),
          totalTradeCount: numberAt(result, "totalTradeCount"),
          worstDrawdown: numberAt(result, "worstDrawdown"),
        };
      });
      const decision = evaluateSurvivalEvidence(arenas);
      const directRules = sourceRules(preset);
      const improvementPlan = decision.status === "promoted"
        ? { nextAction: "생존 카드로 보존하고 새 공용 아레나가 추가될 때 재검증합니다.", focusRules: directRules, researchOnly: true }
        : decision.status === "observe"
          ? { nextAction: "양수 아레나의 규칙은 유지하고, 음수 아레나에서 각 핵심 지표를 하나씩 제거·완화해 원인을 비교합니다.", focusRules: directRules, researchOnly: true }
          : { nextAction: "현재 조합은 생존 카드로 승격하지 않고, 낙폭 또는 아레나 일관성을 우선 개선하는 단일 지표 실험으로 보냅니다.", focusRules: directRules, researchOnly: true };
      await db.insert(strategySurvivalLedgers).values({ userId: ctx.user.id, presetId: preset.id, timeframe: "five_minute", status: decision.status, criteriaJson: SURVIVAL_CRITERIA, evidenceJson: { arenas, ...decision.summary, failures: decision.failures }, improvementPlanJson: improvementPlan });
      ledgerRows.push({ presetId: preset.id, presetName: preset.name, status: decision.status, criteria: SURVIVAL_CRITERIA, evidence: { arenas, ...decision.summary, failures: decision.failures }, improvementPlan });
    }
    return { evaluatedAt: new Date().toISOString(), ledgers: ledgerRows };
  }),
});
