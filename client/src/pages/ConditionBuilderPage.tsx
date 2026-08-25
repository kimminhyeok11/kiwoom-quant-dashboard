import { useState } from "react";
import type {
  ConditionExpressionGroup,
  IndicatorDefinition,
  DetailedConditionRule,
} from "@shared/trading";
import { trpc } from "@/lib/trpc";
import { validateExpression } from "@shared/expressionValidation";
import { INDICATOR_CATALOG } from "@shared/indicatorCatalog";
import { CategoryTree } from "../components/condition-builder/CategoryTree";
import { ParameterPanel } from "../components/condition-builder/ParameterPanel";
import { ExpressionBuilder } from "../components/condition-builder/ExpressionBuilder";
import { BacktestResultPanel } from "../components/condition-builder/BacktestResultPanel";
import { PresetLibrary } from "../components/condition-builder/PresetLibrary";

function generateId(): string {
  return `rule-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function createDefaultExpression(): ConditionExpressionGroup {
  return {
    id: "root",
    logic: "AND",
    enabled: true,
    children: [],
  };
}

function findRuleInTree(
  root: ConditionExpressionGroup,
  ruleId: string
): DetailedConditionRule | null {
  for (const child of root.children) {
    if ("children" in child) {
      const found = findRuleInTree(child as ConditionExpressionGroup, ruleId);
      if (found) return found;
    } else {
      const rule = child as DetailedConditionRule;
      if (rule.id === ruleId) return rule;
    }
  }
  return null;
}

function updateRuleInTree(
  root: ConditionExpressionGroup,
  ruleId: string,
  updater: (rule: DetailedConditionRule) => DetailedConditionRule
): ConditionExpressionGroup {
  return {
    ...root,
    children: root.children.map((child) => {
      if ("children" in child) {
        return updateRuleInTree(
          child as ConditionExpressionGroup,
          ruleId,
          updater
        );
      }
      const rule = child as DetailedConditionRule;
      if (rule.id === ruleId) return updater(rule);
      return rule;
    }),
  };
}

export function ConditionBuilderPage() {
  const [expression, setExpression] = useState<ConditionExpressionGroup>(
    createDefaultExpression()
  );
  const [selectedIndicator, setSelectedIndicator] =
    useState<IndicatorDefinition | null>(null);
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);

  // Backtest state
  const [backtestResult, setBacktestResult] = useState<{
    symbols: string[];
    results: Array<{
      symbol: string;
      totalReturn: number;
      winRate: number;
      tradeCount: number;
      maxDrawdown: number;
    }>;
    averageReturn: number;
    averageWinRate: number;
  } | null>(null);
  const [backtestError, setBacktestError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Backtest params
  const [holdingDays, setHoldingDays] = useState(5);
  const [feeRate, setFeeRate] = useState(0.0003);
  const [slippageBps, setSlippageBps] = useState(8);

  // Left panel tab
  const [leftTab, setLeftTab] = useState<"tree" | "presets">("tree");

  const runBacktest = trpc.conditionBuilder.runBacktest.useMutation();
  const saveMutation = trpc.conditionBuilder.save.useMutation();

  // Add rule when indicator is selected from tree
  function handleSelectIndicator(indicator: IndicatorDefinition) {
    setSelectedIndicator(indicator);

    // Build default config from indicator parameters
    const config: Record<string, number | string | boolean> = {};
    for (const param of indicator.parameters) {
      config[param.key] = param.default;
    }

    const newRule: DetailedConditionRule = {
      id: generateId(),
      type: indicator.type as DetailedConditionRule["type"],
      enabled: true,
      weight: indicator.defaultWeight,
      config,
      label: indicator.label,
      comparator: indicator.defaultComparator,
      lookbackDays: 5,
      leftOperand: indicator.type,
      rightOperand: "",
      unit: "percent",
    };

    setExpression((prev) => ({
      ...prev,
      children: [...prev.children, newRule],
    }));
    setSelectedRuleId(newRule.id);
  }

  // Update the selected rule when ParameterPanel changes
  function handleParamChange(updates: {
    config?: Record<string, number | string | boolean>;
    comparator?: string;
    weight?: number;
  }) {
    if (!selectedRuleId) return;
    setExpression((prev) =>
      updateRuleInTree(prev, selectedRuleId, (rule) => ({
        ...rule,
        ...(updates.config && { config: updates.config }),
        ...(updates.comparator && {
          comparator: updates.comparator as DetailedConditionRule["comparator"],
        }),
        ...(updates.weight !== undefined && { weight: updates.weight }),
      }))
    );
  }

  // Run backtest
  async function handleRunBacktest() {
    const errors = validateExpression(expression);
    if (errors.length > 0) {
      setBacktestError(errors.map((e) => e.message).join("; "));
      return;
    }

    setIsLoading(true);
    setBacktestError(null);
    try {
      const result = await runBacktest.mutateAsync({
        expressionJson: expression,
        holdingDays,
        feeRate,
        slippageBps,
      });
      setBacktestResult(result);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "백테스트 실행 중 오류 발생";
      setBacktestError(message);
    } finally {
      setIsLoading(false);
    }
  }

  // Save expression
  async function handleSave() {
    const name = window.prompt("조건식 이름을 입력하세요");
    if (!name) return;
    try {
      await saveMutation.mutateAsync({
        name,
        expressionJson: expression,
      });
    } catch {
      // save error is shown via toast or silently fails
    }
  }

  // Load preset
  function handleLoadPreset(expressionJson: unknown) {
    setExpression(expressionJson as ConditionExpressionGroup);
    setSelectedRuleId(null);
    setSelectedIndicator(null);
  }

  // Get selected rule for ParameterPanel
  const selectedRule = selectedRuleId
    ? findRuleInTree(expression, selectedRuleId)
    : null;

  // Find indicator definition for the selected rule
  const selectedRuleIndicator =
    selectedRule && selectedIndicator?.type === selectedRule.type
      ? selectedIndicator
      : null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-0 lg:flex-row">
      {/* Left sidebar */}
      <div className="flex w-full flex-col border-r border-zinc-800 lg:w-64">
        {/* Tabs */}
        <div className="flex border-b border-zinc-800">
          <button
            type="button"
            onClick={() => setLeftTab("tree")}
            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
              leftTab === "tree"
                ? "border-b-2 border-teal-400 text-teal-300"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            지표 트리
          </button>
          <button
            type="button"
            onClick={() => setLeftTab("presets")}
            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
              leftTab === "presets"
                ? "border-b-2 border-teal-400 text-teal-300"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            프리셋
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {leftTab === "tree" ? (
            <CategoryTree
              onSelectIndicator={handleSelectIndicator}
              selectedType={selectedIndicator?.type}
            />
          ) : (
            <PresetLibrary onLoad={handleLoadPreset} />
          )}
        </div>
      </div>

      {/* Center: Expression Builder */}
      <div className="flex flex-1 flex-col overflow-y-auto p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-200">조건식 트리</h2>
          <button
            type="button"
            onClick={handleSave}
            className="rounded bg-zinc-700 px-3 py-1 text-xs text-zinc-200 hover:bg-zinc-600"
          >
            저장
          </button>
        </div>
        <ExpressionBuilder
          root={expression}
          onUpdate={setExpression}
          onSelectRule={(id) => {
            setSelectedRuleId(id || null);
            if (id) {
              const rule = findRuleInTree(expression, id);
              if (rule) {
                const ind = INDICATOR_CATALOG.find(
                  (i) => i.type === rule.type
                );
                if (ind) setSelectedIndicator(ind);
              }
            }
          }}
          selectedRuleId={selectedRuleId ?? undefined}
        />
      </div>

      {/* Right sidebar */}
      <div className="flex w-full flex-col border-l border-zinc-800 lg:w-72">
        {/* ParameterPanel */}
        <div className="border-b border-zinc-800 p-3">
          <ParameterPanel
            indicator={selectedRuleIndicator}
            config={selectedRule?.config ?? {}}
            comparator={selectedRule?.comparator ?? "gte"}
            weight={selectedRule?.weight ?? 10}
            onChange={handleParamChange}
            disabled={
              selectedRuleIndicator?.availability === "coming_soon"
            }
          />
        </div>
        {/* BacktestResultPanel */}
        <div className="flex-1 overflow-y-auto p-2">
          <BacktestResultPanel
            result={backtestResult}
            isLoading={isLoading}
            error={backtestError}
            onRun={handleRunBacktest}
            onRetry={handleRunBacktest}
            holdingDays={holdingDays}
            feeRate={feeRate}
            slippageBps={slippageBps}
            onParamsChange={(params) => {
              if (params.holdingDays !== undefined)
                setHoldingDays(params.holdingDays);
              if (params.feeRate !== undefined) setFeeRate(params.feeRate);
              if (params.slippageBps !== undefined)
                setSlippageBps(params.slippageBps);
            }}
          />
        </div>
      </div>
    </div>
  );
}
