/**
 * 대규모 아레나 배틀 실행
 *
 * 기존 아레나 엔진(runMinuteResearchSweep)을 사용하되,
 * 지금 확보한 2M봉(124일, 45종목) 전체 데이터로 실행합니다.
 *
 * 기존 아레나가 하는 일:
 * 1. 12가지 규칙(MACD, RSI, 볼린저, 이평선 등)을 조합해 조건식 수천 개 자동 생성
 * 2. 각 조건식을 1분봉에서 시뮬레이션 (진입→손절/익절/시간청산)
 * 3. Training(앞 70%) vs Validation(뒤 30%) 독립 검증
 * 4. 검증 통과한 조건식만 promoted → strategyPresets에 자동 저장
 *
 * 이 스크립트는 대시보드 없이 직접 실행합니다.
 * 데이터가 2M봉이므로 기존보다 훨씬 견고한 검증이 됩니다.
 *
 * 실행: npx tsx scripts/run-large-arena-sweep.ts
 */

import "dotenv/config";
import { runMinuteResearchSweep } from "../server/quant/minuteResearch";
import { getDb } from "../server/db";
import { minuteResearchPrograms } from "../drizzle/schema";
import { eq } from "drizzle-orm";

async function main() {
  console.log("=== 대규모 아레나 배틀 (2M봉 전체 데이터) ===\n");

  const db = await getDb();
  if (!db) { console.error("DB 연결 실패"); process.exit(1); }

  // 개인 아레나 프로그램 찾기 또는 생성
  const [existing] = await db.select().from(minuteResearchPrograms).limit(1);
  let programId: number;

  if (existing) {
    programId = existing.id;
    console.log(`기존 프로그램 사용: ID ${programId}`);

    // 설정을 대규모로 업데이트
    await db.update(minuteResearchPrograms).set({
      configurationJson: {
        combinationsPerSweep: 5000,
        maxUniverseSymbols: 45,
        lookbackTradingDays: 90,
        validationTradingDays: 30,
        minimumTrades: 50,
        minimumValidationTrades: 15,
        maxDrawdownPercent: -8,
        stopLossPercent: 1.5,
        takeProfitPercent: 4,
        maxHoldingBars: 60,
        feeRate: 0.0003,
        slippageBps: 10,
        explorationMode: "diverse_random",
      },
      status: "active",
      lastError: null,
    }).where(eq(minuteResearchPrograms.id, programId));
  } else {
    const config = {
      combinationsPerSweep: 5000,
      maxUniverseSymbols: 45,
      lookbackTradingDays: 90,
      validationTradingDays: 30,
      minimumTrades: 50,
      minimumValidationTrades: 15,
      maxDrawdownPercent: -8,
      stopLossPercent: 1.5,
      takeProfitPercent: 4,
      maxHoldingBars: 60,
      feeRate: 0.0003,
      slippageBps: 10,
      explorationMode: "diverse_random",
    };
    const [created] = await db.insert(minuteResearchPrograms).values({
      userId: 1,
      name: "대규모 자동 탐색",
      status: "active",
      cronExpression: "manual",
      scheduleCronTaskUid: null,
      configurationJson: config,
    }).returning();
    programId = created.id;
    console.log(`새 프로그램 생성: ID ${programId}`);
  }

  console.log("설정 업데이트 완료: 5000개 조건식 × 45종목 × 90일 학습 + 30일 검증\n");
  console.log("배틀 시작...\n");

  const startTime = Date.now();

  try {
    const result = await runMinuteResearchSweep(programId);
    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

    console.log("\n=== 배틀 완료 ===");
    console.log(`소요: ${elapsed}분`);
    console.log(`결과:`, JSON.stringify(result, null, 2));

    if (typeof result === "object" && result !== null) {
      const r = result as Record<string, unknown>;
      console.log(`\n생성: ${r.generatedCount ?? "?"}개`);
      console.log(`통과: ${r.promotedCount ?? "?"}개`);
      console.log(`거부: ${r.rejectedCount ?? "?"}개`);

      if (Number(r.promotedCount) > 0) {
        console.log(`\n★ ${r.promotedCount}개 조건식이 독립 검증을 통과했습니다!`);
        console.log("  → strategyPresets 테이블에 자동 저장됨");
        console.log("  → 대시보드 아레나에서 확인 가능");
      } else {
        console.log("\n❌ 이번 배틀에서 검증 통과 조건식 없음.");
        console.log("  → 더 많은 조합 탐색이 필요하거나, 기준 완화 검토");
      }
    }
  } catch (error) {
    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    console.error(`\n배틀 실패 (${elapsed}분 후):`, error instanceof Error ? error.message : error);
  }

  process.exit(0);
}

main();
