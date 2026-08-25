export type TradeEnvironment = "mock" | "live";
export type OrderSide = "buy" | "sell";

export type TradingSafetySettings = {
  environment: TradeEnvironment;
  maxBuyAmount: number;
  dailyTradeLimit: number;
  killSwitch: boolean;
  autoTradeEnabled: boolean;
  requireConfirmation: boolean;
};

export type OrderCandidate = {
  symbol: string;
  name: string;
  side: OrderSide;
  quantity: number;
  price: number;
};

export type RiskGateResult = {
  allowed: boolean;
  amount: number;
  reasons: string[];
};

export type ConditionRule = {
  id: string;
  type: "macd_rising" | "macd_level" | "ma_position" | "high_return" | "new_high" | "turnover" | "rsi" | "bollinger" | "stochastic" | "atr_percent" | "volume_ratio" | "close_change" | "gap_percent" | "intrabar_position" | "turnover_count" | "volume_ratio_count" | "bullish_candle_count" | "price_range" | "macd_histogram" | "disparity" | "envelope" | "williams_r" | "cci" | "obv" | "turnover_ma" | "bearish_candle_count" | "gap_up" | "gap_down";
  enabled: boolean;
  weight: number;
  config: Record<string, number | string | boolean>;
};

export type ConditionComparator = "gt" | "gte" | "lt" | "lte" | "crosses_above" | "crosses_below" | "between";
export type ConditionLogic = "AND" | "OR" | "NOT";

export type DetailedConditionRule = ConditionRule & {
  label: string;
  comparator: ConditionComparator;
  lookbackDays: number;
  leftOperand: string;
  rightOperand: string | number;
  unit: "price" | "percent" | "volume" | "turnover" | "count";
};

export type ConditionExpressionGroup = {
  id: string;
  logic: ConditionLogic;
  enabled: boolean;
  children: Array<DetailedConditionRule | ConditionExpressionGroup>;
};

export type ConditionEvaluationDetail = {
  ruleId: string;
  label: string;
  matched: boolean;
  actual: number | string;
  expected: number | string;
  comparator: ConditionComparator;
  explanation: string;
};

// === Advanced Condition Builder Types ===

export type IndicatorType =
  | ConditionRule["type"]
  | "macd_histogram"
  | "vwap"
  | "disparity"
  | "envelope"
  | "adx"
  | "dmi"
  | "williams_r"
  | "cci"
  | "new_high_low"
  | "obv"
  | "turnover_ma"
  | "volume_profile"
  | "bearish_candle_count"
  | "gap_up"
  | "gap_down"
  | "n_pattern";

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
