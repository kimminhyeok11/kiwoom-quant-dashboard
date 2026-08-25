const TRPC_NON_JSON_RESPONSE = "API 엔드포인트가 JSON 대신 HTML 응답을 반환했습니다. 서버 재시작 또는 라우팅 상태를 확인한 뒤 다시 시도하세요.";

export const TRPC_REQUEST_TIMEOUT_MS = 8_000;

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit | undefined, headers: Headers): Promise<Response> {
  const controller = new AbortController();
  const externalSignal = init?.signal;
  let timedOut = false;
  const forwardExternalAbort = () => controller.abort(externalSignal?.reason);
  if (externalSignal) {
    if (externalSignal.aborted) forwardExternalAbort();
    else externalSignal.addEventListener("abort", forwardExternalAbort, { once: true });
  }
  const timeout = setTimeout(() => { timedOut = true; controller.abort("tRPC request timeout"); }, TRPC_REQUEST_TIMEOUT_MS);
  try {
    return await globalThis.fetch(input, { ...(init ?? {}), headers, credentials: "include", cache: "no-store", signal: controller.signal });
  } catch (error) {
    if (timedOut) return new Response("tRPC request timed out", { status: 504, statusText: "Gateway Timeout", headers: { "content-type": "text/plain" } });
    throw error;
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", forwardExternalAbort);
  }
}

export async function fetchJsonTrpcResponse(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (!headers.has("accept")) headers.set("accept", "application/json");
  if (!headers.has("cache-control")) headers.set("cache-control", "no-cache");
  const method = (init?.method ?? "GET").toUpperCase();
  const maxAttempts = method === "GET" ? 2 : 1;
  const expectedBatchResultCount = getExpectedBatchResultCount(input);
  const batchProcedures = getBatchProcedures(input);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetchWithTimeout(input, init, headers);
    const contentType = response.headers.get("content-type") ?? "";
    const isJson = contentType.toLowerCase().includes("application/json");
    const missingBatchResultIndex = isJson ? await findMissingBatchResultIndex(response, expectedBatchResultCount) : null;
    const hasCompleteBatchResult = isJson && missingBatchResultIndex === null;
    if (hasCompleteBatchResult) return response;

    const isTransientGatewayResponse = response.status >= 500 || response.status === 0 || (isJson && expectedBatchResultCount !== null);
    if (isTransientGatewayResponse && attempt < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 150 * attempt));
      continue;
    }

    const individualBatchResponse = expectedBatchResultCount && expectedBatchResultCount > 1
      ? await retryBatchProceduresIndividually(input, init, headers, expectedBatchResultCount)
      : null;
    if (individualBatchResponse) {
      console.warn(`[tRPC batch fallback] ${batchProcedures.join(", ")} 배치를 개별 요청으로 복구했습니다.`);
      return individualBatchResponse;
    }

    const batchDiagnostic = expectedBatchResultCount !== null
      ? ` [배치 절차: ${batchProcedures.join(", ") || "확인 불가"} · 누락 결과 인덱스: ${missingBatchResultIndex ?? "응답 형식"}]`
      : "";
    console.error(`[tRPC non-JSON response] status=${response.status} contentType=${contentType || "unknown"} url=${typeof input === "string" ? input : input.toString()} expected=${expectedBatchResultCount ?? "단일"} missing=${missingBatchResultIndex ?? "없음"}${batchDiagnostic}`);

    return new Response(JSON.stringify([{
      error: {
        json: {
          message: `${TRPC_NON_JSON_RESPONSE}${batchDiagnostic}`,
          code: -32603,
          data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 502 },
        },
      },
    }]), {
      status: 502,
      statusText: "Bad Gateway",
      headers: { "content-type": "application/json" },
    });
  }

  throw new Error("tRPC 요청 재시도 상태를 확인할 수 없습니다.");
}

async function retryBatchProceduresIndividually(input: RequestInfo | URL, init: RequestInit | undefined, headers: Headers, expectedCount: number) {
  const rawUrl = typeof input === "string" ? input : input.toString();
  try {
    const url = new URL(rawUrl, "http://trpc.local");
    const paths = (url.pathname.split("/").filter(Boolean).at(-1) ?? "").split(",");
    const inputs = JSON.parse(url.searchParams.get("input") ?? "{}") as Record<string, unknown>;
    if (paths.length !== expectedCount || !paths.every(Boolean)) return null;

    const entries = await Promise.all(paths.map(async (path, index) => {
      const individualUrl = new URL(url.toString());
      individualUrl.pathname = `${url.pathname.slice(0, -paths.join(",").length)}${path}`;
      individualUrl.searchParams.set("batch", "1");
      individualUrl.searchParams.set("input", JSON.stringify({ 0: inputs[String(index)] }));
      const requestUrl = /^https?:\/\//.test(rawUrl) ? individualUrl.toString() : `${individualUrl.pathname}${individualUrl.search}`;
      const response = await fetchWithTimeout(requestUrl, init, headers);
      if (response.ok && (response.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
        const body = await response.json() as unknown;
        if (Array.isArray(body) && body.length === 1 && body[0] && typeof body[0] === "object" && ("result" in body[0] || "error" in body[0])) return body[0];
      }
      return createProcedureFailure(path);
    }));
    return new Response(JSON.stringify(entries), { status: 200, headers: { "content-type": "application/json" } });
  } catch {
    return null;
  }
}

function createProcedureFailure(path: string) {
  return {
    error: {
      json: {
        message: `${TRPC_NON_JSON_RESPONSE} [개별 절차: ${path}]`,
        code: -32603,
        data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 502 },
      },
    },
  };
}

function getExpectedBatchResultCount(input: RequestInfo | URL): number | null {
  const rawUrl = typeof input === "string" ? input : input.toString();
  try {
    const url = new URL(rawUrl, "http://trpc.local");
    if (url.searchParams.get("batch") !== "1") return null;
    const parsed = JSON.parse(url.searchParams.get("input") ?? "{}") as Record<string, unknown>;
    return Object.keys(parsed).length;
  } catch {
    return null;
  }
}

function getBatchProcedures(input: RequestInfo | URL) {
  const rawUrl = typeof input === "string" ? input : input.toString();
  try {
    const url = new URL(rawUrl, "http://trpc.local");
    const segment = url.pathname.split("/").filter(Boolean).at(-1) ?? "";
    return segment ? segment.split(",") : [];
  } catch {
    return [] as string[];
  }
}

export async function findMissingBatchResultIndex(response: Response, expectedCount: number | null) {
  if (expectedCount === null) return null;
  try {
    const body = await response.clone().json() as unknown;
    if (!Array.isArray(body)) return 0;
    for (let index = 0; index < expectedCount; index += 1) {
      const item = body[index];
      if (!item || typeof item !== "object" || (!("result" in item) && !("error" in item))) return index;
    }
    return null;
  } catch {
    return 0;
  }
}

export { TRPC_NON_JSON_RESPONSE };
