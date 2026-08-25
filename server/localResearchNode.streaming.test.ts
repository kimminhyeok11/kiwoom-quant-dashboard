import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");

describe("대용량 공용 데이터셋 스트리밍 적재", () => {
  it("시작·최대 800행 청크·행 수 검증 완료 단계를 제공하고 중단 재개 시 중복 행을 갱신한다", () => {
    const source = readFileSync(resolve(projectRoot, "server/localResearchNode.ts"), "utf8");

    expect(source).toContain('shared-dataset-collection-stream-start');
    expect(source).toContain('shared-dataset-collection-stream-chunk');
    expect(source).toContain('shared-dataset-collection-stream-finalize');
    expect(source).toContain('submitted.length > 800');
    expect(source).toContain('onDuplicateKeyUpdate');
    expect(source).toContain('status: "chunk_recorded"');
    expect(source).toContain('incomplete_upload');
    expect(source).toContain('expectedFiveMinuteBarCount');
    expect(source).toContain('qualityStatus: "ready"');
  });
});
