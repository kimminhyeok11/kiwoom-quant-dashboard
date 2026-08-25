import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { htsConditionSnapshots, minuteResearchCandidates, minuteResearchDailyMetrics, minuteResearchPrograms, minuteResearchSweeps, minuteResearchSymbolMetrics, publicStrategyCardCollections, publicStrategyCardComments, publicStrategyCardFavorites, publicStrategyCards, strategyPresets, users } from "../../drizzle/schema";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";

type RuleNode = { type?: string; children?: RuleNode[]; [key: string]: unknown };

function flattenRules(node: unknown): RuleNode[] {
  if (!node || typeof node !== "object") return [];
  const candidate = node as RuleNode;
  if (Array.isArray(candidate.children)) return candidate.children.flatMap(flattenRules);
  return typeof candidate.type === "string" ? [candidate] : [];
}

function cardTitle(fingerprint: string) {
  return `아레나 카드 · ${fingerprint.slice(0, 8)}`;
}

function metricValue(value: unknown, key: string): number {
  if (!value || typeof value !== "object") return 0;
  const record = value as Record<string, unknown>;
  const direct = record[key];
  if (typeof direct === "number") return direct;
  if (typeof direct === "string" && Number.isFinite(Number(direct))) return Number(direct);
  return metricValue(record.metrics, key);
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("전략 카드 컬렉션 데이터베이스를 사용할 수 없습니다.");
  return db;
}

export const strategyCardsRouter = router({
  myCollectionAnalysis: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const presets = await db.select().from(strategyPresets).where(eq(strategyPresets.userId, ctx.user.id)).orderBy(desc(strategyPresets.updatedAt)).limit(120);
    const presetIds = presets.map(preset => preset.id);
    const candidates = presetIds.length ? await db.select().from(minuteResearchCandidates).where(inArray(minuteResearchCandidates.collectedPresetId, presetIds)).orderBy(desc(minuteResearchCandidates.createdAt)).limit(360) : [];
    const candidateIds = candidates.map(candidate => candidate.id);
    const daily = candidateIds.length ? await db.select().from(minuteResearchDailyMetrics).where(inArray(minuteResearchDailyMetrics.candidateId, candidateIds)).orderBy(desc(minuteResearchDailyMetrics.tradingDate)).limit(1_200) : [];
    const symbols = candidateIds.length ? await db.select().from(minuteResearchSymbolMetrics).where(inArray(minuteResearchSymbolMetrics.candidateId, candidateIds)).orderBy(desc(minuteResearchSymbolMetrics.tradingDate)).limit(1_500) : [];
    const sweepIds = Array.from(new Set(candidates.map(candidate => candidate.sweepId)));
    const sweeps = sweepIds.length ? await db.select().from(minuteResearchSweeps).where(inArray(minuteResearchSweeps.id, sweepIds)).limit(120) : [];
    const presetById = new Map(presets.map(preset => [preset.id, preset]));
    const candidateByPreset = new Map<number, typeof candidates[number]>();
    for (const candidate of candidates) if (candidate.collectedPresetId && !candidateByPreset.has(candidate.collectedPresetId)) candidateByPreset.set(candidate.collectedPresetId, candidate);
    const dailyByCandidate = new Map<number, typeof daily>();
    for (const row of daily) {
      const rows = dailyByCandidate.get(row.candidateId) ?? [];
      rows.push(row);
      dailyByCandidate.set(row.candidateId, rows);
    }
    const cards = Array.from(candidateByPreset.entries()).map(([presetId, candidate]) => {
      const battles = dailyByCandidate.get(candidate.id) ?? [];
      return {
        presetId,
        candidateId: candidate.id,
        name: presetById.get(presetId)?.name ?? `전략 카드 #${presetId}`,
        strategyFingerprint: candidate.strategyFingerprint,
        validationReturnPercent: Number(candidate.validationReturnPercent),
        winRate: Number(candidate.winRate),
        validationTradeCount: candidate.validationTradeCount,
        maxDrawdownPercent: Number(candidate.validationMaxDrawdownPercent),
        dailyBattleCount: battles.length,
        positiveBattleRate: battles.length ? battles.filter(row => Number(row.netReturnPercent) > 0).length / battles.length * 100 : 0,
        collectedAt: candidate.createdAt,
      };
    });
    const trendByDate = new Map<string, Array<{ netReturnPercent: number; winRate: number }>>();
    for (const row of daily) {
      const entries = trendByDate.get(row.tradingDate) ?? [];
      entries.push({ netReturnPercent: Number(row.netReturnPercent), winRate: Number(row.winRate) });
      trendByDate.set(row.tradingDate, entries);
    }
    const trend = Array.from(trendByDate.entries()).sort(([a], [b]) => a.localeCompare(b)).slice(-30).map(([tradingDate, values]) => ({ tradingDate, averageReturnPercent: values.reduce((total, value) => total + value.netReturnPercent, 0) / values.length, averageWinRate: values.reduce((total, value) => total + value.winRate, 0) / values.length, battleCount: values.length }));
    const symbolByCode = new Map<string, Array<{ netReturnPercent: number; winRate: number; tradeCount: number }>>();
    for (const row of symbols) { const entries = symbolByCode.get(row.symbol) ?? []; entries.push({ netReturnPercent: Number(row.netReturnPercent), winRate: Number(row.winRate), tradeCount: row.tradeCount }); symbolByCode.set(row.symbol, entries); }
    const symbolPerformance = Array.from(symbolByCode.entries()).map(([symbol, values]) => ({ symbol, averageReturnPercent: values.reduce((total, value) => total + value.netReturnPercent, 0) / values.length, averageWinRate: values.reduce((total, value) => total + value.winRate, 0) / values.length, tradeCount: values.reduce((total, value) => total + value.tradeCount, 0), battleCount: values.length })).sort((a, b) => b.averageReturnPercent - a.averageReturnPercent).slice(0, 8);
    const sweepById = new Map(sweeps.map(sweep => [sweep.id, sweep]));
    const arenaBySweep = new Map<number, typeof candidates>();
    for (const candidate of candidates) { const entries = arenaBySweep.get(candidate.sweepId) ?? []; entries.push(candidate); arenaBySweep.set(candidate.sweepId, entries); }
    const arenas = Array.from(arenaBySweep.entries()).map(([sweepId, entries]) => { const sweep = sweepById.get(sweepId); return { sweepId, datasetFingerprint: sweep?.datasetFingerprint ?? "unknown", completedAt: sweep?.completedAt ?? null, cardCount: entries.length, averageReturnPercent: entries.reduce((total, entry) => total + Number(entry.validationReturnPercent), 0) / entries.length, averageWinRate: entries.reduce((total, entry) => total + Number(entry.winRate), 0) / entries.length }; }).sort((a, b) => b.sweepId - a.sweepId).slice(0, 8);
    const cumulativeReturnPercent = cards.reduce((total, card) => total + card.validationReturnPercent, 0);
    const averageWinRate = cards.length ? cards.reduce((total, card) => total + card.winRate, 0) / cards.length : 0;
    const cardPeriodPerformance = cards.map(card => {
      const candidate = candidateByPreset.get(card.presetId);
      const history = candidate ? (dailyByCandidate.get(candidate.id) ?? []).sort((left, right) => left.tradingDate.localeCompare(right.tradingDate)).slice(-30).map(row => ({ tradingDate: row.tradingDate, netReturnPercent: Number(row.netReturnPercent), winRate: Number(row.winRate), tradeCount: row.tradeCount })) : [];
      return { presetId: card.presetId, name: card.name, history };
    }).filter(card => card.history.length > 0);
    return { summary: { collectedCount: cards.length, cumulativeReturnPercent, averageWinRate, battleCount: cards.reduce((total, card) => total + card.validationTradeCount, 0) }, cards: cards.sort((a, b) => b.validationReturnPercent - a.validationReturnPercent), trend, cardPeriodPerformance, symbolPerformance, arenas };
  }),

  listComments: publicProcedure.input(z.object({ cardId: z.number().int().positive() })).query(async ({ input }) => {
    const db = await requireDb();
    const comments = await db.select().from(publicStrategyCardComments).where(eq(publicStrategyCardComments.cardId, input.cardId)).orderBy(desc(publicStrategyCardComments.createdAt)).limit(50);
    const commenters = comments.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, comments.map(comment => comment.userId))) : [];
    const names = new Map(commenters.map(user => [user.id, user.name || "익명 연구자"]));
    return comments.map(comment => ({ ...comment, userName: names.get(comment.userId) ?? "익명 연구자" }));
  }),

  addComment: protectedProcedure.input(z.object({ cardId: z.number().int().positive(), body: z.string().trim().min(1, "댓글 내용을 입력하세요.").max(800, "댓글은 800자까지 입력할 수 있습니다.") })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const card = (await db.select({ id: publicStrategyCards.id }).from(publicStrategyCards).where(and(eq(publicStrategyCards.id, input.cardId), eq(publicStrategyCards.visibility, "public"))).limit(1))[0];
    if (!card) throw new Error("공개된 전략 카드를 찾을 수 없습니다.");
    const [created] = await db.insert(publicStrategyCardComments).values({ cardId: card.id, userId: ctx.user.id, body: input.body }).returning();
    return { commentId: created.id };
  }),

  toggleFavorite: protectedProcedure.input(z.object({ cardId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const card = (await db.select({ id: publicStrategyCards.id }).from(publicStrategyCards).where(and(eq(publicStrategyCards.id, input.cardId), eq(publicStrategyCards.visibility, "public"))).limit(1))[0];
    if (!card) throw new Error("공개된 전략 카드를 찾을 수 없습니다.");
    const existing = (await db.select().from(publicStrategyCardFavorites).where(and(eq(publicStrategyCardFavorites.cardId, card.id), eq(publicStrategyCardFavorites.userId, ctx.user.id))).limit(1))[0];
    if (existing) await db.delete(publicStrategyCardFavorites).where(eq(publicStrategyCardFavorites.id, existing.id));
    else await db.insert(publicStrategyCardFavorites).values({ cardId: card.id, userId: ctx.user.id });
    const count = (await db.select().from(publicStrategyCardFavorites).where(eq(publicStrategyCardFavorites.cardId, card.id))).length;
    return { favorited: !existing, favoriteCount: count };
  }),

  listHeroConditions: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const snapshots = await db.select().from(htsConditionSnapshots).where(eq(htsConditionSnapshots.userId, ctx.user.id)).orderBy(desc(htsConditionSnapshots.capturedAt)).limit(100);
    const latest = new Map<string, typeof snapshots[number]>();
    for (const snapshot of snapshots) if (!latest.has(snapshot.conditionSequence)) latest.set(snapshot.conditionSequence, snapshot);
    return Array.from(latest.values()).map(snapshot => ({ id: snapshot.id, conditionSequence: snapshot.conditionSequence, conditionName: snapshot.conditionName, capturedAt: snapshot.capturedAt, candidateCount: Array.isArray(snapshot.candidatesJson) ? snapshot.candidatesJson.length : 0, historicalBacktestEligible: false as const }));
  }),

  collectHeroCondition: protectedProcedure.input(z.object({ snapshotId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const snapshot = (await db.select().from(htsConditionSnapshots).where(and(eq(htsConditionSnapshots.id, input.snapshotId), eq(htsConditionSnapshots.userId, ctx.user.id))).limit(1))[0];
    if (!snapshot) throw new Error("동기화된 영웅문 조건검색식 스냅샷을 찾을 수 없습니다.");
    const [preset] = await db.insert(strategyPresets).values({
      userId: ctx.user.id,
      name: `영웅문 연동 · ${snapshot.conditionName}`,
      description: `영웅문 조건식 #${snapshot.conditionSequence}의 현재 후보 스냅샷 연동 카드. 내부 수식은 API로 역직렬화되지 않아 과거 백테스트에는 사용하지 않습니다.`,
      rulesJson: [{ id: `hero-${snapshot.id}`, type: "linked_hero_condition", conditionSequence: snapshot.conditionSequence, conditionName: snapshot.conditionName, snapshotId: snapshot.id }],
      scoringJson: { source: "linked_hero_condition", snapshotId: snapshot.id, capturedAt: snapshot.capturedAt, historicalBacktestEligible: false },
      isActive: false,
    }).returning();
    return { presetId: preset.id, conditionSequence: snapshot.conditionSequence, conditionName: snapshot.conditionName, historicalBacktestEligible: false as const };
  }),

  listPublic: publicProcedure.input(z.object({ limit: z.number().int().min(1).max(100).default(24) }).optional()).query(async ({ input, ctx }) => {
    const db = await requireDb();
    const cards = await db.select().from(publicStrategyCards).where(eq(publicStrategyCards.visibility, "public")).orderBy(desc(publicStrategyCards.publishedAt)).limit(input?.limit ?? 24);
    const creators = cards.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, cards.map(card => card.creatorUserId))) : [];
    const creatorName = new Map(creators.map(user => [user.id, user.name || "익명 연구자"]));
    const cardIds = cards.map(card => card.id);
    const comments = cardIds.length ? await db.select().from(publicStrategyCardComments).where(inArray(publicStrategyCardComments.cardId, cardIds)).limit(10_000) : [];
    const favorites = cardIds.length ? await db.select().from(publicStrategyCardFavorites).where(inArray(publicStrategyCardFavorites.cardId, cardIds)).limit(10_000) : [];
    const commentCount = new Map<number, number>();
    const favoriteCount = new Map<number, number>();
    for (const comment of comments) commentCount.set(comment.cardId, (commentCount.get(comment.cardId) ?? 0) + 1);
    for (const favorite of favorites) favoriteCount.set(favorite.cardId, (favoriteCount.get(favorite.cardId) ?? 0) + 1);
    const myFavoriteIds = new Set(favorites.filter(favorite => favorite.userId === ctx.user?.id).map(favorite => favorite.cardId));
    return cards.map(card => ({ ...card, creatorName: creatorName.get(card.creatorUserId) ?? "익명 연구자", commentCount: commentCount.get(card.id) ?? 0, favoriteCount: favoriteCount.get(card.id) ?? 0, favoritedByCurrentUser: myFavoriteIds.has(card.id) }));
  }),

  publish: protectedProcedure.input(z.object({ candidateId: z.number().int().positive(), title: z.string().trim().min(2).max(120).optional() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const candidate = (await db.select().from(minuteResearchCandidates).where(eq(minuteResearchCandidates.id, input.candidateId)).limit(1))[0];
    if (!candidate || candidate.status !== "promoted") throw new Error("독립 검증을 통과한 전략 카드만 공개할 수 있습니다.");
    const sweep = (await db.select().from(minuteResearchSweeps).where(eq(minuteResearchSweeps.id, candidate.sweepId)).limit(1))[0];
    const program = sweep ? (await db.select().from(minuteResearchPrograms).where(and(eq(minuteResearchPrograms.id, sweep.programId), eq(minuteResearchPrograms.userId, ctx.user.id))).limit(1))[0] : null;
    if (!sweep || !program) throw new Error("본인이 생성한 아레나 카드만 공개할 수 있습니다.");
    const repeats = await db.select().from(minuteResearchCandidates).where(and(eq(minuteResearchCandidates.strategyFingerprint, candidate.strategyFingerprint), eq(minuteResearchCandidates.status, "promoted"))).orderBy(desc(minuteResearchCandidates.createdAt)).limit(100);
    const repeatedOutOfSample = repeats.map(row => Number(row.validationReturnPercent)).filter(Number.isFinite);
    const values = {
      creatorUserId: ctx.user.id,
      sourceCandidateId: candidate.id,
      sourceSweepId: sweep.id,
      strategyFingerprint: candidate.strategyFingerprint,
      version: 1,
      parentCardId: null,
      title: input.title ?? cardTitle(candidate.strategyFingerprint),
      rootGenomeJson: candidate.rootGenomeJson,
      minimumScore: candidate.minimumScore,
      datasetFingerprint: sweep.datasetFingerprint,
      arenaEvidenceJson: { sweepId: sweep.id, runKey: sweep.runKey, tradingDates: sweep.tradingDatesJson, configuration: sweep.configurationJson },
      validationEvidenceJson: { status: candidate.status, inSample: candidate.inSampleMetricsJson, outOfSample: candidate.outOfSampleMetricsJson, qualification: candidate.qualificationJson, validationTrades: candidate.validationTradeCount, validationReturnPercent: candidate.validationReturnPercent, validationMaxDrawdownPercent: candidate.validationMaxDrawdownPercent, walkForward: { method: "rolling_arena_out_of_sample", verificationCount: repeats.length, averageReturnPercent: repeatedOutOfSample.length ? repeatedOutOfSample.reduce((total, value) => total + value, 0) / repeatedOutOfSample.length : 0, worstReturnPercent: repeatedOutOfSample.length ? Math.min(...repeatedOutOfSample) : 0 } },
      visibility: "public" as const,
    };
    const original = (await db.select().from(publicStrategyCards).where(and(eq(publicStrategyCards.sourceCandidateId, candidate.id), isNull(publicStrategyCards.parentCardId))).limit(1))[0];
    if (original) await db.update(publicStrategyCards).set({ title: values.title, rootGenomeJson: values.rootGenomeJson, minimumScore: values.minimumScore, datasetFingerprint: values.datasetFingerprint, arenaEvidenceJson: values.arenaEvidenceJson, validationEvidenceJson: values.validationEvidenceJson, visibility: "public" }).where(eq(publicStrategyCards.id, original.id));
    else await db.insert(publicStrategyCards).values(values);
    const card = original ?? (await db.select().from(publicStrategyCards).where(and(eq(publicStrategyCards.sourceCandidateId, candidate.id), isNull(publicStrategyCards.parentCardId))).limit(1))[0];
    return { cardId: card!.id, title: card!.title, strategyFingerprint: card!.strategyFingerprint };
  }),

  fork: protectedProcedure.input(z.object({ cardId: z.number().int().positive(), title: z.string().trim().min(2).max(120).optional() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const parent = (await db.select().from(publicStrategyCards).where(and(eq(publicStrategyCards.id, input.cardId), eq(publicStrategyCards.visibility, "public"))).limit(1))[0];
    if (!parent) throw new Error("공개된 전략 카드를 찾을 수 없습니다.");
    const latestChild = (await db.select().from(publicStrategyCards).where(eq(publicStrategyCards.parentCardId, parent.id)).orderBy(desc(publicStrategyCards.version)).limit(1))[0];
    const version = Math.max(parent.version, latestChild?.version ?? 0) + 1;
    const title = input.title ?? `${parent.title} · 포크 v${version}`;
    const [created] = await db.insert(publicStrategyCards).values({
      creatorUserId: ctx.user.id,
      sourceCandidateId: parent.sourceCandidateId,
      sourceSweepId: parent.sourceSweepId,
      strategyFingerprint: parent.strategyFingerprint,
      version,
      parentCardId: parent.id,
      title,
      rootGenomeJson: parent.rootGenomeJson,
      minimumScore: parent.minimumScore,
      datasetFingerprint: parent.datasetFingerprint,
      arenaEvidenceJson: parent.arenaEvidenceJson,
      validationEvidenceJson: parent.validationEvidenceJson,
      visibility: "public",
    }).returning();
    return { cardId: created.id, parentCardId: parent.id, version, title };
  }),

  collect: protectedProcedure.input(z.object({ cardId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const card = (await db.select().from(publicStrategyCards).where(and(eq(publicStrategyCards.id, input.cardId), eq(publicStrategyCards.visibility, "public"))).limit(1))[0];
    if (!card) throw new Error("공개된 전략 카드를 찾을 수 없습니다.");
    const existing = (await db.select().from(publicStrategyCardCollections).where(and(eq(publicStrategyCardCollections.cardId, card.id), eq(publicStrategyCardCollections.userId, ctx.user.id))).limit(1))[0];
    if (existing) return { collected: false, presetId: existing.presetId };
    const [preset] = await db.insert(strategyPresets).values({ userId: ctx.user.id, name: `${card.title} · 내 컬렉션`, description: `공개 카드 ${card.strategyFingerprint.slice(0, 12)}을(를) 내 연구소로 수집한 사본`, rulesJson: flattenRules(card.rootGenomeJson), scoringJson: card.rootGenomeJson, isActive: false }).returning();
    await db.insert(publicStrategyCardCollections).values({ cardId: card.id, userId: ctx.user.id, presetId: preset.id });
    return { collected: true, presetId: preset.id };
  }),
});
