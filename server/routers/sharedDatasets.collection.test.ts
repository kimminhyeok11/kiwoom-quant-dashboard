import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({ select: vi.fn(), insert: vi.fn(), update: vi.fn() }));
vi.mock("../db", () => ({ getDb: vi.fn(async () => dbMock) }));

import { appRouter } from "../routers";

function userContext(): TrpcContext {
  return { user: { id: 73, openId: "shared-data-user", name: "데이터 트레이너", email: "shared@example.com", loginMethod: "manus", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: { cookie: "" } } as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

function terminalChain(result: unknown) { return { from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => result }) }) }) }; }
function requestChain(result: unknown) { return { from: () => ({ where: () => ({ limit: async () => result }) }) }; }
function activeRequestChain(result: unknown) { return { from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => result }) }) }) }; }

describe("공용 데이터셋 고정 IP 수집 요청", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.select.mockReturnValue({ from: () => ({ where: () => ({ limit: async () => [] }) }) });
    dbMock.insert.mockReturnValue({ values: () => ({ $returningId: async () => [{ id: 806 }] }) });
    dbMock.update.mockReturnValue({ set: () => ({ where: async () => undefined }) });
  });

  it("단말 인증에 성공한 로그인 사용자만 웹 서버의 키움 호출 없이 수집 요청을 만든다", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    dbMock.select.mockReturnValueOnce(terminalChain([{ terminalIp: "203.0.113.42", status: "connected", checkedAt: new Date() }])).mockReturnValueOnce(activeRequestChain([])).mockReturnValueOnce(requestChain([]));

    const result = await appRouter.createCaller(userContext()).sharedDatasets.collectRandomShared({ symbolCount: 4, sampleDays: 5, randomSeed: 991 });

    expect(result).toMatchObject({ status: "queued", requestId: 806, randomSeed: 991 });
    expect(dbMock.insert).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("고도화 조건식용 8종목·60거래일 원본 수집 요청을 동일한 인증 경계에서 허용한다", async () => {
    dbMock.select.mockReturnValueOnce(terminalChain([{ terminalIp: "203.0.113.42", status: "connected", checkedAt: new Date() }])).mockReturnValueOnce(activeRequestChain([])).mockReturnValueOnce(requestChain([]));

    const result = await appRouter.createCaller(userContext()).sharedDatasets.collectRandomShared({ symbolCount: 8, sampleDays: 60, randomSeed: 992 });

    expect(result).toMatchObject({ status: "queued", requestId: 806, randomSeed: 992 });
    expect(dbMock.insert).toHaveBeenCalledTimes(1);
  });

  it("이미 접수 대기 또는 실행 중인 요청이 있으면 새 요청을 쌓지 않고 같은 요청을 재사용한다", async () => {
    dbMock.select.mockReturnValueOnce(terminalChain([{ terminalIp: "203.0.113.42", status: "connected", checkedAt: new Date() }])).mockReturnValueOnce(activeRequestChain([{ id: 901, status: "queued", datasetId: null, randomSeed: 8123 }]));

    const result = await appRouter.createCaller(userContext()).sharedDatasets.collectRandomShared({ symbolCount: 4, sampleDays: 5, randomSeed: 991 });

    expect(result).toEqual({ status: "queued", requestId: 901, datasetId: null, randomSeed: 8123, reusedRequest: true });
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("단말 인증이 미확인 또는 실패면 로그인 사용자도 수집 요청을 만들 수 없다", async () => {
    dbMock.select.mockReturnValue(terminalChain([]));

    await expect(appRouter.createCaller(userContext()).sharedDatasets.collectRandomShared({ symbolCount: 4, sampleDays: 5, randomSeed: 991 })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("비로그인 사용자는 실제 원본 수집 요청을 만들 수 없다", async () => {
    const anonymous = { ...userContext(), user: null } as TrpcContext;

    await expect(appRouter.createCaller(anonymous).sharedDatasets.collectRandomShared({ symbolCount: 4, sampleDays: 5, randomSeed: 991 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(dbMock.insert).not.toHaveBeenCalled();
  });
});
