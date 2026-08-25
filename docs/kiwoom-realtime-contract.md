# 키움 국내주식 실시간 체결 계약

## 공식 범위

키움 공식 국내주식 실시간시세 문서는 운영 WebSocket 엔드포인트를 `wss://api.kiwoom.com:10000/api/dostk/websocket`, 모의투자 엔드포인트를 `wss://mockapi.kiwoom.com:10000/api/dostk/websocket`으로 제시한다. 모의투자 WebSocket은 KRX만 지원한다.[1]

주식체결 `0B`는 `REG`와 `REMOVE` 메시지로 관리한다. 등록 메시지는 `grp_no`, `refresh`, `data[{ item, type }]`를 사용하며, `item`은 KRX 종목 코드 또는 거래소 접미사가 붙은 NXT(`_NX`)·SOR(`_AL`) 종목 코드다. `refresh`가 `0`이면 기존 등록을 해지하고, `1`이면 기존 등록을 유지한다.[1]

실시간 `REAL` 수신값에서는 현재가(`10`), 전일대비(`11`), 등락률(`12`), 체결량(`15`), 누적거래량(`13`), 누적거래대금(`14`), 시가·고가·저가(`16`·`17`·`18`)를 사용한다. 누적거래대금 `14`의 공식 단위는 백만원이므로 내부 원화 단위로 변환한다.[1]

## 구현 경계

`server/kiwoom/realtime.ts`는 공식 메시지 계약의 입력 검증·등록·해제·0B 수신값 정규화를 제공한다. 이 모듈은 아직 WebSocket을 실제로 열지 않으며, 서버 고정 출발지 IP가 키움 지정 단말에 등록되고 OAuth 토큰 발급이 성공한 뒤에만 연결·인증·재연결을 읽기 전용으로 검증한다.

외부 공개 예제는 WebSocket 클라이언트 생성에 OAuth 접근 토큰을 사용한다는 점을 보여 주지만, 실제 운영 연결의 토큰 전달 세부 형식은 키움 공식 서버에서 성공 응답을 통해서만 확정한다. 따라서 예제의 비공식 동작을 근거로 인증 형식을 추정하거나 주문 경로에 사용하지 않는다.[2]

## 순위·조건검색 계약

공식 거래대금 순위 `ka10032`는 REST `POST /api/dostk/rkinfo`를 사용하며, 접근 토큰·`api-id`·연속조회 헤더와 시장·관리종목·거래소 구분을 요청한다. 응답의 거래대금은 백만원 단위이므로 내부 원화 단위로 변환해야 한다.[3]

공식 일반 조건검색 `ka10172`는 WebSocket `CNSRREQ` 메시지로 조건식 목록 조회 후 사용할 수 있다. 검색 결과의 종목코드(`9001`)는 1자리 접두어와 6자리 종목코드로 구성되며, 등락률(`12`)은 `00001500`이 `+1.50%`를 뜻하는 고정 소수 형식이다.[4]

## References

[1] [키움 REST API — 국내주식 실시간 체결 0B](https://openapi.kiwoom.com/m/guide/apiguide?jobTp=FS_JOB_TP&jobTpCode=15&apiId=0B)

[2] [bamjun/kiwoom-rest-api — 공개 WebSocket 사용 예시](https://github.com/bamjun/kiwoom-rest-api)

[3] [키움 REST API — 거래대금상위요청 ka10032](https://openapi.kiwoom.com/m/guide/apiguide?jobTpCode=05&apiId=ka10032)

[4] [키움 REST API — 조건검색 요청 일반 ka10172](https://openapi.kiwoom.com/m/guide/apiguide?jobTpCode=15&apiId=ka10172)
