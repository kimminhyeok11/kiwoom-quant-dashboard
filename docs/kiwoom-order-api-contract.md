# 키움 국내주식 주문 실행 계약

로컬 자동 주문 실행기는 사용자 컴퓨터의 지정 IP에서만 키움 REST API를 호출한다. 공개 웹 서비스는 주문 계획과 실행 결과를 보존할 뿐, 브라우저에서 주문 비밀값이나 직접 주문 요청을 만들지 않는다.

| 구분 | API ID | 경로 | 요청 핵심 필드 |
| --- | --- | --- | --- |
| 주식 매수 | `kt10000` | `POST /api/dostk/ordr` | `dmst_stex_tp`, `stk_cd`, `ord_qty`, `ord_uv`, `trde_tp` |
| 주식 매도 | `kt10001` | `POST /api/dostk/ordr` | `dmst_stex_tp`, `stk_cd`, `ord_qty`, `ord_uv`, `trde_tp` |
| 주문·체결 조회 | `kt00007` | `POST /api/dostk/acnt` | `ord_dt`, `qry_tp`, `stk_bond_tp`, `sell_tp`, `stk_cd`, `fr_ord_no`, `dmst_stex_tp` |
| 계좌 평가·잔고 | `kt00018` | `POST /api/dostk/acnt` | `qry_tp`, `dmst_stex_tp` |

자동 실행기는 `AUTO_EXECUTION_ENABLED`, `KIWOOM_ORDER_TRANSMISSION_ENABLED`, `KIWOOM_FIXED_IP_REGISTERED`가 모두 `true`일 때만 주문 요청을 시도한다. 그 외에는 `disabled` 상태만 기록한다. 매수 계획은 당일의 활성 정책, 장중 실제 신호 및 실제 관찰 가격을 사용하며, 이미 제출된 주문의 중복 키를 로컬에 보존한다. 매도는 정책의 익절·손절 기준 충족 시에만 생성하고, 체결 조회가 전량 체결을 확인한 이후에만 로컬 손익 이력과 서버 포지션을 갱신한다.

공식 문서 기준으로 `trde_tp`는 보통(`0`), 시장가(`3`) 등 주문 유형을 나타낸다. 현재 실행기는 가격·수량이 고정된 보통 지정가 주문만 사용한다. 주문 상태가 미체결이면 다음 실행 주기에 체결 조회를 재개하지만, 동일 중복 키의 신규 주문은 다시 전송하지 않는다.

## 모의투자 모드

키움 공식 `kt10000` 가이드에 따르면 국내주식 모의투자 주문은 `https://mockapi.kiwoom.com` 도메인에서 제공되며 KRX 주문만 지원한다. 로컬 실행기의 `KIWOOM_API_MODE=mock`은 OAuth·계좌·체결·주문 호출 모두를 이 모의 도메인으로 전환한다. `live`와 `mock` 이외의 값은 실행 시작 전에 오류로 중단한다. 모의 계좌라도 활성 정책·당일 신호·중복 키·킬 스위치 조건을 모두 통과해야 주문 요청을 시도한다.

## 참고

[1] [키움 REST API — 주식 매수주문 `kt10000`](https://openapi.kiwoom.com/m/guide/apiguide?jobTpCode=13)

[2] [키움 REST API — 국내주식 주문 API 목록](https://openapi.kiwoom.com/guide/index?dummyVal=0)
