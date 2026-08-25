import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { ConditionExpressionGroup, ConditionRule } from "../../shared/trading";
import { autonomousResearchBars, autonomousResearchCandidates, autonomousResearchRuns, researchCommitteeReports } from "../../drizzle/schema";
import { getDb } from "../db";
import { invokeLLM, listLLMModels } from "../_core/llm";
import { AUTONOMOUS_RESEARCH_POLICY } from "./autonomousResearch";
import { buildHistoricalResearchInsights } from "./historicalResearchInsights";

export const RESEARCH_COMMITTEE_POLICY_VERSION = "research-committee-v1";
const inFlightCommitteeRuns = new Map<number, Promise<void>>();

type CommitteeRole = {
  id: "data_quality" | "signal_structure" | "independent_validation" | "exit_rules" | "risk" | "execution_feasibility";
  title: string;
  mandate: string;
};

export const RESEARCH_COMMITTEE_ROLES: CommitteeRole[] = [
  { id: "data_quality", title: "데이터 품질 위원", mandate: "저장 일봉의 출처, 기간·유니버스 범위, 연속성, 조정 기준, 생존편향과 표본 대표성의 한계를 점검합니다." },
  { id: "signal_structure", title: "신호 구조 위원", mandate: "상위 후보의 공통 규칙과 규칙 복잡도를 검토하고, 중복 신호·다중검정·과최적화 가능성을 반박 관점에서 점검합니다." },
  { id: "independent_validation", title: "독립 검증 위원", mandate: "인샘플과 독립 OOS·워크포워드의 차이, 양(+) 비율, 표본 수, 국면 의존성을 확인합니다." },
  { id: "exit_rules", title: "청산 규칙 위원", mandate: "익절·손절 도달 비율, 평균 보유기간, 기대값, Profit Factor, 국면별 청산 견고성을 비교합니다." },
  { id: "risk", title: "위험 위원", mandate: "MDD, 수익/낙폭 비율, 손절 비율, 손실 집중 가능성과 자본배분 미반영 위험을 검토합니다." },
  { id: "execution_feasibility", title: "실행 가능성 위원", mandate: "다음 봉 체결, 일봉 장중 순서 미관측, 슬리피지·세금·동시 보유 미반영 등 현실 체결 한계를 점검합니다." },
];

type DailyBar = { date: string; open: number; high: number; low: number; close: number; volume: number; turnover: number };
type CandidateMetrics = { totalReturn?: number | null; maxDrawdown?: number | null; tradeCount?: number | null; winRate?: number | null };

type CommitteeReview = {
  roleId: CommitteeRole["id"];
  roleTitle: string;
  summary: string;
  stance: "research_candidate_only" | "requires_more_validation" | "insufficient_evidence";
  supportingEvidence: string[];
  riskFlags: Array<{ id: string; severity: "high" | "medium" | "low"; statement: string; evidenceKeys: string[] }>;
  challengePoints: string[];
  requiredValidation: string[];
  confidence: "high" | "medium" | "low";
};

type CommitteeDeliberation = {
  verdict: "research_candidate_only" | "requires_more_validation" | "insufficient_evidence";
  executiveSummary: string;
  agreements: string[];
  disagreements: Array<{ topic: string; positions: string[]; evidenceKeys: string[] }>;
  nextValidations: Array<{ id: string; title: string; purpose: string; acceptanceCriteria: string; evidenceKeys: string[] }>;
  implementationPriorities: string[];
  boundaries: string[];
  confidence: "high" | "medium" | "low";
};

function isGroup(node: unknown): node is ConditionExpressionGroup {
  return Boolean(node && typeof node === "object" && "children" in node && Array.isArray((node as { children?: unknown }).children));
}

function collectRules(node: unknown): ConditionRule[] {
  if (!node || typeof node !== "object") return [];
  if (isGroup(node)) return node.children.flatMap(child => collectRules(child));
  return "type" in node ? [node as ConditionRule] : [];
}

function numberFromMetrics(raw: unknown, key: keyof CandidateMetrics): number | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const direct = record[key];
  if (typeof direct === "number" && Number.isFinite(direct)) return direct;
  if (typeof direct === "string" && Number.isFinite(Number(direct))) return Number(direct);
  if (record.metrics && typeof record.metrics === "object") return numberFromMetrics(record.metrics, key);
  return null;
}

function stringifyContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part): part is { type: "text"; text: string } => Boolean(part && typeof part === "object" && (part as { type?: unknown }).type === "text" && typeof (part as { text?: unknown }).text === "string"))
    .map(part => part.text)
    .join("\n");
}

function parseStructuredJson(content: unknown, context: string): unknown {
  const text = stringifyContent(content).trim();
  if (!text) throw new Error(`${context} 모델 응답이 비어 있습니다.`);
  try {
    return JSON.parse(text);
  } catch (error) {
    const object = text.match(/\{[\s\S]*\}/)?.[0];
    if (object) {
      try {
        return JSON.parse(object);
      } catch {
        // Preserve the more useful context-rich error below.
      }
    }
    throw new Error(`${context} 모델 응답을 구조화 JSON으로 해석하지 못했습니다: ${error instanceof Error ? error.message : "알 수 없는 형식"}`);
  }
}

function parseReview(value: string, role: CommitteeRole): CommitteeReview {
  const parsed = parseStructuredJson(value, role.title) as Omit<CommitteeReview, "roleId" | "roleTitle">;
  return { ...parsed, roleId: role.id, roleTitle: role.title };
}

function isRecoverableModelFormatError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return message.includes("Unexpected end of JSON input") || message.includes("모델 응답이 비어") || message.includes("구조화 JSON으로 해석하지 못했습니다");
}

const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

const reviewSchema = {
  name: "research_committee_review",
  strict: true,
  schema: {
    type: "object",
    properties: {
      summary: { type: "string" },
      stance: { type: "string", enum: ["research_candidate_only", "requires_more_validation", "insufficient_evidence"] },
      supportingEvidence: { type: "array", items: { type: "string" } },
      riskFlags: { type: "array", items: { type: "object", properties: { id: { type: "string" }, severity: { type: "string", enum: ["high", "medium", "low"] }, statement: { type: "string" }, evidenceKeys: { type: "array", items: { type: "string" } } }, required: ["id", "severity", "statement", "evidenceKeys"], additionalProperties: false } },
      challengePoints: { type: "array", items: { type: "string" } },
      requiredValidation: { type: "array", items: { type: "string" } },
      confidence: { type: "string", enum: ["high", "medium", "low"] },
    },
    required: ["summary", "stance", "supportingEvidence", "riskFlags", "challengePoints", "requiredValidation", "confidence"],
    additionalProperties: false,
  },
};

const deliberationSchema = {
  name: "research_committee_deliberation",
  strict: true,
  schema: {
    type: "object",
    properties: {
      verdict: { type: "string", enum: ["research_candidate_only", "requires_more_validation", "insufficient_evidence"] },
      executiveSummary: { type: "string" },
      agreements: { type: "array", items: { type: "string" } },
      disagreements: { type: "array", items: { type: "object", properties: { topic: { type: "string" }, positions: { type: "array", items: { type: "string" } }, evidenceKeys: { type: "array", items: { type: "string" } } }, required: ["topic", "positions", "evidenceKeys"], additionalProperties: false } },
      nextValidations: { type: "array", items: { type: "object", properties: { id: { type: "string" }, title: { type: "string" }, purpose: { type: "string" }, acceptanceCriteria: { type: "string" }, evidenceKeys: { type: "array", items: { type: "string" } } }, required: ["id", "title", "purpose", "acceptanceCriteria", "evidenceKeys"], additionalProperties: false } },
      implementationPriorities: { type: "array", items: { type: "string" } },
      boundaries: { type: "array", items: { type: "string" } },
      confidence: { type: "string", enum: ["high", "medium", "low"] },
    },
    required: ["verdict", "executiveSummary", "agreements", "disagreements", "nextValidations", "implementationPriorities", "boundaries", "confidence"],
    additionalProperties: false,
  },
};

export async function getLatestResearchCommitteeReport(runId: number) {
  const db = await getDb();
  if (!db) return null;
  return (await db.select().from(researchCommitteeReports).where(eq(researchCommitteeReports.runId, runId)).orderBy(desc(researchCommitteeReports.updatedAt)).limit(1))[0] ?? null;
}

async function selectCommitteeModel(): Promise<string> {
  const catalog = await listLLMModels();
  const ids = catalog.data.map(item => item.id);
  return ids.find(id => id === "gpt-5-mini") ?? ids.find(id => id.startsWith("gpt-5")) ?? ids[0] ?? "";
}

async function buildEvidence(runId: number) {
  const db = await getDb();
  if (!db) throw new Error("연구 데이터베이스에 연결할 수 없습니다.");
  const run = (await db.select().from(autonomousResearchRuns).where(eq(autonomousResearchRuns.id, runId)).limit(1))[0];
  if (!run || run.dataStatus !== "ready" || !run.runKey.includes(":historical")) throw new Error("완료된 실제 일봉 과거 연구 실행만 위원회 검토에 사용할 수 있습니다.");
  const summary = run.summaryJson as { dataset?: { sourceRunId?: number }; assumptions?: { feeRate?: number; slippageBps?: number; informationCutoffTradingDays?: number; holdingDays?: number }; dataWindow?: { startDate?: string; endDate?: string } } | null;
  const sourceRunId = summary?.dataset?.sourceRunId ?? run.id;
  const [candidateRows, barRows] = await Promise.all([
    db.select().from(autonomousResearchCandidates).where(eq(autonomousResearchCandidates.runId, run.id)).orderBy(desc(autonomousResearchCandidates.fitnessScore)).limit(20),
    db.select().from(autonomousResearchBars).where(eq(autonomousResearchBars.runId, sourceRunId)).orderBy(autonomousResearchBars.symbol, autonomousResearchBars.date),
  ]);
  const survivors = candidateRows.filter(candidate => candidate.status === "survived").slice(0, 6);
  if (!barRows.length || !survivors.length) throw new Error("실제 일봉 또는 생존 조건식이 없어 위원회 검토를 만들 수 없습니다.");
  const barsBySymbol = barRows.reduce<Record<string, DailyBar[]>>((result, row) => {
    (result[row.symbol] ??= []).push({ date: row.date, open: Number(row.open), high: Number(row.high), low: Number(row.low), close: Number(row.close), volume: Number(row.volume), turnover: Number(row.turnover) });
    return result;
  }, {});
  const feeRate = (summary?.assumptions?.feeRate ?? AUTONOMOUS_RESEARCH_POLICY.feeRate) + (summary?.assumptions?.slippageBps ?? AUTONOMOUS_RESEARCH_POLICY.slippageBps) / 10_000;
  const entryDelayDays = summary?.assumptions?.informationCutoffTradingDays ?? AUTONOMOUS_RESEARCH_POLICY.informationCutoffTradingDays;
  const insights = buildHistoricalResearchInsights({ candidates: survivors, barsBySymbol, feeRate, entryDelayDays });
  const evidence = {
    provenance: {
      evidenceType: "stored_kiwoom_adjusted_daily_bars_only",
      historicalRunId: run.id,
      sourceRunId,
      researchRunKey: run.runKey,
      datasetWindow: summary?.dataWindow ?? null,
      barCount: barRows.length,
      symbolCount: Object.keys(barsBySymbol).length,
      firstBarDate: barRows[0]?.date ?? null,
      lastBarDate: barRows.at(-1)?.date ?? null,
      generatedAt: new Date().toISOString(),
    },
    assumptions: {
      adjustedPrices: true,
      feeRate,
      entryDelayDays,
      baseHoldingDays: summary?.assumptions?.holdingDays ?? AUTONOMOUS_RESEARCH_POLICY.holdingDays,
      dailyBarAmbiguityRule: insights.methodology.conservativeDailyBarRule,
      excluded: ["example_data", "synthetic_data", "live_orders", "account_data", "unrecorded_intraday_sequence"],
    },
    survivorCandidates: survivors.map(candidate => ({
      id: candidate.id,
      fingerprint: candidate.fingerprint,
      fitnessScore: Number(candidate.fitnessScore ?? 0),
      minimumScore: candidate.minimumScore,
      ruleTypes: Array.from(new Set(collectRules(candidate.rootGenomeJson).filter(rule => rule.enabled).map(rule => rule.type))).sort(),
      ruleCount: collectRules(candidate.rootGenomeJson).filter(rule => rule.enabled).length,
      inSample: { totalReturn: numberFromMetrics(candidate.inSampleMetricsJson, "totalReturn"), maxDrawdown: numberFromMetrics(candidate.inSampleMetricsJson, "maxDrawdown"), tradeCount: numberFromMetrics(candidate.inSampleMetricsJson, "tradeCount"), winRate: numberFromMetrics(candidate.inSampleMetricsJson, "winRate") },
      outOfSample: { totalReturn: numberFromMetrics(candidate.outOfSampleMetricsJson, "totalReturn"), maxDrawdown: numberFromMetrics(candidate.outOfSampleMetricsJson, "maxDrawdown"), tradeCount: numberFromMetrics(candidate.outOfSampleMetricsJson, "tradeCount"), winRate: numberFromMetrics(candidate.outOfSampleMetricsJson, "winRate") },
      walkForward: { totalReturn: numberFromMetrics(candidate.walkForwardMetricsJson, "totalReturn"), maxDrawdown: numberFromMetrics(candidate.walkForwardMetricsJson, "maxDrawdown"), tradeCount: numberFromMetrics(candidate.walkForwardMetricsJson, "tradeCount"), winRate: numberFromMetrics(candidate.walkForwardMetricsJson, "winRate") },
    })),
    commonRules: insights.commonRules,
    validation: insights.researchQuality,
    exitPolicyResearch: insights.exitPolicies.map(policy => ({ id: policy.id, label: policy.label, metrics: policy.metrics, regimeMetrics: policy.regimeMetrics })),
    methodology: insights.methodology,
  };
  const fingerprintEvidence = {
    ...evidence,
    provenance: {
      ...evidence.provenance,
      // 생성 시각은 감사 정보일 뿐, 같은 고정 원본·가정의 새 지문을 만들면 안 됩니다.
      generatedAt: undefined,
    },
  };
  const evidenceFingerprint = createHash("sha256").update(JSON.stringify({ policy: RESEARCH_COMMITTEE_POLICY_VERSION, evidence: fingerprintEvidence })).digest("hex");
  return { db, run, sourceRunId, evidence, evidenceFingerprint };
}

async function requestRoleReview(role: CommitteeRole, model: string, evidence: unknown): Promise<CommitteeReview> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await invokeLLM({
        model,
        maxTokens: 3200,
        messages: [
          { role: "system", content: "당신은 실제 데이터 기반 조건식 연구위원회 구성원입니다. 제공된 EVIDENCE JSON 외의 숫자·사실·가격을 만들지 마십시오. 매수·매도·종목 추천이나 실거래 지침을 제시하지 마십시오. 누락된 근거는 불충분하다고 명시하고, 근거 키를 정확히 인용하십시오. 각 배열은 핵심 3개 이내로 간결히 작성하고 결과는 연구 품질·추가 검증에만 초점을 둔 한국어 JSON이어야 합니다." },
          { role: "user", content: `위원 역할: ${role.title}\n위원 임무: ${role.mandate}\n\nEVIDENCE JSON:\n${JSON.stringify(evidence)}` },
        ],
        outputSchema: reviewSchema,
      });
      return parseReview(stringifyContent(response.choices[0]?.message.content ?? ""), role);
    } catch (error) {
      lastError = error;
      if (!isRecoverableModelFormatError(error) || attempt === 1) break;
      await pause(500);
    }
  }
  throw lastError;
}

async function requestDeliberation(model: string, evidence: unknown, reviews: CommitteeReview[]): Promise<CommitteeDeliberation> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await invokeLLM({
        model,
        maxTokens: 3600,
        messages: [
          { role: "system", content: "당신은 실제 데이터 기반 조건식 연구위원회의 의장입니다. EVIDENCE와 각 위원 REVIEW만으로 합의를 작성하십시오. 수치·성과·원인을 추정해 만들어 내지 마십시오. 가장 보수적인 반대 의견을 보존하고, 결론은 실거래 승인이나 투자 권고가 아닌 연구 후보의 검증 상태여야 합니다. 각 배열은 핵심 3개 이내로 간결히 작성하고 결과는 한국어 JSON만 반환하십시오." },
          { role: "user", content: `EVIDENCE JSON:\n${JSON.stringify(evidence)}\n\nMEMBER REVIEWS:\n${JSON.stringify(reviews)}` },
        ],
        outputSchema: deliberationSchema,
      });
      return parseStructuredJson(response.choices[0]?.message.content ?? "", "위원회 의장") as CommitteeDeliberation;
    } catch (error) {
      lastError = error;
      if (!isRecoverableModelFormatError(error) || attempt === 1) break;
      await pause(500);
    }
  }
  throw lastError;
}

async function prepareResearchCommitteeRun(runId: number) {
  const { db, run, sourceRunId, evidence, evidenceFingerprint } = await buildEvidence(runId);
  const existing = (await db.select().from(researchCommitteeReports).where(and(eq(researchCommitteeReports.runId, run.id), eq(researchCommitteeReports.evidenceFingerprint, evidenceFingerprint))).limit(1))[0];
  if (existing?.status === "completed" || existing?.status === "running") return { report: existing, reused: true };
  const model = await selectCommitteeModel();
  if (!model) throw new Error("사용 가능한 연구위원회 모델을 찾지 못했습니다.");
  let reportId: number;
  if (existing) {
    reportId = existing.id;
    await db.update(researchCommitteeReports).set({ sourceRunId, policyVersion: RESEARCH_COMMITTEE_POLICY_VERSION, model, status: "running", evidenceJson: evidence, memberReviewsJson: null, deliberationJson: null, lastError: null, startedAt: new Date(), completedAt: null }).where(eq(researchCommitteeReports.id, reportId));
  } else {
    const inserted = await db.insert(researchCommitteeReports).values({ runId: run.id, sourceRunId, evidenceFingerprint, policyVersion: RESEARCH_COMMITTEE_POLICY_VERSION, model, status: "running", evidenceJson: evidence }).returning({ id: researchCommitteeReports.id });
    reportId = inserted[0].id;
  }
  const report = (await db.select().from(researchCommitteeReports).where(eq(researchCommitteeReports.id, reportId)).limit(1))[0];
  if (!report) throw new Error("위원회 실행 기록을 만들지 못했습니다.");
  return { report, reused: false, job: { db, runId: run.id, reportId, model, evidence } };
}

async function completeResearchCommittee(job: { db: NonNullable<Awaited<ReturnType<typeof getDb>>>; runId: number; reportId: number; model: string; evidence: unknown }) {
  try {
    const reviews: CommitteeReview[] = [];
    for (let index = 0; index < RESEARCH_COMMITTEE_ROLES.length; index += 2) {
      const batch = RESEARCH_COMMITTEE_ROLES.slice(index, index + 2);
      reviews.push(...await Promise.all(batch.map(role => requestRoleReview(role, job.model, job.evidence))));
    }
    const deliberation = await requestDeliberation(job.model, job.evidence, reviews);
    await job.db.update(researchCommitteeReports).set({ status: "completed", memberReviewsJson: reviews, deliberationJson: deliberation, completedAt: new Date(), lastError: null }).where(eq(researchCommitteeReports.id, job.reportId));
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "위원회 분석을 완료하지 못했습니다.";
    await job.db.update(researchCommitteeReports).set({ status: "failed", lastError: message, completedAt: new Date() }).where(eq(researchCommitteeReports.id, job.reportId));
    throw error;
  }
}

export async function runResearchCommittee(runId: number) {
  const existing = inFlightCommitteeRuns.get(runId);
  if (existing) return { report: await getLatestResearchCommitteeReport(runId), reused: true };
  const prepared = await prepareResearchCommitteeRun(runId);
  if (prepared.reused || !("job" in prepared)) return { report: prepared.report, reused: true };
  const job = prepared.job;
  if (!job) return { report: prepared.report, reused: true };
  const task = completeResearchCommittee(job).catch(() => undefined).finally(() => inFlightCommitteeRuns.delete(runId));
  inFlightCommitteeRuns.set(runId, task);
  return { report: prepared.report, reused: false };
}
