import { describe, expect, it, vi } from "vitest";
import { fetchJsonTrpcResponse, findMissingBatchResultIndex, TRPC_NON_JSON_RESPONSE, TRPC_REQUEST_TIMEOUT_MS } from "../client/src/lib/trpcTransport";

describe("tRPC JSON transport", () => {
  it("preserves a JSON API response", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response('[{"result":{"data":{"json":true}}}]', { headers: { "content-type": "application/json" } }));
    const response = await fetchJsonTrpcResponse("/api/trpc/system.health");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ result: { data: { json: true } } }]);
    expect(fetchSpy).toHaveBeenCalledWith("/api/trpc/system.health", expect.objectContaining({ credentials: "include", cache: "no-store" }));
    fetchSpy.mockRestore();
  });

  it("converts an HTML fallback into a structured tRPC JSON error", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("<!doctype html><html><body>Vite fallback</body></html>", { status: 200, headers: { "content-type": "text/html" } }));
    const response = await fetchJsonTrpcResponse("/api/trpc/quant.brokerStatus");
    expect(response.status).toBe(502);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual([expect.objectContaining({ error: { json: expect.objectContaining({ message: TRPC_NON_JSON_RESPONSE, data: expect.objectContaining({ httpStatus: 502 }) }) } })]);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("status=200 contentType=text/html url=/api/trpc/quant.brokerStatus"));
    fetchSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it("retries a transient HTML gateway response before returning an error", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("<html>gateway timeout</html>", { status: 504, headers: { "content-type": "text/html" } }))
      .mockResolvedValueOnce(new Response('[{"result":{"data":{"json":{"recovered":true}}}}]', { headers: { "content-type": "application/json" } }));

    const response = await fetchJsonTrpcResponse("/api/trpc/autonomousResearch.mockOrderOperationStatus");

    expect(await response.json()).toEqual([{ result: { data: { json: { recovered: true } } } }]);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(consoleSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it("응답이 멈춘 분석 요청은 제한 시간 뒤 구조화된 오류로 끝내 무한 로딩을 막는다", async () => {
    vi.useFakeTimers();
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) => new Promise((_resolve, reject) => {
      (init?.signal as AbortSignal | undefined)?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    }));
    const responsePromise = fetchJsonTrpcResponse("/api/trpc/minuteResearch.dashboard");
    await vi.advanceTimersByTimeAsync(TRPC_REQUEST_TIMEOUT_MS);
    await vi.advanceTimersByTimeAsync(150);
    await vi.advanceTimersByTimeAsync(TRPC_REQUEST_TIMEOUT_MS);
    const response = await responsePromise;

    expect(response.status).toBe(502);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    fetchSpy.mockRestore();
    consoleSpy.mockRestore();
    vi.useRealTimers();
  });

  it("retries a JSON batch response that is missing a requested result", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const request = "/api/trpc/autonomousResearch.latest,autonomousResearch.mockOrderOperationStatus?batch=1&input=%7B%220%22%3A%7B%22json%22%3Anull%7D%2C%221%22%3A%7B%22json%22%3Anull%7D%7D";
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response('[{"result":{"data":{"json":{"run":true}}}}]', { headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response('[{"result":{"data":{"json":{"run":true}}}},{"result":{"data":{"json":{"operation":true}}}}]', { headers: { "content-type": "application/json" } }));

    const response = await fetchJsonTrpcResponse(request);

    expect(await response.json()).toHaveLength(2);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(consoleSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it("배틀 분석처럼 무거운 배치가 반복 504되면 절차를 개별 요청으로 나눠 결과를 복구한다", async () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const request = "/api/trpc/strategyCards.myCollectionAnalysis,minuteResearch.dashboard?batch=1&input=%7B%220%22%3A%7B%22json%22%3Anull%7D%2C%221%22%3A%7B%22json%22%3Anull%7D%7D";
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("<html>gateway timeout</html>", { status: 504, headers: { "content-type": "text/html" } }))
      .mockResolvedValueOnce(new Response("<html>gateway timeout</html>", { status: 504, headers: { "content-type": "text/html" } }))
      .mockResolvedValueOnce(new Response('[{"result":{"data":{"json":{"cards":[]}}}}]', { headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response('[{"result":{"data":{"json":{"sweeps":[]}}}}]', { headers: { "content-type": "application/json" } }));

    const response = await fetchJsonTrpcResponse(request);

    await expect(response.json()).resolves.toEqual([
      { result: { data: { json: { cards: [] } } } },
      { result: { data: { json: { sweeps: [] } } } },
    ]);
    expect(fetchSpy).toHaveBeenCalledTimes(4);
    expect(String(fetchSpy.mock.calls[2]?.[0])).toContain("strategyCards.myCollectionAnalysis");
    expect(String(fetchSpy.mock.calls[3]?.[0])).toContain("minuteResearch.dashboard");
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("배치를 개별 요청으로 복구했습니다."));
    fetchSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it("개별 복구 중 일부 절차가 계속 실패해도 모든 배치 절차의 결과 자리를 보존해 Missing result 연쇄 오류를 막는다", async () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const request = "/api/trpc/auth.me,autonomousResearch.autonomousOperationsStatus?batch=1&input=%7B%220%22%3A%7B%22json%22%3Anull%7D%2C%221%22%3A%7B%22json%22%3Anull%7D%7D";
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("gateway timeout", { status: 504, headers: { "content-type": "text/html" } }))
      .mockResolvedValueOnce(new Response("gateway timeout", { status: 504, headers: { "content-type": "text/html" } }))
      .mockResolvedValueOnce(new Response('[{"result":{"data":{"json":{"user":"ok"}}}}]', { headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response("gateway timeout", { status: 504, headers: { "content-type": "text/html" } }));

    const response = await fetchJsonTrpcResponse(request);
    const body = await response.json() as Array<{ result?: unknown; error?: { json?: { message?: string } } }>;

    expect(body).toHaveLength(2);
    expect(body[0]?.result).toBeTruthy();
    expect(body[1]?.error?.json?.message).toContain("autonomousResearch.autonomousOperationsStatus");
    fetchSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it("장중 화면의 실제 7개 절차 배치에서 누락된 결과 인덱스를 식별하고 재시도한다", async () => {
    const paths = ["autonomousResearch.latest", "autonomousResearch.dayTradeHistory", "autonomousResearch.latest", "autonomousResearch.minuteValidationHistory", "autonomousResearch.minuteCollectionStatus", "autonomousResearch.minuteBackfillStatus", "autonomousResearch.mockOrderOperationStatus"];
    const input = Object.fromEntries(paths.map((_, index) => [index, { json: null }]));
    const request = `/api/trpc/${paths.join(",")}?batch=1&input=${encodeURIComponent(JSON.stringify(input))}`;
    const incomplete = Array.from({ length: 6 }, (_, index) => ({ result: { data: { json: { index } } } }));
    const complete = Array.from({ length: 7 }, (_, index) => ({ result: { data: { json: { index } } } }));
    const response = new Response(JSON.stringify(incomplete), { headers: { "content-type": "application/json" } });
    expect(await findMissingBatchResultIndex(response, paths.length)).toBe(6);

    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response)
      .mockResolvedValueOnce(new Response(JSON.stringify(complete), { headers: { "content-type": "application/json" } }));
    const finalResponse = await fetchJsonTrpcResponse(request);
    expect(await finalResponse.json()).toHaveLength(paths.length);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    fetchSpy.mockRestore();
  });

  it("16시 00분 로그에서 관찰된 dayTradeHistory 단일 배치의 빈 결과를 재시도한다", async () => {
    const request = "/api/trpc/autonomousResearch.dayTradeHistory?batch=1&input=%7B%220%22%3A%7B%22json%22%3Anull%2C%22meta%22%3A%7B%22values%22%3A%5B%22undefined%22%5D%7D%7D%7D";
    const emptyResponse = new Response("[]", { headers: { "content-type": "application/json" } });
    expect(await findMissingBatchResultIndex(emptyResponse, 1)).toBe(0);
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(emptyResponse)
      .mockResolvedValueOnce(new Response('[{"result":{"data":{"json":{"experiments":[]}}}}]', { headers: { "content-type": "application/json" } }));

    const response = await fetchJsonTrpcResponse(request);

    expect(await response.json()).toEqual([{ result: { data: { json: { experiments: [] } } } }]);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    fetchSpy.mockRestore();
  });

  it("누락 결과가 지속되면 실제 배치 절차와 누락 인덱스를 진단 로그에 남긴다", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const request = "/api/trpc/autonomousResearch.latest,autonomousResearch.mockOrderOperationStatus?batch=1&input=%7B%220%22%3A%7B%22json%22%3Anull%7D%2C%221%22%3A%7B%22json%22%3Anull%7D%7D";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response('[{"result":{"data":{"json":{"run":true}}}}]', { headers: { "content-type": "application/json" } }));

    const response = await fetchJsonTrpcResponse(request);

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual([expect.objectContaining({ error: { json: expect.objectContaining({ message: expect.stringContaining("누락 결과 인덱스: 1") }) } })]);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("expected=2 missing=1 [배치 절차: autonomousResearch.latest, autonomousResearch.mockOrderOperationStatus · 누락 결과 인덱스: 1]"));
    fetchSpy.mockRestore();
    consoleSpy.mockRestore();
  });
});
