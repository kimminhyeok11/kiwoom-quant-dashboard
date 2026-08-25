import type { QueryClient } from "@tanstack/react-query";

export function formatQueryErrorDiagnostic(queryKey: readonly unknown[], error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return `[API Query Error] queryKey=${JSON.stringify(queryKey)} message=${message}`;
}

export function subscribeQueryErrorDiagnostics(
  queryClient: QueryClient,
  onError: (error: unknown) => void,
  log: (message: string) => void,
) {
  return queryClient.getQueryCache().subscribe(event => {
    if (event.type !== "updated" || event.action.type !== "error") return;
    const error = event.query.state.error;
    onError(error);
    log(formatQueryErrorDiagnostic(event.query.queryKey, error));
  });
}
