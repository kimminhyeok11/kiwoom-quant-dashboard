import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { formatQueryErrorDiagnostic, subscribeQueryErrorDiagnostics } from "./queryDiagnostics";

describe("쿼리 오류 진단", () => {
  it("실제 tRPC 쿼리 키와 배치 누락 진단 메시지를 한 줄 로그로 보존한다", () => {
    const diagnostic = formatQueryErrorDiagnostic(
      [["autonomousResearch", "mockOrderOperationStatus"], { type: "query" }],
      new Error("API 엔드포인트가 JSON 대신 HTML 응답을 반환했습니다. [배치 절차: autonomousResearch.latest, autonomousResearch.mockOrderOperationStatus · 누락 결과 인덱스: 1]"),
    );

    expect(diagnostic).toContain('queryKey=[["autonomousResearch","mockOrderOperationStatus"],{"type":"query"}]');
    expect(diagnostic).toContain("누락 결과 인덱스: 1");
  });

  it("실제 QueryCache 오류 구독자는 장중 쿼리 키와 배치 진단을 함께 기록한다", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const log = vi.fn();
    const onError = vi.fn();
    const queryKey = [["autonomousResearch", "mockOrderOperationStatus"], { type: "query" }];
    const unsubscribe = subscribeQueryErrorDiagnostics(queryClient, onError, log);

    await expect(queryClient.fetchQuery({
      queryKey,
      queryFn: async () => { throw new Error("API 엔드포인트가 JSON 대신 HTML 응답을 반환했습니다. [배치 절차: autonomousResearch.latest, autonomousResearch.mockOrderOperationStatus · 누락 결과 인덱스: 1]"); },
    })).rejects.toThrow("JSON 대신 HTML 응답");

    expect(onError).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('queryKey=[["autonomousResearch","mockOrderOperationStatus"],{"type":"query"}]'));
    expect(log).toHaveBeenCalledWith(expect.stringContaining("누락 결과 인덱스: 1"));
    unsubscribe();
  });
});
