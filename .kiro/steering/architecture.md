# 프로젝트 아키텍처 가이드

## 개요

키움 퀀트 대시보드 — 한국 주식 자동매매 연구·실행 플랫폼.
조건식 설계 → 백테스트 검증 → 모의/실투 자동 실행 → 성과 피드백 루프.

## 기술 스택

| 레이어 | 기술 |
|--------|------|
| 프론트엔드 | React 19 + Vite 7 + TailwindCSS 4 + wouter (라우팅) |
| 상태관리 | tRPC + TanStack Query v5 (httpBatchLink) |
| 백엔드 | Express + tRPC (27개 라우터) |
| DB | PostgreSQL (Supabase) + Drizzle ORM |
| 배포 | Vercel (서버리스 api/index.mjs) + 로컬 dev 서버 |
| 브로커 | 키움증권 Open API (OAuth2, REST) |
| 알림 | Telegram Bot API |
| 스케줄러 | 외부 cron → POST /api/scheduled/* |

## 디렉토리 구조

```
├── api/              # Vercel 서버리스 엔트리 (esbuild 번들)
├── client/           # React SPA
│   └── src/
│       ├── components/   # UI 컴포넌트 (50+)
│       ├── pages/        # 라우팅 페이지
│       └── lib/          # trpc, 유틸
├── server/           # 백엔드 소스
│   ├── _core/        # 인프라 (Express, tRPC, OAuth, 텔레그램, 환경변수)
│   ├── routers/      # tRPC 라우터 (27개)
│   ├── scheduled/    # 스케줄러 핸들러 (cron 엔드포인트)
│   ├── kiwoom/       # 키움 API 클라이언트
│   └── quant/        # 조건식 평가, 백테스트, 진화 알고리즘
├── drizzle/          # DB 스키마 + 마이그레이션 (39개)
├── shared/           # 서버/클라이언트 공유 타입/유틸
├── scripts/          # 독립 실행 스크립트 (데이터 수집, 검증)
└── C:\kiwoom\        # 로컬 PC 수집기 (별도 폴더 — 키움 단말기 접근)
```

## 핵심 데이터 흐름

### 1. 전략 연구 파이프라인
```
조건식 생성 (condition-builder / evolution)
  → 1분봉/일봉 백테스트 (backtest.ts / minuteValidation.ts)
  → 아레나 배틀 (minuteResearch: sweep → promoted)
  → 전략 카드 발행 (strategyCards)
```

### 2. 자동매매 실행 흐름
```
로컬 수집기 → GET /api/local-research-node/auto-order-plan
  (서버: 활성 정책 + 후보 포지션 → 주문 계획 생성)
  → 수집기가 키움 API로 주문 실행
  → POST /api/local-research-node/execution-sync
  (서버: orderIntents + positionSnapshots 저장)
  → 텔레그램 알림 (notifyTrade)
```

### 3. 성과 피드백 루프
```
POST /api/scheduled/feedback-loop (매주 실행)
  → 30일 체결 내역 라운드트립 분석
  → 승률/손익비/Sharpe/슬리피지 계산
  → 최적 SL/TP/Kelly 재계산
  → 정책 자동 업데이트 (±1% 제한)
  → 텔레그램 조정 보고
```

### 4. 일간 보고서
```
POST /api/scheduled/daily-report (매일 15:30 KST)
  → 당일 거래 집계 + 포트폴리오 현황
  → 아레나 상태 + 데이터 커버리지
  → 텔레그램 종합 보고서 전송
```

## tRPC 라우터 목록 (server/routers.ts)

| 라우터 | 역할 |
|--------|------|
| `quant` | 조건식 평가, 시세 분석 |
| `presets` | 전략 프리셋 CRUD |
| `tradingProfile` | 매매 프로필, 안전장치 설정 |
| `orders` | 주문 생성→확인→키움 전송 (실투) |
| `backtests` | 일봉 백테스트 |
| `account` | 키움 계좌 동기화 |
| `rankings` | 전략 랭킹 |
| `research` | 연구 데이터셋 |
| `autonomousResearch` | 자동 연구 (일봉 후보) |
| `paperPortfolio` | 실제 가격 기반 모의 포트폴리오 |
| `minuteResearch` | 아레나 배틀 (1분봉 대규모 검증) |
| `strategyCards` | 전략 카드 공개/수집 |
| `mockTrading` | 모의투자 현황 (포지션/주문/정책) |
| `conditionBuilder` | 조건식 빌더 |
| `intradayBacktest` | 분봉 백테스트 |
| `patternLearning` | 패턴 분석 |
| `dataCollection` | 데이터 수집 제어 |
| `performanceTracker` | 성과추적 + 피드백루프 트리거 |
| `strategyQuality` | 전략 품질 평가 |
| `bulkMinuteCollection` | 대량 1분봉 수집 |
| `survivalResearch` | 전략 생존 분석 |
| `oneClickBacktest` | 원클릭 백테스트 |
| `chartData` | 차트 데이터 |
| `sharedDatasets` | 공유 데이터셋 |
| `profile` | 사용자 프로필 |
| `network` | 네트워크/단말기 진단 |
| `rankingRefresh` | 랭킹 갱신 |

## 스케줄러 엔드포인트 (server/_core/index.ts)

| 경로 | 핸들러 | 주기 |
|------|--------|------|
| `/api/scheduled/ranking-refresh` | rankingRefreshHandler | 매일 |
| `/api/scheduled/autonomous-research` | autonomousResearchHandler | 매일 |
| `/api/scheduled/research-governance` | researchGovernanceHandler | 매주 |
| `/api/scheduled/minute-research` | minuteResearchHandler | 매일 07:30 |
| `/api/scheduled/daily-report` | dailyReportHandler | 매일 15:30 |
| `/api/scheduled/feedback-loop` | feedbackLoopHandler | 매주 월 07:00 |

## 로컬 수집기 (C:\kiwoom\)

**별도 폴더**: `C:\kiwoom\` (프로젝트 외부, 독립 실행)

인증: `x-research-node-token` 헤더 (SERVER_TOKEN 환경변수)

### 주요 파일
| 파일 | 역할 |
|------|------|
| `mock-trader.mjs` | 자동매매 엔진 (매수+손절/익절+동기화) |
| `collector.mjs` | 데이터 수집 (분봉/일봉/자동모드) |
| `자동매매전체실행.bat` | 모의투자 1회 실행 |
| `손절익절감시.bat` | 5분 간격 포지션 감시 루프 |
| `자동수집.bat` | 시간대 자동 수집 |
| `.env` | 키움 키/서버 토큰/텔레그램 설정 |

### 실행 방법
```powershell
cd C:\kiwoom
node mock-trader.mjs              # 모의투자 전체 실행 (1회)
node mock-trader.mjs --monitor    # 손절/익절 감시만
node mock-trader.mjs --check      # 잔고 조회
node collector.mjs                # 자동 수집 (시간대 판단)
node collector.mjs --mode=minute  # 분봉 수집
node collector.mjs --mode=daily   # 일봉 수집
```

### 서버 연동 엔드포인트

| 엔드포인트 | 역할 |
|-----------|------|
| `GET /api/local-research-node/auto-order-plan` | 자동 주문 계획 조회 |
| `POST /api/local-research-node/execution-sync` | 체결+포지션 동기화 |
| `POST /api/local-research-node/sync-bars` | 봉 데이터 업로드 |
| `POST /api/local-research-node/position-snapshot` | 포지션 스냅샷 |
| `GET /api/local-research-node/collection-requests` | 수집 요청 조회 |

## 환경변수 (.env.local)

| 변수 | 용도 |
|------|------|
| `DATABASE_URL` | Supabase PostgreSQL 연결 |
| `KIWOOM_APP_KEY` / `APP_SECRET` | 키움 API 인증 |
| `KIWOOM_ACCOUNT_NUMBER` | 계좌번호 |
| `TELEGRAM_BOT_TOKEN` / `CHAT_ID` | 텔레그램 알림 |
| `LOCAL_RESEARCH_NODE_TOKEN` | 로컬 수집기 인증 |
| `NEXTAUTH_SECRET` | 세션 암호화 |

## 주요 DB 테이블 (drizzle/schema.ts)

**매매 시스템:**
- `auto_trade_policies` — 자동매매 정책 (버전 관리)
- `order_intents` — 주문 의도 (lifecycle: pending→confirmed→submitted→filled)
- `order_executions` — 체결 이벤트
- `position_snapshots` — 포지션 스냅샷
- `trading_profiles` — 매매 프로필 (안전장치)

**연구 시스템:**
- `strategy_presets` — 전략 프리셋 (rulesJson)
- `minute_research_programs/sweeps/candidates` — 아레나 배틀
- `intraday_minute_bars` — 1분봉 데이터 (200만+ 봉)
- `research_daily_bars` — 일봉 데이터

**기타:**
- `users` — 사용자
- `public_strategy_cards` — 공개 전략 카드
- `day_trade_experiments/positions` — 데이트레이드 실험
