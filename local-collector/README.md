# 키움 로컬 수집기

24시간 켜진 PC에서 키움 REST API 데이터를 수집하고 서버(Supabase)에 동기화하는 독립 스크립트.

## 설치

```powershell
cd local-collector
copy .env.example .env
# .env 파일을 편집해서 실제 키/토큰 입력
```

**Node.js 18+ 필요** (별도 npm install 불필요 - 외부 의존성 없음)

## 사전 준비

1. https://openapi.kiwoom.com 에서 API 사용 신청
2. 계좌 App Key 관리에서 현재 PC의 공인 IP 등록
3. 모의투자 App Key 관리에서도 동일하게 IP 등록

## 설정 (.env)

```env
# 실투자 키 (데이터 수집 전용 - 주문 안함)
KIWOOM_LIVE_APP_KEY=xxxxx
KIWOOM_LIVE_APP_SECRET=xxxxx

# 모의투자 키 (자동 주문용)
KIWOOM_MOCK_APP_KEY=xxxxx
KIWOOM_MOCK_APP_SECRET=xxxxx
KIWOOM_MOCK_ACCOUNT=81326469

# 서버 연결
SERVER_URL=https://your-app.vercel.app
SERVER_TOKEN=your-token-here
```

## 사용법

### IP 확인
```powershell
node collector.mjs --mode=check-ip
```
현재 공인 IP를 표시합니다. 이 IP를 키움 OpenAPI에 등록하세요.

### 일봉 수집
```powershell
node collector.mjs --mode=daily
```
거래대금 상위 20종목의 일봉(최대 600개)을 수집해서 서버에 동기화합니다.

### 분봉 수집 (장 중)
```powershell
node collector.mjs --mode=minute
```
현재 유니버스의 1분봉을 수집합니다. 장 시간(09:00~15:30)에만 동작.

### 자동 모드
```powershell
node collector.mjs
```
시간대에 따라 자동으로 분봉/일봉을 수집합니다.

### 모의투자
```powershell
node mock-trader.mjs           # 주문 계획 실행 + 체결 동기화
node mock-trader.mjs --check   # 잔고/체결 조회만
```

## Windows 자동 실행 등록

관리자 권한 PowerShell에서:
```powershell
node install-scheduler.mjs
```

등록되는 작업:
- **KiwoomCollector_DailyBars**: 매일 16:00 일봉 수집
- **KiwoomCollector_MinuteBars**: 09:00~15:35 1분 간격 분봉 수집
- **KiwoomCollector_CheckIP**: 매일 08:30 IP 확인
- **KiwoomMockTrader**: 09:05~15:20 5분 간격 모의투자 실행
- **KiwoomMockTrader_Sync**: 15:40 잔고 최종 동기화

## IP 변경 대응

가정용 유동 IP라 바뀔 수 있습니다.
- 수집기 시작 시 자동으로 공인 IP 감지
- IP가 바뀌면 로그에 경고 출력
- https://openapi.kiwoom.com → 계좌 App Key 관리 → IP 등록현황에서 새 IP 추가

**최대 10개 IP 등록 가능**하므로, 자주 바뀌지 않으면 여러 개를 미리 등록해둘 수도 있습니다.

## 데이터 흐름

```
[이 PC] 키움 REST API 호출
    ↓
분봉/일봉 수집
    ↓
서버 동기화 (POST /api/local-research-node/*)
    ↓
[Vercel + Supabase] 데이터 저장
    ↓
웹 대시보드에서 차트/백테스트/모의투자 확인
```
