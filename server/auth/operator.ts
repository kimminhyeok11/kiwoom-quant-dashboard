export const OPERATOR_EMAIL = "salad20c@gmail.com";

function normalizeEmail(email?: string | null): string {
  return email?.trim().toLowerCase() ?? "";
}

export function isConfiguredOperatorEmail(email?: string | null): boolean {
  return normalizeEmail(email) === OPERATOR_EMAIL;
}

export type OperatorReason = "admin_role" | "owner_open_id" | "configured_operator_email" | null;

export function getOperatorReason(user?: { openId?: string | null; email?: string | null; role?: string | null } | null): OperatorReason {
  if (!user) return null;
  if (user.role === "admin") return "admin_role";
  if (Boolean(process.env.OWNER_OPEN_ID) && user.openId === process.env.OWNER_OPEN_ID) return "owner_open_id";
  if (isConfiguredOperatorEmail(user.email)) return "configured_operator_email";
  return null;
}

export function isOperatorUser(user?: { openId?: string | null; email?: string | null; role?: string | null } | null): boolean {
  return getOperatorReason(user) !== null;
}
