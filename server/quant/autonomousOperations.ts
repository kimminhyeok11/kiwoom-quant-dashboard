import { desc, eq, like } from "drizzle-orm";
import { autonomousResearchRuns, researchCommitteeReports, researchGovernanceCycles, researchGovernanceSchedules, researchRevalidationJobs } from "../../drizzle/schema";
import { getDb } from "../db";
import { classifyResearchPriority, type ResearchRevalidationPriority } from "./researchRevalidation";

type Priority = {
  id: string;
  ownerRole: string;
  title: string;
  rationale: string;
  acceptanceCriteria: string;
  action: "queue_research" | "block_promotion" | "observe_only";
  readiness: "ready_for_internal_revalidation" | "requires_user_requested_external_verification" | "observe_only";
  blocker: string | null;
};

function prioritiesFromCycle(cycle: typeof researchGovernanceCycles.$inferSelect | null): Priority[] {
  const directive = cycle?.managerDirectiveJson as { final?: { priorities?: unknown } } | null;
  const priorities = directive?.final?.priorities;
  if (!Array.isArray(priorities)) return [];
  return priorities.flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const value = item as Record<string, unknown>;
    if (typeof value.id !== "string" || typeof value.title !== "string" || typeof value.acceptanceCriteria !== "string") return [];
    const action = value.action === "block_promotion" || value.action === "observe_only" ? value.action : "queue_research";
    const classification = classifyResearchPriority({ id: value.id, ownerRole: typeof value.ownerRole === "string" ? value.ownerRole : "research_manager", title: value.title, rationale: typeof value.rationale === "string" ? value.rationale : "실제 데이터 기반 검증 과제", acceptanceCriteria: value.acceptanceCriteria, action } satisfies ResearchRevalidationPriority);
    return [{
      id: value.id,
      ownerRole: typeof value.ownerRole === "string" ? value.ownerRole : "research_manager",
      title: value.title,
      rationale: typeof value.rationale === "string" ? value.rationale : "실제 데이터 기반 검증 과제",
      acceptanceCriteria: value.acceptanceCriteria,
      action,
      readiness: classification.readiness,
      blocker: classification.blocker,
    }];
  });
}

function safeErrorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message.slice(0, 240) : "알 수 없는 데이터베이스 조회 오류";
}

export async function getAutonomousOperationsStatus() {
  const db = await getDb();
  if (!db) return { status: "database_unavailable" as const, evidence: null, queue: [], boundaries: ["연구 데이터베이스에 연결할 수 없어 자동 개선을 시작하지 않습니다."] };

  const [latestRuns, historicalLookup, latestCommittee, latestCycle, schedule, revalidationRows] = await Promise.all([
    db.select().from(autonomousResearchRuns).orderBy(desc(autonomousResearchRuns.updatedAt)).limit(12),
    db.select().from(autonomousResearchRuns).where(like(autonomousResearchRuns.runKey, "%:historical%")).orderBy(desc(autonomousResearchRuns.updatedAt)).limit(1)
      .then(rows => ({ rows, unavailable: false as const, error: null }))
      .catch(error => {
        const message = safeErrorMessage(error);
        console.warn("[AutonomousOperations] Historical research lookup failed; preserving the remaining dashboard status.", message);
        return { rows: [], unavailable: true as const, error: message };
      }),
    db.select().from(researchCommitteeReports).where(eq(researchCommitteeReports.status, "completed")).orderBy(desc(researchCommitteeReports.updatedAt)).limit(1),
    db.select().from(researchGovernanceCycles).orderBy(desc(researchGovernanceCycles.updatedAt)).limit(1),
    db.select().from(researchGovernanceSchedules).orderBy(desc(researchGovernanceSchedules.updatedAt)).limit(1),
    db.select().from(researchRevalidationJobs).orderBy(desc(researchRevalidationJobs.updatedAt)).limit(12),
  ]);
  const activeRun = latestRuns.find(run => !run.runKey.includes(":historical")) ?? null;
  const historicalRun = historicalLookup.rows[0] ?? null;
  const committee = latestCommittee[0] ?? null;
  const cycle = latestCycle[0] ?? null;
  const governanceSchedule = schedule[0] ?? null;
  const queue = prioritiesFromCycle(cycle);
  const blocked = queue.filter(item => item.action === "block_promotion");
  const revalidations = cycle ? revalidationRows.filter(item => item.governanceCycleId === cycle.id).map(item => ({ id: item.id, priorityId: item.priorityId, priorityTitle: item.priorityTitle, scope: item.scope, status: item.status, blocker: item.blocker, lastError: item.lastError, updatedAt: item.updatedAt, resultJson: item.resultJson })) : [];
  const historicalLookupUnavailable = historicalLookup.unavailable;
  const needsFreshData = !historicalRun && !historicalLookupUnavailable;
  const internalRevalidationRunning = revalidations.some(item => item.scope === "stored_daily_bars" && (item.status === "queued" || item.status === "running"));
  const internalRevalidationCompleted = revalidations.some(item => item.scope === "stored_daily_bars" && item.status === "completed");
  const externalRevalidationBlocked = revalidations.some(item => item.scope === "external_verification" && item.status === "blocked");
  const status = historicalLookupUnavailable
    ? "historical_lookup_unavailable"
    : needsFreshData
      ? "waiting_for_real_data"
    : !committee
      ? "awaiting_committee_review"
      : !cycle || cycle.status === "failed"
        ? "awaiting_governance_review"
        : internalRevalidationRunning
          ? "internal_revalidation_running"
        : blocked.length || externalRevalidationBlocked
          ? "validation_required"
          : internalRevalidationCompleted
            ? "internal_revalidation_completed"
            : "research_cycle_ready";

  const nextAction = historicalLookupUnavailable
    ? { kind: "retry_historical_lookup", automatic: true, title: "저장 실제 일봉 연구 상태를 다시 확인합니다.", reason: "과거 연구 실행 조회가 일시적으로 실패했습니다. 저장 원본·주문·계좌·외부 API 호출 없이 다음 새로고침에서 조회를 다시 시도합니다." }
    : needsFreshData
      ? { kind: "collect_real_daily_bars", automatic: false, title: "인증된 읽기 전용 연구 노드의 실제 일봉 원본을 기다립니다.", reason: `사용자 요청 전 외부 데이터 검증은 보류합니다. ${activeRun?.lastError ?? "신규 실제 데이터가 아직 저장되지 않았습니다."}` }
    : internalRevalidationRunning
      ? { kind: "stored_daily_bar_revalidation", automatic: true, title: "저장된 실제 일봉으로 부장 AI 연구 과제를 재평가합니다.", reason: "같은 원본·비용·정보절단 가정에서만 집계하며 외부 데이터·주문·종목 추천을 호출하지 않습니다." }
    : queue[0]
      ? { kind: queue[0].action, automatic: queue[0].action === "queue_research" && queue[0].readiness === "ready_for_internal_revalidation", title: queue[0].title, reason: queue[0].blocker ?? queue[0].acceptanceCriteria }
      : { kind: "observe_only", automatic: true, title: "동일 근거의 중복 검토를 피하고 다음 실제 데이터셋을 기다립니다.", reason: "완료된 연구 근거 지문은 재사용됩니다." };

  return {
    status,
    evidence: {
      activeRun: activeRun ? { id: activeRun.id, runKey: activeRun.runKey, phase: activeRun.phase, dataStatus: activeRun.dataStatus, updatedAt: activeRun.updatedAt, lastError: activeRun.lastError } : null,
      historicalRun: historicalRun ? { id: historicalRun.id, runKey: historicalRun.runKey, dataStatus: historicalRun.dataStatus, updatedAt: historicalRun.updatedAt } : null,
      committee: committee ? { id: committee.id, status: committee.status, evidenceFingerprint: committee.evidenceFingerprint, updatedAt: committee.updatedAt } : null,
      governance: cycle ? { id: cycle.id, status: cycle.status, cycleFingerprint: cycle.cycleFingerprint, updatedAt: cycle.updatedAt } : null,
      schedule: governanceSchedule ? { enabled: governanceSchedule.isEnabled, cronExpression: governanceSchedule.cronExpression, lastRequestedAt: governanceSchedule.lastRequestedAt } : null,
    },
    queue,
    revalidations,
    nextAction,
    externalVerification: {
      mode: "user_requested_only" as const,
      enabled: false,
      reason: "키움 OAuth·일봉 수집·외부 연구 노드·공개 배포 실데이터 검증은 사용자가 명시적으로 요청할 때만 실행합니다.",
    },
    promotion: { permitted: false, reason: "자율 운영은 실제 데이터 연구와 검증 과제만 자동화하며, 주문·종목 추천·실전 승격을 자동으로 수행하지 않습니다." },
    boundaries: [
      ...(historicalLookupUnavailable ? ["과거 연구 실행 조회가 일시적으로 실패했으나 나머지 자동 운영 상태는 표시합니다."] : []),
      "예시·가상 시장 데이터는 자동 연구 입력으로 사용하지 않습니다.",
      "실제 데이터 도착 전에는 수집·조건식 평가를 만들지 않고 연결 대기 상태를 유지합니다.",
      "동일 원본 지문은 중복 위원회·거버넌스 실행을 차단합니다.",
      "비밀값 변경, 외부 컴퓨터 권한 변경, 주문·계좌·포지션 API 호출은 자율 실행 범위에서 제외합니다.",
    ],
  };
}
