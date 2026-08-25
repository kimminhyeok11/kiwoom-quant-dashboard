import { useState } from "react";
import type {
  IndicatorDefinition,
  IndicatorParameterSchema,
} from "@shared/trading";
import { validateParameterValue } from "@shared/parameterValidation";

const COMPARATOR_OPTIONS = [
  { value: "gte", label: "이상 (≥)" },
  { value: "gt", label: "초과 (>)" },
  { value: "lte", label: "이하 (≤)" },
  { value: "lt", label: "미만 (<)" },
  { value: "crosses_above", label: "상향돌파" },
  { value: "crosses_below", label: "하향돌파" },
  { value: "between", label: "사이" },
] as const;

type ParameterPanelProps = {
  indicator: IndicatorDefinition | null;
  config: Record<string, number | string | boolean>;
  comparator: string;
  weight: number;
  onChange: (updates: {
    config?: Record<string, number | string | boolean>;
    comparator?: string;
    weight?: number;
  }) => void;
  disabled?: boolean;
};

export function ParameterPanel({
  indicator,
  config,
  comparator,
  weight,
  onChange,
  disabled = false,
}: ParameterPanelProps) {
  const [errors, setErrors] = useState<Record<string, string | null>>({});

  if (!indicator) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
        좌측에서 지표를 선택하세요
      </div>
    );
  }

  function handleParamChange(
    schema: IndicatorParameterSchema,
    rawValue: number | string | boolean
  ) {
    const error = validateParameterValue(schema, rawValue);
    setErrors((prev) => ({ ...prev, [schema.key]: error }));
    onChange({ config: { ...config, [schema.key]: rawValue } });
  }

  function handleComparatorChange(value: string) {
    onChange({ comparator: value });
  }

  function handleWeightChange(value: number) {
    onChange({ weight: value });
  }

  return (
    <div className="relative flex flex-col gap-3 p-3 text-sm">
      {disabled && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-900/70 rounded">
          <span className="text-zinc-400 font-medium text-base">준비중</span>
        </div>
      )}

      <h3 className="text-zinc-200 font-semibold text-base truncate">
        {indicator.label}
      </h3>

      {/* Parameter fields */}
      <div className="flex flex-col gap-2">
        {indicator.parameters.map((schema) => (
          <ParameterField
            key={schema.key}
            schema={schema}
            value={config[schema.key] ?? schema.default}
            error={errors[schema.key] ?? null}
            disabled={disabled}
            onChange={(val) => handleParamChange(schema, val)}
          />
        ))}
      </div>

      {/* Comparator dropdown */}
      <div className="flex flex-col gap-1">
        <label className="text-zinc-400 text-xs">비교연산자</label>
        <select
          className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-zinc-200 text-sm focus:outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          value={comparator}
          disabled={disabled}
          onChange={(e) => handleComparatorChange(e.target.value)}
        >
          {COMPARATOR_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Weight slider */}
      <div className="flex flex-col gap-1">
        <label className="text-zinc-400 text-xs">
          가중치: <span className="text-zinc-200">{weight}</span>
        </label>
        <input
          type="range"
          min={1}
          max={50}
          step={1}
          value={weight}
          disabled={disabled}
          className="w-full accent-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          onChange={(e) => handleWeightChange(Number(e.target.value))}
        />
        <div className="flex justify-between text-xs text-zinc-500">
          <span>1</span>
          <span>50</span>
        </div>
      </div>
    </div>
  );
}

/* Individual parameter field renderer */
function ParameterField({
  schema,
  value,
  error,
  disabled,
  onChange,
}: {
  schema: IndicatorParameterSchema;
  value: number | string | boolean;
  error: string | null;
  disabled: boolean;
  onChange: (val: number | string | boolean) => void;
}) {
  if (schema.type === "number") {
    return (
      <div className="flex flex-col gap-0.5">
        <label className="text-zinc-400 text-xs">
          {schema.label}
          {schema.unit && (
            <span className="ml-1 text-zinc-500">({schema.unit})</span>
          )}
        </label>
        <input
          type="number"
          min={schema.min}
          max={schema.max}
          step={schema.step}
          value={value as number}
          disabled={disabled}
          className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-zinc-200 text-sm focus:outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          onChange={(e) => onChange(Number(e.target.value))}
        />
        {error && <span className="text-red-400 text-xs">{error}</span>}
      </div>
    );
  }

  if (schema.type === "select" && schema.options) {
    return (
      <div className="flex flex-col gap-0.5">
        <label className="text-zinc-400 text-xs">{schema.label}</label>
        <select
          value={value as string | number}
          disabled={disabled}
          className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-zinc-200 text-sm focus:outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          onChange={(e) => onChange(e.target.value)}
        >
          {schema.options.map((opt) => (
            <option key={String(opt.value)} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {error && <span className="text-red-400 text-xs">{error}</span>}
      </div>
    );
  }

  if (schema.type === "boolean") {
    return (
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={value as boolean}
          disabled={disabled}
          className="w-4 h-4 accent-blue-500 rounded disabled:opacity-50 disabled:cursor-not-allowed"
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="text-zinc-300 text-sm">{schema.label}</span>
      </label>
    );
  }

  return null;
}
