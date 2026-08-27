/**
 * 키움 1분봉 API 페이징 디버깅
 * continuation 응답이 오는지 확인
 */
import "dotenv/config";
import { KiwoomClient } from "../server/kiwoom/client";

async function main() {
  const kiwoom = new KiwoomClient();
  console.log("모드:", kiwoom.getStatus().mode);
  console.log("고정IP:", kiwoom.getStatus().fixedIpRegistered);
  console.log("자격증명:", kiwoom.getStatus().hasCredentials);

  const { token } = await kiwoom.getAccessToken();
  console.log("토큰 발급 완료\n");

  // 직접 raw 호출해서 cont_yn, next_key 확인
  const baseDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date()).replaceAll("-", "");
  console.log("baseDate:", baseDate);
  console.log("종목: 005930 (삼성전자)\n");

  const baseUrl = "https://api.kiwoom.com";
  let continuation = "N";
  let nextKey = "";

  for (let page = 0; page < 3; page++) {
    if (page > 0) await new Promise(r => setTimeout(r, 1500));
    console.log(`--- 페이지 ${page + 1} ---`);
    console.log(`  요청: cont-yn="${continuation}", next-key="${nextKey}"`);

    const res = await fetch(`${baseUrl}/api/dostk/chart`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json;charset=UTF-8",
        authorization: `Bearer ${token}`,
        "api-id": "ka10080",
        "cont-yn": continuation,
        "next-key": nextKey,
      },
      body: JSON.stringify({ stk_cd: "005930", tic_scope: "1", upd_stkpc_tp: "1", base_dt: baseDate }),
    });

    console.log(`  응답 status: ${res.status}`);
    console.log(`  응답 헤더 cont-yn: ${res.headers.get("cont-yn")}`);
    console.log(`  응답 헤더 next-key: ${res.headers.get("next-key")}`);

    const body = await res.json() as Record<string, unknown>;
    console.log(`  body.return_code: ${body.return_code}`);
    console.log(`  body.return_msg: ${body.return_msg}`);
    console.log(`  body.cont_yn: ${body.cont_yn}`);
    console.log(`  body.next_key: ${body.next_key}`);

    const rows = body.stk_min_pole_chart_qry as unknown[];
    console.log(`  데이터 건수: ${Array.isArray(rows) ? rows.length : 0}`);
    if (Array.isArray(rows) && rows.length > 0) {
      const first = rows[0] as Record<string, string>;
      const last = rows[rows.length - 1] as Record<string, string>;
      console.log(`  첫 봉: ${first.cntr_tm} | 마지막 봉: ${last.cntr_tm}`);
    }

    const resCont = String(body.cont_yn ?? "N");
    const resNext = String(body.next_key ?? "");
    if (resCont !== "Y" || !resNext) {
      console.log("\n  → continuation 없음. 더 이상 페이지 없음.");
      break;
    }
    continuation = "Y";
    nextKey = resNext;
    console.log(`  → 다음 페이지 있음! nextKey: ${resNext.slice(0, 20)}...`);
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
