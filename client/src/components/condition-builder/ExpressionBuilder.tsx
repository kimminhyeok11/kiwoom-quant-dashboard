import type {
  ConditionExpressionGroup,
  DetailedConditionRule,
  ConditionLogic,
} from "@shared/trading";
import { INDICATOR_CATALOG } from "@shared/indicatorCatalog";

// --- Props ---

type ExpressionBuilderProps = {
  root: ConditionExpressionGroup;
  onUpdate: (root: ConditionExpressionGroup) => void;
  onSelectRule: (ruleId: string) => void;
  selectedRuleId?: string;
};

// --- Helper Functions ---

function generateId(): string {
  return `rule-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function updateNodeInTree(
  root: ConditionExpressionGroup,
  nodeId: string,
  updater: (node: ConditionExpressionGroup) => ConditionExpressionGroup
): ConditionExpressionGroup {
  if (root.id === nodeId) {
    return updater(root);
  }
  return {
    ...root,
    children: root.children.map((child) => {
      if ("children" in child) {
        const group = child as ConditionExpressionGroup;
        if (group.id === nodeId) {
          return updater(group);
        }
        return updateNodeInTree(group, nodeId, updater);
      }
      return child;
    }),
  };
}

function removeNodeFromTree(
  root: ConditionExpressionGroup,
  nodeId: string
): ConditionExpressionGroup {
  return {
    ...root,
    children: root.children
      .filter((child) => {
        if ("children" in child) {
          return (child as ConditionExpressionGroup).id !== nodeId;
        }
        return (child as DetailedConditionRule).id !== nodeId;
      })
      .map((child) => {
        if ("children" in child) {
          return removeNodeFromTree(
            child as ConditionExpressionGroup,
            nodeId
          );
        }
        return child;
      }),
  };
}

function addChildToGroup(
  root: ConditionExpressionGroup,
  groupId: string,
  child: DetailedConditionRule | ConditionExpressionGroup
): ConditionExpressionGroup {
  return updateNodeInTree(root, groupId, (group) => ({
    ...group,
    children: [...group.children, child],
  }));
}

function getIndicatorLabel(type: string): string {
  const indicator = INDICATOR_CATALOG.find((i) => i.type === type);
  return indicator?.label ?? type;
}

function getRuleConfigSummary(rule: DetailedConditionRule): string {
  const label = getIndicatorLabel(rule.type);
  const comparatorLabel = COMPARATOR_LABELS[rule.comparator] ?? rule.comparator;
  const mainParam = Object.values(rule.config)[0];
  const mainValue = mainParam !== undefined ? String(mainParam) : "";
  return `${label} ${comparatorLabel} ${mainValue}`.trim();
}

const COMPARATOR_LABELS: Record<string, string> = {
  gt: ">",
  gte: ">=",
  lt: "<",
  lte: "<=",
  crosses_above: "상향돌파",
  crosses_below: "하향돌파",
  between: "사이",
};

const LOGIC_OPTIONS: ConditionLogic[] = ["AND", "OR", "NOT"];

// --- Components ---

export function ExpressionBuilder({
  root,
  onUpdate,
  onSelectRule,
  selectedRuleId,
}: ExpressionBuilderProps) {
  return (
    <div className="flex flex-col gap-2">
      <GroupNode
        group={root}
        depth={0}
        isRoot
        onUpdateTree={(updatedRoot) => onUpdate(updatedRoot)}
        onRemoveNode={(nodeId) => onUpdate(removeNodeFromTree(root, nodeId))}
        onSelectRule={onSelectRule}
        selectedRuleId={selectedRuleId}
        root={root}
      />
    </div>
  );
}

function GroupNode({
  group,
  depth,
  isRoot,
  onUpdateTree,
  onRemoveNode,
  onSelectRule,
  selectedRuleId,
  root,
}: {
  group: ConditionExpressionGroup;
  depth: number;
  isRoot: boolean;
  onUpdateTree: (root: ConditionExpressionGroup) => void;
  onRemoveNode: (nodeId: string) => void;
  onSelectRule: (ruleId: string) => void;
  selectedRuleId?: string;
  root: ConditionExpressionGroup;
}) {
  function handleLogicChange(logic: ConditionLogic) {
    const updated = updateNodeInTree(root, group.id, (g) => ({
      ...g,
      logic,
    }));
    onUpdateTree(updated);
  }

  function handleAddGroup() {
    const newGroup: ConditionExpressionGroup = {
      id: generateId(),
      logic: "AND",
      enabled: true,
      children: [],
    };
    const updated = addChildToGroup(root, group.id, newGroup);
    onUpdateTree(updated);
  }

  function handleDeleteGroup() {
    onRemoveNode(group.id);
  }

  const borderColor =
    group.logic === "NOT"
      ? "border-red-500/50"
      : group.logic === "OR"
        ? "border-amber-500/50"
        : "border-blue-500/50";

  const bgColor = depth === 0 ? "bg-zinc-900" : "bg-zinc-900/60";

  return (
    <div
      className={`rounded border ${borderColor} ${bgColor} p-3 ${depth > 0 ? "ml-4 border-l-2" : ""}`}
    >
      {/* Group Header */}
      <div className="mb-2 flex items-center gap-2">
        {/* Logic toggle buttons */}
        <div className="flex gap-1">
          {LOGIC_OPTIONS.map((logic) => (
            <button
              key={logic}
              type="button"
              onClick={() => handleLogicChange(logic)}
              className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
                group.logic === logic
                  ? logic === "NOT"
                    ? "bg-red-600 text-white"
                    : logic === "OR"
                      ? "bg-amber-600 text-white"
                      : "bg-blue-600 text-white"
                  : "bg-zinc-700 text-zinc-400 hover:bg-zinc-600 hover:text-zinc-200"
              }`}
            >
              {logic}
            </button>
          ))}
        </div>

        <span className="text-xs text-zinc-500">
          {group.children.length}개 조건
        </span>

        {/* Delete group button (not for root) */}
        {!isRoot && (
          <button
            type="button"
            onClick={handleDeleteGroup}
            className="ml-auto rounded p-1 text-zinc-500 hover:bg-zinc-700 hover:text-red-400"
            title="그룹 삭제"
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Children */}
      {group.children.length === 0 ? (
        <div className="flex items-center justify-center rounded border border-dashed border-zinc-700 px-4 py-6 text-sm text-zinc-500">
          조건을 추가하세요
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {group.children.map((child) => {
            if ("children" in child) {
              return (
                <GroupNode
                  key={(child as ConditionExpressionGroup).id}
                  group={child as ConditionExpressionGroup}
                  depth={depth + 1}
                  isRoot={false}
                  onUpdateTree={onUpdateTree}
                  onRemoveNode={onRemoveNode}
                  onSelectRule={onSelectRule}
                  selectedRuleId={selectedRuleId}
                  root={root}
                />
              );
            }
            return (
              <RuleCard
                key={(child as DetailedConditionRule).id}
                rule={child as DetailedConditionRule}
                isSelected={
                  selectedRuleId === (child as DetailedConditionRule).id
                }
                onSelect={() =>
                  onSelectRule((child as DetailedConditionRule).id)
                }
                onToggle={() => {
                  const rule = child as DetailedConditionRule;
                  const updated = updateNodeInTree(root, group.id, (g) => ({
                    ...g,
                    children: g.children.map((c) => {
                      if (
                        !("children" in c) &&
                        (c as DetailedConditionRule).id === rule.id
                      ) {
                        return { ...c, enabled: !rule.enabled };
                      }
                      return c;
                    }),
                  }));
                  onUpdateTree(updated);
                }}
                onDelete={() => onRemoveNode((child as DetailedConditionRule).id)}
              />
            );
          })}
        </div>
      )}

      {/* Bottom actions */}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => onSelectRule("")}
          className="rounded bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 transition-colors"
        >
          + 조건 추가
        </button>

        {depth < 3 && (
          <button
            type="button"
            onClick={handleAddGroup}
            className="rounded bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 transition-colors"
          >
            + 그룹 추가
          </button>
        )}
      </div>
    </div>
  );
}

function RuleCard({
  rule,
  isSelected,
  onSelect,
  onToggle,
  onDelete,
}: {
  rule: DetailedConditionRule;
  isSelected: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const summary = getRuleConfigSummary(rule);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onSelect();
      }}
      className={`flex items-center gap-2 rounded border px-3 py-2 text-sm transition-colors cursor-pointer ${
        isSelected
          ? "border-teal-500/60 bg-zinc-800"
          : "border-zinc-700 bg-zinc-800/50 hover:border-zinc-600"
      } ${!rule.enabled ? "opacity-50" : ""}`}
    >
      {/* Enable/disable checkbox */}
      <input
        type="checkbox"
        checked={rule.enabled}
        className="h-3.5 w-3.5 shrink-0 accent-teal-500 rounded"
        onClick={(e) => e.stopPropagation()}
        onChange={onToggle}
      />

      {/* Config summary */}
      <span className="flex-1 truncate text-zinc-200">{summary}</span>

      {/* Delete button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="shrink-0 rounded p-0.5 text-zinc-500 hover:bg-zinc-700 hover:text-red-400"
        title="삭제"
      >
        <svg
          className="h-3.5 w-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
  );
}
