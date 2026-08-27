# 개발 컨벤션 & AI 작업 가이드

## 코드 작성 규칙

### 서버 (TypeScript)
- tRPC 라우터는 `server/routers/` 에 작성
- 새 라우터는 `server/routers.ts`의 appRouter에 등록
- DB 접근은 반드시 `getDb()` → null 체크 후 사용
- 스키마 변경은 `drizzle/schema.ts` 수정 → `npx drizzle-kit generate` → 마이그레이션
- 스케줄러 핸들러는 `server/scheduled/`에 작성, `server/_core/index.ts`에 등록
- 에러는 TRPCError로 래핑 (code: NOT_FOUND, PRECONDITION_FAILED 등)

### 클라이언트 (React)
- 컴포넌트는 `client/src/components/`에 작성
- tRPC 호출: `trpc.라우터.프로시저.useQuery()` / `.useMutation()`
- UI: shadcn/ui 기반 (`client/src/components/ui/`)
- 라우팅: wouter의 `useLocation()` 사용
- 스타일: TailwindCSS, 다크 테마 기본 (slate 계열 배경)

### 공유 코드
- `shared/` 폴더: 서버+클라이언트 양쪽에서 사용하는 타입/유틸
- 예: `shared/trading.ts` (ConditionRule, ConditionExpressionGroup 타입)

## 기존 기능 수정 시 주의사항

### 절대 중복 작성하지 말 것
1. **텔레그램 알림** → `server/_core/notification.ts` 사용 (sendTelegram, notifyTrade 등)
2. **주문 생성** → `server/localResearchNode.ts`의 execution-sync 또는 `orders` 라우터 사용
3. **포지션 조회** → `mockTrading.positions` 또는 positionSnapshots 테이블 직접 쿼리
4. **정책 조회** → `autoTradePolicies` 테이블 (status='active')
5. **조건식 평가** → `server/quant/conditions.ts`의 evaluateExpression 사용
6. **백테스트** → `server/quant/backtest.ts` (runDailyBacktest, runIntradayBacktest)
7. **성과 분석** → `performanceTracker` 라우터 사용

### 독립 스크립트 vs 서버 통합
- **서버에 통합**: 스케줄러 작업, API로 노출할 기능, DB 접근이 필요한 자동화
- **독립 스크립트 (scripts/)**: 일회성 데이터 검증, 마이그레이션, 디버깅 용도만

## 빌드 & 배포

```bash
# 개발 서버 (Vite HMR + Express)
pnpm dev

# 타입 체크
npx tsc --noEmit --skipLibCheck

# 프로덕션 빌드
pnpm build
# → client: vite build → dist/public/
# → server: esbuild → dist/index.js (standalone)
# → vercel: esbuild → api/index.mjs (serverless)

# DB 마이그레이션
npx drizzle-kit generate
npx drizzle-kit push
```

## 새 기능 추가 체크리스트

1. [ ] 기존에 유사 기능이 있는지 라우터 목록 확인
2. [ ] DB 스키마 변경 필요하면 drizzle/schema.ts 수정
3. [ ] 서버 라우터 작성 → routers.ts에 등록
4. [ ] 스케줄러면 scheduled/ 핸들러 → _core/index.ts 등록
5. [ ] 클라이언트 UI 필요하면 components/ 작성
6. [ ] 텔레그램 알림 필요하면 notification.ts 함수 호출
7. [ ] tsc --noEmit 확인
8. [ ] 이 문서 업데이트 (해당 시)

## 자동매매 안전장치 체계

```
tradingProfiles.killSwitch = true  → 모든 자동 주문 중지
tradingProfiles.autoTradeEnabled = false → 자동매매 비활성
autoTradePolicies.status != 'active' → 주문 계획 생성 안함
dailyLossLimitPercent 초과 → 킬스위치 자동 발동
maxConcurrentPositions 도달 → 신규 매수 차단
maxOpenGapPercent 초과 → 갭 방어로 진입 취소
```

## 피드백 루프 동작 원리

매매를 할수록 성과가 자동 개선되는 구조:

1. **데이터 축적**: 모든 체결이 orderIntents + orderExecutions에 기록
2. **주간 분석**: feedbackLoop 핸들러가 라운드트립 구성 → 성과 지표 산출
3. **파라미터 최적화**: 실제 손실 P75 → SL, 수익 중간값 → TP, 실제 승률 → Kelly
4. **자동 적용**: autoTradeEnabled이면 새 정책 버전 자동 생성 (보수적 ±1% 제한)
5. **전략 선별**: 전략 카드별 실전 승률/수익률 순위 → 상위 카드 우선 배정
6. **텔레그램 보고**: 모든 조정 사항을 운영자에게 즉시 알림
