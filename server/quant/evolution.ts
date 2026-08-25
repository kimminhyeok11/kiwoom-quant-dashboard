import { createHash } from "node:crypto";
import type { ConditionLogic, ConditionRule } from "../../shared/trading";

export type EvolutionRuleType = ConditionRule["type"];
export type EvolutionGroup = {
  id: string;
  logic: ConditionLogic;
  enabled: boolean;
  children: ConditionGene[];
};

export type ConditionGene = ConditionRule | EvolutionGroup;

export type EvolutionGenome = {
  root: EvolutionGroup;
  minimumScore: number;
  fingerprint: string;
};

export type EvolutionGenerationSpec = {
  seed: number;
  populationSize: number;
  minRules: number;
  maxRules: number;
  maxDepth: number;
  allowedRuleTypes: EvolutionRuleType[];
  requiredRuleTypes?: EvolutionRuleType[];
  requireUniqueRuleTypes?: boolean;
};

export type EvolutionFitnessMetrics = {
  totalReturn: number;
  maxDrawdown: number;
  tradeCount: number;
  winRate: number;
};

export type ScoredGenome = EvolutionGenome & {
  candidateId: number;
  metrics: EvolutionFitnessMetrics;
  fitnessScore: number;
};

export type DerivedGenome = EvolutionGenome & {
  origin: "elite" | "crossover" | "mutation" | "manual_expand";
  parentCandidateIds: number[];
  mutation?: { ruleIndex?: number; targetNodeId?: string; key: string; previous: number | string | boolean; next: number | string | boolean };
};

export type ManualGenomeChange =
  | { kind: "rule_numeric"; targetNodeId: string; key: string; next: number }
  | { kind: "group_logic"; targetNodeId: string; next: ConditionLogic };

type SeededRandom = () => number;

function seededRandom(seed: number): SeededRandom {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function integer(random: SeededRandom, min: number, max: number) {
  return Math.floor(random() * (max - min + 1)) + min;
}

function pick<T>(random: SeededRandom, values: T[]): T {
  return values[integer(random, 0, values.length - 1)]!;
}

function sortedConfig(config: ConditionRule["config"]) {
  return Object.fromEntries(Object.entries(config).sort(([left], [right]) => left.localeCompare(right)));
}

function canonicalGene(node: ConditionGene): unknown {
  if ("children" in node) {
    const children = node.children.map(child => canonicalGene(child as ConditionGene));
    const sortedChildren = node.logic === "NOT" ? children : children.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
    return { kind: "group", logic: node.logic, enabled: node.enabled, children: sortedChildren };
  }
  return { kind: "rule", type: node.type, enabled: node.enabled, weight: node.weight, config: sortedConfig(node.config) };
}

export function canonicalizeGenome(root: EvolutionGroup, minimumScore: number): string {
  return JSON.stringify({ root: canonicalGene(root), minimumScore });
}

export function fingerprintGenome(root: EvolutionGroup, minimumScore: number): string {
  return createHash("sha256").update(canonicalizeGenome(root, minimumScore)).digest("hex");
}

function canonicalContext(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalContext);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => [key, canonicalContext(child)]));
  return value;
}

export function fingerprintResearchGenome(input: { root: EvolutionGroup; minimumScore: number; datasetVersionKey: string; assumptions: unknown }): string {
  return createHash("sha256").update(JSON.stringify({ genome: canonicalGene(input.root), minimumScore: input.minimumScore, datasetVersionKey: input.datasetVersionKey, assumptions: canonicalContext(input.assumptions) })).digest("hex");
}

function createRule(random: SeededRandom, ruleType: EvolutionRuleType, id: string): ConditionRule {
  const weight = integer(random, 5, 25);
  if (ruleType === "macd_rising") return { id, type: ruleType, enabled: true, weight, config: { lookback: pick(random, [2, 3, 4, 5, 7, 10]), comparator: pick(random, ["상승", "상향돌파"]) } };
  if (ruleType === "ma_position") return { id, type: ruleType, enabled: true, weight, config: { periods: pick(random, ["5,20", "10,20,60", "20,60,120", "5,21,60,120", "20,60,120,240"]), comparator: pick(random, ["이상", "상향돌파", "이하"]) } };
  if (ruleType === "high_return") return { id, type: ruleType, enabled: true, weight, config: { days: pick(random, [5, 10, 11, 20, 40, 60]), minPercent: pick(random, [5, 10, 15, 20, 30, 50]), comparator: pick(random, ["이상", "초과"]) } };
  if (ruleType === "rsi") return { id, type: ruleType, enabled: true, weight, config: { period: pick(random, [7, 9, 14, 21, 28]), threshold: pick(random, [25, 30, 35, 50, 65, 70, 75]), comparator: pick(random, ["이상", "이하"]) } };
  if (ruleType === "bollinger") return { id, type: ruleType, enabled: true, weight, config: { period: pick(random, [10, 15, 20, 30, 40]), deviation: pick(random, [1.5, 2, 2.5, 3]), band: pick(random, ["upper", "middle", "lower"]), comparator: pick(random, ["이상", "이하"]) } };
  if (ruleType === "stochastic") return { id, type: ruleType, enabled: true, weight, config: { period: pick(random, [5, 9, 14, 21]), threshold: pick(random, [20, 30, 50, 70, 80]), comparator: pick(random, ["이상", "이하"]) } };
  if (ruleType === "atr_percent") return { id, type: ruleType, enabled: true, weight, config: { period: pick(random, [5, 10, 14, 20, 30]), threshold: pick(random, [1, 2, 3, 5, 8]), comparator: pick(random, ["이상", "이하"]) } };
  if (ruleType === "volume_ratio") return { id, type: ruleType, enabled: true, weight, config: { period: pick(random, [5, 10, 20, 40, 60]), threshold: pick(random, [0.5, 0.8, 1, 1.5, 2, 3, 5]), comparator: pick(random, ["이상", "초과", "이하"]) } };
  if (ruleType === "close_change") return { id, type: ruleType, enabled: true, weight, config: { days: pick(random, [1, 2, 3, 5, 10, 20]), threshold: pick(random, [-5, -3, -1, 1, 3, 5, 10]), comparator: pick(random, ["이상", "이하"]) } };
  if (ruleType === "gap_percent") return { id, type: ruleType, enabled: true, weight, config: { threshold: pick(random, [-5, -3, -1, 0, 1, 3, 5]), comparator: pick(random, ["이상", "이하"]) } };
  if (ruleType === "intrabar_position") return { id, type: ruleType, enabled: true, weight, config: { threshold: pick(random, [20, 30, 40, 50, 60, 70, 80]), comparator: pick(random, ["이상", "이하"]) } };
  return { id, type: "turnover", enabled: true, weight, config: { days: pick(random, [3, 5, 10, 20, 40]), threshold: pick(random, [10, 30, 50, 100, 300, 500]), unit: "억원", comparator: pick(random, ["이상", "초과"]) } };
}

function selectRuleTypes(random: SeededRandom, count: number, spec: EvolutionGenerationSpec): EvolutionRuleType[] {
  const required = Array.from(new Set(spec.requiredRuleTypes ?? [])).filter(type => spec.allowedRuleTypes.includes(type));
  if (required.length > count) throw new Error("필수 공통 지표 수가 카드당 규칙 수보다 많습니다.");
  if (!spec.requireUniqueRuleTypes) return [...required, ...Array.from({ length: count - required.length }, () => pick(random, spec.allowedRuleTypes))];
  const pool = spec.allowedRuleTypes.filter(type => !required.includes(type));
  const selected = [...required];
  while (selected.length < count) {
    if (!pool.length) throw new Error("비중복 조합에 필요한 서로 다른 규칙군이 부족합니다.");
    selected.push(pool.splice(integer(random, 0, pool.length - 1), 1)[0]!);
  }
  return selected;
}

function maybeGroup(random: SeededRandom, children: ConditionGene[], depth: number, maxDepth: number, id: string): EvolutionGroup {
  if (depth >= maxDepth || children.length < 4 || random() > 0.42) return { id, logic: pick(random, ["AND", "OR", "NOT"] as ConditionLogic[]), enabled: true, children };
  const splitAt = integer(random, 2, children.length - 2);
  const nested = maybeGroup(random, children.slice(splitAt), depth + 1, maxDepth, `${id}-nested`);
  return { id, logic: pick(random, ["AND", "OR"] as ConditionLogic[]), enabled: true, children: [...children.slice(0, splitAt), nested] };
}

export function generateGenome(random: SeededRandom, ordinal: number, spec: EvolutionGenerationSpec): EvolutionGenome {
  const count = Math.max(integer(random, spec.minRules, spec.maxRules), spec.requiredRuleTypes?.length ?? 0);
  const ruleTypes = selectRuleTypes(random, count, spec);
  const rules = ruleTypes.map((ruleType, index) => createRule(random, ruleType, `g${ordinal}-r${index}`));
  const root = maybeGroup(random, rules, 1, spec.maxDepth, `g${ordinal}-root`);
  const minimumScore = integer(random, 20, Math.min(100, Math.max(30, count * 10)));
  return { root, minimumScore, fingerprint: fingerprintGenome(root, minimumScore) };
}

export function generateUniqueGenomes(spec: EvolutionGenerationSpec): EvolutionGenome[] {
  if (spec.populationSize < 1 || spec.populationSize > 50_000) throw new Error("후보 수는 1~50,000 사이여야 합니다.");
  if (spec.minRules < 1 || spec.maxRules < spec.minRules || spec.maxRules > 20) throw new Error("규칙 수는 1~20개 범위에서 지정해야 합니다.");
  if (spec.allowedRuleTypes.length === 0) throw new Error("허용 규칙 유형을 하나 이상 선택하세요.");
  if (spec.requireUniqueRuleTypes && spec.maxRules > new Set(spec.allowedRuleTypes).size) throw new Error("비중복 조합의 최대 규칙 수는 서로 다른 규칙군 수를 넘을 수 없습니다.");
  const random = seededRandom(spec.seed); const fingerprints = new Set<string>(); const genomes: EvolutionGenome[] = [];
  const maximumAttempts = spec.populationSize * 100;
  for (let attempt = 0; genomes.length < spec.populationSize && attempt < maximumAttempts; attempt += 1) {
    const genome = generateGenome(random, attempt, spec);
    if (!fingerprints.has(genome.fingerprint)) { fingerprints.add(genome.fingerprint); genomes.push(genome); }
  }
  if (genomes.length !== spec.populationSize) throw new Error("요청한 후보 수만큼 고유 조건식을 만들 수 없습니다. 지표·파라미터 범위를 넓히세요.");
  return genomes;
}

export function calculateFitness(metrics: EvolutionFitnessMetrics, input: { minimumTrades: number; maxDrawdownLimit: number }): number {
  const tradePenalty = Math.max(0, input.minimumTrades - metrics.tradeCount) * 20;
  const drawdownPenalty = Math.max(0, Math.abs(metrics.maxDrawdown) - Math.abs(input.maxDrawdownLimit)) * 2;
  return Number((metrics.totalReturn + metrics.winRate * 0.08 - Math.abs(metrics.maxDrawdown) * 0.35 - tradePenalty - drawdownPenalty).toFixed(6));
}

export function selectSurvivors(candidates: ScoredGenome[], eliteCount: number): ScoredGenome[] {
  return [...candidates].sort((left, right) => right.fitnessScore - left.fitnessScore || left.candidateId - right.candidateId).slice(0, Math.min(eliteCount, candidates.length));
}

function cloneRule(rule: ConditionRule, id: string): ConditionRule {
  return { ...rule, id, config: { ...rule.config } };
}

function collectRules(node: ConditionGene): ConditionRule[] {
  return "children" in node ? node.children.flatMap(child => collectRules(child)) : [node];
}

function rootFromRules(rules: ConditionRule[], random: SeededRandom, id: string): EvolutionGroup {
  const split = rules.length >= 6 ? integer(random, Math.max(2, Math.floor(rules.length / 3)), rules.length - 2) : rules.length;
  if (split >= rules.length) return { id, logic: pick(random, ["AND", "OR"] as ConditionLogic[]), enabled: true, children: rules };
  return {
    id,
    logic: pick(random, ["AND", "OR"] as ConditionLogic[]),
    enabled: true,
    children: [
      { id: `${id}-left`, logic: pick(random, ["AND", "OR"] as ConditionLogic[]), enabled: true, children: rules.slice(0, split) },
      { id: `${id}-right`, logic: pick(random, ["AND", "OR", "NOT"] as ConditionLogic[]), enabled: true, children: rules.slice(split) },
    ],
  };
}

export function crossoverGenomes(left: ScoredGenome, right: ScoredGenome, random: SeededRandom, ordinal: number, bounds: Pick<EvolutionGenerationSpec, "minRules" | "maxRules">): DerivedGenome {
  const leftRules = collectRules(left.root); const rightRules = collectRules(right.root); const target = integer(random, bounds.minRules, bounds.maxRules);
  const combined: ConditionRule[] = [];
  for (let index = 0; combined.length < target; index += 1) {
    const source = index % 2 === 0 ? leftRules : rightRules;
    combined.push(cloneRule(source[index % source.length]!, `x${ordinal}-r${index}`));
  }
  const root = rootFromRules(combined, random, `x${ordinal}-root`); const minimumScore = integer(random, 20, 100);
  return { root, minimumScore, fingerprint: fingerprintGenome(root, minimumScore), origin: "crossover", parentCandidateIds: [left.candidateId, right.candidateId] };
}

export function mutateGenome(parent: ScoredGenome, random: SeededRandom, ordinal: number): DerivedGenome {
  const rules = collectRules(parent.root).map((rule, index) => cloneRule(rule, `m${ordinal}-r${index}`)); const ruleIndex = integer(random, 0, rules.length - 1); const rule = rules[ruleIndex]!;
  const numericKeys = Object.entries(rule.config).filter(([, value]) => typeof value === "number") as Array<[string, number]>;
  const [key, previous] = numericKeys.length ? pick(random, numericKeys) : ["weight", rule.weight] as [string, number];
  const multiplier = pick(random, [0.8, 0.9, 1.1, 1.2]); const next = Number(Math.max(1, previous * multiplier).toFixed(key === "deviation" ? 1 : 4));
  if (key === "weight") rule.weight = Math.round(next); else rule.config[key] = next;
  const root = rootFromRules(rules, random, `m${ordinal}-root`); const minimumScore = Math.max(1, Math.min(100, parent.minimumScore + pick(random, [-10, -5, 5, 10])));
  return { root, minimumScore, fingerprint: fingerprintGenome(root, minimumScore), origin: "mutation", parentCandidateIds: [parent.candidateId], mutation: { ruleIndex, key, previous, next } };
}

function cloneGene(node: ConditionGene): ConditionGene {
  return "children" in node ? { ...node, children: node.children.map(cloneGene) } : { ...node, config: { ...node.config } };
}

export function manuallyExpandGenome(parent: Pick<ScoredGenome, "candidateId" | "root" | "minimumScore">, change: ManualGenomeChange): DerivedGenome {
  const root = cloneGene(parent.root) as EvolutionGroup;
  let applied = false;
  let mutation: DerivedGenome["mutation"];
  const visit = (node: ConditionGene): void => {
    if ("children" in node) {
      if (change.kind === "group_logic" && node.id === change.targetNodeId) {
        mutation = { targetNodeId: node.id, key: "logic", previous: node.logic, next: change.next };
        node.logic = change.next; applied = true;
      }
      node.children.forEach(visit);
      return;
    }
    if (change.kind !== "rule_numeric" || node.id !== change.targetNodeId) return;
    if (change.key === "weight") {
      mutation = { targetNodeId: node.id, key: "weight", previous: node.weight, next: change.next };
      node.weight = Math.round(change.next); applied = true;
      return;
    }
    const previous = node.config[change.key];
    if (typeof previous !== "number") throw new Error("선택한 규칙의 숫자형 파라미터만 변경할 수 있습니다.");
    mutation = { targetNodeId: node.id, key: change.key, previous, next: change.next };
    node.config[change.key] = change.next; applied = true;
  };
  visit(root);
  if (!applied || !mutation) throw new Error("수동 확장 대상 노드를 유전자 트리에서 찾을 수 없습니다.");
  return { root, minimumScore: parent.minimumScore, fingerprint: fingerprintGenome(root, parent.minimumScore), origin: "manual_expand", parentCandidateIds: [parent.candidateId], mutation };
}

export function evolvePopulation(input: { survivors: ScoredGenome[]; populationSize: number; seed: number; crossoverRate: number; bounds: Pick<EvolutionGenerationSpec, "minRules" | "maxRules">; preserveElites?: boolean }): DerivedGenome[] {
  if (!input.survivors.length) throw new Error("다음 세대를 만들 생존 유전자가 없습니다.");
  const random = seededRandom(input.seed); const results: DerivedGenome[] = []; const fingerprints = new Set<string>();
  if (input.preserveElites !== false) {
    for (const survivor of input.survivors) {
      const elite: DerivedGenome = { ...survivor, origin: "elite", parentCandidateIds: [survivor.candidateId] };
      if (!fingerprints.has(elite.fingerprint)) { fingerprints.add(elite.fingerprint); results.push(elite); }
    }
  }
  const maximumAttempts = input.populationSize * 100;
  for (let attempt = 0; results.length < input.populationSize && attempt < maximumAttempts; attempt += 1) {
    const parent = pick(random, input.survivors); const candidate = random() < input.crossoverRate && input.survivors.length > 1
      ? crossoverGenomes(parent, pick(random, input.survivors), random, attempt, input.bounds)
      : mutateGenome(parent, random, attempt);
    if (!fingerprints.has(candidate.fingerprint)) { fingerprints.add(candidate.fingerprint); results.push(candidate); }
  }
  if (results.length !== input.populationSize) throw new Error("고유한 다음 세대를 충분히 만들지 못했습니다. 변이 범위 또는 허용 규칙을 넓히세요.");
  return results;
}
