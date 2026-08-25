export type DashboardAccessMode = "public" | "operator";

export function resolveDashboardAccess(isAuthenticated: boolean, isOperator: boolean): DashboardAccessMode {
  return isAuthenticated && isOperator ? "operator" : "public";
}
