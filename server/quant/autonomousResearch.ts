export const AUTONOMOUS_RESEARCH_POLICY = {
  version: "autonomous-v1",
  populationSize: 100,
  maxUniverseSize: 20,
  minRules: 10,
  maxRules: 20,
  maxDepth: 4,
  intradayIntervalMinutes: 1,
  holdingDays: 5,
  feeRate: 0.00015,
  slippageBps: 5,
  informationCutoffTradingDays: 1,
  minimumTrades: 5,
  maxDrawdownLimit: 0.25,
} as const;

export type AutonomousResearchPhase = "preparing" | "opening" | "intraday" | "closing" | "completed" | "waiting_for_data" | "incomplete" | "failed";
export type AutonomousRunDataStatus = "pending" | "ready" | "waiting" | "incomplete" | "error";

type KoreaTimeParts = { date: string; weekday: string; hour: number; minute: number };

function getKoreaTimeParts(now: Date): KoreaTimeParts {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? "";
  return { date: `${value("year")}-${value("month")}-${value("day")}`, weekday: value("weekday"), hour: Number(value("hour")), minute: Number(value("minute")) };
}

export function getAutonomousResearchPhase(now: Date): AutonomousResearchPhase | null {
  const korea = getKoreaTimeParts(now);
  if (["Sat", "Sun"].includes(korea.weekday)) return null;
  const minuteOfDay = korea.hour * 60 + korea.minute;
  if (minuteOfDay >= 8 * 60 + 50 && minuteOfDay < 9 * 60) return "preparing";
  if (minuteOfDay >= 9 * 60 && minuteOfDay < 9 * 60 + 10) return "opening";
  if (minuteOfDay >= 9 * 60 + 10 && minuteOfDay < 15 * 60 + 20) return "intraday";
  if (minuteOfDay >= 15 * 60 + 20 && minuteOfDay < 15 * 60 + 40) return "closing";
  return null;
}

export function getKoreaTradingDate(now: Date): string {
  return getKoreaTimeParts(now).date;
}

export function buildAutonomousRunKey(now: Date, phase: Exclude<AutonomousResearchPhase, "completed" | "waiting_for_data" | "incomplete" | "failed">, intervalMinutes = AUTONOMOUS_RESEARCH_POLICY.intradayIntervalMinutes): string {
  const korea = getKoreaTimeParts(now);
  const bucket = phase === "intraday" ? Math.floor(korea.minute / intervalMinutes) * intervalMinutes : korea.minute;
  return `${AUTONOMOUS_RESEARCH_POLICY.version}:${korea.date}:${phase}:${String(korea.hour).padStart(2, "0")}${String(bucket).padStart(2, "0")}`;
}

export function getWaitingForDataTransition(reason: string): { phase: "waiting_for_data"; dataStatus: "waiting"; lastError: string; summary: { reason: string; policyVersion: string } } {
  return { phase: "waiting_for_data", dataStatus: "waiting", lastError: reason.slice(0, 500), summary: { reason, policyVersion: AUTONOMOUS_RESEARCH_POLICY.version } };
}

export function getIntradayCompletionTransition(input: { observedAt: Date; observationCount: number; candidateCount: number; survivedCount: number }): { phase: "completed"; dataStatus: "ready"; completedAt: Date; lastObservedAt: Date; summary: typeof input } {
  return { phase: "completed", dataStatus: "ready", completedAt: input.observedAt, lastObservedAt: input.observedAt, summary: input };
}
