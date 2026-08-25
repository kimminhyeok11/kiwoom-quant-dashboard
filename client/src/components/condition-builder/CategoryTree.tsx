import { useState } from "react";
import {
  INDICATOR_CATALOG,
  CATEGORY_LABELS,
  getIndicatorsByCategory,
} from "@shared/indicatorCatalog";
import type { IndicatorCategory, IndicatorDefinition } from "@shared/trading";

type CategoryTreeProps = {
  onSelectIndicator: (indicator: IndicatorDefinition) => void;
  selectedType?: string;
};

const CATEGORIES: IndicatorCategory[] = [
  "trend",
  "momentum",
  "volatility",
  "volume",
  "candle_pattern",
];

export function CategoryTree({
  onSelectIndicator,
  selectedType,
}: CategoryTreeProps) {
  const [expanded, setExpanded] = useState<Record<IndicatorCategory, boolean>>({
    trend: true,
    momentum: true,
    volatility: true,
    volume: true,
    candle_pattern: true,
  });

  function toggleCategory(category: IndicatorCategory) {
    setExpanded((prev) => ({ ...prev, [category]: !prev[category] }));
  }

  return (
    <div className="flex flex-col gap-1 rounded-lg bg-slate-900 p-3 text-sm text-slate-300">
      {CATEGORIES.map((category) => {
        const indicators = getIndicatorsByCategory(category);
        const isExpanded = expanded[category];

        return (
          <div key={category}>
            {/* Category Header */}
            <button
              type="button"
              onClick={() => toggleCategory(category)}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-slate-200 hover:bg-slate-800"
            >
              {/* Folder icon */}
              <svg
                className="h-4 w-4 shrink-0 text-slate-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                {isExpanded ? (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z"
                  />
                ) : (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                  />
                )}
              </svg>

              {/* Expand/collapse chevron */}
              <svg
                className={`h-3 w-3 shrink-0 text-slate-500 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 5l7 7-7 7"
                />
              </svg>

              <span className="font-medium">{CATEGORY_LABELS[category]}</span>

              {/* Count badge */}
              <span className="ml-auto rounded bg-slate-700 px-1.5 py-0.5 text-xs text-slate-400">
                {indicators.length}
              </span>
            </button>

            {/* Indicator Nodes */}
            {isExpanded && (
              <div className="ml-4 flex flex-col gap-0.5 border-l border-slate-700 pl-3 pt-1">
                {indicators.map((indicator) => {
                  const isAvailable = indicator.availability === "available";
                  const isSelected = selectedType === indicator.type;

                  if (!isAvailable) {
                    // Coming soon: grayed out, not clickable
                    return (
                      <div
                        key={indicator.type}
                        className="flex cursor-not-allowed items-center gap-2 rounded px-2 py-1 opacity-50"
                      >
                        {/* Lock icon */}
                        <svg
                          className="h-3.5 w-3.5 shrink-0 text-slate-500"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                          />
                        </svg>
                        <span className="text-slate-500">
                          {indicator.label}
                        </span>
                        <span className="ml-auto rounded bg-slate-700 px-1.5 py-0.5 text-xs text-slate-500">
                          준비중
                        </span>
                      </div>
                    );
                  }

                  // Available: clickable with teal dot
                  return (
                    <button
                      key={indicator.type}
                      type="button"
                      onClick={() => onSelectIndicator(indicator)}
                      className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left transition-colors hover:bg-slate-800 ${
                        isSelected
                          ? "border border-teal-500/60 bg-slate-800"
                          : "border border-transparent"
                      }`}
                    >
                      {/* Teal dot */}
                      <span className="h-2 w-2 shrink-0 rounded-full bg-teal-400" />
                      <span
                        className={
                          isSelected ? "text-teal-300" : "text-slate-300"
                        }
                      >
                        {indicator.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
