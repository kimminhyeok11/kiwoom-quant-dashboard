# Design Document: Advanced Condition Builder

## Architecture Overview

고급 조건식 작성기는 기존 원클릭 백테스트 시스템을 확장하여, 사용자가 30개 이상의 기술적 지표를 트리로 탐색하고, AND/OR/NOT 논리 그룹으로 조합하며, 즉시 백테스트를 실행할 수 있는 전체 페이지를 제공한다.

### 레이어 구조

```
┌─────────────────────────────────────────────────────────────┐
│  Client Layer (React + TanStack Query + tRPC)               │
│  ┌─────────────┐ ┌──────────────┐ ┌───────────────────────┐ │
│  │CategoryTree │ │ParameterPanel│ │ExpressionBuilder      │ │
│  │             │ │              │ │  + BacktestResultPanel │ │
│  └─────────────┘ └──────────────┘ └───────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│  tRPC Router: conditionBuilder                              │
│  (save / load / list / delete / duplicate / runBacktest)    │
├─────────────────────────────────────────────────────────────┤
│  Server Logic Layer                                         │
│  ┌──────────────────┐ ┌──────────────────────────────────┐  │
│  │conditions.ts     │ │evolution.ts (확장된 createRule)   │  │
│  │(evaluateExpression│ │(33+ indicator types)             │  │
│  │ + 신규 지표 평가) │ └──────────────────────────────────┘  │
│  └──────────────────┘                                       │
├─────────────────────────────────────────────────────────────┤
│  Data Layer (Drizzle + PostgreSQL)                          │
│  strategyPresets (rulesJson: ConditionExpressionGroup)      │
└─────────────────────────────────────────────────────────────┘
```

---

## Component Design

### 1. Shared Types (shared/trading.ts 확장)

```typescript
// 신규 지표 타입 추가
export type IndicatorType =
  | ConditionRule["type"]  // 기존 18종
  | "macd_histogram" | "vwap" | "disparity" | "envelope" | "adx" | "dmi"
  | "williams_r" | "cci" | "new_high_low"
  | "obv" | "turnover_ma" | "volume_profile"
  | "bearish_candle_count" | "gap_up" | "gap_down" | "n_pattern";

export type AvailabilityStatus = "available" | "coming_soon";

export type IndicatorCategory = "trend" | "momentum" | "volatility" | "volume" | "candle_pattern";

export type IndicatorParameterSchema = {
  key: string;
  label: string;
  type: "number" | "select" | "boolean";
  min?: number;
  max?: number;
  step?: number;
  default: number | string | boolean;
  options?: Array<{ value: string | number; label: string }>;
  unit?: string;
};

export type IndicatorDefinition = {
  type: IndicatorType;
  label: string;
  category: IndicatorCategory;
  availability: AvailabilityStatus;
  parameters: IndicatorParameterSchema[];
  defaultComparator: ConditionComparator;
  defaultWeight: number;
  description?: string;
};
```

### 2. Indicator Catalog (shared/indicatorCatalog.ts)

상수 파일로 5대 카테고리 및 30개 이상 지표를 정의한다.

```typescript
export const INDICATOR_CATALOG: IndicatorDefinition[] = [
  // === 추세 (Trend) ===
  {
    type: "ma_position", label: "이동평균배열", category: "trend",
    availability: "available",
    parameters: [
      { key: "periods", label: "이평선 기간", type: "select", default: "5,20,60",
        options: [
          { value: "5,20", label: "5·20일" },
          { value: "5,20,60", label: "5·20·60일" },
          { value: "20,60,120", label: "20·60·120일" },
          { value: "20,60,120,240", label: "20·60·120·240일" },
        ] },
    ],
    defaultComparator: "gte", defaultWeight: 15,
  },
  {
    type: "macd_rising", label: "MACD 상승", category: "trend",
    availability: "available",
    parameters: [
      { key: "lookback", label: "룩백 봉수", type: "number", min: 2, max: 20, step: 1, default: 3 },
    ],
    defaultComparator: "gte", defaultWeight: 12,
  },
  {
    type: "macd_level", label: "MACD 레벨", category: "trend",
    availability: "available",
    parameters: [
      { key: "threshold", label: "임계값", type: "number", min: -100, max: 100, step: 0.01, default: 0 },
    ],
    defaultComparator: "gte", defaultWeight: 10,
  },
  {
    type: "macd_histogram", label: "MACD 히스토그램", category: "trend",
    availability: "coming_soon",
    parameters: [
      { key: "fast", label: "단기EMA", type: "number", min: 5, max: 50, step: 1, default: 12 },
      { key: "slow", label: "장기EMA", type: "number", min: 10, max: 100, step: 1, default: 26 },
      { key: "signal", label: "시그널", type: "number", min: 3, max: 30, step: 1, default: 9 },
    ],
    defaultComparator: "gte", defaultWeight: 10,
  },
  {
    type: "vwap", label: "VWAP", category: "trend",
    availability: "coming_soon",
    parameters: [
      { key: "period", label: "기간", type: "number", min: 1, max: 60, step: 1, default: 20 },
    ],
    defaultComparator: "gte", defaultWeight: 12,
  },
  {
    type: "disparity", label: "이격도", category: "trend",
    availability: "coming_soon",
    parameters: [
      { key: "period", label: "이평기간", type: "number", min: 5, max: 120, step: 1, default: 20 },
      { key: "threshold", label: "이격도(%)", type: "number", min: 80, max: 130, step: 0.5, default: 100 },
    ],
    defaultComparator: "gte", defaultWeight: 10,
  },
  {
    type: "envelope", label: "엔벨로프", category: "trend",
    availability: "coming_soon",
    parameters: [
      { key: "period", label: "기간", type: "number", min: 5, max: 60, step: 1, default: 20 },
      { key: "percent", label: "폭(%)", type: "number", min: 1, max: 20, step: 0.5, default: 5 },
    ],
    defaultComparator: "gte", defaultWeight: 10,
  },
  {
    type: "adx", label: "ADX", category: "trend",
    availability: "coming_soon",
    parameters: [
      { key: "period", label: "기간", type: "number", min: 7, max: 50, step: 1, default: 14 },
      { key: "threshold", label: "임계값", type: "number", min: 10, max: 80, step: 1, default: 25 },
    ],
    defaultComparator: "gte", defaultWeight: 12,
  },
  {
    type: "dmi", label: "DMI", category: "trend",
    availability: "coming_soon",
    parameters: [
      { key: "period", label: "기간", type: "number", min: 7, max: 50, step: 1, default: 14 },
    ],
    defaultComparator: "gte", defaultWeight: 10,
  },

  // === 모멘텀 (Momentum) ===
  {
    type: "rsi", label: "RSI", category: "momentum",
    availability: "available",
    parameters: [
      { key: "period", label: "기간", type: "number", min: 2, max: 50, step: 1, default: 14 },
      { key: "threshold", label: "임계값", type: "number", min: 0, max: 100, step: 1, default: 70 },
    ],
    defaultComparator: "gte", defaultWeight: 12,
  },
  {
    type: "stochastic", label: "스토캐스틱", category: "momentum",
    availability: "available",
    parameters: [
      { key: "period", label: "기간", type: "number", min: 3, max: 50, step: 1, default: 14 },
      { key: "threshold", label: "임계값(%)", type: "number", min: 0, max: 100, step: 1, default: 80 },
    ],
    defaultComparator: "gte", defaultWeight: 10,
  },
  {
    type: "williams_r", label: "Williams %R", category: "momentum",
    availability: "coming_soon",
    parameters: [
      { key: "period", label: "기간", type: "number", min: 5, max: 50, step: 1, default: 14 },
      { key: "threshold", label: "임계값", type: "number", min: -100, max: 0, step: 1, default: -20 },
    ],
    defaultComparator: "lte", defaultWeight: 10,
  },
  {
    type: "cci", label: "CCI", category: "momentum",
    availability: "coming_soon",
    parameters: [
      { key: "period", label: "기간", type: "number", min: 5, max: 60, step: 1, default: 20 },
      { key: "threshold", label: "임계값", type: "number", min: -300, max: 300, step: 10, default: 100 },
    ],
    defaultComparator: "gte", defaultWeight: 10,
  },
  {
    type: "high_return", label: "고수익률", category: "momentum",
    availability: "available",
    parameters: [
      { key: "days", label: "기간(일)", type: "number", min: 1, max: 120, step: 1, default: 11 },
      { key: "minPercent", label: "최소(%)", type: "number", min: 1, max: 200, step: 1, default: 20 },
    ],
    defaultComparator: "gte", defaultWeight: 15,
  },
  {
    type: "close_change", label: "종가변동", category: "momentum",
    availability: "available",
    parameters: [
      { key: "days", label: "기간(일)", type: "number", min: 1, max: 60, step: 1, default: 1 },
      { key: "threshold", label: "임계값(%)", type: "number", min: -30, max: 30, step: 0.5, default: 2 },
    ],
    defaultComparator: "gte", defaultWeight: 10,
  },
  {
    type: "new_high", label: "신고가", category: "momentum",
    availability: "available",
    parameters: [
      { key: "period", label: "기간(봉)", type: "number", min: 2, max: 240, step: 1, default: 5 },
    ],
    defaultComparator: "gte", defaultWeight: 12,
  },
  {
    type: "new_high_low", label: "신고가/신저가", category: "momentum",
    availability: "coming_soon",
    parameters: [
      { key: "period", label: "기간(봉)", type: "number", min: 2, max: 240, step: 1, default: 60 },
      { key: "mode", label: "모드", type: "select", default: "high",
        options: [{ value: "high", label: "신고가" }, { value: "low", label: "신저가" }] },
    ],
    defaultComparator: "gte", defaultWeight: 12,
  },

  // === 변동성 (Volatility) ===
  {
    type: "bollinger", label: "볼린저밴드", category: "volatility",
    availability: "available",
    parameters: [
      { key: "period", label: "기간", type: "number", min: 5, max: 60, step: 1, default: 20 },
      { key: "deviation", label: "표준편차", type: "number", min: 1, max: 4, step: 0.5, default: 2 },
      { key: "band", label: "밴드", type: "select", default: "upper",
        options: [
          { value: "upper", label: "상단" },
          { value: "middle", label: "중단" },
          { value: "lower", label: "하단" },
        ] },
    ],
    defaultComparator: "gte", defaultWeight: 12,
  },
  {
    type: "atr_percent", label: "ATR%", category: "volatility",
    availability: "available",
    parameters: [
      { key: "period", label: "기간", type: "number", min: 5, max: 60, step: 1, default: 14 },
      { key: "threshold", label: "임계값(%)", type: "number", min: 0.5, max: 30, step: 0.5, default: 3 },
    ],
    defaultComparator: "gte", defaultWeight: 10,
  },
  {
    type: "gap_percent", label: "갭%", category: "volatility",
    availability: "available",
    parameters: [
      { key: "threshold", label: "임계값(%)", type: "number", min: -10, max: 10, step: 0.5, default: 1 },
    ],
    defaultComparator: "gte", defaultWeight: 10,
  },
  {
    type: "intrabar_position", label: "봉내위치", category: "volatility",
    availability: "available",
    parameters: [
      { key: "threshold", label: "위치(%)", type: "number", min: 0, max: 100, step: 5, default: 70 },
    ],
    defaultComparator: "gte", defaultWeight: 8,
  },
  {
    type: "price_range", label: "가격레인지", category: "volatility",
    availability: "available",
    parameters: [
      { key: "minPrice", label: "최소가격(원)", type: "number", min: 0, max: 1000000, step: 100, default: 1000 },
      { key: "maxPrice", label: "최대가격(원)", type: "number", min: 0, max: 10000000, step: 1000, default: 100000 },
    ],
    defaultComparator: "between", defaultWeight: 5,
  },

  // === 거래량 (Volume) ===
  {
    type: "turnover", label: "거래대금", category: "volume",
    availability: "available",
    parameters: [
      { key: "days", label: "기간(일)", type: "number", min: 1, max: 60, step: 1, default: 5 },
      { key: "threshold", label: "임계값(억원)", type: "number", min: 1, max: 5000, step: 10, default: 50 },
    ],
    defaultComparator: "gte", defaultWeight: 12,
  },
  {
    type: "volume_ratio", label: "거래량비율", category: "volume",
    availability: "available",
    parameters: [
      { key: "period", label: "기준기간(일)", type: "number", min: 3, max: 120, step: 1, default: 20 },
      { key: "threshold", label: "임계값(배)", type: "number", min: 0.1, max: 20, step: 0.1, default: 1.5 },
    ],
    defaultComparator: "gte", defaultWeight: 12,
  },
  {
    type: "turnover_count", label: "거래대금횟수", category: "volume",
    availability: "available",
    parameters: [
      { key: "days", label: "기간(일)", type: "number", min: 1, max: 60, step: 1, default: 5 },
      { key: "threshold", label: "기준대금(억원)", type: "number", min: 1, max: 5000, step: 10, default: 50 },
      { key: "count", label: "횟수", type: "number", min: 1, max: 30, step: 1, default: 3 },
    ],
    defaultComparator: "gte", defaultWeight: 10,
  },
  {
    type: "volume_ratio_count", label: "거래량비율횟수", category: "volume",
    availability: "available",
    parameters: [
      { key: "days", label: "기간(일)", type: "number", min: 1, max: 60, step: 1, default: 5 },
      { key: "threshold", label: "기준배율", type: "number", min: 0.5, max: 10, step: 0.5, default: 2 },
      { key: "count", label: "횟수", type: "number", min: 1, max: 20, step: 1, default: 2 },
    ],
    defaultComparator: "gte", defaultWeight: 10,
  },
  {
    type: "obv", label: "OBV", category: "volume",
    availability: "coming_soon",
    parameters: [
      { key: "period", label: "기간", type: "number", min: 5, max: 60, step: 1, default: 20 },
    ],
    defaultComparator: "gte", defaultWeight: 10,
  },
  {
    type: "turnover_ma", label: "거래대금이평", category: "volume",
    availability: "coming_soon",
    parameters: [
      { key: "period", label: "이평기간", type: "number", min: 3, max: 60, step: 1, default: 20 },
      { key: "threshold", label: "임계값(배)", type: "number", min: 0.5, max: 10, step: 0.5, default: 1.5 },
    ],
    defaultComparator: "gte", defaultWeight: 10,
  },
  {
    type: "volume_profile", label: "볼륨프로파일", category: "volume",
    availability: "coming_soon",
    parameters: [
      { key: "period", label: "기간(일)", type: "number", min: 5, max: 60, step: 1, default: 20 },
    ],
    defaultComparator: "gte", defaultWeight: 8,
  },

  // === 캔들패턴 (Candle Pattern) ===
  {
    type: "bullish_candle_count", label: "연속양봉", category: "candle_pattern",
    availability: "available",
    parameters: [
      { key: "days", label: "관찰기간(일)", type: "number", min: 2, max: 30, step: 1, default: 5 },
      { key: "count", label: "최소횟수", type: "number", min: 1, max: 20, step: 1, default: 3 },
    ],
    defaultComparator: "gte", defaultWeight: 10,
  },
  {
    type: "bearish_candle_count", label: "연속음봉", category: "candle_pattern",
    availability: "coming_soon",
    parameters: [
      { key: "days", label: "관찰기간(일)", type: "number", min: 2, max: 30, step: 1, default: 5 },
      { key: "count", label: "최소횟수", type: "number", min: 1, max: 20, step: 1, default: 3 },
    ],
    defaultComparator: "gte", defaultWeight: 10,
  },
  {
    type: "gap_up", label: "갭상승", category: "candle_pattern",
    availability: "coming_soon",
    parameters: [
      { key: "threshold", label: "최소갭(%)", type: "number", min: 0.5, max: 15, step: 0.5, default: 2 },
    ],
    defaultComparator: "gte", defaultWeight: 10,
  },
  {
    type: "gap_down", label: "갭하락", category: "candle_pattern",
    availability: "coming_soon",
    parameters: [
      { key: "threshold", label: "최소갭(%)", type: "number", min: 0.5, max: 15, step: 0.5, default: 2 },
    ],
    defaultComparator: "lte", defaultWeight: 10,
  },
  {
    type: "n_pattern", label: "N자형패턴", category: "candle_pattern",
    availability: "coming_soon",
    parameters: [
      { key: "period", label: "관찰기간(일)", type: "number", min: 5, max: 60, step: 1, default: 20 },
      { key: "minSwing", label: "최소진폭(%)", type: "number", min: 3, max: 30, step: 1, default: 10 },
    ],
    defaultComparator: "gte", defaultWeight: 12,
  },
];

// 카테고리별 그룹화 헬퍼
export const CATEGORY_LABELS: Record<IndicatorCategory, string> = {
  trend: "추세",
  momentum: "모멘텀",
  volatility: "변동성",
  volume: "거래량",
  candle_pattern: "캔들패턴",
};

export function getAvailableIndicators(): IndicatorDefinition[] {
  return INDICATOR_CATALOG.filter(i => i.availability === "available");
}

export function getIndicatorsByCategory(category: IndicatorCategory): IndicatorDefinition[] {
  return INDICATOR_CATALOG.filter(i => i.category === category);
}
```

### 3. Expression Validation (shared/expressionValidation.ts)

```typescript
import type { ConditionExpressionGroup, DetailedConditionRule } from "./trading";

export type ExpressionValidationError = {
  code: "NO_ACTIVE_RULES" | "MAX_DEPTH_EXCEEDED" | "INVALID_PARAMETER";
  message: string;
  path?: string;
};

export const MAX_EXPRESSION_DEPTH = 4;

export function calculateExpressionDepth(
  node: ConditionExpressionGroup,
  current = 1
): number {
  if (!node.children.length) return current;
  const childDepths = node.children.map(child =>
    "children" in child
      ? calculateExpressionDepth(child as ConditionExpressionGroup, current + 1)
      : current
  );
  return Math.max(...childDepths);
}

export function countActiveRules(node: ConditionExpressionGroup): number {
  return node.children.reduce((count, child) => {
    if ("children" in child) return count + countActiveRules(child as ConditionExpressionGroup);
    return count + ((child as DetailedConditionRule).enabled ? 1 : 0);
  }, 0);
}

export function validateExpression(
  root: ConditionExpressionGroup
): ExpressionValidationError[] {
  const errors: ExpressionValidationError[] = [];
  if (countActiveRules(root) === 0) {
    errors.push({ code: "NO_ACTIVE_RULES", message: "최소 1개 이상의 활성 조건이 필요합니다" });
  }
  if (calculateExpressionDepth(root) > MAX_EXPRESSION_DEPTH) {
    errors.push({ code: "MAX_DEPTH_EXCEEDED", message: `중첩 깊이는 최대 ${MAX_EXPRESSION_DEPTH}단계까지 허용됩니다` });
  }
  return errors;
}
```

### 4. Parameter Validation (shared/parameterValidation.ts)

```typescript
import type { IndicatorParameterSchema } from "./trading";

export type ParameterValidationResult = {
  valid: boolean;
  errors: Array<{ key: string; message: string }>;
};

export function validateParameterValue(
  schema: IndicatorParameterSchema,
  value: number | string | boolean
): string | null {
  if (schema.type === "number" && typeof value === "number") {
    if (schema.min !== undefined && value < schema.min) {
      return `${schema.label}은(는) ${schema.min} 이상이어야 합니다`;
    }
    if (schema.max !== undefined && value > schema.max) {
      return `${schema.label}은(는) ${schema.max} 이하여야 합니다`;
    }
  }
  if (schema.type === "select" && schema.options) {
    const validValues = schema.options.map(o => o.value);
    if (!validValues.includes(value as string | number)) {
      return `${schema.label}에 유효하지 않은 값입니다`;
    }
  }
  return null;
}

export function validateAllParameters(
  schemas: IndicatorParameterSchema[],
  config: Record<string, number | string | boolean>
): ParameterValidationResult {
  const errors: Array<{ key: string; message: string }> = [];
  for (const schema of schemas) {
    const value = config[schema.key] ?? schema.default;
    const error = validateParameterValue(schema, value);
    if (error) errors.push({ key: schema.key, message: error });
  }
  return { valid: errors.length === 0, errors };
}
```

---

## Client Components

### 5. ConditionBuilderPage (client/src/pages/ConditionBuilderPage.tsx)

전체 레이아웃을 관리하는 페이지 컴포넌트:

```typescript
// 3-column layout: CategoryTree | ExpressionBuilder + ParameterPanel | BacktestResultPanel
// State: selectedIndicator, expressionRoot, backtestResult, presetList
// React state management with useReducer for expression tree mutations
```

### 6. CategoryTree (client/src/components/condition-builder/CategoryTree.tsx)

```typescript
type CategoryTreeProps = {
  onSelectIndicator: (indicator: IndicatorDefinition) => void;
  onDragStart: (indicator: IndicatorDefinition) => void;
};

// - INDICATOR_CATALOG에서 카테고리별 그룹화
// - Radix Accordion으로 펼침/접힘 구현
// - coming_soon 노드: opacity-50, cursor-not-allowed, "준비중" Badge
// - 활성 노드: 클릭 시 onSelectIndicator, 드래그 시 onDragStart
```

### 7. ParameterPanel (client/src/components/condition-builder/ParameterPanel.tsx)

```typescript
type ParameterPanelProps = {
  indicator: IndicatorDefinition | null;
  currentRule: DetailedConditionRule | null;
  onChange: (config: Record<string, number | string | boolean>) => void;
};

// - 선택된 지표의 parameters 스키마를 기반으로 동적 폼 렌더링
// - 각 파라미터별 min/max 범위 즉시 검증
// - 비교연산자 드롭다운 (7종)
// - 룩백 기간 입력
// - 실시간 onChange로 부모 state 업데이트
```

### 8. ExpressionBuilder (client/src/components/condition-builder/ExpressionBuilder.tsx)

```typescript
type ExpressionBuilderProps = {
  root: ConditionExpressionGroup;
  onUpdate: (root: ConditionExpressionGroup) => void;
  maxDepth: number;
};

// - 재귀적 트리 렌더링 (Expression_Group → children)
// - AND/OR/NOT 논리 연산자 선택 토글
// - 드래그 앤 드롭으로 노드 이동 (dnd-kit 활용)
// - 중첩 깊이 4단계 제한 (추가 버튼 비활성)
// - 빈 그룹 시 placeholder + "조건 추가" CTA 표시
// - 각 rule 카드: 지표명 | 파라미터 요약 | 활성/비활성 토글 | 삭제
```

### 9. BacktestResultPanel (client/src/components/condition-builder/BacktestResultPanel.tsx)

```typescript
type BacktestResultPanelProps = {
  result: BacktestResult | null;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
  backtestParams: { holdingDays: number; feeRate: number; slippageBps: number };
  onParamsChange: (params: Partial<typeof backtestParams>) => void;
};

// - 실행 전: 보유기간/수수료/슬리피지 설정 폼
// - 실행 중: skeleton + spinner
// - 결과: 수익률, 승률, MDD, 거래 횟수 카드 형태
// - 에러: 오류 메시지 + 재시도 버튼
```

### 10. PresetLibrary (client/src/components/condition-builder/PresetLibrary.tsx)

```typescript
type PresetLibraryProps = {
  onLoad: (expression: ConditionExpressionGroup) => void;
};

// - 저장된 프리셋 목록 (createdAt DESC)
// - 각 항목: 이름, 마지막 백테스트 요약(수익률, 승률)
// - 컨텍스트 메뉴: 이름변경, 복제, 삭제
// - coming_soon 지표 포함 시 "일부 조건 사용 불가" 경고 Badge
// - 저장 시 중복 이름 감지 → 덮어쓰기 확인 AlertDialog
```

---

## Server Layer

### 11. tRPC Router (server/routers/conditionBuilder.ts)

```typescript
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";

export const conditionBuilderRouter = router({
  // 조건식 저장
  save: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(120),
      description: z.string().max(500).optional(),
      expressionJson: z.unknown(), // ConditionExpressionGroup
    }))
    .mutation(async ({ ctx, input }) => { /* upsert strategyPresets */ }),

  // 조건식 목록 (createdAt DESC)
  list: protectedProcedure
    .query(async ({ ctx }) => { /* SELECT * FROM strategyPresets WHERE userId ORDER BY createdAt DESC */ }),

  // 조건식 불러오기
  load: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => { /* SELECT single preset */ }),

  // 조건식 삭제
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => { /* DELETE FROM strategyPresets */ }),

  // 조건식 복제
  duplicate: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => { /* INSERT copy with new name */ }),

  // 이름 변경
  rename: protectedProcedure
    .input(z.object({ id: z.number(), name: z.string().min(1).max(120) }))
    .mutation(async ({ ctx, input }) => { /* UPDATE name */ }),

  // 중복 이름 체크
  checkNameExists: protectedProcedure
    .input(z.object({ name: z.string() }))
    .query(async ({ ctx, input }) => { /* SELECT count WHERE name = ? */ }),

  // 조건식 백테스트 실행
  runBacktest: protectedProcedure
    .input(z.object({
      expressionJson: z.unknown(),
      holdingDays: z.number().int().min(1).max(60).default(5),
      feeRate: z.number().min(0).max(0.01).default(0.0003),
      slippageBps: z.number().min(0).max(100).default(8),
      minScore: z.number().min(0).max(200).default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      // 1. validateExpression(input.expressionJson)
      // 2. 랜덤 종목/기간 선택 (기존 oneClickBacktest 패턴 재사용)
      // 3. runDailyBacktest({ expression, ... })
      // 4. 결과 반환
    }),
});
```

### 12. Random Generator 확장 (server/quant/evolution.ts 수정)

기존 `createRule` 함수를 확장하여 신규 지표 타입 지원:

```typescript
// ALL_EXTENDED_RULE_TYPES: available 상태 지표만 포함
export const ALL_EXTENDED_RULE_TYPES: EvolutionRuleType[] =
  INDICATOR_CATALOG
    .filter(i => i.availability === "available")
    .map(i => i.type as EvolutionRuleType);

// createRule에 신규 타입 분기 추가
// 각 신규 지표의 파라미터를 INDICATOR_CATALOG의 min/max 범위 내에서 랜덤 생성
```

---

## Data Flow

### 백테스트 실행 시퀀스

```
User clicks "백테스트 실행"
  → Client: validateExpression(root)
    → 실패 시 에러 메시지 표시
  → Client: trpc.conditionBuilder.runBacktest.mutate(expression, params)
  → Server: validateExpression (서버측 재검증)
  → Server: 랜덤 종목/기간 선택 (localResearchDailyBars)
  → Server: runDailyBacktest({ expression, bars, holdingDays, feeRate })
  → Server: BacktestResult 반환
  → Client: BacktestResultPanel에 결과 표시
```

### 조건식 저장/불러오기 시퀀스

```
User clicks "저장"
  → Client: checkNameExists query
    → 이미 존재 → AlertDialog "덮어쓰기?"
  → Client: trpc.conditionBuilder.save.mutate(name, description, expressionJson)
  → Server: upsert strategyPresets (rulesJson = expressionJson)
  → Client: presetList invalidate & refetch
```

---

## Error Handling

| 상황 | 처리 |
|------|------|
| 활성 조건 0개에서 백테스트 시도 | 클라이언트 즉시 차단, 에러 메시지 |
| 중첩 깊이 5단계 시도 | 그룹 추가 버튼 비활성화 + 툴팁 |
| 서버 백테스트 실패 | 에러 메시지 표시 + 재시도 버튼 |
| coming_soon 지표 선택 시도 | 클릭/드래그 차단, "준비중" 상태 |
| DB 저장 실패 | Toast 에러 알림 + 재시도 |
| 파라미터 범위 초과 | 즉시 인라인 검증 에러 표시 |

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Catalog Category Completeness

*For any* category key in the IndicatorCategory type, the INDICATOR_CATALOG must contain at least one IndicatorDefinition with that category, and the total count of distinct indicator types across all categories must be at least 30.

**Validates: Requirements 1.3, 1.4, 1.5, 1.6, 1.7**

### Property 2: Availability Status Controls Access

*For any* IndicatorDefinition with availability="coming_soon", the indicator must be excluded from the random generator's allowed types pool, and *for any* IndicatorDefinition with availability="available", it must be included in the pool.

**Validates: Requirements 1.8, 1.9, 5.1, 8.2, 8.3**

### Property 3: Parameter Schema Defaults Pass Validation

*For any* IndicatorDefinition in the catalog, constructing a config object from all parameter defaults must pass `validateAllParameters` without errors.

**Validates: Requirements 2.1, 2.6**

### Property 4: Parameter Bounds Rejection

*For any* IndicatorParameterSchema with defined min/max bounds, any numeric value strictly less than min or strictly greater than max must be rejected by `validateParameterValue`.

**Validates: Requirements 2.2**

### Property 5: Parameter Change Propagation

*For any* valid ConditionRule and any parameter key/value change within valid bounds, applying the change to the rule's config must result in the config containing the new value at that key.

**Validates: Requirements 2.5**

### Property 6: Expression Depth Invariant

*For any* valid ConditionExpressionGroup accepted by `validateExpression`, `calculateExpressionDepth(root)` must return a value ≤ 4 (MAX_EXPRESSION_DEPTH).

**Validates: Requirements 3.3**

### Property 7: NOT Logic Inversion

*For any* ConditionExpressionGroup with logic="NOT" and any set of DailyBar inputs, `evaluateExpression(notGroup, bars).eligible` must equal the boolean negation of `evaluateExpression({...notGroup, logic: "AND"}, bars).eligible` when children evaluate identically.

**Validates: Requirements 3.4**

### Property 8: Empty Expression Validation Rejection

*For any* ConditionExpressionGroup where all leaf ConditionRule nodes have `enabled=false`, calling `validateExpression(root)` must return an error with code "NO_ACTIVE_RULES".

**Validates: Requirements 4.2**

### Property 9: Backtest Result Completeness

*For any* valid BacktestResult returned by `runDailyBacktest`, the result object must contain numeric values for `totalReturn`, `winRate`, `maxDrawdown`, and `tradeCount`, and `tradeCount` must equal `trades.length`.

**Validates: Requirements 4.4**

### Property 10: Random Generator Parameter Bounds

*For any* ConditionRule produced by the extended `createRule` function, every numeric parameter value must fall within the corresponding IndicatorParameterSchema's [min, max] bounds as defined in INDICATOR_CATALOG.

**Validates: Requirements 5.2, 5.5**

### Property 11: Random Group Logic Constraint

*For any* EvolutionGroup produced by `generateGenome`, the logic field of every non-root group must be one of "AND" or "OR" (NOT is only assigned at root level or with probability).

**Validates: Requirements 5.4**

### Property 12: Preset List Ordering

*For any* list of presets returned by the `conditionBuilder.list` query, the createdAt timestamps must be in strictly non-increasing order.

**Validates: Requirements 6.2**

### Property 13: Unavailable Indicator Warning Detection

*For any* saved ConditionExpressionGroup that contains at least one rule whose type has availability="coming_soon" in INDICATOR_CATALOG, the preset must be flagged with a warning status when loaded.

**Validates: Requirements 8.4**
