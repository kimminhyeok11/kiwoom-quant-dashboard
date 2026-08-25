# 키움 1분봉 수집 설계 메모

## 확인된 공통 REST 계약

키움 공식 REST API 가이드의 국내주식 TR 문서는 운영 도메인을 `https://api.kiwoom.com`으로, 요청 형식을 JSON `POST`로 제시한다. 각 호출은 `Authorization: Bearer <token>` 및 해당 TR의 `api-id` 헤더를 사용하며, 과거 레코드가 더 있을 때는 응답의 `cont-yn`, `next-key` 값을 다음 요청 헤더에 넣어 연속 조회한다.

## 1분봉 적용 원칙

1분봉 수집은 키움의 주식분봉차트조회 TR(`ka10080`)을 사용한다. 운영 URL은 `/api/dostk/chart`이며, 요청 본문은 `stk_cd`, `tic_scope: "1"`, `upd_stkpc_tp: "1"`으로 구성한다. 응답의 `stk_min_pole_chart_qry` 배열은 `cur_prc`, `trde_qty`, `cntr_tm`, `open_pric`, `high_pric`, `low_pric`를 제공한다. 로컬 지정 IP 노드만 OAuth 토큰을 발급하고, 분봉 원본·수집 시각·종목·요청 파라미터·연속조회 키를 로컬에 보존한다. 서버에는 정규화된 분봉과 원본 지문만 동기화하며, 임의 가격을 채우지 않는다.

분 단위 조건식 검증은 각 1분 봉이 **완결된 뒤**에만 해당 봉의 종가·고가·저가·거래량을 사용할 수 있다. 따라서 신호 시각은 해당 봉의 종료 시각, 진입 가격은 다음 봉의 보수적 가격으로 기록하고, 1분봉 안에서 목표 익절·손절이 함께 닿은 경우에는 사전에 고정한 보수적 체결 우선순위를 적용해야 한다.

## 출처

- [키움 REST API 공식 가이드](https://openapi.kiwoom.com/guide/index?dummyVal=0)
- [키움증권 공식 REST API 예제 저장소](https://github.com/Kiwoom-Securities/Kiwoom-REST-API)
- [공식 차트 API 명세](https://raw.githubusercontent.com/Kiwoom-Securities/Kiwoom-REST-API/main/kiwoom_docs/%EC%B0%A8%ED%8A%B8.md)
