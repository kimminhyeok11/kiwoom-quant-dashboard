export type OAuthConnectionCheck = {
  status: "connected" | "waiting";
  checkedAt: string;
  expiresAt: string | null;
  message: string;
  reused: boolean;
  reason?: "fixed_ip_required" | "credentials_required" | "request_failed";
};

export function presentOAuthConnection(check?: OAuthConnectionCheck) {
  if (!check) {
    return {
      tone: "waiting" as const,
      title: "키움 연결 확인",
      detail: "원하는 때에 아래 버튼을 눌러 키움 연결을 바로 확인할 수 있습니다.",
      timestamp: null,
    };
  }

  if (check.status === "connected") {
    return {
      tone: "connected" as const,
      title: "키움 연결 완료",
      detail: check.message,
      timestamp: check.expiresAt ? `토큰 만료 예정 ${check.expiresAt}` : "접근 토큰을 확인했습니다.",
    };
  }

  return {
    tone: "waiting" as const,
      title: check.reason === "fixed_ip_required" ? "현재 배포 서버 재검증 · 키움 지정 단말 등록 필요" : "현재 배포 서버 재검증 결과",
    detail: check.message,
    timestamp: check.reused ? "최근 확인 결과를 재사용했습니다." : `확인 시각 ${new Date(check.checkedAt).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}`,
  };
}
