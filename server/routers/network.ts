import { desc, eq } from "drizzle-orm";
import { kiwoomTerminalConnectionChecks } from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";

function normalizeIp(value: string | undefined): string | null {
  const ip = value?.split(",")[0]?.trim();
  if (!ip) return null;
  const normalized = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  if (normalized === "::1" || normalized === "0.0.0.0" || normalized === "127.0.0.1" || normalized.startsWith("127.") || normalized.startsWith("10.") || normalized.startsWith("192.168.") || /^172\.(1[6-9]|2\d|3[01])\./.test(normalized) || /^f[cd]/i.test(normalized) || /^fe80:/i.test(normalized)) return null;
  return normalized;
}

type TerminalConnectionCheck = {
  terminalIp: string;
  status: "connected" | "failed";
  errorCode: string | null;
  message: string;
  verificationJson?: unknown;
  checkedAt: Date;
};

export type TerminalConnectionVerification = {
  oauth: "passed" | "failed" | "not_run";
  apiRead: "passed" | "failed" | "not_run";
  serviceSync: "passed" | "failed" | "pending" | "not_run";
  serviceReadBack: "passed" | "failed" | "pending" | "not_run";
  apiId?: string;
  responseRows?: number;
};

export function normalizeTerminalConnectionVerification(value: unknown): TerminalConnectionVerification | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const oauth = record.oauth;
  const apiRead = record.apiRead;
  const serviceSync = record.serviceSync;
  const serviceReadBack = record.serviceReadBack;
  if (!["passed", "failed", "not_run"].includes(String(oauth)) || !["passed", "failed", "not_run"].includes(String(apiRead)) || !["passed", "failed", "pending", "not_run"].includes(String(serviceSync)) || !["passed", "failed", "pending", "not_run"].includes(String(serviceReadBack))) return null;
  return {
    oauth: oauth as TerminalConnectionVerification["oauth"],
    apiRead: apiRead as TerminalConnectionVerification["apiRead"],
    serviceSync: serviceSync as TerminalConnectionVerification["serviceSync"],
    serviceReadBack: serviceReadBack as TerminalConnectionVerification["serviceReadBack"],
    apiId: typeof record.apiId === "string" ? record.apiId.slice(0, 32) : undefined,
    responseRows: Number.isInteger(record.responseRows) && Number(record.responseRows) >= 0 ? Number(record.responseRows) : undefined,
  };
}

export function isTerminalRoundTripVerified(value: unknown) {
  const verification = normalizeTerminalConnectionVerification(value);
  return Boolean(verification && verification.oauth === "passed" && verification.apiRead === "passed" && verification.serviceSync === "passed" && verification.serviceReadBack === "passed");
}

export function diagnoseKiwoomTerminalCheck(check: TerminalConnectionCheck) {
  const code = `${check.errorCode ?? ""} ${check.message}`.toLowerCase();
  if (check.status === "connected") {
    if (isTerminalRoundTripVerified(check.verificationJson)) {
      return {
        kind: "connected" as const,
        title: "키움 API·서비스 왕복 확인 완료",
        nextAction: "OAuth 토큰 발급, ka10081 읽기 응답, 서비스 동기화, 저장 결과 재확인이 모두 확인되었습니다. 공용 데이터 수집을 시작할 수 있습니다.",
      };
    }
    return {
      kind: "partial" as const,
      title: "OAuth 토큰 발급만 기록됨",
      nextAction: "기존 점검 기록은 키움 API 읽기·서비스 저장 결과 재확인을 포함하지 않습니다. 최신 점검 스크립트를 다시 실행해 왕복 증거를 남기세요.",
    };
  }
  if (/owner_not_ready|result_sync|동기화|unavailable|unauthorized|service/.test(code)) {
    return {
      kind: "sync" as const,
      title: "대시보드 동기화 실패",
      nextAction: "키움 OAuth 결과가 웹 대시보드에 저장되지 않았습니다. 다음 점검 때 표시되는 처리 경로·오류 코드를 함께 확인하세요.",
    };
  }
  if (/public_ip|terminal_ip|checkip|network|timeout|fetch/.test(code)) {
    return {
      kind: "network" as const,
      title: "단말 공인 IP·네트워크 확인 필요",
      nextAction: "점검 화면에 표시된 현재 단말 공인 IP를 키움 등록 IP와 한 글자까지 비교한 뒤 네트워크 연결을 다시 확인하세요.",
    };
  }
  if (/app_key|app_secret|credential|missing|config/.test(code)) {
    return {
      kind: "credentials" as const,
      title: "로컬 OAuth 자격 증명 확인 필요",
      nextAction: "사용자 컴퓨터의 .env에 KIWOOM_APP_KEY·KIWOOM_APP_SECRET이 설정되어 있는지 확인한 후 다시 점검하세요.",
    };
  }
  return {
    kind: "oauth" as const,
    title: "키움 OAuth 토큰 발급 거부",
    nextAction: "등록 IP가 일치해도 키움의 앱 키·시크릿·운영 모드가 맞지 않으면 토큰 발급이 거부될 수 있습니다. 점검 스크립트를 다시 실행한 뒤 오류 코드를 확인하세요.",
  };
}

function withTerminalDiagnosis(check: TerminalConnectionCheck) {
  const verification = normalizeTerminalConnectionVerification(check.verificationJson);
  return { ...check, verification, roundTripVerified: isTerminalRoundTripVerified(check.verificationJson), diagnosis: diagnoseKiwoomTerminalCheck(check) };
}

export const networkRouter = router({
  visitorIp: publicProcedure.query(({ ctx }) => ({
    ip: normalizeIp(ctx.req.ip) ?? normalizeIp(ctx.req.headers["x-forwarded-for"] as string | undefined) ?? normalizeIp(ctx.req.socket?.remoteAddress),
    scope: "current_request" as const,
  })),
  collectorStatus: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;
    const check = (await db.select({ terminalIp: kiwoomTerminalConnectionChecks.terminalIp, status: kiwoomTerminalConnectionChecks.status, verificationJson: kiwoomTerminalConnectionChecks.verificationJson, checkedAt: kiwoomTerminalConnectionChecks.checkedAt }).from(kiwoomTerminalConnectionChecks).orderBy(desc(kiwoomTerminalConnectionChecks.checkedAt)).limit(1))[0] ?? null;
    if (!check) return { connected: false, lastSyncAt: null, terminalIp: null, roundTripVerified: false };
    return { connected: check.status === "connected", lastSyncAt: check.checkedAt, terminalIp: check.terminalIp, roundTripVerified: isTerminalRoundTripVerified(check.verificationJson) };
  }),
  myKiwoomTerminalStatus: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return null;
    const check = (await db.select({ terminalIp: kiwoomTerminalConnectionChecks.terminalIp, status: kiwoomTerminalConnectionChecks.status, errorCode: kiwoomTerminalConnectionChecks.errorCode, message: kiwoomTerminalConnectionChecks.message, verificationJson: kiwoomTerminalConnectionChecks.verificationJson, checkedAt: kiwoomTerminalConnectionChecks.checkedAt }).from(kiwoomTerminalConnectionChecks).where(eq(kiwoomTerminalConnectionChecks.userId, ctx.user.id)).orderBy(desc(kiwoomTerminalConnectionChecks.checkedAt)).limit(1))[0] ?? null;
    return check ? withTerminalDiagnosis(check) : null;
  }),
  myKiwoomTerminalDiagnostics: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const checks = await db.select({ terminalIp: kiwoomTerminalConnectionChecks.terminalIp, status: kiwoomTerminalConnectionChecks.status, errorCode: kiwoomTerminalConnectionChecks.errorCode, message: kiwoomTerminalConnectionChecks.message, verificationJson: kiwoomTerminalConnectionChecks.verificationJson, checkedAt: kiwoomTerminalConnectionChecks.checkedAt }).from(kiwoomTerminalConnectionChecks).where(eq(kiwoomTerminalConnectionChecks.userId, ctx.user.id)).orderBy(desc(kiwoomTerminalConnectionChecks.checkedAt)).limit(8);
    return checks.map(withTerminalDiagnosis);
  }),
});
