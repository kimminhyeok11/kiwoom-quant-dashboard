import { createHash } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { autonomousResearchBars, autonomousResearchCandidates, autonomousResearchRuns, researchRevalidationJobs } from "../../drizzle/schema";
import { getDb } from "../db";
import { AUTONOMOUS_RESEARCH_POLICY } from "./autonomousResearch";
import { buildHistoricalResearchInsights } from "./historicalResearchInsights";

export const RESEARCH_REVALIDATION_POLICY_VERSION = "research-revalidation-v1";

export type ResearchRevalidationPriority = {
  id: string;
  ownerRole: string;
  title: string;
  rationale: string;
  acceptanceCriteria: string;
  action: "queue_research" | "block_promotion" | "observe_only";
};

export type ResearchPriorityClassification = {
  scope: "stored_daily_bars" | "external_verification";
  readiness: "ready_for_internal_revalidation" | "requires_user_requested_external_verification" | "observe_only";
  blocker: string | null;
};

const externalEvidencePattern = /틱|분 단위|호가|상장폐지|유니버스 재런|실제 일봉|원자료|외부.*데이터|신규.*데이터/;

export function classifyResearchPriority(priority: ResearchRevalidationPriority): ResearchPriorityClassification {
  if (priority.action !== "queue_research") {
    return { scope: "stored_daily_bars", readiness: "observe_only", blocker: priority.action === "block_promotion" ? "실전 승격은 자동화 범위에서 제외하며, 수용 기준 충족 전까지 차단합니다." : "관찰 과제는 새로운 실제 연구 근거가 도착할 때까지 실행하지 않습니다." };
  }
  if (externalEvidencePattern.test(`${priority.title} ${priority.acceptanceCriteria}`)) {
    return { scope: "external_verification", readiness: "requires_user_requested_external_verification", blocker: "사용자 요청 전에는 키움 OAuth·신규 일봉·외부 연구 노드 검증을 실행하지 않습니다." };
  }
  return { scope: "stored_daily_bars", readiness: "ready_for_internal_revalidation", blocker: null };
}

function fingerprint(input: Record<string, unknown>) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function metricSummary(raw: unknown) {
  const value = raw as { totalReturn?: number; maxDrawdown?: number; tradeCount?: number; winRate?: number; profitFactor?: number; expectancy?: number; returnToDrawdown?: number };
  return {
    totalReturn: Number(value.totalReturn ?? 0),
    maxDrawdown: Number(value.maxDrawdown ?? 0),
    tradeCount: Number(value.tradeCount ?? 0),
    winRate: Number(value.winRate ?? 0),
    profitFactor: Number(value.profitFactor ?? 0),
    expectancy: Number(value.expectancy ?? 0),
    returnToDrawdown: Number(value.returnToDrawdown ?? 0),
  };
}

async function calculateStoredDailyBarRevalidation(input: { sourceRunId: number; evidenceFingerprint: string; priority: ResearchRevalidationPriority }) {
  const db = await getDb();
  if (!db) throw new Error("연구 데이터베이스에 연결할 수 없습니다.");
  const run = (await db.select().from(autonomousResearchRuns).where(eq(autonomousResearchRuns.id, input.sourceRunId)).limit(1))[0];
  if (!run || run.dataStatus !== "ready" || !run.runKey.includes(":historical")) throw new Error("완료된 저장 실제 일봉 과거 연구가 없어 내부 재평가를 실행하지 않습니다.");
  const summary = run.summaryJson as { dataset?: { sourceRunId?: number }; assumptions?: { feeRate?: number; slippageBps?: number; informationCutoffTradingDays?: number } } | null;
  const barRunId = summary?.dataset?.sourceRunId ?? run.id;
  const [candidates, rows] = await Promise.all([
    db.select().from(autonomousResearchCandidates).where(eq(autonomousResearchCandidates.runId, run.id)).orderBy(desc(autonomousResearchCandidates.fitnessScore)).limit(20),
    db.select().from(autonomousResearchBars).where(eq(autonomousResearchBars.runId, barRunId)).orderBy(autonomousResearchBars.symbol, autonomousResearchBars.date),
  ]);
  const survivors = candidates.filter(candidate => candidate.status === "survived");
  if (!rows.length || !survivors.length) throw new Error("저장 실제 일봉 또는 생존 조건식이 부족해 내부 재평가를 실행하지 않습니다.");
  const barsBySymbol = rows.reduce<Record<string, Array<{ date: string; open: number; high: number; low: number; close: number; volume: number; turnover: number }>>>((result, row) => {
    (result[row.symbol] ??= []).push({ date: row.date, open: Number(row.open), high: Number(row.high), low: Number(row.low), close: Number(row.close), volume: Number(row.volume), turnover: Number(row.turnover) });
    return result;
  }, {});
  const insights = buildHistoricalResearchInsights({
    candidates: survivors,
    barsBySymbol,
    feeRate: (summary?.assumptions?.feeRate ?? AUTONOMOUS_RESEARCH_POLICY.feeRate) + (summary?.assumptions?.slippageBps ?? AUTONOMOUS_RESEARCH_POLICY.slippageBps) / 10_000,
    entryDelayDays: summary?.assumptions?.informationCutoffTradingDays ?? AUTONOMOUS_RESEARCH_POLICY.informationCutoffTradingDays,
  });
  return {
    policyVersion: RESEARCH_REVALIDATION_POLICY_VERSION,
    provenance: "stored_kiwoom_adjusted_daily_bars_only",
    evidenceFingerprint: input.evidenceFingerprint,
    priority: { id: input.priority.id, title: input.priority.title, acceptanceCriteria: input.priority.acceptanceCriteria },
    source: { historicalRunId: run.id, barRunId, barCount: rows.length, symbolCount: Object.keys(barsBySymbol).length, survivorCount: survivors.length },
    quality: insights.researchQuality,
    exitPolicyComparison: insights.exitPolicies.map(policy => ({ id: policy.id, label: policy.label, metrics: metricSummary(policy.metrics) })),
    interpretation: "이 결과는 기존 저장 실제 일봉과 동일한 비용·정보절단 가정으로 다시 집계한 내부 연구 기록입니다. 신규 시장 데이터 수집·주문·종목 추천·실전 승격은 수행하지 않습니다.",
    acceptanceAssessment: "수용 기준의 정성·외부 데이터 요구사항은 자동 충족으로 판정하지 않습니다. 내부 재평가 결과는 다음 위원회·거버넌스 검토의 근거로만 보존합니다.",
  };
}

async function createOrReuseJob(input: { governanceCycleId: number; sourceRunId: number; evidenceFingerprint: string; priority: ResearchRevalidationPriority }) {
  const db = await getDb();
  if (!db) throw new Error("연구 데이터베이스에 연결할 수 없습니다.");
  const classification = classifyResearchPriority(input.priority);
  const jobFingerprint = fingerprint({ policy: RESEARCH_REVALIDATION_POLICY_VERSION, evidenceFingerprint: input.evidenceFingerprint, priorityId: input.priority.id, acceptanceCriteria: input.priority.acceptanceCriteria, scope: classification.scope });
  const existing = (await db.select().from(researchRevalidationJobs).where(eq(researchRevalidationJobs.jobFingerprint, jobFingerprint)).limit(1))[0];
  if (existing?.status === "completed" || existing?.status === "blocked" || existing?.status === "running") return existing;
  if (classification.scope === "external_verification") {
    if (existing) await db.update(researchRevalidationJobs).set({ status: "blocked", blocker: classification.blocker, lastError: null, completedAt: new Date() }).where(eq(researchRevalidationJobs.id, existing.id));
    else await db.insert(researchRevalidationJobs).values({ governanceCycleId: input.governanceCycleId, sourceRunId: input.sourceRunId, priorityId: input.priority.id, priorityTitle: input.priority.title, evidenceFingerprint: input.evidenceFingerprint, jobFingerprint, scope: classification.scope, status: "blocked", acceptanceCriteria: input.priority.acceptanceCriteria, blocker: classification.blocker, completedAt: new Date() });
    return (await db.select().from(researchRevalidationJobs).where(eq(researchRevalidationJobs.jobFingerprint, jobFingerprint)).limit(1))[0];
  }
  let jobId = existing?.id;
  if (existing) await db.update(researchRevalidationJobs).set({ status: "running", blocker: null, lastError: null, startedAt: new Date(), completedAt: null }).where(eq(researchRevalidationJobs.id, existing.id));
  else {
    const inserted = await db.insert(researchRevalidationJobs).values({ governanceCycleId: input.governanceCycleId, sourceRunId: input.sourceRunId, priorityId: input.priority.id, priorityTitle: input.priority.title, evidenceFingerprint: input.evidenceFingerprint, jobFingerprint, scope: classification.scope, status: "running", acceptanceCriteria: input.priority.acceptanceCriteria, startedAt: new Date() }).returning({ id: researchRevalidationJobs.id });
    jobId = inserted[0].id;
  }
  if (!jobId) throw new Error("내부 재평가 작업을 만들지 못했습니다.");
  try {
    const result = await calculateStoredDailyBarRevalidation({ sourceRunId: input.sourceRunId, evidenceFingerprint: input.evidenceFingerprint, priority: input.priority });
    await db.update(researchRevalidationJobs).set({ status: "completed", resultJson: result, completedAt: new Date(), lastError: null }).where(eq(researchRevalidationJobs.id, jobId));
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "저장 실제 일봉 내부 재평가에 실패했습니다.";
    await db.update(researchRevalidationJobs).set({ status: "failed", lastError: message, completedAt: new Date() }).where(eq(researchRevalidationJobs.id, jobId));
  }
  return (await db.select().from(researchRevalidationJobs).where(eq(researchRevalidationJobs.id, jobId)).limit(1))[0];
}

export async function materializeResearchRevalidationJobs(input: { governanceCycleId: number; sourceRunId: number; evidenceFingerprint: string; priorities: ResearchRevalidationPriority[] }) {
  const queueable = input.priorities.filter(priority => priority.action === "queue_research");
  return Promise.all(queueable.map(priority => createOrReuseJob({ ...input, priority })));
}

export async function getResearchRevalidationJobs(governanceCycleId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(researchRevalidationJobs).where(eq(researchRevalidationJobs.governanceCycleId, governanceCycleId)).orderBy(desc(researchRevalidationJobs.updatedAt));
}
