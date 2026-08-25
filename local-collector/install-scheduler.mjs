/**
 * Windows 작업 스케줄러에 수집기/모의투자 자동 실행 등록
 * 
 * 실행: node install-scheduler.mjs
 * 관리자 권한 필요!
 */

import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const NODE_PATH = process.execPath; // Current node.exe path
const COLLECTOR_PATH = resolve(__dirname, "collector.mjs");
const TRADER_PATH = resolve(__dirname, "mock-trader.mjs");

const tasks = [
  {
    name: "KiwoomCollector_DailyBars",
    description: "키움 일봉 수집 (장 마감 후 16시)",
    schedule: "/sc daily /st 16:00",
    command: `"${NODE_PATH}" "${COLLECTOR_PATH}" --mode=daily`,
  },
  {
    name: "KiwoomCollector_MinuteBars",
    description: "키움 분봉 수집 (장 시간 09:00~15:35, 1분 간격)",
    schedule: "/sc minute /mo 1 /st 09:00 /et 15:35",
    command: `"${NODE_PATH}" "${COLLECTOR_PATH}" --mode=minute`,
  },
  {
    name: "KiwoomCollector_CheckIP",
    description: "키움 IP 확인 (매일 08:30)",
    schedule: "/sc daily /st 08:30",
    command: `"${NODE_PATH}" "${COLLECTOR_PATH}" --mode=check-ip`,
  },
  {
    name: "KiwoomMockTrader",
    description: "키움 모의투자 주문 실행 (장 중 09:05~15:20, 5분 간격)",
    schedule: "/sc minute /mo 5 /st 09:05 /et 15:20",
    command: `"${NODE_PATH}" "${TRADER_PATH}"`,
  },
  {
    name: "KiwoomMockTrader_Sync",
    description: "키움 모의투자 잔고 동기화 (15:40)",
    schedule: "/sc daily /st 15:40",
    command: `"${NODE_PATH}" "${TRADER_PATH}" --check`,
  },
];

console.log("========================================");
console.log("키움 로컬 수집기 - Windows 작업 스케줄러 등록");
console.log("========================================\n");
console.log(`Node.js: ${NODE_PATH}`);
console.log(`수집기: ${COLLECTOR_PATH}`);
console.log(`모의투자: ${TRADER_PATH}\n`);

for (const task of tasks) {
  console.log(`📋 ${task.name}: ${task.description}`);
  
  // Delete existing task first (ignore errors)
  try {
    execSync(`schtasks /delete /tn "${task.name}" /f`, { stdio: "ignore" });
  } catch { /* task didn't exist */ }

  // Create new task
  const cmd = `schtasks /create /tn "${task.name}" ${task.schedule} /tr "${task.command}" /rl HIGHEST /f`;
  
  try {
    execSync(cmd, { stdio: "pipe" });
    console.log(`   ✅ 등록 완료\n`);
  } catch (error) {
    console.log(`   ❌ 등록 실패 (관리자 권한으로 실행하세요)`);
    console.log(`   수동 등록: ${cmd}\n`);
  }
}

console.log("\n📌 참고사항:");
console.log("- 관리자 권한 PowerShell에서 실행하세요");
console.log("- 작업 확인: schtasks /query /fo LIST | findstr Kiwoom");
console.log("- 작업 삭제: schtasks /delete /tn \"작업이름\" /f");
console.log("- 분봉은 장 시간에만 1분 간격 실행됩니다 (09:00~15:35)");
console.log("- 모의투자는 5분 간격으로 주문 계획 체크 후 전송합니다");
