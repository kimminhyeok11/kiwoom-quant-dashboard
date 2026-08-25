export type OAuthState = "not_issued" | "cached" | "expiring" | "error";

export function presentOAuthStatus(status?: { state: OAuthState; expiresAt: string | null; error: string | null }) {
  if (!status) return { label: "상태 확인 중", detail: "서버의 OAuth 상태를 확인하고 있습니다.", tone: "muted" as const };
  if (status.state === "cached") return { label: "캐시됨", detail: status.expiresAt ? `만료 예정 ${status.expiresAt}` : "서버에 유효한 접근 토큰이 있습니다.", tone: "ready" as const };
  if (status.state === "expiring") return { label: "만료 임박", detail: status.expiresAt ? `만료 예정 ${status.expiresAt}` : "서버에서 토큰을 갱신합니다.", tone: "warning" as const };
  if (status.state === "error") return { label: "오류", detail: status.error ?? "OAuth 토큰 상태를 확인할 수 없습니다.", tone: "error" as const };
  return { label: "미발급", detail: "아직 키움 OAuth 접근 토큰을 발급하지 않았습니다.", tone: "muted" as const };
}

export function presentKiwoomAccess(fixedIpRegistered?: boolean) {
  return fixedIpRegistered
    ? { label: "지정 단말 등록 상태", detail: "키움 REST API의 지정 단말 등록 상태입니다. 실제 접근은 OAuth 토큰 발급이 성공해야 확인되며 앱에서는 수정할 수 없습니다.", tone: "ready" as const }
    : { label: "키움 접근 검증 대기", detail: "지정 단말 허용 여부는 키움 REST API에서만 관리됩니다. 앱에서는 수정할 수 없습니다.", tone: "warning" as const };
}
