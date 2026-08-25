# 키움 API 연동 조사 기록

## 2026-08-12 확인 사항

키움증권의 공식 REST API 포털은 `https://openapi.kiwoom.com/`에서 제공되며, 검색 결과상 REST API 소개·이용안내·모의투자 안내·API 가이드·오류코드 메뉴를 제공한다. 공개 안내는 계좌 보유 및 HTS ID 연결 후 API 사용신청이 필요하다고 설명한다.

브라우저로 포털 본문을 조회하는 과정에서는 `CD-14005` 오류 페이지가 반환되었지만, 공식 가이드의 정적 추출을 통해 핵심 사양을 확인했다. 접근 토큰은 운영 도메인 `https://api.kiwoom.com` 또는 모의투자 도메인 `https://mockapi.kiwoom.com`의 `POST /oauth2/token`에 `grant_type=client_credentials`, `appkey`, `secretkey`를 JSON으로 전송해 발급한다. 응답에는 `token_type`, `token`, `expires_dt`가 포함된다.

국내주식 계좌번호 조회는 `POST /api/dostk/acnt`로 제공되며 Bearer 접근 토큰과 `api-id` 헤더를 사용한다. 공식 가이드는 국내주식의 거래대금·등락률·거래량 순위, 일봉 차트(`ka10081`), 조건검색, 계좌/잔고/체결, 매수 주문(`kt10000`)과 매도 주문(`kt10001`)을 제공한다고 열거한다. 실시간 시세 및 조건검색은 운영 `wss://api.kiwoom.com:10000/api/dostk/websocket`, 모의 `wss://mockapi.kiwoom.com:10000/api/dostk/websocket`으로 제공되며 모의투자는 KRX 지원으로 한정된다고 명시한다.

정확한 주문 본문, 호출 한도, 토큰 폐기·재발급의 예외 처리 및 실시간 구독 메시지 형식은 배포 전 각 TR의 개별 공식 명세와 모의투자 환경에서 검증한다.

## 구현 원칙

자격 증명은 브라우저가 아닌 서버 환경 변수에만 저장하고, 앱 화면에는 마스킹된 연결 상태와 토큰 만료 정보만 표시한다. 실주문은 모의매매 검증과 별도의 사용자 확인을 통과한 건에 한해 API 어댑터가 요청하도록 설계한다.

## 공식 출처

- [접근토큰 발급 명세](https://openapi.kiwoom.com/guide/apiguide)
- [국내주식 조건검색·실시간·차트·주문 카탈로그](https://openapi.kiwoom.com/m/guide/apiguide?jobTpCode=15)
- [계좌번호 조회 명세](https://openapi.kiwoom.com/m/guide/apiguide?jobTpCode=08)

## 개별 TR 확인 기록

공식 문서의 `kt10000` 매수주문 명세는 운영 도메인 `https://api.kiwoom.com`의 `POST /api/dostk/ordr` 및 `api-id: kt10000`을 지정한다. 요청 본문은 `dmst_stex_tp`(KRX/NXT/SOR), `stk_cd`, `ord_qty`, 선택 `ord_uv`, `trde_tp`, 선택 `cond_uv`로 구성되며 응답은 `ord_no`와 거래소 구분을 포함한다. 이 요청은 고정 IP 등록·OAuth·계좌 확인·개별 주문 확인·한도 검증을 모두 통과한 뒤에만 어댑터에 연결한다.

`kt00007` 주문체결 상세조회는 `POST /api/dostk/acnt`와 `api-id: kt00007`을 사용하며 주문일자, 조회구분, 종목·매도수 구분 및 거래소 구분을 받는다. 응답에는 주문번호, 종목코드·명, 주문·체결 수량 및 단가, 미체결 수량, 주문·확인 시각 등이 포함된다. 일봉 차트 `ka10081` 문서는 종목코드, 기준일자, 수정주가 적용 구분을 입력으로 하고 일자별 현재가·시가·고가·저가·거래량·거래대금 값을 반환한다.

- [주식 일봉차트조회 ka10081](https://openapi.kiwoom.com/m/guide/apiguide?jobTpCode=14&apiId=ka10081)
- [주식 매수주문 kt10000](https://openapi.kiwoom.com/m/guide/apiguide?jobTpCode=13&apiId=kt10000)
- [계좌별주문체결내역상세 kt00007](https://openapi.kiwoom.com/m/guide/apiguide?jobTpCode=08&apiId=kt00007)

계좌 포지션 동기화에는 공식 `kt00005` 체결잔고요청 또는 `kt00018` 계좌평가잔고내역요청을 사용한다. 두 요청은 `POST /api/dostk/acnt`와 Bearer 토큰·`api-id` 헤더를 사용한다. `kt00005`는 거래소 구분을 받고 예수금, 주문가능현금, 평가금액, 총손익과 종목별 현재잔고·현재가·매입단가·평가손익·손익률을 반환한다. `kt00018`은 조회구분과 거래소 구분을 받고 총매입·평가·손익·추정예탁자산 및 종목별 보유·매매가능 수량, 매입가, 현재가, 평가손익·수익률을 반환한다.

- [체결잔고요청 kt00005](https://openapi.kiwoom.com/m/guide/apiguide?jobTpCode=08&apiId=kt00005)
- [계좌평가잔고내역요청 kt00018](https://openapi.kiwoom.com/m/guide/apiguide?jobTpCode=08&apiId=kt00018)

공식 `ka10081` 일봉차트조회 명세는 운영 WebSocket `wss://api.kiwoom.com:10000/api/dostk/websocket`을 사용하며, 종목코드(`stk_cd`), 기준일자(`base_dt`, YYYYMMDD), 수정주가 구분(`upd_stkpc_tp`)을 요청한다. 응답은 종목 코드와 일자별 현재가·시가·고가·저가, 거래량, 거래대금(백만원 단위), 전일대비 및 회전율을 포함한다. 실데이터 차트·조건 평가·백테스트는 이 원본 값을 정규화한 단일 `DailyBar` 구조를 공통 사용해야 한다.

- [주식일봉차트조회 ka10081](https://openapi.kiwoom.com/m/guide/apiguide?jobTpCode=14&apiId=ka10081)
