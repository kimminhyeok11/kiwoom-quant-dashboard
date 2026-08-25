# Implementation Plan: Advanced Condition Builder

## Overview

기존 원클릭 백테스트 시스템을 확장하여 고급 조건식 작성기 페이지를 구현한다. shared/trading.ts의 기존 타입을 확장하고, 30개 이상 지표를 카탈로그로 정의한 뒤, 트리 네비게이션 · 파라미터 패널 · Expression Builder · 백테스트 결과 패널 · 프리셋 라이브러리를 갖춘 전체 페이지를 프론트엔드와 백엔드에 함께 구축한다. TypeScript 기반.

## Tasks

- [x] 1. Shared 타입 확장 및 Indicator Catalog 정의
  - [x] 1.1 shared/trading.ts에 신규 타입 추가
    - `IndicatorType` 유니온 타입 확장 (기존 18종 + 신규 16종)
    - `AvailabilityStatus`, `IndicatorCategory`, `IndicatorParameterSchema`, `IndicatorDefinition` 타입 추가
    - 기존 `ConditionRule`, `DetailedConditionRule`, `ConditionExpressionGroup` 타입과 호환 유지
    - _Requirements: 1.3, 1.4, 1.5, 1.6, 1.7, 2.1_

  - [x] 1.2 shared/indicatorCatalog.ts 생성
    - 5대 카테고리(trend, momentum, volatility, volume, candle_pattern) 아래 33개 이상 지표 정의
    - 각 지표의 parameters, defaultComparator, defaultWeight, availability 설정
    - `CATEGORY_LABELS`, `getAvailableIndicators()`, `getIndicatorsByCategory()` 헬퍼 함수 구현
    - _Requirements: 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 5.1_

  - [x] 1.3 shared/expressionValidation.ts 생성
    - `calculateExpressionDepth()` 함수 구현 (재귀적 깊이 계산)
    - `countActiveRules()` 함수 구현
    - `validateExpression()` 함수 구현 (NO_ACTIVE_RULES, MAX_DEPTH_EXCEEDED 에러 반환)
    - `MAX_EXPRESSION_DEPTH = 4` 상수 정의
    - _Requirements: 3.3, 4.2_

  - [x] 1.4 shared/parameterValidation.ts 생성
    - `validateParameterValue()` 함수 구현 (min/max, select 옵션 검증)
    - `validateAllParameters()` 함수 구현
    - _Requirements: 2.2, 2.6_

  - [ ]* 1.5 Property 테스트: Catalog Category Completeness
    - **Property 1: Catalog Category Completeness**
    - 모든 IndicatorCategory에 최소 1개 지표가 있고, 전체 지표 수가 30개 이상인지 검증
    - **Validates: Requirements 1.3, 1.4, 1.5, 1.6, 1.7**

  - [ ]* 1.6 Property 테스트: Parameter Schema Defaults Pass Validation
    - **Property 3: Parameter Schema Defaults Pass Validation**
    - 모든 지표의 기본값으로 config 객체를 만들면 validateAllParameters를 통과하는지 검증
    - **Validates: Requirements 2.1, 2.6**

  - [ ]* 1.7 Property 테스트: Parameter Bounds Rejection
    - **Property 4: Parameter Bounds Rejection**
    - min/max 범위 밖의 값이 validateParameterValue에 의해 거부되는지 검증
    - **Validates: Requirements 2.2**

  - [ ]* 1.8 Property 테스트: Expression Depth Invariant
    - **Property 6: Expression Depth Invariant**
    - validateExpression을 통과한 expression의 깊이가 항상 ≤ 4인지 검증
    - **Validates: Requirements 3.3**

  - [ ]* 1.9 Property 테스트: Empty Expression Validation Rejection
    - **Property 8: Empty Expression Validation Rejection**
    - 모든 leaf rule이 enabled=false인 expression이 NO_ACTIVE_RULES 에러를 반환하는지 검증
    - **Validates: Requirements 4.2**

- [x] 2. Checkpoint - Shared 레이어 검증
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Server: tRPC conditionBuilder 라우터 구현
  - [x] 3.1 server/routers/conditionBuilder.ts 생성
    - `save` mutation: strategyPresets에 조건식 저장 (이름, 설명, expressionJson)
    - `list` query: userId 기준 createdAt DESC 정렬 목록 반환
    - `load` query: id 기준 단일 프리셋 조회
    - `delete` mutation: id 기준 삭제
    - `duplicate` mutation: 복제 저장 ("[이름] 복사" 형태)
    - `rename` mutation: 이름 변경
    - `checkNameExists` query: 중복 이름 체크
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 3.2 conditionBuilder.runBacktest mutation 구현
    - 입력: expressionJson, holdingDays, feeRate, slippageBps
    - 서버측 validateExpression 재검증
    - 기존 localResearchDailyBars에서 랜덤 종목/기간 선택 (oneClickBacktest 패턴 재사용)
    - runDailyBacktest 호출 후 결과(totalReturn, winRate, maxDrawdown, tradeCount) 반환
    - _Requirements: 4.1, 4.3, 4.4, 4.5, 4.6_

  - [x] 3.3 server/routers.ts에 conditionBuilder 라우터 등록
    - `appRouter`에 `conditionBuilder: conditionBuilderRouter` 추가
    - _Requirements: 7.1_

  - [ ]* 3.4 Property 테스트: Preset List Ordering
    - **Property 12: Preset List Ordering**
    - list 쿼리 결과의 createdAt이 비증가(non-increasing) 순서인지 검증
    - **Validates: Requirements 6.2**

- [x] 4. Server: Random Generator 확장
  - [x] 4.1 server/quant/evolution.ts 확장
    - `ALL_EXTENDED_RULE_TYPES` 배열을 INDICATOR_CATALOG의 available 지표로 생성
    - `createRule` 함수에 신규 지표 타입 분기 추가 (INDICATOR_CATALOG의 min/max 기반 랜덤 파라미터)
    - AND/OR 논리 연산자 무작위 배정 로직 구현
    - 기존 18종 지표 로직은 유지하면서 확장
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ]* 4.2 Property 테스트: Availability Status Controls Access
    - **Property 2: Availability Status Controls Access**
    - coming_soon 지표가 랜덤 풀에서 제외되고, available 지표는 포함되는지 검증
    - **Validates: Requirements 1.8, 1.9, 5.1, 8.3**

  - [ ]* 4.3 Property 테스트: Random Generator Parameter Bounds
    - **Property 10: Random Generator Parameter Bounds**
    - createRule이 생성한 모든 ConditionRule의 파라미터가 INDICATOR_CATALOG의 [min, max] 범위 내인지 검증
    - **Validates: Requirements 5.2, 5.5**

- [x] 5. Checkpoint - Server 레이어 검증
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Client: CategoryTree 및 ParameterPanel 컴포넌트
  - [x] 6.1 client/src/components/condition-builder/CategoryTree.tsx 생성
    - INDICATOR_CATALOG에서 카테고리별 그룹화 렌더링
    - Radix Accordion으로 펼침/접힘 구현
    - coming_soon 노드: opacity-50, cursor-not-allowed, "준비중" Badge
    - 활성 노드: 클릭 시 onSelectIndicator, 드래그 시 onDragStart 콜백
    - _Requirements: 1.1, 1.2, 1.8, 1.9_

  - [x] 6.2 client/src/components/condition-builder/ParameterPanel.tsx 생성
    - 선택된 지표의 parameters 스키마 기반 동적 폼 렌더링
    - 각 파라미터별 min/max 범위 인라인 검증 (shared/parameterValidation.ts 활용)
    - 비교연산자 7종 드롭다운 (gt, gte, lt, lte, crosses_above, crosses_below, between)
    - 룩백 기간(lookbackDays) 숫자 입력
    - onChange로 부모 state에 실시간 반영
    - coming_soon 지표 선택 시 파라미터 폼 비활성화
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 8.2_

- [x] 7. Client: ExpressionBuilder 컴포넌트
  - [x] 7.1 client/src/components/condition-builder/ExpressionBuilder.tsx 생성
    - 재귀적 트리 렌더링 (ConditionExpressionGroup → children)
    - AND/OR/NOT 논리 연산자 선택 토글
    - dnd-kit 기반 드래그 앤 드롭으로 노드 이동 (순서 및 소속 그룹 변경)
    - 중첩 깊이 4단계 제한 (초과 시 "그룹 추가" 비활성화 + 툴팁)
    - 빈 그룹: placeholder + "조건 추가" CTA 표시
    - 각 rule 카드: 지표명 | 파라미터 요약 | 활성/비활성 토글 | 삭제 버튼
    - NOT 그룹 시각적 구분 (반전 표시)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 8. Client: BacktestResultPanel 및 PresetLibrary 컴포넌트
  - [x] 8.1 client/src/components/condition-builder/BacktestResultPanel.tsx 생성
    - 실행 전: 보유기간/수수료/슬리피지 설정 폼
    - 실행 중: skeleton + spinner + 중복 실행 차단
    - 결과: 수익률, 승률, MDD, 거래 횟수 카드 형태 표시
    - 에러: 오류 메시지 + 재시도 버튼
    - _Requirements: 4.3, 4.4, 4.5, 4.6_

  - [x] 8.2 client/src/components/condition-builder/PresetLibrary.tsx 생성
    - trpc.conditionBuilder.list 호출로 저장된 프리셋 목록 (createdAt DESC)
    - 각 항목: 이름, 마지막 백테스트 요약(수익률, 승률)
    - 컨텍스트 메뉴: 이름변경, 복제, 삭제 (trpc mutation 연결)
    - 저장 시 중복 이름 감지 → 덮어쓰기 확인 AlertDialog
    - coming_soon 지표 포함 시 "일부 조건 사용 불가" 경고 Badge
    - onLoad 콜백으로 선택된 expression 전달
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 8.4_

  - [ ]* 8.3 Property 테스트: Unavailable Indicator Warning Detection
    - **Property 13: Unavailable Indicator Warning Detection**
    - coming_soon 상태인 지표를 포함한 저장된 expression이 경고 플래그를 가지는지 검증
    - **Validates: Requirements 8.4**

- [x] 9. Client: ConditionBuilderPage 및 라우팅 통합
  - [x] 9.1 client/src/pages/ConditionBuilderPage.tsx 생성
    - 3-column 레이아웃: CategoryTree | ExpressionBuilder + ParameterPanel | BacktestResultPanel
    - useReducer로 expression tree state 관리
    - 백테스트 실행 버튼 + validateExpression 연동
    - PresetLibrary 사이드 패널 통합
    - _Requirements: 7.1, 4.1, 4.2_

  - [x] 9.2 MainDashboard.tsx에 "조건식 작성기" 탭 추가
    - TABS 배열에 `{ id: "condition-builder", label: "조건식 작성기", ... }` 추가
    - Tab 타입에 "condition-builder" 추가
    - 탭 선택 시 ConditionBuilderPage 컴포넌트 렌더링
    - _Requirements: 7.2, 7.3_

  - [x] 9.3 원클릭 백테스트에서 조건식 편집 연동
    - OneClickBacktest 결과에서 "조건식 편집" 버튼 추가
    - 클릭 시 해당 expression을 ConditionBuilderPage 편집 모드로 전달
    - _Requirements: 7.4_

- [x] 10. Final Checkpoint - 전체 통합 검증
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- 기존 shared/trading.ts의 ConditionRule 타입은 하위호환을 유지하면서 IndicatorType으로 확장
- server/quant/evolution.ts 확장 시 기존 createRule 로직은 건드리지 않고 신규 분기만 추가
- dnd-kit은 이미 프로젝트에서 사용 가능한 라이브러리 (미설치 시 설치 필요)
- 백테스트 실행은 기존 oneClickBacktest의 랜덤 종목/기간 선택 패턴을 재사용
- coming_soon 지표는 UI에서만 비활성화하고, 향후 availability 상태만 변경하면 활성화됨
- 각 태스크는 독립적으로 빌드 가능하도록 설계 (타입 에러 0건 목표)
- Property tests validate universal correctness properties from the design document

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4"] },
    { "id": 2, "tasks": ["1.5", "1.6", "1.7", "1.8", "1.9"] },
    { "id": 3, "tasks": ["3.1", "4.1", "6.1", "6.2"] },
    { "id": 4, "tasks": ["3.2", "3.3", "4.2", "4.3", "7.1"] },
    { "id": 5, "tasks": ["3.4", "8.1", "8.2"] },
    { "id": 6, "tasks": ["8.3", "9.1"] },
    { "id": 7, "tasks": ["9.2", "9.3"] }
  ]
}
```
