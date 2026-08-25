import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { researchCommitteeReports, researchGovernanceCycles } from "../../drizzle/schema";
import { getDb } from "../db";
import { invokeLLM, listLLMModels } from "../_core/llm";
import { RESEARCH_COMMITTEE_ROLES } from "./researchCommittee";
import { materializeResearchRevalidationJobs, type ResearchRevalidationPriority } from "./researchRevalidation";

export const RESEARCH_GOVERNANCE_POLICY_VERSION = "research-governance-v1";
const inFlightGovernanceCycles = new Map<number, Promise<void>>();

type Verdict = "research_candidate_only" | "requires_more_validation" | "insufficient_evidence";
type ManagerPriority = {
  id: string;
  ownerRole: (typeof RESEARCH_COMMITTEE_ROLES)[number]["id"];
  title: string;
  rationale: string;
  acceptanceCriteria: string;
  evidenceKeys: string[];
  action: "queue_research" | "block_promotion" | "observe_only";
};
type ManagerDirective = {
  missionStatus: Verdict;
  summary: string;
  priorities: ManagerPriority[];
  promotionGate: { permitResearchPromotion: boolean; reason: string; blockers: string[] };
  boundaries: string[];
};
type LeaderFollowUp = {
  roleId: (typeof RESEARCH_COMMITTEE_ROLES)[number]["id"];
  roleTitle: string;
  acknowledgement: string;
  executionPlan: string[];
  evidenceKeys: string[];
  stopConditions: string[];
  challengeToManager: string;
};

function revalidationPriorities(value: unknown): ResearchRevalidationPriority[] {
  const directive = value as { final?: { priorities?: unknown } } | null;
  const priorities = directive?.final?.priorities;
  if (!Array.isArray(priorities)) return [];
  return priorities.flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const priority = item as Record<string, unknown>;
    if (typeof priority.id !== "string" || typeof priority.ownerRole !== "string" || typeof priority.title !== "string" || typeof priority.rationale !== "string" || typeof priority.acceptanceCriteria !== "string") return [];
    const action = priority.action === "block_promotion" || priority.action === "observe_only" ? priority.action : "queue_research";
    return [{ id: priority.id, ownerRole: priority.ownerRole, title: priority.title, rationale: priority.rationale, acceptanceCriteria: priority.acceptanceCriteria, action }];
  });
}

const managerDirectiveSchema = {
  name: "research_governance_manager_directive",
  strict: true,
  schema: {
    type: "object",
    properties: {
      missionStatus: { type: "string", enum: ["research_candidate_only", "requires_more_validation", "insufficient_evidence"] },
      summary: { type: "string" },
      priorities: { type: "array", items: { type: "object", properties: { id: { type: "string" }, ownerRole: { type: "string", enum: RESEARCH_COMMITTEE_ROLES.map(role => role.id) }, title: { type: "string" }, rationale: { type: "string" }, acceptanceCriteria: { type: "string" }, evidenceKeys: { type: "array", items: { type: "string" } }, action: { type: "string", enum: ["queue_research", "block_promotion", "observe_only"] } }, required: ["id", "ownerRole", "title", "rationale", "acceptanceCriteria", "evidenceKeys", "action"], additionalProperties: false } },
      promotionGate: { type: "object", properties: { permitResearchPromotion: { type: "boolean" }, reason: { type: "string" }, blockers: { type: "array", items: { type: "string" } } }, required: ["permitResearchPromotion", "reason", "blockers"], additionalProperties: false },
      boundaries: { type: "array", items: { type: "string" } },
    },
    required: ["missionStatus", "summary", "priorities", "promotionGate", "boundaries"],
    additionalProperties: false,
  },
};

const leaderFollowUpSchema = {
  name: "research_governance_leader_follow_up",
  strict: true,
  schema: {
    type: "object",
    properties: {
      acknowledgement: { type: "string" },
      executionPlan: { type: "array", items: { type: "string" } },
      evidenceKeys: { type: "array", items: { type: "string" } },
      stopConditions: { type: "array", items: { type: "string" } },
      challengeToManager: { type: "string" },
    },
    required: ["acknowledgement", "executionPlan", "evidenceKeys", "stopConditions", "challengeToManager"],
    additionalProperties: false,
  },
};

function stringifyContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.filter((item): item is { type: "text"; text: string } => Boolean(item && typeof item === "object" && (item as { type?: unknown }).type === "text" && typeof (item as { text?: unknown }).text === "string")).map(item => item.text).join("\n");
}

function parseJson(content: unknown, label: string) {
  const text = stringifyContent(content).trim();
  if (!text) throw new Error(`${label} 모델 응답이 비어 있습니다.`);
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(`${label} 모델 응답을 JSON으로 해석하지 못했습니다: ${error instanceof Error ? error.message : "알 수 없는 형식"}`);
  }
}

function isRecoverableFormatError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return message.includes("모델 응답이 비어") || message.includes("JSON으로 해석하지 못했습니다") || message.includes("Unexpected end") || message.includes("Unterminated string");
}

const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

async function selectGovernanceModel() {
  const catalog = await listLLMModels();
  const ids = catalog.data.map(item => item.id);
  return ids.find(id => id === "gpt-5-mini") ?? ids.find(id => id.startsWith("gpt-5")) ?? ids[0] ?? "";
}

function buildCycleSource(report: typeof researchCommitteeReports.$inferSelect) {
  const evidence = report.evidenceJson as { provenance?: Record<string, unknown>; assumptions?: Record<string, unknown> } | null;
  const deliberation = report.deliberationJson as Record<string, unknown> | null;
  const rawReviews = Array.isArray(report.memberReviewsJson) ? report.memberReviewsJson : [];
  const reviews = rawReviews.flatMap(review => {
    if (!review || typeof review !== "object") return [];
    const item = review as Record<string, unknown>;
    return [{
      roleId: typeof item.roleId === "string" ? item.roleId : "unknown",
      roleTitle: typeof item.roleTitle === "string" ? item.roleTitle : "위원",
      stance: typeof item.stance === "string" ? item.stance : "insufficient_evidence",
      summary: typeof item.summary === "string" ? item.summary : "요약 없음",
      challengePoints: Array.isArray(item.challengePoints) ? item.challengePoints.filter((value): value is string => typeof value === "string").slice(0, 2) : [],
      requiredValidation: Array.isArray(item.requiredValidation) ? item.requiredValidation.filter((value): value is string => typeof value === "string").slice(0, 2) : [],
    }];
  });
  if (!evidence?.provenance || !deliberation) throw new Error("완료된 실제 데이터 연구위원회 보고서만 자율 개선 사이클에 사용할 수 있습니다.");
  if (evidence.provenance.evidenceType !== "stored_kiwoom_adjusted_daily_bars_only") throw new Error("실제 저장 일봉 근거가 아닌 위원회 보고서는 자율 개선에 사용할 수 없습니다.");
  return { committeeReportId: report.id, runId: report.runId, evidenceFingerprint: report.evidenceFingerprint, provenance: evidence.provenance, assumptions: evidence.assumptions ?? {}, deliberation, memberReviews: reviews };
}

async function requestManagerDirective(model: string, source: ReturnType<typeof buildCycleSource>, followUps?: LeaderFollowUp[]): Promise<ManagerDirective> {
  const phase = followUps ? "팀장 후속 검토를 반영한 최종 지시" : "초기 개선 지시";
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await invokeLLM({
        model,
        maxTokens: 3600,
        messages: [
          { role: "system", content: "당신은 실제 데이터 조건식 검증 서비스의 부장 AI입니다. 저장된 실제 일봉 근거와 위원회 기록만 사용하십시오. 코드 변경, 주문 실행, 종목·매수·매도 추천을 지시하지 마십시오. 오직 재현 가능한 연구 과제·검증 우선순위·수용 기준·중단 기준을 정합니다. 불충분한 근거에서는 실전 승격을 차단하고, 각 배열은 핵심 3개 이내의 한국어 JSON으로 반환하십시오." },
          { role: "user", content: `${phase}\n\nSOURCE JSON:\n${JSON.stringify(source)}\n\nLEADER FOLLOW-UPS:\n${JSON.stringify(followUps ?? [])}` },
        ],
        outputSchema: managerDirectiveSchema,
      });
      return parseJson(response.choices[0]?.message.content ?? "", "부장 AI") as ManagerDirective;
    } catch (error) {
      lastError = error;
      if (!isRecoverableFormatError(error) || attempt === 1) break;
      await pause(700);
    }
  }
  throw lastError;
}

async function requestLeaderFollowUp(role: (typeof RESEARCH_COMMITTEE_ROLES)[number], model: string, source: ReturnType<typeof buildCycleSource>, directive: ManagerDirective): Promise<LeaderFollowUp> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await invokeLLM({
        model,
        maxTokens: 2600,
        messages: [
          { role: "system", content: "당신은 실제 데이터 조건식 검증 서비스의 전문 팀장 AI입니다. 입력된 실제 데이터 근거와 부장 지시만 검토하십시오. 시장 데이터·성과·원인을 만들어 내지 말고, 주문·종목·매수·매도 추천을 하지 마십시오. 수용 기준이 재현 가능하지 않거나 근거가 부족하면 중단 조건과 반박을 남기십시오. 각 배열은 핵심 3개 이내의 짧은 한국어 JSON으로 반환하십시오." },
          { role: "user", content: `팀장 역할: ${role.title}\n책임: ${role.mandate}\n\nSOURCE JSON:\n${JSON.stringify(source)}\n\nMANAGER DIRECTIVE:\n${JSON.stringify(directive)}` },
        ],
        outputSchema: leaderFollowUpSchema,
      });
      const parsed = parseJson(response.choices[0]?.message.content ?? "", role.title) as Omit<LeaderFollowUp, "roleId" | "roleTitle">;
      return { ...parsed, roleId: role.id, roleTitle: role.title };
    } catch (error) {
      lastError = error;
      if (!isRecoverableFormatError(error) || attempt === 1) break;
      await pause(700);
    }
  }
  throw lastError;
}

export async function getLatestResearchGovernanceCycle() {
  const db = await getDb();
  if (!db) return null;
  const cycle = (await db.select().from(researchGovernanceCycles).orderBy(desc(researchGovernanceCycles.updatedAt)).limit(1))[0] ?? null;
  if (cycle?.status === "completed") {
    const priorities = revalidationPriorities(cycle.managerDirectiveJson);
    if (priorities.length) await materializeResearchRevalidationJobs({ governanceCycleId: cycle.id, sourceRunId: cycle.runId, evidenceFingerprint: cycle.evidenceFingerprint, priorities });
  }
  return cycle;
}

async function prepareGovernanceCycle() {
  const db = await getDb();
  if (!db) throw new Error("연구 데이터베이스에 연결할 수 없습니다.");
  const report = (await db.select().from(researchCommitteeReports).where(eq(researchCommitteeReports.status, "completed")).orderBy(desc(researchCommitteeReports.updatedAt)).limit(1))[0];
  if (!report) return { skipped: "completed-committee-report-not-found" as const };
  const source = buildCycleSource(report);
  const cycleFingerprint = createHash("sha256").update(JSON.stringify({ policy: RESEARCH_GOVERNANCE_POLICY_VERSION, reportId: report.id, evidenceFingerprint: source.evidenceFingerprint })).digest("hex");
  const existing = (await db.select().from(researchGovernanceCycles).where(eq(researchGovernanceCycles.cycleFingerprint, cycleFingerprint)).limit(1))[0];
  if (existing?.status === "completed" || existing?.status === "running") return { cycle: existing, reused: true as const };
  const model = await selectGovernanceModel();
  if (!model) throw new Error("자율 연구 거버넌스에 사용할 모델을 찾지 못했습니다.");
  let cycleId: number;
  if (existing) {
    cycleId = existing.id;
    await db.update(researchGovernanceCycles).set({ status: "running", managerModel: model, sourceSummaryJson: source, managerDirectiveJson: null, leaderFollowUpsJson: null, lastError: null, startedAt: new Date(), completedAt: null }).where(eq(researchGovernanceCycles.id, cycleId));
  } else {
    const inserted = await db.insert(researchGovernanceCycles).values({ runId: source.runId, committeeReportId: report.id, evidenceFingerprint: source.evidenceFingerprint, cycleFingerprint, policyVersion: RESEARCH_GOVERNANCE_POLICY_VERSION, managerModel: model, sourceSummaryJson: source }).returning({ id: researchGovernanceCycles.id });
    cycleId = inserted[0].id;
  }
  const cycle = (await db.select().from(researchGovernanceCycles).where(eq(researchGovernanceCycles.id, cycleId)).limit(1))[0];
  if (!cycle) throw new Error("자율 개선 실행 기록을 만들지 못했습니다.");
  return { cycle, reused: false as const, job: { db, cycleId, model, source } };
}

async function completeGovernanceCycle(job: { db: NonNullable<Awaited<ReturnType<typeof getDb>>>; cycleId: number; model: string; source: ReturnType<typeof buildCycleSource> }) {
  try {
    const initial = await requestManagerDirective(job.model, job.source);
    const relevantRoles = RESEARCH_COMMITTEE_ROLES.filter(role => initial.priorities.some(priority => priority.ownerRole === role.id));
    const roles = relevantRoles.length ? relevantRoles : RESEARCH_COMMITTEE_ROLES;
    const followUps: LeaderFollowUp[] = [];
    for (let index = 0; index < roles.length; index += 2) followUps.push(...await Promise.all(roles.slice(index, index + 2).map(role => requestLeaderFollowUp(role, job.model, job.source, initial))));
    const final = await requestManagerDirective(job.model, job.source, followUps);
    await job.db.update(researchGovernanceCycles).set({ status: "completed", managerDirectiveJson: { initial, final }, leaderFollowUpsJson: followUps, completedAt: new Date(), lastError: null }).where(eq(researchGovernanceCycles.id, job.cycleId));
    await materializeResearchRevalidationJobs({ governanceCycleId: job.cycleId, sourceRunId: job.source.runId, evidenceFingerprint: job.source.evidenceFingerprint, priorities: final.priorities });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "자율 연구 거버넌스 사이클을 완료하지 못했습니다.";
    await job.db.update(researchGovernanceCycles).set({ status: "failed", lastError: message, completedAt: new Date() }).where(eq(researchGovernanceCycles.id, job.cycleId));
  }
}

export async function runResearchGovernanceCycle() {
  const prepared = await prepareGovernanceCycle();
  if ("skipped" in prepared) return prepared;
  if (prepared.reused || !("job" in prepared) || !prepared.job) return { cycle: prepared.cycle, reused: true as const };
  if (inFlightGovernanceCycles.has(prepared.cycle.id)) return { cycle: prepared.cycle, reused: true as const };
  const task = completeGovernanceCycle(prepared.job).finally(() => inFlightGovernanceCycles.delete(prepared.cycle.id));
  inFlightGovernanceCycles.set(prepared.cycle.id, task);
  return { cycle: prepared.cycle, reused: false as const };
}
