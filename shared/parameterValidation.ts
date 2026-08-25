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
    const validValues = schema.options.map((o) => o.value);
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
