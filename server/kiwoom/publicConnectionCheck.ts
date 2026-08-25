import { KiwoomApiError, KiwoomClient } from "./client";

export type PublicOAuthConnectionCheckResult = {
  status: "connected" | "waiting";
  checkedAt: string;
  expiresAt: string | null;
  message: string;
  reused: boolean;
  reason?: "fixed_ip_required" | "credentials_required" | "request_failed";
};

type OAuthTokenIssuer = Pick<KiwoomClient, "getAccessToken">;

type PublicOAuthConnectionCheckOptions = {
  createClient?: () => OAuthTokenIssuer;
  now?: () => number;
  cooldownMs?: number;
};

const defaultCooldownMs = 2 * 60_000;

function toSafeFailure(error: unknown): Pick<PublicOAuthConnectionCheckResult, "message" | "reason"> {
  const message = error instanceof Error ? error.message : "키움 OAuth 연결 확인에 실패했습니다.";
  if (/8050|지정단말/i.test(message)) {
    return {
      reason: "fixed_ip_required",
      message: "키움 응답 8050: 지정 단말 인증이 필요합니다. 아래에 표시된 현재 배포 서버 출발지 IP를 키움 지정 단말에 등록한 뒤 다시 확인하세요.",
    };
  }
  if (error instanceof KiwoomApiError && error.code === "FIXED_IP_REQUIRED") {
    return {
      reason: "fixed_ip_required",
      message: "키움 지정 단말 IP 등록이 필요합니다. 아래에 표시된 현재 배포 서버 출발지 IP를 등록한 뒤 다시 확인하세요.",
    };
  }
  if (error instanceof KiwoomApiError && error.code === "CREDENTIALS_REQUIRED") {
    return { reason: "credentials_required", message: "서버의 키움 자격 증명 설정이 완료되지 않았습니다." };
  }
  return { reason: "request_failed", message: "키움 OAuth 연결을 확인하지 못했습니다. 잠시 후 다시 시도하세요." };
}

export class PublicOAuthConnectionChecker {
  private readonly createClient: () => OAuthTokenIssuer;
  private readonly now: () => number;
  private readonly cooldownMs: number;
  private inFlight: Promise<PublicOAuthConnectionCheckResult> | null = null;
  private lastResult: { finishedAt: number; result: PublicOAuthConnectionCheckResult } | null = null;

  constructor(options: PublicOAuthConnectionCheckOptions = {}) {
    this.createClient = options.createClient ?? (() => new KiwoomClient());
    this.now = options.now ?? Date.now;
    this.cooldownMs = options.cooldownMs ?? defaultCooldownMs;
  }

  async check(): Promise<PublicOAuthConnectionCheckResult> {
    if (this.inFlight) return this.inFlight;

    const now = this.now();
    if (this.lastResult && now - this.lastResult.finishedAt < this.cooldownMs) {
      return { ...this.lastResult.result, reused: true };
    }

    this.inFlight = this.runCheck();
    try {
      const result = await this.inFlight;
      this.lastResult = { finishedAt: this.now(), result };
      return result;
    } finally {
      this.inFlight = null;
    }
  }

  private async runCheck(): Promise<PublicOAuthConnectionCheckResult> {
    const checkedAt = new Date(this.now()).toISOString();
    try {
      const token = await this.createClient().getAccessToken();
      return {
        status: "connected",
        checkedAt,
        expiresAt: token.expiresAt || null,
        message: "서버에서 키움 OAuth 연결을 확인했습니다. 필요할 때 이 버튼으로 다시 확인할 수 있습니다.",
        reused: false,
      };
    } catch (error) {
      const failure = toSafeFailure(error);
      return {
        status: "waiting",
        checkedAt,
        expiresAt: null,
        ...failure,
        reused: false,
      };
    }
  }
}

export const publicOAuthConnectionCheck = new PublicOAuthConnectionChecker();
