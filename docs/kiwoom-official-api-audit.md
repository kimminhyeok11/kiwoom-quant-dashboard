# 키움 REST API 공식 명세 대조 기록

## 조사 기준

- 공식 가이드: <https://openapi.kiwoom.com/guide/apiguide?dummyVal=0>
- 확인 일시: 2026-08-19 KST
- 조사 범위: OAuth 인증과 국내주식의 계좌·시세·실시간시세·조건검색·차트·주문

## 확인된 OAuth 기본 계약

| 항목 | 공식 명세 |
|---|---|
| 토큰 발급 TR | `au10001` |
| HTTP 메서드 | `POST` |
| 경로 | `/oauth2/token` |
| 운영 도메인 | `https://api.kiwoom.com` |
| 모의투자 도메인 | `https://mockapi.kiwoom.com` |
| 본문 필수값 | `grant_type=client_credentials`, `appkey`, `secretkey` |
| 응답 핵심값 | `token`, `token_type`, `expires_dt`, `return_code`, `return_msg` |

## 다음 대조 항목

국내주식의 계좌·시세·실시간시세·조건검색·차트·주문 명세를 각 TR별 요청 경로·헤더·본문·연속조회·모의투자 지원 여부로 수집한 뒤, 로컬 수집기와 모의 주문 실행기의 실제 호출 계약에 대조한다.

## 국내주식 공식 분류 확인

공식 가이드는 국내주식을 계좌, 공매도, 관심종목, 기관/외국인, 대차거래, 순위정보, 시세, 신용주문, 실시간시세, 업종, 조건검색, 종목정보, 주문, 차트, 테마, ELW, ETF로 분류한다. 현재 서비스 대조의 직접 대상은 계좌·시세·실시간시세·조건검색·주문·차트다.

가이드의 JSON 명세 다운로드 기능도 확인했다. 다운로드 산출물과 화면의 각 TR 명세를 병행해 요청 경로, `api-id` 헤더, 연속조회 헤더와 모의투자 지원 범위를 확보한다.

## 서비스 핵심 기능별 공식 계약

| 서비스 기능 | 공식 TR·전송 방식 | 대조 기준 |
|---|---|---|
| 토큰 발급 | `au10001`, `POST /oauth2/token` | `appkey`·`secretkey` 본문과 Bearer 토큰 처리 |
| 일봉·분봉 원본 | `ka10081`·`ka10080` | 차트 요청 본문, 연속조회 `cont-yn`·`next-key`, 완결 봉 정규화 |
| 사용자 조건식 | `ka10171`·`ka10172`·`ka10173`·`ka10174`, WebSocket | 영웅문4 조건식 목록·일반 요청·실시간 등록·해제 경계 |
| 모의·운영 주문 | `kt10000`·`kt10001`·`kt10002`·`kt10003`, `POST /api/dostk/ordr` | `authorization`, `api-id`, KRX/NXT/SOR, 종목·수량·단가·호가 구분 |
| 계좌·체결 동기화 | `kt00018`·`kt00007`, `POST /api/dostk/acnt` | 잔고·계좌평가·주문체결 상태·미체결 수량 동기화 |
| 실시간 시세 | 국내주식 WebSocket 실시간 체결 `0B` 등 | 실시간 구독을 채택하는 경우 구독·해제·재연결 계약 |

공식 주문 문서에서 `kt10000` 매수 주문은 `POST /api/dostk/ordr`와 Bearer 인증, `api-id=kt10000`, `dmst_stex_tp`, `stk_cd`, `ord_qty`, `ord_uv`, `trde_tp`를 요구한다. 모의투자 도메인은 `https://mockapi.kiwoom.com`이며 KRX만 지원한다고 명시한다. 응답 주문번호 `ord_no`는 이후 체결 동기화의 기준 키다.

공식 조건검색 문서는 영웅문4에서 작성한 조건검색식을 대상으로 하며, 목록 조회 `ka10171`은 WebSocket `wss://{도메인}:10000/api/dostk/websocket`에 `trnm=CNSRLST`를 전송한다. 따라서 서비스의 자체 진화형 조건식 연구와 영웅문 조건식 연동은 별도 데이터 원천으로 관리해야 한다.

공식 응답이 연속조회 대상인 경우 다음 요청에 `cont-yn`과 `next-key` 헤더를 전파해야 한다. 이는 올해 다종목 ka10080/ka10081 백필 수집기의 연속조회 계약과 직접 연결된다.

## 현재 구현 대조 결과

| 공식 기능 | 현재 구현 | 대조 결과 | 조치 |
|---|---|---|---|
| OAuth `au10001` | `research-node.mjs`, `minute-bar-collector.mjs`, `auto-order-executor.mjs` | 운영·모의 도메인, JSON 본문, Bearer 토큰 생성이 일치 | 유지 |
| 차트 `ka10080` | `minute-bar-collector.mjs` | `/api/dostk/chart`, `api-id=ka10080`, `stk_cd`·`tic_scope`·`upd_stkpc_tp`, 완결 1분봉 필터가 일치 | 연속조회 헤더 검증을 명시적으로 보강 |
| 차트 `ka10081` | `research-node.mjs` | `/api/dostk/chart`, `api-id=ka10081`, `stk_cd`·`base_dt`·`upd_stkpc_tp`, 불변 스냅샷 연결이 일치 | 연속조회 헤더 검증을 명시적으로 보강 |
| 계좌평가 `kt00018` | `auto-order-executor.mjs` | `/api/dostk/acnt`, Bearer 토큰·`api-id=kt00018`, KRX 평가 조회 경로 사용 | 모의 장중 주문 실행 뒤 실제 응답으로 확인 필요 |
| 주문체결 `kt00007` | `auto-order-executor.mjs` | `/api/dostk/acnt`, 주문번호·체결량·체결가·미체결수량을 동기화 | 모의 체결 발생 뒤 실제 응답으로 확인 필요 |
| 매수/매도 `kt10000`·`kt10001` | `auto-order-executor.mjs` | `/api/dostk/ordr`, `dmst_stex_tp=KRX`, 종목·수량·가격·호가구분 및 주문번호 보존이 일치 | 주문 전송은 모의 정책·계좌·거래일 조건에서만 수행 |
| WebSocket 주문체결 `00` | 미구현 | 공식 명세는 주문·체결·거부를 실시간으로 제공 | REST 체결조회가 현재 기준. 별도 장시간 연결이 필요한 보조 경로로 관리 |
| WebSocket 주식체결 `0B` | 미구현 | 공식 명세는 종목별 체결 스트림 제공 | 현재는 실제 ka10080 완결 1분봉을 원본으로 사용하므로 연구 재현성 우선 원칙을 유지 |
| 영웅문 조건검색 `ka10171`~`ka10174` | 미구현 | 공식 명세상 WebSocket 기반·영웅문4 조건식 원천 | 진화형 자체 조건식 연구와 별도 선택 기능으로 설계 필요 |

현재 실제 서비스의 필수 수집·연구·모의 주문 REST 계약에는 공식 문서와 상충하는 경로가 확인되지 않았다. 다만 모든 외부 호출에 대해 공식 `cont-yn`·`next-key` 연속조회 헤더의 다음 페이지 전달을 계약 테스트로 고정하고, 실시간 WebSocket·영웅문 조건검색은 연구 원본과 분리된 선택 기능으로 취급한다.

## 적용한 보완과 검증

사용자 컴퓨터의 `kiwoom-rest-contract.mjs`에 공식 도메인·경로·OAuth 본문·Bearer 인증·`api-id`·연속조회 헤더·국내주식 주문 필수값을 공통 계약으로 정의했다. 일봉 연구, 1분봉 수집, 모의 주문 실행기는 이 공통 계약을 사용하도록 전환했다.

외부 주문이나 계좌 조회 없이 실행한 계약 스모크 테스트는 운영·모의 도메인 선택, OAuth 요청 본문, 초기·후속 연속조회 헤더, 국내주식 지정가 주문 본문을 포함한 6개 검사를 통과했다. 다음 거래일에는 기존 예약 실행이 실제 ka10080·ka10081 수집과 모의 주문 체결 동기화까지 이 계약으로 수행한다.

## 공식 출처

1. <https://openapi.kiwoom.com/guide/apiguide?dummyVal=0>
2. <https://openapi.kiwoom.com/m/guide/apiguide?jobTpCode=13>
3. <https://openapi.kiwoom.com/m/guide/apiguide?jobTpCode=15>
