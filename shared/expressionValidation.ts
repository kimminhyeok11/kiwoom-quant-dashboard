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
  const childDepths = node.children.map((child) =>
    "children" in child
      ? calculateExpressionDepth(child as ConditionExpressionGroup, current + 1)
      : current
  );
  return Math.max(...childDepths);
}

export function countActiveRules(node: ConditionExpressionGroup): number {
  return node.children.reduce((count, child) => {
    if ("children" in child)
      return count + countActiveRules(child as ConditionExpressionGroup);
    return count + ((child as DetailedConditionRule).enabled ? 1 : 0);
  }, 0);
}

export function validateExpression(
  root: ConditionExpressionGroup
): ExpressionValidationError[] {
  const errors: ExpressionValidationError[] = [];
  if (countActiveRules(root) === 0) {
    errors.push({
      code: "NO_ACTIVE_RULES",
      message: "최소 1개 이상의 활성 조건이 필요합니다",
    });
  }
  if (calculateExpressionDepth(root) > MAX_EXPRESSION_DEPTH) {
    errors.push({
      code: "MAX_DEPTH_EXCEEDED",
      message: `중첩 깊이는 최대 ${MAX_EXPRESSION_DEPTH}단계까지 허용됩니다`,
    });
  }
  return errors;
}
