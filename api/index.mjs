var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/quant/evolution.ts
var evolution_exports = {};
__export(evolution_exports, {
  calculateFitness: () => calculateFitness,
  canonicalizeGenome: () => canonicalizeGenome,
  crossoverGenomes: () => crossoverGenomes,
  evolvePopulation: () => evolvePopulation,
  fingerprintGenome: () => fingerprintGenome,
  fingerprintResearchGenome: () => fingerprintResearchGenome,
  generateGenome: () => generateGenome,
  generateUniqueGenomes: () => generateUniqueGenomes,
  manuallyExpandGenome: () => manuallyExpandGenome,
  mutateGenome: () => mutateGenome,
  selectSurvivors: () => selectSurvivors
});
import { createHash } from "node:crypto";
function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 1831565813;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}
function integer2(random, min, max) {
  return Math.floor(random() * (max - min + 1)) + min;
}
function pick(random, values) {
  return values[integer2(random, 0, values.length - 1)];
}
function sortedConfig(config) {
  return Object.fromEntries(Object.entries(config).sort(([left], [right]) => left.localeCompare(right)));
}
function canonicalGene(node) {
  if ("children" in node) {
    const children = node.children.map((child) => canonicalGene(child));
    const sortedChildren = node.logic === "NOT" ? children : children.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
    return { kind: "group", logic: node.logic, enabled: node.enabled, children: sortedChildren };
  }
  return { kind: "rule", type: node.type, enabled: node.enabled, weight: node.weight, config: sortedConfig(node.config) };
}
function canonicalizeGenome(root, minimumScore) {
  return JSON.stringify({ root: canonicalGene(root), minimumScore });
}
function fingerprintGenome(root, minimumScore) {
  return createHash("sha256").update(canonicalizeGenome(root, minimumScore)).digest("hex");
}
function canonicalContext(value) {
  if (Array.isArray(value)) return value.map(canonicalContext);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => [key, canonicalContext(child)]));
  return value;
}
function fingerprintResearchGenome(input) {
  return createHash("sha256").update(JSON.stringify({ genome: canonicalGene(input.root), minimumScore: input.minimumScore, datasetVersionKey: input.datasetVersionKey, assumptions: canonicalContext(input.assumptions) })).digest("hex");
}
function createRule(random, ruleType, id) {
  const weight = integer2(random, 5, 25);
  if (ruleType === "macd_rising") return { id, type: ruleType, enabled: true, weight, config: { lookback: pick(random, [2, 3, 4, 5, 7, 10]), comparator: pick(random, ["\uC0C1\uC2B9", "\uC0C1\uD5A5\uB3CC\uD30C"]) } };
  if (ruleType === "ma_position") return { id, type: ruleType, enabled: true, weight, config: { periods: pick(random, ["5,20", "10,20,60", "20,60,120", "5,21,60,120", "20,60,120,240"]), comparator: pick(random, ["\uC774\uC0C1", "\uC0C1\uD5A5\uB3CC\uD30C", "\uC774\uD558"]) } };
  if (ruleType === "high_return") return { id, type: ruleType, enabled: true, weight, config: { days: pick(random, [5, 10, 11, 20, 40, 60]), minPercent: pick(random, [5, 10, 15, 20, 30, 50]), comparator: pick(random, ["\uC774\uC0C1", "\uCD08\uACFC"]) } };
  if (ruleType === "rsi") return { id, type: ruleType, enabled: true, weight, config: { period: pick(random, [7, 9, 14, 21, 28]), threshold: pick(random, [25, 30, 35, 50, 65, 70, 75]), comparator: pick(random, ["\uC774\uC0C1", "\uC774\uD558"]) } };
  if (ruleType === "bollinger") return { id, type: ruleType, enabled: true, weight, config: { period: pick(random, [10, 15, 20, 30, 40]), deviation: pick(random, [1.5, 2, 2.5, 3]), band: pick(random, ["upper", "middle", "lower"]), comparator: pick(random, ["\uC774\uC0C1", "\uC774\uD558"]) } };
  if (ruleType === "stochastic") return { id, type: ruleType, enabled: true, weight, config: { period: pick(random, [5, 9, 14, 21]), threshold: pick(random, [20, 30, 50, 70, 80]), comparator: pick(random, ["\uC774\uC0C1", "\uC774\uD558"]) } };
  if (ruleType === "atr_percent") return { id, type: ruleType, enabled: true, weight, config: { period: pick(random, [5, 10, 14, 20, 30]), threshold: pick(random, [1, 2, 3, 5, 8]), comparator: pick(random, ["\uC774\uC0C1", "\uC774\uD558"]) } };
  if (ruleType === "volume_ratio") return { id, type: ruleType, enabled: true, weight, config: { period: pick(random, [5, 10, 20, 40, 60]), threshold: pick(random, [0.5, 0.8, 1, 1.5, 2, 3, 5]), comparator: pick(random, ["\uC774\uC0C1", "\uCD08\uACFC", "\uC774\uD558"]) } };
  if (ruleType === "close_change") return { id, type: ruleType, enabled: true, weight, config: { days: pick(random, [1, 2, 3, 5, 10, 20]), threshold: pick(random, [-5, -3, -1, 1, 3, 5, 10]), comparator: pick(random, ["\uC774\uC0C1", "\uC774\uD558"]) } };
  if (ruleType === "gap_percent") return { id, type: ruleType, enabled: true, weight, config: { threshold: pick(random, [-5, -3, -1, 0, 1, 3, 5]), comparator: pick(random, ["\uC774\uC0C1", "\uC774\uD558"]) } };
  if (ruleType === "intrabar_position") return { id, type: ruleType, enabled: true, weight, config: { threshold: pick(random, [20, 30, 40, 50, 60, 70, 80]), comparator: pick(random, ["\uC774\uC0C1", "\uC774\uD558"]) } };
  return { id, type: "turnover", enabled: true, weight, config: { days: pick(random, [3, 5, 10, 20, 40]), threshold: pick(random, [10, 30, 50, 100, 300, 500]), unit: "\uC5B5\uC6D0", comparator: pick(random, ["\uC774\uC0C1", "\uCD08\uACFC"]) } };
}
function selectRuleTypes(random, count3, spec) {
  const required = Array.from(new Set(spec.requiredRuleTypes ?? [])).filter((type) => spec.allowedRuleTypes.includes(type));
  if (required.length > count3) throw new Error("\uD544\uC218 \uACF5\uD1B5 \uC9C0\uD45C \uC218\uAC00 \uCE74\uB4DC\uB2F9 \uADDC\uCE59 \uC218\uBCF4\uB2E4 \uB9CE\uC2B5\uB2C8\uB2E4.");
  if (!spec.requireUniqueRuleTypes) return [...required, ...Array.from({ length: count3 - required.length }, () => pick(random, spec.allowedRuleTypes))];
  const pool = spec.allowedRuleTypes.filter((type) => !required.includes(type));
  const selected = [...required];
  while (selected.length < count3) {
    if (!pool.length) throw new Error("\uBE44\uC911\uBCF5 \uC870\uD569\uC5D0 \uD544\uC694\uD55C \uC11C\uB85C \uB2E4\uB978 \uADDC\uCE59\uAD70\uC774 \uBD80\uC871\uD569\uB2C8\uB2E4.");
    selected.push(pool.splice(integer2(random, 0, pool.length - 1), 1)[0]);
  }
  return selected;
}
function maybeGroup(random, children, depth, maxDepth, id) {
  if (depth >= maxDepth || children.length < 4 || random() > 0.42) return { id, logic: pick(random, ["AND", "OR", "NOT"]), enabled: true, children };
  const splitAt = integer2(random, 2, children.length - 2);
  const nested = maybeGroup(random, children.slice(splitAt), depth + 1, maxDepth, `${id}-nested`);
  return { id, logic: pick(random, ["AND", "OR"]), enabled: true, children: [...children.slice(0, splitAt), nested] };
}
function generateGenome(random, ordinal, spec) {
  const count3 = Math.max(integer2(random, spec.minRules, spec.maxRules), spec.requiredRuleTypes?.length ?? 0);
  const ruleTypes = selectRuleTypes(random, count3, spec);
  const rules = ruleTypes.map((ruleType, index2) => createRule(random, ruleType, `g${ordinal}-r${index2}`));
  const root = maybeGroup(random, rules, 1, spec.maxDepth, `g${ordinal}-root`);
  const minimumScore = integer2(random, 20, Math.min(100, Math.max(30, count3 * 10)));
  return { root, minimumScore, fingerprint: fingerprintGenome(root, minimumScore) };
}
function generateUniqueGenomes(spec) {
  if (spec.populationSize < 1 || spec.populationSize > 5e4) throw new Error("\uD6C4\uBCF4 \uC218\uB294 1~50,000 \uC0AC\uC774\uC5EC\uC57C \uD569\uB2C8\uB2E4.");
  if (spec.minRules < 1 || spec.maxRules < spec.minRules || spec.maxRules > 20) throw new Error("\uADDC\uCE59 \uC218\uB294 1~20\uAC1C \uBC94\uC704\uC5D0\uC11C \uC9C0\uC815\uD574\uC57C \uD569\uB2C8\uB2E4.");
  if (spec.allowedRuleTypes.length === 0) throw new Error("\uD5C8\uC6A9 \uADDC\uCE59 \uC720\uD615\uC744 \uD558\uB098 \uC774\uC0C1 \uC120\uD0DD\uD558\uC138\uC694.");
  if (spec.requireUniqueRuleTypes && spec.maxRules > new Set(spec.allowedRuleTypes).size) throw new Error("\uBE44\uC911\uBCF5 \uC870\uD569\uC758 \uCD5C\uB300 \uADDC\uCE59 \uC218\uB294 \uC11C\uB85C \uB2E4\uB978 \uADDC\uCE59\uAD70 \uC218\uB97C \uB118\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
  const random = seededRandom(spec.seed);
  const fingerprints = /* @__PURE__ */ new Set();
  const genomes = [];
  const maximumAttempts = spec.populationSize * 100;
  for (let attempt = 0; genomes.length < spec.populationSize && attempt < maximumAttempts; attempt += 1) {
    const genome = generateGenome(random, attempt, spec);
    if (!fingerprints.has(genome.fingerprint)) {
      fingerprints.add(genome.fingerprint);
      genomes.push(genome);
    }
  }
  if (genomes.length !== spec.populationSize) throw new Error("\uC694\uCCAD\uD55C \uD6C4\uBCF4 \uC218\uB9CC\uD07C \uACE0\uC720 \uC870\uAC74\uC2DD\uC744 \uB9CC\uB4E4 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uC9C0\uD45C\xB7\uD30C\uB77C\uBBF8\uD130 \uBC94\uC704\uB97C \uB113\uD788\uC138\uC694.");
  return genomes;
}
function calculateFitness(metrics, input) {
  const tradePenalty = Math.max(0, input.minimumTrades - metrics.tradeCount) * 20;
  const drawdownPenalty = Math.max(0, Math.abs(metrics.maxDrawdown) - Math.abs(input.maxDrawdownLimit)) * 2;
  return Number((metrics.totalReturn + metrics.winRate * 0.08 - Math.abs(metrics.maxDrawdown) * 0.35 - tradePenalty - drawdownPenalty).toFixed(6));
}
function selectSurvivors(candidates, eliteCount) {
  return [...candidates].sort((left, right) => right.fitnessScore - left.fitnessScore || left.candidateId - right.candidateId).slice(0, Math.min(eliteCount, candidates.length));
}
function cloneRule(rule, id) {
  return { ...rule, id, config: { ...rule.config } };
}
function collectRules(node) {
  return "children" in node ? node.children.flatMap((child) => collectRules(child)) : [node];
}
function rootFromRules(rules, random, id) {
  const split = rules.length >= 6 ? integer2(random, Math.max(2, Math.floor(rules.length / 3)), rules.length - 2) : rules.length;
  if (split >= rules.length) return { id, logic: pick(random, ["AND", "OR"]), enabled: true, children: rules };
  return {
    id,
    logic: pick(random, ["AND", "OR"]),
    enabled: true,
    children: [
      { id: `${id}-left`, logic: pick(random, ["AND", "OR"]), enabled: true, children: rules.slice(0, split) },
      { id: `${id}-right`, logic: pick(random, ["AND", "OR", "NOT"]), enabled: true, children: rules.slice(split) }
    ]
  };
}
function crossoverGenomes(left, right, random, ordinal, bounds) {
  const leftRules = collectRules(left.root);
  const rightRules = collectRules(right.root);
  const target = integer2(random, bounds.minRules, bounds.maxRules);
  const combined = [];
  for (let index2 = 0; combined.length < target; index2 += 1) {
    const source = index2 % 2 === 0 ? leftRules : rightRules;
    combined.push(cloneRule(source[index2 % source.length], `x${ordinal}-r${index2}`));
  }
  const root = rootFromRules(combined, random, `x${ordinal}-root`);
  const minimumScore = integer2(random, 20, 100);
  return { root, minimumScore, fingerprint: fingerprintGenome(root, minimumScore), origin: "crossover", parentCandidateIds: [left.candidateId, right.candidateId] };
}
function mutateGenome(parent, random, ordinal) {
  const rules = collectRules(parent.root).map((rule2, index2) => cloneRule(rule2, `m${ordinal}-r${index2}`));
  const ruleIndex = integer2(random, 0, rules.length - 1);
  const rule = rules[ruleIndex];
  const numericKeys = Object.entries(rule.config).filter(([, value]) => typeof value === "number");
  const [key, previous] = numericKeys.length ? pick(random, numericKeys) : ["weight", rule.weight];
  const multiplier = pick(random, [0.8, 0.9, 1.1, 1.2]);
  const next = Number(Math.max(1, previous * multiplier).toFixed(key === "deviation" ? 1 : 4));
  if (key === "weight") rule.weight = Math.round(next);
  else rule.config[key] = next;
  const root = rootFromRules(rules, random, `m${ordinal}-root`);
  const minimumScore = Math.max(1, Math.min(100, parent.minimumScore + pick(random, [-10, -5, 5, 10])));
  return { root, minimumScore, fingerprint: fingerprintGenome(root, minimumScore), origin: "mutation", parentCandidateIds: [parent.candidateId], mutation: { ruleIndex, key, previous, next } };
}
function cloneGene(node) {
  return "children" in node ? { ...node, children: node.children.map(cloneGene) } : { ...node, config: { ...node.config } };
}
function manuallyExpandGenome(parent, change) {
  const root = cloneGene(parent.root);
  let applied = false;
  let mutation;
  const visit = (node) => {
    if ("children" in node) {
      if (change.kind === "group_logic" && node.id === change.targetNodeId) {
        mutation = { targetNodeId: node.id, key: "logic", previous: node.logic, next: change.next };
        node.logic = change.next;
        applied = true;
      }
      node.children.forEach(visit);
      return;
    }
    if (change.kind !== "rule_numeric" || node.id !== change.targetNodeId) return;
    if (change.key === "weight") {
      mutation = { targetNodeId: node.id, key: "weight", previous: node.weight, next: change.next };
      node.weight = Math.round(change.next);
      applied = true;
      return;
    }
    const previous = node.config[change.key];
    if (typeof previous !== "number") throw new Error("\uC120\uD0DD\uD55C \uADDC\uCE59\uC758 \uC22B\uC790\uD615 \uD30C\uB77C\uBBF8\uD130\uB9CC \uBCC0\uACBD\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
    mutation = { targetNodeId: node.id, key: change.key, previous, next: change.next };
    node.config[change.key] = change.next;
    applied = true;
  };
  visit(root);
  if (!applied || !mutation) throw new Error("\uC218\uB3D9 \uD655\uC7A5 \uB300\uC0C1 \uB178\uB4DC\uB97C \uC720\uC804\uC790 \uD2B8\uB9AC\uC5D0\uC11C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
  return { root, minimumScore: parent.minimumScore, fingerprint: fingerprintGenome(root, parent.minimumScore), origin: "manual_expand", parentCandidateIds: [parent.candidateId], mutation };
}
function evolvePopulation(input) {
  if (!input.survivors.length) throw new Error("\uB2E4\uC74C \uC138\uB300\uB97C \uB9CC\uB4E4 \uC0DD\uC874 \uC720\uC804\uC790\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.");
  const random = seededRandom(input.seed);
  const results = [];
  const fingerprints = /* @__PURE__ */ new Set();
  if (input.preserveElites !== false) {
    for (const survivor of input.survivors) {
      const elite = { ...survivor, origin: "elite", parentCandidateIds: [survivor.candidateId] };
      if (!fingerprints.has(elite.fingerprint)) {
        fingerprints.add(elite.fingerprint);
        results.push(elite);
      }
    }
  }
  const maximumAttempts = input.populationSize * 100;
  for (let attempt = 0; results.length < input.populationSize && attempt < maximumAttempts; attempt += 1) {
    const parent = pick(random, input.survivors);
    const candidate = random() < input.crossoverRate && input.survivors.length > 1 ? crossoverGenomes(parent, pick(random, input.survivors), random, attempt, input.bounds) : mutateGenome(parent, random, attempt);
    if (!fingerprints.has(candidate.fingerprint)) {
      fingerprints.add(candidate.fingerprint);
      results.push(candidate);
    }
  }
  if (results.length !== input.populationSize) throw new Error("\uACE0\uC720\uD55C \uB2E4\uC74C \uC138\uB300\uB97C \uCDA9\uBD84\uD788 \uB9CC\uB4E4\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uBCC0\uC774 \uBC94\uC704 \uB610\uB294 \uD5C8\uC6A9 \uADDC\uCE59\uC744 \uB113\uD788\uC138\uC694.");
  return results;
}
var init_evolution = __esm({
  "server/quant/evolution.ts"() {
    "use strict";
  }
});

// server/vercel-handler.ts
import "dotenv/config";
import express3 from "express";

// server/_core/index.ts
import "dotenv/config";
import express2 from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var AXIOS_TIMEOUT_MS = 3e4;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";
var OAUTH_STATE_COOKIE = "__Host-oauth_state";
var decodeOAuthState = (state) => {
  let decoded;
  try {
    decoded = atob(state);
  } catch {
    return { redirectUri: "" };
  }
  try {
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed.redirectUri === "string") return parsed;
  } catch {
  }
  return { redirectUri: decoded };
};

// server/_core/oauth.ts
import { parse as parseCookieHeader2 } from "cookie";

// server/db.ts
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

// drizzle/schema.ts
import {
  boolean,
  decimal,
  index,
  integer,
  json,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar
} from "drizzle-orm/pg-core";
var roleEnum = pgEnum("role", ["user", "admin"]);
var environmentEnum = pgEnum("environment", ["mock", "live"]);
var connectionStatusEnum = pgEnum("connectionStatus", ["connected", "failed"]);
var autoTradePolicyStatusEnum = pgEnum("autoTradePolicyStatus", ["active", "superseded", "paused"]);
var visibilityEnum = pgEnum("visibility", ["public", "hidden"]);
var timeframeEnum = pgEnum("timeframe", ["daily", "five_minute"]);
var adjustmentBasisEnum = pgEnum("adjustmentBasis", ["adjusted", "unadjusted", "unknown"]);
var qualityStatusEnum = pgEnum("qualityStatus", ["draft", "collecting", "ready", "error"]);
var sourceEnum = pgEnum("source", ["kiwoom_daily", "kiwoom_daily_five_minute"]);
var originEnum = pgEnum("origin", ["seed", "elite", "crossover", "mutation", "manual_expand"]);
var candidateStatusEnum = pgEnum("candidateStatus", ["created", "evaluated", "survived", "rejected", "failed"]);
var phaseEnum = pgEnum("phase", ["preparing", "opening", "intraday", "closing", "completed", "waiting_for_data", "incomplete", "failed"]);
var dataStatusEnum = pgEnum("dataStatus", ["pending", "ready", "waiting", "incomplete", "error"]);
var channelEnum = pgEnum("channel", ["intraday_price"]);
var sideEnum = pgEnum("side", ["buy", "sell"]);
var orderTypeEnum = pgEnum("orderType", ["market", "limit"]);
var orderStatusEnum = pgEnum("orderStatus", ["pending_confirmation", "confirmed", "submitting", "blocked", "submitted", "filled", "rejected", "cancelled"]);
var executionOriginEnum = pgEnum("executionOrigin", ["manual", "local_node"]);
var eventTypeEnum = pgEnum("eventType", ["entry", "mark", "exit"]);
var regimeEnum = pgEnum("regime", ["trend_up", "trend_down", "range", "volatile"]);
var scopeEnum = pgEnum("scope", ["stored_daily_bars", "external_verification"]);
var trackingStatusEnum = pgEnum("trackingStatus", ["tracking", "closed", "cash_only"]);
var minuteResearchStatusEnum = pgEnum("minuteResearchStatus", ["evaluated", "promoted", "rejected", "insufficient_validation", "failed"]);
var governanceStatusEnum = pgEnum("governanceStatus", ["running", "completed", "failed", "skipped"]);
var rankingRefreshStatusEnum = pgEnum("rankingRefreshStatus", ["idle", "running", "ready", "error", "paused"]);
var experimentStatusEnum = pgEnum("experimentStatus", ["draft", "queued", "running", "completed", "failed"]);
var evolutionSearchStatusEnum = pgEnum("evolutionSearchStatus", ["draft", "queued", "running", "completed", "failed", "cancelled"]);
var generationStatusEnum = pgEnum("generationStatus", ["queued", "generating", "evaluating", "completed", "failed"]);
var autonomousPhaseEnum = pgEnum("autonomousPhase", ["preparing", "opening", "intraday", "closing", "completed", "waiting_for_data", "incomplete", "failed"]);
var autonomousTaskStatusEnum = pgEnum("autonomousTaskStatus", ["running", "completed", "waiting_for_data", "failed"]);
var connectionCheckStatusEnum = pgEnum("connectionCheckStatus", ["connected", "failed"]);
var survivalStatusEnum = pgEnum("survivalStatus", ["promoted", "observe", "rejected"]);
var collectionRequestStatusEnum = pgEnum("collectionRequestStatus", ["queued", "running", "completed", "failed", "cancelled"]);
var dayTradeStatusEnum = pgEnum("dayTradeStatus", ["tracking", "closed"]);
var syncEventStatusEnum = pgEnum("syncEventStatus", ["success", "partial", "failed"]);
var backtestStatusEnum = pgEnum("backtestStatus", ["queued", "running", "completed", "failed"]);
var portfolioStatusEnum = pgEnum("portfolioStatus", ["active", "closed"]);
var positionStatusEnum = pgEnum("positionStatus", ["open", "closed"]);
var minuteProgramStatusEnum = pgEnum("minuteProgramStatus", ["active", "paused"]);
var sweepStatusEnum = pgEnum("sweepStatus", ["queued", "running", "completed", "waiting_for_data", "failed"]);
var committeeStatusEnum = pgEnum("committeeStatus", ["running", "completed", "failed"]);
var revalidationStatusEnum = pgEnum("revalidationStatus", ["queued", "running", "completed", "blocked", "failed"]);
var users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  avatarId: varchar("avatarId", { length: 32 }).default("nebula").notNull(),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: roleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull()
});
var tradingProfiles = pgTable(
  "trading_profiles",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    environment: environmentEnum("environment").default("mock").notNull(),
    accountNumberMasked: varchar("accountNumberMasked", { length: 32 }),
    tokenExpiresAt: timestamp("tokenExpiresAt"),
    connectionStatus: connectionStatusEnum("connectionStatus").default("failed").notNull(),
    refreshIntervalSeconds: integer("refreshIntervalSeconds").default(60).notNull(),
    maxBuyAmount: integer("maxBuyAmount").default(5e5).notNull(),
    dailyTradeLimit: integer("dailyTradeLimit").default(3).notNull(),
    killSwitch: boolean("killSwitch").default(true).notNull(),
    autoTradeEnabled: boolean("autoTradeEnabled").default(false).notNull(),
    requireConfirmation: boolean("requireConfirmation").default(true).notNull(),
    scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull()
  },
  (table) => [uniqueIndex("trading_profiles_user_unique").on(table.userId)]
);
var autoTradePolicies = pgTable(
  "auto_trade_policies",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    version: integer("version").notNull(),
    status: autoTradePolicyStatusEnum("status").default("active").notNull(),
    totalCapital: integer("totalCapital").notNull(),
    maxConcurrentPositions: integer("maxConcurrentPositions").notNull(),
    stopLossPercent: decimal("stopLossPercent", { precision: 8, scale: 4 }).notNull(),
    takeProfitPercent: decimal("takeProfitPercent", { precision: 8, scale: 4 }).notNull(),
    dailyLossLimitPercent: decimal("dailyLossLimitPercent", { precision: 8, scale: 4 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull()
  },
  (table) => [uniqueIndex("auto_trade_policies_user_version_unique").on(table.userId, table.version), index("auto_trade_policies_user_status_idx").on(table.userId, table.status, table.updatedAt)]
);
var strategyPresets = pgTable(
  "strategy_presets",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    description: varchar("description", { length: 500 }),
    rulesJson: json("rulesJson").notNull(),
    scoringJson: json("scoringJson"),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull()
  },
  (table) => [index("strategy_presets_user_idx").on(table.userId)]
);
var publicStrategyCards = pgTable(
  "public_strategy_cards",
  {
    id: serial("id").primaryKey(),
    creatorUserId: integer("creatorUserId").notNull(),
    sourceCandidateId: integer("sourceCandidateId").notNull(),
    sourceSweepId: integer("sourceSweepId").notNull(),
    strategyFingerprint: varchar("strategyFingerprint", { length: 64 }).notNull(),
    version: integer("version").default(1).notNull(),
    parentCardId: integer("parentCardId"),
    title: varchar("title", { length: 120 }).notNull(),
    rootGenomeJson: json("rootGenomeJson").notNull(),
    minimumScore: integer("minimumScore").notNull(),
    datasetFingerprint: varchar("datasetFingerprint", { length: 64 }).notNull(),
    arenaEvidenceJson: json("arenaEvidenceJson").notNull(),
    validationEvidenceJson: json("validationEvidenceJson").notNull(),
    visibility: visibilityEnum("visibility").default("public").notNull(),
    publishedAt: timestamp("publishedAt").defaultNow().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull()
  },
  (table) => [index("public_strategy_cards_source_candidate_idx").on(table.sourceCandidateId), index("public_strategy_cards_visibility_published_idx").on(table.visibility, table.publishedAt), index("public_strategy_cards_creator_idx").on(table.creatorUserId, table.publishedAt)]
);
var publicStrategyCardCollections = pgTable(
  "public_strategy_card_collections",
  {
    id: serial("id").primaryKey(),
    cardId: integer("cardId").notNull(),
    userId: integer("userId").notNull(),
    presetId: integer("presetId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull()
  },
  (table) => [uniqueIndex("public_strategy_card_collections_card_user_unique").on(table.cardId, table.userId), index("public_strategy_card_collections_user_idx").on(table.userId, table.createdAt)]
);
var publicStrategyCardComments = pgTable(
  "public_strategy_card_comments",
  {
    id: serial("id").primaryKey(),
    cardId: integer("cardId").notNull(),
    userId: integer("userId").notNull(),
    body: varchar("body", { length: 800 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull()
  },
  (table) => [index("public_strategy_card_comments_card_created_idx").on(table.cardId, table.createdAt), index("public_strategy_card_comments_user_idx").on(table.userId, table.createdAt)]
);
var publicStrategyCardFavorites = pgTable(
  "public_strategy_card_favorites",
  {
    id: serial("id").primaryKey(),
    cardId: integer("cardId").notNull(),
    userId: integer("userId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull()
  },
  (table) => [uniqueIndex("public_strategy_card_favorites_card_user_unique").on(table.cardId, table.userId), index("public_strategy_card_favorites_card_created_idx").on(table.cardId, table.createdAt)]
);
var rankingSnapshots = pgTable(
  "ranking_snapshots",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    presetId: integer("presetId").notNull(),
    symbol: varchar("symbol", { length: 24 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    score: decimal("score", { precision: 8, scale: 2 }).notNull(),
    price: integer("price").notNull(),
    changeRate: decimal("changeRate", { precision: 7, scale: 3 }).notNull(),
    matchedRulesJson: json("matchedRulesJson").notNull(),
    runKey: varchar("runKey", { length: 64 }),
    capturedAt: timestamp("capturedAt").defaultNow().notNull()
  },
  (table) => [index("ranking_snapshots_lookup_idx").on(table.userId, table.presetId, table.capturedAt), uniqueIndex("ranking_snapshots_run_symbol_unique").on(table.userId, table.presetId, table.symbol, table.runKey)]
);
var rankingRefreshProfiles = pgTable(
  "ranking_refresh_profiles",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    presetId: integer("presetId").notNull(),
    universeJson: json("universeJson").notNull(),
    maxPagesPerSymbol: integer("maxPagesPerSymbol").default(3).notNull(),
    cronExpression: varchar("cronExpression", { length: 48 }).default("0 */15 * * * *").notNull(),
    scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
    status: rankingRefreshStatusEnum("status").default("idle").notNull(),
    lastRunKey: varchar("lastRunKey", { length: 64 }),
    lastRunAt: timestamp("lastRunAt"),
    lastCompletedAt: timestamp("lastCompletedAt"),
    lastError: varchar("lastError", { length: 500 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull()
  },
  (table) => [uniqueIndex("ranking_refresh_profiles_user_unique").on(table.userId), index("ranking_refresh_profiles_task_idx").on(table.scheduleCronTaskUid)]
);
var htsConditionSnapshots = pgTable(
  "hts_condition_snapshots",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    conditionSequence: varchar("conditionSequence", { length: 3 }).notNull(),
    conditionName: varchar("conditionName", { length: 120 }).notNull(),
    candidatesJson: json("candidatesJson").notNull(),
    capturedAt: timestamp("capturedAt").defaultNow().notNull()
  },
  (table) => [index("hts_condition_snapshots_lookup_idx").on(table.userId, table.conditionSequence, table.capturedAt)]
);
var researchDatasets = pgTable(
  "research_datasets",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    source: sourceEnum("source").default("kiwoom_daily").notNull(),
    versionKey: varchar("versionKey", { length: 80 }).notNull(),
    visibility: varchar("visibility", { length: 50 }).default("private").notNull(),
    randomSeed: integer("randomSeed"),
    sourceFingerprint: varchar("sourceFingerprint", { length: 64 }),
    universeJson: json("universeJson").notNull(),
    startDate: varchar("startDate", { length: 10 }).notNull(),
    endDate: varchar("endDate", { length: 10 }).notNull(),
    barCount: integer("barCount").default(0).notNull(),
    minuteBarCount: integer("minuteBarCount").default(0).notNull(),
    adjustmentBasis: adjustmentBasisEnum("adjustmentBasis").default("unknown").notNull(),
    qualityStatus: qualityStatusEnum("qualityStatus").default("draft").notNull(),
    qualityReportJson: json("qualityReportJson"),
    sourceCapturedAt: timestamp("sourceCapturedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    readyAt: timestamp("readyAt")
  },
  (table) => [uniqueIndex("research_datasets_user_version_unique").on(table.userId, table.versionKey), index("research_datasets_user_status_idx").on(table.userId, table.qualityStatus, table.createdAt), index("research_datasets_public_ready_idx").on(table.visibility, table.qualityStatus, table.readyAt), index("research_datasets_source_fingerprint_idx").on(table.sourceFingerprint)]
);
var researchDailyBars = pgTable(
  "research_daily_bars",
  {
    id: serial("id").primaryKey(),
    datasetId: integer("datasetId").notNull(),
    symbol: varchar("symbol", { length: 24 }).notNull(),
    date: varchar("date", { length: 10 }).notNull(),
    open: integer("open").notNull(),
    high: integer("high").notNull(),
    low: integer("low").notNull(),
    close: integer("close").notNull(),
    volume: decimal("volume", { precision: 20, scale: 0 }).notNull(),
    turnover: decimal("turnover", { precision: 24, scale: 0 }).notNull(),
    source: varchar("source", { length: 40 }).default("kiwoom_ka10081").notNull(),
    capturedAt: timestamp("capturedAt").defaultNow().notNull()
  },
  (table) => [uniqueIndex("research_daily_bars_dataset_symbol_date_unique").on(table.datasetId, table.symbol, table.date), index("research_daily_bars_dataset_symbol_date_idx").on(table.datasetId, table.symbol, table.date)]
);
var researchFiveMinuteBars = pgTable(
  "research_five_minute_bars",
  {
    id: serial("id").primaryKey(),
    datasetId: integer("datasetId").notNull(),
    symbol: varchar("symbol", { length: 24 }).notNull(),
    tradingDate: varchar("tradingDate", { length: 10 }).notNull(),
    intervalAt: timestamp("intervalAt").notNull(),
    open: integer("open").notNull(),
    high: integer("high").notNull(),
    low: integer("low").notNull(),
    close: integer("close").notNull(),
    volume: decimal("volume", { precision: 20, scale: 0 }).notNull(),
    source: varchar("source", { length: 48 }).default("kiwoom_ka10080_5m_aggregate").notNull(),
    rawFingerprint: varchar("rawFingerprint", { length: 64 }).notNull(),
    capturedAt: timestamp("capturedAt").defaultNow().notNull()
  },
  (table) => [uniqueIndex("research_five_minute_dataset_symbol_time_unique").on(table.datasetId, table.symbol, table.intervalAt), index("research_five_minute_dataset_symbol_date_idx").on(table.datasetId, table.symbol, table.tradingDate)]
);
var sharedDatasetBacktests = pgTable(
  "shared_dataset_backtests",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    datasetId: integer("datasetId").notNull(),
    presetId: integer("presetId").notNull(),
    timeframe: timeframeEnum("timeframe").notNull(),
    symbol: varchar("symbol", { length: 24 }).notNull(),
    assumptionsJson: json("assumptionsJson").notNull(),
    resultsJson: json("resultsJson").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull()
  },
  (table) => [index("shared_dataset_backtests_user_created_idx").on(table.userId, table.createdAt), index("shared_dataset_backtests_dataset_created_idx").on(table.datasetId, table.createdAt)]
);
var strategySurvivalLedgers = pgTable(
  "strategy_survival_ledgers",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    presetId: integer("presetId").notNull(),
    timeframe: timeframeEnum("timeframe").notNull(),
    status: varchar("status", { length: 50 }).notNull(),
    criteriaJson: json("criteriaJson").notNull(),
    evidenceJson: json("evidenceJson").notNull(),
    improvementPlanJson: json("improvementPlanJson").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull()
  },
  (table) => [index("strategy_survival_ledgers_user_created_idx").on(table.userId, table.createdAt), index("strategy_survival_ledgers_preset_time_idx").on(table.presetId, table.timeframe, table.createdAt)]
);
var sharedDatasetCollectionRequests = pgTable(
  "shared_dataset_collection_requests",
  {
    id: serial("id").primaryKey(),
    requestedByUserId: integer("requestedByUserId").notNull(),
    randomSeed: integer("randomSeed").notNull(),
    symbolCount: integer("symbolCount").notNull(),
    sampleDays: integer("sampleDays").notNull(),
    status: collectionRequestStatusEnum("status").default("queued").notNull(),
    requestFingerprint: varchar("requestFingerprint", { length: 64 }).notNull(),
    plannedUniverseJson: json("plannedUniverseJson"),
    datasetId: integer("datasetId"),
    acceptedDailyBarCount: integer("acceptedDailyBarCount").default(0).notNull(),
    acceptedFiveMinuteBarCount: integer("acceptedFiveMinuteBarCount").default(0).notNull(),
    progressJson: json("progressJson"),
    resumeCount: integer("resumeCount").default(0).notNull(),
    lastError: varchar("lastError", { length: 500 }),
    requestedAt: timestamp("requestedAt").defaultNow().notNull(),
    startedAt: timestamp("startedAt"),
    completedAt: timestamp("completedAt")
  },
  (table) => [uniqueIndex("shared_dataset_collection_request_fingerprint_unique").on(table.requestFingerprint), index("shared_dataset_collection_request_status_idx").on(table.status, table.requestedAt), index("shared_dataset_collection_request_user_idx").on(table.requestedByUserId, table.requestedAt)]
);
var kiwoomTerminalConnectionChecks = pgTable(
  "kiwoom_terminal_connection_checks",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    terminalIp: varchar("terminalIp", { length: 45 }).notNull(),
    status: connectionStatusEnum("status").notNull(),
    errorCode: varchar("errorCode", { length: 80 }),
    message: varchar("message", { length: 500 }).notNull(),
    verificationJson: json("verificationJson"),
    checkedAt: timestamp("checkedAt").defaultNow().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull()
  },
  (table) => [index("kiwoom_terminal_checks_user_time_idx").on(table.userId, table.checkedAt), index("kiwoom_terminal_checks_ip_time_idx").on(table.terminalIp, table.checkedAt)]
);
var localResearchDailyBars = pgTable(
  "local_research_daily_bars",
  {
    id: serial("id").primaryKey(),
    symbol: varchar("symbol", { length: 24 }).notNull(),
    date: varchar("date", { length: 10 }).notNull(),
    adjustmentBasis: adjustmentBasisEnum("adjustmentBasis").notNull(),
    open: integer("open").notNull(),
    high: integer("high").notNull(),
    low: integer("low").notNull(),
    close: integer("close").notNull(),
    volume: decimal("volume", { precision: 20, scale: 0 }).notNull(),
    turnover: decimal("turnover", { precision: 24, scale: 0 }).notNull(),
    source: varchar("source", { length: 40 }).default("kiwoom_ka10081").notNull(),
    rawFingerprint: varchar("rawFingerprint", { length: 64 }).notNull(),
    capturedAt: timestamp("capturedAt").defaultNow().notNull()
  },
  (table) => [uniqueIndex("local_research_daily_bars_symbol_date_adjustment_unique").on(table.symbol, table.date, table.adjustmentBasis), index("local_research_daily_bars_symbol_date_idx").on(table.symbol, table.date, table.capturedAt)]
);
var researchExperiments = pgTable(
  "research_experiments",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    presetId: integer("presetId").notNull(),
    datasetId: integer("datasetId").notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    randomSeed: integer("randomSeed").notNull(),
    configurationJson: json("configurationJson").notNull(),
    informationCutoffTradingDays: integer("informationCutoffTradingDays").default(1).notNull(),
    trainingStartDate: varchar("trainingStartDate", { length: 10 }),
    trainingEndDate: varchar("trainingEndDate", { length: 10 }),
    validationStartDate: varchar("validationStartDate", { length: 10 }),
    validationEndDate: varchar("validationEndDate", { length: 10 }),
    status: experimentStatusEnum("status").default("draft").notNull(),
    strategySnapshotJson: json("strategySnapshotJson"),
    assumptionsJson: json("assumptionsJson"),
    resultsJson: json("resultsJson"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    completedAt: timestamp("completedAt")
  },
  (table) => [index("research_experiments_user_created_idx").on(table.userId, table.createdAt), index("research_experiments_dataset_idx").on(table.datasetId, table.status)]
);
var walkForwardRuns = pgTable(
  "walk_forward_runs",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    experimentId: integer("experimentId").notNull(),
    status: backtestStatusEnum("status").default("queued").notNull(),
    configurationJson: json("configurationJson").notNull(),
    resultsJson: json("resultsJson"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    completedAt: timestamp("completedAt")
  },
  (table) => [index("walk_forward_runs_user_created_idx").on(table.userId, table.createdAt), index("walk_forward_runs_experiment_idx").on(table.experimentId, table.status)]
);
var evolutionSearches = pgTable(
  "evolution_searches",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    datasetId: integer("datasetId").notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    randomSeed: integer("randomSeed").notNull(),
    configurationJson: json("configurationJson").notNull(),
    status: evolutionSearchStatusEnum("status").default("draft").notNull(),
    summaryJson: json("summaryJson"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    completedAt: timestamp("completedAt")
  },
  (table) => [index("evolution_searches_user_created_idx").on(table.userId, table.createdAt), index("evolution_searches_dataset_status_idx").on(table.datasetId, table.status)]
);
var evolutionGenerations = pgTable(
  "evolution_generations",
  {
    id: serial("id").primaryKey(),
    searchId: integer("searchId").notNull(),
    generationNumber: integer("generationNumber").notNull(),
    populationSize: integer("populationSize").notNull(),
    uniqueCandidateCount: integer("uniqueCandidateCount").default(0).notNull(),
    survivorCount: integer("survivorCount").default(0).notNull(),
    status: generationStatusEnum("status").default("queued").notNull(),
    selectionSummaryJson: json("selectionSummaryJson"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    completedAt: timestamp("completedAt")
  },
  (table) => [uniqueIndex("evolution_generations_search_number_unique").on(table.searchId, table.generationNumber), index("evolution_generations_search_status_idx").on(table.searchId, table.status)]
);
var evolutionCandidates = pgTable(
  "evolution_candidates",
  {
    id: serial("id").primaryKey(),
    searchId: integer("searchId").notNull(),
    generationId: integer("generationId").notNull(),
    fingerprint: varchar("fingerprint", { length: 64 }).notNull(),
    rootGenomeJson: json("rootGenomeJson").notNull(),
    minimumScore: integer("minimumScore").notNull(),
    origin: originEnum("origin").notNull(),
    parentCandidateIdsJson: json("parentCandidateIdsJson"),
    mutationJson: json("mutationJson"),
    inSampleMetricsJson: json("inSampleMetricsJson"),
    outOfSampleMetricsJson: json("outOfSampleMetricsJson"),
    walkForwardMetricsJson: json("walkForwardMetricsJson"),
    fitnessScore: decimal("fitnessScore", { precision: 12, scale: 6 }),
    status: candidateStatusEnum("status").default("created").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    evaluatedAt: timestamp("evaluatedAt")
  },
  (table) => [uniqueIndex("evolution_candidates_search_fingerprint_unique").on(table.searchId, table.fingerprint), index("evolution_candidates_generation_status_idx").on(table.generationId, table.status), index("evolution_candidates_search_fitness_idx").on(table.searchId, table.fitnessScore)]
);
var autonomousResearchRuns = pgTable(
  "autonomous_research_runs",
  {
    id: serial("id").primaryKey(),
    tradingDate: varchar("tradingDate", { length: 10 }).notNull(),
    phase: phaseEnum("phase").default("preparing").notNull(),
    runKey: varchar("runKey", { length: 96 }).notNull(),
    dataStatus: dataStatusEnum("dataStatus").default("pending").notNull(),
    universeJson: json("universeJson"),
    policyVersion: varchar("policyVersion", { length: 40 }).notNull(),
    summaryJson: json("summaryJson"),
    lastError: varchar("lastError", { length: 500 }),
    startedAt: timestamp("startedAt").defaultNow().notNull(),
    lastObservedAt: timestamp("lastObservedAt"),
    completedAt: timestamp("completedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull()
  },
  (table) => [uniqueIndex("autonomous_research_runs_run_key_unique").on(table.runKey), index("autonomous_research_runs_date_phase_idx").on(table.tradingDate, table.phase, table.updatedAt)]
);
var autonomousResearchTasks = pgTable(
  "autonomous_research_tasks",
  {
    id: serial("id").primaryKey(),
    runId: integer("runId").notNull(),
    runKey: varchar("runKey", { length: 96 }).notNull(),
    phase: varchar("phase", { length: 50 }).notNull(),
    status: autonomousTaskStatusEnum("status").default("running").notNull(),
    resultJson: json("resultJson"),
    lastError: varchar("lastError", { length: 500 }),
    startedAt: timestamp("startedAt").defaultNow().notNull(),
    completedAt: timestamp("completedAt")
  },
  (table) => [uniqueIndex("auto_research_tasks_run_key_uq").on(table.runKey), index("auto_research_tasks_run_phase_idx").on(table.runId, table.phase, table.startedAt)]
);
var autonomousResearchBars = pgTable(
  "autonomous_research_bars",
  {
    id: serial("id").primaryKey(),
    runId: integer("runId").notNull(),
    symbol: varchar("symbol", { length: 24 }).notNull(),
    date: varchar("date", { length: 10 }).notNull(),
    open: integer("open").notNull(),
    high: integer("high").notNull(),
    low: integer("low").notNull(),
    close: integer("close").notNull(),
    volume: decimal("volume", { precision: 20, scale: 0 }).notNull(),
    turnover: decimal("turnover", { precision: 24, scale: 0 }).notNull(),
    source: varchar("source", { length: 48 }).default("kiwoom_ka10081").notNull(),
    capturedAt: timestamp("capturedAt").defaultNow().notNull()
  },
  (table) => [uniqueIndex("auto_bars_run_symbol_date_uq").on(table.runId, table.symbol, table.date), index("auto_bars_run_symbol_date_idx").on(table.runId, table.symbol, table.date)]
);
var intradayMinuteBars = pgTable(
  "intraday_minute_bars",
  {
    id: serial("id").primaryKey(),
    tradingDate: varchar("tradingDate", { length: 10 }).notNull(),
    symbol: varchar("symbol", { length: 24 }).notNull(),
    minuteAt: timestamp("minuteAt").notNull(),
    open: integer("open").notNull(),
    high: integer("high").notNull(),
    low: integer("low").notNull(),
    close: integer("close").notNull(),
    volume: decimal("volume", { precision: 20, scale: 0 }).notNull(),
    source: varchar("source", { length: 48 }).default("kiwoom_ka10080").notNull(),
    rawFingerprint: varchar("rawFingerprint", { length: 64 }).notNull(),
    capturedAt: timestamp("capturedAt").defaultNow().notNull()
  },
  (table) => [uniqueIndex("intraday_minute_bar_date_symbol_time_uq").on(table.tradingDate, table.symbol, table.minuteAt), index("intraday_minute_bar_symbol_time_idx").on(table.symbol, table.minuteAt), index("intraday_minute_bar_date_captured_idx").on(table.tradingDate, table.capturedAt)]
);
var autonomousResearchCandidates = pgTable(
  "autonomous_research_candidates",
  {
    id: serial("id").primaryKey(),
    runId: integer("runId").notNull(),
    fingerprint: varchar("fingerprint", { length: 64 }).notNull(),
    rootGenomeJson: json("rootGenomeJson").notNull(),
    minimumScore: integer("minimumScore").notNull(),
    generationNumber: integer("generationNumber").default(0).notNull(),
    status: varchar("status", { length: 50 }).default("generated").notNull(),
    inSampleMetricsJson: json("inSampleMetricsJson"),
    outOfSampleMetricsJson: json("outOfSampleMetricsJson"),
    walkForwardMetricsJson: json("walkForwardMetricsJson"),
    simulationJson: json("simulationJson"),
    fitnessScore: decimal("fitnessScore", { precision: 12, scale: 6 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    evaluatedAt: timestamp("evaluatedAt"),
    updatedAt: timestamp("updatedAt").defaultNow().notNull()
  },
  (table) => [uniqueIndex("autonomous_research_candidates_run_fingerprint_unique").on(table.runId, table.fingerprint), index("autonomous_research_candidates_run_status_idx").on(table.runId, table.status), index("autonomous_research_candidates_run_fitness_idx").on(table.runId, table.fitnessScore)]
);
var researchCommitteeReports = pgTable(
  "research_committee_reports",
  {
    id: serial("id").primaryKey(),
    runId: integer("runId").notNull(),
    sourceRunId: integer("sourceRunId").notNull(),
    evidenceFingerprint: varchar("evidenceFingerprint", { length: 64 }).notNull(),
    policyVersion: varchar("policyVersion", { length: 40 }).notNull(),
    model: varchar("model", { length: 80 }).notNull(),
    status: committeeStatusEnum("status").default("running").notNull(),
    evidenceJson: json("evidenceJson").notNull(),
    memberReviewsJson: json("memberReviewsJson"),
    deliberationJson: json("deliberationJson"),
    lastError: varchar("lastError", { length: 500 }),
    startedAt: timestamp("startedAt").defaultNow().notNull(),
    completedAt: timestamp("completedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("committee_reports_run_evidence_unique").on(table.runId, table.evidenceFingerprint),
    index("committee_reports_run_status_idx").on(table.runId, table.status, table.updatedAt)
  ]
);
var researchGovernanceSchedules = pgTable(
  "research_governance_schedules",
  {
    id: serial("id").primaryKey(),
    taskUid: varchar("taskUid", { length: 65 }),
    scheduleVersion: varchar("scheduleVersion", { length: 40 }).notNull(),
    cronExpression: varchar("cronExpression", { length: 64 }).notNull(),
    isEnabled: boolean("isEnabled").default(true).notNull(),
    latestCycleId: integer("latestCycleId"),
    lastError: varchar("lastError", { length: 500 }),
    lastRequestedAt: timestamp("lastRequestedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull()
  },
  (table) => [uniqueIndex("research_governance_schedule_task_uid_unique").on(table.taskUid)]
);
var researchGovernanceCycles = pgTable(
  "research_governance_cycles",
  {
    id: serial("id").primaryKey(),
    runId: integer("runId").notNull(),
    committeeReportId: integer("committeeReportId").notNull(),
    evidenceFingerprint: varchar("evidenceFingerprint", { length: 64 }).notNull(),
    cycleFingerprint: varchar("cycleFingerprint", { length: 64 }).notNull(),
    policyVersion: varchar("policyVersion", { length: 40 }).notNull(),
    managerModel: varchar("managerModel", { length: 80 }).notNull(),
    status: governanceStatusEnum("status").default("running").notNull(),
    sourceSummaryJson: json("sourceSummaryJson").notNull(),
    managerDirectiveJson: json("managerDirectiveJson"),
    leaderFollowUpsJson: json("leaderFollowUpsJson"),
    lastError: varchar("lastError", { length: 500 }),
    startedAt: timestamp("startedAt").defaultNow().notNull(),
    completedAt: timestamp("completedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("research_governance_cycle_fingerprint_unique").on(table.cycleFingerprint),
    index("research_governance_cycles_run_status_idx").on(table.runId, table.status, table.updatedAt),
    index("research_governance_cycles_committee_idx").on(table.committeeReportId, table.updatedAt)
  ]
);
var researchRevalidationJobs = pgTable(
  "research_revalidation_jobs",
  {
    id: serial("id").primaryKey(),
    governanceCycleId: integer("governanceCycleId").notNull(),
    sourceRunId: integer("sourceRunId").notNull(),
    priorityId: varchar("priorityId", { length: 80 }).notNull(),
    priorityTitle: varchar("priorityTitle", { length: 240 }).notNull(),
    evidenceFingerprint: varchar("evidenceFingerprint", { length: 64 }).notNull(),
    jobFingerprint: varchar("jobFingerprint", { length: 64 }).notNull(),
    scope: scopeEnum("scope").notNull(),
    status: revalidationStatusEnum("status").default("queued").notNull(),
    acceptanceCriteria: text("acceptanceCriteria").notNull(),
    blocker: varchar("blocker", { length: 500 }),
    resultJson: json("resultJson"),
    lastError: varchar("lastError", { length: 500 }),
    startedAt: timestamp("startedAt"),
    completedAt: timestamp("completedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("research_revalidation_job_fingerprint_unique").on(table.jobFingerprint),
    index("research_revalidation_cycle_status_idx").on(table.governanceCycleId, table.status, table.updatedAt),
    index("research_revalidation_source_priority_idx").on(table.sourceRunId, table.priorityId)
  ]
);
var autonomousResearchObservations = pgTable(
  "autonomous_research_observations",
  {
    id: serial("id").primaryKey(),
    runId: integer("runId").notNull(),
    candidateId: integer("candidateId"),
    symbol: varchar("symbol", { length: 24 }).notNull(),
    name: varchar("name", { length: 120 }),
    price: integer("price").notNull(),
    changeRate: decimal("changeRate", { precision: 7, scale: 3 }),
    source: varchar("source", { length: 48 }).notNull(),
    capturedAt: timestamp("capturedAt").defaultNow().notNull()
  },
  (table) => [uniqueIndex("auto_obs_run_cand_symbol_time_uq").on(table.runId, table.candidateId, table.symbol, table.capturedAt), index("auto_obs_run_time_idx").on(table.runId, table.capturedAt)]
);
var dayTradeExperiments = pgTable(
  "day_trade_experiments",
  {
    id: serial("id").primaryKey(),
    runId: integer("runId").notNull(),
    tradingDate: varchar("tradingDate", { length: 10 }).notNull(),
    policyVersion: varchar("policyVersion", { length: 40 }).notNull(),
    status: trackingStatusEnum("status").default("tracking").notNull(),
    totalCapital: integer("totalCapital").notNull(),
    buyFeeRate: decimal("buyFeeRate", { precision: 8, scale: 6 }).notNull(),
    sellFeeRate: decimal("sellFeeRate", { precision: 8, scale: 6 }).notNull(),
    signalCount: integer("signalCount").default(0).notNull(),
    selectedPositionCount: integer("selectedPositionCount").default(0).notNull(),
    netValue: integer("netValue").default(0).notNull(),
    netPnl: integer("netPnl").default(0).notNull(),
    netReturnPercent: decimal("netReturnPercent", { precision: 10, scale: 4 }).default("0").notNull(),
    sourceFingerprint: varchar("sourceFingerprint", { length: 64 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
    closedAt: timestamp("closedAt")
  },
  (table) => [uniqueIndex("day_trade_experiments_run_unique").on(table.runId), index("day_trade_experiments_date_status_idx").on(table.tradingDate, table.status, table.updatedAt)]
);
var dayTradeExperimentPositions = pgTable(
  "day_trade_experiment_positions",
  {
    id: serial("id").primaryKey(),
    experimentId: integer("experimentId").notNull(),
    candidateId: integer("candidateId").notNull(),
    candidateFingerprint: varchar("candidateFingerprint", { length: 64 }).notNull(),
    symbol: varchar("symbol", { length: 24 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    signalCount: integer("signalCount").default(1).notNull(),
    quantity: integer("quantity").notNull(),
    allocation: integer("allocation").notNull(),
    entryPrice: integer("entryPrice").notNull(),
    entryAt: timestamp("entryAt").notNull(),
    lastPrice: integer("lastPrice"),
    lastObservedAt: timestamp("lastObservedAt"),
    exitPrice: integer("exitPrice"),
    exitAt: timestamp("exitAt"),
    buyFee: integer("buyFee").default(0).notNull(),
    estimatedExitFee: integer("estimatedExitFee").default(0).notNull(),
    netValue: integer("netValue").default(0).notNull(),
    netPnl: integer("netPnl").default(0).notNull(),
    netReturnPercent: decimal("netReturnPercent", { precision: 10, scale: 4 }).default("0").notNull(),
    status: trackingStatusEnum("status").default("tracking").notNull(),
    evidenceJson: json("evidenceJson").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull()
  },
  (table) => [uniqueIndex("day_trade_position_experiment_symbol_unique").on(table.experimentId, table.symbol), index("day_trade_positions_candidate_idx").on(table.candidateId, table.updatedAt), index("day_trade_positions_experiment_status_idx").on(table.experimentId, table.status, table.updatedAt)]
);
var localResearchNodeSyncEvents = pgTable(
  "local_research_node_sync_events",
  {
    id: serial("id").primaryKey(),
    experimentId: integer("experimentId"),
    tradingDate: varchar("tradingDate", { length: 10 }).notNull(),
    channel: channelEnum("channel").default("intraday_price").notNull(),
    status: varchar("status", { length: 50 }).notNull(),
    quoteCount: integer("quoteCount").default(0).notNull(),
    rejectedQuoteCount: integer("rejectedQuoteCount").default(0).notNull(),
    message: varchar("message", { length: 500 }),
    observedAt: timestamp("observedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull()
  },
  (table) => [index("local_node_sync_experiment_time_idx").on(table.experimentId, table.createdAt), index("local_node_sync_date_time_idx").on(table.tradingDate, table.createdAt)]
);
var backtestRuns = pgTable(
  "backtest_runs",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    presetId: integer("presetId").notNull(),
    status: backtestStatusEnum("status").default("queued").notNull(),
    startDate: varchar("startDate", { length: 10 }).notNull(),
    endDate: varchar("endDate", { length: 10 }).notNull(),
    initialCapital: integer("initialCapital").notNull(),
    totalReturn: decimal("totalReturn", { precision: 8, scale: 3 }),
    winRate: decimal("winRate", { precision: 6, scale: 2 }),
    tradeCount: integer("tradeCount"),
    maxDrawdown: decimal("maxDrawdown", { precision: 8, scale: 3 }),
    resultsJson: json("resultsJson"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    completedAt: timestamp("completedAt")
  },
  (table) => [index("backtest_runs_user_idx").on(table.userId, table.createdAt)]
);
var orderIntents = pgTable(
  "order_intents",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    presetId: integer("presetId"),
    sourceCandidateId: integer("sourceCandidateId"),
    sourceObservationId: integer("sourceObservationId"),
    symbol: varchar("symbol", { length: 24 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    side: sideEnum("side").notNull(),
    orderType: orderTypeEnum("orderType").default("limit").notNull(),
    quantity: integer("quantity").notNull(),
    price: integer("price").notNull(),
    amount: integer("amount").notNull(),
    status: orderStatusEnum("status").default("pending_confirmation").notNull(),
    riskReasonsJson: json("riskReasonsJson"),
    autoPolicyId: integer("autoPolicyId"),
    autoPolicyVersion: integer("autoPolicyVersion"),
    autoPolicySnapshotJson: json("autoPolicySnapshotJson"),
    executionOrigin: executionOriginEnum("executionOrigin").default("manual").notNull(),
    dedupeKey: varchar("dedupeKey", { length: 160 }),
    confirmationNonce: varchar("confirmationNonce", { length: 64 }),
    confirmedAt: timestamp("confirmedAt"),
    brokerOrderId: varchar("brokerOrderId", { length: 80 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull()
  },
  (table) => [index("order_intents_user_status_idx").on(table.userId, table.status, table.createdAt), index("order_intents_source_observation_idx").on(table.sourceObservationId), uniqueIndex("order_intents_user_dedupe_unique").on(table.userId, table.dedupeKey)]
);
var localMinuteCollectionRequests = pgTable(
  "local_minute_collection_requests",
  {
    id: serial("id").primaryKey(),
    tradingDate: varchar("tradingDate", { length: 10 }).notNull(),
    requestKey: varchar("requestKey", { length: 64 }).notNull(),
    status: collectionRequestStatusEnum("status").default("queued").notNull(),
    source: varchar("source", { length: 48 }).default("public_intraday_monitor").notNull(),
    acceptedBarCount: integer("acceptedBarCount").default(0).notNull(),
    rejectedBarCount: integer("rejectedBarCount").default(0).notNull(),
    lastError: varchar("lastError", { length: 500 }),
    requestedAt: timestamp("requestedAt").defaultNow().notNull(),
    startedAt: timestamp("startedAt"),
    completedAt: timestamp("completedAt"),
    lastSeenAt: timestamp("lastSeenAt"),
    updatedAt: timestamp("updatedAt").defaultNow().notNull()
  },
  (table) => [uniqueIndex("local_minute_collection_request_key_uq").on(table.requestKey), index("local_minute_collection_status_time_idx").on(table.status, table.updatedAt), index("local_minute_collection_date_time_idx").on(table.tradingDate, table.updatedAt)]
);
var orderExecutions = pgTable(
  "order_executions",
  {
    id: serial("id").primaryKey(),
    orderIntentId: integer("orderIntentId").notNull(),
    brokerOrderId: varchar("brokerOrderId", { length: 80 }),
    executionStatus: varchar("executionStatus", { length: 40 }).notNull(),
    filledQuantity: integer("filledQuantity").default(0).notNull(),
    filledPrice: integer("filledPrice"),
    responseJson: json("responseJson"),
    executedAt: timestamp("executedAt").defaultNow().notNull()
  },
  (table) => [index("order_executions_intent_idx").on(table.orderIntentId)]
);
var positionSnapshots = pgTable(
  "position_snapshots",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    symbol: varchar("symbol", { length: 24 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    quantity: integer("quantity").notNull(),
    averagePrice: integer("averagePrice").notNull(),
    currentPrice: integer("currentPrice").notNull(),
    profitLoss: integer("profitLoss").notNull(),
    profitLossRate: decimal("profitLossRate", { precision: 8, scale: 3 }).notNull(),
    capturedAt: timestamp("capturedAt").defaultNow().notNull()
  },
  (table) => [index("position_snapshots_user_idx").on(table.userId, table.capturedAt)]
);
var paperPortfolios = pgTable(
  "paper_portfolios",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    initialCash: integer("initialCash").notNull(),
    cashBalance: integer("cashBalance").notNull(),
    status: varchar("status", { length: 50 }).default("active").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull()
  },
  (table) => [index("paper_portfolios_user_status_idx").on(table.userId, table.status, table.updatedAt)]
);
var paperPositions = pgTable(
  "paper_positions",
  {
    id: serial("id").primaryKey(),
    portfolioId: integer("portfolioId").notNull(),
    sourceCandidateId: integer("sourceCandidateId"),
    symbol: varchar("symbol", { length: 24 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    quantity: integer("quantity").notNull(),
    entryPrice: integer("entryPrice").notNull(),
    latestPrice: integer("latestPrice").notNull(),
    unrealizedPnl: integer("unrealizedPnl").default(0).notNull(),
    status: varchar("status", { length: 50 }).default("open").notNull(),
    openedAt: timestamp("openedAt").defaultNow().notNull(),
    closedAt: timestamp("closedAt"),
    updatedAt: timestamp("updatedAt").defaultNow().notNull()
  },
  (table) => [index("paper_positions_portfolio_status_idx").on(table.portfolioId, table.status, table.updatedAt), index("paper_positions_candidate_idx").on(table.sourceCandidateId)]
);
var paperPortfolioPriceEvents = pgTable(
  "paper_portfolio_price_events",
  {
    id: serial("id").primaryKey(),
    portfolioId: integer("portfolioId").notNull(),
    positionId: integer("positionId").notNull(),
    eventType: eventTypeEnum("eventType").notNull(),
    price: integer("price").notNull(),
    source: varchar("source", { length: 48 }).notNull(),
    sourceTimestamp: timestamp("sourceTimestamp").notNull(),
    evidenceJson: json("evidenceJson").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull()
  },
  (table) => [index("paper_price_events_position_time_idx").on(table.positionId, table.sourceTimestamp), index("paper_price_events_portfolio_time_idx").on(table.portfolioId, table.sourceTimestamp)]
);
var minuteResearchPrograms = pgTable(
  "minute_research_programs",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    status: varchar("status", { length: 50 }).default("active").notNull(),
    cronExpression: varchar("cronExpression", { length: 64 }).notNull(),
    scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
    configurationJson: json("configurationJson").notNull(),
    lastSweepId: integer("lastSweepId"),
    lastError: varchar("lastError", { length: 500 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull()
  },
  (table) => [uniqueIndex("minute_research_program_user_unique").on(table.userId), index("minute_research_program_task_idx").on(table.scheduleCronTaskUid, table.status)]
);
var minuteResearchSweeps = pgTable(
  "minute_research_sweeps",
  {
    id: serial("id").primaryKey(),
    programId: integer("programId").notNull(),
    runKey: varchar("runKey", { length: 128 }).notNull(),
    tradingDatesJson: json("tradingDatesJson").notNull(),
    datasetFingerprint: varchar("datasetFingerprint", { length: 64 }).notNull(),
    configurationJson: json("configurationJson").notNull(),
    status: sweepStatusEnum("status").default("queued").notNull(),
    generatedCount: integer("generatedCount").default(0).notNull(),
    evaluatedCount: integer("evaluatedCount").default(0).notNull(),
    promotedCount: integer("promotedCount").default(0).notNull(),
    rejectedCount: integer("rejectedCount").default(0).notNull(),
    summaryJson: json("summaryJson"),
    lastError: varchar("lastError", { length: 500 }),
    startedAt: timestamp("startedAt").defaultNow().notNull(),
    completedAt: timestamp("completedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull()
  },
  (table) => [uniqueIndex("minute_research_sweep_run_key_unique").on(table.runKey), index("minute_research_sweep_program_status_idx").on(table.programId, table.status, table.updatedAt)]
);
var minuteResearchCandidates = pgTable(
  "minute_research_candidates",
  {
    id: serial("id").primaryKey(),
    sweepId: integer("sweepId").notNull(),
    strategyFingerprint: varchar("strategyFingerprint", { length: 64 }).notNull(),
    fingerprint: varchar("fingerprint", { length: 64 }).notNull(),
    rootGenomeJson: json("rootGenomeJson").notNull(),
    minimumScore: integer("minimumScore").notNull(),
    status: minuteResearchStatusEnum("status").default("evaluated").notNull(),
    fitnessScore: decimal("fitnessScore", { precision: 14, scale: 6 }).notNull(),
    tradeCount: integer("tradeCount").default(0).notNull(),
    winRate: decimal("winRate", { precision: 9, scale: 4 }).default("0").notNull(),
    netReturnPercent: decimal("netReturnPercent", { precision: 14, scale: 6 }).default("0").notNull(),
    expectancyPercent: decimal("expectancyPercent", { precision: 14, scale: 6 }).default("0").notNull(),
    maxDrawdownPercent: decimal("maxDrawdownPercent", { precision: 14, scale: 6 }).default("0").notNull(),
    validationTradeCount: integer("validationTradeCount").default(0).notNull(),
    validationReturnPercent: decimal("validationReturnPercent", { precision: 14, scale: 6 }).default("0").notNull(),
    validationExpectancyPercent: decimal("validationExpectancyPercent", { precision: 14, scale: 6 }).default("0").notNull(),
    validationMaxDrawdownPercent: decimal("validationMaxDrawdownPercent", { precision: 14, scale: 6 }).default("0").notNull(),
    inSampleMetricsJson: json("inSampleMetricsJson").notNull(),
    outOfSampleMetricsJson: json("outOfSampleMetricsJson"),
    qualificationJson: json("qualificationJson").notNull(),
    collectedPresetId: integer("collectedPresetId"),
    createdAt: timestamp("createdAt").defaultNow().notNull()
  },
  (table) => [uniqueIndex("minute_research_candidate_sweep_fingerprint_unique").on(table.sweepId, table.fingerprint), index("minute_research_candidate_sweep_status_idx").on(table.sweepId, table.status, table.fitnessScore), index("minute_research_candidate_strategy_idx").on(table.strategyFingerprint, table.status, table.createdAt)]
);
var minuteResearchDailyMetrics = pgTable(
  "minute_research_daily_metrics",
  {
    id: serial("id").primaryKey(),
    sweepId: integer("sweepId").notNull(),
    candidateId: integer("candidateId").notNull(),
    tradingDate: varchar("tradingDate", { length: 10 }).notNull(),
    symbolCount: integer("symbolCount").default(0).notNull(),
    tradeCount: integer("tradeCount").default(0).notNull(),
    winRate: decimal("winRate", { precision: 9, scale: 4 }).default("0").notNull(),
    netReturnPercent: decimal("netReturnPercent", { precision: 14, scale: 6 }).default("0").notNull(),
    expectancyPercent: decimal("expectancyPercent", { precision: 14, scale: 6 }).default("0").notNull(),
    maxDrawdownPercent: decimal("maxDrawdownPercent", { precision: 14, scale: 6 }).default("0").notNull(),
    metricsJson: json("metricsJson").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull()
  },
  (table) => [uniqueIndex("minute_research_daily_metric_unique").on(table.candidateId, table.tradingDate), index("minute_research_daily_metric_sweep_date_idx").on(table.sweepId, table.tradingDate)]
);
var minuteResearchSymbolMetrics = pgTable(
  "minute_research_symbol_metrics",
  {
    id: serial("id").primaryKey(),
    sweepId: integer("sweepId").notNull(),
    candidateId: integer("candidateId").notNull(),
    tradingDate: varchar("tradingDate", { length: 10 }).notNull(),
    symbol: varchar("symbol", { length: 24 }).notNull(),
    regime: regimeEnum("regime").notNull(),
    tradeCount: integer("tradeCount").default(0).notNull(),
    winRate: decimal("winRate", { precision: 9, scale: 4 }).default("0").notNull(),
    netReturnPercent: decimal("netReturnPercent", { precision: 14, scale: 6 }).default("0").notNull(),
    expectancyPercent: decimal("expectancyPercent", { precision: 14, scale: 6 }).default("0").notNull(),
    maxDrawdownPercent: decimal("maxDrawdownPercent", { precision: 14, scale: 6 }).default("0").notNull(),
    metricsJson: json("metricsJson").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull()
  },
  (table) => [uniqueIndex("minute_research_symbol_metric_unique").on(table.candidateId, table.tradingDate, table.symbol), index("minute_research_symbol_metric_sweep_regime_idx").on(table.sweepId, table.regime, table.tradingDate)]
);

// server/_core/env.ts
var ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? ""
};

// server/db.ts
var _db = null;
var _client = null;
async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _client = postgres(process.env.DATABASE_URL);
      _db = drizzle(_client);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
      _client = null;
    }
  }
  return _db;
}
async function upsertUser(user) {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }
  try {
    const values = {
      openId: user.openId
    };
    const updateSet = {};
    const textFields = ["name", "email", "loginMethod"];
    const assignNullable = (field) => {
      const value = user[field];
      if (value === void 0) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== void 0) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== void 0) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (!values.lastSignedIn) {
      values.lastSignedIn = /* @__PURE__ */ new Date();
    }
    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = /* @__PURE__ */ new Date();
    }
    await db.insert(users).values(values).onConflictDoUpdate({
      target: users.openId,
      set: updateSet
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return void 0;
  }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getSessionCookieOptions(req) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: isSecureRequest(req)
  };
}

// shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// server/_core/sdk.ts
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";
var isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
var EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
var GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
var GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
var OAuthService = class {
  constructor(client) {
    this.client = client;
    console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
    if (!ENV.oAuthServerUrl) {
      console.error(
        "[OAuth] ERROR: OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL environment variable."
      );
    }
  }
  decodeState(state) {
    return decodeOAuthState(state).redirectUri;
  }
  async getTokenByCode(code, state) {
    const payload = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state)
    };
    const { data } = await this.client.post(
      EXCHANGE_TOKEN_PATH,
      payload
    );
    return data;
  }
  async getUserInfoByToken(token) {
    const { data } = await this.client.post(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken
      }
    );
    return data;
  }
};
var createOAuthHttpClient = () => axios.create({
  baseURL: ENV.oAuthServerUrl,
  timeout: AXIOS_TIMEOUT_MS
});
var SDKServer = class {
  client;
  oauthService;
  constructor(client = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }
  deriveLoginMethod(platforms, fallback) {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set(
      platforms.filter((p) => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }
  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(code, state) {
    return this.oauthService.getTokenByCode(code, state);
  }
  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken) {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken
    });
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  parseCookies(cookieHeader) {
    if (!cookieHeader) {
      return /* @__PURE__ */ new Map();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  getSessionSecret() {
    const secret = ENV.cookieSecret;
    return new TextEncoder().encode(secret);
  }
  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(openId, options = {}) {
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || ""
      },
      options
    );
  }
  async signSession(payload, options = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
    const secretKey = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey);
  }
  async verifySession(cookieValue) {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"]
      });
      const { openId, appId, name } = payload;
      if (!isNonEmptyString(openId) || !isNonEmptyString(appId) || !isNonEmptyString(name)) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }
      return {
        openId,
        appId,
        name
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }
  async getUserInfoWithJwt(jwtToken) {
    const payload = {
      jwtToken,
      projectId: ENV.appId
    };
    const { data } = await this.client.post(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  async authenticateRequest(req) {
    const cookies = this.parseCookies(req.headers.cookie);
    let sessionToken = cookies.get(COOKIE_NAME);
    if (!sessionToken) {
      const authHeader = req.headers.authorization;
      if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
        sessionToken = authHeader.slice(7);
      }
    }
    const session = await this.verifySession(sessionToken);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }
    if (session.openId.startsWith(CRON_OPEN_ID_PREFIX)) {
      const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
      const taskUid = userInfo.taskUid ?? null;
      if (!taskUid) {
        throw ForbiddenError("Cron session missing task_uid");
      }
      return buildCronUser(userInfo);
    }
    const sessionUserId = session.openId;
    const signedInAt = /* @__PURE__ */ new Date();
    let user = await getUserByOpenId(sessionUserId);
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
        await upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt
        });
        user = await getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }
    if (!user) {
      throw ForbiddenError("User not found");
    }
    return refreshAuthenticatedUser(user, signedInAt);
  }
};
async function refreshAuthenticatedUser(user, signedInAt) {
  await upsertUser({
    openId: user.openId,
    lastSignedIn: signedInAt
  });
  return await getUserByOpenId(user.openId) ?? user;
}
var CRON_OPEN_ID_PREFIX = "cron_";
function buildCronUser(userInfo) {
  const now = /* @__PURE__ */ new Date();
  return {
    id: -1,
    openId: userInfo.openId,
    name: userInfo.name || "Manus Scheduled Task",
    email: null,
    loginMethod: null,
    role: "user",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
    taskUid: userInfo.taskUid ?? void 0,
    isCron: true
  };
}
var sdk = new SDKServer();

// server/_core/oauth.ts
function getQueryParam(req, key) {
  const value = req.query[key];
  return typeof value === "string" ? value : void 0;
}
function registerOAuthRoutes(app2) {
  app2.get("/api/oauth/callback", async (req, res) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }
    const { nonce } = decodeOAuthState(state);
    const expectedNonce = parseCookieHeader2(req.headers.cookie ?? "")[OAUTH_STATE_COOKIE];
    if (!nonce || nonce !== expectedNonce) {
      res.status(403).json({ error: "invalid oauth state" });
      return;
    }
    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/", secure: true, sameSite: "none" });
    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }
      await upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
import { TRPCError } from "@trpc/server";
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString2 = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString2(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString2(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";

// server/auth/operator.ts
var OPERATOR_EMAIL = "salad20c@gmail.com";
function normalizeEmail(email) {
  return email?.trim().toLowerCase() ?? "";
}
function isConfiguredOperatorEmail(email) {
  return normalizeEmail(email) === OPERATOR_EMAIL;
}
function getOperatorReason(user) {
  if (!user) return null;
  if (user.role === "admin") return "admin_role";
  if (Boolean(process.env.OWNER_OPEN_ID) && user.openId === process.env.OWNER_OPEN_ID) return "owner_open_id";
  if (isConfiguredOperatorEmail(user.email)) return "configured_operator_email";
  return null;
}
function isOperatorUser(user) {
  return getOperatorReason(user) !== null;
}

// server/_core/trpc.ts
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var requireOperator = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user || !isOperatorUser(ctx.user)) {
    throw new TRPCError2({ code: "FORBIDDEN", message: "\uC6B4\uC601\uC790 \uAD8C\uD55C\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});
var operatorProcedure = t.procedure.use(requireOperator);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/_core/serverEgress.ts
var cached = null;
async function resolveServerEgressIdentity(input = {}) {
  const now = input.now ?? /* @__PURE__ */ new Date();
  if (cached && cached.expiresAt > now.getTime()) return cached.value;
  const checkedAt = now.toISOString();
  try {
    const fetcher = input.fetcher ?? ((url, init) => fetch(url, init));
    const providers = ["https://checkip.amazonaws.com", "https://icanhazip.com"];
    const responses = await Promise.all(providers.map(async (url) => {
      const response = await fetcher(url, { signal: AbortSignal.timeout(4e3) });
      const ip = (await response.text()).trim();
      if (!response.ok || !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) throw new Error("invalid egress IP response");
      return ip;
    }));
    const distinct = Array.from(new Set(responses));
    const value = distinct.length === 1 ? { ip: distinct[0], checkedAt, cacheStatus: "fresh" } : { ip: null, checkedAt, cacheStatus: "mismatch" };
    cached = { value, expiresAt: now.getTime() + (input.cacheTtlMs ?? 5 * 6e4) };
    return value;
  } catch {
    const value = { ip: null, checkedAt, cacheStatus: "unavailable" };
    cached = { value, expiresAt: now.getTime() + (input.cacheTtlMs ?? 6e4) };
    return value;
  }
}

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  serverEgress: publicProcedure.query(async () => ({
    ...await resolveServerEgressIdentity(),
    registrationScope: "server_egress_only"
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/routers/quant.ts
import { TRPCError as TRPCError3 } from "@trpc/server";
import { and as and2, eq as eq3 } from "drizzle-orm";
import { z as z2 } from "zod";

// server/quant/risk.ts
function evaluateOrderRisk(candidate, settings, confirmedOrderCountToday, connectionReady) {
  const amount = candidate.quantity * candidate.price;
  const reasons = [];
  if (!connectionReady) reasons.push("\uD0A4\uC6C0 API \uC5F0\uACB0\uACFC \uACC4\uC88C \uAC80\uC99D\uC774 \uC644\uB8CC\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.");
  if (settings.killSwitch) reasons.push("\uD0AC \uC2A4\uC704\uCE58\uAC00 \uD65C\uC131\uD654\uB418\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.");
  if (!settings.autoTradeEnabled) reasons.push("\uC790\uB3D9\uB9E4\uB9E4\uAC00 \uBE44\uD65C\uC131\uD654\uB418\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.");
  if (candidate.side === "buy" && amount > settings.maxBuyAmount) {
    reasons.push("\uC8FC\uBB38 \uAE08\uC561\uC774 \uB2E8\uC77C \uB9E4\uC218 \uD55C\uB3C4\uB97C \uCD08\uACFC\uD569\uB2C8\uB2E4.");
  }
  if (confirmedOrderCountToday >= settings.dailyTradeLimit) {
    reasons.push("\uC77C\uC77C \uAC70\uB798 \uD69F\uC218 \uD55C\uB3C4\uC5D0 \uB3C4\uB2EC\uD588\uC2B5\uB2C8\uB2E4.");
  }
  if (!settings.requireConfirmation) {
    reasons.push("\uC8FC\uBB38 \uC804 \uD655\uC778 \uB2E8\uACC4\uB294 \uD56D\uC0C1 \uD544\uC218\uC785\uB2C8\uB2E4.");
  }
  return { allowed: reasons.length === 0, amount, reasons };
}
function mayTransmitOrder(input) {
  return Boolean(input.confirmedAt && input.confirmationNonce && input.status === "confirmed");
}

// server/kiwoom/dailyBars.ts
var asNumber = (value) => {
  const parsed = Number(String(value ?? "0").replace(/,/g, "").replace(/^[+]/, ""));
  return Number.isFinite(parsed) ? Math.abs(parsed) : 0;
};
function normalizeKiwoomDailyBars(rows) {
  return rows.map((row) => ({
    date: String(row.dt ?? ""),
    open: asNumber(row.open_pric),
    high: asNumber(row.high_pric),
    low: asNumber(row.low_pric),
    close: asNumber(row.cur_prc),
    volume: asNumber(row.trde_qty),
    turnover: asNumber(row.trde_prica) * 1e6
  })).filter((bar) => Boolean(bar.date) && bar.close > 0 && bar.high > 0 && bar.low > 0).sort((left, right) => left.date.localeCompare(right.date));
}

// server/kiwoom/minuteBars.ts
function asNumber2(value) {
  return Math.abs(Number(String(value ?? "0").replace(/[^0-9.-]/g, "")) || 0);
}
function parseKiwoomMinuteTimestamp(value) {
  const compact = String(value ?? "").replace(/\D/g, "");
  if (!/^\d{14}$/.test(compact)) return null;
  const year = Number(compact.slice(0, 4));
  const month = Number(compact.slice(4, 6));
  const day = Number(compact.slice(6, 8));
  const hour = Number(compact.slice(8, 10));
  const minute = Number(compact.slice(10, 12));
  const second = Number(compact.slice(12, 14));
  const date = new Date(Date.UTC(year, month - 1, day, hour - 9, minute, second));
  return Number.isNaN(date.getTime()) ? null : date;
}
function normalizeKiwoomMinuteBars(rows) {
  const byMinute = /* @__PURE__ */ new Map();
  rows.forEach((row) => {
    const minuteAt = parseKiwoomMinuteTimestamp(row.cntr_tm);
    const open = asNumber2(row.open_pric);
    const high = asNumber2(row.high_pric);
    const low = asNumber2(row.low_pric);
    const close = asNumber2(row.cur_prc);
    const volume = asNumber2(row.trde_qty);
    if (!minuteAt || open < 1 || high < 1 || low < 1 || close < 1 || volume < 0) return;
    byMinute.set(minuteAt.getTime(), { minuteAt, open, high, low, close, volume });
  });
  return Array.from(byMinute.values()).sort((left, right) => left.minuteAt.getTime() - right.minuteAt.getTime());
}

// server/kiwoom/rateLimiter.ts
var defaultDelay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
var TokenRequestPacer = class {
  constructor(minimumIntervalMs = 200, now = () => Date.now(), delay = defaultDelay) {
    this.minimumIntervalMs = minimumIntervalMs;
    this.now = now;
    this.delay = delay;
  }
  nextAllowedAt = /* @__PURE__ */ new Map();
  async wait(tokenKey) {
    const current = this.now();
    const scheduledAt = Math.max(current, this.nextAllowedAt.get(tokenKey) ?? current);
    this.nextAllowedAt.set(tokenKey, scheduledAt + this.minimumIntervalMs);
    const waitMs = scheduledAt - current;
    if (waitMs > 0) await this.delay(waitMs);
  }
};
var kiwoomDomesticReadPacer = new TokenRequestPacer(200);

// server/kiwoom/client.ts
var accessTokenCache = /* @__PURE__ */ new Map();
var accessTokenErrors = /* @__PURE__ */ new Map();
function resolveTokenValidity(expiresAt) {
  const compact = expiresAt.replace(/[^0-9]/g, "");
  if (compact.length >= 14) {
    const timestamp2 = new Date(Number(compact.slice(0, 4)), Number(compact.slice(4, 6)) - 1, Number(compact.slice(6, 8)), Number(compact.slice(8, 10)), Number(compact.slice(10, 12)), Number(compact.slice(12, 14))).getTime();
    if (Number.isFinite(timestamp2)) return timestamp2;
  }
  return Date.now() + 50 * 60 * 1e3;
}
var KiwoomApiError = class extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
    this.name = "KiwoomApiError";
  }
};
var KiwoomClient = class {
  mode;
  baseUrl;
  appKey;
  appSecret;
  readPacer;
  readRetryDelay;
  constructor(input) {
    this.mode = input?.mode ?? (process.env.KIWOOM_API_MODE === "mock" ? "mock" : "live");
    this.baseUrl = this.mode === "live" ? "https://api.kiwoom.com" : "https://mockapi.kiwoom.com";
    this.appKey = input?.appKey ?? process.env.KIWOOM_APP_KEY ?? "";
    this.appSecret = input?.appSecret ?? process.env.KIWOOM_APP_SECRET ?? "";
    this.readPacer = input?.readPacer ?? kiwoomDomesticReadPacer;
    this.readRetryDelay = input?.readRetryDelay ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }
  getStatus() {
    const fixedIpRegistered = process.env.KIWOOM_FIXED_IP_REGISTERED === "true";
    const hasCredentials = Boolean(this.appKey && this.appSecret && process.env.KIWOOM_ACCOUNT_NUMBER);
    const mayTransmitOrders = this.mode === "live" && fixedIpRegistered && hasCredentials && process.env.KIWOOM_ORDER_TRANSMISSION_ENABLED === "true";
    return { mode: this.mode, fixedIpRegistered, hasCredentials, mayTransmitOrders };
  }
  async issueAccessToken() {
    this.assertFixedIpRegistered();
    this.assertCredentials();
    const response = await fetch(`${this.baseUrl}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json;charset=UTF-8" },
      body: JSON.stringify({ grant_type: "client_credentials", appkey: this.appKey, secretkey: this.appSecret })
    });
    const payload = await this.readJson(response);
    if (!response.ok || !payload.token || String(payload.return_code ?? "0") !== "0") {
      throw new KiwoomApiError(payload.return_msg ?? "\uD0A4\uC6C0 OAuth \uD1A0\uD070 \uBC1C\uAE09\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.", payload.return_code);
    }
    return { token: payload.token, tokenType: payload.token_type ?? "bearer", expiresAt: payload.expires_dt ?? "" };
  }
  async getAccessToken() {
    const cacheKey = `${this.mode}:${this.appKey}`;
    const cached2 = accessTokenCache.get(cacheKey);
    if (cached2 && cached2.validUntil > Date.now() + 6e4) {
      return { token: cached2.token, tokenType: cached2.tokenType, expiresAt: cached2.expiresAt };
    }
    try {
      const issued = await this.issueAccessToken();
      accessTokenCache.set(cacheKey, { ...issued, validUntil: resolveTokenValidity(issued.expiresAt) });
      accessTokenErrors.delete(cacheKey);
      return issued;
    } catch (error) {
      accessTokenErrors.set(cacheKey, error instanceof Error ? error.message : "OAuth \uD1A0\uD070 \uBC1C\uAE09\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.");
      throw error;
    }
  }
  clearAccessToken() {
    const cacheKey = `${this.mode}:${this.appKey}`;
    accessTokenCache.delete(cacheKey);
    accessTokenErrors.delete(cacheKey);
  }
  getAccessTokenStatus() {
    const cacheKey = `${this.mode}:${this.appKey}`;
    const cached2 = accessTokenCache.get(cacheKey);
    const error = accessTokenErrors.get(cacheKey);
    if (error) return { state: "error", expiresAt: null, error };
    if (!cached2) return { state: "not_issued", expiresAt: null, error: null };
    return { state: cached2.validUntil <= Date.now() + 5 * 6e4 ? "expiring" : "cached", expiresAt: cached2.expiresAt || null, error: null };
  }
  async getDailyBars(accessToken, input) {
    this.assertFixedIpRegistered();
    const baseDate = input.baseDate ?? (/* @__PURE__ */ new Date()).toISOString().slice(0, 10).replaceAll("-", "");
    const maxPages = Math.min(Math.max(input.maxPages ?? 3, 1), 10);
    const rows = [];
    let continuation = "N";
    let nextKey = "";
    for (let page = 0; page < maxPages; page += 1) {
      if (page > 0) await new Promise((resolve) => setTimeout(resolve, 1e3));
      await this.readPacer.wait(`${this.mode}:${accessToken}`);
      const { response, payload } = await this.fetchReadJson(`${this.baseUrl}/api/dostk/chart`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json;charset=UTF-8",
          authorization: `Bearer ${accessToken}`,
          "api-id": "ka10081",
          "cont-yn": continuation,
          "next-key": nextKey
        },
        body: JSON.stringify({ stk_cd: input.symbol, base_dt: baseDate, upd_stkpc_tp: input.adjustedPrice ?? "1" })
      });
      if (!response.ok || String(payload.return_code ?? "0") !== "0") {
        throw new KiwoomApiError(payload.return_msg ?? "\uD0A4\uC6C0 \uC77C\uBD09 \uCC28\uD2B8 \uC870\uD68C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.", payload.return_code);
      }
      if (Array.isArray(payload.stk_dt_pole_chart_qry)) rows.push(...payload.stk_dt_pole_chart_qry);
      const responseContinuation = String(payload.cont_yn ?? "N");
      const responseNextKey = String(payload.next_key ?? "");
      if (responseContinuation !== "Y" || !responseNextKey) break;
      continuation = "Y";
      nextKey = responseNextKey;
    }
    if (!rows.length) throw new KiwoomApiError("\uD0A4\uC6C0 \uC77C\uBD09 \uCC28\uD2B8 \uC751\uB2F5\uC5D0 \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.");
    return normalizeKiwoomDailyBars(rows);
  }
  /** ka10080의 5분 범위 응답을 시간순 OHLCV로 정규화한다. 주문·계좌 API와는 분리된 읽기 전용 요청이다. */
  async getFiveMinuteBars(accessToken, input) {
    this.assertFixedIpRegistered();
    const maxPages = Math.min(Math.max(input.maxPages ?? 3, 1), 10);
    const rows = [];
    let continuation = "N";
    let nextKey = "";
    for (let page = 0; page < maxPages; page += 1) {
      if (page > 0) await new Promise((resolve) => setTimeout(resolve, 1e3));
      await this.readPacer.wait(`${this.mode}:${accessToken}`);
      const { response, payload } = await this.fetchReadJson(`${this.baseUrl}/api/dostk/chart`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json;charset=UTF-8",
          authorization: `Bearer ${accessToken}`,
          "api-id": "ka10080",
          "cont-yn": continuation,
          "next-key": nextKey
        },
        body: JSON.stringify({ stk_cd: input.symbol, tic_scope: "5", upd_stkpc_tp: input.adjustedPrice ?? "1", base_dt: input.baseDate })
      });
      if (!response.ok || String(payload.return_code ?? "0") !== "0") {
        throw new KiwoomApiError(payload.return_msg ?? "\uD0A4\uC6C0 5\uBD84\uBD09 \uCC28\uD2B8 \uC870\uD68C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.", payload.return_code);
      }
      if (Array.isArray(payload.stk_min_pole_chart_qry)) rows.push(...payload.stk_min_pole_chart_qry);
      const responseContinuation = String(payload.cont_yn ?? "N");
      const responseNextKey = String(payload.next_key ?? "");
      if (responseContinuation !== "Y" || !responseNextKey) break;
      continuation = "Y";
      nextKey = responseNextKey;
    }
    if (!rows.length) throw new KiwoomApiError("\uD0A4\uC6C0 5\uBD84\uBD09 \uCC28\uD2B8 \uC751\uB2F5\uC5D0 \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.");
    return normalizeKiwoomMinuteBars(rows);
  }
  async getTurnoverRankings(accessToken, input = {}) {
    this.assertFixedIpRegistered();
    const exchange = input.exchange ?? "KRX";
    const { response, payload } = await this.fetchReadJson(`${this.baseUrl}/api/dostk/rkinfo`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json;charset=UTF-8",
        authorization: `Bearer ${accessToken}`,
        "api-id": "ka10032",
        "cont-yn": input.continuation?.enabled ? "Y" : "N",
        "next-key": input.continuation?.nextKey ?? ""
      },
      body: JSON.stringify({
        mrkt_tp: input.market ?? "000",
        mang_stk_incls: input.includeManagedStocks ? "1" : "0",
        stex_tp: exchange === "KRX" ? "1" : exchange === "NXT" ? "2" : "3"
      })
    });
    if (!response.ok || String(payload.return_code ?? "0") !== "0") {
      throw new KiwoomApiError(payload.return_msg ?? "\uD0A4\uC6C0 \uAC70\uB798\uB300\uAE08 \uC21C\uC704 \uC870\uD68C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.", payload.return_code);
    }
    const number = (value, absolute = false) => {
      const parsed = Number(String(value ?? "0").replace(/,/g, "").trim()) || 0;
      return absolute ? Math.abs(parsed) : parsed;
    };
    const items = (payload.trde_prica_upper ?? []).map((item) => ({
      symbol: String(item.stk_cd ?? ""),
      rank: number(item.now_rank),
      previousRank: item.pred_rank ? number(item.pred_rank) : null,
      name: String(item.stk_nm ?? ""),
      price: number(item.cur_prc, true),
      change: number(item.pred_pre),
      changeRate: number(item.flu_rt),
      volume: number(item.now_trde_qty, true),
      previousVolume: number(item.pred_trde_qty, true),
      turnover: number(item.trde_prica, true) * 1e6
    }));
    const continuation = response.headers.get("cont-yn") === "Y";
    return { items, continuation: { enabled: continuation, nextKey: continuation ? response.headers.get("next-key") : null } };
  }
  async listAccounts(accessToken) {
    this.assertFixedIpRegistered();
    const response = await fetch(`${this.baseUrl}/api/dostk/acnt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json;charset=UTF-8",
        authorization: `Bearer ${accessToken}`,
        "api-id": "ka00001"
      },
      body: JSON.stringify({})
    });
    const payload = await this.readJson(response);
    if (!response.ok || String(payload.return_code ?? "0") !== "0") {
      throw new KiwoomApiError(payload.return_msg ?? "\uD0A4\uC6C0 \uACC4\uC88C \uC870\uD68C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.", payload.return_code);
    }
    return Array.isArray(payload.acctNo) ? payload.acctNo : payload.acctNo ? [payload.acctNo] : [];
  }
  assertOrderMayBeSubmitted(input) {
    const connectionReady = this.getStatus().mayTransmitOrders;
    const risk = evaluateOrderRisk(input.candidate, input.settings, input.confirmedOrderCountToday, connectionReady);
    if (!risk.allowed) throw new KiwoomApiError(risk.reasons.join(" "));
    if (!mayTransmitOrder(input)) throw new KiwoomApiError("\uD544\uC218 \uCD5C\uC885 \uD655\uC778\uC774 \uC644\uB8CC\uB418\uC9C0 \uC54A\uC558\uAC70\uB098 \uC774\uBBF8 \uC804\uC1A1\uB41C \uC8FC\uBB38\uC785\uB2C8\uB2E4.");
  }
  async submitLiveBuyOrder(accessToken, input) {
    const status = this.getStatus();
    if (!status.mayTransmitOrders) throw new KiwoomApiError("\uC2E4\uC8FC\uBB38 \uC804\uC1A1\uC740 \uACE0\uC815 IP \uB4F1\uB85D\uACFC \uBCC4\uB3C4 \uC804\uC1A1 \uC2B9\uC778\uC774 \uBAA8\uB450 \uD544\uC694\uD569\uB2C8\uB2E4.", "ORDER_TRANSMISSION_DISABLED");
    const response = await fetch(`${this.baseUrl}/api/dostk/ordr`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json;charset=UTF-8",
        authorization: `Bearer ${accessToken}`,
        "api-id": "kt10000"
      },
      body: JSON.stringify({
        dmst_stex_tp: input.exchange,
        stk_cd: input.symbol,
        ord_qty: String(input.quantity),
        ...input.price ? { ord_uv: String(input.price) } : {},
        trde_tp: input.tradeType,
        ...input.conditionPrice ? { cond_uv: String(input.conditionPrice) } : {}
      })
    });
    const payload = await this.readJson(response);
    if (!response.ok || !payload.ord_no || String(payload.return_code ?? "0") !== "0") {
      throw new KiwoomApiError(payload.return_msg ?? "\uD0A4\uC6C0 \uB9E4\uC218 \uC8FC\uBB38\uC774 \uC811\uC218\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.", payload.return_code);
    }
    return { orderNumber: payload.ord_no, exchange: payload.dmst_stex_tp ?? input.exchange };
  }
  async listOrderExecutions(accessToken, input) {
    this.assertFixedIpRegistered();
    const response = await fetch(`${this.baseUrl}/api/dostk/acnt`, {
      method: "POST",
      headers: { "Content-Type": "application/json;charset=UTF-8", authorization: `Bearer ${accessToken}`, "api-id": "kt00007" },
      body: JSON.stringify({
        ord_dt: input.orderDate ?? "",
        qry_tp: input.queryType,
        stk_bond_tp: "1",
        sell_tp: input.side,
        stk_cd: input.symbol ?? "",
        fr_ord_no: input.fromOrderNumber ?? "",
        dmst_stex_tp: input.exchange
      })
    });
    const payload = await this.readJson(response);
    if (!response.ok || String(payload.return_code ?? "0") !== "0") throw new KiwoomApiError(payload.return_msg ?? "\uD0A4\uC6C0 \uC8FC\uBB38\xB7\uCCB4\uACB0 \uC870\uD68C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.", payload.return_code);
    const number = (value) => Number(String(value ?? "0").replace(/[^0-9.-]/g, "")) || 0;
    return (payload.acnt_ord_cntr_prps_dtl ?? []).map((item) => ({
      orderNumber: item.ord_no ?? "",
      symbol: item.stk_cd ?? "",
      name: item.stk_nm ?? "",
      orderQuantity: number(item.ord_qty),
      orderPrice: number(item.ord_uv),
      filledQuantity: number(item.cntr_qty),
      filledPrice: number(item.cntr_uv),
      remainingQuantity: number(item.ord_remnq),
      orderTime: item.ord_tm ?? ""
    }));
  }
  async getAccountEvaluation(accessToken, exchange = "KRX") {
    this.assertFixedIpRegistered();
    const response = await fetch(`${this.baseUrl}/api/dostk/acnt`, {
      method: "POST",
      headers: { "Content-Type": "application/json;charset=UTF-8", authorization: `Bearer ${accessToken}`, "api-id": "kt00018" },
      body: JSON.stringify({ qry_tp: "1", dmst_stex_tp: exchange })
    });
    const payload = await this.readJson(response);
    if (!response.ok || String(payload.return_code ?? "0") !== "0") throw new KiwoomApiError(payload.return_msg ?? "\uD0A4\uC6C0 \uACC4\uC88C \uD3C9\uAC00\uC794\uACE0 \uC870\uD68C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.", payload.return_code);
    const number = (value) => Number(String(value ?? "0").replace(/[^0-9.-]/g, "")) || 0;
    const items = Array.isArray(payload.acnt_evlt_remn_indv_tot) ? payload.acnt_evlt_remn_indv_tot : [];
    return {
      totalPurchaseAmount: number(payload.tot_pur_amt),
      totalEvaluationAmount: number(payload.tot_evlt_amt),
      totalProfitLoss: number(payload.tot_evlt_pl),
      totalProfitLossRate: number(payload.tot_prft_rt),
      estimatedAssets: number(payload.prsm_dpst_aset_amt),
      positions: items.map((item) => {
        return { symbol: String(item.stk_cd ?? ""), name: String(item.stk_nm ?? ""), quantity: number(item.rmnd_qty), tradeableQuantity: number(item.trde_able_qty), averagePrice: number(item.pur_pric), currentPrice: number(item.cur_prc), profitLoss: number(item.evltv_prft), profitLossRate: number(item.prft_rt) };
      })
    };
  }
  assertFixedIpRegistered() {
    if (this.mode === "live" && process.env.KIWOOM_FIXED_IP_REGISTERED !== "true") {
      throw new KiwoomApiError("\uD0A4\uC6C0 \uC6B4\uC601 API \uC9C0\uC815\uB2E8\uB9D0\uAE30 IP \uB4F1\uB85D\uC774 \uD655\uC778\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.", "FIXED_IP_REQUIRED");
    }
  }
  assertCredentials() {
    if (!this.appKey || !this.appSecret) {
      throw new KiwoomApiError("\uD0A4\uC6C0 App Key\uC640 App Secret\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.", "CREDENTIALS_REQUIRED");
    }
  }
  async fetchReadJson(url, init) {
    const maxAttempts = 3;
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await fetch(url, init);
        if ((response.status === 408 || response.status === 429 || response.status >= 500) && attempt < maxAttempts) {
          await this.readRetryDelay(200 * 2 ** (attempt - 1));
          continue;
        }
        return { response, payload: await this.readJson(response) };
      } catch (error) {
        lastError = error;
        if (error instanceof KiwoomApiError || attempt >= maxAttempts) throw error;
        await this.readRetryDelay(200 * 2 ** (attempt - 1));
      }
    }
    throw lastError instanceof Error ? lastError : new KiwoomApiError("\uD0A4\uC6C0 \uC77D\uAE30 \uC694\uCCAD\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.");
  }
  async readJson(response) {
    try {
      return await response.json();
    } catch {
      throw new KiwoomApiError(`\uD0A4\uC6C0 API\uAC00 JSON\uC774 \uC544\uB2CC \uC751\uB2F5\uC744 \uBC18\uD658\uD588\uC2B5\uB2C8\uB2E4. (HTTP ${response.status})`);
    }
  }
};

// server/kiwoom/publicConnectionCheck.ts
var defaultCooldownMs = 2 * 6e4;
function toSafeFailure(error) {
  const message = error instanceof Error ? error.message : "\uD0A4\uC6C0 OAuth \uC5F0\uACB0 \uD655\uC778\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.";
  if (/8050|지정단말/i.test(message)) {
    return {
      reason: "fixed_ip_required",
      message: "\uD0A4\uC6C0 \uC751\uB2F5 8050: \uC9C0\uC815 \uB2E8\uB9D0 \uC778\uC99D\uC774 \uD544\uC694\uD569\uB2C8\uB2E4. \uC544\uB798\uC5D0 \uD45C\uC2DC\uB41C \uD604\uC7AC \uBC30\uD3EC \uC11C\uBC84 \uCD9C\uBC1C\uC9C0 IP\uB97C \uD0A4\uC6C0 \uC9C0\uC815 \uB2E8\uB9D0\uC5D0 \uB4F1\uB85D\uD55C \uB4A4 \uB2E4\uC2DC \uD655\uC778\uD558\uC138\uC694."
    };
  }
  if (error instanceof KiwoomApiError && error.code === "FIXED_IP_REQUIRED") {
    return {
      reason: "fixed_ip_required",
      message: "\uD0A4\uC6C0 \uC9C0\uC815 \uB2E8\uB9D0 IP \uB4F1\uB85D\uC774 \uD544\uC694\uD569\uB2C8\uB2E4. \uC544\uB798\uC5D0 \uD45C\uC2DC\uB41C \uD604\uC7AC \uBC30\uD3EC \uC11C\uBC84 \uCD9C\uBC1C\uC9C0 IP\uB97C \uB4F1\uB85D\uD55C \uB4A4 \uB2E4\uC2DC \uD655\uC778\uD558\uC138\uC694."
    };
  }
  if (error instanceof KiwoomApiError && error.code === "CREDENTIALS_REQUIRED") {
    return { reason: "credentials_required", message: "\uC11C\uBC84\uC758 \uD0A4\uC6C0 \uC790\uACA9 \uC99D\uBA85 \uC124\uC815\uC774 \uC644\uB8CC\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4." };
  }
  return { reason: "request_failed", message: "\uD0A4\uC6C0 OAuth \uC5F0\uACB0\uC744 \uD655\uC778\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD558\uC138\uC694." };
}
var PublicOAuthConnectionChecker = class {
  createClient;
  now;
  cooldownMs;
  inFlight = null;
  lastResult = null;
  constructor(options = {}) {
    this.createClient = options.createClient ?? (() => new KiwoomClient());
    this.now = options.now ?? Date.now;
    this.cooldownMs = options.cooldownMs ?? defaultCooldownMs;
  }
  async check() {
    if (this.inFlight) return this.inFlight;
    const now = this.now();
    if (this.lastResult && now - this.lastResult.finishedAt < this.cooldownMs) {
      return { ...this.lastResult.result, reused: true };
    }
    this.inFlight = this.runCheck();
    try {
      const result = await this.inFlight;
      this.lastResult = { finishedAt: this.now(), result };
      return result;
    } finally {
      this.inFlight = null;
    }
  }
  async runCheck() {
    const checkedAt = new Date(this.now()).toISOString();
    try {
      const token = await this.createClient().getAccessToken();
      return {
        status: "connected",
        checkedAt,
        expiresAt: token.expiresAt || null,
        message: "\uC11C\uBC84\uC5D0\uC11C \uD0A4\uC6C0 OAuth \uC5F0\uACB0\uC744 \uD655\uC778\uD588\uC2B5\uB2C8\uB2E4. \uD544\uC694\uD560 \uB54C \uC774 \uBC84\uD2BC\uC73C\uB85C \uB2E4\uC2DC \uD655\uC778\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
        reused: false
      };
    } catch (error) {
      const failure = toSafeFailure(error);
      return {
        status: "waiting",
        checkedAt,
        expiresAt: null,
        ...failure,
        reused: false
      };
    }
  }
};
var publicOAuthConnectionCheck = new PublicOAuthConnectionChecker();

// server/quant/conditions.ts
function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
function simpleMovingAverage(bars, period) {
  if (period <= 0 || bars.length < period) return null;
  return average(bars.slice(-period).map((bar) => bar.close));
}
function exponentialMovingAverage(values, period) {
  if (period <= 0 || values.length === 0) return [];
  const multiplier = 2 / (period + 1);
  return values.reduce((series, value, index2) => {
    const previous = series[index2 - 1] ?? value;
    series.push(index2 === 0 ? value : (value - previous) * multiplier + previous);
    return series;
  }, []);
}
function macdHistogram(bars, fast = 12, slow = 26, signal = 9) {
  if (bars.length < slow) return [];
  const closes = bars.map((bar) => bar.close);
  const fastEma = exponentialMovingAverage(closes, fast);
  const slowEma = exponentialMovingAverage(closes, slow);
  const macdLine = closes.map((_, index2) => fastEma[index2] - slowEma[index2]);
  const signalLine = exponentialMovingAverage(macdLine, signal);
  return macdLine.map((value, index2) => value - signalLine[index2]);
}
function isMacdRising(bars, lookback = 3) {
  const histogram = macdHistogram(bars);
  if (histogram.length < lookback) return false;
  const values = histogram.slice(-lookback);
  return values.every((value, index2) => index2 === 0 || value > values[index2 - 1]);
}
function evaluateBarsForRule(input, rule) {
  if (Array.isArray(input)) return input;
  const requested = String(rule.config.timeframe ?? "active");
  if (requested === "active") return input.activeBars;
  return input.timeframeBars?.[requested] ?? [];
}
function countBollingerUpperBreakouts(bars, period, deviation, withinBars) {
  const start = Math.max(period, bars.length - Math.max(1, withinBars));
  let count3 = 0;
  for (let index2 = start; index2 < bars.length; index2 += 1) {
    const currentBars = bars.slice(0, index2 + 1);
    const previousBars = bars.slice(0, index2);
    const currentBands = bollingerBands(currentBars, period, deviation);
    const previousBands = bollingerBands(previousBars, period, deviation);
    const current = currentBars.at(-1);
    const previous = previousBars.at(-1);
    if (currentBands && previousBands && current && previous && current.close > currentBands.upper && previous.close <= previousBands.upper) count3 += 1;
  }
  return count3;
}
function highReturnPercent(bars, days) {
  if (days <= 0 || bars.length < days) return null;
  const window = bars.slice(-days);
  const low = Math.min(...window.map((bar) => bar.low));
  const high = Math.max(...window.map((bar) => bar.high));
  return (high - low) / low * 100;
}
function relativeStrengthIndex(bars, period = 14) {
  if (period <= 0 || bars.length <= period) return null;
  const changes = bars.slice(-(period + 1)).slice(1).map((bar, index2) => bar.close - bars.slice(-(period + 1))[index2].close);
  const gains = changes.map((value) => Math.max(value, 0));
  const losses = changes.map((value) => Math.max(-value, 0));
  const averageGain = average(gains);
  const averageLoss = average(losses);
  if (averageLoss === 0) return 100;
  return 100 - 100 / (1 + averageGain / averageLoss);
}
function bollingerBands(bars, period = 20, deviation = 2) {
  if (period <= 0 || bars.length < period) return null;
  const values = bars.slice(-period).map((bar) => bar.close);
  const middle = average(values);
  const variance = average(values.map((value) => (value - middle) ** 2));
  const standardDeviation2 = Math.sqrt(variance);
  return { upper: middle + deviation * standardDeviation2, middle, lower: middle - deviation * standardDeviation2 };
}
function stochasticK(bars, period = 14) {
  if (period <= 0 || bars.length < period) return null;
  const window = bars.slice(-period);
  const high = Math.max(...window.map((bar) => bar.high));
  const low = Math.min(...window.map((bar) => bar.low));
  const close = window.at(-1).close;
  return high === low ? 50 : (close - low) / (high - low) * 100;
}
function atrPercent(bars, period = 14) {
  if (period <= 0 || bars.length <= period) return null;
  const window = bars.slice(-(period + 1));
  const trueRanges = window.slice(1).map((bar, index2) => Math.max(bar.high - bar.low, Math.abs(bar.high - window[index2].close), Math.abs(bar.low - window[index2].close)));
  const close = window.at(-1).close;
  return close > 0 ? average(trueRanges) / close * 100 : null;
}
function volumeRatio(bars, period = 20) {
  if (period <= 0 || bars.length < period + 1) return null;
  const current = bars.at(-1).volume;
  const baseline = average(bars.slice(-(period + 1), -1).map((bar) => bar.volume));
  return baseline > 0 ? current / baseline : null;
}
function closeChangePercent(bars, days = 1) {
  if (days <= 0 || bars.length < days + 1) return null;
  const previous = bars.at(-(days + 1)).close;
  const current = bars.at(-1).close;
  return previous > 0 ? (current / previous - 1) * 100 : null;
}
function gapPercent(bars) {
  if (bars.length < 2) return null;
  const previousClose = bars.at(-2).close;
  const open = bars.at(-1).open;
  return previousClose > 0 ? (open / previousClose - 1) * 100 : null;
}
function intrabarClosePosition(bars) {
  const latest = bars.at(-1);
  if (!latest || latest.high <= latest.low) return null;
  return (latest.close - latest.low) / (latest.high - latest.low) * 100;
}
function comparatorFor(rule) {
  const comparator = String(rule.config.comparator ?? "\uC774\uC0C1");
  if ((rule.type === "high_return" || rule.type === "turnover" || rule.type === "turnover_count" || rule.type === "volume_ratio_count" || rule.type === "bullish_candle_count" || rule.type === "price_range" || rule.type === "close_change" || rule.type === "gap_percent" || rule.type === "intrabar_position") && !["\uC774\uC0C1", "\uCD08\uACFC", "\uC774\uD558", "\uBBF8\uB9CC", "between"].includes(comparator)) return "\uC774\uC0C1";
  return comparator;
}
function normalizedUnitFor(rule) {
  if (rule.type === "macd_rising" || rule.type === "macd_level") return "\uC9C0\uC218";
  if (rule.type === "ma_position") return "\uC6D0";
  if (["high_return", "rsi", "stochastic", "atr_percent", "close_change", "gap_percent", "intrabar_position"].includes(rule.type)) return "%";
  if (rule.type === "volume_ratio") return "\uBC30";
  if (rule.type === "volume_ratio_count") return "\uD68C";
  if (rule.type === "bullish_candle_count" || rule.type === "turnover_count") return "\uD68C";
  if (rule.type === "price_range") return "\uC6D0";
  if (rule.type === "bollinger") return "\uC6D0";
  return rule.config.unit === "\uC5B5\uC6D0" ? "\uC5B5\uC6D0" : "\uC6D0";
}
function matchesComparator(actual, expected, comparator) {
  if (comparator === "\uCD08\uACFC") return actual > expected;
  if (comparator === "\uC774\uD558") return actual <= expected;
  if (comparator === "\uBBF8\uB9CC") return actual < expected;
  return actual >= expected;
}
function evaluateMacdComparator(bars, lookback, comparator) {
  const histogram = macdHistogram(bars);
  const actual = histogram.at(-1) ?? 0;
  const previous = histogram.at(-2) ?? 0;
  if (comparator === "\uC0C1\uD5A5\uB3CC\uD30C") return { matched: previous <= 0 && actual > 0, actual, expected: 0 };
  if (comparator === "\uD558\uD5A5\uB3CC\uD30C") return { matched: previous >= 0 && actual < 0, actual, expected: 0 };
  if (comparator === "\uC774\uD558" || comparator === "\uBBF8\uB9CC") return { matched: matchesComparator(actual, previous, comparator), actual, expected: previous };
  return { matched: isMacdRising(bars, lookback), actual, expected: previous };
}
function evaluateMovingAverageComparator(bars, periods, comparator) {
  const actual = bars.at(-1)?.close ?? 0;
  const averages = periods.map((period) => simpleMovingAverage(bars, period)).filter((value) => value !== null);
  const expected = averages.length ? average(averages) : 0;
  const above = averages.length === periods.length && actual > Math.max(...averages);
  const below = averages.length === periods.length && actual < Math.min(...averages);
  const previousBars = bars.slice(0, -1);
  const previousClose = previousBars.at(-1)?.close ?? 0;
  const previousAverages = periods.map((period) => simpleMovingAverage(previousBars, period)).filter((value) => value !== null);
  const wasBelow = previousAverages.length === periods.length && previousClose <= Math.max(...previousAverages);
  const wasAbove = previousAverages.length === periods.length && previousClose >= Math.min(...previousAverages);
  if (comparator === "\uC0C1\uD5A5\uB3CC\uD30C") return { matched: above && wasBelow, actual, expected };
  if (comparator === "\uD558\uD5A5\uB3CC\uD30C") return { matched: below && wasAbove, actual, expected };
  if (comparator === "\uC774\uD558" || comparator === "\uBBF8\uB9CC") return { matched: below, actual, expected };
  return { matched: above, actual, expected };
}
function evaluateRule(rule, input) {
  const bars = evaluateBarsForRule(input, rule);
  const numberConfig = (key, fallback) => typeof rule.config[key] === "number" ? Number(rule.config[key]) : fallback;
  if (!rule.enabled) return { ruleId: rule.id, matched: false, score: 0, detail: "\uBE44\uD65C\uC131 \uC870\uAC74" };
  if (!bars.length) return { ruleId: rule.id, matched: false, score: 0, detail: "\uC120\uD0DD \uC2DC\uAC04\uCD95 \uC6D0\uBCF8 \uC5C6\uC74C" };
  if (rule.type === "macd_rising") {
    const lookback = numberConfig("lookback", 3);
    const comparator2 = comparatorFor(rule);
    const evaluation = evaluateMacdComparator(bars, lookback, comparator2);
    return { ruleId: rule.id, matched: evaluation.matched, score: evaluation.matched ? rule.weight : 0, detail: `MACD \uD788\uC2A4\uD1A0\uADF8\uB7A8 ${lookback}\uBD09 ${comparator2} (${normalizedUnitFor(rule)})`, actual: evaluation.actual, expected: evaluation.expected, comparator: comparator2 };
  }
  if (rule.type === "macd_level") {
    const actual = macdHistogram(bars).at(-1) ?? 0;
    const threshold2 = numberConfig("threshold", 0);
    const comparator2 = comparatorFor(rule);
    const matched2 = matchesComparator(actual, threshold2, comparator2);
    return { ruleId: rule.id, matched: matched2, score: matched2 ? rule.weight : 0, detail: `MACD \uD788\uC2A4\uD1A0\uADF8\uB7A8 ${actual.toFixed(4)} ${comparator2} ${threshold2.toFixed(4)} (${normalizedUnitFor(rule)})`, actual, expected: threshold2, comparator: comparator2 };
  }
  if (rule.type === "ma_position") {
    const periods = String(rule.config.periods ?? rule.config.period ?? "5,21,60").split(",").map(Number).filter((period) => Number.isFinite(period) && period > 0);
    const comparator2 = comparatorFor(rule);
    const evaluation = evaluateMovingAverageComparator(bars, periods, comparator2);
    return { ruleId: rule.id, matched: evaluation.matched, score: evaluation.matched ? rule.weight : 0, detail: `\uC885\uAC00\uAC00 ${periods.join("\xB7")}\uC77C\uC120 \uAE30\uC900 ${comparator2} (${normalizedUnitFor(rule)})`, actual: evaluation.actual, expected: evaluation.expected, comparator: comparator2 };
  }
  if (rule.type === "high_return") {
    const days2 = numberConfig("days", 11);
    const minPercent = numberConfig("minPercent", 20);
    const change = highReturnPercent(bars, days2);
    const comparator2 = comparatorFor(rule);
    const matched2 = change !== null && matchesComparator(change, minPercent, comparator2);
    return { ruleId: rule.id, matched: matched2, score: matched2 ? rule.weight : 0, detail: `${days2}\uC77C \uACE0\uC800 \uBCC0\uB3D9\uB960 ${change?.toFixed(2) ?? "N/A"}${normalizedUnitFor(rule)} ${comparator2} ${minPercent}${normalizedUnitFor(rule)}`, actual: change ?? void 0, expected: minPercent, comparator: comparator2 };
  }
  if (rule.type === "new_high") {
    const period = numberConfig("period", 5);
    const window = bars.slice(-period);
    const actual = window.at(-1)?.high;
    const expected = window.length > 1 ? Math.max(...window.slice(0, -1).map((bar) => bar.high)) : void 0;
    const matched2 = actual !== void 0 && expected !== void 0 && actual >= expected;
    return { ruleId: rule.id, matched: matched2, score: matched2 ? rule.weight : 0, detail: `${period}\uBD09 \uC2E0\uACE0\uAC00`, actual, expected, comparator: "\uC2E0\uACE0\uAC00" };
  }
  if (rule.type === "close_change") {
    const days2 = numberConfig("days", 1);
    const threshold2 = numberConfig("threshold", 2);
    const actual = closeChangePercent(bars, days2);
    const comparator2 = comparatorFor(rule);
    const matched2 = actual !== null && matchesComparator(actual, threshold2, comparator2);
    return { ruleId: rule.id, matched: matched2, score: matched2 ? rule.weight : 0, detail: `${days2}\uBD09 \uC885\uAC00 \uBCC0\uB3D9\uB960 ${actual?.toFixed(2) ?? "N/A"}% ${comparator2} ${threshold2}%`, actual: actual ?? void 0, expected: threshold2, comparator: comparator2 };
  }
  if (rule.type === "gap_percent") {
    const threshold2 = numberConfig("threshold", 1);
    const actual = gapPercent(bars);
    const comparator2 = comparatorFor(rule);
    const matched2 = actual !== null && matchesComparator(actual, threshold2, comparator2);
    return { ruleId: rule.id, matched: matched2, score: matched2 ? rule.weight : 0, detail: `\uC2DC\uAC00 \uAC2D ${actual?.toFixed(2) ?? "N/A"}% ${comparator2} ${threshold2}%`, actual: actual ?? void 0, expected: threshold2, comparator: comparator2 };
  }
  if (rule.type === "intrabar_position") {
    const threshold2 = numberConfig("threshold", 70);
    const actual = intrabarClosePosition(bars);
    const comparator2 = comparatorFor(rule);
    const matched2 = actual !== null && matchesComparator(actual, threshold2, comparator2);
    return { ruleId: rule.id, matched: matched2, score: matched2 ? rule.weight : 0, detail: `\uBD09 \uB0B4\uBD80 \uC885\uAC00 \uC704\uCE58 ${actual?.toFixed(2) ?? "N/A"}% ${comparator2} ${threshold2}%`, actual: actual ?? void 0, expected: threshold2, comparator: comparator2 };
  }
  if (rule.type === "rsi") {
    const period = numberConfig("period", 14);
    const threshold2 = numberConfig("threshold", 70);
    const actual = relativeStrengthIndex(bars, period);
    const comparator2 = comparatorFor(rule);
    const matched2 = actual !== null && matchesComparator(actual, threshold2, comparator2);
    return { ruleId: rule.id, matched: matched2, score: matched2 ? rule.weight : 0, detail: `RSI(${period}) ${actual?.toFixed(2) ?? "N/A"} ${comparator2} ${threshold2}`, actual: actual ?? void 0, expected: threshold2, comparator: comparator2 };
  }
  if (rule.type === "bollinger") {
    const period = numberConfig("period", 20);
    const deviation = numberConfig("deviation", 2);
    const band = String(rule.config.band ?? "upper");
    const bands = bollingerBands(bars, period, deviation);
    const actual = bars.at(-1)?.close;
    const expected = bands ? band === "lower" ? bands.lower : band === "middle" ? bands.middle : bands.upper : void 0;
    const comparator2 = comparatorFor(rule);
    if (band === "upper" && comparator2 === "\uC0C1\uD5A5\uB3CC\uD30C") {
      const withinBars = numberConfig("withinBars", 1);
      const breakoutCount = countBollingerUpperBreakouts(bars, period, deviation, withinBars);
      const matched3 = breakoutCount > 0;
      return { ruleId: rule.id, matched: matched3, score: matched3 ? rule.weight : 0, detail: `\uBCFC\uB9B0\uC800(${period}, ${deviation}\u03C3) \uC0C1\uB2E8 \uC0C1\uD5A5\uB3CC\uD30C ${withinBars}\uBD09 \uB0B4`, actual: breakoutCount, expected: 1, comparator: comparator2 };
    }
    const matched2 = actual !== void 0 && expected !== void 0 && matchesComparator(actual, expected, comparator2);
    return { ruleId: rule.id, matched: matched2, score: matched2 ? rule.weight : 0, detail: `\uBCFC\uB9B0\uC800(${period}, ${deviation}\u03C3) ${band} \uBC34\uB4DC \uAE30\uC900 ${comparator2}`, actual, expected, comparator: comparator2 };
  }
  if (rule.type === "stochastic") {
    const period = numberConfig("period", 14);
    const threshold2 = numberConfig("threshold", 80);
    const actual = stochasticK(bars, period);
    const comparator2 = comparatorFor(rule);
    const matched2 = actual !== null && matchesComparator(actual, threshold2, comparator2);
    return { ruleId: rule.id, matched: matched2, score: matched2 ? rule.weight : 0, detail: `\uC2A4\uD1A0\uCE90\uC2A4\uD2F1 %K(${period}) ${actual?.toFixed(2) ?? "N/A"} ${comparator2} ${threshold2}`, actual: actual ?? void 0, expected: threshold2, comparator: comparator2 };
  }
  if (rule.type === "atr_percent") {
    const period = numberConfig("period", 14);
    const threshold2 = numberConfig("threshold", 3);
    const actual = atrPercent(bars, period);
    const comparator2 = comparatorFor(rule);
    const matched2 = actual !== null && matchesComparator(actual, threshold2, comparator2);
    return { ruleId: rule.id, matched: matched2, score: matched2 ? rule.weight : 0, detail: `ATR \uBE44\uC728(${period}) ${actual?.toFixed(2) ?? "N/A"}% ${comparator2} ${threshold2}%`, actual: actual ?? void 0, expected: threshold2, comparator: comparator2 };
  }
  if (rule.type === "volume_ratio") {
    const period = numberConfig("period", 20);
    const threshold2 = numberConfig("threshold", 1.5);
    const actual = volumeRatio(bars, period);
    const comparator2 = comparatorFor(rule);
    const matched2 = actual !== null && matchesComparator(actual, threshold2, comparator2);
    return { ruleId: rule.id, matched: matched2, score: matched2 ? rule.weight : 0, detail: `\uAC70\uB798\uB7C9 \uBE44\uC728(${period}) ${actual?.toFixed(2) ?? "N/A"}\uBC30 ${comparator2} ${threshold2}\uBC30`, actual: actual ?? void 0, expected: threshold2, comparator: comparator2 };
  }
  if (rule.type === "turnover_count") {
    const days2 = numberConfig("days", 5);
    const rawThreshold2 = numberConfig("threshold", 5e10);
    const threshold2 = rule.config.unit === "\uC5B5\uC6D0" ? rawThreshold2 * 1e8 : rawThreshold2;
    const requiredCount = numberConfig("count", 1);
    const actual = bars.slice(-days2).filter((bar) => bar.turnover >= threshold2).length;
    const comparator2 = comparatorFor(rule);
    const matched2 = matchesComparator(actual, requiredCount, comparator2);
    return { ruleId: rule.id, matched: matched2, score: matched2 ? rule.weight : 0, detail: `${days2}\uBD09 \uB0B4 \uAC70\uB798\uB300\uAE08 ${threshold2.toLocaleString("ko-KR")}\uC6D0 \uC774\uC0C1 ${actual}\uD68C`, actual, expected: requiredCount, comparator: comparator2 };
  }
  if (rule.type === "volume_ratio_count") {
    const days2 = numberConfig("days", 5);
    const threshold2 = numberConfig("threshold", 1);
    const requiredCount = numberConfig("count", 1);
    const window = bars.slice(-(days2 + 1));
    const actual = window.slice(1).filter((bar, index2) => window[index2].volume > 0 && bar.volume / window[index2].volume >= threshold2).length;
    const comparator2 = comparatorFor(rule);
    const matched2 = matchesComparator(actual, requiredCount, comparator2);
    return { ruleId: rule.id, matched: matched2, score: matched2 ? rule.weight : 0, detail: `${days2}\uBD09 \uB0B4 \uC804\uBD09 \uB300\uBE44 \uAC70\uB798\uB7C9 ${threshold2.toFixed(2)}\uBC30 \uC774\uC0C1 ${actual}\uD68C`, actual, expected: requiredCount, comparator: comparator2 };
  }
  if (rule.type === "bullish_candle_count") {
    const days2 = numberConfig("days", 5);
    const requiredCount = numberConfig("count", 1);
    const actual = bars.slice(-days2).filter((bar) => bar.close > bar.open).length;
    const comparator2 = comparatorFor(rule);
    const matched2 = matchesComparator(actual, requiredCount, comparator2);
    return { ruleId: rule.id, matched: matched2, score: matched2 ? rule.weight : 0, detail: `${days2}\uBD09 \uB0B4 \uC591\uBD09 ${actual}\uD68C`, actual, expected: requiredCount, comparator: comparator2 };
  }
  if (rule.type === "price_range") {
    const actual = bars.at(-1)?.open;
    const minPrice = numberConfig("minPrice", 0);
    const maxPrice = numberConfig("maxPrice", Number.POSITIVE_INFINITY);
    const matched2 = actual !== void 0 && actual >= minPrice && actual <= maxPrice;
    return { ruleId: rule.id, matched: matched2, score: matched2 ? rule.weight : 0, detail: `\uC2DC\uAC00 ${actual?.toLocaleString("ko-KR") ?? "N/A"}\uC6D0, \uD5C8\uC6A9 \uBC94\uC704 ${minPrice.toLocaleString("ko-KR")}~${Number.isFinite(maxPrice) ? maxPrice.toLocaleString("ko-KR") : "\u221E"}\uC6D0`, actual, expected: minPrice, comparator: "between" };
  }
  const days = numberConfig("days", 5);
  const rawThreshold = numberConfig("threshold", 5e10);
  const unit = normalizedUnitFor(rule);
  const threshold = unit === "\uC5B5\uC6D0" ? rawThreshold * 1e8 : rawThreshold;
  const largestTurnover = Math.max(0, ...bars.slice(-days).map((bar) => bar.turnover));
  const comparator = comparatorFor(rule);
  const matched = matchesComparator(largestTurnover, threshold, comparator);
  return { ruleId: rule.id, matched, score: matched ? rule.weight : 0, detail: `${days}\uC77C \uB0B4 \uCD5C\uB300 \uAC70\uB798\uB300\uAE08 ${largestTurnover.toLocaleString("ko-KR")}\uC6D0 ${comparator} ${threshold.toLocaleString("ko-KR")}\uC6D0`, actual: largestTurnover, expected: threshold, comparator };
}
function evaluateStrategy(rules, input) {
  const evaluations = rules.map((rule) => evaluateRule(rule, input));
  const activeRules = rules.filter((rule) => rule.enabled);
  const activeEvaluations = evaluations.filter((_, index2) => rules[index2]?.enabled);
  const eligible = activeEvaluations.reduce((result, evaluation, index2) => {
    if (index2 === 0) return evaluation.matched;
    const logic = String(activeRules[index2]?.config.logic ?? "AND");
    if (logic === "OR") return result || evaluation.matched;
    if (logic === "NOT") return result && !evaluation.matched;
    return result && evaluation.matched;
  }, activeEvaluations.length > 0);
  return {
    score: eligible ? evaluations.reduce((sum, evaluation) => sum + evaluation.score, 0) : 0,
    matchedCount: evaluations.filter((evaluation) => evaluation.matched).length,
    eligible,
    evaluations
  };
}
function isConditionGroup(node) {
  return "children" in node;
}
function evaluateExpression(node, input) {
  if (!isConditionGroup(node)) {
    const evaluation = evaluateRule(node, input);
    return { eligible: evaluation.matched, score: evaluation.score, evaluations: [evaluation] };
  }
  if (!node.enabled) return { eligible: false, score: 0, evaluations: [] };
  const children = node.children.map((child) => evaluateExpression(child, input));
  const eligible = node.logic === "OR" ? children.some((child) => child.eligible) : node.logic === "NOT" ? !children.some((child) => child.eligible) : children.every((child) => child.eligible);
  return { eligible, score: eligible ? children.reduce((sum, child) => sum + child.score, 0) : 0, evaluations: children.flatMap((child) => child.evaluations) };
}

// server/quant/ranking.ts
function rankCandidates(rules, candidates, limit = 200) {
  return candidates.map((candidate) => {
    const evaluation = evaluateStrategy(rules, candidate.bars);
    const latest = candidate.bars.at(-1);
    const previous = candidate.bars.at(-2);
    const changeRate = latest && previous ? (latest.close - previous.close) / previous.close * 100 : 0;
    return {
      rank: 0,
      symbol: candidate.symbol,
      name: candidate.name,
      score: evaluation.score,
      matchedRuleIds: evaluation.evaluations.filter((item) => item.matched).map((item) => item.ruleId),
      price: latest?.close ?? 0,
      changeRate
    };
  }).filter((item) => item.score > 0).sort((left, right) => right.score - left.score || right.changeRate - left.changeRate).slice(0, limit).map((item, index2) => ({ ...item, rank: index2 + 1 }));
}

// server/quant/externalVerificationGate.ts
function isExternalResearchVerificationEnabled(value = process.env.AUTONOMOUS_RESEARCH_EXTERNAL_DATA_ENABLED) {
  return value === "true";
}
var externalVerificationPausedMessage = "\uC0AC\uC6A9\uC790 \uC694\uCCAD \uC804 \uC678\uBD80 \uC2E4\uB370\uC774\uD130 \uAC80\uC99D \uBCF4\uB958";

// server/quant/localSnapshotBars.ts
import { and, asc, desc, eq as eq2, like } from "drizzle-orm";
async function getLatestLocalSnapshotBars(db, symbol) {
  const datasets = await db.select().from(researchDatasets).where(and(eq2(researchDatasets.qualityStatus, "ready"), like(researchDatasets.versionKey, "local-ka10081:%"))).orderBy(desc(researchDatasets.readyAt), desc(researchDatasets.id)).limit(12);
  for (const dataset of datasets) {
    const rows = await db.select().from(researchDailyBars).where(and(eq2(researchDailyBars.datasetId, dataset.id), eq2(researchDailyBars.symbol, symbol))).orderBy(asc(researchDailyBars.date));
    if (!rows.length) continue;
    return { datasetId: dataset.id, versionKey: dataset.versionKey, bars: rows.map((bar) => ({ date: bar.date, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: Number(bar.volume), turnover: Number(bar.turnover) })) };
  }
  return null;
}

// server/routers/quant.ts
var ruleSchema = z2.object({
  id: z2.string().min(1),
  type: z2.enum(["macd_rising", "ma_position", "high_return", "turnover"]),
  enabled: z2.boolean(),
  weight: z2.number().int().min(0).max(100),
  config: z2.record(z2.string(), z2.union([z2.string(), z2.number(), z2.boolean()]))
});
function requireDailyBarsForEvaluation(bars) {
  if (!bars.length) throw new TRPCError3({ code: "PRECONDITION_FAILED", message: "\uC2E4\uB370\uC774\uD130 \uC5C6\uC74C: \uD0A4\uC6C0 ka10081\uC5D0\uC11C \uC77C\uBD09 \uB370\uC774\uD130\uB97C \uBC1B\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC9C0\uC815 \uB2E8\uB9D0\xB7OAuth \uC0C1\uD0DC\uC640 \uC885\uBAA9\uCF54\uB4DC\uB97C \uD655\uC778\uD558\uC138\uC694." });
  return bars;
}
function requireUserRequestedExternalVerification() {
  if (!isExternalResearchVerificationEnabled()) {
    throw new TRPCError3({ code: "PRECONDITION_FAILED", message: `${externalVerificationPausedMessage}: \uC0AC\uC6A9\uC790\uAC00 \uC694\uCCAD\uD558\uBA74 \uC77D\uAE30 \uC804\uC6A9 \uC77C\uBD09 \uC870\uD68C\uB97C \uC9C4\uD589\uD569\uB2C8\uB2E4.` });
  }
}
var barSchema = z2.object({
  date: z2.string(),
  open: z2.number().positive(),
  high: z2.number().positive(),
  low: z2.number().positive(),
  close: z2.number().positive(),
  volume: z2.number().nonnegative(),
  turnover: z2.number().nonnegative()
});
var quantRouter = router({
  brokerStatus: publicProcedure.query(() => {
    const client = new KiwoomClient();
    return { ...client.getStatus(), oauth: client.getAccessTokenStatus() };
  }),
  oauthStatus: operatorProcedure.query(() => {
    const client = new KiwoomClient();
    return client.getAccessTokenStatus();
  }),
  verifyOAuthConnection: operatorProcedure.mutation(async () => publicOAuthConnectionCheck.check()),
  evaluateConditions: publicProcedure.input(z2.object({ rules: z2.array(ruleSchema), bars: z2.array(barSchema).min(1) })).query(({ input }) => evaluateStrategy(input.rules, input.bars)),
  rankCandidates: publicProcedure.input(z2.object({
    rules: z2.array(ruleSchema).min(1),
    candidates: z2.array(z2.object({ symbol: z2.string().min(1), name: z2.string().min(1), bars: z2.array(barSchema).min(1) })),
    limit: z2.number().int().min(1).max(500).default(200)
  })).query(({ input }) => rankCandidates(input.rules, input.candidates, input.limit)),
  dailyBars: operatorProcedure.input(z2.object({
    symbol: z2.string().regex(/^\d{6}$/, "\uAD6D\uB0B4\uC8FC\uC2DD 6\uC790\uB9AC \uC885\uBAA9\uCF54\uB4DC\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4."),
    baseDate: z2.string().regex(/^\d{8}$/).optional(),
    maxPages: z2.number().int().min(1).max(10).default(3)
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError3({ code: "INTERNAL_SERVER_ERROR", message: "\uB370\uC774\uD130\uBCA0\uC774\uC2A4 \uC5F0\uACB0\uC744 \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    const snapshot = await getLatestLocalSnapshotBars(db, input.symbol);
    if (snapshot) return { symbol: input.symbol, bars: snapshot.bars, source: `ka10081_local_snapshot:${snapshot.versionKey}`, datasetId: snapshot.datasetId, datasetVersionKey: snapshot.versionKey };
    requireUserRequestedExternalVerification();
    const client = new KiwoomClient();
    const token = await client.getAccessToken();
    const bars = await client.getDailyBars(token.token, input);
    return { symbol: input.symbol, bars, source: "ka10081" };
  }),
  evaluatePreset: operatorProcedure.input(z2.object({
    presetId: z2.number().int().positive(),
    symbol: z2.string().regex(/^\d{6}$/, "\uAD6D\uB0B4\uC8FC\uC2DD 6\uC790\uB9AC \uC885\uBAA9\uCF54\uB4DC\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4."),
    maxPages: z2.number().int().min(1).max(10).default(3)
  })).query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError3({ code: "INTERNAL_SERVER_ERROR", message: "\uB370\uC774\uD130\uBCA0\uC774\uC2A4 \uC5F0\uACB0\uC744 \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    const preset = (await db.select().from(strategyPresets).where(and2(eq3(strategyPresets.id, input.presetId), eq3(strategyPresets.userId, ctx.user.id))).limit(1))[0];
    if (!preset) throw new TRPCError3({ code: "NOT_FOUND", message: "\uD3C9\uAC00\uD560 \uD504\uB9AC\uC14B\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    const rules = z2.array(ruleSchema).parse(preset.rulesJson);
    const snapshot = await getLatestLocalSnapshotBars(db, input.symbol);
    if (!snapshot) requireUserRequestedExternalVerification();
    const bars = snapshot ? snapshot.bars : await (async () => {
      const client = new KiwoomClient();
      const token = await client.getAccessToken();
      return client.getDailyBars(token.token, { symbol: input.symbol, maxPages: input.maxPages });
    })();
    requireDailyBarsForEvaluation(bars);
    const expression = preset.scoringJson;
    const hasExpression = expression && typeof expression === "object" && "logic" in expression && "children" in expression;
    const result = hasExpression ? evaluateExpression(expression, bars) : evaluateStrategy(rules, bars);
    return { preset: { id: preset.id, name: preset.name, rulesJson: preset.rulesJson, scoringJson: preset.scoringJson }, symbol: input.symbol, source: snapshot ? `ka10081_local_snapshot:${snapshot.versionKey}` : "ka10081", datasetId: snapshot?.datasetId ?? null, datasetVersionKey: snapshot?.versionKey ?? null, latestDate: bars.at(-1)?.date ?? null, barCount: bars.length, result };
  }),
  createOrderIntent: operatorProcedure.input(z2.object({
    symbol: z2.string().min(1).max(24),
    name: z2.string().min(1).max(120),
    side: z2.enum(["buy", "sell"]),
    quantity: z2.number().int().positive(),
    price: z2.number().int().positive(),
    presetId: z2.number().int().positive().optional()
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError3({ code: "INTERNAL_SERVER_ERROR", message: "\uB370\uC774\uD130\uBCA0\uC774\uC2A4 \uC5F0\uACB0\uC744 \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    const profile = (await db.select().from(tradingProfiles).where(eq3(tradingProfiles.userId, ctx.user.id)).limit(1))[0];
    if (!profile) throw new TRPCError3({ code: "PRECONDITION_FAILED", message: "\uC2E4\uAC70\uB798 \uC548\uC804 \uD55C\uB3C4\uB97C \uBA3C\uC800 \uC800\uC7A5\uD574\uC57C \uD569\uB2C8\uB2E4." });
    const settings = {
      environment: profile.environment,
      maxBuyAmount: profile.maxBuyAmount,
      dailyTradeLimit: profile.dailyTradeLimit,
      killSwitch: profile.killSwitch,
      autoTradeEnabled: profile.autoTradeEnabled,
      requireConfirmation: profile.requireConfirmation
    };
    const today = /* @__PURE__ */ new Date();
    today.setHours(0, 0, 0, 0);
    const todayOrders = await db.select().from(orderIntents).where(eq3(orderIntents.userId, ctx.user.id));
    const confirmedToday = todayOrders.filter((order) => order.confirmedAt && order.confirmedAt >= today && ["confirmed", "submitted", "filled"].includes(order.status)).length;
    const risk = evaluateOrderRisk({ symbol: input.symbol, name: input.name, side: input.side, quantity: input.quantity, price: input.price }, settings, confirmedToday, new KiwoomClient().getStatus().mayTransmitOrders);
    const [created] = await db.insert(orderIntents).values({
      userId: ctx.user.id,
      presetId: input.presetId,
      symbol: input.symbol,
      name: input.name,
      side: input.side,
      quantity: input.quantity,
      price: input.price,
      amount: input.quantity * input.price,
      status: risk.allowed ? "pending_confirmation" : "blocked",
      riskReasonsJson: risk.reasons
    }).returning();
    return { id: created.id, status: risk.allowed ? "pending_confirmation" : "blocked", amount: risk.amount, reasons: risk.reasons };
  })
});

// server/routers/presets.ts
import { TRPCError as TRPCError4 } from "@trpc/server";
import { and as and3, desc as desc2, eq as eq4 } from "drizzle-orm";
import { z as z3 } from "zod";
var ruleSchema2 = z3.object({
  id: z3.string().min(1),
  type: z3.enum(["macd_rising", "ma_position", "high_return", "turnover"]),
  enabled: z3.boolean(),
  weight: z3.number().int().min(0).max(100),
  config: z3.record(z3.string(), z3.union([z3.string(), z3.number(), z3.boolean()]))
});
var expressionSchema = z3.lazy(() => z3.object({
  id: z3.string().min(1),
  logic: z3.enum(["AND", "OR", "NOT"]),
  enabled: z3.boolean().default(true),
  children: z3.array(z3.union([ruleSchema2, expressionSchema])).min(1)
}));
var presetInput = z3.object({
  name: z3.string().trim().min(1).max(120),
  description: z3.string().trim().max(500).optional(),
  rules: z3.array(ruleSchema2).min(1),
  expression: expressionSchema.optional(),
  isActive: z3.boolean().default(true)
});
async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR", message: "\uB370\uC774\uD130\uBCA0\uC774\uC2A4 \uC5F0\uACB0\uC744 \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
  return db;
}
var presetsRouter = router({
  list: operatorProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    return db.select().from(strategyPresets).where(eq4(strategyPresets.userId, ctx.user.id)).orderBy(desc2(strategyPresets.updatedAt));
  }),
  detail: operatorProcedure.input(z3.object({ id: z3.number().int().positive() })).query(async ({ ctx, input }) => {
    const db = await requireDb();
    const preset = (await db.select().from(strategyPresets).where(and3(eq4(strategyPresets.id, input.id), eq4(strategyPresets.userId, ctx.user.id))).limit(1))[0];
    if (!preset) throw new TRPCError4({ code: "NOT_FOUND", message: "\uC870\uD68C\uD560 \uD504\uB9AC\uC14B\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    return preset;
  }),
  save: operatorProcedure.input(presetInput.extend({ id: z3.number().int().positive().optional() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const values = { name: input.name, description: input.description ?? null, rulesJson: input.rules, scoringJson: input.expression ?? null, isActive: input.isActive };
    if (input.id) {
      const result = await db.update(strategyPresets).set(values).where(and3(eq4(strategyPresets.id, input.id), eq4(strategyPresets.userId, ctx.user.id)));
      if (result.length === 0) throw new TRPCError4({ code: "NOT_FOUND", message: "\uC800\uC7A5\uD560 \uD504\uB9AC\uC14B\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
      return { id: input.id, updated: true };
    }
    const [created] = await db.insert(strategyPresets).values({ userId: ctx.user.id, ...values }).returning();
    return { id: created.id, updated: false };
  }),
  remove: operatorProcedure.input(z3.object({ id: z3.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const result = await db.delete(strategyPresets).where(and3(eq4(strategyPresets.id, input.id), eq4(strategyPresets.userId, ctx.user.id)));
    if (result.length === 0) throw new TRPCError4({ code: "NOT_FOUND", message: "\uC0AD\uC81C\uD560 \uD504\uB9AC\uC14B\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    return { success: true };
  })
});

// server/routers/tradingProfile.ts
import { z as z4 } from "zod";
import { desc as desc3, eq as eq5 } from "drizzle-orm";
import { TRPCError as TRPCError6 } from "@trpc/server";
import { parse as parseCookie } from "cookie";

// server/_core/heartbeat.ts
import { TRPCError as TRPCError5 } from "@trpc/server";
var SERVICE = "webdevtoken.v1.WebDevService";
var buildEndpoint = (rpc) => {
  if (!ENV.forgeApiUrl) {
    throw new TRPCError5({
      code: "INTERNAL_SERVER_ERROR",
      message: "Heartbeat service URL is not configured (BUILT_IN_FORGE_API_URL)."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError5({
      code: "INTERNAL_SERVER_ERROR",
      message: "Heartbeat service API key is not configured (BUILT_IN_FORGE_API_KEY)."
    });
  }
  const baseUrl = ENV.forgeApiUrl;
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(`${SERVICE}/${rpc}`, normalizedBase).toString();
};
var callForge = async (rpc, body, userSession) => {
  const endpoint = buildEndpoint(rpc);
  const headers = {
    accept: "application/json",
    authorization: `Bearer ${ENV.forgeApiKey}`,
    "content-type": "application/json",
    "connect-protocol-version": "1"
  };
  if (userSession) {
    headers["x-manus-user-session"] = userSession;
  }
  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    });
  } catch (error) {
    throw new TRPCError5({
      code: "INTERNAL_SERVER_ERROR",
      message: `Heartbeat ${rpc} network error: ${String(error)}`
    });
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw mapForgeError(response, detail, rpc);
  }
  return await response.json();
};
var mapForgeError = (response, detail, rpc) => {
  const status = response.status;
  let code = "INTERNAL_SERVER_ERROR";
  if (status === 401) code = "UNAUTHORIZED";
  else if (status === 403) code = "FORBIDDEN";
  else if (status === 404) code = "NOT_FOUND";
  else if (status === 400 || status === 422) code = "BAD_REQUEST";
  else if (status === 409) code = "CONFLICT";
  else if (status === 429) code = "TOO_MANY_REQUESTS";
  return new TRPCError5({
    code,
    message: `Heartbeat ${rpc} failed (${status})${detail ? `: ${detail}` : ""}`
  });
};
var stringifyPayload = (payload) => {
  if (payload === void 0 || payload === null) return "{}";
  if (typeof payload === "string") return payload;
  return JSON.stringify(payload);
};
var validateCallbackPath = (path3) => {
  if (!path3 || !path3.startsWith("/api/scheduled/")) {
    throw new TRPCError5({
      code: "BAD_REQUEST",
      message: "callback path must start with /api/scheduled/"
    });
  }
};
async function createHeartbeatJob(job, userSession) {
  validateCallbackPath(job.path);
  return callForge(
    "CreateHeartbeatJob",
    {
      name: job.name,
      cronExpression: job.cron,
      callbackPath: job.path,
      callbackMethod: job.method ?? "POST",
      callbackPayload: stringifyPayload(job.payload),
      description: job.description ?? ""
    },
    userSession
  );
}
async function updateHeartbeatJob(taskUid, patch, userSession) {
  if (patch.path !== void 0) validateCallbackPath(patch.path);
  const body = { taskUid };
  if (patch.cron !== void 0) body.cronExpression = patch.cron;
  if (patch.path !== void 0) body.callbackPath = patch.path;
  if (patch.method !== void 0) body.callbackMethod = patch.method;
  if (patch.payload !== void 0) {
    body.callbackPayload = stringifyPayload(patch.payload);
  }
  if (patch.description !== void 0) body.description = patch.description;
  if (patch.enable !== void 0) body.enable = patch.enable;
  return callForge(
    "UpdateHeartbeatJob",
    body,
    userSession
  );
}
async function deleteHeartbeatJob(taskUid, userSession) {
  await callForge("DeleteHeartbeatJob", { taskUid }, userSession);
}

// server/quant/autoTradePolicy.ts
function normalizeAutoTradePolicy(input) {
  return {
    totalCapital: Math.floor(input.totalCapital),
    maxConcurrentPositions: Math.floor(input.maxConcurrentPositions),
    stopLossPercent: Number(input.stopLossPercent.toFixed(4)),
    takeProfitPercent: Number(input.takeProfitPercent.toFixed(4)),
    dailyLossLimitPercent: Number(input.dailyLossLimitPercent.toFixed(4))
  };
}

// server/routers/tradingProfile.ts
var safetyInput = z4.object({
  maxBuyAmount: z4.number().int().min(1e4).max(1e9),
  dailyTradeLimit: z4.number().int().min(1).max(100),
  killSwitch: z4.boolean(),
  autoTradeEnabled: z4.boolean(),
  refreshIntervalSeconds: z4.number().int().min(60).max(86400)
});
var autoPolicyInput = z4.object({
  totalCapital: z4.number().int().min(1e5).max(1e9),
  maxConcurrentPositions: z4.number().int().min(1).max(20),
  stopLossPercent: z4.number().min(0.1).max(30),
  takeProfitPercent: z4.number().min(0.1).max(100),
  dailyLossLimitPercent: z4.number().min(0.1).max(30)
});
async function requireDb2() {
  const db = await getDb();
  if (!db) throw new TRPCError6({ code: "INTERNAL_SERVER_ERROR", message: "\uB370\uC774\uD130\uBCA0\uC774\uC2A4 \uC5F0\uACB0\uC744 \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
  return db;
}
var tradingProfileRouter = router({
  get: operatorProcedure.query(async ({ ctx }) => {
    const db = await requireDb2();
    const profile = (await db.select().from(tradingProfiles).where(eq5(tradingProfiles.userId, ctx.user.id)).limit(1))[0];
    return { profile: profile ?? null, broker: new KiwoomClient().getStatus() };
  }),
  getAutoPolicy: operatorProcedure.query(async ({ ctx }) => {
    const db = await requireDb2();
    const policy = (await db.select().from(autoTradePolicies).where(eq5(autoTradePolicies.userId, ctx.user.id)).orderBy(desc3(autoTradePolicies.version)).limit(1))[0] ?? null;
    return { policy, broker: new KiwoomClient().getStatus() };
  }),
  setSimpleMode: operatorProcedure.input(z4.object({ mode: z4.enum(["paper", "live_ready"]) })).mutation(async ({ ctx, input }) => {
    const db = await requireDb2();
    const broker = new KiwoomClient().getStatus();
    if (input.mode === "live_ready" && (!broker.hasCredentials || !broker.fixedIpRegistered)) {
      throw new TRPCError6({ code: "PRECONDITION_FAILED", message: "\uC2E4\uC804 \uC900\uBE44\uC5D0\uB294 \uD0A4\uC6C0 \uC778\uC99D \uC815\uBCF4\uC640 \uC9C0\uC815 \uACF5\uC778 IP \uB4F1\uB85D\uC774 \uBAA8\uB450 \uD544\uC694\uD569\uB2C8\uB2E4." });
    }
    const current = (await db.select().from(tradingProfiles).where(eq5(tradingProfiles.userId, ctx.user.id)).limit(1))[0];
    const values = {
      environment: input.mode === "paper" ? "mock" : "live",
      maxBuyAmount: current?.maxBuyAmount ?? 5e5,
      dailyTradeLimit: current?.dailyTradeLimit ?? 3,
      killSwitch: true,
      autoTradeEnabled: false,
      requireConfirmation: true,
      refreshIntervalSeconds: current?.refreshIntervalSeconds ?? 60,
      accountNumberMasked: process.env.KIWOOM_ACCOUNT_NUMBER ? `****${process.env.KIWOOM_ACCOUNT_NUMBER.slice(-4)}` : null,
      connectionStatus: input.mode === "live_ready" ? "connected" : "failed"
    };
    if (current) {
      await db.update(tradingProfiles).set(values).where(eq5(tradingProfiles.id, current.id));
      return { profileId: current.id, mode: input.mode, orderTransmissionEnabled: false, requireConfirmation: true };
    }
    const [created] = await db.insert(tradingProfiles).values({ userId: ctx.user.id, ...values }).returning();
    return { profileId: created.id, mode: input.mode, orderTransmissionEnabled: false, requireConfirmation: true };
  }),
  saveAutoPolicy: operatorProcedure.input(autoPolicyInput).mutation(async ({ ctx, input }) => {
    const db = await requireDb2();
    const broker = new KiwoomClient().getStatus();
    if (!broker.mayTransmitOrders) throw new TRPCError6({ code: "PRECONDITION_FAILED", message: "\uC2E4\uC81C \uC8FC\uBB38 \uC804\uC1A1\uC774 \uD65C\uC131\uD654\uB41C \uD658\uACBD\uC5D0\uC11C\uB9CC \uC790\uB3D9 \uC2E4\uD22C \uC815\uCC45\uC744 \uC800\uC7A5\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4." });
    const current = (await db.select().from(autoTradePolicies).where(eq5(autoTradePolicies.userId, ctx.user.id)).orderBy(desc3(autoTradePolicies.version)).limit(1))[0];
    const policy = normalizeAutoTradePolicy(input);
    if (current?.status === "active") await db.update(autoTradePolicies).set({ status: "superseded" }).where(eq5(autoTradePolicies.id, current.id));
    const version = (current?.version ?? 0) + 1;
    const [created] = await db.insert(autoTradePolicies).values({
      userId: ctx.user.id,
      version,
      status: "active",
      totalCapital: policy.totalCapital,
      maxConcurrentPositions: policy.maxConcurrentPositions,
      stopLossPercent: String(policy.stopLossPercent),
      takeProfitPercent: String(policy.takeProfitPercent),
      dailyLossLimitPercent: String(policy.dailyLossLimitPercent)
    }).returning();
    return { id: created.id, version, policy };
  }),
  saveSafety: operatorProcedure.input(safetyInput).mutation(async ({ ctx, input }) => {
    const db = await requireDb2();
    const broker = new KiwoomClient().getStatus();
    const values = {
      environment: "live",
      maxBuyAmount: input.maxBuyAmount,
      dailyTradeLimit: input.dailyTradeLimit,
      killSwitch: input.killSwitch,
      autoTradeEnabled: input.autoTradeEnabled && broker.mayTransmitOrders,
      requireConfirmation: true,
      refreshIntervalSeconds: input.refreshIntervalSeconds,
      accountNumberMasked: process.env.KIWOOM_ACCOUNT_NUMBER ? `****${process.env.KIWOOM_ACCOUNT_NUMBER.slice(-4)}` : null,
      connectionStatus: broker.fixedIpRegistered && broker.hasCredentials ? "connected" : "failed"
    };
    const existing = (await db.select({ id: tradingProfiles.id }).from(tradingProfiles).where(eq5(tradingProfiles.userId, ctx.user.id)).limit(1))[0];
    if (existing) {
      await db.update(tradingProfiles).set(values).where(eq5(tradingProfiles.id, existing.id));
      return { id: existing.id, autoTradeEnabled: values.autoTradeEnabled, forcedConfirmation: true };
    }
    const [created] = await db.insert(tradingProfiles).values({ userId: ctx.user.id, ...values }).returning();
    return { id: created.id, autoTradeEnabled: values.autoTradeEnabled, forcedConfirmation: true };
  }),
  configureRankingRefresh: operatorProcedure.input(z4.object({ cron: z4.string().regex(/^\d+\s+\d+(?:[\d,*/-]*)\s+\d+(?:[\d,*/-]*)\s+[\d*/,-]+\s+[\d*/,-]+\s+[\d*/,-]+$/, "6\uD544\uB4DC UTC cron \uD615\uC2DD\uC774 \uD544\uC694\uD569\uB2C8\uB2E4."), enabled: z4.boolean() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb2();
    const profile = (await db.select().from(tradingProfiles).where(eq5(tradingProfiles.userId, ctx.user.id)).limit(1))[0];
    if (!profile) throw new TRPCError6({ code: "PRECONDITION_FAILED", message: "\uB7AD\uD0B9 \uAC31\uC2E0 \uC124\uC815\uC744 \uC800\uC7A5\uD558\uAE30 \uC804\uC5D0 \uC2E4\uAC70\uB798 \uC548\uC804 \uD55C\uB3C4\uB97C \uC800\uC7A5\uD574\uC57C \uD569\uB2C8\uB2E4." });
    const sessionToken = parseCookie(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
    if (profile.scheduleCronTaskUid) {
      const updated = await updateHeartbeatJob(profile.scheduleCronTaskUid, { cron: input.cron, enable: input.enabled, path: "/api/scheduled/ranking-refresh", description: "\uC0AC\uC6A9\uC790 \uC124\uC815 \uC870\uAC74\uC758 \uB7AD\uD0B9 \uAC31\uC2E0" }, sessionToken);
      return { taskUid: profile.scheduleCronTaskUid, nextExecutionAt: updated.nextExecutionAt };
    }
    const created = await createHeartbeatJob({ name: `ranking-refresh-${profile.id}`, cron: input.cron, path: "/api/scheduled/ranking-refresh", description: "\uC0AC\uC6A9\uC790 \uC124\uC815 \uC870\uAC74\uC758 \uB7AD\uD0B9 \uAC31\uC2E0" }, sessionToken);
    await db.update(tradingProfiles).set({ scheduleCronTaskUid: created.taskUid }).where(eq5(tradingProfiles.id, profile.id));
    return created;
  })
});

// server/routers/orders.ts
import { TRPCError as TRPCError7 } from "@trpc/server";
import { and as and4, desc as desc4, eq as eq6 } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z as z5 } from "zod";
async function requireDb3() {
  const db = await getDb();
  if (!db) throw new TRPCError7({ code: "INTERNAL_SERVER_ERROR", message: "\uB370\uC774\uD130\uBCA0\uC774\uC2A4 \uC5F0\uACB0\uC744 \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
  return db;
}
function assertResearchObservationForOrder(observation) {
  if (!observation.candidateId || !(observation.source.startsWith("kiwoom_ka10032") || observation.source.startsWith("kiwoom_ka10081"))) {
    throw new TRPCError7({ code: "PRECONDITION_FAILED", message: "\uD0A4\uC6C0 \uC2E4\uC81C \uAC00\uACA9 \uAD00\uCC30\uACFC \uC5F0\uAD6C \uD6C4\uBCF4\uAC00 \uC5F0\uACB0\uB41C \uACBD\uC6B0\uC5D0\uB9CC \uC8FC\uBB38 \uCD08\uC548\uC744 \uB9CC\uB4E4 \uC218 \uC788\uC2B5\uB2C8\uB2E4." });
  }
}
var ordersRouter = router({
  list: operatorProcedure.query(async ({ ctx }) => {
    const db = await requireDb3();
    return db.select().from(orderIntents).where(eq6(orderIntents.userId, ctx.user.id));
  }),
  listExecutions: operatorProcedure.query(async ({ ctx }) => {
    const db = await requireDb3();
    const intents = await db.select().from(orderIntents).where(eq6(orderIntents.userId, ctx.user.id));
    const executions = await db.select().from(orderExecutions).orderBy(desc4(orderExecutions.executedAt));
    const intentById = new Map(intents.map((intent) => [intent.id, intent]));
    return executions.flatMap((execution) => {
      const intent = intentById.get(execution.orderIntentId);
      return intent ? [{ ...execution, symbol: intent.symbol, name: intent.name, side: intent.side, quantity: intent.quantity, intentStatus: intent.status }] : [];
    });
  }),
  createFromResearchObservation: operatorProcedure.input(z5.object({ observationId: z5.number().int().positive(), quantity: z5.number().int().positive().max(1e6) })).mutation(async ({ ctx, input }) => {
    const db = await requireDb3();
    const observation = (await db.select().from(autonomousResearchObservations).where(eq6(autonomousResearchObservations.id, input.observationId)).limit(1))[0];
    if (!observation) throw new TRPCError7({ code: "NOT_FOUND", message: "\uC2E4\uC81C \uAC00\uACA9 \uAD00\uCC30 \uAE30\uB85D\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    assertResearchObservationForOrder(observation);
    const profile = (await db.select().from(tradingProfiles).where(eq6(tradingProfiles.userId, ctx.user.id)).limit(1))[0];
    if (!profile) throw new TRPCError7({ code: "PRECONDITION_FAILED", message: "\uC8FC\uBB38 \uC548\uC804 \uD55C\uB3C4\uB97C \uBA3C\uC800 \uC800\uC7A5\uD574\uC57C \uD569\uB2C8\uB2E4." });
    const today = /* @__PURE__ */ new Date();
    today.setHours(0, 0, 0, 0);
    const todayOrders = await db.select().from(orderIntents).where(eq6(orderIntents.userId, ctx.user.id));
    const confirmedToday = todayOrders.filter((order) => order.confirmedAt && order.confirmedAt >= today && ["confirmed", "submitted", "filled"].includes(order.status)).length;
    const candidate = { symbol: observation.symbol, name: observation.name ?? observation.symbol, side: "buy", quantity: input.quantity, price: observation.price };
    const risk = evaluateOrderRisk(candidate, { environment: profile.environment, maxBuyAmount: profile.maxBuyAmount, dailyTradeLimit: profile.dailyTradeLimit, killSwitch: profile.killSwitch, autoTradeEnabled: profile.autoTradeEnabled, requireConfirmation: profile.requireConfirmation }, confirmedToday, new KiwoomClient().getStatus().mayTransmitOrders);
    const [created] = await db.insert(orderIntents).values({ userId: ctx.user.id, sourceCandidateId: observation.candidateId, sourceObservationId: observation.id, symbol: candidate.symbol, name: candidate.name, side: "buy", orderType: "limit", quantity: candidate.quantity, price: candidate.price, amount: candidate.quantity * candidate.price, status: risk.allowed ? "pending_confirmation" : "blocked", riskReasonsJson: risk.reasons }).returning();
    return { id: created.id, status: risk.allowed ? "pending_confirmation" : "blocked", amount: risk.amount, reasons: risk.reasons, source: { observationId: observation.id, candidateId: observation.candidateId, capturedAt: observation.capturedAt, price: observation.price } };
  }),
  confirm: operatorProcedure.input(z5.object({ id: z5.number().int().positive(), acknowledged: z5.literal(true) })).mutation(async ({ ctx, input }) => {
    const db = await requireDb3();
    const intent = (await db.select().from(orderIntents).where(and4(eq6(orderIntents.id, input.id), eq6(orderIntents.userId, ctx.user.id))).limit(1))[0];
    if (!intent) throw new TRPCError7({ code: "NOT_FOUND", message: "\uD655\uC778\uD560 \uC8FC\uBB38 \uC758\uB3C4\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    if (intent.status !== "pending_confirmation") throw new TRPCError7({ code: "PRECONDITION_FAILED", message: "\uD655\uC778 \uB300\uAE30 \uC0C1\uD0DC\uC758 \uC8FC\uBB38\uB9CC \uC2B9\uC778\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4." });
    const confirmationNonce = randomUUID();
    await db.update(orderIntents).set({ status: "confirmed", confirmationNonce, confirmedAt: /* @__PURE__ */ new Date() }).where(eq6(orderIntents.id, intent.id));
    return { id: intent.id, status: "confirmed", confirmationNonce };
  }),
  transmit: operatorProcedure.input(z5.object({ id: z5.number().int().positive() })).mutation(async ({ ctx, input }) => {
    if (!isExternalResearchVerificationEnabled()) {
      throw new TRPCError7({ code: "PRECONDITION_FAILED", message: `${externalVerificationPausedMessage}: \uC8FC\uBB38 \uC804\uC1A1\uC740 \uC5F0\uAD6C \uC804\uC6A9 \uC11C\uBE44\uC2A4\uC5D0\uC11C \uC2E4\uD589\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.` });
    }
    const db = await requireDb3();
    const intent = (await db.select().from(orderIntents).where(and4(eq6(orderIntents.id, input.id), eq6(orderIntents.userId, ctx.user.id))).limit(1))[0];
    const profile = (await db.select().from(tradingProfiles).where(eq6(tradingProfiles.userId, ctx.user.id)).limit(1))[0];
    if (!intent || !profile) throw new TRPCError7({ code: "PRECONDITION_FAILED", message: "\uC8FC\uBB38 \uC758\uB3C4 \uB610\uB294 \uC2E4\uAC70\uB798 \uC548\uC804 \uC124\uC815\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." });
    const confirmedToday = (await db.select().from(orderIntents).where(eq6(orderIntents.userId, ctx.user.id))).filter((order) => ["confirmed", "submitted", "filled"].includes(order.status)).length;
    const client = new KiwoomClient();
    try {
      client.assertOrderMayBeSubmitted({
        candidate: { symbol: intent.symbol, name: intent.name, side: intent.side, quantity: intent.quantity, price: intent.price },
        settings: { environment: profile.environment, maxBuyAmount: profile.maxBuyAmount, dailyTradeLimit: profile.dailyTradeLimit, killSwitch: profile.killSwitch, autoTradeEnabled: profile.autoTradeEnabled, requireConfirmation: profile.requireConfirmation },
        confirmedOrderCountToday: confirmedToday - 1,
        confirmedAt: intent.confirmedAt,
        confirmationNonce: intent.confirmationNonce,
        status: intent.status === "confirmed" ? "confirmed" : intent.status === "submitted" ? "submitted" : intent.status === "filled" ? "filled" : intent.status === "blocked" ? "blocked" : "pending_confirmation"
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "\uC8FC\uBB38 \uC548\uC804 \uAC80\uC99D\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.";
      throw new TRPCError7({ code: "PRECONDITION_FAILED", message });
    }
    const claim = await db.update(orderIntents).set({ status: "submitting" }).where(and4(
      eq6(orderIntents.id, intent.id),
      eq6(orderIntents.userId, ctx.user.id),
      eq6(orderIntents.status, "confirmed")
    ));
    if (claim.length !== 1) {
      throw new TRPCError7({ code: "CONFLICT", message: "\uC774 \uC8FC\uBB38\uC740 \uC774\uBBF8 \uC804\uC1A1 \uCC98\uB9AC \uC911\uC774\uAC70\uB098 \uCC98\uB9AC\uB418\uC5C8\uC2B5\uB2C8\uB2E4." });
    }
    try {
      const token = await client.getAccessToken();
      const brokerOrder = await client.submitLiveBuyOrder(token.token, { symbol: intent.symbol, quantity: intent.quantity, price: intent.orderType === "limit" ? intent.price : void 0, exchange: "KRX", tradeType: intent.orderType === "market" ? "3" : "0" });
      await db.update(orderIntents).set({ status: "submitted", brokerOrderId: brokerOrder.orderNumber }).where(and4(eq6(orderIntents.id, intent.id), eq6(orderIntents.status, "submitting")));
      await db.insert(orderExecutions).values({ orderIntentId: intent.id, brokerOrderId: brokerOrder.orderNumber, executionStatus: "submitted", responseJson: { exchange: brokerOrder.exchange } });
      return { id: intent.id, status: "submitted", brokerOrderId: brokerOrder.orderNumber };
    } catch (error) {
      const message = error instanceof Error ? error.message : "\uD0A4\uC6C0 \uC8FC\uBB38 \uC804\uC1A1\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.";
      await db.update(orderIntents).set({ status: "rejected", riskReasonsJson: [message] }).where(and4(eq6(orderIntents.id, intent.id), eq6(orderIntents.status, "submitting")));
      await db.insert(orderExecutions).values({ orderIntentId: intent.id, executionStatus: "rejected", responseJson: { message } });
      throw new TRPCError7({ code: "PRECONDITION_FAILED", message });
    }
  })
});

// server/routers/backtests.ts
import { TRPCError as TRPCError8 } from "@trpc/server";
import { and as and5, desc as desc5, eq as eq7 } from "drizzle-orm";
import { z as z6 } from "zod";

// server/quant/backtest.ts
function tradingDate(value) {
  return value.slice(0, 10);
}
function aggregateCompletedBars(bars, barsPerInterval) {
  const aggregated = [];
  let currentDate = "";
  let bucket = [];
  bars.forEach((bar, index2) => {
    const date = tradingDate(bar.date);
    if (date !== currentDate) {
      currentDate = date;
      bucket = [];
    }
    bucket.push(bar);
    if (bucket.length === barsPerInterval) {
      aggregated.push({ bar: { date: bar.date, open: bucket[0].open, high: Math.max(...bucket.map((item) => item.high)), low: Math.min(...bucket.map((item) => item.low)), close: bar.close, volume: bucket.reduce((sum, item) => sum + item.volume, 0), turnover: bucket.reduce((sum, item) => sum + item.turnover, 0) }, completedAtIndex: index2 });
      bucket = [];
    }
  });
  return aggregated;
}
function createFiveMinuteContextProvider(activeBars, dailyBars) {
  const tenMinute = aggregateCompletedBars(activeBars, 2);
  const sixtyMinute = aggregateCompletedBars(activeBars, 12);
  const completedCountAt = (items, index2) => {
    let low = 0;
    let high = items.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (items[middle].completedAtIndex <= index2) low = middle + 1;
      else high = middle;
    }
    return low;
  };
  return (index2, history) => {
    const date = tradingDate(activeBars[index2].date);
    return {
      activeBars: history,
      timeframeBars: {
        active: history,
        five_minute: history,
        ten_minute: tenMinute.slice(0, completedCountAt(tenMinute, index2)).map((item) => item.bar),
        sixty_minute: sixtyMinute.slice(0, completedCountAt(sixtyMinute, index2)).map((item) => item.bar),
        daily: dailyBars.filter((bar) => tradingDate(bar.date) < date)
      }
    };
  };
}
function runDailyBacktest(input) {
  const feeRate = input.feeRate ?? 0;
  const entryDelayDays = input.entryDelayDays ?? 0;
  const entryTiming = input.entryTiming ?? "close";
  const evaluationStartIndex = input.evaluationStartIndex ?? 0;
  const trades = [];
  let position = null;
  let pendingEntryIndex = null;
  let equity = 1;
  let highWaterMark = 1;
  let maxDrawdown = 0;
  for (let index2 = 0; index2 < input.bars.length; index2 += 1) {
    const bar = input.bars[index2];
    if (index2 < evaluationStartIndex) continue;
    if (position && index2 - position.entryIndex >= input.holdingDays) {
      const grossReturn = (bar.close - position.entryPrice) / position.entryPrice;
      const netReturn = grossReturn - feeRate * 2;
      equity *= 1 + netReturn;
      highWaterMark = Math.max(highWaterMark, equity);
      maxDrawdown = Math.min(maxDrawdown, (equity - highWaterMark) / highWaterMark);
      trades.push({ entryDate: position.entryDate, exitDate: bar.date, entryPrice: position.entryPrice, exitPrice: bar.close, returnPercent: netReturn * 100 });
      position = null;
    }
    if (!position && pendingEntryIndex !== null && index2 >= pendingEntryIndex) {
      position = { entryIndex: index2, entryPrice: entryTiming === "open" ? bar.open : bar.close, entryDate: bar.date };
      pendingEntryIndex = null;
    }
    if (!position && pendingEntryIndex === null) {
      const history = input.bars.slice(0, index2 + 1);
      const conditionInput = input.conditionContextAtIndex?.(index2, history) ?? history;
      const signal = input.expression ? evaluateExpression(input.expression, conditionInput) : evaluateStrategy(input.rules ?? [], conditionInput);
      if (signal.score >= input.minScore) {
        if (entryDelayDays === 0) position = { entryIndex: index2, entryPrice: bar.close, entryDate: bar.date };
        else pendingEntryIndex = index2 + entryDelayDays;
      }
    }
  }
  const wins = trades.filter((trade) => trade.returnPercent > 0).length;
  return {
    totalReturn: (equity - 1) * 100,
    winRate: trades.length ? wins / trades.length * 100 : 0,
    tradeCount: trades.length,
    maxDrawdown: maxDrawdown * 100,
    trades
  };
}

// server/routers/backtests.ts
var barSchema2 = z6.object({
  date: z6.string(),
  open: z6.number().positive(),
  high: z6.number().positive(),
  low: z6.number().positive(),
  close: z6.number().positive(),
  volume: z6.number().nonnegative(),
  turnover: z6.number().nonnegative()
});
var ruleSchema3 = z6.object({
  id: z6.string(),
  type: z6.enum(["macd_rising", "macd_level", "ma_position", "high_return", "new_high", "turnover", "rsi", "bollinger", "stochastic", "atr_percent", "volume_ratio", "close_change", "gap_percent", "intrabar_position"]),
  enabled: z6.boolean(),
  weight: z6.number(),
  config: z6.record(z6.string(), z6.union([z6.string(), z6.number(), z6.boolean()]))
});
async function requireDb4() {
  const db = await getDb();
  if (!db) throw new TRPCError8({ code: "INTERNAL_SERVER_ERROR", message: "\uB370\uC774\uD130\uBCA0\uC774\uC2A4 \uC5F0\uACB0\uC744 \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
  return db;
}
var backtestsRouter = router({
  list: operatorProcedure.query(async ({ ctx }) => {
    const db = await requireDb4();
    return db.select().from(backtestRuns).where(eq7(backtestRuns.userId, ctx.user.id)).orderBy(desc5(backtestRuns.createdAt));
  }),
  run: operatorProcedure.input(z6.object({
    presetId: z6.number().int().positive(),
    bars: z6.array(barSchema2).min(60),
    initialCapital: z6.number().int().positive().default(1e7),
    minScore: z6.number().min(0).max(100).default(70),
    holdingDays: z6.number().int().min(1).max(60).default(5),
    feeRate: z6.number().min(0).max(0.1).default(0)
  })).mutation(async ({ ctx, input }) => {
    const db = await requireDb4();
    const preset = (await db.select().from(strategyPresets).where(and5(eq7(strategyPresets.id, input.presetId), eq7(strategyPresets.userId, ctx.user.id))).limit(1))[0];
    if (!preset) throw new TRPCError8({ code: "NOT_FOUND", message: "\uBC31\uD14C\uC2A4\uD2B8\uD560 \uD504\uB9AC\uC14B\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    const rules = z6.array(ruleSchema3).parse(preset.rulesJson);
    const result = runDailyBacktest({ bars: input.bars, rules, minScore: input.minScore, holdingDays: input.holdingDays, feeRate: input.feeRate });
    const [created] = await db.insert(backtestRuns).values({
      userId: ctx.user.id,
      presetId: preset.id,
      status: "completed",
      startDate: input.bars[0].date,
      endDate: input.bars.at(-1)?.date ?? input.bars[0].date,
      initialCapital: input.initialCapital,
      totalReturn: result.totalReturn.toFixed(3),
      winRate: result.winRate.toFixed(2),
      tradeCount: result.tradeCount,
      maxDrawdown: result.maxDrawdown.toFixed(3),
      resultsJson: result,
      completedAt: /* @__PURE__ */ new Date()
    }).returning();
    return { id: created.id, result };
  })
});

// server/routers/account.ts
import { TRPCError as TRPCError9 } from "@trpc/server";
import { desc as desc6, eq as eq8 } from "drizzle-orm";
async function requireDb5() {
  const db = await getDb();
  if (!db) throw new TRPCError9({ code: "INTERNAL_SERVER_ERROR", message: "\uB370\uC774\uD130\uBCA0\uC774\uC2A4 \uC5F0\uACB0\uC744 \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
  return db;
}
var accountRouter = router({
  listPositions: operatorProcedure.query(async ({ ctx }) => {
    const db = await requireDb5();
    const snapshots = await db.select().from(positionSnapshots).where(eq8(positionSnapshots.userId, ctx.user.id)).orderBy(desc6(positionSnapshots.capturedAt));
    const latestBySymbol = /* @__PURE__ */ new Map();
    snapshots.forEach((snapshot) => {
      if (!latestBySymbol.has(snapshot.symbol)) latestBySymbol.set(snapshot.symbol, snapshot);
    });
    return Array.from(latestBySymbol.values());
  }),
  syncPositions: operatorProcedure.mutation(async ({ ctx }) => {
    if (!isExternalResearchVerificationEnabled()) {
      throw new TRPCError9({ code: "PRECONDITION_FAILED", message: `${externalVerificationPausedMessage}: \uACC4\uC88C\xB7\uD3EC\uC9C0\uC158 \uB3D9\uAE30\uD654\uB294 \uC5F0\uAD6C \uC804\uC6A9 \uBC94\uC704\uC5D0\uC11C \uC2E4\uD589\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.` });
    }
    const db = await requireDb5();
    const client = new KiwoomClient();
    try {
      const token = await client.getAccessToken();
      const account = await client.getAccountEvaluation(token.token);
      const capturedAt = /* @__PURE__ */ new Date();
      if (account.positions.length) await db.insert(positionSnapshots).values(account.positions.map((position) => ({
        userId: ctx.user.id,
        symbol: position.symbol,
        name: position.name,
        quantity: position.quantity,
        averagePrice: position.averagePrice,
        currentPrice: position.currentPrice,
        profitLoss: position.profitLoss,
        profitLossRate: position.profitLossRate.toFixed(3),
        capturedAt
      })));
      return { capturedAt, positionCount: account.positions.length, totalEvaluationAmount: account.totalEvaluationAmount, totalProfitLoss: account.totalProfitLoss, totalProfitLossRate: account.totalProfitLossRate };
    } catch (error) {
      throw new TRPCError9({ code: "PRECONDITION_FAILED", message: error instanceof Error ? error.message : "\uACC4\uC88C \uB3D9\uAE30\uD654\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4." });
    }
  })
});

// server/routers/rankings.ts
import { and as and7, desc as desc7, eq as eq10 } from "drizzle-orm";
import { TRPCError as TRPCError11 } from "@trpc/server";
import { z as z8 } from "zod";

// server/quant/liveRanking.ts
import { TRPCError as TRPCError10 } from "@trpc/server";
import { and as and6, eq as eq9, sql } from "drizzle-orm";
import { z as z7 } from "zod";
var ruleSchema4 = z7.object({
  id: z7.string(),
  type: z7.enum(["macd_rising", "macd_level", "ma_position", "high_return", "new_high", "turnover", "rsi", "bollinger", "stochastic", "atr_percent", "volume_ratio", "close_change", "gap_percent", "intrabar_position"]),
  enabled: z7.boolean(),
  weight: z7.number(),
  config: z7.record(z7.string(), z7.union([z7.string(), z7.number(), z7.boolean()]))
});
async function refreshLiveRanking(input) {
  const db = await getDb();
  if (!db) throw new TRPCError10({ code: "INTERNAL_SERVER_ERROR", message: "\uB370\uC774\uD130\uBCA0\uC774\uC2A4 \uC5F0\uACB0\uC744 \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
  const preset = (await db.select().from(strategyPresets).where(and6(eq9(strategyPresets.id, input.presetId), eq9(strategyPresets.userId, input.userId))).limit(1))[0];
  if (!preset) throw new TRPCError10({ code: "NOT_FOUND", message: "\uB7AD\uD0B9\uC5D0 \uC0AC\uC6A9\uD560 \uD504\uB9AC\uC14B\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
  const rules = z7.array(ruleSchema4).parse(preset.rulesJson);
  const candidates = [];
  const failedSymbols = [];
  const snapshotDatasetIds = /* @__PURE__ */ new Set();
  let client = null;
  let token = null;
  for (const item of input.universe) {
    try {
      const snapshot = await getLatestLocalSnapshotBars(db, item.symbol);
      if (snapshot) {
        snapshotDatasetIds.add(snapshot.datasetId);
        candidates.push({ symbol: item.symbol, name: item.name ?? item.symbol, bars: snapshot.bars });
        continue;
      }
      if (!isExternalResearchVerificationEnabled()) throw new Error(`${externalVerificationPausedMessage}: ${item.symbol}\uC758 \uC2E4\uC81C \uBD88\uBCC0 \uC77C\uBD09 \uC2A4\uB0C5\uC0F7\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.`);
      client ??= new KiwoomClient();
      token ??= (await client.getAccessToken()).token;
      const bars = await client.getDailyBars(token, { symbol: item.symbol, maxPages: input.maxPagesPerSymbol });
      candidates.push({ symbol: item.symbol, name: item.name ?? item.symbol, bars });
    } catch (error) {
      failedSymbols.push({ symbol: item.symbol, message: error instanceof Error ? error.message : "\uC77C\uBD09 \uC218\uC9D1\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4." });
    }
  }
  const ranked = rankCandidates(rules, candidates);
  const capturedAt = /* @__PURE__ */ new Date();
  if (ranked.length) {
    const values = ranked.map((item) => ({
      userId: input.userId,
      presetId: preset.id,
      symbol: item.symbol,
      name: item.name,
      score: item.score.toFixed(2),
      price: item.price,
      changeRate: item.changeRate.toFixed(3),
      matchedRulesJson: item.matchedRuleIds,
      runKey: input.runKey ?? null,
      capturedAt
    }));
    if (input.runKey) {
      await db.insert(rankingSnapshots).values(values).onConflictDoUpdate({
        target: [rankingSnapshots.userId, rankingSnapshots.presetId, rankingSnapshots.symbol],
        set: { runKey: sql`excluded.runKey` }
      });
    } else {
      await db.insert(rankingSnapshots).values(values);
    }
  }
  return { capturedAt, ranked, collectedSymbols: candidates.map((item) => item.symbol), failedSymbols, source: snapshotDatasetIds.size ? "ka10081_local_snapshot" : "ka10081", snapshotDatasetIds: Array.from(snapshotDatasetIds) };
}

// server/routers/rankings.ts
var rankingsRouter = router({
  turnover: operatorProcedure.input(z8.object({
    market: z8.enum(["000", "001", "101"]).default("000"),
    includeManagedStocks: z8.boolean().default(false),
    exchange: z8.enum(["KRX", "NXT", "INTEGRATED"]).default("KRX")
  })).query(async ({ input }) => {
    if (!isExternalResearchVerificationEnabled()) throw new TRPCError11({ code: "PRECONDITION_FAILED", message: `${externalVerificationPausedMessage}: \uC0AC\uC6A9\uC790\uAC00 \uC694\uCCAD\uD558\uBA74 \uC77D\uAE30 \uC804\uC6A9 \uAC70\uB798\uB300\uAE08 \uC21C\uC704 \uC870\uD68C\uB97C \uC9C4\uD589\uD569\uB2C8\uB2E4.` });
    const client = new KiwoomClient();
    const { token } = await client.getAccessToken();
    return client.getTurnoverRankings(token, input);
  }),
  refresh: operatorProcedure.input(z8.object({
    presetId: z8.number().int().positive(),
    universe: z8.array(z8.object({ symbol: z8.string().regex(/^\d{6}$/), name: z8.string().min(1).max(120).optional() })).min(1).max(20),
    maxPagesPerSymbol: z8.number().int().min(1).max(10).default(3)
  })).mutation(async ({ ctx, input }) => {
    return refreshLiveRanking({ userId: ctx.user.id, presetId: input.presetId, universe: input.universe, maxPagesPerSymbol: input.maxPagesPerSymbol });
  }),
  latest: publicProcedure.query(async () => {
    const db = await getDb();
    const ownerOpenId = process.env.OWNER_OPEN_ID;
    if (!db || !ownerOpenId) return { capturedAt: null, items: [] };
    const [owner] = await db.select({ id: users.id }).from(users).where(eq10(users.openId, ownerOpenId)).limit(1);
    if (!owner) return { capturedAt: null, items: [] };
    const [latestRow] = await db.select({ capturedAt: rankingSnapshots.capturedAt }).from(rankingSnapshots).where(eq10(rankingSnapshots.userId, owner.id)).orderBy(desc7(rankingSnapshots.capturedAt)).limit(1);
    if (!latestRow) return { capturedAt: null, items: [] };
    const items = await db.select().from(rankingSnapshots).where(and7(eq10(rankingSnapshots.userId, owner.id), eq10(rankingSnapshots.capturedAt, latestRow.capturedAt))).orderBy(desc7(rankingSnapshots.score));
    return { capturedAt: latestRow.capturedAt, items };
  })
});

// server/routers/rankingRefresh.ts
import { TRPCError as TRPCError12 } from "@trpc/server";
import { eq as eq11 } from "drizzle-orm";
import { parse as parseCookie2 } from "cookie";
import { z as z9 } from "zod";
var universeSchema = z9.array(z9.object({ symbol: z9.string().regex(/^\d{6}$/), name: z9.string().min(1).max(120).optional() })).min(1).max(20);
var cronSchema = z9.string().regex(/^\d+\s+\d+(?:[\d,*/-]*)\s+\d+(?:[\d,*/-]*)\s+[\d*/,-]+\s+[\d*/,-]+\s+[\d*/,-]+$/, "6\uD544\uB4DC UTC cron \uD615\uC2DD\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.");
async function requireDb6() {
  const db = await getDb();
  if (!db) throw new TRPCError12({ code: "INTERNAL_SERVER_ERROR", message: "\uB370\uC774\uD130\uBCA0\uC774\uC2A4 \uC5F0\uACB0\uC744 \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
  return db;
}
var rankingRefreshRouter = router({
  get: operatorProcedure.query(async ({ ctx }) => {
    const db = await requireDb6();
    return (await db.select().from(rankingRefreshProfiles).where(eq11(rankingRefreshProfiles.userId, ctx.user.id)).limit(1))[0] ?? null;
  }),
  save: operatorProcedure.input(z9.object({ presetId: z9.number().int().positive(), universe: universeSchema, maxPagesPerSymbol: z9.number().int().min(1).max(10).default(3), cron: cronSchema, enabled: z9.boolean() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb6();
    const existing = (await db.select().from(rankingRefreshProfiles).where(eq11(rankingRefreshProfiles.userId, ctx.user.id)).limit(1))[0];
    const sessionToken = parseCookie2(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
    const baseValues = { presetId: input.presetId, universeJson: input.universe, maxPagesPerSymbol: input.maxPagesPerSymbol, cronExpression: input.cron, status: input.enabled ? "idle" : "paused", lastError: null };
    if (existing?.scheduleCronTaskUid) {
      const updated = await updateHeartbeatJob(existing.scheduleCronTaskUid, { cron: input.cron, path: "/api/scheduled/ranking-refresh", enable: input.enabled, description: "\uC6B4\uC601\uC790 \uC720\uB2C8\uBC84\uC2A4\uC758 \uC2E4\uB370\uC774\uD130 \uC870\uAC74 \uB7AD\uD0B9 \uAC31\uC2E0" }, sessionToken);
      await db.update(rankingRefreshProfiles).set(baseValues).where(eq11(rankingRefreshProfiles.id, existing.id));
      return { id: existing.id, taskUid: existing.scheduleCronTaskUid, nextExecutionAt: updated.nextExecutionAt };
    }
    const created = await createHeartbeatJob({ name: `ranking-refresh-${ctx.user.id}`, cron: input.cron, path: "/api/scheduled/ranking-refresh", description: "\uC6B4\uC601\uC790 \uC720\uB2C8\uBC84\uC2A4\uC758 \uC2E4\uB370\uC774\uD130 \uC870\uAC74 \uB7AD\uD0B9 \uAC31\uC2E0" }, sessionToken);
    if (existing) {
      await db.update(rankingRefreshProfiles).set({ ...baseValues, scheduleCronTaskUid: created.taskUid }).where(eq11(rankingRefreshProfiles.id, existing.id));
      return { id: existing.id, taskUid: created.taskUid, nextExecutionAt: created.nextExecutionAt };
    }
    const [inserted] = await db.insert(rankingRefreshProfiles).values({ userId: ctx.user.id, ...baseValues, scheduleCronTaskUid: created.taskUid }).returning();
    return { id: inserted.id, taskUid: created.taskUid, nextExecutionAt: created.nextExecutionAt };
  })
});

// server/routers/network.ts
import { desc as desc8, eq as eq12 } from "drizzle-orm";
function normalizeIp(value) {
  const ip = value?.split(",")[0]?.trim();
  if (!ip) return null;
  const normalized = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  if (normalized === "::1" || normalized === "0.0.0.0" || normalized === "127.0.0.1" || normalized.startsWith("127.") || normalized.startsWith("10.") || normalized.startsWith("192.168.") || /^172\.(1[6-9]|2\d|3[01])\./.test(normalized) || /^f[cd]/i.test(normalized) || /^fe80:/i.test(normalized)) return null;
  return normalized;
}
function normalizeTerminalConnectionVerification(value) {
  if (!value || typeof value !== "object") return null;
  const record = value;
  const oauth = record.oauth;
  const apiRead = record.apiRead;
  const serviceSync = record.serviceSync;
  const serviceReadBack = record.serviceReadBack;
  if (!["passed", "failed", "not_run"].includes(String(oauth)) || !["passed", "failed", "not_run"].includes(String(apiRead)) || !["passed", "failed", "pending", "not_run"].includes(String(serviceSync)) || !["passed", "failed", "pending", "not_run"].includes(String(serviceReadBack))) return null;
  return {
    oauth,
    apiRead,
    serviceSync,
    serviceReadBack,
    apiId: typeof record.apiId === "string" ? record.apiId.slice(0, 32) : void 0,
    responseRows: Number.isInteger(record.responseRows) && Number(record.responseRows) >= 0 ? Number(record.responseRows) : void 0
  };
}
function isTerminalRoundTripVerified(value) {
  const verification = normalizeTerminalConnectionVerification(value);
  return Boolean(verification && verification.oauth === "passed" && verification.apiRead === "passed" && verification.serviceSync === "passed" && verification.serviceReadBack === "passed");
}
function diagnoseKiwoomTerminalCheck(check) {
  const code = `${check.errorCode ?? ""} ${check.message}`.toLowerCase();
  if (check.status === "connected") {
    if (isTerminalRoundTripVerified(check.verificationJson)) {
      return {
        kind: "connected",
        title: "\uD0A4\uC6C0 API\xB7\uC11C\uBE44\uC2A4 \uC655\uBCF5 \uD655\uC778 \uC644\uB8CC",
        nextAction: "OAuth \uD1A0\uD070 \uBC1C\uAE09, ka10081 \uC77D\uAE30 \uC751\uB2F5, \uC11C\uBE44\uC2A4 \uB3D9\uAE30\uD654, \uC800\uC7A5 \uACB0\uACFC \uC7AC\uD655\uC778\uC774 \uBAA8\uB450 \uD655\uC778\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uACF5\uC6A9 \uB370\uC774\uD130 \uC218\uC9D1\uC744 \uC2DC\uC791\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4."
      };
    }
    return {
      kind: "partial",
      title: "OAuth \uD1A0\uD070 \uBC1C\uAE09\uB9CC \uAE30\uB85D\uB428",
      nextAction: "\uAE30\uC874 \uC810\uAC80 \uAE30\uB85D\uC740 \uD0A4\uC6C0 API \uC77D\uAE30\xB7\uC11C\uBE44\uC2A4 \uC800\uC7A5 \uACB0\uACFC \uC7AC\uD655\uC778\uC744 \uD3EC\uD568\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4. \uCD5C\uC2E0 \uC810\uAC80 \uC2A4\uD06C\uB9BD\uD2B8\uB97C \uB2E4\uC2DC \uC2E4\uD589\uD574 \uC655\uBCF5 \uC99D\uAC70\uB97C \uB0A8\uAE30\uC138\uC694."
    };
  }
  if (/owner_not_ready|result_sync|동기화|unavailable|unauthorized|service/.test(code)) {
    return {
      kind: "sync",
      title: "\uB300\uC2DC\uBCF4\uB4DC \uB3D9\uAE30\uD654 \uC2E4\uD328",
      nextAction: "\uD0A4\uC6C0 OAuth \uACB0\uACFC\uAC00 \uC6F9 \uB300\uC2DC\uBCF4\uB4DC\uC5D0 \uC800\uC7A5\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4. \uB2E4\uC74C \uC810\uAC80 \uB54C \uD45C\uC2DC\uB418\uB294 \uCC98\uB9AC \uACBD\uB85C\xB7\uC624\uB958 \uCF54\uB4DC\uB97C \uD568\uAED8 \uD655\uC778\uD558\uC138\uC694."
    };
  }
  if (/public_ip|terminal_ip|checkip|network|timeout|fetch/.test(code)) {
    return {
      kind: "network",
      title: "\uB2E8\uB9D0 \uACF5\uC778 IP\xB7\uB124\uD2B8\uC6CC\uD06C \uD655\uC778 \uD544\uC694",
      nextAction: "\uC810\uAC80 \uD654\uBA74\uC5D0 \uD45C\uC2DC\uB41C \uD604\uC7AC \uB2E8\uB9D0 \uACF5\uC778 IP\uB97C \uD0A4\uC6C0 \uB4F1\uB85D IP\uC640 \uD55C \uAE00\uC790\uAE4C\uC9C0 \uBE44\uAD50\uD55C \uB4A4 \uB124\uD2B8\uC6CC\uD06C \uC5F0\uACB0\uC744 \uB2E4\uC2DC \uD655\uC778\uD558\uC138\uC694."
    };
  }
  if (/app_key|app_secret|credential|missing|config/.test(code)) {
    return {
      kind: "credentials",
      title: "\uB85C\uCEEC OAuth \uC790\uACA9 \uC99D\uBA85 \uD655\uC778 \uD544\uC694",
      nextAction: "\uC0AC\uC6A9\uC790 \uCEF4\uD4E8\uD130\uC758 .env\uC5D0 KIWOOM_APP_KEY\xB7KIWOOM_APP_SECRET\uC774 \uC124\uC815\uB418\uC5B4 \uC788\uB294\uC9C0 \uD655\uC778\uD55C \uD6C4 \uB2E4\uC2DC \uC810\uAC80\uD558\uC138\uC694."
    };
  }
  return {
    kind: "oauth",
    title: "\uD0A4\uC6C0 OAuth \uD1A0\uD070 \uBC1C\uAE09 \uAC70\uBD80",
    nextAction: "\uB4F1\uB85D IP\uAC00 \uC77C\uCE58\uD574\uB3C4 \uD0A4\uC6C0\uC758 \uC571 \uD0A4\xB7\uC2DC\uD06C\uB9BF\xB7\uC6B4\uC601 \uBAA8\uB4DC\uAC00 \uB9DE\uC9C0 \uC54A\uC73C\uBA74 \uD1A0\uD070 \uBC1C\uAE09\uC774 \uAC70\uBD80\uB420 \uC218 \uC788\uC2B5\uB2C8\uB2E4. \uC810\uAC80 \uC2A4\uD06C\uB9BD\uD2B8\uB97C \uB2E4\uC2DC \uC2E4\uD589\uD55C \uB4A4 \uC624\uB958 \uCF54\uB4DC\uB97C \uD655\uC778\uD558\uC138\uC694."
  };
}
function withTerminalDiagnosis(check) {
  const verification = normalizeTerminalConnectionVerification(check.verificationJson);
  return { ...check, verification, roundTripVerified: isTerminalRoundTripVerified(check.verificationJson), diagnosis: diagnoseKiwoomTerminalCheck(check) };
}
var networkRouter = router({
  visitorIp: publicProcedure.query(({ ctx }) => ({
    ip: normalizeIp(ctx.req.ip) ?? normalizeIp(ctx.req.headers["x-forwarded-for"]) ?? normalizeIp(ctx.req.socket?.remoteAddress),
    scope: "current_request"
  })),
  myKiwoomTerminalStatus: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return null;
    const check = (await db.select({ terminalIp: kiwoomTerminalConnectionChecks.terminalIp, status: kiwoomTerminalConnectionChecks.status, errorCode: kiwoomTerminalConnectionChecks.errorCode, message: kiwoomTerminalConnectionChecks.message, verificationJson: kiwoomTerminalConnectionChecks.verificationJson, checkedAt: kiwoomTerminalConnectionChecks.checkedAt }).from(kiwoomTerminalConnectionChecks).where(eq12(kiwoomTerminalConnectionChecks.userId, ctx.user.id)).orderBy(desc8(kiwoomTerminalConnectionChecks.checkedAt)).limit(1))[0] ?? null;
    return check ? withTerminalDiagnosis(check) : null;
  }),
  myKiwoomTerminalDiagnostics: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const checks = await db.select({ terminalIp: kiwoomTerminalConnectionChecks.terminalIp, status: kiwoomTerminalConnectionChecks.status, errorCode: kiwoomTerminalConnectionChecks.errorCode, message: kiwoomTerminalConnectionChecks.message, verificationJson: kiwoomTerminalConnectionChecks.verificationJson, checkedAt: kiwoomTerminalConnectionChecks.checkedAt }).from(kiwoomTerminalConnectionChecks).where(eq12(kiwoomTerminalConnectionChecks.userId, ctx.user.id)).orderBy(desc8(kiwoomTerminalConnectionChecks.checkedAt)).limit(8);
    return checks.map(withTerminalDiagnosis);
  })
});

// server/routers/research.ts
import { TRPCError as TRPCError13 } from "@trpc/server";
import { and as and8, asc as asc2, desc as desc9, eq as eq13 } from "drizzle-orm";
import { z as z10 } from "zod";

// server/quant/researchExperiment.ts
var DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
function assertDateRange(name, range) {
  if (!DATE_PATTERN.test(range.startDate) || !DATE_PATTERN.test(range.endDate)) throw new Error(`${name} \uAE30\uAC04\uC740 YYYY-MM-DD \uD615\uC2DD\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4.`);
  if (range.startDate > range.endDate) throw new Error(`${name} \uC2DC\uC791\uC77C\uC740 \uC885\uB8CC\uC77C\uBCF4\uB2E4 \uB2A6\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.`);
}
function validateResearchExperimentSpec(spec) {
  if (!spec.datasetVersionKey.trim()) throw new Error("\uB9AC\uC11C\uCE58 \uB370\uC774\uD130\uC14B \uBC84\uC804\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.");
  if (!spec.strategyVersionLabel.trim()) throw new Error("\uC804\uB7B5 \uBC84\uC804 \uB77C\uBCA8\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.");
  if (!Number.isInteger(spec.informationCutoffTradingDays) || spec.informationCutoffTradingDays < 1) throw new Error("\uC815\uBCF4 \uC808\uB2E8 \uAC70\uB798\uC77C\uC740 \uCD5C\uC18C 1\uC77C\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4.");
  if (Boolean(spec.training) !== Boolean(spec.validation)) throw new Error("\uD559\uC2B5\xB7\uAC80\uC99D \uAE30\uAC04\uC740 \uD568\uAED8 \uC9C0\uC815\uD574\uC57C \uD569\uB2C8\uB2E4.");
  if (spec.training && spec.validation) {
    assertDateRange("\uD559\uC2B5", spec.training);
    assertDateRange("\uAC80\uC99D", spec.validation);
    if (spec.training.endDate >= spec.validation.startDate) throw new Error("\uAC80\uC99D \uAE30\uAC04\uC740 \uD559\uC2B5 \uAE30\uAC04 \uB4A4\uC5D0 \uBC30\uCE58\uD574\uC57C \uD569\uB2C8\uB2E4.");
  }
  const assumptions = spec.assumptions;
  if (assumptions.entryTiming !== "next_open" && assumptions.entryTiming !== "next_close") throw new Error("\uCCB4\uACB0 \uC2DC\uC810\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
  if (!Number.isFinite(assumptions.feeRate) || assumptions.feeRate < 0 || assumptions.feeRate > 0.1) throw new Error("\uAC70\uB798\uBE44\uC6A9 \uBE44\uC728\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
  if (!Number.isFinite(assumptions.slippageBps) || assumptions.slippageBps < 0 || assumptions.slippageBps > 1e4) throw new Error("\uC2AC\uB9AC\uD53C\uC9C0 \uAC00\uC815\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
  if (!Number.isInteger(assumptions.maxHoldingDays) || assumptions.maxHoldingDays < 1) throw new Error("\uCD5C\uB300 \uBCF4\uC720 \uAE30\uAC04\uC740 1\uC77C \uC774\uC0C1\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4.");
  if (!Number.isInteger(assumptions.maxConcurrentPositions) || assumptions.maxConcurrentPositions < 1) throw new Error("\uCD5C\uB300 \uB3D9\uC2DC \uBCF4\uC720 \uC885\uBAA9 \uC218\uB294 1\uAC1C \uC774\uC0C1\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4.");
  return spec;
}

// server/quant/walkForward.ts
function runWalkForward(input) {
  const { bars, rules, expression, configuration } = input;
  if (!rules && !expression) throw new Error("\uC6CC\uD06C\uD3EC\uC6CC\uB4DC\uC5D0\uB294 \uC870\uAC74 \uADDC\uCE59 \uB610\uB294 \uB17C\uB9AC \uD45C\uD604\uC2DD\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.");
  const minimum = configuration.trainingDays + configuration.validationDays;
  if (bars.length < minimum) throw new Error(`\uC6CC\uD06C\uD3EC\uC6CC\uB4DC\uC5D0\uB294 \uCD5C\uC18C ${minimum}\uAC1C\uC758 \uACE0\uC815 \uC77C\uBD09\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.`);
  const folds = [];
  for (let start = 0; start + minimum <= bars.length; start += configuration.stepDays) {
    const trainingEnd = start + configuration.trainingDays;
    const validationEnd = trainingEnd + configuration.validationDays;
    const contextBars = bars.slice(start, validationEnd);
    const result = runDailyBacktest({ bars: contextBars, rules, expression, minScore: configuration.minScore, holdingDays: configuration.holdingDays, feeRate: configuration.feeRate, entryDelayDays: configuration.entryDelayDays, entryTiming: configuration.entryTiming, evaluationStartIndex: configuration.trainingDays });
    folds.push({ fold: folds.length + 1, trainingStartDate: bars[start].date, trainingEndDate: bars[trainingEnd - 1].date, validationStartDate: bars[trainingEnd].date, validationEndDate: bars[validationEnd - 1].date, result });
  }
  const compound = folds.reduce((equity, fold) => equity * (1 + fold.result.totalReturn / 100), 1);
  const trades = folds.reduce((sum, fold) => sum + fold.result.tradeCount, 0);
  const winners = folds.reduce((sum, fold) => sum + fold.result.trades.filter((trade) => trade.returnPercent > 0).length, 0);
  return { foldCount: folds.length, totalReturn: (compound - 1) * 100, winRate: trades ? winners / trades * 100 : 0, tradeCount: trades, worstFoldDrawdown: Math.min(...folds.map((fold) => fold.result.maxDrawdown)), folds };
}

// server/routers/research.ts
init_evolution();
var dateSchema = z10.string().regex(/^\d{4}-\d{2}-\d{2}$/);
var universeSchema2 = z10.array(z10.object({ symbol: z10.string().regex(/^\d{6}$/), name: z10.string().min(1).max(120).optional() })).min(1).max(500);
var storedRuleSchema = z10.object({ id: z10.string(), type: z10.enum(["macd_rising", "ma_position", "high_return", "turnover"]), enabled: z10.boolean(), weight: z10.number(), config: z10.record(z10.string(), z10.union([z10.string(), z10.number(), z10.boolean()])) });
var assumptionsSchema = z10.object({ entryTiming: z10.enum(["next_open", "next_close"]), feeRate: z10.number().min(0).max(0.1), slippageBps: z10.number().min(0).max(1e4), maxHoldingDays: z10.number().int().min(1).max(365), maxConcurrentPositions: z10.number().int().min(1).max(500) });
var walkForwardConfigurationSchema = z10.object({ experimentId: z10.number().int().positive(), trainingDays: z10.number().int().min(20).max(1e4), validationDays: z10.number().int().min(5).max(1e4), stepDays: z10.number().int().min(1).max(1e4) });
var evolutionRuleTypeSchema = z10.enum(["macd_rising", "ma_position", "high_return", "turnover", "rsi", "bollinger", "stochastic", "atr_percent", "volume_ratio"]);
var evolutionSearchConfigurationSchema = z10.object({
  populationSize: z10.number().int().min(10).max(100),
  minRules: z10.number().int().min(1).max(20),
  maxRules: z10.number().int().min(1).max(20),
  maxDepth: z10.number().int().min(1).max(5),
  allowedRuleTypes: z10.array(evolutionRuleTypeSchema).min(1),
  eliteCount: z10.number().int().min(1).max(50),
  crossoverRate: z10.number().min(0).max(1),
  mutationRate: z10.number().min(0).max(1),
  minimumTrades: z10.number().int().min(1).max(1e3),
  maxDrawdownLimit: z10.number().min(-100).max(0),
  holdingDays: z10.number().int().min(1).max(365),
  feeRate: z10.number().min(0).max(0.1),
  slippageBps: z10.number().min(0).max(1e4),
  informationCutoffTradingDays: z10.number().int().min(1).max(20),
  entryTiming: z10.enum(["next_open", "next_close"])
});
var manualEvolutionChangeSchema = z10.discriminatedUnion("kind", [
  z10.object({ kind: z10.literal("rule_numeric"), targetNodeId: z10.string().min(1).max(160), key: z10.string().min(1).max(80), next: z10.number().finite().min(0).max(1e7) }),
  z10.object({ kind: z10.literal("group_logic"), targetNodeId: z10.string().min(1).max(160), next: z10.enum(["AND", "OR", "NOT"]) })
]);
async function requireDb7() {
  const db = await getDb();
  if (!db) throw new TRPCError13({ code: "INTERNAL_SERVER_ERROR", message: "\uB9AC\uC11C\uCE58 \uB370\uC774\uD130\uBCA0\uC774\uC2A4 \uC5F0\uACB0\uC744 \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
  return db;
}
var researchRouter = router({
  listDatasets: operatorProcedure.query(async ({ ctx }) => {
    const db = await requireDb7();
    return db.select().from(researchDatasets).where(eq13(researchDatasets.userId, ctx.user.id)).orderBy(desc9(researchDatasets.createdAt));
  }),
  createDataset: operatorProcedure.input(z10.object({
    name: z10.string().trim().min(2).max(160),
    versionKey: z10.string().trim().min(3).max(80),
    universe: universeSchema2,
    startDate: dateSchema,
    endDate: dateSchema,
    adjustmentBasis: z10.enum(["adjusted", "unadjusted", "unknown"]).default("unknown")
  })).mutation(async ({ ctx, input }) => {
    if (input.startDate > input.endDate) throw new TRPCError13({ code: "BAD_REQUEST", message: "\uB370\uC774\uD130\uC14B \uC2DC\uC791\uC77C\uC740 \uC885\uB8CC\uC77C\uBCF4\uB2E4 \uB2A6\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    const db = await requireDb7();
    const [created] = await db.insert(researchDatasets).values({
      userId: ctx.user.id,
      name: input.name,
      versionKey: input.versionKey,
      universeJson: input.universe,
      startDate: input.startDate,
      endDate: input.endDate,
      adjustmentBasis: input.adjustmentBasis,
      qualityStatus: "draft"
    }).returning();
    return { id: created.id, qualityStatus: "draft" };
  }),
  collectDataset: operatorProcedure.input(z10.object({ datasetId: z10.number().int().positive(), maxPagesPerSymbol: z10.number().int().min(1).max(10).default(10) })).mutation(async ({ ctx, input }) => {
    if (!isExternalResearchVerificationEnabled()) {
      throw new TRPCError13({ code: "PRECONDITION_FAILED", message: `${externalVerificationPausedMessage}: \uC0AC\uC6A9\uC790\uAC00 \uC694\uCCAD\uD558\uBA74 \uC77D\uAE30 \uC804\uC6A9 \uB9AC\uC11C\uCE58 \uB370\uC774\uD130\uC14B \uC218\uC9D1\uC744 \uC9C4\uD589\uD569\uB2C8\uB2E4.` });
    }
    const db = await requireDb7();
    const dataset = (await db.select().from(researchDatasets).where(and8(eq13(researchDatasets.id, input.datasetId), eq13(researchDatasets.userId, ctx.user.id))).limit(1))[0];
    if (!dataset) throw new TRPCError13({ code: "NOT_FOUND", message: "\uC218\uC9D1\uD560 \uB9AC\uC11C\uCE58 \uB370\uC774\uD130\uC14B\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    if (dataset.qualityStatus !== "draft") throw new TRPCError13({ code: "CONFLICT", message: "\uCD08\uC548 \uB370\uC774\uD130\uC14B\uB9CC \uCD5C\uCD08 \uC218\uC9D1\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4. \uAE30\uC874 \uC6D0\uBCF8\uC744 \uBC14\uAFB8\uB824\uBA74 \uC0C8 \uBC84\uC804\uC744 \uB9CC\uB4DC\uC138\uC694." });
    if (dataset.adjustmentBasis === "unknown") throw new TRPCError13({ code: "PRECONDITION_FAILED", message: "\uC2E4\uC8FC\uAC00 \uB370\uC774\uD130\uC14B \uC218\uC9D1 \uC804 \uAC00\uACA9 \uC870\uC815 \uAE30\uC900\uC744 adjusted \uB610\uB294 unadjusted\uB85C \uD655\uC815\uD558\uC138\uC694." });
    const universe = universeSchema2.parse(dataset.universeJson);
    await db.update(researchDatasets).set({ qualityStatus: "collecting", qualityReportJson: { state: "collecting", requestedSymbols: universe.map((item) => item.symbol) } }).where(eq13(researchDatasets.id, dataset.id));
    try {
      const client = new KiwoomClient();
      const token = await client.getAccessToken();
      const collected = [];
      for (const item of universe) {
        const bars = (await client.getDailyBars(token.token, { symbol: item.symbol, maxPages: input.maxPagesPerSymbol, adjustedPrice: dataset.adjustmentBasis === "adjusted" ? "1" : "0" })).filter((bar) => bar.date >= dataset.startDate && bar.date <= dataset.endDate);
        if (!bars.length) throw new Error(`${item.symbol}\uC758 \uB370\uC774\uD130\uC14B \uAE30\uAC04 \uC77C\uBD09\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.`);
        await db.insert(researchDailyBars).values(bars.map((bar) => ({ datasetId: dataset.id, symbol: item.symbol, date: bar.date, open: Math.round(bar.open), high: Math.round(bar.high), low: Math.round(bar.low), close: Math.round(bar.close), volume: String(Math.round(bar.volume)), turnover: String(Math.round(bar.turnover)), source: "kiwoom_ka10081" })));
        collected.push({ symbol: item.symbol, bars: bars.length });
      }
      const barCount = collected.reduce((sum, item) => sum + item.bars, 0);
      await db.update(researchDatasets).set({ qualityStatus: "ready", barCount, sourceCapturedAt: /* @__PURE__ */ new Date(), readyAt: /* @__PURE__ */ new Date(), qualityReportJson: { state: "ready", source: "kiwoom_ka10081", adjustmentBasis: dataset.adjustmentBasis, symbols: collected, barCount } }).where(eq13(researchDatasets.id, dataset.id));
      return { datasetId: dataset.id, status: "ready", barCount, collected };
    } catch (error) {
      const message = error instanceof Error ? error.message : "\uC2E4\uB370\uC774\uD130 \uC218\uC9D1\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.";
      await db.update(researchDatasets).set({ qualityStatus: "error", qualityReportJson: { state: "error", error: message } }).where(eq13(researchDatasets.id, dataset.id));
      throw new TRPCError13({ code: "BAD_GATEWAY", message: `\uB9AC\uC11C\uCE58 \uB370\uC774\uD130\uC14B \uC218\uC9D1 \uC2E4\uD328: ${message}` });
    }
  }),
  listEvolutionSearches: operatorProcedure.query(async ({ ctx }) => {
    const db = await requireDb7();
    return db.select().from(evolutionSearches).where(eq13(evolutionSearches.userId, ctx.user.id)).orderBy(desc9(evolutionSearches.createdAt));
  }),
  listEvolutionGenerations: operatorProcedure.input(z10.object({ searchId: z10.number().int().positive() })).query(async ({ ctx, input }) => {
    const db = await requireDb7();
    const search = (await db.select().from(evolutionSearches).where(and8(eq13(evolutionSearches.id, input.searchId), eq13(evolutionSearches.userId, ctx.user.id))).limit(1))[0];
    if (!search) throw new TRPCError13({ code: "NOT_FOUND", message: "\uC9C4\uD654\uD615 \uD0D0\uC0C9 \uAE30\uB85D\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    return db.select().from(evolutionGenerations).where(eq13(evolutionGenerations.searchId, search.id)).orderBy(asc2(evolutionGenerations.generationNumber));
  }),
  listEvolutionCandidates: operatorProcedure.input(z10.object({ searchId: z10.number().int().positive(), generationId: z10.number().int().positive().optional() })).query(async ({ ctx, input }) => {
    const db = await requireDb7();
    const search = (await db.select().from(evolutionSearches).where(and8(eq13(evolutionSearches.id, input.searchId), eq13(evolutionSearches.userId, ctx.user.id))).limit(1))[0];
    if (!search) throw new TRPCError13({ code: "NOT_FOUND", message: "\uC9C4\uD654\uD615 \uD0D0\uC0C9 \uAE30\uB85D\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    return db.select().from(evolutionCandidates).where(input.generationId ? and8(eq13(evolutionCandidates.searchId, search.id), eq13(evolutionCandidates.generationId, input.generationId)) : eq13(evolutionCandidates.searchId, search.id)).orderBy(desc9(evolutionCandidates.fitnessScore), desc9(evolutionCandidates.createdAt));
  }),
  listEvolutionGenerationSummaries: operatorProcedure.input(z10.object({ searchId: z10.number().int().positive() })).query(async ({ ctx, input }) => {
    const db = await requireDb7();
    const search = (await db.select().from(evolutionSearches).where(and8(eq13(evolutionSearches.id, input.searchId), eq13(evolutionSearches.userId, ctx.user.id))).limit(1))[0];
    if (!search) throw new TRPCError13({ code: "NOT_FOUND", message: "\uC9C4\uD654\uD615 \uD0D0\uC0C9 \uAE30\uB85D\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    const [generations, candidates] = await Promise.all([
      db.select().from(evolutionGenerations).where(eq13(evolutionGenerations.searchId, search.id)).orderBy(asc2(evolutionGenerations.generationNumber)),
      db.select().from(evolutionCandidates).where(eq13(evolutionCandidates.searchId, search.id)).orderBy(desc9(evolutionCandidates.fitnessScore))
    ]);
    const mean2 = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    return generations.map((generation) => {
      const generationCandidates = candidates.filter((candidate) => candidate.generationId === generation.id);
      const evaluated = generationCandidates.filter((candidate) => Boolean(candidate.inSampleMetricsJson?.metrics));
      const survivors = generationCandidates.filter((candidate) => candidate.status === "survived");
      const inSampleReturns = evaluated.flatMap((candidate) => {
        const value = candidate.inSampleMetricsJson?.metrics?.totalReturn;
        return typeof value === "number" ? [value] : [];
      });
      const outOfSampleReturns = generationCandidates.flatMap((candidate) => {
        const value = candidate.outOfSampleMetricsJson?.metrics?.totalReturn;
        return typeof value === "number" ? [value] : [];
      });
      const walkForwardReturns = generationCandidates.flatMap((candidate) => {
        const value = candidate.walkForwardMetricsJson?.result?.totalReturn;
        return typeof value === "number" ? [value] : [];
      });
      const ranked = [...evaluated].sort((left, right) => Number(right.fitnessScore ?? -Infinity) - Number(left.fitnessScore ?? -Infinity));
      return {
        generationId: generation.id,
        generationNumber: generation.generationNumber,
        populationSize: generation.populationSize,
        uniqueCandidateCount: generation.uniqueCandidateCount,
        status: generation.status,
        evaluatedCandidateCount: evaluated.length,
        survivorCandidateCount: survivors.length,
        survivalRate: evaluated.length ? survivors.length / evaluated.length : null,
        averageInSampleReturn: mean2(inSampleReturns),
        averageOutOfSampleReturn: mean2(outOfSampleReturns),
        averageWalkForwardReturn: mean2(walkForwardReturns),
        bestCandidate: ranked[0] ? { id: ranked[0].id, fingerprint: ranked[0].fingerprint, fitnessScore: ranked[0].fitnessScore, inSampleMetricsJson: ranked[0].inSampleMetricsJson, outOfSampleMetricsJson: ranked[0].outOfSampleMetricsJson } : null
      };
    });
  }),
  createEvolutionSearch: operatorProcedure.input(z10.object({
    datasetId: z10.number().int().positive(),
    name: z10.string().trim().min(2).max(160),
    randomSeed: z10.number().int().min(1).max(2147483647),
    configuration: evolutionSearchConfigurationSchema
  })).mutation(async ({ ctx, input }) => {
    if (input.configuration.maxRules < input.configuration.minRules) throw new TRPCError13({ code: "BAD_REQUEST", message: "\uCD5C\uB300 \uADDC\uCE59 \uC218\uB294 \uCD5C\uC18C \uADDC\uCE59 \uC218\uBCF4\uB2E4 \uC791\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    if (input.configuration.eliteCount > input.configuration.populationSize) throw new TRPCError13({ code: "BAD_REQUEST", message: "\uC5D8\uB9AC\uD2B8 \uBCF4\uC874 \uC218\uB294 \uD6C4\uBCF4 \uC218\uB97C \uB118\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    const db = await requireDb7();
    const dataset = (await db.select().from(researchDatasets).where(and8(eq13(researchDatasets.id, input.datasetId), eq13(researchDatasets.userId, ctx.user.id))).limit(1))[0];
    if (!dataset || dataset.qualityStatus !== "ready") throw new TRPCError13({ code: "PRECONDITION_FAILED", message: "\uC9C4\uD654\uD615 \uD0D0\uC0C9\uC740 ready \uC0C1\uD0DC\uC758 \uACE0\uC815 \uC2E4\uC81C \uB370\uC774\uD130\uC14B\uC5D0\uC11C\uB9CC \uC2DC\uC791\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4." });
    const genomes = generateUniqueGenomes({ seed: input.randomSeed, populationSize: input.configuration.populationSize, minRules: input.configuration.minRules, maxRules: input.configuration.maxRules, maxDepth: input.configuration.maxDepth, allowedRuleTypes: input.configuration.allowedRuleTypes });
    const [search] = await db.insert(evolutionSearches).values({ userId: ctx.user.id, datasetId: dataset.id, name: input.name, randomSeed: input.randomSeed, configurationJson: input.configuration, status: "queued" }).returning();
    const [generation] = await db.insert(evolutionGenerations).values({ searchId: search.id, generationNumber: 0, populationSize: genomes.length, uniqueCandidateCount: genomes.length, status: "queued" }).returning();
    await db.insert(evolutionCandidates).values(genomes.map((genome) => ({ searchId: search.id, generationId: generation.id, fingerprint: fingerprintResearchGenome({ ...genome, datasetVersionKey: dataset.versionKey, assumptions: input.configuration }), rootGenomeJson: genome.root, minimumScore: genome.minimumScore, origin: "seed", status: "created" })));
    return { searchId: search.id, generationId: generation.id, uniqueCandidateCount: genomes.length, status: "queued" };
  }),
  evaluateEvolutionCandidate: operatorProcedure.input(z10.object({ candidateId: z10.number().int().positive(), symbol: z10.string().regex(/^\d{6}$/) })).mutation(async ({ ctx, input }) => {
    const db = await requireDb7();
    const candidate = (await db.select().from(evolutionCandidates).where(eq13(evolutionCandidates.id, input.candidateId)).limit(1))[0];
    if (!candidate) throw new TRPCError13({ code: "NOT_FOUND", message: "\uD3C9\uAC00\uD560 \uC720\uC804\uC790 \uD6C4\uBCF4\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    const search = (await db.select().from(evolutionSearches).where(and8(eq13(evolutionSearches.id, candidate.searchId), eq13(evolutionSearches.userId, ctx.user.id))).limit(1))[0];
    if (!search) throw new TRPCError13({ code: "FORBIDDEN", message: "\uD574\uB2F9 \uC720\uC804\uC790 \uD6C4\uBCF4\uC5D0 \uC811\uADFC\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    const dataset = (await db.select().from(researchDatasets).where(and8(eq13(researchDatasets.id, search.datasetId), eq13(researchDatasets.userId, ctx.user.id))).limit(1))[0];
    if (!dataset || dataset.qualityStatus !== "ready") throw new TRPCError13({ code: "PRECONDITION_FAILED", message: "ready \uC0C1\uD0DC\uC758 \uACE0\uC815 \uC2E4\uC81C \uB370\uC774\uD130\uC14B\uC5D0\uC11C\uB9CC \uC720\uC804\uC790\uB97C \uD3C9\uAC00\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4." });
    const configuration = evolutionSearchConfigurationSchema.parse(search.configurationJson);
    const bars = await db.select().from(researchDailyBars).where(and8(eq13(researchDailyBars.datasetId, dataset.id), eq13(researchDailyBars.symbol, input.symbol))).orderBy(asc2(researchDailyBars.date));
    if (bars.length < 60) throw new TRPCError13({ code: "BAD_REQUEST", message: "\uC120\uD0DD \uC885\uBAA9\uC758 \uACE0\uC815 \uC77C\uBD09\uC774 60\uAC1C \uBBF8\uB9CC\uC785\uB2C8\uB2E4." });
    const result = runDailyBacktest({ bars: bars.map((bar) => ({ date: bar.date, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: Number(bar.volume), turnover: Number(bar.turnover) })), expression: candidate.rootGenomeJson, minScore: candidate.minimumScore, holdingDays: configuration.holdingDays, feeRate: configuration.feeRate + configuration.slippageBps / 1e4, entryDelayDays: configuration.informationCutoffTradingDays, entryTiming: configuration.entryTiming === "next_open" ? "open" : "close" });
    const metrics = { totalReturn: result.totalReturn, maxDrawdown: result.maxDrawdown, tradeCount: result.tradeCount, winRate: result.winRate };
    const fitnessScore = calculateFitness(metrics, { minimumTrades: configuration.minimumTrades, maxDrawdownLimit: configuration.maxDrawdownLimit });
    const inSampleMetricsJson = { datasetId: dataset.id, datasetVersionKey: dataset.versionKey, symbol: input.symbol, informationCutoffTradingDays: configuration.informationCutoffTradingDays, assumptions: { holdingDays: configuration.holdingDays, feeRate: configuration.feeRate, slippageBps: configuration.slippageBps, entryTiming: configuration.entryTiming }, result, metrics };
    await db.update(evolutionCandidates).set({ status: "evaluated", inSampleMetricsJson, fitnessScore: String(fitnessScore), evaluatedAt: /* @__PURE__ */ new Date() }).where(eq13(evolutionCandidates.id, candidate.id));
    return { candidateId: candidate.id, datasetVersionKey: dataset.versionKey, symbol: input.symbol, metrics, fitnessScore };
  }),
  validateEvolutionCandidate: operatorProcedure.input(z10.object({ candidateId: z10.number().int().positive(), symbol: z10.string().regex(/^\d{6}$/), validationStartDate: dateSchema })).mutation(async ({ ctx, input }) => {
    const db = await requireDb7();
    const candidate = (await db.select().from(evolutionCandidates).where(eq13(evolutionCandidates.id, input.candidateId)).limit(1))[0];
    if (!candidate) throw new TRPCError13({ code: "NOT_FOUND", message: "\uAC80\uC99D\uD560 \uC720\uC804\uC790 \uD6C4\uBCF4\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    const search = (await db.select().from(evolutionSearches).where(and8(eq13(evolutionSearches.id, candidate.searchId), eq13(evolutionSearches.userId, ctx.user.id))).limit(1))[0];
    if (!search) throw new TRPCError13({ code: "FORBIDDEN", message: "\uD574\uB2F9 \uC720\uC804\uC790 \uD6C4\uBCF4\uC5D0 \uC811\uADFC\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    const dataset = (await db.select().from(researchDatasets).where(and8(eq13(researchDatasets.id, search.datasetId), eq13(researchDatasets.userId, ctx.user.id))).limit(1))[0];
    if (!dataset || dataset.qualityStatus !== "ready") throw new TRPCError13({ code: "PRECONDITION_FAILED", message: "ready \uC2E4\uC81C \uB370\uC774\uD130\uC14B\uC5D0\uC11C\uB9CC \uB3C5\uB9BD \uAC80\uC99D\uC744 \uC2E4\uD589\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4." });
    const rows = await db.select().from(researchDailyBars).where(and8(eq13(researchDailyBars.datasetId, dataset.id), eq13(researchDailyBars.symbol, input.symbol))).orderBy(asc2(researchDailyBars.date));
    const validationStartIndex = rows.findIndex((row) => row.date >= input.validationStartDate);
    if (validationStartIndex < 60) throw new TRPCError13({ code: "BAD_REQUEST", message: "\uB3C5\uB9BD \uAC80\uC99D \uC2DC\uC791\uC77C \uC774\uC804\uC5D0 \uC9C0\uD45C \uACC4\uC0B0\uC6A9 \uC77C\uBD09 60\uAC1C \uC774\uC0C1\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." });
    const configuration = evolutionSearchConfigurationSchema.parse(search.configurationJson);
    const bars = rows.map((row) => ({ date: row.date, open: row.open, high: row.high, low: row.low, close: row.close, volume: Number(row.volume), turnover: Number(row.turnover) }));
    const result = runDailyBacktest({ bars, expression: candidate.rootGenomeJson, minScore: candidate.minimumScore, holdingDays: configuration.holdingDays, feeRate: configuration.feeRate + configuration.slippageBps / 1e4, entryDelayDays: configuration.informationCutoffTradingDays, entryTiming: configuration.entryTiming === "next_open" ? "open" : "close", evaluationStartIndex: validationStartIndex });
    const metrics = { totalReturn: result.totalReturn, maxDrawdown: result.maxDrawdown, tradeCount: result.tradeCount, winRate: result.winRate };
    const outOfSampleMetricsJson = { datasetVersionKey: dataset.versionKey, symbol: input.symbol, validationStartDate: input.validationStartDate, validationStartIndex, assumptions: { feeRate: configuration.feeRate, slippageBps: configuration.slippageBps, informationCutoffTradingDays: configuration.informationCutoffTradingDays, entryTiming: configuration.entryTiming, holdingDays: configuration.holdingDays }, metrics, result };
    await db.update(evolutionCandidates).set({ outOfSampleMetricsJson }).where(eq13(evolutionCandidates.id, candidate.id));
    return { candidateId: candidate.id, datasetVersionKey: dataset.versionKey, symbol: input.symbol, validationStartDate: input.validationStartDate, metrics };
  }),
  runEvolutionCandidateWalkForward: operatorProcedure.input(z10.object({ candidateId: z10.number().int().positive(), symbol: z10.string().regex(/^\d{6}$/), trainingDays: z10.number().int().min(60).max(1e4), validationDays: z10.number().int().min(5).max(1e4), stepDays: z10.number().int().min(1).max(1e4) })).mutation(async ({ ctx, input }) => {
    const db = await requireDb7();
    const candidate = (await db.select().from(evolutionCandidates).where(eq13(evolutionCandidates.id, input.candidateId)).limit(1))[0];
    if (!candidate) throw new TRPCError13({ code: "NOT_FOUND", message: "\uC6CC\uD06C\uD3EC\uC6CC\uB4DC\uD560 \uC720\uC804\uC790 \uD6C4\uBCF4\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    if (candidate.status !== "survived") throw new TRPCError13({ code: "PRECONDITION_FAILED", message: "\uC6CC\uD06C\uD3EC\uC6CC\uB4DC\uB294 \uC120\uBC1C\uB41C \uC0DD\uC874 \uC720\uC804\uC790\uC5D0\uC11C\uB9CC \uC2E4\uD589\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4." });
    const search = (await db.select().from(evolutionSearches).where(and8(eq13(evolutionSearches.id, candidate.searchId), eq13(evolutionSearches.userId, ctx.user.id))).limit(1))[0];
    if (!search) throw new TRPCError13({ code: "FORBIDDEN", message: "\uD574\uB2F9 \uC720\uC804\uC790 \uD6C4\uBCF4\uC5D0 \uC811\uADFC\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    const dataset = (await db.select().from(researchDatasets).where(and8(eq13(researchDatasets.id, search.datasetId), eq13(researchDatasets.userId, ctx.user.id))).limit(1))[0];
    if (!dataset || dataset.qualityStatus !== "ready") throw new TRPCError13({ code: "PRECONDITION_FAILED", message: "ready \uC2E4\uC81C \uB370\uC774\uD130\uC14B\uC758 \uC0DD\uC874 \uC720\uC804\uC790\uB9CC \uC6CC\uD06C\uD3EC\uC6CC\uB4DC\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4." });
    const configuration = evolutionSearchConfigurationSchema.parse(search.configurationJson);
    const rows = await db.select().from(researchDailyBars).where(and8(eq13(researchDailyBars.datasetId, dataset.id), eq13(researchDailyBars.symbol, input.symbol))).orderBy(asc2(researchDailyBars.date));
    const result = runWalkForward({ bars: rows.map((row) => ({ date: row.date, open: row.open, high: row.high, low: row.low, close: row.close, volume: Number(row.volume), turnover: Number(row.turnover) })), expression: candidate.rootGenomeJson, configuration: { trainingDays: input.trainingDays, validationDays: input.validationDays, stepDays: input.stepDays, minScore: candidate.minimumScore, holdingDays: configuration.holdingDays, feeRate: configuration.feeRate + configuration.slippageBps / 1e4, entryDelayDays: configuration.informationCutoffTradingDays, entryTiming: configuration.entryTiming === "next_open" ? "open" : "close" } });
    const walkForwardMetricsJson = { datasetVersionKey: dataset.versionKey, symbol: input.symbol, configuration: { trainingDays: input.trainingDays, validationDays: input.validationDays, stepDays: input.stepDays, informationCutoffTradingDays: configuration.informationCutoffTradingDays, entryTiming: configuration.entryTiming, holdingDays: configuration.holdingDays, feeRate: configuration.feeRate, slippageBps: configuration.slippageBps }, result };
    await db.update(evolutionCandidates).set({ walkForwardMetricsJson }).where(eq13(evolutionCandidates.id, candidate.id));
    return { candidateId: candidate.id, datasetVersionKey: dataset.versionKey, symbol: input.symbol, result };
  }),
  manuallyExpandEvolutionCandidate: operatorProcedure.input(z10.object({ candidateId: z10.number().int().positive(), change: manualEvolutionChangeSchema })).mutation(async ({ ctx, input }) => {
    const db = await requireDb7();
    const parent = (await db.select().from(evolutionCandidates).where(eq13(evolutionCandidates.id, input.candidateId)).limit(1))[0];
    if (!parent) throw new TRPCError13({ code: "NOT_FOUND", message: "\uD655\uC7A5\uD560 \uBD80\uBAA8 \uC720\uC804\uC790\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    if (parent.status !== "survived") throw new TRPCError13({ code: "PRECONDITION_FAILED", message: "\uD655\uC7A5 \uC2E4\uD5D8\uC740 \uC120\uBC1C\uB41C \uC0DD\uC874 \uC720\uC804\uC790\uC5D0\uC11C\uB9CC \uC2DC\uC791\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4." });
    const search = (await db.select().from(evolutionSearches).where(and8(eq13(evolutionSearches.id, parent.searchId), eq13(evolutionSearches.userId, ctx.user.id))).limit(1))[0];
    if (!search) throw new TRPCError13({ code: "FORBIDDEN", message: "\uD574\uB2F9 \uC720\uC804\uC790 \uD6C4\uBCF4\uC5D0 \uC811\uADFC\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    const dataset = (await db.select().from(researchDatasets).where(and8(eq13(researchDatasets.id, search.datasetId), eq13(researchDatasets.userId, ctx.user.id))).limit(1))[0];
    if (!dataset || dataset.qualityStatus !== "ready") throw new TRPCError13({ code: "PRECONDITION_FAILED", message: "ready \uC2E4\uC81C \uB370\uC774\uD130\uC14B\uC758 \uC0DD\uC874 \uC720\uC804\uC790\uB9CC \uD655\uC7A5\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4." });
    const configuration = evolutionSearchConfigurationSchema.parse(search.configurationJson);
    const derived = manuallyExpandGenome({ candidateId: parent.id, root: parent.rootGenomeJson, minimumScore: parent.minimumScore }, input.change);
    const fingerprint2 = fingerprintResearchGenome({ root: derived.root, minimumScore: derived.minimumScore, datasetVersionKey: dataset.versionKey, assumptions: configuration });
    const existing = (await db.select().from(evolutionCandidates).where(and8(eq13(evolutionCandidates.searchId, search.id), eq13(evolutionCandidates.fingerprint, fingerprint2))).limit(1))[0];
    if (existing) throw new TRPCError13({ code: "CONFLICT", message: "\uAC19\uC740 \uC5F0\uAD6C \uAC00\uC815\uC744 \uAC00\uC9C4 \uC911\uBCF5 \uC720\uC804\uC790\uAC00 \uC774\uBBF8 \uC874\uC7AC\uD569\uB2C8\uB2E4." });
    const latestGeneration = (await db.select().from(evolutionGenerations).where(eq13(evolutionGenerations.searchId, search.id)).orderBy(desc9(evolutionGenerations.generationNumber)).limit(1))[0];
    const generationNumber = (latestGeneration?.generationNumber ?? -1) + 1;
    const [generation] = await db.insert(evolutionGenerations).values({ searchId: search.id, generationNumber, populationSize: 1, uniqueCandidateCount: 1, survivorCount: 1, status: "completed", selectionSummaryJson: { type: "manual_expand", parentCandidateId: parent.id, mutation: derived.mutation } }).returning();
    const [candidate] = await db.insert(evolutionCandidates).values({ searchId: search.id, generationId: generation.id, fingerprint: fingerprint2, rootGenomeJson: derived.root, minimumScore: derived.minimumScore, origin: "manual_expand", parentCandidateIdsJson: [parent.id], mutationJson: derived.mutation, status: "created" }).returning();
    return { candidateId: candidate.id, generationId: generation.id, generationNumber, parentCandidateId: parent.id, fingerprint: fingerprint2, mutation: derived.mutation, rootGenomeJson: derived.root };
  }),
  advanceEvolutionGeneration: operatorProcedure.input(z10.object({ searchId: z10.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb7();
    const search = (await db.select().from(evolutionSearches).where(and8(eq13(evolutionSearches.id, input.searchId), eq13(evolutionSearches.userId, ctx.user.id))).limit(1))[0];
    if (!search) throw new TRPCError13({ code: "NOT_FOUND", message: "\uC9C4\uD654\uD615 \uD0D0\uC0C9 \uAE30\uB85D\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    const configuration = evolutionSearchConfigurationSchema.parse(search.configurationJson);
    const dataset = (await db.select().from(researchDatasets).where(and8(eq13(researchDatasets.id, search.datasetId), eq13(researchDatasets.userId, ctx.user.id))).limit(1))[0];
    if (!dataset) throw new TRPCError13({ code: "NOT_FOUND", message: "\uC9C4\uD654\uD615 \uD0D0\uC0C9 \uB370\uC774\uD130\uC14B\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    const currentGeneration = (await db.select().from(evolutionGenerations).where(eq13(evolutionGenerations.searchId, search.id)).orderBy(desc9(evolutionGenerations.generationNumber)).limit(1))[0];
    if (!currentGeneration) throw new TRPCError13({ code: "PRECONDITION_FAILED", message: "\uC774\uC804 \uC138\uB300\uAC00 \uC5C6\uB294 \uD0D0\uC0C9\uC740 \uB2E4\uC74C \uC138\uB300\uB97C \uB9CC\uB4E4 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    const candidates = await db.select().from(evolutionCandidates).where(eq13(evolutionCandidates.generationId, currentGeneration.id)).orderBy(desc9(evolutionCandidates.fitnessScore));
    const scored = candidates.flatMap((candidate) => {
      const metrics = candidate.inSampleMetricsJson?.metrics;
      if (candidate.status !== "evaluated" || !metrics) return [];
      return [{ candidateId: candidate.id, root: candidate.rootGenomeJson, minimumScore: candidate.minimumScore, fingerprint: candidate.fingerprint, metrics, fitnessScore: Number(candidate.fitnessScore ?? calculateFitness(metrics, { minimumTrades: configuration.minimumTrades, maxDrawdownLimit: configuration.maxDrawdownLimit })) }];
    });
    if (scored.length < configuration.eliteCount) throw new TRPCError13({ code: "PRECONDITION_FAILED", message: `\uB2E4\uC74C \uC138\uB300\uC5D0\uB294 \uD3C9\uAC00 \uC644\uB8CC \uD6C4\uBCF4\uAC00 \uCD5C\uC18C ${configuration.eliteCount}\uAC1C \uD544\uC694\uD569\uB2C8\uB2E4.` });
    const survivors = selectSurvivors(scored, configuration.eliteCount);
    const nextGenerationNumber = currentGeneration.generationNumber + 1;
    const next = evolvePopulation({ survivors, populationSize: configuration.populationSize, seed: search.randomSeed + nextGenerationNumber, crossoverRate: configuration.crossoverRate, bounds: { minRules: configuration.minRules, maxRules: configuration.maxRules }, preserveElites: false });
    const [generation] = await db.insert(evolutionGenerations).values({ searchId: search.id, generationNumber: nextGenerationNumber, populationSize: next.length, uniqueCandidateCount: next.length, survivorCount: survivors.length, status: "queued", selectionSummaryJson: { evaluatedCount: scored.length, survivorCandidateIds: survivors.map((item) => item.candidateId), fitnessScores: survivors.map((item) => item.fitnessScore) } }).returning();
    await Promise.all(candidates.map((candidate) => db.update(evolutionCandidates).set({ status: survivors.some((survivor) => survivor.candidateId === candidate.id) ? "survived" : candidate.status === "evaluated" ? "rejected" : candidate.status }).where(eq13(evolutionCandidates.id, candidate.id))));
    await db.insert(evolutionCandidates).values(next.map((genome) => ({ searchId: search.id, generationId: generation.id, fingerprint: fingerprintResearchGenome({ ...genome, datasetVersionKey: dataset.versionKey, assumptions: configuration }), rootGenomeJson: genome.root, minimumScore: genome.minimumScore, origin: genome.origin, parentCandidateIdsJson: genome.parentCandidateIds, mutationJson: genome.mutation ?? null, status: "created" })));
    return { searchId: search.id, generationId: generation.id, generationNumber: nextGenerationNumber, uniqueCandidateCount: next.length, survivorCandidateIds: survivors.map((item) => item.candidateId) };
  }),
  listExperiments: operatorProcedure.query(async ({ ctx }) => {
    const db = await requireDb7();
    return db.select().from(researchExperiments).where(eq13(researchExperiments.userId, ctx.user.id)).orderBy(desc9(researchExperiments.createdAt));
  }),
  createExperiment: operatorProcedure.input(z10.object({
    datasetId: z10.number().int().positive(),
    presetId: z10.number().int().positive(),
    name: z10.string().trim().min(2).max(160),
    datasetVersionKey: z10.string().trim().min(3).max(80),
    strategyVersionLabel: z10.string().trim().min(2).max(160),
    informationCutoffTradingDays: z10.number().int().min(1).max(20),
    training: z10.object({ startDate: dateSchema, endDate: dateSchema }).optional(),
    validation: z10.object({ startDate: dateSchema, endDate: dateSchema }).optional(),
    assumptions: assumptionsSchema
  })).mutation(async ({ ctx, input }) => {
    const spec = validateResearchExperimentSpec({ datasetVersionKey: input.datasetVersionKey, strategyVersionLabel: input.strategyVersionLabel, informationCutoffTradingDays: input.informationCutoffTradingDays, training: input.training, validation: input.validation, assumptions: input.assumptions });
    const db = await requireDb7();
    const dataset = (await db.select().from(researchDatasets).where(and8(eq13(researchDatasets.id, input.datasetId), eq13(researchDatasets.userId, ctx.user.id))).limit(1))[0];
    if (!dataset) throw new TRPCError13({ code: "NOT_FOUND", message: "\uB9AC\uC11C\uCE58 \uB370\uC774\uD130\uC14B\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    if (dataset.versionKey !== spec.datasetVersionKey) throw new TRPCError13({ code: "BAD_REQUEST", message: "\uC120\uD0DD\uD55C \uB370\uC774\uD130\uC14B\uACFC \uC2E4\uD5D8 \uB370\uC774\uD130\uC14B \uBC84\uC804\uC774 \uC77C\uCE58\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4." });
    const preset = (await db.select().from(strategyPresets).where(and8(eq13(strategyPresets.id, input.presetId), eq13(strategyPresets.userId, ctx.user.id))).limit(1))[0];
    if (!preset) throw new TRPCError13({ code: "NOT_FOUND", message: "\uB9AC\uC11C\uCE58 \uC870\uAC74\uC2DD\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    const [created] = await db.insert(researchExperiments).values({
      userId: ctx.user.id,
      datasetId: dataset.id,
      presetId: preset.id,
      name: input.name,
      randomSeed: 0,
      configurationJson: {},
      strategySnapshotJson: { presetId: preset.id, name: preset.name, rulesJson: preset.rulesJson, scoringJson: preset.scoringJson, strategyVersionLabel: spec.strategyVersionLabel },
      assumptionsJson: spec.assumptions,
      informationCutoffTradingDays: spec.informationCutoffTradingDays,
      trainingStartDate: spec.training?.startDate,
      trainingEndDate: spec.training?.endDate,
      validationStartDate: spec.validation?.startDate,
      validationEndDate: spec.validation?.endDate,
      status: "draft"
    }).returning();
    return { id: created.id, status: "draft" };
  }),
  runExperiment: operatorProcedure.input(z10.object({ experimentId: z10.number().int().positive(), symbol: z10.string().regex(/^\d{6}$/), initialCapital: z10.number().int().positive().default(1e7), minScore: z10.number().min(0).max(100).default(70) })).mutation(async ({ ctx, input }) => {
    const db = await requireDb7();
    const experiment = (await db.select().from(researchExperiments).where(and8(eq13(researchExperiments.id, input.experimentId), eq13(researchExperiments.userId, ctx.user.id))).limit(1))[0];
    if (!experiment) throw new TRPCError13({ code: "NOT_FOUND", message: "\uC2E4\uD589\uD560 \uB9AC\uC11C\uCE58 \uC2E4\uD5D8\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    const dataset = (await db.select().from(researchDatasets).where(and8(eq13(researchDatasets.id, experiment.datasetId), eq13(researchDatasets.userId, ctx.user.id))).limit(1))[0];
    if (!dataset || dataset.qualityStatus !== "ready") throw new TRPCError13({ code: "PRECONDITION_FAILED", message: "\uC6D0\uBCF8 \uC77C\uBD09\uC774 \uACE0\uC815\xB7\uAC80\uC99D\uB41C ready \uB370\uC774\uD130\uC14B\uC5D0\uC11C\uB9CC \uC2E4\uD5D8\uC744 \uC2E4\uD589\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4." });
    const allBars = await db.select().from(researchDailyBars).where(and8(eq13(researchDailyBars.datasetId, dataset.id), eq13(researchDailyBars.symbol, input.symbol))).orderBy(asc2(researchDailyBars.date));
    const periodBars = experiment.validationStartDate && experiment.validationEndDate ? allBars.filter((bar) => bar.date >= experiment.validationStartDate && bar.date <= experiment.validationEndDate) : allBars;
    if (periodBars.length < 60) throw new TRPCError13({ code: "BAD_REQUEST", message: "\uC120\uD0DD \uC885\uBAA9\uC758 \uACE0\uC815 \uC77C\uBD09\uC774 \uC2E4\uD5D8 \uAE30\uAC04\uC5D0 60\uAC1C \uBBF8\uB9CC\uC785\uB2C8\uB2E4." });
    const snapshot = experiment.strategySnapshotJson;
    const rules = z10.array(storedRuleSchema).parse(snapshot.rulesJson);
    const assumptions = assumptionsSchema.parse(experiment.assumptionsJson);
    const result = runDailyBacktest({ bars: periodBars.map((bar) => ({ date: bar.date, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: Number(bar.volume), turnover: Number(bar.turnover) })), rules, minScore: input.minScore, holdingDays: assumptions.maxHoldingDays, feeRate: assumptions.feeRate + assumptions.slippageBps / 1e4, entryDelayDays: experiment.informationCutoffTradingDays, entryTiming: assumptions.entryTiming === "next_open" ? "open" : "close" });
    const resultsJson = { datasetId: dataset.id, datasetVersionKey: dataset.versionKey, symbol: input.symbol, initialCapital: input.initialCapital, minScore: input.minScore, informationCutoffTradingDays: experiment.informationCutoffTradingDays, periodScope: experiment.validationStartDate ? "validation" : "dataset", assumptions, result };
    await db.update(researchExperiments).set({ status: "completed", resultsJson, completedAt: /* @__PURE__ */ new Date() }).where(eq13(researchExperiments.id, experiment.id));
    return { experimentId: experiment.id, datasetVersionKey: dataset.versionKey, symbol: input.symbol, result };
  }),
  createWalkForwardRun: operatorProcedure.input(z10.object({
    experimentId: z10.number().int().positive(),
    trainingDays: z10.number().int().min(20).max(1e4),
    validationDays: z10.number().int().min(5).max(1e4),
    stepDays: z10.number().int().min(1).max(1e4)
  })).mutation(async ({ ctx, input }) => {
    const db = await requireDb7();
    const experiment = (await db.select().from(researchExperiments).where(and8(eq13(researchExperiments.id, input.experimentId), eq13(researchExperiments.userId, ctx.user.id))).limit(1))[0];
    if (!experiment) throw new TRPCError13({ code: "NOT_FOUND", message: "\uC6CC\uD06C\uD3EC\uC6CC\uB4DC \uB300\uC0C1 \uC2E4\uD5D8\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    const [created] = await db.insert(walkForwardRuns).values({ userId: ctx.user.id, experimentId: experiment.id, configurationJson: input, status: "queued" }).returning();
    return { id: created.id, status: "queued" };
  }),
  listWalkForwardRuns: operatorProcedure.query(async ({ ctx }) => {
    const db = await requireDb7();
    return db.select().from(walkForwardRuns).where(eq13(walkForwardRuns.userId, ctx.user.id)).orderBy(desc9(walkForwardRuns.createdAt));
  }),
  runWalkForward: operatorProcedure.input(z10.object({ walkForwardRunId: z10.number().int().positive(), symbol: z10.string().regex(/^\d{6}$/), minScore: z10.number().min(0).max(100).default(70) })).mutation(async ({ ctx, input }) => {
    const db = await requireDb7();
    const run = (await db.select().from(walkForwardRuns).where(and8(eq13(walkForwardRuns.id, input.walkForwardRunId), eq13(walkForwardRuns.userId, ctx.user.id))).limit(1))[0];
    if (!run) throw new TRPCError13({ code: "NOT_FOUND", message: "\uC6CC\uD06C\uD3EC\uC6CC\uB4DC \uC2E4\uD589 \uAE30\uB85D\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    const experiment = (await db.select().from(researchExperiments).where(and8(eq13(researchExperiments.id, run.experimentId), eq13(researchExperiments.userId, ctx.user.id))).limit(1))[0];
    if (!experiment) throw new TRPCError13({ code: "NOT_FOUND", message: "\uC6CC\uD06C\uD3EC\uC6CC\uB4DC\uC5D0 \uC5F0\uACB0\uB41C \uC2E4\uD5D8\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    const dataset = (await db.select().from(researchDatasets).where(and8(eq13(researchDatasets.id, experiment.datasetId), eq13(researchDatasets.userId, ctx.user.id))).limit(1))[0];
    if (!dataset || dataset.qualityStatus !== "ready") throw new TRPCError13({ code: "PRECONDITION_FAILED", message: "ready \uC0C1\uD0DC\uC758 \uACE0\uC815 \uB370\uC774\uD130\uC14B\uC5D0\uC11C\uB9CC \uC6CC\uD06C\uD3EC\uC6CC\uB4DC\uB97C \uC2E4\uD589\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4." });
    const configuration = walkForwardConfigurationSchema.parse(run.configurationJson);
    const allBars = await db.select().from(researchDailyBars).where(and8(eq13(researchDailyBars.datasetId, dataset.id), eq13(researchDailyBars.symbol, input.symbol))).orderBy(asc2(researchDailyBars.date));
    const snapshot = experiment.strategySnapshotJson;
    const rules = z10.array(storedRuleSchema).parse(snapshot.rulesJson);
    const assumptions = assumptionsSchema.parse(experiment.assumptionsJson);
    await db.update(walkForwardRuns).set({ status: "running" }).where(eq13(walkForwardRuns.id, run.id));
    try {
      const result = runWalkForward({ bars: allBars.map((bar) => ({ date: bar.date, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: Number(bar.volume), turnover: Number(bar.turnover) })), rules, configuration: { ...configuration, minScore: input.minScore, holdingDays: assumptions.maxHoldingDays, feeRate: assumptions.feeRate + assumptions.slippageBps / 1e4, entryDelayDays: experiment.informationCutoffTradingDays, entryTiming: assumptions.entryTiming === "next_open" ? "open" : "close" } });
      const resultsJson = { datasetId: dataset.id, datasetVersionKey: dataset.versionKey, symbol: input.symbol, informationCutoffTradingDays: experiment.informationCutoffTradingDays, assumptions, configuration, result };
      await db.update(walkForwardRuns).set({ status: "completed", resultsJson, completedAt: /* @__PURE__ */ new Date() }).where(eq13(walkForwardRuns.id, run.id));
      return { walkForwardRunId: run.id, datasetVersionKey: dataset.versionKey, symbol: input.symbol, result };
    } catch (error) {
      const message = error instanceof Error ? error.message : "\uC6CC\uD06C\uD3EC\uC6CC\uB4DC \uC2E4\uD589\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.";
      await db.update(walkForwardRuns).set({ status: "failed", resultsJson: { error: message } }).where(eq13(walkForwardRuns.id, run.id));
      throw new TRPCError13({ code: "BAD_REQUEST", message });
    }
  })
});

// server/routers/autonomousResearch.ts
import { and as and13, desc as desc17, eq as eq21, inArray as inArray2, like as like4, sql as sql2 } from "drizzle-orm";
import { z as z11 } from "zod";

// server/quant/publicHistoricalBacktest.ts
import { and as and9, desc as desc10, eq as eq14, like as like2 } from "drizzle-orm";

// server/quant/autonomousPipeline.ts
init_evolution();

// server/quant/autonomousResearch.ts
var AUTONOMOUS_RESEARCH_POLICY = {
  version: "autonomous-v1",
  populationSize: 100,
  maxUniverseSize: 20,
  minRules: 10,
  maxRules: 20,
  maxDepth: 4,
  intradayIntervalMinutes: 1,
  holdingDays: 5,
  feeRate: 15e-5,
  slippageBps: 5,
  informationCutoffTradingDays: 1,
  minimumTrades: 5,
  maxDrawdownLimit: 0.25
};
function getKoreaTimeParts(now) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const value = (type) => parts.find((part) => part.type === type)?.value ?? "";
  return { date: `${value("year")}-${value("month")}-${value("day")}`, weekday: value("weekday"), hour: Number(value("hour")), minute: Number(value("minute")) };
}
function getAutonomousResearchPhase(now) {
  const korea = getKoreaTimeParts(now);
  if (["Sat", "Sun"].includes(korea.weekday)) return null;
  const minuteOfDay = korea.hour * 60 + korea.minute;
  if (minuteOfDay >= 8 * 60 + 50 && minuteOfDay < 9 * 60) return "preparing";
  if (minuteOfDay >= 9 * 60 && minuteOfDay < 9 * 60 + 10) return "opening";
  if (minuteOfDay >= 9 * 60 + 10 && minuteOfDay < 15 * 60 + 20) return "intraday";
  if (minuteOfDay >= 15 * 60 + 20 && minuteOfDay < 15 * 60 + 40) return "closing";
  return null;
}
function getKoreaTradingDate(now) {
  return getKoreaTimeParts(now).date;
}
function buildAutonomousRunKey(now, phase, intervalMinutes = AUTONOMOUS_RESEARCH_POLICY.intradayIntervalMinutes) {
  const korea = getKoreaTimeParts(now);
  const bucket = phase === "intraday" ? Math.floor(korea.minute / intervalMinutes) * intervalMinutes : korea.minute;
  return `${AUTONOMOUS_RESEARCH_POLICY.version}:${korea.date}:${phase}:${String(korea.hour).padStart(2, "0")}${String(bucket).padStart(2, "0")}`;
}
function getWaitingForDataTransition(reason) {
  return { phase: "waiting_for_data", dataStatus: "waiting", lastError: reason.slice(0, 500), summary: { reason, policyVersion: AUTONOMOUS_RESEARCH_POLICY.version } };
}

// server/quant/autonomousPipeline.ts
init_evolution();
var AUTONOMOUS_ALLOWED_RULE_TYPES = ["macd_rising", "ma_position", "high_return", "turnover", "rsi", "bollinger", "stochastic", "atr_percent", "volume_ratio"];
var AUTONOMOUS_EVOLUTION_CONFIGURATION = {
  populationSize: AUTONOMOUS_RESEARCH_POLICY.populationSize,
  minRules: AUTONOMOUS_RESEARCH_POLICY.minRules,
  maxRules: AUTONOMOUS_RESEARCH_POLICY.maxRules,
  maxDepth: AUTONOMOUS_RESEARCH_POLICY.maxDepth,
  allowedRuleTypes: AUTONOMOUS_ALLOWED_RULE_TYPES,
  eliteCount: 12,
  crossoverRate: 0.72,
  mutationRate: 0.28,
  minimumTrades: AUTONOMOUS_RESEARCH_POLICY.minimumTrades,
  maxDrawdownLimit: AUTONOMOUS_RESEARCH_POLICY.maxDrawdownLimit,
  holdingDays: AUTONOMOUS_RESEARCH_POLICY.holdingDays,
  feeRate: AUTONOMOUS_RESEARCH_POLICY.feeRate,
  slippageBps: AUTONOMOUS_RESEARCH_POLICY.slippageBps,
  informationCutoffTradingDays: AUTONOMOUS_RESEARCH_POLICY.informationCutoffTradingDays,
  entryTiming: "next_open"
};
function selectAutonomousUniverse(items, maxSize = AUTONOMOUS_RESEARCH_POLICY.maxUniverseSize) {
  const seen = /* @__PURE__ */ new Set();
  return [...items].filter((item) => /^\d{6}$/.test(item.symbol) && item.price > 0 && item.turnover > 0 && !seen.has(item.symbol) && (seen.add(item.symbol), true)).sort((left, right) => right.turnover - left.turnover || left.symbol.localeCompare(right.symbol)).slice(0, maxSize);
}
function buildAutonomousInitialCandidates(input) {
  const genomes = generateUniqueGenomes({
    seed: input.seed,
    populationSize: AUTONOMOUS_EVOLUTION_CONFIGURATION.populationSize,
    minRules: AUTONOMOUS_EVOLUTION_CONFIGURATION.minRules,
    maxRules: AUTONOMOUS_EVOLUTION_CONFIGURATION.maxRules,
    maxDepth: AUTONOMOUS_EVOLUTION_CONFIGURATION.maxDepth,
    allowedRuleTypes: AUTONOMOUS_ALLOWED_RULE_TYPES
  });
  return genomes.map((genome) => ({
    ...genome,
    fingerprint: fingerprintResearchGenome({ ...genome, datasetVersionKey: input.datasetVersionKey, assumptions: AUTONOMOUS_EVOLUTION_CONFIGURATION })
  }));
}
function evaluateAutonomousCandidate(input) {
  const results = Object.entries(input.barsBySymbol).filter(([, bars]) => bars.length >= 60).map(([symbol, bars]) => ({
    symbol,
    result: runDailyBacktest({ bars, expression: input.root, minScore: input.minimumScore, holdingDays: AUTONOMOUS_EVOLUTION_CONFIGURATION.holdingDays, feeRate: AUTONOMOUS_EVOLUTION_CONFIGURATION.feeRate + AUTONOMOUS_EVOLUTION_CONFIGURATION.slippageBps / 1e4, entryDelayDays: AUTONOMOUS_EVOLUTION_CONFIGURATION.informationCutoffTradingDays, entryTiming: "open", evaluationStartIndex: input.evaluationStartRatio ? Math.max(60, Math.floor(bars.length * input.evaluationStartRatio)) : 0 })
  }));
  if (!results.length) throw new Error("\uC790\uB3D9 \uD6C4\uBCF4 \uD3C9\uAC00\uC5D0 \uD544\uC694\uD55C \uC2E4\uC81C \uC77C\uBD09\uC774 60\uAC1C \uC774\uC0C1\uC778 \uC885\uBAA9\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.");
  const metrics = {
    totalReturn: results.reduce((sum, item) => sum + item.result.totalReturn, 0) / results.length,
    maxDrawdown: results.reduce((sum, item) => sum + item.result.maxDrawdown, 0) / results.length,
    tradeCount: results.reduce((sum, item) => sum + item.result.tradeCount, 0),
    winRate: results.reduce((sum, item) => sum + item.result.winRate, 0) / results.length
  };
  return { metrics, fitnessScore: calculateFitness(metrics, { minimumTrades: AUTONOMOUS_EVOLUTION_CONFIGURATION.minimumTrades, maxDrawdownLimit: AUTONOMOUS_EVOLUTION_CONFIGURATION.maxDrawdownLimit }), results };
}
function selectAutonomousSurvivorFingerprints(scored, eliteCount = AUTONOMOUS_EVOLUTION_CONFIGURATION.eliteCount) {
  return new Set([...scored].sort((left, right) => right.fitnessScore - left.fitnessScore || left.fingerprint.localeCompare(right.fingerprint)).slice(0, eliteCount).map((candidate) => candidate.fingerprint));
}

// server/quant/publicHistoricalBacktest.ts
var historicalMarker = ":historical";
var reusePendingTimeoutMs = 6e4;
function toStoredUniverse(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function selectFreshHistoricalUniverse(rankingUniverse, storedRuns, limit) {
  if (rankingUniverse.length) return { universe: rankingUniverse, source: "kiwoom_ka10032" };
  for (const run of storedRuns) {
    const universe = toStoredUniverse(run.universeJson);
    const normalized = universe.filter((item) => Boolean(item) && typeof item === "object" && typeof item.symbol === "string").map((item) => ({ symbol: item.symbol, name: item.name ?? item.symbol, turnover: 0, price: 0, changeRate: 0 })).slice(0, limit);
    if (normalized.length) return { universe: normalized, source: "stored_actual_universe" };
  }
  return { universe: [], source: "kiwoom_ka10032" };
}
function toBarRecord(rows) {
  return rows.reduce((result, row) => {
    (result[row.symbol] ??= []).push({ date: row.date, open: Number(row.open), high: Number(row.high), low: Number(row.low), close: Number(row.close), volume: Number(row.volume), turnover: Number(row.turnover) });
    return result;
  }, {});
}
function historicalSourceRunId(run) {
  const summary = run.summaryJson;
  return summary?.dataset?.sourceRunId ?? run.id;
}
function buildLocalSnapshotRunKey(input) {
  return `${AUTONOMOUS_RESEARCH_POLICY.version}:${input.referenceDate}${historicalMarker}:local:${input.datasetId}:${input.versionKey.split(":").at(-1)}`;
}
function classifyPendingReuseRuns(runs, now) {
  const pending = runs.filter((run) => run.runKey.includes(`${historicalMarker}:reuse:`) && run.dataStatus === "pending");
  const active = pending.find((run) => now.getTime() - run.updatedAt.getTime() < reusePendingTimeoutMs);
  return { activeRunId: active?.id ?? null, staleRunIds: pending.filter((run) => now.getTime() - run.updatedAt.getTime() >= reusePendingTimeoutMs).map((run) => run.id) };
}
var PublicHistoricalBacktestRunner = class {
  dbFactory;
  createClient;
  now;
  inFlight = null;
  constructor(options = {}) {
    this.dbFactory = options.getDb ?? getDb;
    this.createClient = options.createClient ?? (() => new KiwoomClient());
    this.now = options.now ?? (() => /* @__PURE__ */ new Date());
  }
  async run() {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.runFresh();
    try {
      return await this.inFlight;
    } finally {
      this.inFlight = null;
    }
  }
  async reuseStoredDataset() {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.runReuse();
    try {
      return await this.inFlight;
    } finally {
      this.inFlight = null;
    }
  }
  async runLocalSnapshot(datasetId) {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.runLocalSnapshotInternal(datasetId);
    try {
      return await this.inFlight;
    } finally {
      this.inFlight = null;
    }
  }
  async runLocalSnapshotInternal(datasetId) {
    const db = await this.dbFactory();
    if (!db) return { status: "waiting", runId: null, message: "\uC800\uC7A5\uB41C \uC2E4\uC81C \uC77C\uBD09 \uC2A4\uB0C5\uC0F7\uC744 \uC870\uD68C\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.", reused: true };
    const dataset = (await db.select().from(researchDatasets).where(eq14(researchDatasets.id, datasetId)).limit(1))[0];
    if (!dataset || dataset.qualityStatus !== "ready") return { status: "waiting", runId: null, message: "ready \uC0C1\uD0DC\uC758 \uC2E4\uC81C \uC77C\uBD09 \uC2A4\uB0C5\uC0F7\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.", reused: true };
    const now = this.now();
    const runKey = buildLocalSnapshotRunKey({ datasetId: dataset.id, versionKey: dataset.versionKey, referenceDate: dataset.endDate });
    let run = (await db.select().from(autonomousResearchRuns).where(eq14(autonomousResearchRuns.runKey, runKey)).limit(1))[0];
    if (run?.dataStatus === "ready") return { status: "ready", runId: run.id, message: "\uB3D9\uC77C\uD55C \uBD88\uBCC0 \uC2E4\uC81C \uC77C\uBD09 \uC2A4\uB0C5\uC0F7\uC758 \uC790\uB3D9 \uC5F0\uAD6C \uACB0\uACFC\uB97C \uB2E4\uC2DC \uC0AC\uC6A9\uD569\uB2C8\uB2E4.", reused: true };
    if (!run) {
      try {
        await db.insert(autonomousResearchRuns).values({ tradingDate: dataset.endDate, runKey, policyVersion: AUTONOMOUS_RESEARCH_POLICY.version, phase: "preparing", dataStatus: "pending", summaryJson: { mode: "historical_backtest_local_snapshot", datasetId: dataset.id, datasetVersionKey: dataset.versionKey, requestedAt: now.toISOString() } });
      } catch {
      }
      run = (await db.select().from(autonomousResearchRuns).where(eq14(autonomousResearchRuns.runKey, runKey)).limit(1))[0];
    }
    if (!run) return { status: "waiting", runId: null, message: "\uBD88\uBCC0 \uC2E4\uC81C \uC77C\uBD09 \uC2A4\uB0C5\uC0F7 \uC2E4\uD589 \uAE30\uB85D\uC744 \uB9CC\uB4E4\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.", reused: true };
    let stage = "snapshot_prepare";
    try {
      const storedRows = await db.select().from(researchDailyBars).where(eq14(researchDailyBars.datasetId, dataset.id)).orderBy(researchDailyBars.symbol, researchDailyBars.date);
      const allBars = toBarRecord(storedRows);
      const eligibleSymbols = Object.entries(allBars).filter(([, bars]) => bars.length >= 85).map(([symbol]) => symbol);
      if (!eligibleSymbols.length) throw new Error("\uBD88\uBCC0 \uC2E4\uC81C \uC77C\uBD09 \uC2A4\uB0C5\uC0F7\uC5D0 85\uAC1C \uC774\uC0C1\uC758 \uC885\uBAA9\uBCC4 \uC77C\uBD09\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.");
      const barsBySymbol = Object.fromEntries(eligibleSymbols.map((symbol) => [symbol, allBars[symbol]]));
      const snapshotRows = Object.entries(barsBySymbol).flatMap(([symbol, bars]) => bars.map((bar) => ({ runId: run.id, symbol, date: bar.date, open: Math.round(bar.open), high: Math.round(bar.high), low: Math.round(bar.low), close: Math.round(bar.close), volume: String(Math.round(bar.volume)), turnover: String(Math.round(bar.turnover)), source: "kiwoom_ka10081_local_snapshot", capturedAt: now })));
      for (let offset = 0; offset < snapshotRows.length; offset += 20) {
        stage = `snapshot_copy_${offset}`;
        await db.insert(autonomousResearchBars).values(snapshotRows.slice(offset, offset + 20)).onConflictDoUpdate({
          target: [autonomousResearchBars.runId, autonomousResearchBars.symbol, autonomousResearchBars.date],
          set: { capturedAt: now }
        });
      }
      const universe = eligibleSymbols.map((symbol) => ({ symbol, name: symbol, turnover: 0, price: 0, changeRate: 0 }));
      stage = "candidate_evaluation";
      return await this.evaluateAndPersist({ db, run, now, referenceDate: dataset.endDate, universe, barsBySymbol, sourceRunId: run.id, reusedDataset: true, universeSource: "local_research_snapshot", source: "kiwoom_ka10081_local_snapshot", mode: "historical_backtest_local_snapshot", adjustmentBasis: dataset.adjustmentBasis });
    } catch (error) {
      const message = error instanceof Error ? error.message : "\uB2E4\uC885\uBAA9 \uC2E4\uC81C \uC77C\uBD09 \uC790\uB3D9 \uC5F0\uAD6C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.";
      return this.waitForData(db, run, now, new Error(`${stage}: ${message}`));
    }
  }
  async runFresh() {
    const db = await this.dbFactory();
    if (!db) return { status: "waiting", runId: null, message: "\uBC31\uD14C\uC2A4\uD2B8 \uC800\uC7A5\uC18C\uB97C \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.", reused: false };
    const now = this.now();
    const referenceDate = getKoreaTradingDate(now);
    const runKey = `${AUTONOMOUS_RESEARCH_POLICY.version}:${referenceDate}${historicalMarker}`;
    let run = (await db.select().from(autonomousResearchRuns).where(eq14(autonomousResearchRuns.runKey, runKey)).limit(1))[0];
    if (run?.dataStatus === "ready") return { status: "ready", runId: run.id, message: "\uC624\uB298\uC758 \uACE0\uC815 \uC2E4\uC81C \uC77C\uBD09 \uBC31\uD14C\uC2A4\uD2B8 \uACB0\uACFC\uB97C \uB2E4\uC2DC \uC0AC\uC6A9\uD569\uB2C8\uB2E4.", reused: true };
    if (!run) {
      try {
        await db.insert(autonomousResearchRuns).values({ tradingDate: referenceDate, runKey, policyVersion: AUTONOMOUS_RESEARCH_POLICY.version, phase: "preparing", dataStatus: "pending", summaryJson: { mode: "historical_backtest", requestedAt: now.toISOString() } });
      } catch {
      }
      run = (await db.select().from(autonomousResearchRuns).where(eq14(autonomousResearchRuns.runKey, runKey)).limit(1))[0];
    }
    if (!run) return { status: "waiting", runId: null, message: "\uACFC\uAC70 \uBC31\uD14C\uC2A4\uD2B8 \uC2E4\uD589 \uAE30\uB85D\uC744 \uB9CC\uB4E4\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.", reused: false };
    try {
      const client = this.createClient();
      const token = await client.getAccessToken();
      const ranking = await client.getTurnoverRankings(token.token, { market: "000", exchange: "KRX" });
      const priorHistoricalRuns = await db.select({ universeJson: autonomousResearchRuns.universeJson }).from(autonomousResearchRuns).where(and9(eq14(autonomousResearchRuns.dataStatus, "ready"), like2(autonomousResearchRuns.runKey, `%${historicalMarker}%`))).orderBy(desc10(autonomousResearchRuns.updatedAt)).limit(20);
      const selectedUniverse = selectFreshHistoricalUniverse(
        selectAutonomousUniverse(ranking.items, AUTONOMOUS_RESEARCH_POLICY.maxUniverseSize),
        priorHistoricalRuns,
        AUTONOMOUS_RESEARCH_POLICY.maxUniverseSize
      );
      const universe = selectedUniverse.universe;
      if (!universe.length) throw new Error("\uACFC\uAC70 \uBC31\uD14C\uC2A4\uD2B8 \uC720\uB2C8\uBC84\uC2A4\uC5D0 \uC2E4\uC81C \uAC00\uACA9\xB7\uAC70\uB798\uB300\uAE08 \uC885\uBAA9\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.");
      const barsBySymbol = {};
      for (const item of universe) {
        const bars = await client.getDailyBars(token.token, { symbol: item.symbol, adjustedPrice: "1", maxPages: 3 });
        if (bars.length < 85) continue;
        barsBySymbol[item.symbol] = bars;
        await db.insert(autonomousResearchBars).values(bars.map((bar) => ({ runId: run.id, symbol: item.symbol, date: bar.date, open: Math.round(bar.open), high: Math.round(bar.high), low: Math.round(bar.low), close: Math.round(bar.close), volume: String(Math.round(bar.volume)), turnover: String(Math.round(bar.turnover)), source: "kiwoom_ka10081_historical" }))).onConflictDoUpdate({
          target: [autonomousResearchBars.runId, autonomousResearchBars.symbol, autonomousResearchBars.date],
          set: { capturedAt: now }
        });
      }
      return await this.evaluateAndPersist({ db, run, now, referenceDate, universe, barsBySymbol, sourceRunId: run.id, reusedDataset: false, universeSource: selectedUniverse.source });
    } catch (error) {
      return this.waitForData(db, run, now, error);
    }
  }
  async runReuse() {
    const db = await this.dbFactory();
    if (!db) return { status: "waiting", runId: null, message: "\uC800\uC7A5\uB41C \uC2E4\uB370\uC774\uD130\uB97C \uC870\uD68C\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.", reused: false };
    const now = this.now();
    const historicalRuns = await db.select().from(autonomousResearchRuns).orderBy(desc10(autonomousResearchRuns.updatedAt)).limit(40);
    const reuseRecovery = classifyPendingReuseRuns(historicalRuns, now);
    if (reuseRecovery.activeRunId) return { status: "running", runId: reuseRecovery.activeRunId, message: "\uC800\uC7A5\uB41C \uC2E4\uC81C \uC77C\uBD09 \uC7AC\uC2E4\uD589\uC774 \uC9C4\uD589 \uC911\uC785\uB2C8\uB2E4.", reused: true };
    for (const staleRunId of reuseRecovery.staleRunIds) {
      await db.update(autonomousResearchRuns).set({ phase: "incomplete", dataStatus: "incomplete", lastError: "\uC800\uC7A5 \uC2E4\uC81C \uC77C\uBD09 \uC7AC\uC2E4\uD589\uC774 \uC911\uB2E8\uB418\uC5B4 \uB2E4\uC74C \uC694\uCCAD\uC5D0\uC11C \uBCF5\uAD6C\uD588\uC2B5\uB2C8\uB2E4.", updatedAt: now }).where(eq14(autonomousResearchRuns.id, staleRunId));
    }
    const sourceRun = historicalRuns.find((run2) => run2.dataStatus === "ready" && run2.runKey.includes(historicalMarker));
    if (!sourceRun) return { status: "waiting", runId: null, message: "\uBA3C\uC800 \uC2E4\uC81C \uC77C\uBD09 \uBC31\uD14C\uC2A4\uD2B8\uB97C \uC644\uB8CC\uD574\uC57C \uC800\uC7A5 \uB370\uC774\uD130\uB97C \uC7AC\uC0AC\uC6A9\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.", reused: false };
    const sourceRunId = historicalSourceRunId(sourceRun);
    const storedRows = await db.select().from(autonomousResearchBars).where(eq14(autonomousResearchBars.runId, sourceRunId)).orderBy(autonomousResearchBars.symbol, autonomousResearchBars.date);
    const barsBySymbol = toBarRecord(storedRows);
    if (!Object.keys(barsBySymbol).length) return { status: "waiting", runId: null, message: "\uC7AC\uC0AC\uC6A9\uD560 \uACE0\uC815 \uC2E4\uC81C \uC77C\uBD09 \uC6D0\uBCF8\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.", reused: false };
    const priorReuseCount = historicalRuns.filter((run2) => run2.runKey.includes(`${historicalMarker}:reuse:`)).length;
    const runKey = `${AUTONOMOUS_RESEARCH_POLICY.version}:${sourceRun.tradingDate}${historicalMarker}:reuse:${priorReuseCount + 1}`;
    const [created] = await db.insert(autonomousResearchRuns).values({ tradingDate: sourceRun.tradingDate, runKey, policyVersion: AUTONOMOUS_RESEARCH_POLICY.version, phase: "preparing", dataStatus: "pending", summaryJson: { mode: "historical_backtest_reuse", sourceRunId, requestedAt: now.toISOString() } }).returning();
    const run = (await db.select().from(autonomousResearchRuns).where(eq14(autonomousResearchRuns.id, created.id)).limit(1))[0];
    if (!run) return { status: "waiting", runId: null, message: "\uC800\uC7A5 \uB370\uC774\uD130 \uC7AC\uC0AC\uC6A9 \uC2E4\uD589\uC744 \uC900\uBE44\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.", reused: false };
    const universe = (sourceRun.universeJson ?? Object.keys(barsBySymbol).map((symbol) => ({ symbol, name: symbol }))).map((item) => ({ symbol: item.symbol, name: item.name ?? item.symbol, turnover: 0, price: 0, changeRate: 0 }));
    try {
      return await this.evaluateAndPersist({ db, run, now, referenceDate: sourceRun.tradingDate, universe, barsBySymbol, sourceRunId, reusedDataset: true, seedOffset: priorReuseCount + 1, universeSource: "stored_actual_universe" });
    } catch (error) {
      return this.waitForData(db, run, now, error);
    }
  }
  async evaluateAndPersist(input) {
    const symbols = Object.keys(input.barsBySymbol);
    if (!symbols.length) throw new Error("\uBC31\uD14C\uC2A4\uD2B8\uC5D0 \uD544\uC694\uD55C \uC2E4\uC81C \uC77C\uBD09 \uC6D0\uBCF8\uC744 \uC218\uC9D1\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
    const datasetVersionKey = `${AUTONOMOUS_RESEARCH_POLICY.version}:${input.referenceDate}:adjusted:${symbols.sort().join(",")}`;
    const generated = buildAutonomousInitialCandidates({ seed: Number(input.referenceDate.replaceAll("-", "")) + (input.seedOffset ?? 0), datasetVersionKey });
    const scored = generated.map((candidate) => ({ candidate, inSample: evaluateAutonomousCandidate({ root: candidate.root, minimumScore: candidate.minimumScore, barsBySymbol: input.barsBySymbol }), outOfSample: evaluateAutonomousCandidate({ root: candidate.root, minimumScore: candidate.minimumScore, barsBySymbol: input.barsBySymbol, evaluationStartRatio: 0.7 }) }));
    const survivorFingerprints = selectAutonomousSurvivorFingerprints(scored.map((item) => ({ fingerprint: item.candidate.fingerprint, fitnessScore: item.inSample.fitnessScore })));
    await input.db.insert(autonomousResearchCandidates).values(scored.map((item) => ({ runId: input.run.id, fingerprint: item.candidate.fingerprint, rootGenomeJson: item.candidate.root, minimumScore: item.candidate.minimumScore, status: survivorFingerprints.has(item.candidate.fingerprint) ? "survived" : "rejected", inSampleMetricsJson: { metrics: item.inSample.metrics, symbols, assumptions: { adjustmentBasis: input.adjustmentBasis ?? "adjusted", informationCutoffTradingDays: AUTONOMOUS_RESEARCH_POLICY.informationCutoffTradingDays, feeRate: AUTONOMOUS_RESEARCH_POLICY.feeRate, slippageBps: AUTONOMOUS_RESEARCH_POLICY.slippageBps, entryTiming: "next_open", holdingDays: AUTONOMOUS_RESEARCH_POLICY.holdingDays } }, outOfSampleMetricsJson: { metrics: item.outOfSample.metrics, symbols, split: "tail-30-percent" }, fitnessScore: String(item.inSample.fitnessScore), evaluatedAt: input.now }))).onConflictDoUpdate({
      target: autonomousResearchCandidates.fingerprint,
      set: { updatedAt: input.now }
    });
    const survivors = (await input.db.select().from(autonomousResearchCandidates).where(eq14(autonomousResearchCandidates.runId, input.run.id)).orderBy(desc10(autonomousResearchCandidates.fitnessScore))).filter((candidate) => candidate.status === "survived");
    for (const candidate of survivors) {
      const folds = Object.values(input.barsBySymbol).map((bars) => runWalkForward({ bars, expression: candidate.rootGenomeJson, configuration: { trainingDays: 60, validationDays: 20, stepDays: 20, minScore: candidate.minimumScore, holdingDays: AUTONOMOUS_RESEARCH_POLICY.holdingDays, feeRate: AUTONOMOUS_RESEARCH_POLICY.feeRate + AUTONOMOUS_RESEARCH_POLICY.slippageBps / 1e4, entryDelayDays: AUTONOMOUS_RESEARCH_POLICY.informationCutoffTradingDays, entryTiming: "open" } }));
      const totalReturn = folds.reduce((sum, item) => sum + item.totalReturn, 0) / folds.length;
      const maxDrawdown = folds.reduce((sum, item) => sum + item.worstFoldDrawdown, 0) / folds.length;
      const tradeCount = folds.reduce((sum, item) => sum + item.tradeCount, 0);
      await input.db.update(autonomousResearchCandidates).set({ walkForwardMetricsJson: { configuration: { trainingDays: 60, validationDays: 20, stepDays: 20 }, metrics: { totalReturn, maxDrawdown, tradeCount }, foldCount: folds.length }, updatedAt: input.now }).where(eq14(autonomousResearchCandidates.id, candidate.id));
    }
    const allBars = Object.values(input.barsBySymbol).flat();
    const dates = allBars.map((bar) => bar.date).sort();
    const summary = { mode: input.mode ?? (input.reusedDataset ? "historical_backtest_reuse" : "historical_backtest"), source: input.source ?? "kiwoom_ka10081", universeSource: input.universeSource, adjustmentBasis: input.adjustmentBasis ?? "adjusted", referenceDate: input.referenceDate, dataWindow: { startDate: dates[0], endDate: dates.at(-1) }, universeSize: symbols.length, barCount: allBars.length, generatedCandidates: generated.length, survivorCount: survivorFingerprints.size, dataset: { versionKey: datasetVersionKey, sourceRunId: input.sourceRunId, reused: input.reusedDataset, storage: "autonomous_research_bars" }, assumptions: { informationCutoffTradingDays: AUTONOMOUS_RESEARCH_POLICY.informationCutoffTradingDays, feeRate: AUTONOMOUS_RESEARCH_POLICY.feeRate, slippageBps: AUTONOMOUS_RESEARCH_POLICY.slippageBps, entryTiming: "next_open", holdingDays: AUTONOMOUS_RESEARCH_POLICY.holdingDays } };
    await input.db.update(autonomousResearchRuns).set({ phase: "completed", dataStatus: "ready", universeJson: input.universe.map((item) => ({ symbol: item.symbol, name: item.name })), summaryJson: summary, lastError: null, lastObservedAt: input.now, completedAt: input.now, updatedAt: input.now }).where(eq14(autonomousResearchRuns.id, input.run.id));
    return { status: "ready", runId: input.run.id, message: input.mode === "historical_backtest_local_snapshot" ? "\uB85C\uCEEC \uD0A4\uC6C0 \uC2E4\uC81C \uC77C\uBD09 \uBD88\uBCC0 \uC2A4\uB0C5\uC0F7\uC73C\uB85C \uC790\uB3D9 \uC870\uAC74\uC2DD\xB7\uB3C5\uB9BD OOS\xB7\uC6CC\uD06C\uD3EC\uC6CC\uB4DC \uBD84\uC11D\uC744 \uC644\uB8CC\uD588\uC2B5\uB2C8\uB2E4." : input.reusedDataset ? "\uD0A4\uC6C0 \uD638\uCD9C \uC5C6\uC774 \uC800\uC7A5\uB41C \uC2E4\uC81C \uC77C\uBD09\uC73C\uB85C \uC0C8 \uC870\uAC74\uC2DD \uC2E4\uD5D8\uC744 \uC644\uB8CC\uD588\uC2B5\uB2C8\uB2E4." : `${symbols.length}\uAC1C \uC2E4\uC81C \uC885\uBAA9\uC758 \uACE0\uC815 \uC77C\uBD09\uC73C\uB85C \uACFC\uAC70 \uBC31\uD14C\uC2A4\uD2B8\uB97C \uC644\uB8CC\uD588\uC2B5\uB2C8\uB2E4.`, reused: input.reusedDataset };
  }
  async waitForData(db, run, now, error) {
    const transition = getWaitingForDataTransition(error instanceof Error ? error.message : "\uACFC\uAC70 \uBC31\uD14C\uC2A4\uD2B8 \uC2E4\uB370\uC774\uD130 \uC218\uC9D1\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.");
    await db.update(autonomousResearchRuns).set({ ...transition, updatedAt: now }).where(eq14(autonomousResearchRuns.id, run.id));
    return { status: "waiting", runId: run.id, message: transition.lastError, reused: false };
  }
};
var publicHistoricalBacktest = new PublicHistoricalBacktestRunner();

// server/quant/historicalResearchInsights.ts
var OFFLINE_EXIT_POLICIES = [
  { id: "hold_5", label: "5\uAC70\uB798\uC77C \uBCF4\uC720", explanation: "\uD604\uC7AC \uAE30\uC900\uC120\uC785\uB2C8\uB2E4. \uC9C4\uC785 \uB4A4 5\uAC70\uB798\uC77C \uBCF4\uC720 \uD6C4 \uC885\uAC00\uC5D0 \uCCAD\uC0B0\uD569\uB2C8\uB2E4.", holdingDays: 5 },
  { id: "tp5_sl3_5d", label: "\uC775\uC808 5% \xB7 \uC190\uC808 3%", explanation: "\uB2E4\uC74C \uAC70\uB798\uC77C\uBD80\uD130 \uC77C\uBD09 \uACE0\uAC00\xB7\uC800\uAC00\uC5D0 \uB3C4\uB2EC\uD558\uBA74 \uCCAD\uC0B0\uD558\uACE0, \uBBF8\uB3C4\uB2EC \uC2DC 5\uAC70\uB798\uC77C \uB4A4 \uC885\uAC00\uC5D0 \uCCAD\uC0B0\uD569\uB2C8\uB2E4.", holdingDays: 5, takeProfitPercent: 5, stopLossPercent: 3 },
  { id: "tp8_sl4_7d", label: "\uC775\uC808 8% \xB7 \uC190\uC808 4%", explanation: "\uB2E4\uC74C \uAC70\uB798\uC77C\uBD80\uD130 \uBAA9\uD45C \uAC00\uACA9\uC744 \uD655\uC778\uD558\uACE0, \uBBF8\uB3C4\uB2EC \uC2DC 7\uAC70\uB798\uC77C \uB4A4 \uC885\uAC00\uC5D0 \uCCAD\uC0B0\uD569\uB2C8\uB2E4.", holdingDays: 7, takeProfitPercent: 8, stopLossPercent: 4 },
  { id: "tp12_sl6_10d", label: "\uC775\uC808 12% \xB7 \uC190\uC808 6%", explanation: "\uB2E4\uC74C \uAC70\uB798\uC77C\uBD80\uD130 \uBAA9\uD45C \uAC00\uACA9\uC744 \uD655\uC778\uD558\uACE0, \uBBF8\uB3C4\uB2EC \uC2DC 10\uAC70\uB798\uC77C \uB4A4 \uC885\uAC00\uC5D0 \uCCAD\uC0B0\uD569\uB2C8\uB2E4.", holdingDays: 10, takeProfitPercent: 12, stopLossPercent: 6 }
];
var ruleLabels = { macd_rising: "MACD \uD750\uB984", ma_position: "\uC774\uB3D9\uD3C9\uADE0\uC120 \uC704\uCE58", high_return: "\uCD5C\uADFC \uACE0\uC800 \uBCC0\uB3D9\uB960", turnover: "\uAC70\uB798\uB300\uAE08", rsi: "RSI", bollinger: "\uBCFC\uB9B0\uC800 \uBC34\uB4DC", stochastic: "\uC2A4\uD1A0\uCE90\uC2A4\uD2F1", atr_percent: "ATR \uBCC0\uB3D9\uC131", volume_ratio: "\uAC70\uB798\uB7C9 \uBE44\uC728" };
var regimeLabels = { uptrend: "\uC0C1\uC2B9 \uAD6D\uBA74", downtrend: "\uD558\uB77D \uAD6D\uBA74", range: "\uD6A1\uBCF4\xB7\uC804\uD658 \uAD6D\uBA74" };
function isGroup(node) {
  return Boolean(node && typeof node === "object" && "children" in node && Array.isArray(node.children));
}
function collectRules2(node) {
  if (!node || typeof node !== "object") return [];
  if (isGroup(node)) return node.children.flatMap((child) => collectRules2(child));
  return "type" in node ? [node] : [];
}
function emptyMetrics() {
  return { totalReturn: 0, maxDrawdown: 0, tradeCount: 0, winRate: 0, returnToDrawdown: 0, takeProfitCount: 0, stopLossCount: 0, takeProfitRate: 0, stopLossRate: 0, profitFactor: 0, expectancy: 0, averageHoldingDays: 0 };
}
function classifyRegime(bars, index2) {
  if (index2 < 20) return "range";
  const window = bars.slice(index2 - 20, index2 + 1);
  const current = window[window.length - 1]?.close ?? 0;
  const movingAverage = window.reduce((sum, bar) => sum + bar.close, 0) / window.length;
  const start = window[0]?.close ?? current;
  const twentyDayChange = start > 0 ? (current / start - 1) * 100 : 0;
  if (current > movingAverage && twentyDayChange >= 3) return "uptrend";
  if (current < movingAverage && twentyDayChange <= -3) return "downtrend";
  return "range";
}
function metricsFromTrades(trades) {
  if (!trades.length) return emptyMetrics();
  let equity = 1;
  let highWaterMark = 1;
  let maxDrawdown = 0;
  for (const trade of trades) {
    equity *= 1 + trade.returnPercent / 100;
    highWaterMark = Math.max(highWaterMark, equity);
    maxDrawdown = Math.min(maxDrawdown, (equity - highWaterMark) / highWaterMark);
  }
  const winners = trades.filter((trade) => trade.returnPercent > 0);
  const losers = trades.filter((trade) => trade.returnPercent <= 0);
  const grossProfit = winners.reduce((sum, trade) => sum + trade.returnPercent, 0);
  const grossLoss = Math.abs(losers.reduce((sum, trade) => sum + trade.returnPercent, 0));
  const takeProfitCount = trades.filter((trade) => trade.exitReason === "take_profit").length;
  const stopLossCount = trades.filter((trade) => trade.exitReason === "stop_loss").length;
  const totalReturn = (equity - 1) * 100;
  const drawdown = maxDrawdown * 100;
  return {
    totalReturn,
    maxDrawdown: drawdown,
    tradeCount: trades.length,
    winRate: winners.length / trades.length * 100,
    returnToDrawdown: totalReturn / Math.max(Math.abs(drawdown), 0.01),
    takeProfitCount,
    stopLossCount,
    takeProfitRate: takeProfitCount / trades.length * 100,
    stopLossRate: stopLossCount / trades.length * 100,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Number.POSITIVE_INFINITY : 0,
    expectancy: trades.reduce((sum, trade) => sum + trade.returnPercent, 0) / trades.length,
    averageHoldingDays: trades.reduce((sum, trade) => sum + trade.holdingDays, 0) / trades.length
  };
}
function simulatePolicy(input) {
  const trades = [];
  let position = null;
  let pendingEntryIndex = null;
  const close = (bar, index2, exitPrice, exitReason) => {
    if (!position) return;
    const netReturn = (exitPrice - position.entryPrice) / position.entryPrice - input.feeRate * 2;
    trades.push({ entryDate: position.entryDate, exitDate: bar.date, entryPrice: position.entryPrice, exitPrice, returnPercent: netReturn * 100, exitReason, holdingDays: Math.max(1, index2 - position.entryIndex), regime: position.regime });
    position = null;
  };
  for (let index2 = 0; index2 < input.bars.length; index2 += 1) {
    const bar = input.bars[index2];
    if (position && index2 > position.entryIndex) {
      const stopPrice = input.policy.stopLossPercent ? position.entryPrice * (1 - input.policy.stopLossPercent / 100) : null;
      const targetPrice = input.policy.takeProfitPercent ? position.entryPrice * (1 + input.policy.takeProfitPercent / 100) : null;
      if (stopPrice !== null && bar.low <= stopPrice) close(bar, index2, stopPrice, "stop_loss");
      else if (targetPrice !== null && bar.high >= targetPrice) close(bar, index2, targetPrice, "take_profit");
      else if (position && index2 - position.entryIndex >= input.policy.holdingDays) close(bar, index2, bar.close, "fixed_holding");
    }
    if (!position && pendingEntryIndex !== null && index2 >= pendingEntryIndex) {
      position = { entryIndex: index2, entryDate: bar.date, entryPrice: bar.open, regime: classifyRegime(input.bars, index2) };
      pendingEntryIndex = null;
    }
    if (!position && pendingEntryIndex === null) {
      const signal = evaluateExpression(input.root, input.bars.slice(0, index2 + 1));
      if (signal.eligible && signal.score >= input.minimumScore && index2 + input.entryDelayDays < input.bars.length) pendingEntryIndex = index2 + input.entryDelayDays;
    }
  }
  return { metrics: metricsFromTrades(trades), trades };
}
function averageMetrics(metrics) {
  if (!metrics.length) return emptyMetrics();
  const sum = (key) => metrics.reduce((total, item) => total + item[key], 0);
  return { totalReturn: sum("totalReturn") / metrics.length, maxDrawdown: sum("maxDrawdown") / metrics.length, tradeCount: sum("tradeCount"), winRate: sum("winRate") / metrics.length, returnToDrawdown: sum("returnToDrawdown") / metrics.length, takeProfitCount: sum("takeProfitCount"), stopLossCount: sum("stopLossCount"), takeProfitRate: sum("takeProfitRate") / metrics.length, stopLossRate: sum("stopLossRate") / metrics.length, profitFactor: sum("profitFactor") / metrics.length, expectancy: sum("expectancy") / metrics.length, averageHoldingDays: sum("averageHoldingDays") / metrics.length };
}
function numberFromMetrics(raw, key) {
  if (!raw || typeof raw !== "object") return null;
  const record = raw;
  const direct = record[key];
  if (typeof direct === "number") return direct;
  if (typeof direct === "string" && Number.isFinite(Number(direct))) return Number(direct);
  if (record.metrics && typeof record.metrics === "object") return numberFromMetrics(record.metrics, key);
  return null;
}
function researchQuality(candidates) {
  const oos = candidates.map((candidate) => numberFromMetrics(candidate.outOfSampleMetricsJson, "totalReturn")).filter((value) => value !== null);
  const walkForward = candidates.map((candidate) => numberFromMetrics(candidate.walkForwardMetricsJson, "totalReturn")).filter((value) => value !== null);
  const inSample = candidates.map((candidate) => numberFromMetrics(candidate.inSampleMetricsJson, "totalReturn")).filter((value) => value !== null);
  const average2 = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const positiveRate = (values) => values.length ? values.filter((value) => value > 0).length / values.length * 100 : null;
  return {
    oosPositiveRate: positiveRate(oos),
    walkForwardPositiveRate: positiveRate(walkForward),
    averageOosReturn: average2(oos),
    averageWalkForwardReturn: average2(walkForward),
    averageInSampleReturn: average2(inSample),
    candidateCountWithOos: oos.length,
    candidateCountWithWalkForward: walkForward.length,
    checklist: [
      { id: "oos", label: "\uB3C5\uB9BD OOS \uD655\uC778", status: oos.length > 0 && (positiveRate(oos) ?? 0) >= 50 ? "pass" : "watch", explanation: oos.length ? `\uC0C1\uC704 \uD6C4\uBCF4 \uC911 ${(positiveRate(oos) ?? 0).toFixed(0)}%\uAC00 \uB3C5\uB9BD OOS\uC5D0\uC11C \uC591(+)\uC758 \uACB0\uACFC\uB97C \uBCF4\uC600\uC2B5\uB2C8\uB2E4.` : "\uB3C5\uB9BD OOS \uACB0\uACFC\uAC00 \uC5C6\uC5B4 \uD310\uB2E8\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." },
      { id: "walk_forward", label: "\uBC18\uBCF5 \uC6CC\uD06C\uD3EC\uC6CC\uB4DC \uD655\uC778", status: walkForward.length > 0 && (positiveRate(walkForward) ?? 0) >= 50 ? "pass" : "watch", explanation: walkForward.length ? `\uC0C1\uC704 \uD6C4\uBCF4 \uC911 ${(positiveRate(walkForward) ?? 0).toFixed(0)}%\uAC00 \uBC18\uBCF5 \uAC80\uC99D\uC5D0\uC11C \uC591(+)\uC758 \uACB0\uACFC\uB97C \uBCF4\uC600\uC2B5\uB2C8\uB2E4.` : "\uC6CC\uD06C\uD3EC\uC6CC\uB4DC \uACB0\uACFC\uAC00 \uC5C6\uC5B4 \uD310\uB2E8\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." },
      { id: "survivorship", label: "\uC0DD\uC874\uD3B8\uD5A5 \uACBD\uACE0", status: "warning", explanation: "\uD604\uC7AC \uC720\uB3D9\uC131 \uC720\uB2C8\uBC84\uC2A4\uB9CC \uC0AC\uC6A9\uD558\uBBC0\uB85C \uC0C1\uC7A5\uD3D0\uC9C0\xB7\uAC70\uB798\uC815\uC9C0 \uC885\uBAA9\uC774 \uBE60\uC84C\uC744 \uC218 \uC788\uC2B5\uB2C8\uB2E4." },
      { id: "execution", label: "\uC77C\uBD09 \uCCB4\uACB0 \uD55C\uACC4", status: "warning", explanation: "\uC77C\uBD09\uC5D0\uB294 \uC7A5\uC911 \uAC00\uACA9 \uC21C\uC11C\uC640 \uD638\uAC00 \uCCB4\uACB0\uC774 \uC5C6\uC5B4, \uC775\uC808\xB7\uC190\uC808 \uB3D9\uC2DC \uB3C4\uB2EC \uC2DC \uBCF4\uC218\uC801\uC73C\uB85C \uC190\uC808\uC744 \uC6B0\uC120 \uC801\uC6A9\uD588\uC2B5\uB2C8\uB2E4." }
    ]
  };
}
function buildHistoricalResearchInsights(input) {
  const topCandidates = [...input.candidates].sort((left, right) => Number(right.fitnessScore ?? 0) - Number(left.fitnessScore ?? 0)).slice(0, 6);
  const ruleCounts = /* @__PURE__ */ new Map();
  for (const candidate of topCandidates) {
    const used = new Set(collectRules2(candidate.rootGenomeJson).filter((rule) => rule.enabled).map((rule) => rule.type));
    for (const type of Array.from(used)) ruleCounts.set(type, (ruleCounts.get(type) ?? 0) + 1);
  }
  const commonRules = Array.from(ruleCounts.entries()).map(([type, candidateCount]) => ({ type, label: ruleLabels[type] ?? type, candidateCount, candidateRate: topCandidates.length ? candidateCount / topCandidates.length * 100 : 0 })).sort((left, right) => right.candidateCount - left.candidateCount || left.label.localeCompare(right.label));
  const perPolicy = OFFLINE_EXIT_POLICIES.map((policy) => {
    const simulations = [];
    for (const candidate of topCandidates) {
      for (const bars of Object.values(input.barsBySymbol)) {
        if (bars.length < 60) continue;
        simulations.push(simulatePolicy({ bars, root: candidate.rootGenomeJson, minimumScore: candidate.minimumScore, policy, feeRate: input.feeRate, entryDelayDays: input.entryDelayDays }));
      }
    }
    const regimeMetrics = Object.keys(regimeLabels).map((regime) => ({ id: regime, label: regimeLabels[regime], metrics: averageMetrics(simulations.map((simulation) => metricsFromTrades(simulation.trades.filter((trade) => trade.regime === regime))).filter((metrics) => metrics.tradeCount > 0)) }));
    return { ...policy, metrics: averageMetrics(simulations.map((simulation) => simulation.metrics).filter((metrics) => metrics.tradeCount > 0)), regimeMetrics };
  });
  const leastDrawdownPolicy = [...perPolicy].filter((item) => item.metrics.tradeCount > 0).sort((left, right) => Math.abs(left.metrics.maxDrawdown) - Math.abs(right.metrics.maxDrawdown) || right.metrics.returnToDrawdown - left.metrics.returnToDrawdown)[0] ?? null;
  const bestReturnToDrawdownPolicy = [...perPolicy].filter((item) => item.metrics.tradeCount > 0).sort((left, right) => right.metrics.returnToDrawdown - left.metrics.returnToDrawdown)[0] ?? null;
  return {
    candidateCount: topCandidates.length,
    commonRules,
    exitPolicies: perPolicy,
    leastDrawdownPolicyId: leastDrawdownPolicy?.id ?? null,
    bestReturnToDrawdownPolicyId: bestReturnToDrawdownPolicy?.id ?? null,
    researchQuality: researchQuality(topCandidates),
    methodology: { source: "\uC800\uC7A5\uB41C \uC870\uC815 \uC77C\uBD09", offline: true, entryTiming: `\uC870\uAC74 \uCDA9\uC871 \uB4A4 ${input.entryDelayDays}\uAC70\uB798\uC77C \uD6C4 \uC2DC\uAC00`, conservativeDailyBarRule: "\uAC19\uC740 \uC77C\uBD09\uC5D0\uC11C \uC775\uC808\xB7\uC190\uC808\uAC00\uAC00 \uBAA8\uB450 \uB2FF\uC73C\uBA74 \uC190\uC808\uC744 \uBA3C\uC800 \uC801\uC6A9", regimeDefinition: "\uAC1C\uBCC4 \uC885\uBAA9\uC758 20\uAC70\uB798\uC77C \uC885\uAC00\xB7\uC774\uB3D9\uD3C9\uADE0 \uAE30\uC900: \uC0C1\uC2B9(+3% \uC774\uC0C1\xB7\uC774\uD3C9 \uC704), \uD558\uB77D(-3% \uC774\uD558\xB7\uC774\uD3C9 \uC544\uB798), \uADF8 \uC678 \uD6A1\uBCF4\xB7\uC804\uD658", note: "\uC815\uCC45 \uBE44\uAD50\uB294 \uC0C1\uC704 \uD6C4\uBCF4\uC640 \uACE0\uC815 \uC6D0\uBCF8\uC758 \uACFC\uAC70 \uC5F0\uAD6C\uC785\uB2C8\uB2E4. \uD6C4\uBCF4\xB7\uC885\uBAA9\uBCC4 \uB2E8\uC77C \uD3EC\uC9C0\uC158\uC744 \uC21C\uCC28 \uACC4\uC0B0\uD588\uC73C\uBA70, \uD3EC\uC9C0\uC158 \uB3D9\uC2DC\uBCF4\uC720\xB7\uC790\uBCF8\uBC30\uBD84\xB7\uC138\uAE08\xB7\uC2E4\uC2DC\uAC04 \uCCB4\uACB0\uC740 \uBC18\uC601\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4." }
  };
}

// server/quant/researchCommittee.ts
import { createHash as createHash2 } from "node:crypto";
import { and as and10, desc as desc11, eq as eq15 } from "drizzle-orm";

// server/_core/llm.ts
var ensureArray = (value) => Array.isArray(value) ? value : [value];
var normalizeContentPart = (part) => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }
  if (part.type === "text") {
    return part;
  }
  if (part.type === "image_url") {
    return part;
  }
  if (part.type === "file_url") {
    return part;
  }
  throw new Error("Unsupported message content part");
};
var normalizeMessage = (message) => {
  const { role, name, tool_call_id } = message;
  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content).map((part) => typeof part === "string" ? part : JSON.stringify(part)).join("\n");
    return {
      role,
      name,
      tool_call_id,
      content
    };
  }
  const contentParts = ensureArray(message.content).map(normalizeContentPart);
  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return {
      role,
      name,
      content: contentParts[0].text
    };
  }
  return {
    role,
    name,
    content: contentParts
  };
};
var normalizeToolChoice = (toolChoice, tools) => {
  if (!toolChoice) return void 0;
  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }
  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error(
        "tool_choice 'required' was provided but no tools were configured"
      );
    }
    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly"
      );
    }
    return {
      type: "function",
      function: { name: tools[0].function.name }
    };
  }
  if ("name" in toolChoice) {
    return {
      type: "function",
      function: { name: toolChoice.name }
    };
  }
  return toolChoice;
};
var resolveApiUrl = () => ENV.forgeApiUrl && ENV.forgeApiUrl.trim().length > 0 ? `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/chat/completions` : "https://forge.manus.im/v1/chat/completions";
var assertApiKey = () => {
  if (!ENV.forgeApiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
};
var normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema
}) => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (explicitFormat.type === "json_schema" && !explicitFormat.json_schema?.schema) {
      throw new Error(
        "responseFormat json_schema requires a defined schema object"
      );
    }
    return explicitFormat;
  }
  const schema = outputSchema || output_schema;
  if (!schema) return void 0;
  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }
  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...typeof schema.strict === "boolean" ? { strict: schema.strict } : {}
    }
  };
};
var RETRY_MAX_RETRIES = 4;
var RETRY_BASE_DELAY_MS = 500;
var RETRY_MAX_DELAY_MS = 3e4;
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
var parseRetryAfter = (value) => {
  if (!value) return void 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1e3);
  const at = Date.parse(value);
  return Number.isNaN(at) ? void 0 : Math.max(0, at - Date.now());
};
var computeBackoffDelay = (attempt, retryAfterMs) => {
  const cap = Math.min(RETRY_BASE_DELAY_MS * 2 ** attempt, RETRY_MAX_DELAY_MS);
  const jittered = cap / 2 + Math.random() * (cap / 2);
  return Math.min(Math.max(jittered, retryAfterMs ?? 0), RETRY_MAX_DELAY_MS);
};
var fetchWithBackoff = async (url, init) => {
  let lastError;
  for (let attempt = 0; attempt <= RETRY_MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, init);
      if (response.ok || attempt === RETRY_MAX_RETRIES) {
        return response;
      }
      const retryAfterMs = parseRetryAfter(
        response.headers.get("retry-after")
      );
      try {
        await response.body?.cancel();
      } catch {
      }
      console.warn(
        `LLM request retry ${attempt + 1}/${RETRY_MAX_RETRIES} after status ${response.status}`
      );
      await sleep(computeBackoffDelay(attempt, retryAfterMs));
    } catch (error) {
      lastError = error;
      if (attempt === RETRY_MAX_RETRIES) throw error;
      console.warn(
        `LLM request retry ${attempt + 1}/${RETRY_MAX_RETRIES} after network error`
      );
      await sleep(computeBackoffDelay(attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("LLM request failed after exhausting retries");
};
async function invokeLLM(params) {
  assertApiKey();
  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
    model,
    thinking,
    reasoning,
    maxTokens,
    max_tokens
  } = params;
  const payload = {
    messages: messages.map(normalizeMessage)
  };
  if (model) {
    payload.model = model;
  }
  if (tools && tools.length > 0) {
    payload.tools = tools;
  }
  const normalizedToolChoice = normalizeToolChoice(
    toolChoice || tool_choice,
    tools
  );
  if (normalizedToolChoice) {
    payload.tool_choice = normalizedToolChoice;
  }
  const resolvedMaxTokens = max_tokens ?? maxTokens;
  if (typeof resolvedMaxTokens === "number") {
    payload.max_tokens = resolvedMaxTokens;
  }
  if (thinking) {
    payload.thinking = thinking;
  }
  if (reasoning) {
    payload.reasoning = reasoning;
  }
  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema
  });
  if (normalizedResponseFormat) {
    payload.response_format = normalizedResponseFormat;
  }
  const response = await fetchWithBackoff(resolveApiUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ENV.forgeApiKey}`
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `LLM invoke failed: ${response.status} ${response.statusText} \u2013 ${errorText}`
    );
  }
  return await response.json();
}
async function listLLMModels() {
  assertApiKey();
  const url = ENV.forgeApiUrl && ENV.forgeApiUrl.trim().length > 0 ? `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/models` : "https://forge.manus.im/v1/models";
  const response = await fetchWithBackoff(url, {
    headers: { authorization: `Bearer ${ENV.forgeApiKey}` }
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `List LLM models failed: ${response.status} ${response.statusText} \u2013 ${errorText}`
    );
  }
  return await response.json();
}

// server/quant/researchCommittee.ts
var RESEARCH_COMMITTEE_POLICY_VERSION = "research-committee-v1";
var inFlightCommitteeRuns = /* @__PURE__ */ new Map();
var RESEARCH_COMMITTEE_ROLES = [
  { id: "data_quality", title: "\uB370\uC774\uD130 \uD488\uC9C8 \uC704\uC6D0", mandate: "\uC800\uC7A5 \uC77C\uBD09\uC758 \uCD9C\uCC98, \uAE30\uAC04\xB7\uC720\uB2C8\uBC84\uC2A4 \uBC94\uC704, \uC5F0\uC18D\uC131, \uC870\uC815 \uAE30\uC900, \uC0DD\uC874\uD3B8\uD5A5\uACFC \uD45C\uBCF8 \uB300\uD45C\uC131\uC758 \uD55C\uACC4\uB97C \uC810\uAC80\uD569\uB2C8\uB2E4." },
  { id: "signal_structure", title: "\uC2E0\uD638 \uAD6C\uC870 \uC704\uC6D0", mandate: "\uC0C1\uC704 \uD6C4\uBCF4\uC758 \uACF5\uD1B5 \uADDC\uCE59\uACFC \uADDC\uCE59 \uBCF5\uC7A1\uB3C4\uB97C \uAC80\uD1A0\uD558\uACE0, \uC911\uBCF5 \uC2E0\uD638\xB7\uB2E4\uC911\uAC80\uC815\xB7\uACFC\uCD5C\uC801\uD654 \uAC00\uB2A5\uC131\uC744 \uBC18\uBC15 \uAD00\uC810\uC5D0\uC11C \uC810\uAC80\uD569\uB2C8\uB2E4." },
  { id: "independent_validation", title: "\uB3C5\uB9BD \uAC80\uC99D \uC704\uC6D0", mandate: "\uC778\uC0D8\uD50C\uACFC \uB3C5\uB9BD OOS\xB7\uC6CC\uD06C\uD3EC\uC6CC\uB4DC\uC758 \uCC28\uC774, \uC591(+) \uBE44\uC728, \uD45C\uBCF8 \uC218, \uAD6D\uBA74 \uC758\uC874\uC131\uC744 \uD655\uC778\uD569\uB2C8\uB2E4." },
  { id: "exit_rules", title: "\uCCAD\uC0B0 \uADDC\uCE59 \uC704\uC6D0", mandate: "\uC775\uC808\xB7\uC190\uC808 \uB3C4\uB2EC \uBE44\uC728, \uD3C9\uADE0 \uBCF4\uC720\uAE30\uAC04, \uAE30\uB300\uAC12, Profit Factor, \uAD6D\uBA74\uBCC4 \uCCAD\uC0B0 \uACAC\uACE0\uC131\uC744 \uBE44\uAD50\uD569\uB2C8\uB2E4." },
  { id: "risk", title: "\uC704\uD5D8 \uC704\uC6D0", mandate: "MDD, \uC218\uC775/\uB099\uD3ED \uBE44\uC728, \uC190\uC808 \uBE44\uC728, \uC190\uC2E4 \uC9D1\uC911 \uAC00\uB2A5\uC131\uACFC \uC790\uBCF8\uBC30\uBD84 \uBBF8\uBC18\uC601 \uC704\uD5D8\uC744 \uAC80\uD1A0\uD569\uB2C8\uB2E4." },
  { id: "execution_feasibility", title: "\uC2E4\uD589 \uAC00\uB2A5\uC131 \uC704\uC6D0", mandate: "\uB2E4\uC74C \uBD09 \uCCB4\uACB0, \uC77C\uBD09 \uC7A5\uC911 \uC21C\uC11C \uBBF8\uAD00\uCE21, \uC2AC\uB9AC\uD53C\uC9C0\xB7\uC138\uAE08\xB7\uB3D9\uC2DC \uBCF4\uC720 \uBBF8\uBC18\uC601 \uB4F1 \uD604\uC2E4 \uCCB4\uACB0 \uD55C\uACC4\uB97C \uC810\uAC80\uD569\uB2C8\uB2E4." }
];
function isGroup2(node) {
  return Boolean(node && typeof node === "object" && "children" in node && Array.isArray(node.children));
}
function collectRules3(node) {
  if (!node || typeof node !== "object") return [];
  if (isGroup2(node)) return node.children.flatMap((child) => collectRules3(child));
  return "type" in node ? [node] : [];
}
function numberFromMetrics2(raw, key) {
  if (!raw || typeof raw !== "object") return null;
  const record = raw;
  const direct = record[key];
  if (typeof direct === "number" && Number.isFinite(direct)) return direct;
  if (typeof direct === "string" && Number.isFinite(Number(direct))) return Number(direct);
  if (record.metrics && typeof record.metrics === "object") return numberFromMetrics2(record.metrics, key);
  return null;
}
function stringifyContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.filter((part) => Boolean(part && typeof part === "object" && part.type === "text" && typeof part.text === "string")).map((part) => part.text).join("\n");
}
function parseStructuredJson(content, context) {
  const text2 = stringifyContent(content).trim();
  if (!text2) throw new Error(`${context} \uBAA8\uB378 \uC751\uB2F5\uC774 \uBE44\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.`);
  try {
    return JSON.parse(text2);
  } catch (error) {
    const object = text2.match(/\{[\s\S]*\}/)?.[0];
    if (object) {
      try {
        return JSON.parse(object);
      } catch {
      }
    }
    throw new Error(`${context} \uBAA8\uB378 \uC751\uB2F5\uC744 \uAD6C\uC870\uD654 JSON\uC73C\uB85C \uD574\uC11D\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4: ${error instanceof Error ? error.message : "\uC54C \uC218 \uC5C6\uB294 \uD615\uC2DD"}`);
  }
}
function parseReview(value, role) {
  const parsed = parseStructuredJson(value, role.title);
  return { ...parsed, roleId: role.id, roleTitle: role.title };
}
function isRecoverableModelFormatError(error) {
  const message = error instanceof Error ? error.message : "";
  return message.includes("Unexpected end of JSON input") || message.includes("\uBAA8\uB378 \uC751\uB2F5\uC774 \uBE44\uC5B4") || message.includes("\uAD6C\uC870\uD654 JSON\uC73C\uB85C \uD574\uC11D\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4");
}
var pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
var reviewSchema = {
  name: "research_committee_review",
  strict: true,
  schema: {
    type: "object",
    properties: {
      summary: { type: "string" },
      stance: { type: "string", enum: ["research_candidate_only", "requires_more_validation", "insufficient_evidence"] },
      supportingEvidence: { type: "array", items: { type: "string" } },
      riskFlags: { type: "array", items: { type: "object", properties: { id: { type: "string" }, severity: { type: "string", enum: ["high", "medium", "low"] }, statement: { type: "string" }, evidenceKeys: { type: "array", items: { type: "string" } } }, required: ["id", "severity", "statement", "evidenceKeys"], additionalProperties: false } },
      challengePoints: { type: "array", items: { type: "string" } },
      requiredValidation: { type: "array", items: { type: "string" } },
      confidence: { type: "string", enum: ["high", "medium", "low"] }
    },
    required: ["summary", "stance", "supportingEvidence", "riskFlags", "challengePoints", "requiredValidation", "confidence"],
    additionalProperties: false
  }
};
var deliberationSchema = {
  name: "research_committee_deliberation",
  strict: true,
  schema: {
    type: "object",
    properties: {
      verdict: { type: "string", enum: ["research_candidate_only", "requires_more_validation", "insufficient_evidence"] },
      executiveSummary: { type: "string" },
      agreements: { type: "array", items: { type: "string" } },
      disagreements: { type: "array", items: { type: "object", properties: { topic: { type: "string" }, positions: { type: "array", items: { type: "string" } }, evidenceKeys: { type: "array", items: { type: "string" } } }, required: ["topic", "positions", "evidenceKeys"], additionalProperties: false } },
      nextValidations: { type: "array", items: { type: "object", properties: { id: { type: "string" }, title: { type: "string" }, purpose: { type: "string" }, acceptanceCriteria: { type: "string" }, evidenceKeys: { type: "array", items: { type: "string" } } }, required: ["id", "title", "purpose", "acceptanceCriteria", "evidenceKeys"], additionalProperties: false } },
      implementationPriorities: { type: "array", items: { type: "string" } },
      boundaries: { type: "array", items: { type: "string" } },
      confidence: { type: "string", enum: ["high", "medium", "low"] }
    },
    required: ["verdict", "executiveSummary", "agreements", "disagreements", "nextValidations", "implementationPriorities", "boundaries", "confidence"],
    additionalProperties: false
  }
};
async function getLatestResearchCommitteeReport(runId) {
  const db = await getDb();
  if (!db) return null;
  return (await db.select().from(researchCommitteeReports).where(eq15(researchCommitteeReports.runId, runId)).orderBy(desc11(researchCommitteeReports.updatedAt)).limit(1))[0] ?? null;
}
async function selectCommitteeModel() {
  const catalog = await listLLMModels();
  const ids = catalog.data.map((item) => item.id);
  return ids.find((id) => id === "gpt-5-mini") ?? ids.find((id) => id.startsWith("gpt-5")) ?? ids[0] ?? "";
}
async function buildEvidence(runId) {
  const db = await getDb();
  if (!db) throw new Error("\uC5F0\uAD6C \uB370\uC774\uD130\uBCA0\uC774\uC2A4\uC5D0 \uC5F0\uACB0\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
  const run = (await db.select().from(autonomousResearchRuns).where(eq15(autonomousResearchRuns.id, runId)).limit(1))[0];
  if (!run || run.dataStatus !== "ready" || !run.runKey.includes(":historical")) throw new Error("\uC644\uB8CC\uB41C \uC2E4\uC81C \uC77C\uBD09 \uACFC\uAC70 \uC5F0\uAD6C \uC2E4\uD589\uB9CC \uC704\uC6D0\uD68C \uAC80\uD1A0\uC5D0 \uC0AC\uC6A9\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
  const summary = run.summaryJson;
  const sourceRunId = summary?.dataset?.sourceRunId ?? run.id;
  const [candidateRows, barRows] = await Promise.all([
    db.select().from(autonomousResearchCandidates).where(eq15(autonomousResearchCandidates.runId, run.id)).orderBy(desc11(autonomousResearchCandidates.fitnessScore)).limit(20),
    db.select().from(autonomousResearchBars).where(eq15(autonomousResearchBars.runId, sourceRunId)).orderBy(autonomousResearchBars.symbol, autonomousResearchBars.date)
  ]);
  const survivors = candidateRows.filter((candidate) => candidate.status === "survived").slice(0, 6);
  if (!barRows.length || !survivors.length) throw new Error("\uC2E4\uC81C \uC77C\uBD09 \uB610\uB294 \uC0DD\uC874 \uC870\uAC74\uC2DD\uC774 \uC5C6\uC5B4 \uC704\uC6D0\uD68C \uAC80\uD1A0\uB97C \uB9CC\uB4E4 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
  const barsBySymbol = barRows.reduce((result, row) => {
    (result[row.symbol] ??= []).push({ date: row.date, open: Number(row.open), high: Number(row.high), low: Number(row.low), close: Number(row.close), volume: Number(row.volume), turnover: Number(row.turnover) });
    return result;
  }, {});
  const feeRate = (summary?.assumptions?.feeRate ?? AUTONOMOUS_RESEARCH_POLICY.feeRate) + (summary?.assumptions?.slippageBps ?? AUTONOMOUS_RESEARCH_POLICY.slippageBps) / 1e4;
  const entryDelayDays = summary?.assumptions?.informationCutoffTradingDays ?? AUTONOMOUS_RESEARCH_POLICY.informationCutoffTradingDays;
  const insights = buildHistoricalResearchInsights({ candidates: survivors, barsBySymbol, feeRate, entryDelayDays });
  const evidence = {
    provenance: {
      evidenceType: "stored_kiwoom_adjusted_daily_bars_only",
      historicalRunId: run.id,
      sourceRunId,
      researchRunKey: run.runKey,
      datasetWindow: summary?.dataWindow ?? null,
      barCount: barRows.length,
      symbolCount: Object.keys(barsBySymbol).length,
      firstBarDate: barRows[0]?.date ?? null,
      lastBarDate: barRows.at(-1)?.date ?? null,
      generatedAt: (/* @__PURE__ */ new Date()).toISOString()
    },
    assumptions: {
      adjustedPrices: true,
      feeRate,
      entryDelayDays,
      baseHoldingDays: summary?.assumptions?.holdingDays ?? AUTONOMOUS_RESEARCH_POLICY.holdingDays,
      dailyBarAmbiguityRule: insights.methodology.conservativeDailyBarRule,
      excluded: ["example_data", "synthetic_data", "live_orders", "account_data", "unrecorded_intraday_sequence"]
    },
    survivorCandidates: survivors.map((candidate) => ({
      id: candidate.id,
      fingerprint: candidate.fingerprint,
      fitnessScore: Number(candidate.fitnessScore ?? 0),
      minimumScore: candidate.minimumScore,
      ruleTypes: Array.from(new Set(collectRules3(candidate.rootGenomeJson).filter((rule) => rule.enabled).map((rule) => rule.type))).sort(),
      ruleCount: collectRules3(candidate.rootGenomeJson).filter((rule) => rule.enabled).length,
      inSample: { totalReturn: numberFromMetrics2(candidate.inSampleMetricsJson, "totalReturn"), maxDrawdown: numberFromMetrics2(candidate.inSampleMetricsJson, "maxDrawdown"), tradeCount: numberFromMetrics2(candidate.inSampleMetricsJson, "tradeCount"), winRate: numberFromMetrics2(candidate.inSampleMetricsJson, "winRate") },
      outOfSample: { totalReturn: numberFromMetrics2(candidate.outOfSampleMetricsJson, "totalReturn"), maxDrawdown: numberFromMetrics2(candidate.outOfSampleMetricsJson, "maxDrawdown"), tradeCount: numberFromMetrics2(candidate.outOfSampleMetricsJson, "tradeCount"), winRate: numberFromMetrics2(candidate.outOfSampleMetricsJson, "winRate") },
      walkForward: { totalReturn: numberFromMetrics2(candidate.walkForwardMetricsJson, "totalReturn"), maxDrawdown: numberFromMetrics2(candidate.walkForwardMetricsJson, "maxDrawdown"), tradeCount: numberFromMetrics2(candidate.walkForwardMetricsJson, "tradeCount"), winRate: numberFromMetrics2(candidate.walkForwardMetricsJson, "winRate") }
    })),
    commonRules: insights.commonRules,
    validation: insights.researchQuality,
    exitPolicyResearch: insights.exitPolicies.map((policy) => ({ id: policy.id, label: policy.label, metrics: policy.metrics, regimeMetrics: policy.regimeMetrics })),
    methodology: insights.methodology
  };
  const fingerprintEvidence = {
    ...evidence,
    provenance: {
      ...evidence.provenance,
      // 생성 시각은 감사 정보일 뿐, 같은 고정 원본·가정의 새 지문을 만들면 안 됩니다.
      generatedAt: void 0
    }
  };
  const evidenceFingerprint = createHash2("sha256").update(JSON.stringify({ policy: RESEARCH_COMMITTEE_POLICY_VERSION, evidence: fingerprintEvidence })).digest("hex");
  return { db, run, sourceRunId, evidence, evidenceFingerprint };
}
async function requestRoleReview(role, model, evidence) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await invokeLLM({
        model,
        maxTokens: 3200,
        messages: [
          { role: "system", content: "\uB2F9\uC2E0\uC740 \uC2E4\uC81C \uB370\uC774\uD130 \uAE30\uBC18 \uC870\uAC74\uC2DD \uC5F0\uAD6C\uC704\uC6D0\uD68C \uAD6C\uC131\uC6D0\uC785\uB2C8\uB2E4. \uC81C\uACF5\uB41C EVIDENCE JSON \uC678\uC758 \uC22B\uC790\xB7\uC0AC\uC2E4\xB7\uAC00\uACA9\uC744 \uB9CC\uB4E4\uC9C0 \uB9C8\uC2ED\uC2DC\uC624. \uB9E4\uC218\xB7\uB9E4\uB3C4\xB7\uC885\uBAA9 \uCD94\uCC9C\uC774\uB098 \uC2E4\uAC70\uB798 \uC9C0\uCE68\uC744 \uC81C\uC2DC\uD558\uC9C0 \uB9C8\uC2ED\uC2DC\uC624. \uB204\uB77D\uB41C \uADFC\uAC70\uB294 \uBD88\uCDA9\uBD84\uD558\uB2E4\uACE0 \uBA85\uC2DC\uD558\uACE0, \uADFC\uAC70 \uD0A4\uB97C \uC815\uD655\uD788 \uC778\uC6A9\uD558\uC2ED\uC2DC\uC624. \uAC01 \uBC30\uC5F4\uC740 \uD575\uC2EC 3\uAC1C \uC774\uB0B4\uB85C \uAC04\uACB0\uD788 \uC791\uC131\uD558\uACE0 \uACB0\uACFC\uB294 \uC5F0\uAD6C \uD488\uC9C8\xB7\uCD94\uAC00 \uAC80\uC99D\uC5D0\uB9CC \uCD08\uC810\uC744 \uB454 \uD55C\uAD6D\uC5B4 JSON\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4." },
          { role: "user", content: `\uC704\uC6D0 \uC5ED\uD560: ${role.title}
\uC704\uC6D0 \uC784\uBB34: ${role.mandate}

EVIDENCE JSON:
${JSON.stringify(evidence)}` }
        ],
        outputSchema: reviewSchema
      });
      return parseReview(stringifyContent(response.choices[0]?.message.content ?? ""), role);
    } catch (error) {
      lastError = error;
      if (!isRecoverableModelFormatError(error) || attempt === 1) break;
      await pause(500);
    }
  }
  throw lastError;
}
async function requestDeliberation(model, evidence, reviews) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await invokeLLM({
        model,
        maxTokens: 3600,
        messages: [
          { role: "system", content: "\uB2F9\uC2E0\uC740 \uC2E4\uC81C \uB370\uC774\uD130 \uAE30\uBC18 \uC870\uAC74\uC2DD \uC5F0\uAD6C\uC704\uC6D0\uD68C\uC758 \uC758\uC7A5\uC785\uB2C8\uB2E4. EVIDENCE\uC640 \uAC01 \uC704\uC6D0 REVIEW\uB9CC\uC73C\uB85C \uD569\uC758\uB97C \uC791\uC131\uD558\uC2ED\uC2DC\uC624. \uC218\uCE58\xB7\uC131\uACFC\xB7\uC6D0\uC778\uC744 \uCD94\uC815\uD574 \uB9CC\uB4E4\uC5B4 \uB0B4\uC9C0 \uB9C8\uC2ED\uC2DC\uC624. \uAC00\uC7A5 \uBCF4\uC218\uC801\uC778 \uBC18\uB300 \uC758\uACAC\uC744 \uBCF4\uC874\uD558\uACE0, \uACB0\uB860\uC740 \uC2E4\uAC70\uB798 \uC2B9\uC778\uC774\uB098 \uD22C\uC790 \uAD8C\uACE0\uAC00 \uC544\uB2CC \uC5F0\uAD6C \uD6C4\uBCF4\uC758 \uAC80\uC99D \uC0C1\uD0DC\uC5EC\uC57C \uD569\uB2C8\uB2E4. \uAC01 \uBC30\uC5F4\uC740 \uD575\uC2EC 3\uAC1C \uC774\uB0B4\uB85C \uAC04\uACB0\uD788 \uC791\uC131\uD558\uACE0 \uACB0\uACFC\uB294 \uD55C\uAD6D\uC5B4 JSON\uB9CC \uBC18\uD658\uD558\uC2ED\uC2DC\uC624." },
          { role: "user", content: `EVIDENCE JSON:
${JSON.stringify(evidence)}

MEMBER REVIEWS:
${JSON.stringify(reviews)}` }
        ],
        outputSchema: deliberationSchema
      });
      return parseStructuredJson(response.choices[0]?.message.content ?? "", "\uC704\uC6D0\uD68C \uC758\uC7A5");
    } catch (error) {
      lastError = error;
      if (!isRecoverableModelFormatError(error) || attempt === 1) break;
      await pause(500);
    }
  }
  throw lastError;
}
async function prepareResearchCommitteeRun(runId) {
  const { db, run, sourceRunId, evidence, evidenceFingerprint } = await buildEvidence(runId);
  const existing = (await db.select().from(researchCommitteeReports).where(and10(eq15(researchCommitteeReports.runId, run.id), eq15(researchCommitteeReports.evidenceFingerprint, evidenceFingerprint))).limit(1))[0];
  if (existing?.status === "completed" || existing?.status === "running") return { report: existing, reused: true };
  const model = await selectCommitteeModel();
  if (!model) throw new Error("\uC0AC\uC6A9 \uAC00\uB2A5\uD55C \uC5F0\uAD6C\uC704\uC6D0\uD68C \uBAA8\uB378\uC744 \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
  let reportId;
  if (existing) {
    reportId = existing.id;
    await db.update(researchCommitteeReports).set({ sourceRunId, policyVersion: RESEARCH_COMMITTEE_POLICY_VERSION, model, status: "running", evidenceJson: evidence, memberReviewsJson: null, deliberationJson: null, lastError: null, startedAt: /* @__PURE__ */ new Date(), completedAt: null }).where(eq15(researchCommitteeReports.id, reportId));
  } else {
    const inserted = await db.insert(researchCommitteeReports).values({ runId: run.id, sourceRunId, evidenceFingerprint, policyVersion: RESEARCH_COMMITTEE_POLICY_VERSION, model, status: "running", evidenceJson: evidence }).returning({ id: researchCommitteeReports.id });
    reportId = inserted[0].id;
  }
  const report = (await db.select().from(researchCommitteeReports).where(eq15(researchCommitteeReports.id, reportId)).limit(1))[0];
  if (!report) throw new Error("\uC704\uC6D0\uD68C \uC2E4\uD589 \uAE30\uB85D\uC744 \uB9CC\uB4E4\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
  return { report, reused: false, job: { db, runId: run.id, reportId, model, evidence } };
}
async function completeResearchCommittee(job) {
  try {
    const reviews = [];
    for (let index2 = 0; index2 < RESEARCH_COMMITTEE_ROLES.length; index2 += 2) {
      const batch = RESEARCH_COMMITTEE_ROLES.slice(index2, index2 + 2);
      reviews.push(...await Promise.all(batch.map((role) => requestRoleReview(role, job.model, job.evidence))));
    }
    const deliberation = await requestDeliberation(job.model, job.evidence, reviews);
    await job.db.update(researchCommitteeReports).set({ status: "completed", memberReviewsJson: reviews, deliberationJson: deliberation, completedAt: /* @__PURE__ */ new Date(), lastError: null }).where(eq15(researchCommitteeReports.id, job.reportId));
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "\uC704\uC6D0\uD68C \uBD84\uC11D\uC744 \uC644\uB8CC\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.";
    await job.db.update(researchCommitteeReports).set({ status: "failed", lastError: message, completedAt: /* @__PURE__ */ new Date() }).where(eq15(researchCommitteeReports.id, job.reportId));
    throw error;
  }
}
async function runResearchCommittee(runId) {
  const existing = inFlightCommitteeRuns.get(runId);
  if (existing) return { report: await getLatestResearchCommitteeReport(runId), reused: true };
  const prepared = await prepareResearchCommitteeRun(runId);
  if (prepared.reused || !("job" in prepared)) return { report: prepared.report, reused: true };
  const job = prepared.job;
  if (!job) return { report: prepared.report, reused: true };
  const task = completeResearchCommittee(job).catch(() => void 0).finally(() => inFlightCommitteeRuns.delete(runId));
  inFlightCommitteeRuns.set(runId, task);
  return { report: prepared.report, reused: false };
}

// server/quant/researchGovernance.ts
import { createHash as createHash4 } from "node:crypto";
import { desc as desc13, eq as eq17 } from "drizzle-orm";

// server/quant/researchRevalidation.ts
import { createHash as createHash3 } from "node:crypto";
import { desc as desc12, eq as eq16 } from "drizzle-orm";
var RESEARCH_REVALIDATION_POLICY_VERSION = "research-revalidation-v1";
var externalEvidencePattern = /틱|분 단위|호가|상장폐지|유니버스 재런|실제 일봉|원자료|외부.*데이터|신규.*데이터/;
function classifyResearchPriority(priority) {
  if (priority.action !== "queue_research") {
    return { scope: "stored_daily_bars", readiness: "observe_only", blocker: priority.action === "block_promotion" ? "\uC2E4\uC804 \uC2B9\uACA9\uC740 \uC790\uB3D9\uD654 \uBC94\uC704\uC5D0\uC11C \uC81C\uC678\uD558\uBA70, \uC218\uC6A9 \uAE30\uC900 \uCDA9\uC871 \uC804\uAE4C\uC9C0 \uCC28\uB2E8\uD569\uB2C8\uB2E4." : "\uAD00\uCC30 \uACFC\uC81C\uB294 \uC0C8\uB85C\uC6B4 \uC2E4\uC81C \uC5F0\uAD6C \uADFC\uAC70\uAC00 \uB3C4\uCC29\uD560 \uB54C\uAE4C\uC9C0 \uC2E4\uD589\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4." };
  }
  if (externalEvidencePattern.test(`${priority.title} ${priority.acceptanceCriteria}`)) {
    return { scope: "external_verification", readiness: "requires_user_requested_external_verification", blocker: "\uC0AC\uC6A9\uC790 \uC694\uCCAD \uC804\uC5D0\uB294 \uD0A4\uC6C0 OAuth\xB7\uC2E0\uADDC \uC77C\uBD09\xB7\uC678\uBD80 \uC5F0\uAD6C \uB178\uB4DC \uAC80\uC99D\uC744 \uC2E4\uD589\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4." };
  }
  return { scope: "stored_daily_bars", readiness: "ready_for_internal_revalidation", blocker: null };
}
function fingerprint(input) {
  return createHash3("sha256").update(JSON.stringify(input)).digest("hex");
}
function metricSummary(raw) {
  const value = raw;
  return {
    totalReturn: Number(value.totalReturn ?? 0),
    maxDrawdown: Number(value.maxDrawdown ?? 0),
    tradeCount: Number(value.tradeCount ?? 0),
    winRate: Number(value.winRate ?? 0),
    profitFactor: Number(value.profitFactor ?? 0),
    expectancy: Number(value.expectancy ?? 0),
    returnToDrawdown: Number(value.returnToDrawdown ?? 0)
  };
}
async function calculateStoredDailyBarRevalidation(input) {
  const db = await getDb();
  if (!db) throw new Error("\uC5F0\uAD6C \uB370\uC774\uD130\uBCA0\uC774\uC2A4\uC5D0 \uC5F0\uACB0\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
  const run = (await db.select().from(autonomousResearchRuns).where(eq16(autonomousResearchRuns.id, input.sourceRunId)).limit(1))[0];
  if (!run || run.dataStatus !== "ready" || !run.runKey.includes(":historical")) throw new Error("\uC644\uB8CC\uB41C \uC800\uC7A5 \uC2E4\uC81C \uC77C\uBD09 \uACFC\uAC70 \uC5F0\uAD6C\uAC00 \uC5C6\uC5B4 \uB0B4\uBD80 \uC7AC\uD3C9\uAC00\uB97C \uC2E4\uD589\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
  const summary = run.summaryJson;
  const barRunId = summary?.dataset?.sourceRunId ?? run.id;
  const [candidates, rows] = await Promise.all([
    db.select().from(autonomousResearchCandidates).where(eq16(autonomousResearchCandidates.runId, run.id)).orderBy(desc12(autonomousResearchCandidates.fitnessScore)).limit(20),
    db.select().from(autonomousResearchBars).where(eq16(autonomousResearchBars.runId, barRunId)).orderBy(autonomousResearchBars.symbol, autonomousResearchBars.date)
  ]);
  const survivors = candidates.filter((candidate) => candidate.status === "survived");
  if (!rows.length || !survivors.length) throw new Error("\uC800\uC7A5 \uC2E4\uC81C \uC77C\uBD09 \uB610\uB294 \uC0DD\uC874 \uC870\uAC74\uC2DD\uC774 \uBD80\uC871\uD574 \uB0B4\uBD80 \uC7AC\uD3C9\uAC00\uB97C \uC2E4\uD589\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
  const barsBySymbol = rows.reduce((result, row) => {
    (result[row.symbol] ??= []).push({ date: row.date, open: Number(row.open), high: Number(row.high), low: Number(row.low), close: Number(row.close), volume: Number(row.volume), turnover: Number(row.turnover) });
    return result;
  }, {});
  const insights = buildHistoricalResearchInsights({
    candidates: survivors,
    barsBySymbol,
    feeRate: (summary?.assumptions?.feeRate ?? AUTONOMOUS_RESEARCH_POLICY.feeRate) + (summary?.assumptions?.slippageBps ?? AUTONOMOUS_RESEARCH_POLICY.slippageBps) / 1e4,
    entryDelayDays: summary?.assumptions?.informationCutoffTradingDays ?? AUTONOMOUS_RESEARCH_POLICY.informationCutoffTradingDays
  });
  return {
    policyVersion: RESEARCH_REVALIDATION_POLICY_VERSION,
    provenance: "stored_kiwoom_adjusted_daily_bars_only",
    evidenceFingerprint: input.evidenceFingerprint,
    priority: { id: input.priority.id, title: input.priority.title, acceptanceCriteria: input.priority.acceptanceCriteria },
    source: { historicalRunId: run.id, barRunId, barCount: rows.length, symbolCount: Object.keys(barsBySymbol).length, survivorCount: survivors.length },
    quality: insights.researchQuality,
    exitPolicyComparison: insights.exitPolicies.map((policy) => ({ id: policy.id, label: policy.label, metrics: metricSummary(policy.metrics) })),
    interpretation: "\uC774 \uACB0\uACFC\uB294 \uAE30\uC874 \uC800\uC7A5 \uC2E4\uC81C \uC77C\uBD09\uACFC \uB3D9\uC77C\uD55C \uBE44\uC6A9\xB7\uC815\uBCF4\uC808\uB2E8 \uAC00\uC815\uC73C\uB85C \uB2E4\uC2DC \uC9D1\uACC4\uD55C \uB0B4\uBD80 \uC5F0\uAD6C \uAE30\uB85D\uC785\uB2C8\uB2E4. \uC2E0\uADDC \uC2DC\uC7A5 \uB370\uC774\uD130 \uC218\uC9D1\xB7\uC8FC\uBB38\xB7\uC885\uBAA9 \uCD94\uCC9C\xB7\uC2E4\uC804 \uC2B9\uACA9\uC740 \uC218\uD589\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.",
    acceptanceAssessment: "\uC218\uC6A9 \uAE30\uC900\uC758 \uC815\uC131\xB7\uC678\uBD80 \uB370\uC774\uD130 \uC694\uAD6C\uC0AC\uD56D\uC740 \uC790\uB3D9 \uCDA9\uC871\uC73C\uB85C \uD310\uC815\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4. \uB0B4\uBD80 \uC7AC\uD3C9\uAC00 \uACB0\uACFC\uB294 \uB2E4\uC74C \uC704\uC6D0\uD68C\xB7\uAC70\uBC84\uB10C\uC2A4 \uAC80\uD1A0\uC758 \uADFC\uAC70\uB85C\uB9CC \uBCF4\uC874\uD569\uB2C8\uB2E4."
  };
}
async function createOrReuseJob(input) {
  const db = await getDb();
  if (!db) throw new Error("\uC5F0\uAD6C \uB370\uC774\uD130\uBCA0\uC774\uC2A4\uC5D0 \uC5F0\uACB0\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
  const classification = classifyResearchPriority(input.priority);
  const jobFingerprint = fingerprint({ policy: RESEARCH_REVALIDATION_POLICY_VERSION, evidenceFingerprint: input.evidenceFingerprint, priorityId: input.priority.id, acceptanceCriteria: input.priority.acceptanceCriteria, scope: classification.scope });
  const existing = (await db.select().from(researchRevalidationJobs).where(eq16(researchRevalidationJobs.jobFingerprint, jobFingerprint)).limit(1))[0];
  if (existing?.status === "completed" || existing?.status === "blocked" || existing?.status === "running") return existing;
  if (classification.scope === "external_verification") {
    if (existing) await db.update(researchRevalidationJobs).set({ status: "blocked", blocker: classification.blocker, lastError: null, completedAt: /* @__PURE__ */ new Date() }).where(eq16(researchRevalidationJobs.id, existing.id));
    else await db.insert(researchRevalidationJobs).values({ governanceCycleId: input.governanceCycleId, sourceRunId: input.sourceRunId, priorityId: input.priority.id, priorityTitle: input.priority.title, evidenceFingerprint: input.evidenceFingerprint, jobFingerprint, scope: classification.scope, status: "blocked", acceptanceCriteria: input.priority.acceptanceCriteria, blocker: classification.blocker, completedAt: /* @__PURE__ */ new Date() });
    return (await db.select().from(researchRevalidationJobs).where(eq16(researchRevalidationJobs.jobFingerprint, jobFingerprint)).limit(1))[0];
  }
  let jobId = existing?.id;
  if (existing) await db.update(researchRevalidationJobs).set({ status: "running", blocker: null, lastError: null, startedAt: /* @__PURE__ */ new Date(), completedAt: null }).where(eq16(researchRevalidationJobs.id, existing.id));
  else {
    const inserted = await db.insert(researchRevalidationJobs).values({ governanceCycleId: input.governanceCycleId, sourceRunId: input.sourceRunId, priorityId: input.priority.id, priorityTitle: input.priority.title, evidenceFingerprint: input.evidenceFingerprint, jobFingerprint, scope: classification.scope, status: "running", acceptanceCriteria: input.priority.acceptanceCriteria, startedAt: /* @__PURE__ */ new Date() }).returning({ id: researchRevalidationJobs.id });
    jobId = inserted[0].id;
  }
  if (!jobId) throw new Error("\uB0B4\uBD80 \uC7AC\uD3C9\uAC00 \uC791\uC5C5\uC744 \uB9CC\uB4E4\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
  try {
    const result = await calculateStoredDailyBarRevalidation({ sourceRunId: input.sourceRunId, evidenceFingerprint: input.evidenceFingerprint, priority: input.priority });
    await db.update(researchRevalidationJobs).set({ status: "completed", resultJson: result, completedAt: /* @__PURE__ */ new Date(), lastError: null }).where(eq16(researchRevalidationJobs.id, jobId));
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "\uC800\uC7A5 \uC2E4\uC81C \uC77C\uBD09 \uB0B4\uBD80 \uC7AC\uD3C9\uAC00\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.";
    await db.update(researchRevalidationJobs).set({ status: "failed", lastError: message, completedAt: /* @__PURE__ */ new Date() }).where(eq16(researchRevalidationJobs.id, jobId));
  }
  return (await db.select().from(researchRevalidationJobs).where(eq16(researchRevalidationJobs.id, jobId)).limit(1))[0];
}
async function materializeResearchRevalidationJobs(input) {
  const queueable = input.priorities.filter((priority) => priority.action === "queue_research");
  return Promise.all(queueable.map((priority) => createOrReuseJob({ ...input, priority })));
}

// server/quant/researchGovernance.ts
var RESEARCH_GOVERNANCE_POLICY_VERSION = "research-governance-v1";
var inFlightGovernanceCycles = /* @__PURE__ */ new Map();
function revalidationPriorities(value) {
  const directive = value;
  const priorities = directive?.final?.priorities;
  if (!Array.isArray(priorities)) return [];
  return priorities.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const priority = item;
    if (typeof priority.id !== "string" || typeof priority.ownerRole !== "string" || typeof priority.title !== "string" || typeof priority.rationale !== "string" || typeof priority.acceptanceCriteria !== "string") return [];
    const action = priority.action === "block_promotion" || priority.action === "observe_only" ? priority.action : "queue_research";
    return [{ id: priority.id, ownerRole: priority.ownerRole, title: priority.title, rationale: priority.rationale, acceptanceCriteria: priority.acceptanceCriteria, action }];
  });
}
var managerDirectiveSchema = {
  name: "research_governance_manager_directive",
  strict: true,
  schema: {
    type: "object",
    properties: {
      missionStatus: { type: "string", enum: ["research_candidate_only", "requires_more_validation", "insufficient_evidence"] },
      summary: { type: "string" },
      priorities: { type: "array", items: { type: "object", properties: { id: { type: "string" }, ownerRole: { type: "string", enum: RESEARCH_COMMITTEE_ROLES.map((role) => role.id) }, title: { type: "string" }, rationale: { type: "string" }, acceptanceCriteria: { type: "string" }, evidenceKeys: { type: "array", items: { type: "string" } }, action: { type: "string", enum: ["queue_research", "block_promotion", "observe_only"] } }, required: ["id", "ownerRole", "title", "rationale", "acceptanceCriteria", "evidenceKeys", "action"], additionalProperties: false } },
      promotionGate: { type: "object", properties: { permitResearchPromotion: { type: "boolean" }, reason: { type: "string" }, blockers: { type: "array", items: { type: "string" } } }, required: ["permitResearchPromotion", "reason", "blockers"], additionalProperties: false },
      boundaries: { type: "array", items: { type: "string" } }
    },
    required: ["missionStatus", "summary", "priorities", "promotionGate", "boundaries"],
    additionalProperties: false
  }
};
var leaderFollowUpSchema = {
  name: "research_governance_leader_follow_up",
  strict: true,
  schema: {
    type: "object",
    properties: {
      acknowledgement: { type: "string" },
      executionPlan: { type: "array", items: { type: "string" } },
      evidenceKeys: { type: "array", items: { type: "string" } },
      stopConditions: { type: "array", items: { type: "string" } },
      challengeToManager: { type: "string" }
    },
    required: ["acknowledgement", "executionPlan", "evidenceKeys", "stopConditions", "challengeToManager"],
    additionalProperties: false
  }
};
function stringifyContent2(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.filter((item) => Boolean(item && typeof item === "object" && item.type === "text" && typeof item.text === "string")).map((item) => item.text).join("\n");
}
function parseJson(content, label) {
  const text2 = stringifyContent2(content).trim();
  if (!text2) throw new Error(`${label} \uBAA8\uB378 \uC751\uB2F5\uC774 \uBE44\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.`);
  try {
    return JSON.parse(text2);
  } catch (error) {
    throw new Error(`${label} \uBAA8\uB378 \uC751\uB2F5\uC744 JSON\uC73C\uB85C \uD574\uC11D\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4: ${error instanceof Error ? error.message : "\uC54C \uC218 \uC5C6\uB294 \uD615\uC2DD"}`);
  }
}
function isRecoverableFormatError(error) {
  const message = error instanceof Error ? error.message : "";
  return message.includes("\uBAA8\uB378 \uC751\uB2F5\uC774 \uBE44\uC5B4") || message.includes("JSON\uC73C\uB85C \uD574\uC11D\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4") || message.includes("Unexpected end") || message.includes("Unterminated string");
}
var pause2 = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function selectGovernanceModel() {
  const catalog = await listLLMModels();
  const ids = catalog.data.map((item) => item.id);
  return ids.find((id) => id === "gpt-5-mini") ?? ids.find((id) => id.startsWith("gpt-5")) ?? ids[0] ?? "";
}
function buildCycleSource(report) {
  const evidence = report.evidenceJson;
  const deliberation = report.deliberationJson;
  const rawReviews = Array.isArray(report.memberReviewsJson) ? report.memberReviewsJson : [];
  const reviews = rawReviews.flatMap((review) => {
    if (!review || typeof review !== "object") return [];
    const item = review;
    return [{
      roleId: typeof item.roleId === "string" ? item.roleId : "unknown",
      roleTitle: typeof item.roleTitle === "string" ? item.roleTitle : "\uC704\uC6D0",
      stance: typeof item.stance === "string" ? item.stance : "insufficient_evidence",
      summary: typeof item.summary === "string" ? item.summary : "\uC694\uC57D \uC5C6\uC74C",
      challengePoints: Array.isArray(item.challengePoints) ? item.challengePoints.filter((value) => typeof value === "string").slice(0, 2) : [],
      requiredValidation: Array.isArray(item.requiredValidation) ? item.requiredValidation.filter((value) => typeof value === "string").slice(0, 2) : []
    }];
  });
  if (!evidence?.provenance || !deliberation) throw new Error("\uC644\uB8CC\uB41C \uC2E4\uC81C \uB370\uC774\uD130 \uC5F0\uAD6C\uC704\uC6D0\uD68C \uBCF4\uACE0\uC11C\uB9CC \uC790\uC728 \uAC1C\uC120 \uC0AC\uC774\uD074\uC5D0 \uC0AC\uC6A9\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
  if (evidence.provenance.evidenceType !== "stored_kiwoom_adjusted_daily_bars_only") throw new Error("\uC2E4\uC81C \uC800\uC7A5 \uC77C\uBD09 \uADFC\uAC70\uAC00 \uC544\uB2CC \uC704\uC6D0\uD68C \uBCF4\uACE0\uC11C\uB294 \uC790\uC728 \uAC1C\uC120\uC5D0 \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
  return { committeeReportId: report.id, runId: report.runId, evidenceFingerprint: report.evidenceFingerprint, provenance: evidence.provenance, assumptions: evidence.assumptions ?? {}, deliberation, memberReviews: reviews };
}
async function requestManagerDirective(model, source, followUps) {
  const phase = followUps ? "\uD300\uC7A5 \uD6C4\uC18D \uAC80\uD1A0\uB97C \uBC18\uC601\uD55C \uCD5C\uC885 \uC9C0\uC2DC" : "\uCD08\uAE30 \uAC1C\uC120 \uC9C0\uC2DC";
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await invokeLLM({
        model,
        maxTokens: 3600,
        messages: [
          { role: "system", content: "\uB2F9\uC2E0\uC740 \uC2E4\uC81C \uB370\uC774\uD130 \uC870\uAC74\uC2DD \uAC80\uC99D \uC11C\uBE44\uC2A4\uC758 \uBD80\uC7A5 AI\uC785\uB2C8\uB2E4. \uC800\uC7A5\uB41C \uC2E4\uC81C \uC77C\uBD09 \uADFC\uAC70\uC640 \uC704\uC6D0\uD68C \uAE30\uB85D\uB9CC \uC0AC\uC6A9\uD558\uC2ED\uC2DC\uC624. \uCF54\uB4DC \uBCC0\uACBD, \uC8FC\uBB38 \uC2E4\uD589, \uC885\uBAA9\xB7\uB9E4\uC218\xB7\uB9E4\uB3C4 \uCD94\uCC9C\uC744 \uC9C0\uC2DC\uD558\uC9C0 \uB9C8\uC2ED\uC2DC\uC624. \uC624\uC9C1 \uC7AC\uD604 \uAC00\uB2A5\uD55C \uC5F0\uAD6C \uACFC\uC81C\xB7\uAC80\uC99D \uC6B0\uC120\uC21C\uC704\xB7\uC218\uC6A9 \uAE30\uC900\xB7\uC911\uB2E8 \uAE30\uC900\uC744 \uC815\uD569\uB2C8\uB2E4. \uBD88\uCDA9\uBD84\uD55C \uADFC\uAC70\uC5D0\uC11C\uB294 \uC2E4\uC804 \uC2B9\uACA9\uC744 \uCC28\uB2E8\uD558\uACE0, \uAC01 \uBC30\uC5F4\uC740 \uD575\uC2EC 3\uAC1C \uC774\uB0B4\uC758 \uD55C\uAD6D\uC5B4 JSON\uC73C\uB85C \uBC18\uD658\uD558\uC2ED\uC2DC\uC624." },
          { role: "user", content: `${phase}

SOURCE JSON:
${JSON.stringify(source)}

LEADER FOLLOW-UPS:
${JSON.stringify(followUps ?? [])}` }
        ],
        outputSchema: managerDirectiveSchema
      });
      return parseJson(response.choices[0]?.message.content ?? "", "\uBD80\uC7A5 AI");
    } catch (error) {
      lastError = error;
      if (!isRecoverableFormatError(error) || attempt === 1) break;
      await pause2(700);
    }
  }
  throw lastError;
}
async function requestLeaderFollowUp(role, model, source, directive) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await invokeLLM({
        model,
        maxTokens: 2600,
        messages: [
          { role: "system", content: "\uB2F9\uC2E0\uC740 \uC2E4\uC81C \uB370\uC774\uD130 \uC870\uAC74\uC2DD \uAC80\uC99D \uC11C\uBE44\uC2A4\uC758 \uC804\uBB38 \uD300\uC7A5 AI\uC785\uB2C8\uB2E4. \uC785\uB825\uB41C \uC2E4\uC81C \uB370\uC774\uD130 \uADFC\uAC70\uC640 \uBD80\uC7A5 \uC9C0\uC2DC\uB9CC \uAC80\uD1A0\uD558\uC2ED\uC2DC\uC624. \uC2DC\uC7A5 \uB370\uC774\uD130\xB7\uC131\uACFC\xB7\uC6D0\uC778\uC744 \uB9CC\uB4E4\uC5B4 \uB0B4\uC9C0 \uB9D0\uACE0, \uC8FC\uBB38\xB7\uC885\uBAA9\xB7\uB9E4\uC218\xB7\uB9E4\uB3C4 \uCD94\uCC9C\uC744 \uD558\uC9C0 \uB9C8\uC2ED\uC2DC\uC624. \uC218\uC6A9 \uAE30\uC900\uC774 \uC7AC\uD604 \uAC00\uB2A5\uD558\uC9C0 \uC54A\uAC70\uB098 \uADFC\uAC70\uAC00 \uBD80\uC871\uD558\uBA74 \uC911\uB2E8 \uC870\uAC74\uACFC \uBC18\uBC15\uC744 \uB0A8\uAE30\uC2ED\uC2DC\uC624. \uAC01 \uBC30\uC5F4\uC740 \uD575\uC2EC 3\uAC1C \uC774\uB0B4\uC758 \uC9E7\uC740 \uD55C\uAD6D\uC5B4 JSON\uC73C\uB85C \uBC18\uD658\uD558\uC2ED\uC2DC\uC624." },
          { role: "user", content: `\uD300\uC7A5 \uC5ED\uD560: ${role.title}
\uCC45\uC784: ${role.mandate}

SOURCE JSON:
${JSON.stringify(source)}

MANAGER DIRECTIVE:
${JSON.stringify(directive)}` }
        ],
        outputSchema: leaderFollowUpSchema
      });
      const parsed = parseJson(response.choices[0]?.message.content ?? "", role.title);
      return { ...parsed, roleId: role.id, roleTitle: role.title };
    } catch (error) {
      lastError = error;
      if (!isRecoverableFormatError(error) || attempt === 1) break;
      await pause2(700);
    }
  }
  throw lastError;
}
async function getLatestResearchGovernanceCycle() {
  const db = await getDb();
  if (!db) return null;
  const cycle = (await db.select().from(researchGovernanceCycles).orderBy(desc13(researchGovernanceCycles.updatedAt)).limit(1))[0] ?? null;
  if (cycle?.status === "completed") {
    const priorities = revalidationPriorities(cycle.managerDirectiveJson);
    if (priorities.length) await materializeResearchRevalidationJobs({ governanceCycleId: cycle.id, sourceRunId: cycle.runId, evidenceFingerprint: cycle.evidenceFingerprint, priorities });
  }
  return cycle;
}
async function prepareGovernanceCycle() {
  const db = await getDb();
  if (!db) throw new Error("\uC5F0\uAD6C \uB370\uC774\uD130\uBCA0\uC774\uC2A4\uC5D0 \uC5F0\uACB0\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
  const report = (await db.select().from(researchCommitteeReports).where(eq17(researchCommitteeReports.status, "completed")).orderBy(desc13(researchCommitteeReports.updatedAt)).limit(1))[0];
  if (!report) return { skipped: "completed-committee-report-not-found" };
  const source = buildCycleSource(report);
  const cycleFingerprint = createHash4("sha256").update(JSON.stringify({ policy: RESEARCH_GOVERNANCE_POLICY_VERSION, reportId: report.id, evidenceFingerprint: source.evidenceFingerprint })).digest("hex");
  const existing = (await db.select().from(researchGovernanceCycles).where(eq17(researchGovernanceCycles.cycleFingerprint, cycleFingerprint)).limit(1))[0];
  if (existing?.status === "completed" || existing?.status === "running") return { cycle: existing, reused: true };
  const model = await selectGovernanceModel();
  if (!model) throw new Error("\uC790\uC728 \uC5F0\uAD6C \uAC70\uBC84\uB10C\uC2A4\uC5D0 \uC0AC\uC6A9\uD560 \uBAA8\uB378\uC744 \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
  let cycleId;
  if (existing) {
    cycleId = existing.id;
    await db.update(researchGovernanceCycles).set({ status: "running", managerModel: model, sourceSummaryJson: source, managerDirectiveJson: null, leaderFollowUpsJson: null, lastError: null, startedAt: /* @__PURE__ */ new Date(), completedAt: null }).where(eq17(researchGovernanceCycles.id, cycleId));
  } else {
    const inserted = await db.insert(researchGovernanceCycles).values({ runId: source.runId, committeeReportId: report.id, evidenceFingerprint: source.evidenceFingerprint, cycleFingerprint, policyVersion: RESEARCH_GOVERNANCE_POLICY_VERSION, managerModel: model, sourceSummaryJson: source }).returning({ id: researchGovernanceCycles.id });
    cycleId = inserted[0].id;
  }
  const cycle = (await db.select().from(researchGovernanceCycles).where(eq17(researchGovernanceCycles.id, cycleId)).limit(1))[0];
  if (!cycle) throw new Error("\uC790\uC728 \uAC1C\uC120 \uC2E4\uD589 \uAE30\uB85D\uC744 \uB9CC\uB4E4\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
  return { cycle, reused: false, job: { db, cycleId, model, source } };
}
async function completeGovernanceCycle(job) {
  try {
    const initial = await requestManagerDirective(job.model, job.source);
    const relevantRoles = RESEARCH_COMMITTEE_ROLES.filter((role) => initial.priorities.some((priority) => priority.ownerRole === role.id));
    const roles = relevantRoles.length ? relevantRoles : RESEARCH_COMMITTEE_ROLES;
    const followUps = [];
    for (let index2 = 0; index2 < roles.length; index2 += 2) followUps.push(...await Promise.all(roles.slice(index2, index2 + 2).map((role) => requestLeaderFollowUp(role, job.model, job.source, initial))));
    const final = await requestManagerDirective(job.model, job.source, followUps);
    await job.db.update(researchGovernanceCycles).set({ status: "completed", managerDirectiveJson: { initial, final }, leaderFollowUpsJson: followUps, completedAt: /* @__PURE__ */ new Date(), lastError: null }).where(eq17(researchGovernanceCycles.id, job.cycleId));
    await materializeResearchRevalidationJobs({ governanceCycleId: job.cycleId, sourceRunId: job.source.runId, evidenceFingerprint: job.source.evidenceFingerprint, priorities: final.priorities });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "\uC790\uC728 \uC5F0\uAD6C \uAC70\uBC84\uB10C\uC2A4 \uC0AC\uC774\uD074\uC744 \uC644\uB8CC\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.";
    await job.db.update(researchGovernanceCycles).set({ status: "failed", lastError: message, completedAt: /* @__PURE__ */ new Date() }).where(eq17(researchGovernanceCycles.id, job.cycleId));
  }
}
async function runResearchGovernanceCycle() {
  const prepared = await prepareGovernanceCycle();
  if ("skipped" in prepared) return prepared;
  if (prepared.reused || !("job" in prepared) || !prepared.job) return { cycle: prepared.cycle, reused: true };
  if (inFlightGovernanceCycles.has(prepared.cycle.id)) return { cycle: prepared.cycle, reused: true };
  const task = completeGovernanceCycle(prepared.job).finally(() => inFlightGovernanceCycles.delete(prepared.cycle.id));
  inFlightGovernanceCycles.set(prepared.cycle.id, task);
  return { cycle: prepared.cycle, reused: false };
}

// server/quant/autonomousOperations.ts
import { desc as desc14, eq as eq18, like as like3 } from "drizzle-orm";
function prioritiesFromCycle(cycle) {
  const directive = cycle?.managerDirectiveJson;
  const priorities = directive?.final?.priorities;
  if (!Array.isArray(priorities)) return [];
  return priorities.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const value = item;
    if (typeof value.id !== "string" || typeof value.title !== "string" || typeof value.acceptanceCriteria !== "string") return [];
    const action = value.action === "block_promotion" || value.action === "observe_only" ? value.action : "queue_research";
    const classification = classifyResearchPriority({ id: value.id, ownerRole: typeof value.ownerRole === "string" ? value.ownerRole : "research_manager", title: value.title, rationale: typeof value.rationale === "string" ? value.rationale : "\uC2E4\uC81C \uB370\uC774\uD130 \uAE30\uBC18 \uAC80\uC99D \uACFC\uC81C", acceptanceCriteria: value.acceptanceCriteria, action });
    return [{
      id: value.id,
      ownerRole: typeof value.ownerRole === "string" ? value.ownerRole : "research_manager",
      title: value.title,
      rationale: typeof value.rationale === "string" ? value.rationale : "\uC2E4\uC81C \uB370\uC774\uD130 \uAE30\uBC18 \uAC80\uC99D \uACFC\uC81C",
      acceptanceCriteria: value.acceptanceCriteria,
      action,
      readiness: classification.readiness,
      blocker: classification.blocker
    }];
  });
}
function safeErrorMessage(error) {
  return error instanceof Error && error.message ? error.message.slice(0, 240) : "\uC54C \uC218 \uC5C6\uB294 \uB370\uC774\uD130\uBCA0\uC774\uC2A4 \uC870\uD68C \uC624\uB958";
}
async function getAutonomousOperationsStatus() {
  const db = await getDb();
  if (!db) return { status: "database_unavailable", evidence: null, queue: [], boundaries: ["\uC5F0\uAD6C \uB370\uC774\uD130\uBCA0\uC774\uC2A4\uC5D0 \uC5F0\uACB0\uD560 \uC218 \uC5C6\uC5B4 \uC790\uB3D9 \uAC1C\uC120\uC744 \uC2DC\uC791\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4."] };
  const [latestRuns, historicalLookup, latestCommittee, latestCycle, schedule, revalidationRows] = await Promise.all([
    db.select().from(autonomousResearchRuns).orderBy(desc14(autonomousResearchRuns.updatedAt)).limit(12),
    db.select().from(autonomousResearchRuns).where(like3(autonomousResearchRuns.runKey, "%:historical%")).orderBy(desc14(autonomousResearchRuns.updatedAt)).limit(1).then((rows) => ({ rows, unavailable: false, error: null })).catch((error) => {
      const message = safeErrorMessage(error);
      console.warn("[AutonomousOperations] Historical research lookup failed; preserving the remaining dashboard status.", message);
      return { rows: [], unavailable: true, error: message };
    }),
    db.select().from(researchCommitteeReports).where(eq18(researchCommitteeReports.status, "completed")).orderBy(desc14(researchCommitteeReports.updatedAt)).limit(1),
    db.select().from(researchGovernanceCycles).orderBy(desc14(researchGovernanceCycles.updatedAt)).limit(1),
    db.select().from(researchGovernanceSchedules).orderBy(desc14(researchGovernanceSchedules.updatedAt)).limit(1),
    db.select().from(researchRevalidationJobs).orderBy(desc14(researchRevalidationJobs.updatedAt)).limit(12)
  ]);
  const activeRun = latestRuns.find((run) => !run.runKey.includes(":historical")) ?? null;
  const historicalRun = historicalLookup.rows[0] ?? null;
  const committee = latestCommittee[0] ?? null;
  const cycle = latestCycle[0] ?? null;
  const governanceSchedule = schedule[0] ?? null;
  const queue = prioritiesFromCycle(cycle);
  const blocked = queue.filter((item) => item.action === "block_promotion");
  const revalidations = cycle ? revalidationRows.filter((item) => item.governanceCycleId === cycle.id).map((item) => ({ id: item.id, priorityId: item.priorityId, priorityTitle: item.priorityTitle, scope: item.scope, status: item.status, blocker: item.blocker, lastError: item.lastError, updatedAt: item.updatedAt, resultJson: item.resultJson })) : [];
  const historicalLookupUnavailable = historicalLookup.unavailable;
  const needsFreshData = !historicalRun && !historicalLookupUnavailable;
  const internalRevalidationRunning = revalidations.some((item) => item.scope === "stored_daily_bars" && (item.status === "queued" || item.status === "running"));
  const internalRevalidationCompleted = revalidations.some((item) => item.scope === "stored_daily_bars" && item.status === "completed");
  const externalRevalidationBlocked = revalidations.some((item) => item.scope === "external_verification" && item.status === "blocked");
  const status = historicalLookupUnavailable ? "historical_lookup_unavailable" : needsFreshData ? "waiting_for_real_data" : !committee ? "awaiting_committee_review" : !cycle || cycle.status === "failed" ? "awaiting_governance_review" : internalRevalidationRunning ? "internal_revalidation_running" : blocked.length || externalRevalidationBlocked ? "validation_required" : internalRevalidationCompleted ? "internal_revalidation_completed" : "research_cycle_ready";
  const nextAction = historicalLookupUnavailable ? { kind: "retry_historical_lookup", automatic: true, title: "\uC800\uC7A5 \uC2E4\uC81C \uC77C\uBD09 \uC5F0\uAD6C \uC0C1\uD0DC\uB97C \uB2E4\uC2DC \uD655\uC778\uD569\uB2C8\uB2E4.", reason: "\uACFC\uAC70 \uC5F0\uAD6C \uC2E4\uD589 \uC870\uD68C\uAC00 \uC77C\uC2DC\uC801\uC73C\uB85C \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4. \uC800\uC7A5 \uC6D0\uBCF8\xB7\uC8FC\uBB38\xB7\uACC4\uC88C\xB7\uC678\uBD80 API \uD638\uCD9C \uC5C6\uC774 \uB2E4\uC74C \uC0C8\uB85C\uACE0\uCE68\uC5D0\uC11C \uC870\uD68C\uB97C \uB2E4\uC2DC \uC2DC\uB3C4\uD569\uB2C8\uB2E4." } : needsFreshData ? { kind: "collect_real_daily_bars", automatic: false, title: "\uC778\uC99D\uB41C \uC77D\uAE30 \uC804\uC6A9 \uC5F0\uAD6C \uB178\uB4DC\uC758 \uC2E4\uC81C \uC77C\uBD09 \uC6D0\uBCF8\uC744 \uAE30\uB2E4\uB9BD\uB2C8\uB2E4.", reason: `\uC0AC\uC6A9\uC790 \uC694\uCCAD \uC804 \uC678\uBD80 \uB370\uC774\uD130 \uAC80\uC99D\uC740 \uBCF4\uB958\uD569\uB2C8\uB2E4. ${activeRun?.lastError ?? "\uC2E0\uADDC \uC2E4\uC81C \uB370\uC774\uD130\uAC00 \uC544\uC9C1 \uC800\uC7A5\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4."}` } : internalRevalidationRunning ? { kind: "stored_daily_bar_revalidation", automatic: true, title: "\uC800\uC7A5\uB41C \uC2E4\uC81C \uC77C\uBD09\uC73C\uB85C \uBD80\uC7A5 AI \uC5F0\uAD6C \uACFC\uC81C\uB97C \uC7AC\uD3C9\uAC00\uD569\uB2C8\uB2E4.", reason: "\uAC19\uC740 \uC6D0\uBCF8\xB7\uBE44\uC6A9\xB7\uC815\uBCF4\uC808\uB2E8 \uAC00\uC815\uC5D0\uC11C\uB9CC \uC9D1\uACC4\uD558\uBA70 \uC678\uBD80 \uB370\uC774\uD130\xB7\uC8FC\uBB38\xB7\uC885\uBAA9 \uCD94\uCC9C\uC744 \uD638\uCD9C\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4." } : queue[0] ? { kind: queue[0].action, automatic: queue[0].action === "queue_research" && queue[0].readiness === "ready_for_internal_revalidation", title: queue[0].title, reason: queue[0].blocker ?? queue[0].acceptanceCriteria } : { kind: "observe_only", automatic: true, title: "\uB3D9\uC77C \uADFC\uAC70\uC758 \uC911\uBCF5 \uAC80\uD1A0\uB97C \uD53C\uD558\uACE0 \uB2E4\uC74C \uC2E4\uC81C \uB370\uC774\uD130\uC14B\uC744 \uAE30\uB2E4\uB9BD\uB2C8\uB2E4.", reason: "\uC644\uB8CC\uB41C \uC5F0\uAD6C \uADFC\uAC70 \uC9C0\uBB38\uC740 \uC7AC\uC0AC\uC6A9\uB429\uB2C8\uB2E4." };
  return {
    status,
    evidence: {
      activeRun: activeRun ? { id: activeRun.id, runKey: activeRun.runKey, phase: activeRun.phase, dataStatus: activeRun.dataStatus, updatedAt: activeRun.updatedAt, lastError: activeRun.lastError } : null,
      historicalRun: historicalRun ? { id: historicalRun.id, runKey: historicalRun.runKey, dataStatus: historicalRun.dataStatus, updatedAt: historicalRun.updatedAt } : null,
      committee: committee ? { id: committee.id, status: committee.status, evidenceFingerprint: committee.evidenceFingerprint, updatedAt: committee.updatedAt } : null,
      governance: cycle ? { id: cycle.id, status: cycle.status, cycleFingerprint: cycle.cycleFingerprint, updatedAt: cycle.updatedAt } : null,
      schedule: governanceSchedule ? { enabled: governanceSchedule.isEnabled, cronExpression: governanceSchedule.cronExpression, lastRequestedAt: governanceSchedule.lastRequestedAt } : null
    },
    queue,
    revalidations,
    nextAction,
    externalVerification: {
      mode: "user_requested_only",
      enabled: false,
      reason: "\uD0A4\uC6C0 OAuth\xB7\uC77C\uBD09 \uC218\uC9D1\xB7\uC678\uBD80 \uC5F0\uAD6C \uB178\uB4DC\xB7\uACF5\uAC1C \uBC30\uD3EC \uC2E4\uB370\uC774\uD130 \uAC80\uC99D\uC740 \uC0AC\uC6A9\uC790\uAC00 \uBA85\uC2DC\uC801\uC73C\uB85C \uC694\uCCAD\uD560 \uB54C\uB9CC \uC2E4\uD589\uD569\uB2C8\uB2E4."
    },
    promotion: { permitted: false, reason: "\uC790\uC728 \uC6B4\uC601\uC740 \uC2E4\uC81C \uB370\uC774\uD130 \uC5F0\uAD6C\uC640 \uAC80\uC99D \uACFC\uC81C\uB9CC \uC790\uB3D9\uD654\uD558\uBA70, \uC8FC\uBB38\xB7\uC885\uBAA9 \uCD94\uCC9C\xB7\uC2E4\uC804 \uC2B9\uACA9\uC744 \uC790\uB3D9\uC73C\uB85C \uC218\uD589\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4." },
    boundaries: [
      ...historicalLookupUnavailable ? ["\uACFC\uAC70 \uC5F0\uAD6C \uC2E4\uD589 \uC870\uD68C\uAC00 \uC77C\uC2DC\uC801\uC73C\uB85C \uC2E4\uD328\uD588\uC73C\uB098 \uB098\uBA38\uC9C0 \uC790\uB3D9 \uC6B4\uC601 \uC0C1\uD0DC\uB294 \uD45C\uC2DC\uD569\uB2C8\uB2E4."] : [],
      "\uC608\uC2DC\xB7\uAC00\uC0C1 \uC2DC\uC7A5 \uB370\uC774\uD130\uB294 \uC790\uB3D9 \uC5F0\uAD6C \uC785\uB825\uC73C\uB85C \uC0AC\uC6A9\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.",
      "\uC2E4\uC81C \uB370\uC774\uD130 \uB3C4\uCC29 \uC804\uC5D0\uB294 \uC218\uC9D1\xB7\uC870\uAC74\uC2DD \uD3C9\uAC00\uB97C \uB9CC\uB4E4\uC9C0 \uC54A\uACE0 \uC5F0\uACB0 \uB300\uAE30 \uC0C1\uD0DC\uB97C \uC720\uC9C0\uD569\uB2C8\uB2E4.",
      "\uB3D9\uC77C \uC6D0\uBCF8 \uC9C0\uBB38\uC740 \uC911\uBCF5 \uC704\uC6D0\uD68C\xB7\uAC70\uBC84\uB10C\uC2A4 \uC2E4\uD589\uC744 \uCC28\uB2E8\uD569\uB2C8\uB2E4.",
      "\uBE44\uBC00\uAC12 \uBCC0\uACBD, \uC678\uBD80 \uCEF4\uD4E8\uD130 \uAD8C\uD55C \uBCC0\uACBD, \uC8FC\uBB38\xB7\uACC4\uC88C\xB7\uD3EC\uC9C0\uC158 API \uD638\uCD9C\uC740 \uC790\uC728 \uC2E4\uD589 \uBC94\uC704\uC5D0\uC11C \uC81C\uC678\uD569\uB2C8\uB2E4."
    ]
  };
}

// server/quant/dayTradeHistory.ts
import { createHash as createHash5 } from "node:crypto";
import { desc as desc15, eq as eq19 } from "drizzle-orm";

// shared/dayTradePortfolio.ts
var DAY_TRADE_TOTAL_CAPITAL = 1e7;
var DAY_TRADE_FEE_RATE = 3e-3;
function calculateDayTradePortfolio(positions, totalCapital = DAY_TRADE_TOTAL_CAPITAL, feeRate = DAY_TRADE_FEE_RATE) {
  const eligible = positions.filter((position) => Number.isFinite(position.entryPrice) && position.entryPrice > 0);
  const allocation = eligible.length ? Math.floor(totalCapital / eligible.length) : 0;
  const ledgers = eligible.map((position) => {
    const quantity = Math.floor(allocation / (position.entryPrice * (1 + feeRate)));
    const buyAmount = quantity * position.entryPrice;
    const buyFee = Math.round(buyAmount * feeRate);
    const cashReserve = allocation - buyAmount - buyFee;
    const hasLivePrice = Number.isFinite(position.currentPrice) && (position.currentPrice ?? 0) > 0;
    const evaluationPrice = hasLivePrice ? Math.round(position.currentPrice) : position.entryPrice;
    const estimatedExitFee = Math.round(evaluationPrice * quantity * feeRate);
    const netValue2 = cashReserve + evaluationPrice * quantity - estimatedExitFee;
    const netPnl = netValue2 - allocation;
    return { ...position, allocation, quantity, buyAmount, buyFee, cashReserve, evaluationPrice, estimatedExitFee, netValue: netValue2, netPnl, netReturnPercent: allocation ? netPnl / allocation * 100 : 0, hasLivePrice };
  });
  const unallocatedCash = totalCapital - allocation * eligible.length;
  const netValue = unallocatedCash + ledgers.reduce((sum, position) => sum + position.netValue, 0);
  return { totalCapital, feeRate, allocationPerPosition: allocation, unallocatedCash, positions: ledgers, netValue, netPnl: netValue - totalCapital, netReturnPercent: totalCapital ? (netValue - totalCapital) / totalCapital * 100 : 0 };
}

// server/quant/dayTradeHistory.ts
function extractEntries(candidate) {
  const simulation = candidate.simulationJson;
  return simulation?.entries ?? [];
}
function selectUniquePositions(candidates) {
  const bySymbol = /* @__PURE__ */ new Map();
  let signalCount = 0;
  candidates.forEach((candidate) => extractEntries(candidate).forEach((entry) => {
    signalCount += 1;
    const previous = bySymbol.get(entry.symbol);
    if (!previous || Number(candidate.fitnessScore ?? -Infinity) > Number(previous.candidate.fitnessScore ?? -Infinity)) bySymbol.set(entry.symbol, { candidate, entry, signalCount: (previous?.signalCount ?? 0) + 1 });
    else previous.signalCount += 1;
  }));
  return { selected: Array.from(bySymbol.values()), signalCount };
}
async function persistDayTradeExperiment(input) {
  const db = await getDb();
  if (!db) throw new Error("\uB370\uC774\uD2B8\uB808\uC774\uB4DC \uC2E4\uD5D8 \uC774\uB825 \uB370\uC774\uD130\uBCA0\uC774\uC2A4\uB97C \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
  const { selected, signalCount } = selectUniquePositions(input.candidates);
  const portfolio = calculateDayTradePortfolio(selected.map(({ candidate, entry }) => ({ id: `${candidate.id}:${entry.symbol}`, entryPrice: entry.entryPrice, currentPrice: entry.exitPrice ?? entry.lastPrice })));
  const sourceFingerprint = createHash5("sha256").update(JSON.stringify({ runId: input.run.id, tradingDate: input.run.tradingDate, entries: selected.map(({ candidate, entry, signalCount: count3 }) => [candidate.fingerprint, entry.symbol, entry.entryPrice, entry.lastPrice, entry.exitPrice, count3]) })).digest("hex");
  let experiment = (await db.select().from(dayTradeExperiments).where(eq19(dayTradeExperiments.runId, input.run.id)).limit(1))[0];
  const summary = { runId: input.run.id, tradingDate: input.run.tradingDate, policyVersion: input.run.policyVersion, status: input.isClosing ? "closed" : "tracking", totalCapital: DAY_TRADE_TOTAL_CAPITAL, buyFeeRate: String(DAY_TRADE_FEE_RATE), sellFeeRate: String(DAY_TRADE_FEE_RATE), signalCount, selectedPositionCount: portfolio.positions.length, netValue: Math.round(portfolio.netValue), netPnl: Math.round(portfolio.netPnl), netReturnPercent: portfolio.netReturnPercent.toFixed(4), sourceFingerprint, closedAt: input.isClosing ? /* @__PURE__ */ new Date() : null };
  if (!experiment) {
    await db.insert(dayTradeExperiments).values(summary);
    experiment = (await db.select().from(dayTradeExperiments).where(eq19(dayTradeExperiments.runId, input.run.id)).limit(1))[0];
  } else {
    await db.update(dayTradeExperiments).set(summary).where(eq19(dayTradeExperiments.id, experiment.id));
  }
  if (!experiment) throw new Error("\uB370\uC774\uD2B8\uB808\uC774\uB4DC \uC2E4\uD5D8 \uC774\uB825 \uC0DD\uC131\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.");
  const selectedById = new Map(selected.map((item) => [`${item.candidate.id}:${item.entry.symbol}`, item]));
  for (const ledger of portfolio.positions) {
    const item = selectedById.get(ledger.id);
    const closed = Boolean(item.entry.exitPrice);
    const status = ledger.quantity === 0 ? "cash_only" : closed ? "closed" : "tracking";
    const values = { experimentId: experiment.id, candidateId: item.candidate.id, candidateFingerprint: item.candidate.fingerprint, symbol: item.entry.symbol, name: item.entry.name, signalCount: item.signalCount, quantity: ledger.quantity, allocation: ledger.allocation, entryPrice: item.entry.entryPrice, entryAt: new Date(item.entry.entryAt), lastPrice: item.entry.lastPrice ?? null, lastObservedAt: item.entry.lastObservedAt ? new Date(item.entry.lastObservedAt) : null, exitPrice: item.entry.exitPrice ?? null, exitAt: item.entry.exitAt ? new Date(item.entry.exitAt) : null, buyFee: ledger.buyFee, estimatedExitFee: ledger.estimatedExitFee, netValue: Math.round(ledger.netValue), netPnl: Math.round(ledger.netPnl), netReturnPercent: ledger.netReturnPercent.toFixed(4), status, evidenceJson: { entryEvidence: item.entry.evidence, rootGenome: item.candidate.rootGenomeJson, historicalValidation: { inSample: item.candidate.inSampleMetricsJson, outOfSample: item.candidate.outOfSampleMetricsJson, walkForward: item.candidate.walkForwardMetricsJson, fitnessScore: item.candidate.fitnessScore } } };
    await db.insert(dayTradeExperimentPositions).values(values).onConflictDoUpdate({
      target: dayTradeExperimentPositions.candidateId,
      set: { signalCount: values.signalCount, quantity: values.quantity, allocation: values.allocation, lastPrice: values.lastPrice, lastObservedAt: values.lastObservedAt, exitPrice: values.exitPrice, exitAt: values.exitAt, buyFee: values.buyFee, estimatedExitFee: values.estimatedExitFee, netValue: values.netValue, netPnl: values.netPnl, netReturnPercent: values.netReturnPercent, status: values.status, evidenceJson: values.evidenceJson }
    });
  }
  return { experimentId: experiment.id, signalCount, selectedPositionCount: portfolio.positions.length, netValue: portfolio.netValue, netPnl: portfolio.netPnl, netReturnPercent: portfolio.netReturnPercent };
}
async function syncDayTradeExperimentForRun(runId) {
  const db = await getDb();
  if (!db) throw new Error("\uB370\uC774\uD2B8\uB808\uC774\uB4DC \uC2E4\uD5D8 \uC774\uB825 \uB370\uC774\uD130\uBCA0\uC774\uC2A4\uB97C \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
  const run = (await db.select().from(autonomousResearchRuns).where(eq19(autonomousResearchRuns.id, runId)).limit(1))[0];
  if (!run) throw new Error("\uC800\uC7A5\uD560 \uC790\uB3D9 \uC5F0\uAD6C \uC2E4\uD589\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
  const candidates = await db.select().from(autonomousResearchCandidates).where(eq19(autonomousResearchCandidates.runId, run.id));
  return persistDayTradeExperiment({ run, candidates: candidates.filter((candidate) => candidate.status === "survived"), isClosing: run.phase === "closing" || run.phase === "completed" });
}
async function getDayTradeHistory() {
  const db = await getDb();
  if (!db) return { experiments: [], positions: [], conditionStats: [], latestSyncEvent: null };
  const experiments = await db.select().from(dayTradeExperiments).orderBy(dayTradeExperiments.tradingDate).limit(60);
  const positions = experiments.length ? await db.select().from(dayTradeExperimentPositions).where(eq19(dayTradeExperimentPositions.experimentId, experiments[experiments.length - 1].id)).orderBy(dayTradeExperimentPositions.netPnl) : [];
  const allPositions = experiments.length ? await db.select().from(dayTradeExperimentPositions).limit(5e3) : [];
  const latestSyncEvent = (await db.select().from(localResearchNodeSyncEvents).orderBy(desc15(localResearchNodeSyncEvents.createdAt)).limit(1))[0] ?? null;
  const grouped = /* @__PURE__ */ new Map();
  allPositions.forEach((position) => {
    const stats = grouped.get(position.candidateFingerprint) ?? { candidateFingerprint: position.candidateFingerprint, days: /* @__PURE__ */ new Set(), positions: 0, wins: 0, grossProfit: 0, grossLoss: 0, netPnl: 0, latestNetPnl: 0, latestReturnPercent: 0 };
    const pnl = Number(position.netPnl);
    stats.days.add(position.experimentId);
    stats.positions += 1;
    stats.netPnl += pnl;
    stats.latestNetPnl = pnl;
    stats.latestReturnPercent = Number(position.netReturnPercent);
    if (pnl > 0) {
      stats.wins += 1;
      stats.grossProfit += pnl;
    } else if (pnl < 0) stats.grossLoss += Math.abs(pnl);
    grouped.set(position.candidateFingerprint, stats);
  });
  const conditionStats = Array.from(grouped.values()).map((stats) => ({ candidateFingerprint: stats.candidateFingerprint, experimentDays: stats.days.size, positions: stats.positions, winRate: stats.positions ? stats.wins / stats.positions * 100 : 0, netPnl: stats.netPnl, profitFactor: stats.grossLoss ? stats.grossProfit / stats.grossLoss : stats.grossProfit > 0 ? null : 0, latestNetPnl: stats.latestNetPnl, latestReturnPercent: stats.latestReturnPercent })).sort((a, b) => b.netPnl - a.netPnl || b.experimentDays - a.experimentDays);
  return { experiments: [...experiments].reverse(), positions, conditionStats, latestSyncEvent };
}

// server/quant/minuteValidationHistory.ts
import { and as and12, asc as asc3, desc as desc16, eq as eq20, inArray } from "drizzle-orm";

// server/quant/minuteValidation.ts
function toConditionBars(bars) {
  return bars.map((bar) => ({ date: bar.minuteAt.toISOString(), open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume, turnover: Math.round(bar.close * bar.volume) }));
}
function requirePositiveInteger(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
function evaluateMinuteExpression(input) {
  const policy = {
    stopLossPercent: input.policy?.stopLossPercent ?? 2,
    takeProfitPercent: input.policy?.takeProfitPercent ?? 4,
    maxHoldingBars: requirePositiveInteger(input.policy?.maxHoldingBars ?? 30, 30),
    feeRate: input.policy?.feeRate ?? 3e-3,
    slippageBps: Math.max(0, input.policy?.slippageBps ?? 0),
    quantity: requirePositiveInteger(input.policy?.quantity ?? 1, 1)
  };
  const bars = [...input.bars].sort((left, right) => left.minuteAt.getTime() - right.minuteAt.getTime());
  const conditionBars2 = toConditionBars(bars);
  const trades = [];
  let nextSignalIndex = 0;
  for (let signalIndex = 0; signalIndex < bars.length - 1; signalIndex += 1) {
    if (signalIndex < nextSignalIndex) continue;
    const evaluation = evaluateExpression(input.expression, conditionBars2.slice(0, signalIndex + 1));
    if (!evaluation.eligible || evaluation.score < (input.minimumScore ?? 0)) continue;
    const signalBar = bars[signalIndex];
    const entryBar = bars[signalIndex + 1];
    const entryPrice = entryBar.open * (1 + policy.slippageBps / 1e4);
    const stopPrice = entryPrice * (1 - policy.stopLossPercent / 100);
    const targetPrice = entryPrice * (1 + policy.takeProfitPercent / 100);
    let exitAt = entryBar.minuteAt;
    let exitPrice = entryBar.close;
    let exitReason = "time_exit";
    let exitIndex = Math.min(bars.length - 1, signalIndex + 1 + policy.maxHoldingBars);
    for (let index2 = signalIndex + 1; index2 <= exitIndex; index2 += 1) {
      const bar = bars[index2];
      const hitStop = bar.low <= stopPrice;
      const hitTarget = bar.high >= targetPrice;
      if (hitStop || hitTarget) {
        exitAt = bar.minuteAt;
        exitPrice = hitStop ? stopPrice : targetPrice;
        exitReason = hitStop && hitTarget ? "same_bar_stop_priority" : hitStop ? "stop_loss" : "take_profit";
        exitIndex = index2;
        break;
      }
      if (index2 === exitIndex) {
        exitAt = bar.minuteAt;
        exitPrice = bar.close;
      }
    }
    exitPrice *= 1 - policy.slippageBps / 1e4;
    const buyFee = Math.round(entryPrice * policy.quantity * policy.feeRate);
    const sellFee = Math.round(exitPrice * policy.quantity * policy.feeRate);
    const netPnl2 = Math.round((exitPrice - entryPrice) * policy.quantity - buyFee - sellFee);
    const invested = entryPrice * policy.quantity + buyFee;
    trades.push({ signalAt: signalBar.minuteAt, entryAt: entryBar.minuteAt, entryPrice, exitAt, exitPrice, exitReason, buyFee, sellFee, netPnl: netPnl2, netReturnPercent: invested ? netPnl2 / invested * 100 : 0 });
    nextSignalIndex = exitIndex + 1;
  }
  const netPnl = trades.reduce((total, trade) => total + trade.netPnl, 0);
  return { trades, netPnl, tradeCount: trades.length, winRate: trades.length ? trades.filter((trade) => trade.netPnl > 0).length / trades.length * 100 : 0, turnoverBasis: "derived_close_x_volume" };
}

// server/quant/minuteValidationHistory.ts
async function getLatestMinuteValidationHistory() {
  const db = await getDb();
  if (!db) return { experiment: null, assumptions: null, results: [] };
  const experiment = (await db.select().from(dayTradeExperiments).where(eq20(dayTradeExperiments.status, "tracking")).orderBy(desc16(dayTradeExperiments.updatedAt)).limit(1))[0] ?? null;
  if (!experiment) return { experiment: null, assumptions: null, results: [] };
  const positions = await db.select({ candidateId: dayTradeExperimentPositions.candidateId, symbol: dayTradeExperimentPositions.symbol, name: dayTradeExperimentPositions.name }).from(dayTradeExperimentPositions).where(eq20(dayTradeExperimentPositions.experimentId, experiment.id));
  const candidateIds = Array.from(new Set(positions.map((position) => position.candidateId)));
  const symbols = Array.from(new Set(positions.map((position) => position.symbol)));
  if (!candidateIds.length || !symbols.length) return { experiment, assumptions: null, results: [] };
  const [candidates, bars] = await Promise.all([
    db.select({ id: autonomousResearchCandidates.id, fingerprint: autonomousResearchCandidates.fingerprint, rootGenomeJson: autonomousResearchCandidates.rootGenomeJson, minimumScore: autonomousResearchCandidates.minimumScore }).from(autonomousResearchCandidates).where(inArray(autonomousResearchCandidates.id, candidateIds)),
    db.select().from(intradayMinuteBars).where(and12(eq20(intradayMinuteBars.tradingDate, experiment.tradingDate), inArray(intradayMinuteBars.symbol, symbols))).orderBy(asc3(intradayMinuteBars.symbol), asc3(intradayMinuteBars.minuteAt))
  ]);
  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const barsBySymbol = bars.reduce((result, bar) => {
    (result[bar.symbol] ??= []).push({ minuteAt: bar.minuteAt, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: Number(bar.volume) });
    return result;
  }, {});
  const assumptions = { feeRate: Number(experiment.buyFeeRate), stopLossPercent: 2, takeProfitPercent: 4, maxHoldingBars: 30, entryTiming: "\uB2E4\uC74C \uC644\uACB0 1\uBD84\uBD09 \uC2DC\uAC00", sameBarPriority: "\uC190\uC808 \uC6B0\uC120", turnoverBasis: "\uC885\uAC00\xD7\uAC70\uB798\uB7C9" };
  const results = positions.flatMap((position) => {
    const candidate = candidateById.get(position.candidateId);
    const minuteBars = barsBySymbol[position.symbol] ?? [];
    if (!candidate || !minuteBars.length) return [];
    const validation = evaluateMinuteExpression({ expression: candidate.rootGenomeJson, minimumScore: candidate.minimumScore, bars: minuteBars, policy: assumptions });
    const minuteState = minuteBars.length < 60 ? "learning" : validation.tradeCount < 2 ? "watching" : validation.netPnl > 0 && validation.winRate >= 50 ? "surviving" : "rejected";
    const minuteFitness = Math.round(validation.netPnl + validation.winRate * 100 + validation.tradeCount * 10);
    return [{ candidateId: candidate.id, candidateFingerprint: candidate.fingerprint, symbol: position.symbol, name: position.name, barCount: minuteBars.length, firstMinuteAt: minuteBars[0]?.minuteAt ?? null, lastMinuteAt: minuteBars.at(-1)?.minuteAt ?? null, minuteState, minuteFitness, ...validation }];
  });
  const ranked = [...results].sort((left, right) => right.minuteFitness - left.minuteFitness || right.netPnl - left.netPnl || left.symbol.localeCompare(right.symbol));
  const selection = {
    evaluatedCandidateCount: ranked.length,
    learningCandidateCount: ranked.filter((item) => item.minuteState === "learning").length,
    watchingCandidateCount: ranked.filter((item) => item.minuteState === "watching").length,
    survivingCandidateCount: ranked.filter((item) => item.minuteState === "surviving").length,
    rejectedCandidateCount: ranked.filter((item) => item.minuteState === "rejected").length,
    nextGenerationRule: "\uBD84 \uB2E8\uC704 \uC120\uBC1C \uACB0\uACFC\uB294 \uB2F9\uC77C \uB370\uC774\uD2B8\uB808\uC774\uB529 \uD6C4\uBCF4 \uC21C\uC704\uC5D0 \uBC18\uC601\uB418\uACE0, \uB2E4\uC74C \uC77C\uC77C \uC720\uC804\uC790 \uD0D0\uC0C9\uC740 \uC800\uC7A5\uB41C \uC2E4\uC81C \uB370\uC774\uD130\uC758 \uC7A5\uAE30 \uAC80\uC99D \uACB0\uACFC\uB97C \uD568\uAED8 \uC0AC\uC6A9\uD569\uB2C8\uB2E4."
  };
  return { experiment, assumptions, results: ranked, selection };
}

// shared/krxSymbolNames.ts
var KRX_SYMBOL_NAMES = {
  "000660": "SK\uD558\uC774\uB2C9\uC2A4",
  "002990": "\uAE08\uD638\uD0C0\uC774\uC5B4",
  "005380": "\uD604\uB300\uCC28",
  "005930": "\uC0BC\uC131\uC804\uC790",
  "005935": "\uC0BC\uC131\uC804\uC790\uC6B0",
  "009150": "\uC0BC\uC131\uC804\uAE30",
  "036930": "\uC8FC\uC131\uC5D4\uC9C0\uB2C8\uC5B4\uB9C1",
  "066570": "LG\uC804\uC790",
  "067310": "\uD558\uB098\uB9C8\uC774\uD06C\uB860",
  "069500": "KODEX 200",
  "102110": "\uD2F0\uCF00\uC774\uCF00\uBBF8\uCE7C",
  "114800": "KODEX \uC778\uBC84\uC2A4",
  "122630": "KODEX \uB808\uBC84\uB9AC\uC9C0",
  "229200": "KODEX \uCF54\uC2A4\uB2E5150",
  "233740": "KODEX \uCF54\uC2A4\uB2E5150 \uB808\uBC84\uB9AC\uC9C0",
  "252670": "KODEX 200\uC120\uBB3C\uC778\uBC84\uC2A42X",
  "402340": "SK\uC2A4\uD018\uC5B4",
  "403870": "HPSP",
  "459580": "KODEX CD\uAE08\uB9AC\uC561\uD2F0\uBE0C(\uD569\uC131)"
};
function getKrxSymbolName(symbol, storedName) {
  const normalizedStoredName = storedName?.trim();
  if (normalizedStoredName && normalizedStoredName !== symbol) return normalizedStoredName;
  return KRX_SYMBOL_NAMES[symbol] ?? symbol;
}

// server/routers/autonomousResearch.ts
async function getLatestHistoricalRunId() {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select({ id: autonomousResearchRuns.id }).from(autonomousResearchRuns).where(and13(eq21(autonomousResearchRuns.dataStatus, "ready"), like4(autonomousResearchRuns.runKey, "%:historical%"))).orderBy(desc17(autonomousResearchRuns.updatedAt)).limit(1);
  return rows[0]?.id ?? null;
}
function toPublicCandidateSummary(candidate) {
  const { simulationJson: _simulationJson, ...summary } = candidate;
  return { ...summary, simulationJson: null };
}
function auditState(run, evidence) {
  const isVerified = run.phase === "completed" && run.dataStatus === "ready" && evidence.dailyBarRows > 0 && evidence.candidateRows > 0;
  if (isVerified) return { code: "verified_completed", label: "\uC2E4\uC81C \uC6D0\uBCF8 \uAC80\uC99D \uC644\uB8CC", detail: "\uC800\uC7A5\uB41C \uC6D0\uBCF8 \uD589\uACFC \uC870\uAC74\uC2DD \uACB0\uACFC\uAC00 \uBAA8\uB450 \uD655\uC778\uB418\uC5C8\uC2B5\uB2C8\uB2E4." };
  if (run.phase === "failed" || run.dataStatus === "error" || run.dataStatus === "waiting" || run.phase === "waiting_for_data") return { code: "blocked", label: "\uC2E4\uD589 \uBD88\uAC00 \uB610\uB294 \uB300\uAE30", detail: run.lastError ?? "\uC2E4\uC81C \uC6D0\uBCF8 \uB610\uB294 \uC778\uC99D \uD655\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." };
  const ageMs = Date.now() - run.updatedAt.getTime();
  if (ageMs > 10 * 60 * 1e3) return { code: "stale", label: "\uC9C4\uD589 \uC8FC\uC7A5 \uD655\uC778 \uBD88\uAC00", detail: "\uCD5C\uADFC \uAC31\uC2E0 \uAE30\uB85D\uC774 \uC5C6\uC5B4 \uC2E4\uC81C\uB85C \uC2E4\uD589 \uC911\uC778\uC9C0 \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." };
  if (evidence.completedTaskCount > 0 || evidence.dailyBarRows > 0 || evidence.candidateRows > 0) return { code: "active_evidence", label: "\uC2E4\uD589 \uC99D\uAC70 \uC218\uC9D1 \uC911", detail: "\uCD5C\uADFC \uC791\uC5C5 \uB610\uB294 \uC6D0\uBCF8\xB7\uD6C4\uBCF4 \uAE30\uB85D\uC774 \uAC31\uC2E0\uB418\uACE0 \uC788\uC2B5\uB2C8\uB2E4." };
  return { code: "requested", label: "\uC2E4\uD589 \uC694\uCCAD\uB9CC \uAE30\uB85D\uB428", detail: "\uC6D0\uBCF8 \uC218\uC9D1\xB7\uC870\uAC74\uC2DD \uD3C9\uAC00 \uACB0\uACFC\uAC00 \uC544\uC9C1 \uAE30\uB85D\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4." };
}
function auditSourceLabel(run) {
  const summary = run.summaryJson;
  if (summary?.source === "kiwoom_ka10081_local_snapshot" || summary?.mode === "historical_backtest_local_snapshot") return "\uC9C0\uC815 \uB2E8\uB9D0\uC774 \uB3D9\uAE30\uD654\uD55C \uD0A4\uC6C0 ka10081 \uC77C\uBD09 \uC2A4\uB0C5\uC0F7";
  if (summary?.source === "kiwoom_ka10081") return "\uBC30\uD3EC \uC11C\uBC84\uAC00 \uC218\uC9D1\uD55C \uD0A4\uC6C0 ka10081 \uC77C\uBD09";
  if (summary?.mode === "historical_backtest_reuse") return "\uAE30\uC874 \uC800\uC7A5 \uC77C\uBD09\uC744 \uC7AC\uC0AC\uC6A9\uD55C \uC5F0\uAD6C \uC694\uCCAD";
  return "\uC6D0\uBCF8 \uCD9C\uCC98\uAC00 \uC544\uC9C1 \uD655\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.";
}
function auditUniverse(value) {
  if (!Array.isArray(value)) return [];
  const result = [];
  for (const item of value) {
    if (typeof item === "string" && item) result.push(item);
    if (item && typeof item === "object") {
      const record = item;
      if (typeof record.symbol === "string" && record.symbol) result.push(typeof record.name === "string" && record.name ? `${record.symbol} \xB7 ${record.name}` : record.symbol);
    }
  }
  return result.slice(0, 24);
}
var autonomousResearchRouter = router({
  latest: publicProcedure.input(z11.object({ includeSimulation: z11.boolean().optional() }).optional()).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return { run: null, tasks: [], observations: [], candidates: [], historical: { run: null, candidates: [] } };
    const [runs, historicalRows] = await Promise.all([
      db.select().from(autonomousResearchRuns).orderBy(desc17(autonomousResearchRuns.updatedAt)).limit(24),
      db.select().from(autonomousResearchRuns).where(and13(eq21(autonomousResearchRuns.dataStatus, "ready"), like4(autonomousResearchRuns.runKey, "%:historical%"))).orderBy(desc17(autonomousResearchRuns.updatedAt)).limit(1)
    ]);
    const run = runs.find((item) => !item.runKey.includes(":historical")) ?? null;
    const historicalRun = historicalRows[0] ?? null;
    if (!run) {
      const historicalCandidates2 = historicalRun ? await db.select().from(autonomousResearchCandidates).where(eq21(autonomousResearchCandidates.runId, historicalRun.id)).orderBy(desc17(autonomousResearchCandidates.fitnessScore)).limit(20) : [];
      return { run: null, tasks: [], observations: [], candidates: [], historical: { run: historicalRun, candidates: input?.includeSimulation ? historicalCandidates2 : historicalCandidates2.map(toPublicCandidateSummary) } };
    }
    const [tasks, observations, candidates] = await Promise.all([
      db.select().from(autonomousResearchTasks).where(eq21(autonomousResearchTasks.runId, run.id)).orderBy(desc17(autonomousResearchTasks.startedAt)).limit(12),
      db.select().from(autonomousResearchObservations).where(eq21(autonomousResearchObservations.runId, run.id)).orderBy(desc17(autonomousResearchObservations.capturedAt)).limit(40),
      db.select().from(autonomousResearchCandidates).where(eq21(autonomousResearchCandidates.runId, run.id)).orderBy(desc17(autonomousResearchCandidates.fitnessScore), desc17(autonomousResearchCandidates.updatedAt)).limit(20)
    ]);
    const historicalCandidates = historicalRun ? await db.select().from(autonomousResearchCandidates).where(eq21(autonomousResearchCandidates.runId, historicalRun.id)).orderBy(desc17(autonomousResearchCandidates.fitnessScore)).limit(20) : [];
    return { run, tasks, observations, candidates: input?.includeSimulation ? candidates : candidates.map(toPublicCandidateSummary), historical: { run: historicalRun, candidates: input?.includeSimulation ? historicalCandidates : historicalCandidates.map(toPublicCandidateSummary) } };
  }),
  auditTrail: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { generatedAt: /* @__PURE__ */ new Date(), lastRequested: null, lastVerified: null, runs: [], minuteEvidence: null, readOnlyBoundary: "\uB370\uC774\uD130 \uC218\uC9D1\xB7\uC870\uAC74\uC2DD \uC5F0\uAD6C\uB9CC \uD45C\uC2DC\uD558\uBA70 \uC8FC\uBB38\xB7\uACC4\uC88C \uC870\uD68C\xB7\uC8FC\uBB38 \uC804\uC1A1\uC740 \uC774 \uACBD\uB85C\uC5D0\uC11C \uC218\uD589\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4." };
    const runs = await db.select().from(autonomousResearchRuns).orderBy(desc17(autonomousResearchRuns.updatedAt)).limit(16);
    const runIds = runs.map((run) => run.id);
    const [tasks, dailyEvidence, candidateEvidence, minuteRows] = await Promise.all([
      runIds.length ? db.select().from(autonomousResearchTasks).where(inArray2(autonomousResearchTasks.runId, runIds)).orderBy(desc17(autonomousResearchTasks.startedAt)).limit(80) : Promise.resolve([]),
      runIds.length ? db.select({ runId: autonomousResearchBars.runId, dailyBarRows: sql2`COUNT(*)`, dailySymbolCount: sql2`COUNT(DISTINCT ${autonomousResearchBars.symbol})`, firstDailyDate: sql2`MIN(${autonomousResearchBars.date})`, lastDailyDate: sql2`MAX(${autonomousResearchBars.date})`, lastDailyCapturedAt: sql2`MAX(${autonomousResearchBars.capturedAt})` }).from(autonomousResearchBars).where(inArray2(autonomousResearchBars.runId, runIds)).groupBy(autonomousResearchBars.runId) : Promise.resolve([]),
      runIds.length ? db.select({ runId: autonomousResearchCandidates.runId, candidateRows: sql2`COUNT(*)`, survivedRows: sql2`SUM(CASE WHEN ${autonomousResearchCandidates.status} = 'survived' THEN 1 ELSE 0 END)`, rejectedRows: sql2`SUM(CASE WHEN ${autonomousResearchCandidates.status} = 'rejected' THEN 1 ELSE 0 END)`, lastCandidateUpdatedAt: sql2`MAX(${autonomousResearchCandidates.updatedAt})` }).from(autonomousResearchCandidates).where(inArray2(autonomousResearchCandidates.runId, runIds)).groupBy(autonomousResearchCandidates.runId) : Promise.resolve([]),
      db.select({ minuteBarRows: sql2`COUNT(*)`, minuteTradingDateCount: sql2`COUNT(DISTINCT ${intradayMinuteBars.tradingDate})`, minuteSymbolCount: sql2`COUNT(DISTINCT ${intradayMinuteBars.symbol})`, firstMinuteAt: sql2`MIN(${intradayMinuteBars.minuteAt})`, lastMinuteAt: sql2`MAX(${intradayMinuteBars.minuteAt})`, lastMinuteCapturedAt: sql2`MAX(${intradayMinuteBars.capturedAt})` }).from(intradayMinuteBars)
    ]);
    const dailyByRun = new Map(dailyEvidence.map((item) => [item.runId, { dailyBarRows: Number(item.dailyBarRows), dailySymbolCount: Number(item.dailySymbolCount), firstDailyDate: item.firstDailyDate, lastDailyDate: item.lastDailyDate, lastDailyCapturedAt: item.lastDailyCapturedAt }]));
    const candidatesByRun = new Map(candidateEvidence.map((item) => [item.runId, { candidateRows: Number(item.candidateRows), survivedRows: Number(item.survivedRows ?? 0), rejectedRows: Number(item.rejectedRows ?? 0), lastCandidateUpdatedAt: item.lastCandidateUpdatedAt }]));
    const tasksByRun = /* @__PURE__ */ new Map();
    for (const task of tasks) tasksByRun.set(task.runId, [...tasksByRun.get(task.runId) ?? [], task]);
    const auditRuns = runs.map((run) => {
      const daily = dailyByRun.get(run.id) ?? { dailyBarRows: 0, dailySymbolCount: 0, firstDailyDate: null, lastDailyDate: null, lastDailyCapturedAt: null };
      const candidates = candidatesByRun.get(run.id) ?? { candidateRows: 0, survivedRows: 0, rejectedRows: 0, lastCandidateUpdatedAt: null };
      const runTasks = tasksByRun.get(run.id) ?? [];
      const completedTaskCount = runTasks.filter((task) => task.status === "completed").length;
      const state = auditState(run, { dailyBarRows: daily.dailyBarRows, candidateRows: candidates.candidateRows, completedTaskCount });
      return { runId: run.id, runKey: run.runKey, tradingDate: run.tradingDate, phase: run.phase, dataStatus: run.dataStatus, policyVersion: run.policyVersion, startedAt: run.startedAt, updatedAt: run.updatedAt, completedAt: run.completedAt, lastObservedAt: run.lastObservedAt, lastError: run.lastError, sourceLabel: auditSourceLabel(run), universe: auditUniverse(run.universeJson), state, daily, candidates, tasks: runTasks.map((task) => ({ id: task.id, phase: task.phase, status: task.status, startedAt: task.startedAt, completedAt: task.completedAt, lastError: task.lastError })), orderTransmission: "\uC774 \uC5F0\uAD6C \uC2E4\uD589 \uACBD\uB85C\uC5D0\uC11C\uB294 \uC8FC\uBB38 API\uB97C \uD638\uCD9C\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4." };
    });
    return { generatedAt: /* @__PURE__ */ new Date(), lastRequested: auditRuns[0] ?? null, lastVerified: auditRuns.find((run) => run.state.code === "verified_completed") ?? null, runs: auditRuns, minuteEvidence: { minuteBarRows: Number(minuteRows[0]?.minuteBarRows ?? 0), minuteTradingDateCount: Number(minuteRows[0]?.minuteTradingDateCount ?? 0), minuteSymbolCount: Number(minuteRows[0]?.minuteSymbolCount ?? 0), firstMinuteAt: minuteRows[0]?.firstMinuteAt ?? null, lastMinuteAt: minuteRows[0]?.lastMinuteAt ?? null, lastMinuteCapturedAt: minuteRows[0]?.lastMinuteCapturedAt ?? null, source: "kiwoom_ka10080" }, readOnlyBoundary: "\uB370\uC774\uD130 \uC218\uC9D1\xB7\uC870\uAC74\uC2DD \uC5F0\uAD6C\uB9CC \uD45C\uC2DC\uD558\uBA70 \uC8FC\uBB38\xB7\uACC4\uC88C \uC870\uD68C\xB7\uC8FC\uBB38 \uC804\uC1A1\uC740 \uC774 \uACBD\uB85C\uC5D0\uC11C \uC218\uD589\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4." };
  }),
  runHistoricalBacktest: operatorProcedure.mutation(async () => publicHistoricalBacktest.run()),
  reuseHistoricalDataset: operatorProcedure.mutation(async () => publicHistoricalBacktest.reuseStoredDataset()),
  historicalResearchInsights: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;
    const runs = await db.select().from(autonomousResearchRuns).orderBy(desc17(autonomousResearchRuns.updatedAt)).limit(40);
    const run = runs.find((item) => item.dataStatus === "ready" && item.runKey.includes(":historical"));
    if (!run) return null;
    const summary = run.summaryJson;
    const sourceRunId = summary?.dataset?.sourceRunId ?? run.id;
    const [candidates, rows] = await Promise.all([
      db.select().from(autonomousResearchCandidates).where(eq21(autonomousResearchCandidates.runId, run.id)).orderBy(desc17(autonomousResearchCandidates.fitnessScore)).limit(20),
      db.select().from(autonomousResearchBars).where(eq21(autonomousResearchBars.runId, sourceRunId)).orderBy(autonomousResearchBars.symbol, autonomousResearchBars.date)
    ]);
    const barsBySymbol = rows.reduce((result, row) => {
      (result[row.symbol] ??= []).push({ date: row.date, open: Number(row.open), high: Number(row.high), low: Number(row.low), close: Number(row.close), volume: Number(row.volume), turnover: Number(row.turnover) });
      return result;
    }, {});
    const insights = buildHistoricalResearchInsights({
      candidates: candidates.filter((candidate) => candidate.status === "survived"),
      barsBySymbol,
      feeRate: (summary?.assumptions?.feeRate ?? AUTONOMOUS_RESEARCH_POLICY.feeRate) + (summary?.assumptions?.slippageBps ?? AUTONOMOUS_RESEARCH_POLICY.slippageBps) / 1e4,
      entryDelayDays: summary?.assumptions?.informationCutoffTradingDays ?? AUTONOMOUS_RESEARCH_POLICY.informationCutoffTradingDays
    });
    return { runId: run.id, sourceRunId, barCount: rows.length, ...insights };
  }),
  researchCommitteeReport: publicProcedure.query(async () => {
    const runId = await getLatestHistoricalRunId();
    if (!runId) return null;
    return getLatestResearchCommitteeReport(runId);
  }),
  runResearchCommittee: operatorProcedure.mutation(async () => {
    const runId = await getLatestHistoricalRunId();
    if (!runId) throw new Error("\uC644\uB8CC\uB41C \uC2E4\uC81C \uC77C\uBD09 \uACFC\uAC70 \uC5F0\uAD6C\uAC00 \uC5C6\uC5B4 \uC704\uC6D0\uD68C \uAC80\uD1A0\uB97C \uC2E4\uD589\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    return runResearchCommittee(runId);
  }),
  researchGovernanceCycle: publicProcedure.query(async () => getLatestResearchGovernanceCycle()),
  autonomousOperationsStatus: publicProcedure.query(async () => getAutonomousOperationsStatus()),
  dayTradeHistory: publicProcedure.query(async () => getDayTradeHistory()),
  minuteValidationHistory: publicProcedure.query(async () => getLatestMinuteValidationHistory()),
  minuteCollectionStatus: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;
    return (await db.select().from(localMinuteCollectionRequests).orderBy(desc17(localMinuteCollectionRequests.updatedAt)).limit(1))[0] ?? null;
  }),
  minuteBackfillStatus: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;
    const year = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric" }).format(/* @__PURE__ */ new Date());
    const [summary] = await db.select({
      symbolCount: sql2`COUNT(DISTINCT ${intradayMinuteBars.symbol})`,
      tradingDateCount: sql2`COUNT(DISTINCT ${intradayMinuteBars.tradingDate})`,
      barCount: sql2`COUNT(*)`,
      firstTradingDate: sql2`MIN(${intradayMinuteBars.tradingDate})`,
      lastTradingDate: sql2`MAX(${intradayMinuteBars.tradingDate})`,
      lastCapturedAt: sql2`MAX(${intradayMinuteBars.capturedAt})`
    }).from(intradayMinuteBars).where(sql2`${intradayMinuteBars.tradingDate} LIKE ${`${year}-%`}`);
    return { year: Number(year), symbolCount: Number(summary?.symbolCount ?? 0), tradingDateCount: Number(summary?.tradingDateCount ?? 0), barCount: Number(summary?.barCount ?? 0), firstTradingDate: summary?.firstTradingDate ?? null, lastTradingDate: summary?.lastTradingDate ?? null, lastCapturedAt: summary?.lastCapturedAt ?? null, source: "kiwoom_ka10080" };
  }),
  mockOrderOperationStatus: operatorProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;
    const tradingDate2 = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(/* @__PURE__ */ new Date());
    const [policy, experiment] = await Promise.all([
      db.select().from(autoTradePolicies).where(eq21(autoTradePolicies.status, "active")).orderBy(desc17(autoTradePolicies.updatedAt)).limit(1).then((rows) => rows[0] ?? null),
      db.select().from(dayTradeExperiments).where(eq21(dayTradeExperiments.tradingDate, tradingDate2)).orderBy(desc17(dayTradeExperiments.updatedAt)).limit(1).then((rows) => rows[0] ?? null)
    ]);
    const [profile, positions, recentExecutions] = await Promise.all([
      policy ? db.select().from(tradingProfiles).where(eq21(tradingProfiles.userId, policy.userId)).limit(1).then((rows) => rows[0] ?? null) : Promise.resolve(null),
      experiment ? db.select().from(dayTradeExperimentPositions).where(eq21(dayTradeExperimentPositions.experimentId, experiment.id)).orderBy(desc17(dayTradeExperimentPositions.signalCount), dayTradeExperimentPositions.symbol) : Promise.resolve([]),
      policy ? db.select({
        orderIntentId: orderIntents.id,
        symbol: orderIntents.symbol,
        name: orderIntents.name,
        side: orderIntents.side,
        orderStatus: orderIntents.status,
        quantity: orderIntents.quantity,
        price: orderIntents.price,
        createdAt: orderIntents.createdAt,
        brokerOrderId: orderIntents.brokerOrderId,
        executionStatus: orderExecutions.executionStatus,
        filledQuantity: orderExecutions.filledQuantity,
        filledPrice: orderExecutions.filledPrice,
        executedAt: orderExecutions.executedAt
      }).from(orderIntents).leftJoin(orderExecutions, eq21(orderExecutions.orderIntentId, orderIntents.id)).where(and13(
        eq21(orderIntents.userId, policy.userId),
        eq21(orderIntents.autoPolicyId, policy.id),
        eq21(orderIntents.executionOrigin, "local_node"),
        like4(orderIntents.dedupeKey, `auto:${tradingDate2}:%`)
      )).orderBy(desc17(orderExecutions.executedAt), desc17(orderIntents.updatedAt)).limit(30) : Promise.resolve([])
    ]);
    const enabled = Boolean(policy && profile?.autoTradeEnabled && !profile.killSwitch);
    const status = !policy ? "waiting_for_policy" : !profile ? "waiting_for_profile" : profile.killSwitch ? "kill_switch" : !profile.autoTradeEnabled ? "automatic_execution_paused" : !experiment ? "waiting_for_intraday_experiment" : experiment.status === "closed" ? "market_closed" : positions.length ? "ready" : "waiting_for_signals";
    const maxPositions = policy?.maxConcurrentPositions ?? 0;
    return {
      tradingDate: tradingDate2,
      status,
      executionMode: "mock",
      localExecutor: "KiwoomAutomaticOrderExecutor",
      policy: policy ? { id: policy.id, version: policy.version, totalCapital: policy.totalCapital, maxConcurrentPositions: policy.maxConcurrentPositions, stopLossPercent: Number(policy.stopLossPercent), takeProfitPercent: Number(policy.takeProfitPercent), dailyLossLimitPercent: Number(policy.dailyLossLimitPercent), enabled } : null,
      experiment: experiment ? { id: experiment.id, status: experiment.status, signalCount: experiment.signalCount, selectedPositionCount: experiment.selectedPositionCount, totalCapital: experiment.totalCapital, netPnl: Number(experiment.netPnl), netReturnPercent: Number(experiment.netReturnPercent), closedAt: experiment.closedAt, updatedAt: experiment.updatedAt } : null,
      selectedOrders: experiment?.status === "tracking" ? positions.slice(0, maxPositions).map((position) => ({ symbol: position.symbol, name: position.name, candidateId: position.candidateId, candidateFingerprint: position.candidateFingerprint, signalCount: position.signalCount, referencePrice: position.lastPrice ?? position.entryPrice, dedupeKey: policy ? `auto:${tradingDate2}:${policy.version}:${position.candidateId}:${position.symbol}:buy` : null })) : [],
      recentExecutions: recentExecutions.map((item) => ({ ...item, executionStatus: item.executionStatus ?? item.orderStatus, filledPrice: item.filledPrice ?? null, executedAt: item.executedAt ?? item.createdAt }))
    };
  }),
  requestMinuteCollection: protectedProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new Error("\uC5F0\uAD6C \uB370\uC774\uD130\uBCA0\uC774\uC2A4\uB97C \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    const now = /* @__PURE__ */ new Date();
    const tradingDate2 = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(now);
    const [existing] = await db.select().from(localMinuteCollectionRequests).where(and13(eq21(localMinuteCollectionRequests.tradingDate, tradingDate2), inArray2(localMinuteCollectionRequests.status, ["queued", "running"]))).orderBy(desc17(localMinuteCollectionRequests.updatedAt)).limit(1);
    if (existing) return { request: existing, reusedPendingRequest: true };
    const requestKey = `manual:${tradingDate2}:${now.getTime()}`;
    const [inserted] = await db.insert(localMinuteCollectionRequests).values({ tradingDate: tradingDate2, requestKey, source: "public_intraday_monitor" }).returning();
    const request = (await db.select().from(localMinuteCollectionRequests).where(eq21(localMinuteCollectionRequests.id, inserted.id)).limit(1))[0];
    return { request, reusedPendingRequest: false };
  }),
  syncDayTradeHistory: operatorProcedure.input(z11.object({ runId: z11.number().int().positive() })).mutation(async ({ input }) => syncDayTradeExperimentForRun(input.runId)),
  dayTradePositionDetail: publicProcedure.input(z11.object({ candidateId: z11.number().int().positive(), symbol: z11.string().regex(/^\d{6}$/) })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return null;
    const position = (await db.select().from(dayTradeExperimentPositions).where(and13(eq21(dayTradeExperimentPositions.candidateId, input.candidateId), eq21(dayTradeExperimentPositions.symbol, input.symbol))).orderBy(desc17(dayTradeExperimentPositions.updatedAt)).limit(1))[0];
    if (!position) return null;
    const [candidate, experiment] = await Promise.all([
      db.select().from(autonomousResearchCandidates).where(eq21(autonomousResearchCandidates.id, position.candidateId)).limit(1),
      db.select().from(dayTradeExperiments).where(eq21(dayTradeExperiments.id, position.experimentId)).limit(1)
    ]);
    if (!candidate[0] || !experiment[0]) return null;
    const bars = await db.select({ minuteAt: intradayMinuteBars.minuteAt, open: intradayMinuteBars.open, high: intradayMinuteBars.high, low: intradayMinuteBars.low, close: intradayMinuteBars.close, volume: intradayMinuteBars.volume }).from(intradayMinuteBars).where(and13(eq21(intradayMinuteBars.symbol, position.symbol), eq21(intradayMinuteBars.tradingDate, experiment[0].tradingDate))).orderBy(intradayMinuteBars.minuteAt);
    return {
      position: { ...position, name: getKrxSymbolName(position.symbol, position.name) },
      candidate: { id: candidate[0].id, fingerprint: candidate[0].fingerprint, rootGenomeJson: candidate[0].rootGenomeJson, minimumScore: candidate[0].minimumScore, fitnessScore: candidate[0].fitnessScore },
      experiment: { id: experiment[0].id, tradingDate: experiment[0].tradingDate, status: experiment[0].status },
      bars: bars.map((bar) => ({ ...bar, open: Number(bar.open), high: Number(bar.high), low: Number(bar.low), close: Number(bar.close), volume: Number(bar.volume) })),
      source: "kiwoom_ka10080"
    };
  }),
  historicalCandidateDetail: publicProcedure.input(z11.object({ candidateId: z11.number().int().positive() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return null;
    const candidate = (await db.select().from(autonomousResearchCandidates).where(eq21(autonomousResearchCandidates.id, input.candidateId)).limit(1))[0];
    if (!candidate) return null;
    const run = (await db.select().from(autonomousResearchRuns).where(eq21(autonomousResearchRuns.id, candidate.runId)).limit(1))[0];
    if (!run || !run.runKey.includes(":historical")) return null;
    const summary = run.summaryJson;
    const sourceRunId = summary?.dataset?.sourceRunId ?? run.id;
    const rows = await db.select().from(autonomousResearchBars).where(eq21(autonomousResearchBars.runId, sourceRunId)).orderBy(autonomousResearchBars.symbol, autonomousResearchBars.date);
    const barsBySymbol = rows.reduce((result, row) => {
      (result[row.symbol] ??= []).push({ date: row.date, open: Number(row.open), high: Number(row.high), low: Number(row.low), close: Number(row.close), volume: Number(row.volume), turnover: Number(row.turnover) });
      return result;
    }, {});
    const evaluation = evaluateAutonomousCandidate({ root: candidate.rootGenomeJson, minimumScore: candidate.minimumScore, barsBySymbol });
    const universe = (run.universeJson ?? []).reduce((result, item) => ({ ...result, [item.symbol]: item.name ?? item.symbol }), {});
    const trades = evaluation.results.flatMap((item) => item.result.trades.map((trade) => ({ symbol: item.symbol, name: universe[item.symbol] ?? item.symbol, ...trade }))).sort((left, right) => right.returnPercent - left.returnPercent || left.entryDate.localeCompare(right.entryDate));
    const focusTrade = trades[0] ?? null;
    const focusBars = focusTrade ? barsBySymbol[focusTrade.symbol] ?? [] : [];
    const entryIndex = focusTrade ? focusBars.findIndex((bar) => bar.date === focusTrade.entryDate) : -1;
    const entryEvidence = entryIndex > 0 ? evaluateExpression(candidate.rootGenomeJson, focusBars.slice(0, entryIndex)) : null;
    const profitableTrades = trades.filter((trade) => trade.returnPercent > 0);
    const losingTrades = trades.filter((trade) => trade.returnPercent <= 0);
    return {
      candidate,
      run,
      dataset: { sourceRunId, barCount: rows.length, symbolCount: Object.keys(barsBySymbol).length, reuseState: sourceRunId === run.id ? "\uC6D0\uBCF8" : "\uC800\uC7A5 \uB370\uC774\uD130 \uC7AC\uC0AC\uC6A9" },
      metrics: { ...evaluation.metrics, profitableTradeRatio: trades.length ? profitableTrades.length / trades.length * 100 : 0, averageProfit: profitableTrades.length ? profitableTrades.reduce((sum, trade) => sum + trade.returnPercent, 0) / profitableTrades.length : 0, averageLoss: losingTrades.length ? losingTrades.reduce((sum, trade) => sum + trade.returnPercent, 0) / losingTrades.length : 0, fixedHoldingDays: summary?.assumptions?.holdingDays ?? AUTONOMOUS_RESEARCH_POLICY.holdingDays },
      trades: trades.slice(0, 40),
      focus: focusTrade ? { trade: focusTrade, bars: focusBars.slice(Math.max(0, entryIndex - 35), Math.min(focusBars.length, entryIndex + 50)), entryEvidence: entryEvidence?.evaluations ?? [], exitExplanation: `\uC9C4\uC785 \uB4A4 ${summary?.assumptions?.holdingDays ?? AUTONOMOUS_RESEARCH_POLICY.holdingDays}\uAC70\uB798\uC77C \uBCF4\uC720 \uD6C4 \uC885\uAC00\uC5D0 \uCCAD\uC0B0\uD558\uB294 \uACE0\uC815 \uBCF4\uC720 \uADDC\uCE59\uC785\uB2C8\uB2E4.` } : null
    };
  })
});

// server/routers/paperPortfolio.ts
import { TRPCError as TRPCError14 } from "@trpc/server";
import { and as and14, desc as desc18, eq as eq22 } from "drizzle-orm";
import { z as z12 } from "zod";
var isActualObservationSource = (source) => source.startsWith("kiwoom_ka10032") || source.startsWith("kiwoom_ka10081");
function assertActualObservationSource(source) {
  if (!isActualObservationSource(source)) {
    throw new TRPCError14({ code: "PRECONDITION_FAILED", message: "\uD0A4\uC6C0 \uC2E4\uC81C \uAC00\uACA9 \uAD00\uCC30\uB9CC \uBAA8\uC758 \uD3EC\uD2B8\uD3F4\uB9AC\uC624\uC758 \uAC00\uACA9 \uADFC\uAC70\uB85C \uC0AC\uC6A9\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4." });
  }
}
async function requireDb8() {
  const db = await getDb();
  if (!db) throw new TRPCError14({ code: "INTERNAL_SERVER_ERROR", message: "\uB370\uC774\uD130\uBCA0\uC774\uC2A4 \uC5F0\uACB0\uC744 \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
  return db;
}
async function findActualObservation(db, observationId) {
  const observation = (await db.select().from(autonomousResearchObservations).where(eq22(autonomousResearchObservations.id, observationId)).limit(1))[0];
  if (!observation) throw new TRPCError14({ code: "NOT_FOUND", message: "\uC2E4\uC81C \uAC00\uACA9 \uAD00\uCC30 \uAE30\uB85D\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
  assertActualObservationSource(observation.source);
  if (!observation.candidateId) throw new TRPCError14({ code: "PRECONDITION_FAILED", message: "\uC5F0\uAD6C \uD6C4\uBCF4\uC640 \uC5F0\uACB0\uB41C \uC2E4\uC81C \uAC00\uACA9 \uAD00\uCC30\uB9CC \uBAA8\uC758 \uD3EC\uD2B8\uD3F4\uB9AC\uC624\uC5D0 \uCD94\uAC00\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4." });
  return observation;
}
var paperPortfolioRouter = router({
  latestActualObservations: operatorProcedure.input(z12.object({ limit: z12.number().int().min(1).max(100).default(20) })).query(async ({ input }) => {
    const db = await requireDb8();
    const observations = await db.select().from(autonomousResearchObservations).orderBy(desc18(autonomousResearchObservations.capturedAt)).limit(input.limit * 5);
    return observations.filter((observation) => Boolean(observation.candidateId) && isActualObservationSource(observation.source)).slice(0, input.limit);
  }),
  list: operatorProcedure.query(async ({ ctx }) => {
    const db = await requireDb8();
    const portfolios = await db.select().from(paperPortfolios).where(eq22(paperPortfolios.userId, ctx.user.id)).orderBy(desc18(paperPortfolios.updatedAt));
    const positions = await db.select().from(paperPositions).orderBy(desc18(paperPositions.updatedAt));
    return portfolios.map((portfolio) => ({ ...portfolio, positions: positions.filter((position) => position.portfolioId === portfolio.id) }));
  }),
  openFromObservation: operatorProcedure.input(z12.object({ observationId: z12.number().int().positive(), quantity: z12.number().int().positive().max(1e6) })).mutation(async ({ ctx, input }) => {
    const db = await requireDb8();
    const observation = await findActualObservation(db, input.observationId);
    const amount = observation.price * input.quantity;
    const [portfolioCreated] = await db.insert(paperPortfolios).values({ userId: ctx.user.id, name: `${observation.name ?? observation.symbol} \uC2E4\uC81C\uAC00\uACA9 \uCD94\uC801`, initialCash: amount, cashBalance: 0 }).returning();
    const [positionCreated] = await db.insert(paperPositions).values({ portfolioId: portfolioCreated.id, sourceCandidateId: observation.candidateId, symbol: observation.symbol, name: observation.name ?? observation.symbol, quantity: input.quantity, entryPrice: observation.price, latestPrice: observation.price, unrealizedPnl: 0 }).returning();
    await db.insert(paperPortfolioPriceEvents).values({ portfolioId: portfolioCreated.id, positionId: positionCreated.id, eventType: "entry", price: observation.price, source: observation.source, sourceTimestamp: observation.capturedAt, evidenceJson: { observationId: observation.id, runId: observation.runId, candidateId: observation.candidateId } });
    return { portfolioId: portfolioCreated.id, positionId: positionCreated.id, symbol: observation.symbol, entryPrice: observation.price, quantity: input.quantity, source: observation.source, capturedAt: observation.capturedAt };
  }),
  markFromObservation: operatorProcedure.input(z12.object({ positionId: z12.number().int().positive(), observationId: z12.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb8();
    const position = (await db.select().from(paperPositions).where(eq22(paperPositions.id, input.positionId)).limit(1))[0];
    if (!position || position.status !== "open") throw new TRPCError14({ code: "PRECONDITION_FAILED", message: "\uAC00\uACA9\uC744 \uAC31\uC2E0\uD560 \uC5F4\uB9B0 \uBAA8\uC758 \uD3EC\uC9C0\uC158\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." });
    const portfolio = (await db.select().from(paperPortfolios).where(and14(eq22(paperPortfolios.id, position.portfolioId), eq22(paperPortfolios.userId, ctx.user.id))).limit(1))[0];
    if (!portfolio) throw new TRPCError14({ code: "FORBIDDEN", message: "\uC774 \uBAA8\uC758 \uD3EC\uD2B8\uD3F4\uB9AC\uC624\uC5D0 \uC811\uADFC\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    const observation = await findActualObservation(db, input.observationId);
    if (observation.symbol !== position.symbol) throw new TRPCError14({ code: "PRECONDITION_FAILED", message: "\uAC19\uC740 \uC885\uBAA9\uC758 \uC2E4\uC81C \uAC00\uACA9 \uAD00\uCC30\uB9CC \uD3EC\uC9C0\uC158\uC5D0 \uBC18\uC601\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4." });
    const unrealizedPnl = (observation.price - position.entryPrice) * position.quantity;
    await db.update(paperPositions).set({ latestPrice: observation.price, unrealizedPnl }).where(eq22(paperPositions.id, position.id));
    await db.insert(paperPortfolioPriceEvents).values({ portfolioId: portfolio.id, positionId: position.id, eventType: "mark", price: observation.price, source: observation.source, sourceTimestamp: observation.capturedAt, evidenceJson: { observationId: observation.id, runId: observation.runId, candidateId: observation.candidateId } });
    return { positionId: position.id, latestPrice: observation.price, unrealizedPnl, source: observation.source, capturedAt: observation.capturedAt };
  }),
  closeFromObservation: operatorProcedure.input(z12.object({ positionId: z12.number().int().positive(), observationId: z12.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb8();
    const position = (await db.select().from(paperPositions).where(eq22(paperPositions.id, input.positionId)).limit(1))[0];
    if (!position || position.status !== "open") throw new TRPCError14({ code: "PRECONDITION_FAILED", message: "\uC885\uB8CC\uD560 \uC5F4\uB9B0 \uBAA8\uC758 \uD3EC\uC9C0\uC158\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." });
    const portfolio = (await db.select().from(paperPortfolios).where(and14(eq22(paperPortfolios.id, position.portfolioId), eq22(paperPortfolios.userId, ctx.user.id))).limit(1))[0];
    if (!portfolio) throw new TRPCError14({ code: "FORBIDDEN", message: "\uC774 \uBAA8\uC758 \uD3EC\uD2B8\uD3F4\uB9AC\uC624\uC5D0 \uC811\uADFC\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    const observation = await findActualObservation(db, input.observationId);
    if (observation.symbol !== position.symbol) throw new TRPCError14({ code: "PRECONDITION_FAILED", message: "\uAC19\uC740 \uC885\uBAA9\uC758 \uC2E4\uC81C \uAC00\uACA9 \uAD00\uCC30\uB9CC \uD3EC\uC9C0\uC158 \uC885\uB8CC\uC5D0 \uBC18\uC601\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4." });
    const realizedPnl = (observation.price - position.entryPrice) * position.quantity;
    await db.update(paperPositions).set({ latestPrice: observation.price, unrealizedPnl: realizedPnl, status: "closed", closedAt: /* @__PURE__ */ new Date() }).where(eq22(paperPositions.id, position.id));
    await db.update(paperPortfolios).set({ cashBalance: portfolio.cashBalance + observation.price * position.quantity }).where(eq22(paperPortfolios.id, portfolio.id));
    await db.insert(paperPortfolioPriceEvents).values({ portfolioId: portfolio.id, positionId: position.id, eventType: "exit", price: observation.price, source: observation.source, sourceTimestamp: observation.capturedAt, evidenceJson: { observationId: observation.id, runId: observation.runId, candidateId: observation.candidateId } });
    return { positionId: position.id, exitPrice: observation.price, realizedPnl, source: observation.source, capturedAt: observation.capturedAt };
  })
});

// server/routers/minuteResearch.ts
import { and as and16, eq as eq24 } from "drizzle-orm";
import { parse as parseCookie3 } from "cookie";
import { z as z13 } from "zod";

// server/quant/minuteResearch.ts
import { createHash as createHash6 } from "node:crypto";
import { and as and15, asc as asc4, desc as desc19, eq as eq23, inArray as inArray3 } from "drizzle-orm";
init_evolution();
var DEFAULT_MINUTE_RESEARCH_CONFIGURATION = {
  combinationsPerSweep: 3e3,
  maxUniverseSymbols: 20,
  lookbackTradingDays: 20,
  validationTradingDays: 5,
  minimumTrades: 24,
  minimumValidationTrades: 8,
  maxDrawdownPercent: -4,
  stopLossPercent: 1.5,
  takeProfitPercent: 3,
  maxHoldingBars: 45,
  feeRate: 3e-4,
  slippageBps: 8,
  explorationMode: "survivor_core"
};
var MINUTE_RULE_TYPES = ["macd_rising", "ma_position", "high_return", "turnover", "rsi", "bollinger", "stochastic", "atr_percent", "volume_ratio", "close_change", "gap_percent", "intrabar_position"];
var STALE_SWEEP_AFTER_MS = 10 * 60 * 1e3;
var MINUTE_RESEARCH_EVALUATION_BATCH_SIZE = 1;
function summarizeMinuteResearchError(error, maxLength = 480) {
  const fallback = error instanceof Error ? error.message : String(error);
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : "";
  const message = (cause || fallback).replace(/\s+/g, " ").trim() || "1\uBD84\uBD09 \uC5F0\uAD6C \uC2E4\uD589 \uC911 \uC54C \uC218 \uC5C6\uB294 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.";
  const limit = Math.max(80, Math.floor(maxLength));
  return message.length <= limit ? message : `${message.slice(0, limit - 1)}\u2026`;
}
function yieldMinuteResearchEventLoop() {
  return new Promise((resolve) => setImmediate(resolve));
}
function isMinuteResearchSweepStale(input, now = /* @__PURE__ */ new Date()) {
  if (input.status !== "running") return false;
  const latestActivity = Math.max(input.startedAt.getTime(), input.updatedAt.getTime());
  return now.getTime() - latestActivity >= STALE_SWEEP_AFTER_MS;
}
function collectRuleTypes(root) {
  if (!root || typeof root !== "object") return [];
  if ("children" in root && Array.isArray(root.children)) return root.children.flatMap(collectRuleTypes);
  const type = root.type;
  return typeof type === "string" && MINUTE_RULE_TYPES.includes(type) ? [type] : [];
}
function commonSurvivorRuleTypes(candidates) {
  const counts = /* @__PURE__ */ new Map();
  for (const candidate of candidates) for (const type of Array.from(new Set(collectRuleTypes(candidate.rootGenomeJson)))) counts.set(type, (counts.get(type) ?? 0) + 1);
  const ranked = Array.from(counts.entries()).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).map(([type]) => type);
  return ranked.length ? ranked.slice(0, Math.min(3, ranked.length)) : ["macd_rising", "ma_position", "rsi"];
}
function flattenStrategyRules(root) {
  if (!root || typeof root !== "object") return [];
  const node = root;
  if (Array.isArray(node.children)) return node.children.flatMap(flattenStrategyRules);
  return typeof node.type === "string" ? [node] : [];
}
function mean(values) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}
function round(value) {
  return Number(value.toFixed(6));
}
function standardDeviation(values) {
  if (values.length < 2) return 0;
  const average2 = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average2) ** 2)));
}
function summarizeMinuteTrades(trades) {
  const returns = trades.map((trade) => trade.netReturnPercent);
  const wins = returns.filter((value) => value > 0);
  const losses = returns.filter((value) => value < 0);
  let cumulative = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const value of returns) {
    cumulative += value;
    peak = Math.max(peak, cumulative);
    maxDrawdown = Math.min(maxDrawdown, cumulative - peak);
  }
  const grossProfit = wins.reduce((total, value) => total + value, 0);
  const grossLoss = Math.abs(losses.reduce((total, value) => total + value, 0));
  return {
    tradeCount: trades.length,
    winRate: trades.length ? round(wins.length / trades.length * 100) : 0,
    netReturnPercent: round(cumulative),
    expectancyPercent: round(mean(returns)),
    maxDrawdownPercent: round(maxDrawdown),
    profitFactor: grossLoss ? round(grossProfit / grossLoss) : grossProfit > 0 ? null : 0
  };
}
function conditionBars(rows) {
  return rows.reduce((all, row) => {
    const byDate = all[row.tradingDate] ??= {};
    const bars = byDate[row.symbol] ??= [];
    bars.push({ minuteAt: row.minuteAt, open: row.open, high: row.high, low: row.low, close: row.close, volume: Number(row.volume) });
    return all;
  }, {});
}
function pickLiquidSymbols(byDate, maxSymbols) {
  const turnover = /* @__PURE__ */ new Map();
  for (const barsBySymbol of Object.values(byDate)) {
    for (const [symbol, bars] of Object.entries(barsBySymbol)) {
      turnover.set(symbol, (turnover.get(symbol) ?? 0) + bars.reduce((total, bar) => total + bar.close * bar.volume, 0));
    }
  }
  return Array.from(turnover.entries()).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).slice(0, maxSymbols).map(([symbol]) => symbol);
}
function prepareStoredMinuteResearchDataset(rows, maxUniverseSymbols) {
  const byDate = conditionBars(rows);
  return {
    byDate,
    dates: Object.keys(byDate).sort(),
    symbols: pickLiquidSymbols(byDate, maxUniverseSymbols)
  };
}
function classifyMarketRegime(bars) {
  if (!bars.length || bars[0].open <= 0) return "range";
  const open = bars[0].open;
  const close = bars.at(-1).close;
  const high = Math.max(...bars.map((bar) => bar.high));
  const low = Math.min(...bars.map((bar) => bar.low));
  const intradayRange = (high - low) / open * 100;
  const change = (close - open) / open * 100;
  if (intradayRange >= 5) return "volatile";
  if (change >= 1) return "trend_up";
  if (change <= -1) return "trend_down";
  return "range";
}
function evaluateDates(input) {
  const symbols = [];
  const daily = input.dates.map((tradingDate2) => {
    const trades = input.symbols.flatMap((symbol) => {
      const bars = input.byDate[tradingDate2]?.[symbol] ?? [];
      if (bars.length < 60) return [];
      const result = evaluateMinuteExpression({
        expression: input.expression,
        bars,
        minimumScore: input.minimumScore,
        policy: {
          stopLossPercent: input.configuration.stopLossPercent,
          takeProfitPercent: input.configuration.takeProfitPercent,
          maxHoldingBars: input.configuration.maxHoldingBars,
          feeRate: input.configuration.feeRate,
          slippageBps: input.configuration.slippageBps
        }
      });
      symbols.push({ tradingDate: tradingDate2, symbol, regime: classifyMarketRegime(bars), ...summarizeMinuteTrades(result.trades) });
      return result.trades;
    });
    return { tradingDate: tradingDate2, symbolCount: input.symbols.length, ...summarizeMinuteTrades(trades) };
  });
  const allTradesMetrics = {
    tradeCount: daily.reduce((total, item) => total + item.tradeCount, 0),
    winRate: 0,
    netReturnPercent: round(daily.reduce((total, item) => total + item.netReturnPercent, 0)),
    expectancyPercent: 0,
    maxDrawdownPercent: 0,
    profitFactor: null
  };
  const weighted = (field) => allTradesMetrics.tradeCount ? round(daily.reduce((total, item) => total + item[field] * item.tradeCount, 0) / allTradesMetrics.tradeCount) : 0;
  allTradesMetrics.winRate = weighted("winRate");
  allTradesMetrics.expectancyPercent = weighted("expectancyPercent");
  let cumulative = 0;
  let peak = 0;
  for (const item of daily) {
    cumulative += item.netReturnPercent;
    peak = Math.max(peak, cumulative);
    allTradesMetrics.maxDrawdownPercent = Math.min(allTradesMetrics.maxDrawdownPercent, cumulative - peak);
  }
  const profitableDays = daily.filter((item) => item.netReturnPercent > 0).reduce((total, item) => total + item.netReturnPercent, 0);
  const losingDays = Math.abs(daily.filter((item) => item.netReturnPercent < 0).reduce((total, item) => total + item.netReturnPercent, 0));
  allTradesMetrics.profitFactor = losingDays ? round(profitableDays / losingDays) : profitableDays > 0 ? null : 0;
  allTradesMetrics.maxDrawdownPercent = round(allTradesMetrics.maxDrawdownPercent);
  const dailyReturns = daily.map((item) => item.netReturnPercent);
  allTradesMetrics.positiveDayRate = daily.length ? round(daily.filter((item) => item.netReturnPercent > 0).length / daily.length * 100) : 0;
  allTradesMetrics.dailyReturnStdDev = round(standardDeviation(dailyReturns));
  return { metrics: allTradesMetrics, daily, symbols };
}
function researchFitness(training, validation) {
  const stability = training.tradeCount ? Math.min(1, training.tradeCount / 100) * 10 + (training.positiveDayRate ?? 0) * 0.12 - (training.dailyReturnStdDev ?? 0) * 4 - Math.abs(training.maxDrawdownPercent) * 4 : 0;
  const trainingProfitFactor = training.profitFactor ?? 3;
  const validationContribution = validation ? validation.expectancyPercent * 90 + validation.netReturnPercent * 0.2 + (validation.profitFactor ?? 3) * 6 - Math.abs(validation.maxDrawdownPercent) * 12 : -30;
  return round(training.expectancyPercent * 55 + training.winRate * 0.25 + training.netReturnPercent * 0.1 + trainingProfitFactor * 5 + stability + validationContribution);
}
function qualificationReasons(input) {
  const reasons = [];
  if (!input.validation) reasons.push("\uB3C5\uB9BD \uAC80\uC99D\uC77C\uC774 \uBD80\uC871\uD569\uB2C8\uB2E4.");
  if (input.training.tradeCount < input.config.minimumTrades) reasons.push(`\uD559\uC2B5 \uAC70\uB798 \uC218 ${input.config.minimumTrades}\uAC74 \uBBF8\uB9CC\uC785\uB2C8\uB2E4.`);
  if (input.training.expectancyPercent <= 0) reasons.push("\uD559\uC2B5 \uAE30\uB300\uAC12\uC774 0 \uC774\uD558\uC785\uB2C8\uB2E4.");
  if ((input.training.profitFactor ?? 3) < 1) reasons.push("\uD559\uC2B5 \uC190\uC775\uBE44\uAC00 1 \uBBF8\uB9CC\uC785\uB2C8\uB2E4.");
  if (input.training.maxDrawdownPercent < input.config.maxDrawdownPercent) reasons.push("\uD559\uC2B5 \uCD5C\uB300 \uB099\uD3ED \uD55C\uB3C4\uB97C \uCD08\uACFC\uD588\uC2B5\uB2C8\uB2E4.");
  if ((input.training.positiveDayRate ?? 0) < 45) reasons.push("\uD559\uC2B5 \uC591(+) \uC77C\uC218 \uBE44\uC728\uC774 45% \uBBF8\uB9CC\uC785\uB2C8\uB2E4.");
  if (input.validation) {
    if (input.validation.tradeCount < input.config.minimumValidationTrades) reasons.push(`\uB3C5\uB9BD \uAC80\uC99D \uAC70\uB798 \uC218 ${input.config.minimumValidationTrades}\uAC74 \uBBF8\uB9CC\uC785\uB2C8\uB2E4.`);
    if (input.validation.expectancyPercent <= 0) reasons.push("\uB3C5\uB9BD \uAC80\uC99D \uAE30\uB300\uAC12\uC774 0 \uC774\uD558\uC785\uB2C8\uB2E4.");
    if ((input.validation.profitFactor ?? 3) < 1) reasons.push("\uB3C5\uB9BD \uAC80\uC99D \uC190\uC775\uBE44\uAC00 1 \uBBF8\uB9CC\uC785\uB2C8\uB2E4.");
    if (input.validation.netReturnPercent <= 0) reasons.push("\uB3C5\uB9BD \uAC80\uC99D \uB204\uC801 \uC218\uC775\uB960\uC774 0 \uC774\uD558\uC785\uB2C8\uB2E4.");
    if (input.validation.maxDrawdownPercent < input.config.maxDrawdownPercent) reasons.push("\uB3C5\uB9BD \uAC80\uC99D \uCD5C\uB300 \uB099\uD3ED \uD55C\uB3C4\uB97C \uCD08\uACFC\uD588\uC2B5\uB2C8\uB2E4.");
    if ((input.validation.positiveDayRate ?? 0) < 45) reasons.push("\uB3C5\uB9BD \uAC80\uC99D \uC591(+) \uC77C\uC218 \uBE44\uC728\uC774 45% \uBBF8\uB9CC\uC785\uB2C8\uB2E4.");
  }
  return reasons;
}
function datasetFingerprint(rows) {
  const material = rows.map((row) => `${row.tradingDate}|${row.symbol}|${row.minuteAt.toISOString()}|${row.rawFingerprint}`).join("\n");
  return createHash6("sha256").update(material).digest("hex");
}
async function runMinuteResearchSweep(programId) {
  const db = await getDb();
  if (!db) throw new Error("1\uBD84\uBD09 \uC5F0\uAD6C \uB370\uC774\uD130\uBCA0\uC774\uC2A4\uB97C \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
  const program = (await db.select().from(minuteResearchPrograms).where(eq23(minuteResearchPrograms.id, programId)).limit(1))[0];
  if (!program) throw new Error("1\uBD84\uBD09 \uC5F0\uAD6C \uD504\uB85C\uADF8\uB7A8\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
  if (program.status !== "active") return { status: "paused", programId: program.id };
  const configuration = { ...DEFAULT_MINUTE_RESEARCH_CONFIGURATION, ...program.configurationJson };
  const dateRows = await db.selectDistinct({ tradingDate: intradayMinuteBars.tradingDate }).from(intradayMinuteBars).orderBy(desc19(intradayMinuteBars.tradingDate)).limit(configuration.lookbackTradingDays);
  const dates = dateRows.map((row) => row.tradingDate).sort();
  if (!dates.length) {
    await db.update(minuteResearchPrograms).set({ lastError: "\uC218\uC9D1\uB41C 1\uBD84\uBD09 \uB370\uC774\uD130\uAC00 \uC5C6\uC5B4 \uC5F0\uAD6C\uB97C \uC2DC\uC791\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4." }).where(eq23(minuteResearchPrograms.id, program.id));
    return { status: "waiting_for_data", programId: program.id };
  }
  const rows = await db.select().from(intradayMinuteBars).where(inArray3(intradayMinuteBars.tradingDate, dates)).orderBy(asc4(intradayMinuteBars.tradingDate), asc4(intradayMinuteBars.symbol), asc4(intradayMinuteBars.minuteAt));
  const fingerprint2 = datasetFingerprint(rows);
  const configurationFingerprint = createHash6("sha256").update(JSON.stringify(configuration)).digest("hex").slice(0, 16);
  const runKey = `minute-v1:${program.id}:${dates.at(-1)}:${fingerprint2.slice(0, 16)}:${configurationFingerprint}`;
  let existing = (await db.select().from(minuteResearchSweeps).where(eq23(minuteResearchSweeps.runKey, runKey)).limit(1))[0];
  if (existing?.status === "completed") return { status: "reused", programId: program.id, sweepId: existing.id, generatedCount: existing.generatedCount, promotedCount: existing.promotedCount };
  if (existing?.status === "running") {
    if (!isMinuteResearchSweepStale(existing)) return { status: "running", programId: program.id, sweepId: existing.id, generatedCount: existing.generatedCount, promotedCount: existing.promotedCount };
    const staleMessage = "\uBD84\uC11D \uC2E4\uD589\uC774 10\uBD84 \uC774\uC0C1 \uAC31\uC2E0\uB418\uC9C0 \uC54A\uC544 \uC911\uB2E8 \uCC98\uB9AC\uD588\uC2B5\uB2C8\uB2E4. \uBC30\uD2C0\uC744 \uB2E4\uC2DC \uC2DC\uC791\uD558\uBA74 \uAC19\uC740 \uC2E4\uC81C \uB370\uC774\uD130\uB85C \uC7AC\uAC80\uC99D\uD569\uB2C8\uB2E4.";
    await db.update(minuteResearchSweeps).set({ status: "failed", lastError: staleMessage, completedAt: /* @__PURE__ */ new Date() }).where(eq23(minuteResearchSweeps.id, existing.id));
    existing = { ...existing, status: "failed", lastError: staleMessage, completedAt: /* @__PURE__ */ new Date(), updatedAt: /* @__PURE__ */ new Date() };
  }
  let sweep = existing;
  if (!sweep) {
    const [created] = await db.insert(minuteResearchSweeps).values({ programId: program.id, runKey, tradingDatesJson: dates, datasetFingerprint: fingerprint2, configurationJson: configuration, status: "running" }).returning();
    sweep = (await db.select().from(minuteResearchSweeps).where(eq23(minuteResearchSweeps.id, created.id)).limit(1))[0];
  }
  if (!sweep) throw new Error("1\uBD84\uBD09 \uC5F0\uAD6C \uC2E4\uD589 \uAE30\uB85D\uC744 \uB9CC\uB4E4\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
  try {
    const dataset = prepareStoredMinuteResearchDataset(rows, configuration.maxUniverseSymbols);
    const { byDate, symbols } = dataset;
    if (!symbols.length) throw new Error("\uD3C9\uAC00 \uAC00\uB2A5\uD55C 1\uBD84\uBD09 \uC885\uBAA9\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.");
    const validationCount = dates.length >= 4 ? Math.min(configuration.validationTradingDays, Math.max(1, Math.floor(dates.length / 3))) : 0;
    const validationDates = validationCount ? dates.slice(-validationCount) : [];
    const trainingDates = validationCount ? dates.slice(0, -validationCount) : dates;
    const seed = Number.parseInt(createHash6("sha256").update(runKey).digest("hex").slice(0, 8), 16) || 1;
    const previousSurvivors = program.lastSweepId ? await db.select().from(minuteResearchCandidates).where(and15(eq23(minuteResearchCandidates.sweepId, program.lastSweepId), eq23(minuteResearchCandidates.status, "promoted"))).limit(1e3) : [];
    const commonRuleTypes = commonSurvivorRuleTypes(previousSurvivors);
    const diverseRandom = configuration.explorationMode === "diverse_random";
    const genomes = generateUniqueGenomes({
      seed,
      populationSize: configuration.combinationsPerSweep,
      minRules: diverseRandom ? 10 : Math.max(2, commonRuleTypes.length),
      maxRules: diverseRandom ? 12 : 5,
      maxDepth: 3,
      allowedRuleTypes: MINUTE_RULE_TYPES,
      requiredRuleTypes: diverseRandom ? [] : commonRuleTypes,
      requireUniqueRuleTypes: diverseRandom
    });
    await db.update(minuteResearchSweeps).set({ generatedCount: genomes.length, evaluatedCount: 0, promotedCount: 0, rejectedCount: 0, lastError: null }).where(eq23(minuteResearchSweeps.id, sweep.id));
    let promotedCount = 0;
    let rejectedCount = 0;
    let autoCollectedCount = 0;
    const promotedEvidence = [];
    for (let offset = 0; offset < genomes.length; offset += MINUTE_RESEARCH_EVALUATION_BATCH_SIZE) {
      const evaluated = genomes.slice(offset, offset + MINUTE_RESEARCH_EVALUATION_BATCH_SIZE).map((genome) => {
        const expression = genome.root;
        const training = evaluateDates({ expression, minimumScore: genome.minimumScore, byDate, dates: trainingDates, symbols, configuration });
        const validation = validationDates.length ? evaluateDates({ expression, minimumScore: genome.minimumScore, byDate, dates: validationDates, symbols, configuration }) : null;
        const reasons = qualificationReasons({ training: training.metrics, validation: validation?.metrics ?? null, config: configuration });
        const status = !validation ? "insufficient_validation" : reasons.length ? "rejected" : "promoted";
        if (status === "promoted") promotedCount += 1;
        else rejectedCount += 1;
        const strategyFingerprint = genome.fingerprint;
        const resultFingerprint = fingerprintResearchGenome({ root: genome.root, minimumScore: genome.minimumScore, datasetVersionKey: fingerprint2, assumptions: configuration });
        return { genome, training, validation, reasons, status, strategyFingerprint, resultFingerprint, fitnessScore: researchFitness(training.metrics, validation?.metrics ?? null) };
      });
      const inserted = await db.insert(minuteResearchCandidates).values(evaluated.map((item) => ({
        sweepId: sweep.id,
        strategyFingerprint: item.strategyFingerprint,
        fingerprint: item.resultFingerprint,
        rootGenomeJson: item.genome.root,
        minimumScore: item.genome.minimumScore,
        status: item.status,
        fitnessScore: String(item.fitnessScore),
        tradeCount: item.training.metrics.tradeCount,
        winRate: String(item.training.metrics.winRate),
        netReturnPercent: String(item.training.metrics.netReturnPercent),
        expectancyPercent: String(item.training.metrics.expectancyPercent),
        maxDrawdownPercent: String(item.training.metrics.maxDrawdownPercent),
        validationTradeCount: item.validation?.metrics.tradeCount ?? 0,
        validationReturnPercent: String(item.validation?.metrics.netReturnPercent ?? 0),
        validationExpectancyPercent: String(item.validation?.metrics.expectancyPercent ?? 0),
        validationMaxDrawdownPercent: String(item.validation?.metrics.maxDrawdownPercent ?? 0),
        inSampleMetricsJson: { dates: trainingDates, symbols, metrics: item.training.metrics },
        outOfSampleMetricsJson: item.validation ? { dates: validationDates, symbols, metrics: item.validation.metrics } : null,
        qualificationJson: { eligible: item.status === "promoted", reasons: item.reasons, requirements: { minimumTrades: configuration.minimumTrades, minimumValidationTrades: configuration.minimumValidationTrades, maxDrawdownPercent: configuration.maxDrawdownPercent, minimumProfitFactor: 1, slippageBps: configuration.slippageBps } }
      }))).returning();
      evaluated.forEach((item, index2) => {
        if (item.status === "promoted" && inserted[index2]) promotedEvidence.push({
          candidateId: inserted[index2].id,
          daily: [...item.training.daily, ...item.validation?.daily ?? []],
          symbols: [...item.training.symbols, ...item.validation?.symbols ?? []]
        });
      });
      for (const [index2, item] of Array.from(evaluated.entries())) {
        const candidateId = inserted[index2]?.id;
        if (item.status !== "promoted" || !candidateId) continue;
        const [preset] = await db.insert(strategyPresets).values({
          userId: program.userId,
          name: `\uC544\uB808\uB098 \uC0DD\uC874 \uCE74\uB4DC \xB7 ${item.strategyFingerprint.slice(0, 8)}`,
          description: `\uC2A4\uC715 ${sweep.id}\uC758 \uC2E4\uC81C 1\uBD84\uBD09 \uB3C5\uB9BD \uAC80\uC99D\uC744 \uD1B5\uACFC\uD574 \uC790\uB3D9 \uC218\uC9D1\uB41C \uC804\uB7B5 \uCE74\uB4DC`,
          rulesJson: flattenStrategyRules(item.genome.root),
          scoringJson: item.genome.root,
          isActive: false
        }).returning();
        await db.update(minuteResearchCandidates).set({ collectedPresetId: preset.id }).where(eq23(minuteResearchCandidates.id, candidateId));
        autoCollectedCount += 1;
      }
      await db.update(minuteResearchSweeps).set({
        generatedCount: genomes.length,
        evaluatedCount: Math.min(genomes.length, offset + evaluated.length),
        promotedCount,
        rejectedCount
      }).where(eq23(minuteResearchSweeps.id, sweep.id));
      await yieldMinuteResearchEventLoop();
    }
    const dailyRows = promotedEvidence.flatMap((item) => item.daily.map((day) => ({
      sweepId: sweep.id,
      candidateId: item.candidateId,
      tradingDate: day.tradingDate,
      symbolCount: day.symbolCount,
      tradeCount: day.tradeCount,
      winRate: String(day.winRate),
      netReturnPercent: String(day.netReturnPercent),
      expectancyPercent: String(day.expectancyPercent),
      maxDrawdownPercent: String(day.maxDrawdownPercent),
      metricsJson: day
    })));
    for (let offset = 0; offset < dailyRows.length; offset += 1e3) {
      await db.insert(minuteResearchDailyMetrics).values(dailyRows.slice(offset, offset + 1e3));
    }
    const symbolRows = promotedEvidence.flatMap((item) => item.symbols.map((symbolMetric) => ({
      sweepId: sweep.id,
      candidateId: item.candidateId,
      tradingDate: symbolMetric.tradingDate,
      symbol: symbolMetric.symbol,
      regime: symbolMetric.regime,
      tradeCount: symbolMetric.tradeCount,
      winRate: String(symbolMetric.winRate),
      netReturnPercent: String(symbolMetric.netReturnPercent),
      expectancyPercent: String(symbolMetric.expectancyPercent),
      maxDrawdownPercent: String(symbolMetric.maxDrawdownPercent),
      metricsJson: symbolMetric
    })));
    for (let offset = 0; offset < symbolRows.length; offset += 1e3) {
      await db.insert(minuteResearchSymbolMetrics).values(symbolRows.slice(offset, offset + 1e3));
    }
    const summary = { tradingDates: dates, trainingDates, validationDates, symbolCount: symbols.length, symbols, generatedCount: genomes.length, promotedCount, rejectedCount, autoCollectedCount, slippageBps: configuration.slippageBps, explorationMode: configuration.explorationMode, commonRuleTypes, qualificationRule: "\uB3C5\uB9BD \uAC80\uC99D \uAE30\uB300\uAC12\xB7\uB204\uC801 \uC218\uC775\uB960\xB7\uC190\uC775\uBE44\uAC00 \uC591\uC218\uC774\uACE0, \uD45C\uBCF8\xB7\uB099\uD3ED\xB7\uC548\uC815\uC131 \uAE30\uC900\uC744 \uD1B5\uACFC\uD55C \uC870\uAC74\uC2DD\uB9CC \uC2B9\uACA9" };
    await db.update(minuteResearchSweeps).set({ status: "completed", generatedCount: genomes.length, evaluatedCount: genomes.length, promotedCount, rejectedCount, summaryJson: summary, lastError: null, completedAt: /* @__PURE__ */ new Date() }).where(eq23(minuteResearchSweeps.id, sweep.id));
    await db.update(minuteResearchPrograms).set({ lastSweepId: sweep.id, lastError: null }).where(eq23(minuteResearchPrograms.id, program.id));
    return { status: "completed", programId: program.id, sweepId: sweep.id, ...summary };
  } catch (error) {
    const message = summarizeMinuteResearchError(error);
    await db.update(minuteResearchSweeps).set({ status: "failed", lastError: message, completedAt: /* @__PURE__ */ new Date() }).where(eq23(minuteResearchSweeps.id, sweep.id));
    await db.update(minuteResearchPrograms).set({ lastError: message }).where(eq23(minuteResearchPrograms.id, program.id));
    throw error;
  }
}
async function getMinuteResearchDashboard(userId) {
  const db = await getDb();
  if (!db) return { program: null, sweeps: [], promoted: [], cumulative: [], commonRuleTypes: [], distribution: null, failureReasons: [], regimePerformance: [], symbolPerformance: [], dataCoverage: null };
  const program = (await db.select().from(minuteResearchPrograms).where(eq23(minuteResearchPrograms.userId, userId)).limit(1))[0] ?? null;
  const sweeps = program ? await db.select().from(minuteResearchSweeps).where(eq23(minuteResearchSweeps.programId, program.id)).orderBy(desc19(minuteResearchSweeps.updatedAt)).limit(12) : [];
  const candidateRows = sweeps.length ? await db.select().from(minuteResearchCandidates).where(inArray3(minuteResearchCandidates.sweepId, sweeps.map((item) => item.id))).orderBy(desc19(minuteResearchCandidates.fitnessScore)).limit(500) : [];
  const latestSweep = sweeps[0] ?? null;
  const latestCandidates = latestSweep ? await db.select().from(minuteResearchCandidates).where(eq23(minuteResearchCandidates.sweepId, latestSweep.id)).orderBy(desc19(minuteResearchCandidates.fitnessScore)).limit(1e4) : [];
  const promoted = candidateRows.filter((item) => item.status === "promoted").slice(0, 40);
  const grouped = /* @__PURE__ */ new Map();
  for (const candidate of candidateRows.filter((item) => item.status === "promoted")) {
    const records = grouped.get(candidate.strategyFingerprint) ?? [];
    records.push(candidate);
    grouped.set(candidate.strategyFingerprint, records);
  }
  const cumulative = Array.from(grouped.entries()).map(([strategyFingerprint, records]) => ({
    strategyFingerprint,
    verifiedSweepCount: records.length,
    averageFitness: round(mean(records.map((item) => Number(item.fitnessScore)))),
    averageValidationReturnPercent: round(mean(records.map((item) => Number(item.validationReturnPercent)))),
    averageValidationExpectancyPercent: round(mean(records.map((item) => Number(item.validationExpectancyPercent)))),
    worstValidationMaxDrawdownPercent: round(Math.min(...records.map((item) => Number(item.validationMaxDrawdownPercent)))),
    totalValidationTrades: records.reduce((total, item) => total + item.validationTradeCount, 0),
    representative: records[0]
  })).sort((left, right) => right.verifiedSweepCount - left.verifiedSweepCount || right.averageFitness - left.averageFitness).slice(0, 20);
  const statusCounts = latestCandidates.reduce((all, candidate) => ({ ...all, [candidate.status]: (all[candidate.status] ?? 0) + 1 }), {});
  const buckets = [
    { label: "\u2264 -2%", match: (value) => value <= -2 },
    { label: "-2% ~ 0%", match: (value) => value > -2 && value <= 0 },
    { label: "0% ~ 2%", match: (value) => value > 0 && value <= 2 },
    { label: "2% \uCD08\uACFC", match: (value) => value > 2 }
  ].map((bucket) => ({ label: bucket.label, count: latestCandidates.filter((candidate) => bucket.match(Number(candidate.validationReturnPercent))).length }));
  const reasonCounts = /* @__PURE__ */ new Map();
  for (const candidate of latestCandidates.filter((candidate2) => candidate2.status !== "promoted")) {
    const reasons = candidate.qualificationJson?.reasons ?? [];
    for (const reason of reasons) if (typeof reason === "string") reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
  }
  const failureReasons = Array.from(reasonCounts.entries()).map(([reason, count3]) => ({ reason, count: count3 })).sort((left, right) => right.count - left.count).slice(0, 6);
  const symbolMetrics = promoted.length ? await db.select().from(minuteResearchSymbolMetrics).where(inArray3(minuteResearchSymbolMetrics.candidateId, promoted.map((candidate) => candidate.id))).limit(1e4) : [];
  const regimePerformance = ["trend_up", "trend_down", "range", "volatile"].map((regime) => {
    const rows = symbolMetrics.filter((row) => row.regime === regime);
    return {
      regime,
      observationCount: rows.length,
      tradeCount: rows.reduce((total, row) => total + row.tradeCount, 0),
      averageReturnPercent: round(mean(rows.map((row) => Number(row.netReturnPercent)))),
      averageExpectancyPercent: round(mean(rows.map((row) => Number(row.expectancyPercent)))),
      worstDrawdownPercent: rows.length ? round(Math.min(...rows.map((row) => Number(row.maxDrawdownPercent)))) : null
    };
  });
  const symbolGroups = /* @__PURE__ */ new Map();
  for (const row of symbolMetrics) {
    const records = symbolGroups.get(row.symbol) ?? [];
    records.push(row);
    symbolGroups.set(row.symbol, records);
  }
  const symbolPerformance = Array.from(symbolGroups.entries()).map(([symbol, rows]) => ({
    symbol,
    observationCount: rows.length,
    tradeCount: rows.reduce((total, row) => total + row.tradeCount, 0),
    averageReturnPercent: round(mean(rows.map((row) => Number(row.netReturnPercent)))),
    averageExpectancyPercent: round(mean(rows.map((row) => Number(row.expectancyPercent)))),
    worstDrawdownPercent: round(Math.min(...rows.map((row) => Number(row.maxDrawdownPercent))))
  })).sort((left, right) => right.observationCount - left.observationCount || right.averageReturnPercent - left.averageReturnPercent).slice(0, 20);
  const coverage = await db.selectDistinct({ tradingDate: intradayMinuteBars.tradingDate }).from(intradayMinuteBars).orderBy(desc19(intradayMinuteBars.tradingDate)).limit(30);
  const commonRuleTypes = commonSurvivorRuleTypes(promoted);
  return { program, sweeps, promoted, cumulative, commonRuleTypes, distribution: latestSweep ? { statusCounts, buckets, candidateCount: latestCandidates.length } : null, failureReasons, regimePerformance, symbolPerformance, dataCoverage: coverage.length ? { tradingDateCount: coverage.length, firstDate: coverage.at(-1)?.tradingDate ?? null, lastDate: coverage[0]?.tradingDate ?? null } : null };
}
async function getPublicMinuteResearchDashboard() {
  const db = await getDb();
  if (!db) return { program: null, sweeps: [], promoted: [], cumulative: [], commonRuleTypes: [], distribution: null, failureReasons: [], regimePerformance: [], symbolPerformance: [], dataCoverage: null };
  const program = (await db.select().from(minuteResearchPrograms).orderBy(desc19(minuteResearchPrograms.updatedAt)).limit(1))[0];
  return program ? getMinuteResearchDashboard(program.userId) : { program: null, sweeps: [], promoted: [], cumulative: [], commonRuleTypes: [], distribution: null, failureReasons: [], regimePerformance: [], symbolPerformance: [], dataCoverage: null };
}
async function getMinuteResearchProgramByTaskUid(taskUid) {
  const db = await getDb();
  if (!db) return null;
  return (await db.select().from(minuteResearchPrograms).where(and15(eq23(minuteResearchPrograms.scheduleCronTaskUid, taskUid), eq23(minuteResearchPrograms.status, "active"))).limit(1))[0] ?? null;
}
var queuedMinuteResearchSweeps = /* @__PURE__ */ new Map();
function enqueueMinuteResearchSweep(programId, runner = runMinuteResearchSweep) {
  if (queuedMinuteResearchSweeps.has(programId)) return { status: "queued", programId, reused: true };
  const task = new Promise((resolve) => setTimeout(resolve, 0)).then(() => runner(programId)).catch((error) => console.error(`[MinuteResearch] background sweep ${programId} failed`, error)).then(() => void 0).finally(() => {
    queuedMinuteResearchSweeps.delete(programId);
  });
  queuedMinuteResearchSweeps.set(programId, task);
  return { status: "queued", programId, reused: false };
}

// server/routers/minuteResearch.ts
var configSchema = z13.object({
  combinationsPerSweep: z13.number().int().min(100).max(5e4),
  maxUniverseSymbols: z13.number().int().min(1).max(100),
  lookbackTradingDays: z13.number().int().min(1).max(60),
  validationTradingDays: z13.number().int().min(1).max(20),
  minimumTrades: z13.number().int().min(1).max(1e4),
  minimumValidationTrades: z13.number().int().min(1).max(1e4),
  maxDrawdownPercent: z13.number().min(-100).max(0),
  stopLossPercent: z13.number().positive().max(30),
  takeProfitPercent: z13.number().positive().max(100),
  maxHoldingBars: z13.number().int().min(1).max(390),
  feeRate: z13.number().min(0).max(0.1),
  slippageBps: z13.number().min(0).max(500),
  explorationMode: z13.enum(["survivor_core", "diverse_random"]).default("survivor_core")
});
async function requireDb9() {
  const db = await getDb();
  if (!db) throw new Error("1\uBD84\uBD09 \uC5F0\uAD6C \uB370\uC774\uD130\uBCA0\uC774\uC2A4\uB97C \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
  return db;
}
async function preparePersonalArenaProgram(userId, configuration) {
  const db = await requireDb9();
  const current = (await db.select().from(minuteResearchPrograms).where(eq24(minuteResearchPrograms.userId, userId)).limit(1))[0];
  if (current?.scheduleCronTaskUid) throw new Error("\uC608\uC57D \uC5F0\uAD6C \uD504\uB85C\uADF8\uB7A8\uC740 \uC6B4\uC601\uC790 \uC5F0\uAD6C\uC18C\uC5D0\uC11C\uB9CC \uAD00\uB9AC\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
  if (!current) {
    const [created] = await db.insert(minuteResearchPrograms).values({
      userId,
      name: "\uAC1C\uC778 \uC544\uB808\uB098",
      status: "active",
      cronExpression: "manual",
      scheduleCronTaskUid: null,
      configurationJson: configuration
    }).returning();
    return created.id;
  }
  await db.update(minuteResearchPrograms).set({
    name: "\uAC1C\uC778 \uC544\uB808\uB098",
    status: "active",
    cronExpression: "manual",
    configurationJson: configuration,
    lastError: null
  }).where(eq24(minuteResearchPrograms.id, current.id));
  return current.id;
}
var minuteResearchRouter = router({
  publicDashboard: publicProcedure.query(() => getPublicMinuteResearchDashboard()),
  dashboard: operatorProcedure.query(({ ctx }) => getMinuteResearchDashboard(ctx.user.id)),
  /** 로그인 사용자 본인 범위의 수동 연구만 실행하며, 예약·계좌·주문 경로를 사용하지 않는다. */
  personalDashboard: protectedProcedure.query(({ ctx }) => getMinuteResearchDashboard(ctx.user.id)),
  runPersonal: protectedProcedure.input(configSchema.default(DEFAULT_MINUTE_RESEARCH_CONFIGURATION)).mutation(async ({ ctx, input }) => {
    const programId = await preparePersonalArenaProgram(ctx.user.id, input);
    return runMinuteResearchSweep(programId);
  }),
  saveProgram: operatorProcedure.input(z13.object({
    name: z13.string().trim().min(2).max(120),
    cronExpression: z13.string().regex(/^\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+$/),
    configuration: configSchema.default(DEFAULT_MINUTE_RESEARCH_CONFIGURATION),
    enabled: z13.boolean().default(true)
  })).mutation(async ({ ctx, input }) => {
    const db = await requireDb9();
    const current = (await db.select().from(minuteResearchPrograms).where(eq24(minuteResearchPrograms.userId, ctx.user.id)).limit(1))[0];
    const sessionToken = parseCookie3(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
    if (!current) {
      const job2 = await createHeartbeatJob({ name: `minute-research-${ctx.user.id}`, cron: input.cronExpression, path: "/api/scheduled/minute-research", payload: {}, description: "\uC2E4\uC81C \uC800\uC7A5 1\uBD84\uBD09 \uC870\uAC74\uC2DD \uB300\uB7C9 \uAC80\uC99D" }, sessionToken);
      const [created] = await db.insert(minuteResearchPrograms).values({ userId: ctx.user.id, name: input.name, status: input.enabled ? "active" : "paused", cronExpression: input.cronExpression, scheduleCronTaskUid: job2.taskUid, configurationJson: input.configuration }).returning();
      if (!input.enabled) await updateHeartbeatJob(job2.taskUid, { enable: false }, sessionToken);
      return { programId: created.id, taskUid: job2.taskUid, nextExecutionAt: job2.nextExecutionAt ?? null };
    }
    if (!current.scheduleCronTaskUid) {
      const job2 = await createHeartbeatJob({ name: `minute-research-${ctx.user.id}`, cron: input.cronExpression, path: "/api/scheduled/minute-research", payload: {}, description: "\uC2E4\uC81C \uC800\uC7A5 1\uBD84\uBD09 \uC870\uAC74\uC2DD \uB300\uB7C9 \uAC80\uC99D" }, sessionToken);
      await db.update(minuteResearchPrograms).set({ name: input.name, status: input.enabled ? "active" : "paused", cronExpression: input.cronExpression, scheduleCronTaskUid: job2.taskUid, configurationJson: input.configuration }).where(eq24(minuteResearchPrograms.id, current.id));
      if (!input.enabled) await updateHeartbeatJob(job2.taskUid, { enable: false }, sessionToken);
      return { programId: current.id, taskUid: job2.taskUid, nextExecutionAt: job2.nextExecutionAt ?? null };
    }
    const job = await updateHeartbeatJob(current.scheduleCronTaskUid, { cron: input.cronExpression, path: "/api/scheduled/minute-research", payload: {}, description: "\uC2E4\uC81C \uC800\uC7A5 1\uBD84\uBD09 \uC870\uAC74\uC2DD \uB300\uB7C9 \uAC80\uC99D", enable: input.enabled }, sessionToken);
    await db.update(minuteResearchPrograms).set({ name: input.name, status: input.enabled ? "active" : "paused", cronExpression: input.cronExpression, configurationJson: input.configuration }).where(eq24(minuteResearchPrograms.id, current.id));
    return { programId: current.id, taskUid: current.scheduleCronTaskUid, nextExecutionAt: job.nextExecutionAt ?? null };
  }),
  runNow: operatorProcedure.mutation(async ({ ctx }) => {
    const db = await requireDb9();
    const program = (await db.select().from(minuteResearchPrograms).where(and16(eq24(minuteResearchPrograms.userId, ctx.user.id), eq24(minuteResearchPrograms.status, "active"))).limit(1))[0];
    if (!program) throw new Error("\uD65C\uC131 1\uBD84\uBD09 \uC5F0\uAD6C \uD504\uB85C\uADF8\uB7A8\uC744 \uBA3C\uC800 \uC800\uC7A5\uD558\uC138\uC694.");
    return enqueueMinuteResearchSweep(program.id);
  }),
  removeSchedule: operatorProcedure.mutation(async ({ ctx }) => {
    const db = await requireDb9();
    const program = (await db.select().from(minuteResearchPrograms).where(eq24(minuteResearchPrograms.userId, ctx.user.id)).limit(1))[0];
    if (!program?.scheduleCronTaskUid) return { removed: false };
    const sessionToken = parseCookie3(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
    await deleteHeartbeatJob(program.scheduleCronTaskUid, sessionToken);
    await db.update(minuteResearchPrograms).set({ status: "paused", scheduleCronTaskUid: null }).where(eq24(minuteResearchPrograms.id, program.id));
    return { removed: true };
  })
});

// server/routers/strategyCards.ts
import { and as and17, desc as desc20, eq as eq25, inArray as inArray4, isNull } from "drizzle-orm";
import { z as z14 } from "zod";
function flattenRules(node) {
  if (!node || typeof node !== "object") return [];
  const candidate = node;
  if (Array.isArray(candidate.children)) return candidate.children.flatMap(flattenRules);
  return typeof candidate.type === "string" ? [candidate] : [];
}
function cardTitle(fingerprint2) {
  return `\uC544\uB808\uB098 \uCE74\uB4DC \xB7 ${fingerprint2.slice(0, 8)}`;
}
async function requireDb10() {
  const db = await getDb();
  if (!db) throw new Error("\uC804\uB7B5 \uCE74\uB4DC \uCEEC\uB809\uC158 \uB370\uC774\uD130\uBCA0\uC774\uC2A4\uB97C \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
  return db;
}
var strategyCardsRouter = router({
  myCollectionAnalysis: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb10();
    const presets = await db.select().from(strategyPresets).where(eq25(strategyPresets.userId, ctx.user.id)).orderBy(desc20(strategyPresets.updatedAt)).limit(120);
    const presetIds = presets.map((preset) => preset.id);
    const candidates = presetIds.length ? await db.select().from(minuteResearchCandidates).where(inArray4(minuteResearchCandidates.collectedPresetId, presetIds)).orderBy(desc20(minuteResearchCandidates.createdAt)).limit(360) : [];
    const candidateIds = candidates.map((candidate) => candidate.id);
    const daily = candidateIds.length ? await db.select().from(minuteResearchDailyMetrics).where(inArray4(minuteResearchDailyMetrics.candidateId, candidateIds)).orderBy(desc20(minuteResearchDailyMetrics.tradingDate)).limit(1200) : [];
    const symbols = candidateIds.length ? await db.select().from(minuteResearchSymbolMetrics).where(inArray4(minuteResearchSymbolMetrics.candidateId, candidateIds)).orderBy(desc20(minuteResearchSymbolMetrics.tradingDate)).limit(1500) : [];
    const sweepIds = Array.from(new Set(candidates.map((candidate) => candidate.sweepId)));
    const sweeps = sweepIds.length ? await db.select().from(minuteResearchSweeps).where(inArray4(minuteResearchSweeps.id, sweepIds)).limit(120) : [];
    const presetById = new Map(presets.map((preset) => [preset.id, preset]));
    const candidateByPreset = /* @__PURE__ */ new Map();
    for (const candidate of candidates) if (candidate.collectedPresetId && !candidateByPreset.has(candidate.collectedPresetId)) candidateByPreset.set(candidate.collectedPresetId, candidate);
    const dailyByCandidate = /* @__PURE__ */ new Map();
    for (const row of daily) {
      const rows = dailyByCandidate.get(row.candidateId) ?? [];
      rows.push(row);
      dailyByCandidate.set(row.candidateId, rows);
    }
    const cards = Array.from(candidateByPreset.entries()).map(([presetId, candidate]) => {
      const battles = dailyByCandidate.get(candidate.id) ?? [];
      return {
        presetId,
        candidateId: candidate.id,
        name: presetById.get(presetId)?.name ?? `\uC804\uB7B5 \uCE74\uB4DC #${presetId}`,
        strategyFingerprint: candidate.strategyFingerprint,
        validationReturnPercent: Number(candidate.validationReturnPercent),
        winRate: Number(candidate.winRate),
        validationTradeCount: candidate.validationTradeCount,
        maxDrawdownPercent: Number(candidate.validationMaxDrawdownPercent),
        dailyBattleCount: battles.length,
        positiveBattleRate: battles.length ? battles.filter((row) => Number(row.netReturnPercent) > 0).length / battles.length * 100 : 0,
        collectedAt: candidate.createdAt
      };
    });
    const trendByDate = /* @__PURE__ */ new Map();
    for (const row of daily) {
      const entries = trendByDate.get(row.tradingDate) ?? [];
      entries.push({ netReturnPercent: Number(row.netReturnPercent), winRate: Number(row.winRate) });
      trendByDate.set(row.tradingDate, entries);
    }
    const trend = Array.from(trendByDate.entries()).sort(([a], [b]) => a.localeCompare(b)).slice(-30).map(([tradingDate2, values]) => ({ tradingDate: tradingDate2, averageReturnPercent: values.reduce((total, value) => total + value.netReturnPercent, 0) / values.length, averageWinRate: values.reduce((total, value) => total + value.winRate, 0) / values.length, battleCount: values.length }));
    const symbolByCode = /* @__PURE__ */ new Map();
    for (const row of symbols) {
      const entries = symbolByCode.get(row.symbol) ?? [];
      entries.push({ netReturnPercent: Number(row.netReturnPercent), winRate: Number(row.winRate), tradeCount: row.tradeCount });
      symbolByCode.set(row.symbol, entries);
    }
    const symbolPerformance = Array.from(symbolByCode.entries()).map(([symbol, values]) => ({ symbol, averageReturnPercent: values.reduce((total, value) => total + value.netReturnPercent, 0) / values.length, averageWinRate: values.reduce((total, value) => total + value.winRate, 0) / values.length, tradeCount: values.reduce((total, value) => total + value.tradeCount, 0), battleCount: values.length })).sort((a, b) => b.averageReturnPercent - a.averageReturnPercent).slice(0, 8);
    const sweepById = new Map(sweeps.map((sweep) => [sweep.id, sweep]));
    const arenaBySweep = /* @__PURE__ */ new Map();
    for (const candidate of candidates) {
      const entries = arenaBySweep.get(candidate.sweepId) ?? [];
      entries.push(candidate);
      arenaBySweep.set(candidate.sweepId, entries);
    }
    const arenas = Array.from(arenaBySweep.entries()).map(([sweepId, entries]) => {
      const sweep = sweepById.get(sweepId);
      return { sweepId, datasetFingerprint: sweep?.datasetFingerprint ?? "unknown", completedAt: sweep?.completedAt ?? null, cardCount: entries.length, averageReturnPercent: entries.reduce((total, entry) => total + Number(entry.validationReturnPercent), 0) / entries.length, averageWinRate: entries.reduce((total, entry) => total + Number(entry.winRate), 0) / entries.length };
    }).sort((a, b) => b.sweepId - a.sweepId).slice(0, 8);
    const cumulativeReturnPercent = cards.reduce((total, card) => total + card.validationReturnPercent, 0);
    const averageWinRate = cards.length ? cards.reduce((total, card) => total + card.winRate, 0) / cards.length : 0;
    const cardPeriodPerformance = cards.map((card) => {
      const candidate = candidateByPreset.get(card.presetId);
      const history = candidate ? (dailyByCandidate.get(candidate.id) ?? []).sort((left, right) => left.tradingDate.localeCompare(right.tradingDate)).slice(-30).map((row) => ({ tradingDate: row.tradingDate, netReturnPercent: Number(row.netReturnPercent), winRate: Number(row.winRate), tradeCount: row.tradeCount })) : [];
      return { presetId: card.presetId, name: card.name, history };
    }).filter((card) => card.history.length > 0);
    return { summary: { collectedCount: cards.length, cumulativeReturnPercent, averageWinRate, battleCount: cards.reduce((total, card) => total + card.validationTradeCount, 0) }, cards: cards.sort((a, b) => b.validationReturnPercent - a.validationReturnPercent), trend, cardPeriodPerformance, symbolPerformance, arenas };
  }),
  listComments: publicProcedure.input(z14.object({ cardId: z14.number().int().positive() })).query(async ({ input }) => {
    const db = await requireDb10();
    const comments = await db.select().from(publicStrategyCardComments).where(eq25(publicStrategyCardComments.cardId, input.cardId)).orderBy(desc20(publicStrategyCardComments.createdAt)).limit(50);
    const commenters = comments.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray4(users.id, comments.map((comment) => comment.userId))) : [];
    const names = new Map(commenters.map((user) => [user.id, user.name || "\uC775\uBA85 \uC5F0\uAD6C\uC790"]));
    return comments.map((comment) => ({ ...comment, userName: names.get(comment.userId) ?? "\uC775\uBA85 \uC5F0\uAD6C\uC790" }));
  }),
  addComment: protectedProcedure.input(z14.object({ cardId: z14.number().int().positive(), body: z14.string().trim().min(1, "\uB313\uAE00 \uB0B4\uC6A9\uC744 \uC785\uB825\uD558\uC138\uC694.").max(800, "\uB313\uAE00\uC740 800\uC790\uAE4C\uC9C0 \uC785\uB825\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.") })).mutation(async ({ ctx, input }) => {
    const db = await requireDb10();
    const card = (await db.select({ id: publicStrategyCards.id }).from(publicStrategyCards).where(and17(eq25(publicStrategyCards.id, input.cardId), eq25(publicStrategyCards.visibility, "public"))).limit(1))[0];
    if (!card) throw new Error("\uACF5\uAC1C\uB41C \uC804\uB7B5 \uCE74\uB4DC\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    const [created] = await db.insert(publicStrategyCardComments).values({ cardId: card.id, userId: ctx.user.id, body: input.body }).returning();
    return { commentId: created.id };
  }),
  toggleFavorite: protectedProcedure.input(z14.object({ cardId: z14.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb10();
    const card = (await db.select({ id: publicStrategyCards.id }).from(publicStrategyCards).where(and17(eq25(publicStrategyCards.id, input.cardId), eq25(publicStrategyCards.visibility, "public"))).limit(1))[0];
    if (!card) throw new Error("\uACF5\uAC1C\uB41C \uC804\uB7B5 \uCE74\uB4DC\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    const existing = (await db.select().from(publicStrategyCardFavorites).where(and17(eq25(publicStrategyCardFavorites.cardId, card.id), eq25(publicStrategyCardFavorites.userId, ctx.user.id))).limit(1))[0];
    if (existing) await db.delete(publicStrategyCardFavorites).where(eq25(publicStrategyCardFavorites.id, existing.id));
    else await db.insert(publicStrategyCardFavorites).values({ cardId: card.id, userId: ctx.user.id });
    const count3 = (await db.select().from(publicStrategyCardFavorites).where(eq25(publicStrategyCardFavorites.cardId, card.id))).length;
    return { favorited: !existing, favoriteCount: count3 };
  }),
  listHeroConditions: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb10();
    const snapshots = await db.select().from(htsConditionSnapshots).where(eq25(htsConditionSnapshots.userId, ctx.user.id)).orderBy(desc20(htsConditionSnapshots.capturedAt)).limit(100);
    const latest = /* @__PURE__ */ new Map();
    for (const snapshot of snapshots) if (!latest.has(snapshot.conditionSequence)) latest.set(snapshot.conditionSequence, snapshot);
    return Array.from(latest.values()).map((snapshot) => ({ id: snapshot.id, conditionSequence: snapshot.conditionSequence, conditionName: snapshot.conditionName, capturedAt: snapshot.capturedAt, candidateCount: Array.isArray(snapshot.candidatesJson) ? snapshot.candidatesJson.length : 0, historicalBacktestEligible: false }));
  }),
  collectHeroCondition: protectedProcedure.input(z14.object({ snapshotId: z14.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb10();
    const snapshot = (await db.select().from(htsConditionSnapshots).where(and17(eq25(htsConditionSnapshots.id, input.snapshotId), eq25(htsConditionSnapshots.userId, ctx.user.id))).limit(1))[0];
    if (!snapshot) throw new Error("\uB3D9\uAE30\uD654\uB41C \uC601\uC6C5\uBB38 \uC870\uAC74\uAC80\uC0C9\uC2DD \uC2A4\uB0C5\uC0F7\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    const [preset] = await db.insert(strategyPresets).values({
      userId: ctx.user.id,
      name: `\uC601\uC6C5\uBB38 \uC5F0\uB3D9 \xB7 ${snapshot.conditionName}`,
      description: `\uC601\uC6C5\uBB38 \uC870\uAC74\uC2DD #${snapshot.conditionSequence}\uC758 \uD604\uC7AC \uD6C4\uBCF4 \uC2A4\uB0C5\uC0F7 \uC5F0\uB3D9 \uCE74\uB4DC. \uB0B4\uBD80 \uC218\uC2DD\uC740 API\uB85C \uC5ED\uC9C1\uB82C\uD654\uB418\uC9C0 \uC54A\uC544 \uACFC\uAC70 \uBC31\uD14C\uC2A4\uD2B8\uC5D0\uB294 \uC0AC\uC6A9\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.`,
      rulesJson: [{ id: `hero-${snapshot.id}`, type: "linked_hero_condition", conditionSequence: snapshot.conditionSequence, conditionName: snapshot.conditionName, snapshotId: snapshot.id }],
      scoringJson: { source: "linked_hero_condition", snapshotId: snapshot.id, capturedAt: snapshot.capturedAt, historicalBacktestEligible: false },
      isActive: false
    }).returning();
    return { presetId: preset.id, conditionSequence: snapshot.conditionSequence, conditionName: snapshot.conditionName, historicalBacktestEligible: false };
  }),
  listPublic: publicProcedure.input(z14.object({ limit: z14.number().int().min(1).max(100).default(24) }).optional()).query(async ({ input, ctx }) => {
    const db = await requireDb10();
    const cards = await db.select().from(publicStrategyCards).where(eq25(publicStrategyCards.visibility, "public")).orderBy(desc20(publicStrategyCards.publishedAt)).limit(input?.limit ?? 24);
    const creators = cards.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray4(users.id, cards.map((card) => card.creatorUserId))) : [];
    const creatorName = new Map(creators.map((user) => [user.id, user.name || "\uC775\uBA85 \uC5F0\uAD6C\uC790"]));
    const cardIds = cards.map((card) => card.id);
    const comments = cardIds.length ? await db.select().from(publicStrategyCardComments).where(inArray4(publicStrategyCardComments.cardId, cardIds)).limit(1e4) : [];
    const favorites = cardIds.length ? await db.select().from(publicStrategyCardFavorites).where(inArray4(publicStrategyCardFavorites.cardId, cardIds)).limit(1e4) : [];
    const commentCount = /* @__PURE__ */ new Map();
    const favoriteCount = /* @__PURE__ */ new Map();
    for (const comment of comments) commentCount.set(comment.cardId, (commentCount.get(comment.cardId) ?? 0) + 1);
    for (const favorite of favorites) favoriteCount.set(favorite.cardId, (favoriteCount.get(favorite.cardId) ?? 0) + 1);
    const myFavoriteIds = new Set(favorites.filter((favorite) => favorite.userId === ctx.user?.id).map((favorite) => favorite.cardId));
    return cards.map((card) => ({ ...card, creatorName: creatorName.get(card.creatorUserId) ?? "\uC775\uBA85 \uC5F0\uAD6C\uC790", commentCount: commentCount.get(card.id) ?? 0, favoriteCount: favoriteCount.get(card.id) ?? 0, favoritedByCurrentUser: myFavoriteIds.has(card.id) }));
  }),
  publish: protectedProcedure.input(z14.object({ candidateId: z14.number().int().positive(), title: z14.string().trim().min(2).max(120).optional() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb10();
    const candidate = (await db.select().from(minuteResearchCandidates).where(eq25(minuteResearchCandidates.id, input.candidateId)).limit(1))[0];
    if (!candidate || candidate.status !== "promoted") throw new Error("\uB3C5\uB9BD \uAC80\uC99D\uC744 \uD1B5\uACFC\uD55C \uC804\uB7B5 \uCE74\uB4DC\uB9CC \uACF5\uAC1C\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
    const sweep = (await db.select().from(minuteResearchSweeps).where(eq25(minuteResearchSweeps.id, candidate.sweepId)).limit(1))[0];
    const program = sweep ? (await db.select().from(minuteResearchPrograms).where(and17(eq25(minuteResearchPrograms.id, sweep.programId), eq25(minuteResearchPrograms.userId, ctx.user.id))).limit(1))[0] : null;
    if (!sweep || !program) throw new Error("\uBCF8\uC778\uC774 \uC0DD\uC131\uD55C \uC544\uB808\uB098 \uCE74\uB4DC\uB9CC \uACF5\uAC1C\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
    const repeats = await db.select().from(minuteResearchCandidates).where(and17(eq25(minuteResearchCandidates.strategyFingerprint, candidate.strategyFingerprint), eq25(minuteResearchCandidates.status, "promoted"))).orderBy(desc20(minuteResearchCandidates.createdAt)).limit(100);
    const repeatedOutOfSample = repeats.map((row) => Number(row.validationReturnPercent)).filter(Number.isFinite);
    const values = {
      creatorUserId: ctx.user.id,
      sourceCandidateId: candidate.id,
      sourceSweepId: sweep.id,
      strategyFingerprint: candidate.strategyFingerprint,
      version: 1,
      parentCardId: null,
      title: input.title ?? cardTitle(candidate.strategyFingerprint),
      rootGenomeJson: candidate.rootGenomeJson,
      minimumScore: candidate.minimumScore,
      datasetFingerprint: sweep.datasetFingerprint,
      arenaEvidenceJson: { sweepId: sweep.id, runKey: sweep.runKey, tradingDates: sweep.tradingDatesJson, configuration: sweep.configurationJson },
      validationEvidenceJson: { status: candidate.status, inSample: candidate.inSampleMetricsJson, outOfSample: candidate.outOfSampleMetricsJson, qualification: candidate.qualificationJson, validationTrades: candidate.validationTradeCount, validationReturnPercent: candidate.validationReturnPercent, validationMaxDrawdownPercent: candidate.validationMaxDrawdownPercent, walkForward: { method: "rolling_arena_out_of_sample", verificationCount: repeats.length, averageReturnPercent: repeatedOutOfSample.length ? repeatedOutOfSample.reduce((total, value) => total + value, 0) / repeatedOutOfSample.length : 0, worstReturnPercent: repeatedOutOfSample.length ? Math.min(...repeatedOutOfSample) : 0 } },
      visibility: "public"
    };
    const original = (await db.select().from(publicStrategyCards).where(and17(eq25(publicStrategyCards.sourceCandidateId, candidate.id), isNull(publicStrategyCards.parentCardId))).limit(1))[0];
    if (original) await db.update(publicStrategyCards).set({ title: values.title, rootGenomeJson: values.rootGenomeJson, minimumScore: values.minimumScore, datasetFingerprint: values.datasetFingerprint, arenaEvidenceJson: values.arenaEvidenceJson, validationEvidenceJson: values.validationEvidenceJson, visibility: "public" }).where(eq25(publicStrategyCards.id, original.id));
    else await db.insert(publicStrategyCards).values(values);
    const card = original ?? (await db.select().from(publicStrategyCards).where(and17(eq25(publicStrategyCards.sourceCandidateId, candidate.id), isNull(publicStrategyCards.parentCardId))).limit(1))[0];
    return { cardId: card.id, title: card.title, strategyFingerprint: card.strategyFingerprint };
  }),
  fork: protectedProcedure.input(z14.object({ cardId: z14.number().int().positive(), title: z14.string().trim().min(2).max(120).optional() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb10();
    const parent = (await db.select().from(publicStrategyCards).where(and17(eq25(publicStrategyCards.id, input.cardId), eq25(publicStrategyCards.visibility, "public"))).limit(1))[0];
    if (!parent) throw new Error("\uACF5\uAC1C\uB41C \uC804\uB7B5 \uCE74\uB4DC\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    const latestChild = (await db.select().from(publicStrategyCards).where(eq25(publicStrategyCards.parentCardId, parent.id)).orderBy(desc20(publicStrategyCards.version)).limit(1))[0];
    const version = Math.max(parent.version, latestChild?.version ?? 0) + 1;
    const title = input.title ?? `${parent.title} \xB7 \uD3EC\uD06C v${version}`;
    const [created] = await db.insert(publicStrategyCards).values({
      creatorUserId: ctx.user.id,
      sourceCandidateId: parent.sourceCandidateId,
      sourceSweepId: parent.sourceSweepId,
      strategyFingerprint: parent.strategyFingerprint,
      version,
      parentCardId: parent.id,
      title,
      rootGenomeJson: parent.rootGenomeJson,
      minimumScore: parent.minimumScore,
      datasetFingerprint: parent.datasetFingerprint,
      arenaEvidenceJson: parent.arenaEvidenceJson,
      validationEvidenceJson: parent.validationEvidenceJson,
      visibility: "public"
    }).returning();
    return { cardId: created.id, parentCardId: parent.id, version, title };
  }),
  collect: protectedProcedure.input(z14.object({ cardId: z14.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb10();
    const card = (await db.select().from(publicStrategyCards).where(and17(eq25(publicStrategyCards.id, input.cardId), eq25(publicStrategyCards.visibility, "public"))).limit(1))[0];
    if (!card) throw new Error("\uACF5\uAC1C\uB41C \uC804\uB7B5 \uCE74\uB4DC\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    const existing = (await db.select().from(publicStrategyCardCollections).where(and17(eq25(publicStrategyCardCollections.cardId, card.id), eq25(publicStrategyCardCollections.userId, ctx.user.id))).limit(1))[0];
    if (existing) return { collected: false, presetId: existing.presetId };
    const [preset] = await db.insert(strategyPresets).values({ userId: ctx.user.id, name: `${card.title} \xB7 \uB0B4 \uCEEC\uB809\uC158`, description: `\uACF5\uAC1C \uCE74\uB4DC ${card.strategyFingerprint.slice(0, 12)}\uC744(\uB97C) \uB0B4 \uC5F0\uAD6C\uC18C\uB85C \uC218\uC9D1\uD55C \uC0AC\uBCF8`, rulesJson: flattenRules(card.rootGenomeJson), scoringJson: card.rootGenomeJson, isActive: false }).returning();
    await db.insert(publicStrategyCardCollections).values({ cardId: card.id, userId: ctx.user.id, presetId: preset.id });
    return { collected: true, presetId: preset.id };
  })
});

// server/routers/profile.ts
import { eq as eq26 } from "drizzle-orm";
import { z as z15 } from "zod";
var AVATAR_IDS = ["nebula", "fox", "robot", "tiger", "owl", "dragon"];
async function requireDb11() {
  const db = await getDb();
  if (!db) throw new Error("\uB370\uC774\uD130\uBCA0\uC774\uC2A4 \uC5F0\uACB0\uC744 \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
  return db;
}
var profileRouter = router({
  me: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb11();
    const [user] = await db.select({ name: users.name, email: users.email, avatarId: users.avatarId }).from(users).where(eq26(users.id, ctx.user.id)).limit(1);
    return user ?? { name: ctx.user.name, email: ctx.user.email, avatarId: "nebula" };
  }),
  updateAvatar: protectedProcedure.input(z15.object({ avatarId: z15.enum(AVATAR_IDS) })).mutation(async ({ ctx, input }) => {
    const db = await requireDb11();
    await db.update(users).set({ avatarId: input.avatarId }).where(eq26(users.id, ctx.user.id));
    return { avatarId: input.avatarId };
  })
});

// server/routers/sharedDatasets.ts
import { randomInt } from "node:crypto";
import { and as and18, asc as asc5, count, desc as desc21, eq as eq27, inArray as inArray5, sql as sql3 } from "drizzle-orm";
import { TRPCError as TRPCError15 } from "@trpc/server";
import { z as z16 } from "zod";
var symbolSchema = z16.object({ symbol: z16.string().regex(/^\d{6}$/), name: z16.string().min(1).max(120) });
var rulesSchema = z16.array(z16.object({ id: z16.string(), type: z16.string(), enabled: z16.boolean(), weight: z16.number(), config: z16.record(z16.string(), z16.union([z16.string(), z16.number(), z16.boolean()])) }));
var collectionSchema = z16.object({
  symbolCount: z16.number().int().min(4).max(20).default(10),
  sampleDays: z16.number().int().min(5).max(60).default(15),
  randomSeed: z16.number().int().min(1).max(2147483647).optional()
});
var PUBLIC_DATASET_PAGE_SIZE = 6;
async function requireDb12() {
  const db = await getDb();
  if (!db) throw new TRPCError15({ code: "INTERNAL_SERVER_ERROR", message: "\uACF5\uC6A9 \uC5F0\uAD6C \uB370\uC774\uD130\uBCA0\uC774\uC2A4\uB97C \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
  return db;
}
async function requireConnectedKiwoomTerminal(db, userId) {
  const latest = (await db.select().from(kiwoomTerminalConnectionChecks).where(eq27(kiwoomTerminalConnectionChecks.userId, userId)).orderBy(desc21(kiwoomTerminalConnectionChecks.checkedAt)).limit(1))[0];
  if (!latest || latest.status !== "connected") {
    throw new TRPCError15({ code: "PRECONDITION_FAILED", message: "\uACF5\uC6A9 \uB370\uC774\uD130 \uC218\uC9D1 \uC804 \uD604\uC7AC \uCEF4\uD4E8\uD130\uC5D0\uC11C check-kiwoom-rest-connection.cmd\uB97C \uC2E4\uD589\uD574 \uD0A4\uC6C0 REST \uB2E8\uB9D0 \uC778\uC99D\uC744 \uC644\uB8CC\uD558\uC138\uC694." });
  }
  return latest;
}
var sharedDatasetsRouter = router({
  listPublic: publicProcedure.input(z16.object({ page: z16.number().int().min(1).max(1e4).optional() }).optional()).query(async ({ input }) => {
    const db = await requireDb12();
    const page = input?.page ?? 1;
    const publicReady = and18(eq27(researchDatasets.visibility, "shared_public"), eq27(researchDatasets.qualityStatus, "ready"));
    const [totalRow] = await db.select({ total: count() }).from(researchDatasets).where(publicReady);
    const totalCount = Number(totalRow?.total ?? 0);
    const totalPages = Math.max(1, Math.ceil(totalCount / PUBLIC_DATASET_PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const items = await db.select({
      id: researchDatasets.id,
      name: researchDatasets.name,
      source: researchDatasets.source,
      versionKey: researchDatasets.versionKey,
      universeJson: researchDatasets.universeJson,
      startDate: researchDatasets.startDate,
      endDate: researchDatasets.endDate,
      barCount: researchDatasets.barCount,
      minuteBarCount: researchDatasets.minuteBarCount,
      adjustmentBasis: researchDatasets.adjustmentBasis,
      randomSeed: researchDatasets.randomSeed,
      sourceFingerprint: researchDatasets.sourceFingerprint,
      sourceCapturedAt: researchDatasets.sourceCapturedAt,
      readyAt: researchDatasets.readyAt
    }).from(researchDatasets).where(publicReady).orderBy(desc21(researchDatasets.readyAt)).limit(PUBLIC_DATASET_PAGE_SIZE).offset((safePage - 1) * PUBLIC_DATASET_PAGE_SIZE);
    return { items, page: safePage, pageSize: PUBLIC_DATASET_PAGE_SIZE, totalCount, totalPages };
  }),
  vaultSummary: publicProcedure.query(async () => {
    const db = await requireDb12();
    const ready = and18(eq27(researchDatasets.visibility, "shared_public"), eq27(researchDatasets.qualityStatus, "ready"));
    const [summary] = await db.select({
      datasetCount: count(),
      dailyBarCount: sql3`coalesce(sum(${researchDatasets.barCount}), 0)`,
      fiveMinuteBarCount: sql3`coalesce(sum(${researchDatasets.minuteBarCount}), 0)`,
      oldestReadyAt: sql3`min(${researchDatasets.readyAt})`,
      newestReadyAt: sql3`max(${researchDatasets.readyAt})`
    }).from(researchDatasets).where(ready);
    return {
      datasetCount: Number(summary?.datasetCount ?? 0),
      dailyBarCount: Number(summary?.dailyBarCount ?? 0),
      fiveMinuteBarCount: Number(summary?.fiveMinuteBarCount ?? 0),
      oldestReadyAt: summary?.oldestReadyAt ?? null,
      newestReadyAt: summary?.newestReadyAt ?? null,
      retention: "\uC644\uB8CC\uB41C \uACF5\uC6A9 \uC6D0\uBCF8\uC740 \uBC84\uC804 \uD0A4\xB7\uC6D0\uBCF8 \uC9C0\uBB38\uACFC \uD568\uAED8 \uBCF4\uAD00\uD558\uBA70, \uAC19\uC740 \uC6D0\uBCF8\uC740 \uC911\uBCF5 \uC801\uC7AC\uD558\uC9C0 \uC54A\uACE0 \uC7AC\uC0AC\uC6A9\uD569\uB2C8\uB2E4."
    };
  }),
  collectRandomShared: protectedProcedure.input(collectionSchema).mutation(async ({ ctx, input }) => {
    const db = await requireDb12();
    await requireConnectedKiwoomTerminal(db, ctx.user.id);
    const activeRequest = (await db.select().from(sharedDatasetCollectionRequests).where(and18(eq27(sharedDatasetCollectionRequests.requestedByUserId, ctx.user.id), inArray5(sharedDatasetCollectionRequests.status, ["queued", "running"]))).orderBy(desc21(sharedDatasetCollectionRequests.requestedAt)).limit(1))[0];
    if (activeRequest) return { status: activeRequest.status, requestId: activeRequest.id, datasetId: activeRequest.datasetId, randomSeed: activeRequest.randomSeed, reusedRequest: true };
    const seed = input.randomSeed ?? randomInt(1, 2147483647);
    const requestFingerprint = `shared-local:${ctx.user.id}:${seed}:${input.symbolCount}:${input.sampleDays}`;
    const existing = (await db.select().from(sharedDatasetCollectionRequests).where(eq27(sharedDatasetCollectionRequests.requestFingerprint, requestFingerprint)).limit(1))[0];
    if (existing) return { status: existing.status, requestId: existing.id, datasetId: existing.datasetId, randomSeed: existing.randomSeed, reusedRequest: true };
    const [created] = await db.insert(sharedDatasetCollectionRequests).values({ requestedByUserId: ctx.user.id, randomSeed: seed, symbolCount: input.symbolCount, sampleDays: input.sampleDays, requestFingerprint, status: "queued" }).returning();
    return { status: "queued", requestId: created.id, datasetId: null, randomSeed: seed, reusedRequest: false };
  }),
  resumeCollection: protectedProcedure.input(z16.object({ requestId: z16.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb12();
    await requireConnectedKiwoomTerminal(db, ctx.user.id);
    const request = (await db.select().from(sharedDatasetCollectionRequests).where(and18(eq27(sharedDatasetCollectionRequests.id, input.requestId), eq27(sharedDatasetCollectionRequests.requestedByUserId, ctx.user.id))).limit(1))[0];
    if (!request) throw new TRPCError15({ code: "NOT_FOUND", message: "\uB0B4 \uC218\uC9D1 \uC694\uCCAD\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    if (!["failed", "cancelled"].includes(request.status)) throw new TRPCError15({ code: "BAD_REQUEST", message: "\uC911\uB2E8\uB418\uC5C8\uAC70\uB098 \uC2E4\uD328\uD55C \uC218\uC9D1 \uC694\uCCAD\uB9CC \uB2E4\uC2DC \uC774\uC5B4\uAC08 \uC218 \uC788\uC2B5\uB2C8\uB2E4." });
    const active = (await db.select().from(sharedDatasetCollectionRequests).where(and18(eq27(sharedDatasetCollectionRequests.requestedByUserId, ctx.user.id), inArray5(sharedDatasetCollectionRequests.status, ["queued", "running"]))).orderBy(desc21(sharedDatasetCollectionRequests.requestedAt)).limit(1))[0];
    if (active) return { status: active.status, requestId: active.id, reusedActiveRequest: true };
    await db.update(sharedDatasetCollectionRequests).set({ status: "queued", startedAt: null, lastError: null, completedAt: null, progressJson: { stage: "resume_queued", message: "\uC774\uC804 \uC218\uC9D1 \uC9C0\uC810\uBD80\uD130 \uB2E4\uC2DC \uC774\uC5B4\uAC08 \uC900\uBE44\uAC00 \uB418\uC5C8\uC2B5\uB2C8\uB2E4.", updatedAt: (/* @__PURE__ */ new Date()).toISOString() }, resumeCount: sql3`${sharedDatasetCollectionRequests.resumeCount} + 1` }).where(eq27(sharedDatasetCollectionRequests.id, request.id));
    return { status: "queued", requestId: request.id, reusedActiveRequest: false };
  }),
  listMyCollectionRequests: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb12();
    return db.select().from(sharedDatasetCollectionRequests).where(eq27(sharedDatasetCollectionRequests.requestedByUserId, ctx.user.id)).orderBy(desc21(sharedDatasetCollectionRequests.requestedAt)).limit(50);
  }),
  runBacktest: protectedProcedure.input(z16.object({ datasetId: z16.number().int().positive(), presetId: z16.number().int().positive(), timeframe: z16.enum(["daily", "five_minute"]), symbol: z16.string().regex(/^\d{6}$/), minScore: z16.number().min(0).max(100).default(70), holdingBars: z16.number().int().min(1).max(120).default(5), feeRate: z16.number().min(0).max(0.1).default(3e-4), slippageBps: z16.number().min(0).max(1e4).default(8) })).mutation(async ({ ctx, input }) => {
    const db = await requireDb12();
    const dataset = (await db.select().from(researchDatasets).where(and18(eq27(researchDatasets.id, input.datasetId), eq27(researchDatasets.visibility, "shared_public"), eq27(researchDatasets.qualityStatus, "ready"))).limit(1))[0];
    if (!dataset) throw new TRPCError15({ code: "NOT_FOUND", message: "\uACF5\uC6A9\uC73C\uB85C \uC900\uBE44\uB41C \uB370\uC774\uD130\uC14B\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    const preset = (await db.select().from(strategyPresets).where(and18(eq27(strategyPresets.id, input.presetId), eq27(strategyPresets.userId, ctx.user.id))).limit(1))[0];
    if (!preset) throw new TRPCError15({ code: "NOT_FOUND", message: "\uB0B4 \uC870\uAC74\uC2DD \uCE74\uB4DC\uB9CC \uACF5\uC6A9 \uB370\uC774\uD130\uC14B\uC5D0\uC11C \uBC31\uD14C\uC2A4\uD2B8\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4." });
    const rows = input.timeframe === "daily" ? await db.select().from(researchDailyBars).where(and18(eq27(researchDailyBars.datasetId, dataset.id), eq27(researchDailyBars.symbol, input.symbol))).orderBy(asc5(researchDailyBars.date)) : await db.select().from(researchFiveMinuteBars).where(and18(eq27(researchFiveMinuteBars.datasetId, dataset.id), eq27(researchFiveMinuteBars.symbol, input.symbol))).orderBy(asc5(researchFiveMinuteBars.intervalAt));
    const dailyContextRows = input.timeframe === "five_minute" ? await db.select().from(researchDailyBars).where(and18(eq27(researchDailyBars.datasetId, dataset.id), eq27(researchDailyBars.symbol, input.symbol))).orderBy(asc5(researchDailyBars.date)) : [];
    const bars = input.timeframe === "daily" ? rows.map((row) => ({ date: row.date, open: row.open, high: row.high, low: row.low, close: row.close, volume: Number(row.volume), turnover: Number(row.turnover) })) : rows.map((row) => ({ date: row.intervalAt.toISOString(), open: row.open, high: row.high, low: row.low, close: row.close, volume: Number(row.volume), turnover: Number(row.close) * Number(row.volume) }));
    if (bars.length < 60) throw new TRPCError15({ code: "PRECONDITION_FAILED", message: `${input.timeframe === "daily" ? "\uC77C\uBD09" : "5\uBD84\uBD09"} \uBC31\uD14C\uC2A4\uD2B8\uC5D0\uB294 \uCD5C\uC18C 60\uAC1C\uC758 \uACE0\uC815 \uC6D0\uBCF8 \uBD09\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.` });
    const dailyContextBars = dailyContextRows.map((row) => ({ date: row.date, open: row.open, high: row.high, low: row.low, close: row.close, volume: Number(row.volume), turnover: Number(row.turnover) }));
    const conditionContextAtIndex = input.timeframe === "five_minute" ? createFiveMinuteContextProvider(bars, dailyContextBars) : void 0;
    const assumptions = { timeframe: input.timeframe, minScore: input.minScore, holdingBars: input.holdingBars, feeRate: input.feeRate, slippageBps: input.slippageBps, informationCutoffBars: 1, datasetVersionKey: dataset.versionKey, sourceFingerprint: dataset.sourceFingerprint };
    const result = runDailyBacktest({ bars, rules: rulesSchema.parse(preset.rulesJson), minScore: input.minScore, holdingDays: input.holdingBars, feeRate: input.feeRate + input.slippageBps / 1e4, entryDelayDays: 1, entryTiming: "open", conditionContextAtIndex });
    const [stored] = await db.insert(sharedDatasetBacktests).values({ userId: ctx.user.id, datasetId: dataset.id, presetId: preset.id, timeframe: input.timeframe, symbol: input.symbol, assumptionsJson: assumptions, resultsJson: result }).returning();
    return { backtestId: stored.id, datasetId: dataset.id, datasetVersionKey: dataset.versionKey, sourceFingerprint: dataset.sourceFingerprint, symbol: input.symbol, timeframe: input.timeframe, assumptions, result };
  }),
  runMultiDatasetBacktest: protectedProcedure.input(z16.object({ datasetIds: z16.array(z16.number().int().positive()).min(2).max(12), presetId: z16.number().int().positive(), timeframe: z16.enum(["daily", "five_minute"]), minScore: z16.number().min(0).max(100).default(70), holdingBars: z16.number().int().min(1).max(120).default(5), feeRate: z16.number().min(0).max(0.1).default(3e-4), slippageBps: z16.number().min(0).max(1e4).default(8) })).mutation(async ({ ctx, input }) => {
    const ids = Array.from(new Set(input.datasetIds));
    if (ids.length !== input.datasetIds.length) throw new TRPCError15({ code: "BAD_REQUEST", message: "\uBE44\uAD50\uD560 \uB370\uC774\uD130\uC14B\uC740 \uC911\uBCF5 \uC5C6\uC774 \uC120\uD0DD\uD558\uC138\uC694." });
    const db = await requireDb12();
    const preset = (await db.select().from(strategyPresets).where(and18(eq27(strategyPresets.id, input.presetId), eq27(strategyPresets.userId, ctx.user.id))).limit(1))[0];
    if (!preset) throw new TRPCError15({ code: "NOT_FOUND", message: "\uB0B4 \uC870\uAC74\uC2DD \uCE74\uB4DC\uB9CC \uC5EC\uB7EC \uACF5\uC6A9 \uB370\uC774\uD130\uC14B\uC5D0\uC11C \uBE44\uAD50\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4." });
    const datasets = await db.select().from(researchDatasets).where(and18(inArray5(researchDatasets.id, ids), eq27(researchDatasets.visibility, "shared_public"), eq27(researchDatasets.qualityStatus, "ready")));
    if (datasets.length !== ids.length) throw new TRPCError15({ code: "NOT_FOUND", message: "\uC120\uD0DD\uD55C \uACF5\uC6A9 \uB370\uC774\uD130\uC14B \uC911 \uC900\uBE44\uB418\uC9C0 \uC54A\uC558\uAC70\uB098 \uC811\uADFC\uD560 \uC218 \uC5C6\uB294 \uD56D\uBAA9\uC774 \uC788\uC2B5\uB2C8\uB2E4." });
    const rules = rulesSchema.parse(preset.rulesJson);
    const summaries = [];
    for (const dataset of datasets.sort((left, right) => ids.indexOf(left.id) - ids.indexOf(right.id))) {
      const universe = Array.isArray(dataset.universeJson) ? dataset.universeJson.flatMap((item) => item && typeof item === "object" && typeof item.symbol === "string" ? [String(item.symbol)] : []) : [];
      const symbolResults = [];
      const skippedSymbols = [];
      for (const symbol of universe) {
        const rows = input.timeframe === "daily" ? await db.select().from(researchDailyBars).where(and18(eq27(researchDailyBars.datasetId, dataset.id), eq27(researchDailyBars.symbol, symbol))).orderBy(asc5(researchDailyBars.date)) : await db.select().from(researchFiveMinuteBars).where(and18(eq27(researchFiveMinuteBars.datasetId, dataset.id), eq27(researchFiveMinuteBars.symbol, symbol))).orderBy(asc5(researchFiveMinuteBars.intervalAt));
        const dailyContextRows = input.timeframe === "five_minute" ? await db.select().from(researchDailyBars).where(and18(eq27(researchDailyBars.datasetId, dataset.id), eq27(researchDailyBars.symbol, symbol))).orderBy(asc5(researchDailyBars.date)) : [];
        const bars = input.timeframe === "daily" ? rows.map((row) => ({ date: row.date, open: row.open, high: row.high, low: row.low, close: row.close, volume: Number(row.volume), turnover: Number(row.turnover) })) : rows.map((row) => ({ date: row.intervalAt.toISOString(), open: row.open, high: row.high, low: row.low, close: row.close, volume: Number(row.volume), turnover: Number(row.close) * Number(row.volume) }));
        if (bars.length < 60) {
          skippedSymbols.push(symbol);
          continue;
        }
        const dailyContextBars = dailyContextRows.map((row) => ({ date: row.date, open: row.open, high: row.high, low: row.low, close: row.close, volume: Number(row.volume), turnover: Number(row.turnover) }));
        const conditionContextAtIndex = input.timeframe === "five_minute" ? createFiveMinuteContextProvider(bars, dailyContextBars) : void 0;
        const result = runDailyBacktest({ bars, rules, minScore: input.minScore, holdingDays: input.holdingBars, feeRate: input.feeRate + input.slippageBps / 1e4, entryDelayDays: 1, entryTiming: "open", conditionContextAtIndex });
        symbolResults.push({ symbol, totalReturn: result.totalReturn, winRate: result.winRate, tradeCount: result.tradeCount, maxDrawdown: result.maxDrawdown, tradeSamples: result.trades.slice(-5) });
      }
      const evaluatedSymbolCount = symbolResults.length;
      const average2 = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
      const summary = { datasetId: dataset.id, datasetName: dataset.name, datasetVersionKey: dataset.versionKey, sourceFingerprint: dataset.sourceFingerprint, timeframe: input.timeframe, evaluatedSymbolCount, skippedSymbols, averageReturn: average2(symbolResults.map((item) => item.totalReturn)), averageWinRate: average2(symbolResults.map((item) => item.winRate)), totalTradeCount: symbolResults.reduce((sum, item) => sum + item.tradeCount, 0), worstDrawdown: symbolResults.length ? Math.min(...symbolResults.map((item) => item.maxDrawdown)) : null, strategySnapshot: { name: preset.name, rulesJson: rules, scoringJson: preset.scoringJson ?? null }, symbolResults };
      const assumptions = { comparison: "multi_shared_dataset", timeframe: input.timeframe, minScore: input.minScore, holdingBars: input.holdingBars, feeRate: input.feeRate, slippageBps: input.slippageBps, informationCutoffBars: 1, datasetVersionKey: dataset.versionKey, sourceFingerprint: dataset.sourceFingerprint };
      await db.insert(sharedDatasetBacktests).values({ userId: ctx.user.id, datasetId: dataset.id, presetId: preset.id, timeframe: input.timeframe, symbol: "__MULTI_DATASET__", assumptionsJson: assumptions, resultsJson: summary });
      summaries.push(summary);
    }
    const ranked = [...summaries].sort((left, right) => (right.averageReturn ?? -Infinity) - (left.averageReturn ?? -Infinity));
    return { presetId: preset.id, presetName: preset.name, timeframe: input.timeframe, assumptions: { minScore: input.minScore, holdingBars: input.holdingBars, feeRate: input.feeRate, slippageBps: input.slippageBps, informationCutoffBars: 1 }, ranked, totalDatasetCount: ranked.length };
  }),
  listMyBacktests: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb12();
    return db.select().from(sharedDatasetBacktests).where(eq27(sharedDatasetBacktests.userId, ctx.user.id)).orderBy(desc21(sharedDatasetBacktests.createdAt)).limit(30);
  })
});

// server/routers/survivalResearch.ts
import { and as and19, desc as desc22, eq as eq28, inArray as inArray6 } from "drizzle-orm";
import { TRPCError as TRPCError16 } from "@trpc/server";
import { z as z17 } from "zod";

// server/quant/survivalSelection.ts
var SURVIVAL_CRITERIA = {
  minimumArenaCount: 2,
  minimumReturnPerArena: 0,
  minimumTotalTradeCount: 120,
  minimumAverageWinRate: 40,
  maximumWorstDrawdown: -20
};
function evaluateSurvivalEvidence(arenas) {
  const totalTradeCount = arenas.reduce((sum, arena) => sum + arena.totalTradeCount, 0);
  const averageWinRate = arenas.length ? arenas.reduce((sum, arena) => sum + arena.averageWinRate, 0) / arenas.length : 0;
  const worstDrawdown = arenas.length ? Math.min(...arenas.map((arena) => arena.worstDrawdown)) : Number.NEGATIVE_INFINITY;
  const positiveArenaCount = arenas.filter((arena) => arena.averageReturn > 0).length;
  const failures = [
    arenas.length < SURVIVAL_CRITERIA.minimumArenaCount ? `\uC544\uB808\uB098 ${SURVIVAL_CRITERIA.minimumArenaCount}\uAC1C \uC774\uC0C1 \uD544\uC694` : null,
    arenas.some((arena) => arena.averageReturn <= SURVIVAL_CRITERIA.minimumReturnPerArena) ? "\uBAA8\uB4E0 \uC544\uB808\uB098\uC758 \uD3C9\uADE0 \uC218\uC775\uB960\uC774 \uC591\uC218\uAC00 \uC544\uB2D8" : null,
    totalTradeCount < SURVIVAL_CRITERIA.minimumTotalTradeCount ? `\uB204\uC801 \uAC70\uB798 ${SURVIVAL_CRITERIA.minimumTotalTradeCount}\uD68C \uBBF8\uB9CC` : null,
    averageWinRate < SURVIVAL_CRITERIA.minimumAverageWinRate ? `\uD3C9\uADE0 \uC2B9\uB960 ${SURVIVAL_CRITERIA.minimumAverageWinRate}% \uBBF8\uB9CC` : null,
    worstDrawdown < SURVIVAL_CRITERIA.maximumWorstDrawdown ? `\uCD5C\uB300 \uB099\uD3ED ${SURVIVAL_CRITERIA.maximumWorstDrawdown}% \uD558\uD68C` : null
  ].filter((value) => Boolean(value));
  const status = failures.length === 0 ? "promoted" : positiveArenaCount > 0 && worstDrawdown >= SURVIVAL_CRITERIA.maximumWorstDrawdown ? "observe" : "rejected";
  return { status, failures, summary: { arenaCount: arenas.length, positiveArenaCount, totalTradeCount, averageWinRate, worstDrawdown } };
}

// server/routers/survivalResearch.ts
async function requireDb13() {
  const db = await getDb();
  if (!db) throw new TRPCError16({ code: "INTERNAL_SERVER_ERROR", message: "\uC0DD\uC874 \uCE74\uB4DC \uC5F0\uAD6C \uB370\uC774\uD130\uBCA0\uC774\uC2A4\uB97C \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
  return db;
}
function numberAt(value, key) {
  const candidate = value && typeof value === "object" ? value[key] : void 0;
  const number = Number(candidate);
  return Number.isFinite(number) ? number : 0;
}
function sourceRules(preset) {
  return Array.isArray(preset.rulesJson) ? preset.rulesJson.flatMap((rule) => {
    if (!rule || typeof rule !== "object") return [];
    const config = rule.config;
    if (!config || typeof config !== "object") return [];
    const sourceRule = config.sourceRule;
    return typeof sourceRule === "string" ? [sourceRule] : [];
  }) : [];
}
var survivalResearchRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb13();
    const ledgers = await db.select().from(strategySurvivalLedgers).where(eq28(strategySurvivalLedgers.userId, ctx.user.id)).orderBy(desc22(strategySurvivalLedgers.createdAt)).limit(30);
    if (!ledgers.length) return [];
    const presetIds = Array.from(new Set(ledgers.map((item) => item.presetId)));
    const presets = await db.select({ id: strategyPresets.id, name: strategyPresets.name, rulesJson: strategyPresets.rulesJson }).from(strategyPresets).where(and19(eq28(strategyPresets.userId, ctx.user.id), inArray6(strategyPresets.id, presetIds)));
    return ledgers.map((ledger) => ({ ...ledger, preset: presets.find((preset) => preset.id === ledger.presetId) ?? null }));
  }),
  evaluate: protectedProcedure.input(z17.object({ presetIds: z17.array(z17.number().int().positive()).min(1).max(12) })).mutation(async ({ ctx, input }) => {
    const db = await requireDb13();
    const presets = await db.select().from(strategyPresets).where(and19(eq28(strategyPresets.userId, ctx.user.id), inArray6(strategyPresets.id, input.presetIds)));
    if (!presets.length) throw new TRPCError16({ code: "NOT_FOUND", message: "\uD3C9\uAC00\uD560 \uB0B4 \uC870\uAC74\uC2DD \uCE74\uB4DC\uB97C \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4." });
    const records = await db.select().from(sharedDatasetBacktests).where(and19(eq28(sharedDatasetBacktests.userId, ctx.user.id), eq28(sharedDatasetBacktests.timeframe, "five_minute"))).orderBy(desc22(sharedDatasetBacktests.createdAt));
    const datasets = await db.select({ id: researchDatasets.id, name: researchDatasets.name }).from(researchDatasets);
    const saved = [];
    const seen = /* @__PURE__ */ new Set();
    for (const record of records) {
      if (!input.presetIds.includes(record.presetId)) continue;
      const key = `${record.presetId}:${record.datasetId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      saved.push(record);
    }
    const ledgerRows = [];
    for (const preset of presets) {
      const arenas = saved.filter((record) => record.presetId === preset.id).map((record) => {
        const result = record.resultsJson;
        const dataset = datasets.find((item) => item.id === record.datasetId);
        return {
          datasetId: record.datasetId,
          datasetName: dataset?.name ?? `\uB370\uC774\uD130\uC14B #${record.datasetId}`,
          averageReturn: numberAt(result, "averageReturn"),
          averageWinRate: numberAt(result, "averageWinRate"),
          totalTradeCount: numberAt(result, "totalTradeCount"),
          worstDrawdown: numberAt(result, "worstDrawdown")
        };
      });
      const decision = evaluateSurvivalEvidence(arenas);
      const directRules = sourceRules(preset);
      const improvementPlan = decision.status === "promoted" ? { nextAction: "\uC0DD\uC874 \uCE74\uB4DC\uB85C \uBCF4\uC874\uD558\uACE0 \uC0C8 \uACF5\uC6A9 \uC544\uB808\uB098\uAC00 \uCD94\uAC00\uB420 \uB54C \uC7AC\uAC80\uC99D\uD569\uB2C8\uB2E4.", focusRules: directRules, researchOnly: true } : decision.status === "observe" ? { nextAction: "\uC591\uC218 \uC544\uB808\uB098\uC758 \uADDC\uCE59\uC740 \uC720\uC9C0\uD558\uACE0, \uC74C\uC218 \uC544\uB808\uB098\uC5D0\uC11C \uAC01 \uD575\uC2EC \uC9C0\uD45C\uB97C \uD558\uB098\uC529 \uC81C\uAC70\xB7\uC644\uD654\uD574 \uC6D0\uC778\uC744 \uBE44\uAD50\uD569\uB2C8\uB2E4.", focusRules: directRules, researchOnly: true } : { nextAction: "\uD604\uC7AC \uC870\uD569\uC740 \uC0DD\uC874 \uCE74\uB4DC\uB85C \uC2B9\uACA9\uD558\uC9C0 \uC54A\uACE0, \uB099\uD3ED \uB610\uB294 \uC544\uB808\uB098 \uC77C\uAD00\uC131\uC744 \uC6B0\uC120 \uAC1C\uC120\uD558\uB294 \uB2E8\uC77C \uC9C0\uD45C \uC2E4\uD5D8\uC73C\uB85C \uBCF4\uB0C5\uB2C8\uB2E4.", focusRules: directRules, researchOnly: true };
      await db.insert(strategySurvivalLedgers).values({ userId: ctx.user.id, presetId: preset.id, timeframe: "five_minute", status: decision.status, criteriaJson: SURVIVAL_CRITERIA, evidenceJson: { arenas, ...decision.summary, failures: decision.failures }, improvementPlanJson: improvementPlan });
      ledgerRows.push({ presetId: preset.id, presetName: preset.name, status: decision.status, criteria: SURVIVAL_CRITERIA, evidence: { arenas, ...decision.summary, failures: decision.failures }, improvementPlan });
    }
    return { evaluatedAt: (/* @__PURE__ */ new Date()).toISOString(), ledgers: ledgerRows };
  })
});

// server/routers/chartData.ts
import { z as z18 } from "zod";
import { asc as asc6, and as and20, eq as eq29, desc as desc23, gte, lte, inArray as inArray7 } from "drizzle-orm";
import { TRPCError as TRPCError17 } from "@trpc/server";
var chartDataRouter = router({
  /**
   * 종목의 1분봉 데이터 조회
   * - tradingDate: 특정 거래일 (없으면 최근 데이터)
   * - symbol: 6자리 종목코드
   * - days: 최근 N거래일 (기본 5)
   */
  minuteBars: publicProcedure.input(z18.object({
    symbol: z18.string().regex(/^\d{6}$/),
    tradingDate: z18.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    days: z18.number().int().min(1).max(60).default(5)
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError17({ code: "INTERNAL_SERVER_ERROR", message: "DB \uC5F0\uACB0 \uBD88\uAC00" });
    let query;
    if (input.tradingDate) {
      query = db.select({
        minuteAt: intradayMinuteBars.minuteAt,
        open: intradayMinuteBars.open,
        high: intradayMinuteBars.high,
        low: intradayMinuteBars.low,
        close: intradayMinuteBars.close,
        volume: intradayMinuteBars.volume
      }).from(intradayMinuteBars).where(and20(
        eq29(intradayMinuteBars.symbol, input.symbol),
        eq29(intradayMinuteBars.tradingDate, input.tradingDate)
      )).orderBy(asc6(intradayMinuteBars.minuteAt));
    } else {
      const latestDates = await db.selectDistinct({ tradingDate: intradayMinuteBars.tradingDate }).from(intradayMinuteBars).where(eq29(intradayMinuteBars.symbol, input.symbol)).orderBy(desc23(intradayMinuteBars.tradingDate)).limit(input.days);
      if (!latestDates.length) {
        return { bars: [], tradingDates: [], symbol: input.symbol };
      }
      const dates = latestDates.map((d) => d.tradingDate);
      query = db.select({
        minuteAt: intradayMinuteBars.minuteAt,
        open: intradayMinuteBars.open,
        high: intradayMinuteBars.high,
        low: intradayMinuteBars.low,
        close: intradayMinuteBars.close,
        volume: intradayMinuteBars.volume
      }).from(intradayMinuteBars).where(and20(
        eq29(intradayMinuteBars.symbol, input.symbol),
        inArray7(intradayMinuteBars.tradingDate, dates)
      )).orderBy(asc6(intradayMinuteBars.minuteAt));
    }
    const rows = await query;
    const bars = rows.map((row) => ({
      time: Math.floor(new Date(row.minuteAt).getTime() / 1e3),
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: Number(row.volume)
    }));
    const tradingDates = Array.from(new Set(rows.map((r) => {
      const d = new Date(r.minuteAt);
      return new Date(d.getTime() + 9 * 36e5).toISOString().slice(0, 10);
    }))).sort();
    return { bars, tradingDates, symbol: input.symbol };
  }),
  /**
   * 종목의 일봉 데이터 조회
   */
  dailyBars: publicProcedure.input(z18.object({
    symbol: z18.string().regex(/^\d{6}$/),
    startDate: z18.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endDate: z18.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    limit: z18.number().int().min(1).max(1e3).default(600)
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError17({ code: "INTERNAL_SERVER_ERROR", message: "DB \uC5F0\uACB0 \uBD88\uAC00" });
    const conditions = [
      eq29(localResearchDailyBars.symbol, input.symbol),
      eq29(localResearchDailyBars.adjustmentBasis, "adjusted")
    ];
    if (input.startDate) conditions.push(gte(localResearchDailyBars.date, input.startDate));
    if (input.endDate) conditions.push(lte(localResearchDailyBars.date, input.endDate));
    const rows = await db.select({
      date: localResearchDailyBars.date,
      open: localResearchDailyBars.open,
      high: localResearchDailyBars.high,
      low: localResearchDailyBars.low,
      close: localResearchDailyBars.close,
      volume: localResearchDailyBars.volume,
      turnover: localResearchDailyBars.turnover
    }).from(localResearchDailyBars).where(and20(...conditions)).orderBy(asc6(localResearchDailyBars.date)).limit(input.limit);
    const bars = rows.map((row) => ({
      time: Math.floor((/* @__PURE__ */ new Date(row.date + "T00:00:00+09:00")).getTime() / 1e3),
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: Number(row.volume),
      turnover: Number(row.turnover)
    }));
    return { bars, symbol: input.symbol, barCount: bars.length };
  }),
  /**
   * 수집된 종목 목록 (차트에서 종목 선택용)
   */
  availableSymbols: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError17({ code: "INTERNAL_SERVER_ERROR", message: "DB \uC5F0\uACB0 \uBD88\uAC00" });
    const daily = await db.selectDistinct({ symbol: localResearchDailyBars.symbol }).from(localResearchDailyBars).where(eq29(localResearchDailyBars.adjustmentBasis, "adjusted")).limit(100);
    const minute = await db.selectDistinct({ symbol: intradayMinuteBars.symbol }).from(intradayMinuteBars).limit(100);
    const symbols = /* @__PURE__ */ new Map();
    for (const row of daily) {
      symbols.set(row.symbol, { hasDaily: true, hasMinute: false });
    }
    for (const row of minute) {
      const existing = symbols.get(row.symbol);
      if (existing) existing.hasMinute = true;
      else symbols.set(row.symbol, { hasDaily: false, hasMinute: true });
    }
    return Array.from(symbols.entries()).map(([symbol, flags]) => ({
      symbol,
      ...flags
    }));
  })
});

// server/routers/oneClickBacktest.ts
import { z as z19 } from "zod";
import { and as and21, asc as asc7, desc as desc24, eq as eq30 } from "drizzle-orm";
import { TRPCError as TRPCError18 } from "@trpc/server";
init_evolution();
var ALL_RULE_TYPES = [
  "macd_rising",
  "ma_position",
  "high_return",
  "turnover",
  "rsi",
  "bollinger",
  "stochastic",
  "atr_percent",
  "volume_ratio",
  "close_change",
  "gap_percent",
  "intrabar_position"
];
var oneClickBacktestRouter = router({
  /**
   * 원클릭 실행: 랜덤 조건식 생성 → 랜덤 종목/기간 → 백테스트 → 결과 반환
   */
  run: publicProcedure.input(z19.object({
    /** 생성할 조건식 수 (기본 10) */
    count: z19.number().int().min(1).max(50).default(10),
    /** 규칙 수 범위 */
    minRules: z19.number().int().min(2).max(10).default(3),
    maxRules: z19.number().int().min(3).max(12).default(6),
    /** 보유 기간 (일) */
    holdingDays: z19.number().int().min(1).max(60).default(5),
    /** 수수료율 */
    feeRate: z19.number().min(0).max(0.01).default(3e-4),
    /** 슬리피지 */
    slippageBps: z19.number().min(0).max(100).default(8),
    /** 최소 점수 */
    minScore: z19.number().min(0).max(100).default(50),
    /** 타임프레임 */
    timeframe: z19.enum(["daily", "minute"]).default("daily")
  }).optional()).mutation(async ({ input }) => {
    const count3 = input?.count ?? 10;
    const minRules = input?.minRules ?? 3;
    const maxRules = input?.maxRules ?? 6;
    const holdingDays = input?.holdingDays ?? 5;
    const feeRate = (input?.feeRate ?? 3e-4) + (input?.slippageBps ?? 8) / 1e4;
    const minScore = input?.minScore ?? 50;
    const db = await getDb();
    if (!db) throw new TRPCError18({ code: "INTERNAL_SERVER_ERROR", message: "DB \uC5F0\uACB0 \uBD88\uAC00" });
    const allSymbols = await db.selectDistinct({ symbol: localResearchDailyBars.symbol }).from(localResearchDailyBars).where(eq30(localResearchDailyBars.adjustmentBasis, "adjusted")).limit(100);
    if (!allSymbols.length) {
      throw new TRPCError18({
        code: "PRECONDITION_FAILED",
        message: "\uBC31\uD14C\uC2A4\uD2B8\uD560 \uC77C\uBD09 \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4. \uB85C\uCEEC \uC218\uC9D1\uAE30\uB85C \uB370\uC774\uD130\uB97C \uBA3C\uC800 \uC218\uC9D1\uD558\uC138\uC694."
      });
    }
    const seed = Date.now();
    const shuffled = allSymbols.sort(() => Math.random() - 0.5);
    const selectedSymbols = shuffled.slice(0, Math.min(5, shuffled.length));
    const barsBySymbol = {};
    for (const { symbol } of selectedSymbols) {
      const rows = await db.select({
        date: localResearchDailyBars.date,
        open: localResearchDailyBars.open,
        high: localResearchDailyBars.high,
        low: localResearchDailyBars.low,
        close: localResearchDailyBars.close,
        volume: localResearchDailyBars.volume,
        turnover: localResearchDailyBars.turnover
      }).from(localResearchDailyBars).where(and21(
        eq30(localResearchDailyBars.symbol, symbol),
        eq30(localResearchDailyBars.adjustmentBasis, "adjusted")
      )).orderBy(asc7(localResearchDailyBars.date)).limit(600);
      if (rows.length >= 60) {
        barsBySymbol[symbol] = rows.map((r) => ({
          date: r.date,
          open: r.open,
          high: r.high,
          low: r.low,
          close: r.close,
          volume: Number(r.volume),
          turnover: Number(r.turnover)
        }));
      }
    }
    const eligibleSymbols = Object.keys(barsBySymbol);
    if (!eligibleSymbols.length) {
      throw new TRPCError18({
        code: "PRECONDITION_FAILED",
        message: "60\uAC1C \uC774\uC0C1\uC758 \uC77C\uBD09\uC774 \uC788\uB294 \uC885\uBAA9\uC774 \uC5C6\uC2B5\uB2C8\uB2E4. \uB370\uC774\uD130\uB97C \uB354 \uC218\uC9D1\uD558\uC138\uC694."
      });
    }
    const spec = {
      seed,
      populationSize: count3,
      minRules,
      maxRules,
      maxDepth: 2,
      allowedRuleTypes: ALL_RULE_TYPES,
      requireUniqueRuleTypes: true
    };
    const genomes = generateUniqueGenomes(spec);
    const results = [];
    for (const genome of genomes) {
      const symbolResults = [];
      for (const symbol of eligibleSymbols) {
        const bars = barsBySymbol[symbol];
        const maxStart = Math.max(0, bars.length - 60);
        const startIndex = Math.floor(Math.random() * maxStart);
        const slicedBars = bars.slice(startIndex);
        const result = runDailyBacktest({
          bars: slicedBars,
          expression: genome.root,
          minScore,
          holdingDays,
          feeRate,
          entryDelayDays: 1,
          entryTiming: "open"
        });
        symbolResults.push({ symbol, result });
      }
      const returns = symbolResults.map((r) => r.result.totalReturn);
      const winRates = symbolResults.map((r) => r.result.winRate);
      const avgReturn = returns.reduce((s, v) => s + v, 0) / returns.length;
      const avgWinRate = winRates.reduce((s, v) => s + v, 0) / winRates.length;
      const totalTrades = symbolResults.reduce((s, r) => s + r.result.tradeCount, 0);
      const worstDrawdown = Math.min(...symbolResults.map((r) => r.result.maxDrawdown));
      const tradePenalty = Math.max(0, 5 - totalTrades) * 10;
      const fitnessScore = avgReturn + avgWinRate * 0.05 - Math.abs(worstDrawdown) * 0.3 - tradePenalty;
      results.push({
        genome,
        symbolResults,
        averageReturn: avgReturn,
        averageWinRate: avgWinRate,
        totalTrades,
        worstDrawdown,
        fitnessScore
      });
    }
    results.sort((a, b) => b.fitnessScore - a.fitnessScore);
    return {
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      config: { count: count3, minRules, maxRules, holdingDays, feeRate, minScore },
      symbols: eligibleSymbols,
      results: results.map((r, rank) => ({
        rank: rank + 1,
        fingerprint: r.genome.fingerprint,
        root: r.genome.root,
        minimumScore: r.genome.minimumScore,
        averageReturn: Number(r.averageReturn.toFixed(2)),
        averageWinRate: Number(r.averageWinRate.toFixed(1)),
        totalTrades: r.totalTrades,
        worstDrawdown: Number(r.worstDrawdown.toFixed(2)),
        fitnessScore: Number(r.fitnessScore.toFixed(3)),
        symbolResults: r.symbolResults.map((sr) => ({
          symbol: sr.symbol,
          totalReturn: Number(sr.result.totalReturn.toFixed(2)),
          winRate: Number(sr.result.winRate.toFixed(1)),
          tradeCount: sr.result.tradeCount,
          maxDrawdown: Number(sr.result.maxDrawdown.toFixed(2)),
          trades: sr.result.trades.slice(-10)
          // 최근 10건만
        }))
      }))
    };
  }),
  /**
   * 조건식 채택: 좋은 결과의 조건식을 저장
   */
  adopt: protectedProcedure.input(z19.object({
    name: z19.string().min(1).max(100),
    root: z19.any(),
    // EvolutionGroup JSON
    minimumScore: z19.number().int().min(1).max(100),
    fingerprint: z19.string().min(1),
    backtestSummary: z19.object({
      averageReturn: z19.number(),
      averageWinRate: z19.number(),
      totalTrades: z19.number(),
      worstDrawdown: z19.number(),
      fitnessScore: z19.number()
    })
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError18({ code: "INTERNAL_SERVER_ERROR", message: "DB \uC5F0\uACB0 \uBD88\uAC00" });
    const rulesJson = extractRulesFromRoot(input.root);
    const [saved] = await db.insert(strategyPresets).values({
      userId: ctx.user.id,
      name: input.name,
      rulesJson,
      scoringJson: { minimumScore: input.minimumScore, fingerprint: input.fingerprint, adoptedAt: (/* @__PURE__ */ new Date()).toISOString(), backtestSummary: input.backtestSummary }
    }).returning();
    return { presetId: saved.id, name: saved.name, fingerprint: input.fingerprint };
  }),
  /**
   * 조건식 육성: 채택된 조건식의 파라미터를 변형해서 재검증
   */
  evolve: publicProcedure.input(z19.object({
    /** 부모 조건식의 root genome */
    parentRoot: z19.any(),
    parentMinimumScore: z19.number().int().min(1).max(100),
    /** 변형 수 */
    mutationCount: z19.number().int().min(1).max(20).default(8),
    /** 백테스트 설정 */
    holdingDays: z19.number().int().min(1).max(60).default(5),
    feeRate: z19.number().min(0).max(0.01).default(3e-4),
    slippageBps: z19.number().min(0).max(100).default(8),
    minScore: z19.number().min(0).max(100).default(50)
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError18({ code: "INTERNAL_SERVER_ERROR", message: "DB \uC5F0\uACB0 \uBD88\uAC00" });
    const feeRate = input.feeRate + input.slippageBps / 1e4;
    const allSymbols = await db.selectDistinct({ symbol: localResearchDailyBars.symbol }).from(localResearchDailyBars).where(eq30(localResearchDailyBars.adjustmentBasis, "adjusted")).limit(100);
    const shuffled = allSymbols.sort(() => Math.random() - 0.5).slice(0, 5);
    const barsBySymbol = {};
    for (const { symbol } of shuffled) {
      const rows = await db.select({
        date: localResearchDailyBars.date,
        open: localResearchDailyBars.open,
        high: localResearchDailyBars.high,
        low: localResearchDailyBars.low,
        close: localResearchDailyBars.close,
        volume: localResearchDailyBars.volume,
        turnover: localResearchDailyBars.turnover
      }).from(localResearchDailyBars).where(and21(eq30(localResearchDailyBars.symbol, symbol), eq30(localResearchDailyBars.adjustmentBasis, "adjusted"))).orderBy(asc7(localResearchDailyBars.date)).limit(600);
      if (rows.length >= 60) {
        barsBySymbol[symbol] = rows.map((r) => ({ ...r, volume: Number(r.volume), turnover: Number(r.turnover) }));
      }
    }
    const eligibleSymbols = Object.keys(barsBySymbol);
    if (!eligibleSymbols.length) {
      throw new TRPCError18({ code: "PRECONDITION_FAILED", message: "\uBC31\uD14C\uC2A4\uD2B8\uD560 \uB370\uC774\uD130\uAC00 \uBD80\uC871\uD569\uB2C8\uB2E4." });
    }
    const { fingerprintGenome: fingerprintGenome2 } = await Promise.resolve().then(() => (init_evolution(), evolution_exports));
    const parentFingerprint = fingerprintGenome2(input.parentRoot, input.parentMinimumScore);
    const parent = {
      root: input.parentRoot,
      minimumScore: input.parentMinimumScore,
      fingerprint: parentFingerprint,
      candidateId: 0,
      metrics: { totalReturn: 0, maxDrawdown: 0, tradeCount: 0, winRate: 0 },
      fitnessScore: 0
    };
    const seed = Date.now();
    const mutations = [];
    for (let i = 0; i < input.mutationCount; i++) {
      const mutated = mutateGenome(parent, () => Math.random(), i);
      const symbolResults = [];
      for (const symbol of eligibleSymbols) {
        const bars = barsBySymbol[symbol];
        const result = runDailyBacktest({
          bars,
          expression: mutated.root,
          minScore: input.minScore,
          holdingDays: input.holdingDays,
          feeRate,
          entryDelayDays: 1,
          entryTiming: "open"
        });
        symbolResults.push({ symbol, result });
      }
      const returns = symbolResults.map((r) => r.result.totalReturn);
      const avgReturn = returns.reduce((s, v) => s + v, 0) / returns.length;
      const avgWinRate = symbolResults.reduce((s, r) => s + r.result.winRate, 0) / symbolResults.length;
      const totalTrades = symbolResults.reduce((s, r) => s + r.result.tradeCount, 0);
      const worstDrawdown = Math.min(...symbolResults.map((r) => r.result.maxDrawdown));
      const fitnessScore = avgReturn + avgWinRate * 0.05 - Math.abs(worstDrawdown) * 0.3;
      mutations.push({ genome: mutated, symbolResults, fitnessScore, averageReturn: avgReturn, averageWinRate: avgWinRate, totalTrades, worstDrawdown });
    }
    const parentResults = [];
    for (const symbol of eligibleSymbols) {
      const bars = barsBySymbol[symbol];
      const result = runDailyBacktest({ bars, expression: input.parentRoot, minScore: input.minScore, holdingDays: input.holdingDays, feeRate, entryDelayDays: 1, entryTiming: "open" });
      parentResults.push({ symbol, result });
    }
    const parentAvgReturn = parentResults.reduce((s, r) => s + r.result.totalReturn, 0) / parentResults.length;
    const parentFitness = parentAvgReturn + parentResults.reduce((s, r) => s + r.result.winRate, 0) / parentResults.length * 0.05 - Math.abs(Math.min(...parentResults.map((r) => r.result.maxDrawdown))) * 0.3;
    mutations.sort((a, b) => b.fitnessScore - a.fitnessScore);
    return {
      parentPerformance: {
        fingerprint: parentFingerprint,
        averageReturn: Number(parentAvgReturn.toFixed(2)),
        fitnessScore: Number(parentFitness.toFixed(3))
      },
      symbols: eligibleSymbols,
      mutations: mutations.map((m, rank) => ({
        rank: rank + 1,
        fingerprint: m.genome.fingerprint,
        root: m.genome.root,
        minimumScore: m.genome.minimumScore,
        origin: m.genome.origin,
        mutation: m.genome.mutation,
        averageReturn: Number(m.averageReturn.toFixed(2)),
        averageWinRate: Number(m.averageWinRate.toFixed(1)),
        totalTrades: m.totalTrades,
        worstDrawdown: Number(m.worstDrawdown.toFixed(2)),
        fitnessScore: Number(m.fitnessScore.toFixed(3)),
        improvement: Number((m.fitnessScore - parentFitness).toFixed(3))
      }))
    };
  }),
  /**
   * 채택된 조건식 목록 조회
   */
  adopted: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError18({ code: "INTERNAL_SERVER_ERROR", message: "DB \uC5F0\uACB0 \uBD88\uAC00" });
    const presets = await db.select().from(strategyPresets).where(eq30(strategyPresets.userId, ctx.user.id)).orderBy(desc24(strategyPresets.createdAt)).limit(50);
    return presets.map((p) => ({
      id: p.id,
      name: p.name,
      rulesJson: p.rulesJson,
      scoringJson: p.scoringJson,
      createdAt: p.createdAt
    }));
  })
});
function extractRulesFromRoot(root) {
  if (!root || typeof root !== "object") return [];
  const node = root;
  if (node.type && !node.children) return [node];
  if (Array.isArray(node.children)) {
    return node.children.flatMap((child) => extractRulesFromRoot(child));
  }
  return [];
}

// server/routers/mockTrading.ts
import { z as z20 } from "zod";
import { and as and22, desc as desc25, eq as eq31, gte as gte3 } from "drizzle-orm";
import { TRPCError as TRPCError19 } from "@trpc/server";
var mockTradingRouter = router({
  /**
   * 현재 보유 포지션 (최신 스냅샷)
   */
  positions: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError19({ code: "INTERNAL_SERVER_ERROR", message: "DB \uC5F0\uACB0 \uBD88\uAC00" });
    const snapshots = await db.select().from(positionSnapshots).orderBy(desc25(positionSnapshots.capturedAt)).limit(100);
    const bySymbol = /* @__PURE__ */ new Map();
    for (const snap of snapshots) {
      if (!bySymbol.has(snap.symbol)) {
        bySymbol.set(snap.symbol, snap);
      }
    }
    const positions = Array.from(bySymbol.values()).filter((p) => p.quantity > 0).map((p) => ({
      symbol: p.symbol,
      name: p.name,
      quantity: p.quantity,
      averagePrice: p.averagePrice,
      currentPrice: p.currentPrice,
      profitLoss: p.profitLoss,
      profitLossRate: Number(p.profitLossRate),
      capturedAt: p.capturedAt
    }));
    const totalPurchase = positions.reduce((s, p) => s + p.averagePrice * p.quantity, 0);
    const totalEvaluation = positions.reduce((s, p) => s + p.currentPrice * p.quantity, 0);
    const totalProfitLoss = positions.reduce((s, p) => s + p.profitLoss, 0);
    return {
      positions,
      summary: {
        totalPurchase,
        totalEvaluation,
        totalProfitLoss,
        totalProfitLossRate: totalPurchase > 0 ? totalProfitLoss / totalPurchase * 100 : 0,
        positionCount: positions.length
      },
      lastUpdated: snapshots[0]?.capturedAt ?? null
    };
  }),
  /**
   * 최근 주문 내역
   */
  recentOrders: publicProcedure.input(z20.object({ limit: z20.number().int().min(1).max(100).default(30) }).optional()).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError19({ code: "INTERNAL_SERVER_ERROR", message: "DB \uC5F0\uACB0 \uBD88\uAC00" });
    const limit = input?.limit ?? 30;
    const orders = await db.select({
      id: orderIntents.id,
      symbol: orderIntents.symbol,
      name: orderIntents.name,
      side: orderIntents.side,
      quantity: orderIntents.quantity,
      price: orderIntents.price,
      amount: orderIntents.amount,
      status: orderIntents.status,
      executionOrigin: orderIntents.executionOrigin,
      brokerOrderId: orderIntents.brokerOrderId,
      dedupeKey: orderIntents.dedupeKey,
      createdAt: orderIntents.createdAt,
      updatedAt: orderIntents.updatedAt
    }).from(orderIntents).where(eq31(orderIntents.executionOrigin, "local_node")).orderBy(desc25(orderIntents.createdAt)).limit(limit);
    return { orders };
  }),
  /**
   * 주문별 체결 상세
   */
  executions: publicProcedure.input(z20.object({ orderIntentId: z20.number().int().positive() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError19({ code: "INTERNAL_SERVER_ERROR", message: "DB \uC5F0\uACB0 \uBD88\uAC00" });
    const executions = await db.select().from(orderExecutions).where(eq31(orderExecutions.orderIntentId, input.orderIntentId)).orderBy(desc25(orderExecutions.executedAt));
    return { executions };
  }),
  /**
   * 현재 활성 자동매매 정책
   */
  activePolicy: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError19({ code: "INTERNAL_SERVER_ERROR", message: "DB \uC5F0\uACB0 \uBD88\uAC00" });
    const [policy] = await db.select().from(autoTradePolicies).where(eq31(autoTradePolicies.status, "active")).orderBy(desc25(autoTradePolicies.createdAt)).limit(1);
    if (!policy) return null;
    return {
      id: policy.id,
      version: policy.version,
      totalCapital: policy.totalCapital,
      maxConcurrentPositions: policy.maxConcurrentPositions,
      stopLossPercent: Number(policy.stopLossPercent),
      takeProfitPercent: Number(policy.takeProfitPercent),
      dailyLossLimitPercent: Number(policy.dailyLossLimitPercent),
      status: policy.status,
      createdAt: policy.createdAt
    };
  }),
  /**
   * 오늘 실현 손익
   */
  todayPnl: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError19({ code: "INTERNAL_SERVER_ERROR", message: "DB \uC5F0\uACB0 \uBD88\uAC00" });
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(/* @__PURE__ */ new Date());
    const todayStart = /* @__PURE__ */ new Date(today + "T00:00:00+09:00");
    const todayOrders = await db.select({
      side: orderIntents.side,
      quantity: orderIntents.quantity,
      price: orderIntents.price,
      status: orderIntents.status,
      symbol: orderIntents.symbol
    }).from(orderIntents).where(and22(
      eq31(orderIntents.executionOrigin, "local_node"),
      eq31(orderIntents.status, "filled"),
      gte3(orderIntents.createdAt, todayStart)
    ));
    const buyTotal = todayOrders.filter((o) => o.side === "buy").reduce((s, o) => s + o.price * o.quantity, 0);
    const sellTotal = todayOrders.filter((o) => o.side === "sell").reduce((s, o) => s + o.price * o.quantity, 0);
    const filledCount = todayOrders.length;
    return {
      tradingDate: today,
      buyTotal,
      sellTotal,
      realizedPnl: sellTotal - buyTotal,
      filledOrderCount: filledCount,
      buyOrderCount: todayOrders.filter((o) => o.side === "buy").length,
      sellOrderCount: todayOrders.filter((o) => o.side === "sell").length
    };
  })
});

// server/routers.ts
var appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user ? { ...opts.ctx.user, isOperator: isOperatorUser(opts.ctx.user), operatorReason: getOperatorReason(opts.ctx.user) } : null),
    operator: publicProcedure.query(({ ctx }) => isOperatorUser(ctx.user)),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true
      };
    })
  }),
  quant: quantRouter,
  presets: presetsRouter,
  tradingProfile: tradingProfileRouter,
  orders: ordersRouter,
  backtests: backtestsRouter,
  account: accountRouter,
  rankings: rankingsRouter,
  rankingRefresh: rankingRefreshRouter,
  network: networkRouter,
  research: researchRouter,
  autonomousResearch: autonomousResearchRouter,
  paperPortfolio: paperPortfolioRouter,
  minuteResearch: minuteResearchRouter,
  strategyCards: strategyCardsRouter,
  profile: profileRouter,
  sharedDatasets: sharedDatasetsRouter,
  survivalResearch: survivalResearchRouter,
  chartData: chartDataRouter,
  oneClickBacktest: oneClickBacktestRouter,
  mockTrading: mockTradingRouter
  // TODO: add feature routers here, e.g.
  // todo: router({
  //   list: protectedProcedure.query(({ ctx }) =>
  //     db.getUserTodos(ctx.user.id)
  //   ),
  // }),
});

// server/_core/context.ts
var OPEN_ACCESS_USER = {
  id: 1,
  openId: "open-access-owner",
  name: "Owner",
  email: "salad20c@gmail.com",
  avatarId: "nebula",
  loginMethod: "open_access",
  role: "admin",
  createdAt: /* @__PURE__ */ new Date("2024-01-01"),
  updatedAt: /* @__PURE__ */ new Date(),
  lastSignedIn: /* @__PURE__ */ new Date()
};
async function createContext(opts) {
  return {
    req: opts.req,
    res: opts.res,
    user: OPEN_ACCESS_USER
  };
}

// server/_core/vite.ts
import express from "express";
import fs2 from "fs";
import { nanoid } from "nanoid";
import path2 from "path";
import { createServer as createViteServer } from "vite";

// vite.config.ts
import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";
var PROJECT_ROOT = import.meta.dirname;
var LOG_DIR = path.join(PROJECT_ROOT, ".manus-logs");
var MAX_LOG_SIZE_BYTES = 1 * 1024 * 1024;
var TRIM_TARGET_BYTES = Math.floor(MAX_LOG_SIZE_BYTES * 0.6);
function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}
function trimLogFile(logPath, maxSize) {
  try {
    if (!fs.existsSync(logPath) || fs.statSync(logPath).size <= maxSize) {
      return;
    }
    const lines = fs.readFileSync(logPath, "utf-8").split("\n");
    const keptLines = [];
    let keptBytes = 0;
    const targetSize = TRIM_TARGET_BYTES;
    for (let i = lines.length - 1; i >= 0; i--) {
      const lineBytes = Buffer.byteLength(`${lines[i]}
`, "utf-8");
      if (keptBytes + lineBytes > targetSize) break;
      keptLines.unshift(lines[i]);
      keptBytes += lineBytes;
    }
    fs.writeFileSync(logPath, keptLines.join("\n"), "utf-8");
  } catch {
  }
}
function writeToLogFile(source, entries) {
  if (entries.length === 0) return;
  ensureLogDir();
  const logPath = path.join(LOG_DIR, `${source}.log`);
  const lines = entries.map((entry) => {
    const ts = (/* @__PURE__ */ new Date()).toISOString();
    return `[${ts}] ${JSON.stringify(entry)}`;
  });
  fs.appendFileSync(logPath, `${lines.join("\n")}
`, "utf-8");
  trimLogFile(logPath, MAX_LOG_SIZE_BYTES);
}
function vitePluginManusDebugCollector() {
  return {
    name: "manus-debug-collector",
    transformIndexHtml(html) {
      if (process.env.NODE_ENV === "production") {
        return html;
      }
      return {
        html,
        tags: [
          {
            tag: "script",
            attrs: {
              src: "/__manus__/debug-collector.js",
              defer: true
            },
            injectTo: "head"
          }
        ]
      };
    },
    configureServer(server) {
      server.middlewares.use("/__manus__/logs", (req, res, next) => {
        if (req.method !== "POST") {
          return next();
        }
        const handlePayload = (payload) => {
          if (payload.consoleLogs?.length > 0) {
            writeToLogFile("browserConsole", payload.consoleLogs);
          }
          if (payload.networkRequests?.length > 0) {
            writeToLogFile("networkRequests", payload.networkRequests);
          }
          if (payload.sessionEvents?.length > 0) {
            writeToLogFile("sessionReplay", payload.sessionEvents);
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        };
        const reqBody = req.body;
        if (reqBody && typeof reqBody === "object") {
          try {
            handlePayload(reqBody);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
          return;
        }
        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });
        req.on("end", () => {
          try {
            const payload = JSON.parse(body);
            handlePayload(payload);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
        });
      });
    }
  };
}
var plugins = [react(), tailwindcss(), jsxLocPlugin(), vitePluginManusRuntime(), vitePluginManusDebugCollector()];
var vite_config_default = defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets")
    }
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true
  },
  server: {
    host: true,
    allowedHosts: [
      ".manuspre.computer",
      ".manus.computer",
      ".manus-asia.computer",
      ".manuscomputer.ai",
      ".manusvm.computer",
      "localhost",
      "127.0.0.1"
    ],
    fs: {
      strict: true,
      deny: ["**/.*"]
    }
  }
});

// server/_core/vite.ts
async function setupVite(app2, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    server: serverOptions,
    appType: "custom"
  });
  app2.use(vite.middlewares);
  app2.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path2.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );
      let template = await fs2.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app2) {
  const distPath = process.env.NODE_ENV === "development" ? path2.resolve(import.meta.dirname, "../..", "dist", "public") : path2.resolve(import.meta.dirname, "public");
  if (!fs2.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app2.use(express.static(distPath));
  app2.use("*", (_req, res) => {
    res.sendFile(path2.resolve(distPath, "index.html"));
  });
}

// server/scheduled/rankingRefresh.ts
import { eq as eq32 } from "drizzle-orm";
function buildRankingRunKey(taskUid, now) {
  return `${taskUid}:${now.toISOString().slice(0, 16)}`;
}
function getRankingRefreshSkip(profile, runKey) {
  if (profile.lastRunKey !== runKey || !["running", "ready"].includes(profile.status)) return null;
  return profile.status === "running" ? "already-running" : "already-completed";
}
async function rankingRefreshHandler(req, res) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "database-unavailable", timestamp: (/* @__PURE__ */ new Date()).toISOString() });
    const profile = (await db.select().from(rankingRefreshProfiles).where(eq32(rankingRefreshProfiles.scheduleCronTaskUid, user.taskUid)).limit(1))[0];
    if (!profile) return res.json({ ok: true, skipped: "orphan" });
    const broker = new KiwoomClient().getStatus();
    if (!broker.fixedIpRegistered) return res.json({ ok: true, skipped: "fixed-ip-not-registered" });
    if (!broker.hasCredentials) return res.json({ ok: true, skipped: "credentials-unavailable" });
    const runKey = buildRankingRunKey(user.taskUid, /* @__PURE__ */ new Date());
    const skip = getRankingRefreshSkip(profile, runKey);
    if (skip) return res.json({ ok: true, skipped: skip, runKey });
    await db.update(rankingRefreshProfiles).set({ status: "running", lastRunKey: runKey, lastRunAt: /* @__PURE__ */ new Date(), lastError: null }).where(eq32(rankingRefreshProfiles.id, profile.id));
    try {
      const result = await refreshLiveRanking({ userId: profile.userId, presetId: profile.presetId, universe: profile.universeJson, maxPagesPerSymbol: profile.maxPagesPerSymbol, runKey });
      await db.update(rankingRefreshProfiles).set({ status: "ready", lastCompletedAt: /* @__PURE__ */ new Date(), lastError: result.failedSymbols.length ? `${result.failedSymbols.length}\uAC1C \uC885\uBAA9 \uC218\uC9D1 \uC2E4\uD328` : null }).where(eq32(rankingRefreshProfiles.id, profile.id));
      return res.json({ ok: true, runKey, collected: result.collectedSymbols.length, ranked: result.ranked.length, failed: result.failedSymbols.length });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await db.update(rankingRefreshProfiles).set({ status: "error", lastError: message.slice(0, 500) }).where(eq32(rankingRefreshProfiles.id, profile.id));
      throw error;
    }
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : String(error),
      context: { url: req.originalUrl },
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
}

// server/scheduled/autonomousResearch.ts
import { and as and23, desc as desc26, eq as eq33 } from "drizzle-orm";
function getAutonomousTaskSkip(existing) {
  if (!existing) return null;
  return existing.status === "running" ? "already-running" : "already-completed";
}
async function getOrCreateDailyRun(db, tradingDate2) {
  const runKey = `${AUTONOMOUS_RESEARCH_POLICY.version}:${tradingDate2}:day`;
  const existing = (await db.select().from(autonomousResearchRuns).where(eq33(autonomousResearchRuns.runKey, runKey)).limit(1))[0];
  if (existing) return existing;
  try {
    await db.insert(autonomousResearchRuns).values({ tradingDate: tradingDate2, runKey, policyVersion: AUTONOMOUS_RESEARCH_POLICY.version, phase: "preparing", dataStatus: "pending" });
  } catch {
  }
  const created = (await db.select().from(autonomousResearchRuns).where(eq33(autonomousResearchRuns.runKey, runKey)).limit(1))[0];
  if (!created) throw new Error("\uC790\uB3D9 \uB9AC\uC11C\uCE58 \uC77C\uC77C \uC2E4\uD589\uC744 \uC0DD\uC131\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
  return created;
}
async function claimTask(db, input) {
  const existing = (await db.select().from(autonomousResearchTasks).where(eq33(autonomousResearchTasks.runKey, input.runKey)).limit(1))[0];
  const skip = getAutonomousTaskSkip(existing);
  if (skip) return { claimed: false, skip };
  try {
    await db.insert(autonomousResearchTasks).values(input);
  } catch {
    return { claimed: false, skip: "already-running" };
  }
  const task = (await db.select().from(autonomousResearchTasks).where(eq33(autonomousResearchTasks.runKey, input.runKey)).limit(1))[0];
  if (!task) throw new Error("\uC790\uB3D9 \uB9AC\uC11C\uCE58 \uC791\uC5C5\uC744 \uC0DD\uC131\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
  return { claimed: true, task };
}
async function autonomousResearchHandler(req, res, options = {}) {
  try {
    if (!options.internalWorker) {
      const user = await sdk.authenticateRequest(req);
      if (!user.isCron) return res.status(403).json({ error: "cron-only" });
    }
    const now = /* @__PURE__ */ new Date();
    const phase = getAutonomousResearchPhase(now);
    if (!phase || phase !== "preparing" && phase !== "opening" && phase !== "intraday" && phase !== "closing") return res.json({ ok: true, skipped: "outside-market-hours" });
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "database-unavailable", timestamp: now.toISOString() });
    const dailyRun = await getOrCreateDailyRun(db, getKoreaTradingDate(now));
    const runKey = buildAutonomousRunKey(now, phase);
    const claim = await claimTask(db, { runId: dailyRun.id, runKey, phase });
    if (!claim.claimed) return res.json({ ok: true, skipped: claim.skip, runKey, runId: dailyRun.id });
    const completeTask = async (input) => {
      await db.update(autonomousResearchTasks).set({ ...input, completedAt: /* @__PURE__ */ new Date() }).where(eq33(autonomousResearchTasks.id, claim.task.id));
    };
    if (!isExternalResearchVerificationEnabled()) {
      const transition = getWaitingForDataTransition(externalVerificationPausedMessage);
      await db.update(autonomousResearchRuns).set({ ...transition, updatedAt: /* @__PURE__ */ new Date() }).where(eq33(autonomousResearchRuns.id, dailyRun.id));
      await completeTask({ status: "waiting_for_data", resultJson: transition.summary, lastError: transition.lastError });
      return res.json({ ok: true, waitingForData: true, runKey, reason: transition.lastError, externalCollection: "user-request-required" });
    }
    const client = new KiwoomClient();
    const broker = client.getStatus();
    if (!broker.fixedIpRegistered || !broker.hasCredentials) {
      const transition = getWaitingForDataTransition(!broker.fixedIpRegistered ? "\uD0A4\uC6C0 \uC9C0\uC815 \uB2E8\uB9D0 \uC778\uC99D \uB300\uAE30" : "\uD0A4\uC6C0 \uC11C\uBC84 \uC790\uACA9 \uC99D\uBA85 \uB300\uAE30");
      await db.update(autonomousResearchRuns).set({ ...transition, updatedAt: /* @__PURE__ */ new Date() }).where(eq33(autonomousResearchRuns.id, dailyRun.id));
      await completeTask({ status: "waiting_for_data", resultJson: transition.summary, lastError: transition.lastError });
      return res.json({ ok: true, waitingForData: true, runKey, reason: transition.lastError });
    }
    try {
      const token = await client.getAccessToken();
      const ranking = await client.getTurnoverRankings(token.token, { market: "000", exchange: "KRX" });
      const universe = selectAutonomousUniverse(ranking.items, AUTONOMOUS_RESEARCH_POLICY.maxUniverseSize);
      if (!universe.length) throw new Error("\uC790\uB3D9 \uC720\uB3D9\uC131 \uC720\uB2C8\uBC84\uC2A4\uC5D0 \uC2E4\uC81C \uAC00\uACA9\xB7\uAC70\uB798\uB300\uAE08 \uC885\uBAA9\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.");
      await db.insert(autonomousResearchObservations).values(universe.map((item) => ({ runId: dailyRun.id, symbol: item.symbol, name: item.name, price: Math.round(item.price), changeRate: String(item.changeRate), source: "kiwoom_ka10032" })));
      let candidateSummary = {};
      if (phase === "opening") {
        const barsBySymbol = {};
        for (const item of universe) {
          const bars = await client.getDailyBars(token.token, { symbol: item.symbol, adjustedPrice: "1", maxPages: 3 });
          if (bars.length < 60) continue;
          barsBySymbol[item.symbol] = bars;
          await db.insert(autonomousResearchBars).values(bars.map((bar) => ({ runId: dailyRun.id, symbol: item.symbol, date: bar.date, open: Math.round(bar.open), high: Math.round(bar.high), low: Math.round(bar.low), close: Math.round(bar.close), volume: String(Math.round(bar.volume)), turnover: String(Math.round(bar.turnover)), source: "kiwoom_ka10081" })));
        }
        const eligibleSymbols = Object.keys(barsBySymbol);
        if (!eligibleSymbols.length) throw new Error("\uC790\uB3D9 \uC870\uAC74\uC2DD \uD3C9\uAC00\uC5D0 \uD544\uC694\uD55C 60\uAC1C \uC774\uC0C1 \uC2E4\uC81C \uC77C\uBD09 \uC6D0\uBCF8\uC744 \uC218\uC9D1\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
        const datasetVersionKey = `${AUTONOMOUS_RESEARCH_POLICY.version}:${dailyRun.tradingDate}:${eligibleSymbols.join(",")}`;
        const seed = Number(dailyRun.tradingDate.replaceAll("-", ""));
        const generated = buildAutonomousInitialCandidates({ seed, datasetVersionKey });
        const scored = generated.map((candidate) => {
          const inSample = evaluateAutonomousCandidate({ root: candidate.root, minimumScore: candidate.minimumScore, barsBySymbol });
          const outOfSample = evaluateAutonomousCandidate({ root: candidate.root, minimumScore: candidate.minimumScore, barsBySymbol, evaluationStartRatio: 0.7 });
          return { candidate, inSample, outOfSample };
        });
        const survivorFingerprints = selectAutonomousSurvivorFingerprints(scored.map((item) => ({ fingerprint: item.candidate.fingerprint, fitnessScore: item.inSample.fitnessScore })));
        await db.insert(autonomousResearchCandidates).values(scored.map((item) => ({ runId: dailyRun.id, fingerprint: item.candidate.fingerprint, rootGenomeJson: item.candidate.root, minimumScore: item.candidate.minimumScore, status: survivorFingerprints.has(item.candidate.fingerprint) ? "survived" : "rejected", inSampleMetricsJson: { metrics: item.inSample.metrics, symbols: item.inSample.results.map((result) => result.symbol), assumptions: { policyVersion: AUTONOMOUS_RESEARCH_POLICY.version } }, outOfSampleMetricsJson: { metrics: item.outOfSample.metrics, symbols: item.outOfSample.results.map((result) => result.symbol), split: "tail-30-percent" }, fitnessScore: String(item.inSample.fitnessScore), evaluatedAt: /* @__PURE__ */ new Date() })));
        const survivorRows = await db.select().from(autonomousResearchCandidates).where(and23(eq33(autonomousResearchCandidates.runId, dailyRun.id), eq33(autonomousResearchCandidates.status, "survived")));
        const universeBySymbol = new Map(universe.map((item) => [item.symbol, item]));
        for (const candidate of survivorRows) {
          const entries = eligibleSymbols.flatMap((symbol) => {
            const evaluation = evaluateExpression(candidate.rootGenomeJson, barsBySymbol[symbol]);
            const current = universeBySymbol.get(symbol);
            if (!current || !evaluation.eligible || evaluation.score < candidate.minimumScore) return [];
            return [{ symbol, name: current.name, entryPrice: Math.round(current.price), entryAt: (/* @__PURE__ */ new Date()).toISOString(), evidence: { score: evaluation.score, matchedRuleCount: evaluation.evaluations.filter((item) => item.matched).length, details: evaluation.evaluations.filter((item) => item.matched).slice(0, 5).map((item) => item.detail) } }];
          });
          const simulation = { status: entries.length ? "tracking" : "not_entered", entries, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
          await db.update(autonomousResearchCandidates).set({ simulationJson: simulation }).where(eq33(autonomousResearchCandidates.id, candidate.id));
          if (entries.length) await db.insert(autonomousResearchObservations).values(entries.map((entry) => ({ runId: dailyRun.id, candidateId: candidate.id, symbol: entry.symbol, name: entry.name, price: entry.entryPrice, source: "kiwoom_ka10032_entry" })));
        }
        candidateSummary = { generatedCandidates: generated.length, evaluatedSymbols: eligibleSymbols.length, survivorCount: survivorFingerprints.size };
      }
      if (phase === "intraday" || phase === "closing") {
        const trackingCandidates = await db.select().from(autonomousResearchCandidates).where(and23(eq33(autonomousResearchCandidates.runId, dailyRun.id), eq33(autonomousResearchCandidates.status, "survived")));
        const priceBySymbol = new Map(universe.map((item) => [item.symbol, item]));
        let trackedPositions = 0;
        for (const candidate of trackingCandidates) {
          const simulation = candidate.simulationJson;
          if (!simulation?.entries.length) continue;
          const entries = simulation.entries.map((entry) => {
            const latest = priceBySymbol.get(entry.symbol);
            if (!latest) return entry;
            const returnPercent = (latest.price - entry.entryPrice) / entry.entryPrice * 100;
            return phase === "closing" ? { ...entry, lastPrice: Math.round(latest.price), lastObservedAt: (/* @__PURE__ */ new Date()).toISOString(), returnPercent, exitPrice: Math.round(latest.price), exitAt: (/* @__PURE__ */ new Date()).toISOString() } : { ...entry, lastPrice: Math.round(latest.price), lastObservedAt: (/* @__PURE__ */ new Date()).toISOString(), returnPercent };
          });
          const next = { status: phase === "closing" ? "closed" : simulation.status, entries, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
          await db.update(autonomousResearchCandidates).set({ simulationJson: next }).where(eq33(autonomousResearchCandidates.id, candidate.id));
          const observed = entries.filter((entry) => entry.lastPrice !== void 0).map((entry) => ({ runId: dailyRun.id, candidateId: candidate.id, symbol: entry.symbol, name: entry.name, price: entry.lastPrice, changeRate: String(entry.returnPercent ?? 0), source: phase === "closing" ? "kiwoom_ka10032_exit" : "kiwoom_ka10032_tracking" }));
          if (observed.length) await db.insert(autonomousResearchObservations).values(observed);
          trackedPositions += entries.length;
        }
        const updatedSurvivors = await db.select().from(autonomousResearchCandidates).where(and23(eq33(autonomousResearchCandidates.runId, dailyRun.id), eq33(autonomousResearchCandidates.status, "survived")));
        const dayTradeExperiment = await persistDayTradeExperiment({ run: dailyRun, candidates: updatedSurvivors, isClosing: phase === "closing" });
        candidateSummary = { ...candidateSummary, trackedPositions, dayTradeExperiment };
      }
      if (phase === "closing") {
        const [survivors, storedBars] = await Promise.all([
          db.select().from(autonomousResearchCandidates).where(and23(eq33(autonomousResearchCandidates.runId, dailyRun.id), eq33(autonomousResearchCandidates.status, "survived"))).orderBy(desc26(autonomousResearchCandidates.fitnessScore)),
          db.select().from(autonomousResearchBars).where(eq33(autonomousResearchBars.runId, dailyRun.id))
        ]);
        const barsBySymbol = storedBars.reduce((all, bar) => {
          (all[bar.symbol] ??= []).push({ date: bar.date, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: Number(bar.volume), turnover: Number(bar.turnover) });
          return all;
        }, {});
        let walkForwardCount = 0;
        for (const candidate of survivors) {
          const folds = Object.values(barsBySymbol).flatMap((bars) => bars.length >= 85 ? [runWalkForward({ bars, expression: candidate.rootGenomeJson, configuration: { trainingDays: 60, validationDays: 20, stepDays: 20, minScore: candidate.minimumScore, holdingDays: AUTONOMOUS_RESEARCH_POLICY.holdingDays, feeRate: AUTONOMOUS_RESEARCH_POLICY.feeRate + AUTONOMOUS_RESEARCH_POLICY.slippageBps / 1e4, entryDelayDays: AUTONOMOUS_RESEARCH_POLICY.informationCutoffTradingDays, entryTiming: "open" } })] : []);
          if (!folds.length) continue;
          const totalReturn = folds.reduce((sum, item) => sum + item.totalReturn, 0) / folds.length;
          const maxDrawdown = folds.reduce((sum, item) => sum + item.worstFoldDrawdown, 0) / folds.length;
          const tradeCount = folds.reduce((sum, item) => sum + item.tradeCount, 0);
          await db.update(autonomousResearchCandidates).set({ walkForwardMetricsJson: { configuration: { trainingDays: 60, validationDays: 20, stepDays: 20 }, metrics: { totalReturn, maxDrawdown, tradeCount }, foldCount: folds.length } }).where(eq33(autonomousResearchCandidates.id, candidate.id));
          walkForwardCount += 1;
        }
        candidateSummary = { ...candidateSummary, walkForwardCandidates: walkForwardCount, survivedCandidates: survivors.length };
      }
      const summary = { phase, runKey, universeSize: universe.length, observedSymbols: universe.map((item) => item.symbol), policyVersion: AUTONOMOUS_RESEARCH_POLICY.version, ...candidateSummary };
      await db.update(autonomousResearchRuns).set({ phase: phase === "closing" ? "completed" : phase, dataStatus: "ready", universeJson: universe.map((item) => ({ symbol: item.symbol, name: item.name })), summaryJson: summary, lastError: null, lastObservedAt: /* @__PURE__ */ new Date(), ...phase === "closing" ? { completedAt: /* @__PURE__ */ new Date() } : {} }).where(eq33(autonomousResearchRuns.id, dailyRun.id));
      await completeTask({ status: "completed", resultJson: summary });
      return res.json({ ok: true, runId: dailyRun.id, runKey, phase, observed: universe.length });
    } catch (error) {
      const transition = getWaitingForDataTransition(error instanceof Error ? error.message : "\uC790\uB3D9 \uB9AC\uC11C\uCE58 \uB370\uC774\uD130 \uC218\uC9D1\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.");
      await db.update(autonomousResearchRuns).set({ ...transition, updatedAt: /* @__PURE__ */ new Date() }).where(eq33(autonomousResearchRuns.id, dailyRun.id));
      await completeTask({ status: "waiting_for_data", resultJson: transition.summary, lastError: transition.lastError });
      return res.json({ ok: true, waitingForData: true, runKey, reason: transition.lastError });
    }
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : String(error), context: { url: req.originalUrl }, timestamp: (/* @__PURE__ */ new Date()).toISOString() });
  }
}

// server/scheduled/researchGovernance.ts
import { and as and24, desc as desc27, eq as eq34, like as like5 } from "drizzle-orm";
async function researchGovernanceHandler(req, res) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "database-unavailable", timestamp: (/* @__PURE__ */ new Date()).toISOString() });
    const schedule = (await db.select().from(researchGovernanceSchedules).where(and24(eq34(researchGovernanceSchedules.taskUid, user.taskUid), eq34(researchGovernanceSchedules.isEnabled, true))).limit(1))[0];
    if (!schedule) return res.json({ ok: true, skipped: "unknown-or-disabled-schedule" });
    await db.update(researchGovernanceSchedules).set({ lastRequestedAt: /* @__PURE__ */ new Date(), lastError: null }).where(eq34(researchGovernanceSchedules.id, schedule.id));
    const latestActualRun = (await db.select().from(autonomousResearchRuns).where(and24(eq34(autonomousResearchRuns.dataStatus, "ready"), eq34(autonomousResearchRuns.phase, "completed"), like5(autonomousResearchRuns.runKey, "%:day"))).orderBy(desc27(autonomousResearchRuns.updatedAt)).limit(1))[0];
    if (!latestActualRun) return res.json({ ok: true, skipped: "completed-actual-daily-run-not-found" });
    const committee = await runResearchCommittee(latestActualRun.id);
    if (committee.report?.status !== "completed") {
      return res.json({ ok: true, runId: latestActualRun.id, committeeReportId: committee.report?.id ?? null, awaiting: "committee-completion" });
    }
    const result = await runResearchGovernanceCycle();
    if ("skipped" in result) return res.json({ ok: true, ...result });
    await db.update(researchGovernanceSchedules).set({ latestCycleId: result.cycle.id }).where(eq34(researchGovernanceSchedules.id, schedule.id));
    return res.json({ ok: true, cycleId: result.cycle.id, reused: result.reused });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: message, context: { url: req.originalUrl }, timestamp: (/* @__PURE__ */ new Date()).toISOString() });
  }
}

// server/scheduled/minuteResearch.ts
async function minuteResearchHandler(req, res) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
    const program = await getMinuteResearchProgramByTaskUid(user.taskUid);
    if (!program) return res.json({ ok: true, skipped: "orphan-or-paused" });
    const result = await runMinuteResearchSweep(program.id);
    return res.json({ ok: true, result });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : String(error), context: { url: req.originalUrl }, timestamp: (/* @__PURE__ */ new Date()).toISOString() });
  }
}

// server/_core/trpcJsonFallback.ts
var trpcJsonFallback = (_req, res) => {
  res.status(404).type("application/json").json([{
    error: {
      json: {
        message: "\uC694\uCCAD\uD55C tRPC API \uACBD\uB85C\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.",
        code: -32004,
        data: { code: "NOT_FOUND", httpStatus: 404 }
      }
    }
  }]);
};

// server/localResearchNode.ts
import { timingSafeEqual } from "crypto";
import { createHash as createHash7 } from "node:crypto";
import { and as and25, asc as asc8, count as count2, desc as desc28, eq as eq35, inArray as inArray9, like as like6, ne, sql as sql4 } from "drizzle-orm";
var RESEARCH_NODE_TOKEN_HEADER = "x-research-node-token";
var TERMINAL_CONNECTION_HANDLER_VERSION = "terminal-sync-owner-fallback-v2";
function normalizeTerminalConnectionVerification2(value) {
  if (!value || typeof value !== "object") return null;
  const record = value;
  const oauth = String(record.oauth ?? "");
  const apiRead = String(record.apiRead ?? "");
  const serviceSync = String(record.serviceSync ?? "");
  const serviceReadBack = String(record.serviceReadBack ?? "");
  if (!["passed", "failed", "not_run"].includes(oauth) || !["passed", "failed", "not_run"].includes(apiRead) || !["passed", "failed", "pending", "not_run"].includes(serviceSync) || !["passed", "failed", "pending", "not_run"].includes(serviceReadBack)) return null;
  return { oauth, apiRead, serviceSync, serviceReadBack, apiId: typeof record.apiId === "string" && /^[a-z0-9]{2,32}$/i.test(record.apiId) ? record.apiId : void 0, responseRows: Number.isInteger(record.responseRows) && Number(record.responseRows) >= 0 ? Number(record.responseRows) : void 0 };
}
function isTerminalRoundTripVerified2(verification) {
  return Boolean(verification && verification.oauth === "passed" && verification.apiRead === "passed" && verification.serviceSync === "passed" && verification.serviceReadBack === "passed");
}
function koreanTradingDate(value) {
  return new Date(value.getTime() + 9 * 60 * 60 * 1e3).toISOString().slice(0, 10);
}
function shouldCloseIntradayExperiment(input) {
  if (koreanTradingDate(input.capturedAt) !== input.tradingDate) return false;
  const koreanTime = new Date(input.capturedAt.getTime() + 9 * 60 * 60 * 1e3);
  const minuteOfDay = koreanTime.getUTCHours() * 60 + koreanTime.getUTCMinutes();
  return minuteOfDay >= 15 * 60 + 31;
}
function selectClosedIntradayMinuteBars(input) {
  const closedBefore = new Date(input.capturedAt);
  closedBefore.setUTCSeconds(0, 0);
  const unique = /* @__PURE__ */ new Map();
  let rejected = 0;
  const rejectedReasons = { symbol: 0, price: 0, ohlc: 0, minuteAt: 0, unfinished: 0, tradingDate: 0 };
  input.bars.forEach((bar) => {
    if (!/^\d{6}$/.test(bar.symbol)) {
      rejected += 1;
      rejectedReasons.symbol += 1;
      return;
    }
    if (!Number.isInteger(bar.open) || !Number.isInteger(bar.high) || !Number.isInteger(bar.low) || !Number.isInteger(bar.close) || !Number.isFinite(bar.volume) || bar.open < 1 || bar.high < 1 || bar.low < 1 || bar.close < 1 || bar.volume < 0) {
      rejected += 1;
      rejectedReasons.price += 1;
      return;
    }
    if (bar.low > Math.min(bar.open, bar.close) || bar.high < Math.max(bar.open, bar.close)) {
      rejected += 1;
      rejectedReasons.ohlc += 1;
      return;
    }
    if (Number.isNaN(bar.minuteAt.getTime()) || bar.minuteAt.getUTCSeconds() !== 0) {
      rejected += 1;
      rejectedReasons.minuteAt += 1;
      return;
    }
    if (bar.minuteAt >= closedBefore) {
      rejected += 1;
      rejectedReasons.unfinished += 1;
      return;
    }
    if (koreanTradingDate(bar.minuteAt) !== input.tradingDate) {
      rejected += 1;
      rejectedReasons.tradingDate += 1;
      return;
    }
    unique.set(`${bar.symbol}:${bar.minuteAt.toISOString()}`, bar);
  });
  return { bars: Array.from(unique.values()).sort((left, right) => left.symbol.localeCompare(right.symbol) || left.minuteAt.getTime() - right.minuteAt.getTime()), rejected, rejectedReasons };
}
function minuteBarFingerprint(bar) {
  return createHash7("sha256").update(JSON.stringify({ symbol: bar.symbol, minuteAt: bar.minuteAt.toISOString(), open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume, source: "kiwoom_ka10080" })).digest("hex");
}
function selectValidLocalDailyBars(input) {
  const unique = /* @__PURE__ */ new Map();
  let rejected = 0;
  for (const bar of input.bars) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(bar.date) || ![bar.open, bar.high, bar.low, bar.close, bar.volume, bar.turnover].every(Number.isSafeInteger) || bar.open < 1 || bar.high < 1 || bar.low < 1 || bar.close < 1 || bar.volume < 0 || bar.turnover < 0 || bar.low > Math.min(bar.open, bar.close) || bar.high < Math.max(bar.open, bar.close)) {
      rejected += 1;
      continue;
    }
    unique.set(bar.date, bar);
  }
  return {
    bars: Array.from(unique.values()).sort((left, right) => left.date.localeCompare(right.date)),
    rejected,
    deduplicated: Math.max(0, input.bars.length - rejected - unique.size)
  };
}
function dailyBarFingerprint(input) {
  return createHash7("sha256").update(JSON.stringify({ symbol: input.symbol, adjustmentBasis: input.adjustmentBasis, ...input.bar, source: "kiwoom_ka10081" })).digest("hex");
}
function sharedDatasetDate(value) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
}
function selectSharedDatasetWindow(dates, sampleDays, randomSeed) {
  const uniqueDates = Array.from(new Set(dates)).sort();
  const warmupBars = 60;
  const latestStart = uniqueDates.length - sampleDays;
  if (latestStart <= warmupBars) return null;
  const evaluationStartIndex = warmupBars + randomSeed % (latestStart - warmupBars + 1);
  return { warmupBars, startDate: uniqueDates[evaluationStartIndex - warmupBars], evaluationStartDate: uniqueDates[evaluationStartIndex], endDate: uniqueDates[evaluationStartIndex + sampleDays - 1] };
}
function selectSharedCollectionPayload(input) {
  const allowedSymbols = new Set(input.universe.map((item) => item.symbol));
  const dailyByKey = /* @__PURE__ */ new Map();
  for (const raw of input.dailyBars) {
    const item = raw;
    const symbol = typeof item.symbol === "string" ? item.symbol.trim() : "";
    const candidate = { date: typeof item.date === "string" ? item.date.trim() : "", open: Number(item.open), high: Number(item.high), low: Number(item.low), close: Number(item.close), volume: Number(item.volume), turnover: Number(item.turnover) };
    const bar = allowedSymbols.has(symbol) ? selectValidLocalDailyBars({ bars: [candidate] }).bars[0] : null;
    if (bar) dailyByKey.set(`${symbol}:${bar.date}`, { symbol, ...bar });
  }
  const dailyRows = Array.from(dailyByKey.values()).sort((left, right) => left.symbol.localeCompare(right.symbol) || left.date.localeCompare(right.date));
  const commonDates = input.universe.reduce((shared, item) => {
    const dates = new Set(dailyRows.filter((bar) => bar.symbol === item.symbol).map((bar) => bar.date));
    return shared === null ? Array.from(dates) : shared.filter((date) => dates.has(date));
  }, null) ?? [];
  const window = selectSharedDatasetWindow(commonDates, input.sampleDays, input.randomSeed);
  if (!window) return { error: "\uACF5\uC6A9 \uB370\uC774\uD130\uC14B\uC5D0\uB294 \uBAA8\uB4E0 \uC885\uBAA9\uC5D0\uC11C 60\uC77C \uC9C0\uD45C \uAD6C\uAC04\uACFC \uD3C9\uAC00 \uAE30\uAC04\uC758 \uC2E4\uC81C \uC77C\uBD09\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." };
  const selectedDailyBars = dailyRows.filter((bar) => bar.date >= window.startDate && bar.date <= window.endDate);
  if (selectedDailyBars.length < input.universe.length * (window.warmupBars + input.sampleDays)) return { error: "\uC120\uD0DD\uB41C \uACF5\uC6A9 \uAE30\uAC04\uC758 \uC2E4\uC81C \uC77C\uBD09\uC774 \uC885\uBAA9\uBCC4\uB85C \uCDA9\uBD84\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4." };
  const minuteByKey = /* @__PURE__ */ new Map();
  for (const raw of input.fiveMinuteBars) {
    const item = raw;
    const symbol = typeof item.symbol === "string" ? item.symbol.trim() : "";
    const intervalAt = typeof item.intervalAt === "string" ? new Date(item.intervalAt) : /* @__PURE__ */ new Date(NaN);
    const open = Number(item.open);
    const high = Number(item.high);
    const low = Number(item.low);
    const close = Number(item.close);
    const volume = Number(item.volume);
    const tradingDate2 = Number.isNaN(intervalAt.getTime()) ? "" : sharedDatasetDate(intervalAt);
    if (!allowedSymbols.has(symbol) || !/^\d{4}-\d{2}-\d{2}$/.test(tradingDate2) || tradingDate2 < window.evaluationStartDate || tradingDate2 > window.endDate || ![open, high, low, close, volume].every(Number.isSafeInteger) || open < 1 || high < 1 || low < 1 || close < 1 || volume < 0 || low > Math.min(open, close) || high < Math.max(open, close)) continue;
    minuteByKey.set(`${symbol}:${intervalAt.toISOString()}`, { symbol, tradingDate: tradingDate2, intervalAt, open, high, low, close, volume });
  }
  const selectedFiveMinuteBars = Array.from(minuteByKey.values()).sort((left, right) => left.symbol.localeCompare(right.symbol) || left.intervalAt.getTime() - right.intervalAt.getTime());
  if (!selectedFiveMinuteBars.length) return { error: "\uC120\uD0DD\uB41C \uD3C9\uAC00 \uAE30\uAC04\uC758 \uC2E4\uC81C 5\uBD84\uBD09\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." };
  return { window, selectedDailyBars, selectedFiveMinuteBars };
}
function buildLocalDailyDatasetVersion(input) {
  const material = input.bars.slice().sort((left, right) => left.date.localeCompare(right.date)).map((bar) => `${bar.date}:${bar.rawFingerprint}`).join("|");
  const sourceFingerprint = createHash7("sha256").update(`${input.symbol}:${input.adjustmentBasis}:${material}`).digest("hex");
  const startDate = input.bars.map((bar) => bar.date).sort()[0] ?? "unknown";
  const endDate = input.bars.map((bar) => bar.date).sort().at(-1) ?? "unknown";
  return { sourceFingerprint, versionKey: `local-ka10081:${input.adjustmentBasis}:${input.symbol}:${startDate}:${endDate}:${sourceFingerprint.slice(0, 16)}` };
}
function buildLocalDailyUniverseDatasetVersion(input) {
  const material = input.bars.slice().sort((left, right) => left.symbol.localeCompare(right.symbol) || left.date.localeCompare(right.date)).map((bar) => `${bar.symbol}:${bar.date}:${bar.rawFingerprint}`).join("|");
  const sourceFingerprint = createHash7("sha256").update(`${input.symbols.slice().sort().join(",")}:${input.adjustmentBasis}:${material}`).digest("hex");
  const dates = input.bars.map((bar) => bar.date).sort();
  return { sourceFingerprint, versionKey: `local-ka10081:${input.adjustmentBasis}:universe:${dates[0] ?? "unknown"}:${dates.at(-1) ?? "unknown"}:${sourceFingerprint.slice(0, 16)}` };
}
function selectLocalDailyCollectionUniverse(runs, limit = 20) {
  for (const run of runs) {
    let raw = run.universeJson;
    if (typeof raw === "string") {
      try {
        raw = JSON.parse(raw);
      } catch {
        raw = [];
      }
    }
    if (!Array.isArray(raw)) continue;
    const unique = /* @__PURE__ */ new Map();
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const record = item;
      const symbol = typeof record.symbol === "string" ? record.symbol.trim() : "";
      if (!/^\d{6}$/.test(symbol) || unique.has(symbol)) continue;
      unique.set(symbol, { symbol, name: typeof record.name === "string" && record.name.trim() ? record.name.trim() : symbol });
    }
    if (unique.size >= 2) return Array.from(unique.values()).slice(0, limit);
  }
  return [];
}
function selectLiquidMinuteBackfillUniverse(input) {
  const lookbackDays = Math.max(1, Math.min(60, input.lookbackDays ?? 30));
  const recentDates = Array.from(new Set(input.bars.map((bar) => bar.date).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)))).sort((left, right) => right.localeCompare(left)).slice(0, lookbackDays);
  const selectedDates = new Set(recentDates);
  const turnoverBySymbol = /* @__PURE__ */ new Map();
  for (const bar of input.bars) {
    if (!selectedDates.has(bar.date) || !/^\d{6}$/.test(bar.symbol)) continue;
    const turnover = Number(bar.turnover);
    if (!Number.isFinite(turnover) || turnover < 0) continue;
    const prior = turnoverBySymbol.get(bar.symbol) ?? { total: 0, observedDays: /* @__PURE__ */ new Set() };
    prior.total += turnover;
    prior.observedDays.add(bar.date);
    turnoverBySymbol.set(bar.symbol, prior);
  }
  const nameBySymbol = new Map(input.knownNames.map((item) => [item.symbol, item.name]));
  return Array.from(turnoverBySymbol.entries()).map(([symbol, value]) => ({ symbol, name: nameBySymbol.get(symbol) ?? symbol, observedDays: value.observedDays.size, averageTurnover: Math.round(value.total / Math.max(1, value.observedDays.size)) })).filter((item) => item.observedDays >= Math.min(20, recentDates.length) && item.averageTurnover >= input.thresholdWon).sort((left, right) => right.averageTurnover - left.averageTurnover || left.symbol.localeCompare(right.symbol)).slice(0, Math.max(1, Math.min(120, input.maxSymbols)));
}
function buildIntradayMinuteCollectionPlan(input) {
  if (input.experiment?.status === "closed") {
    return {
      status: "market_closed",
      message: "\uC7A5 \uB9C8\uAC10\uC73C\uB85C \uB2F9\uC77C \uBAA8\uC758 \uC2E4\uD5D8\uC774 \uC885\uB8CC\uB418\uC5B4 \uCD94\uAC00 1\uBD84\uBD09 \uC218\uC9D1\uC744 \uACC4\uD68D\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.",
      experimentId: input.experiment.id,
      tradingDate: input.experiment.tradingDate
    };
  }
  if (!input.quotes.length) {
    return {
      status: "waiting_for_data",
      message: "\uC7A5\uC911 \uC218\uC9D1\uC5D0 \uC0AC\uC6A9\uD560 \uC800\uC7A5\uB41C \uC2E4\uC81C \uC720\uB3D9\uC131 \uC720\uB2C8\uBC84\uC2A4\uAC00 \uC544\uC9C1 \uC5C6\uC2B5\uB2C8\uB2E4."
    };
  }
  return {
    status: "ready",
    mode: input.experiment ? input.request ? "manual_refresh" : "scheduled_collection" : "scheduled_collection_bootstrap",
    request: input.request ? { id: input.request.id, requestedAt: input.request.requestedAt } : null,
    experimentId: input.experiment?.id ?? null,
    tradingDate: input.tradingDate,
    quotes: input.quotes
  };
}
function selectFreshIntradayQuotes(input) {
  const latestBySymbol = /* @__PURE__ */ new Map();
  let ignored = 0;
  for (const quote of input.quotes) {
    const knownObservedAt = input.lastObservedAtBySymbol.get(quote.symbol);
    const prior = latestBySymbol.get(quote.symbol);
    if (knownObservedAt && quote.observedAt.getTime() <= knownObservedAt.getTime()) {
      ignored += 1;
      continue;
    }
    if (prior && quote.observedAt.getTime() <= prior.observedAt.getTime()) {
      ignored += 1;
      continue;
    }
    latestBySymbol.set(quote.symbol, quote);
  }
  return { latestBySymbol, ignored };
}
function buildLocalAutoOrderPlan(input) {
  const orders = input.positions.map((position) => ({
    candidateId: position.candidateId,
    candidateFingerprint: position.candidateFingerprint,
    symbol: position.symbol,
    name: position.name,
    referencePrice: position.lastPrice ?? position.entryPrice,
    signalCount: position.signalCount,
    fitnessScore: input.fitnessByCandidateId.get(position.candidateId) ?? Number.NEGATIVE_INFINITY
  })).filter((item) => item.referencePrice > 0).sort((left, right) => right.fitnessScore - left.fitnessScore || right.signalCount - left.signalCount || left.symbol.localeCompare(right.symbol)).slice(0, input.maxPositions).map((item) => ({ ...item, dedupeKey: `auto:${input.tradingDate}:${input.policyVersion}:${item.candidateId}:${item.symbol}:buy` }));
  return {
    status: "ready",
    mode: "automatic_trading",
    experimentId: input.experimentId,
    tradingDate: input.tradingDate,
    policyVersion: input.policyVersion,
    totalCapital: input.totalCapital,
    policyId: input.policyId,
    selectedPositionCount: orders.length,
    orders,
    quotes: input.positions.map((position) => ({ symbol: position.symbol, name: position.name, price: position.lastPrice ?? position.entryPrice })).filter((item) => item.price > 0)
  };
}
function getStoredUniverseNames(value) {
  let raw = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = [];
    }
  }
  const names = /* @__PURE__ */ new Map();
  if (!Array.isArray(raw)) return names;
  raw.forEach((item) => {
    if (!item || typeof item !== "object") return;
    const record = item;
    if (typeof record.symbol === "string") names.set(record.symbol, typeof record.name === "string" && record.name ? record.name : record.symbol);
  });
  return names;
}
function getLocalIntradayBootstrapState(input) {
  if (input.minuteBarCount < 1) return "waiting_for_minute_bars";
  if (input.sourceCandidateCount < 1) return "waiting_for_survivors";
  if (input.dailySymbolCount < 1) return "waiting_for_daily_bars";
  return "ready";
}
function closeIntradayCandidateSimulation(simulationJson, capturedAt) {
  if (!simulationJson || typeof simulationJson !== "object" || Array.isArray(simulationJson)) return simulationJson;
  const simulation = simulationJson;
  const entries = Array.isArray(simulation.entries) ? simulation.entries : [];
  return {
    ...simulation,
    status: "closed",
    closedAt: capturedAt.toISOString(),
    updatedAt: capturedAt.toISOString(),
    entries: entries.map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
      const record = entry;
      const lastPrice = Number(record.lastPrice);
      if (!Number.isFinite(lastPrice) || lastPrice < 1) return record;
      const observedAt = typeof record.lastObservedAt === "string" && !Number.isNaN(new Date(record.lastObservedAt).getTime()) ? record.lastObservedAt : capturedAt.toISOString();
      return { ...record, exitPrice: lastPrice, exitAt: observedAt };
    })
  };
}
async function ensureLocalIntradayExperiment(db, tradingDate2) {
  await db.update(dayTradeExperiments).set({ status: "closed", closedAt: /* @__PURE__ */ new Date() }).where(and25(eq35(dayTradeExperiments.status, "tracking"), ne(dayTradeExperiments.tradingDate, tradingDate2)));
  const [closed] = await db.select().from(dayTradeExperiments).where(and25(eq35(dayTradeExperiments.status, "closed"), eq35(dayTradeExperiments.tradingDate, tradingDate2))).orderBy(desc28(dayTradeExperiments.updatedAt)).limit(1);
  if (closed) return closed;
  const [existing] = await db.select().from(dayTradeExperiments).where(and25(eq35(dayTradeExperiments.status, "tracking"), eq35(dayTradeExperiments.tradingDate, tradingDate2))).orderBy(desc28(dayTradeExperiments.updatedAt)).limit(1);
  const minuteRows = await db.select().from(intradayMinuteBars).where(eq35(intradayMinuteBars.tradingDate, tradingDate2)).orderBy(asc8(intradayMinuteBars.minuteAt));
  if (getLocalIntradayBootstrapState({ minuteBarCount: minuteRows.length, sourceCandidateCount: 1, dailySymbolCount: 1 }) !== "ready") return null;
  const sourceRun = (await db.select().from(autonomousResearchRuns).where(and25(eq35(autonomousResearchRuns.dataStatus, "ready"), like6(autonomousResearchRuns.runKey, "%:historical%"))).orderBy(desc28(autonomousResearchRuns.updatedAt)).limit(1))[0];
  if (!sourceRun) return null;
  const sourceCandidates = await db.select().from(autonomousResearchCandidates).where(and25(eq35(autonomousResearchCandidates.runId, sourceRun.id), eq35(autonomousResearchCandidates.status, "survived"))).orderBy(desc28(autonomousResearchCandidates.fitnessScore));
  if (getLocalIntradayBootstrapState({ minuteBarCount: minuteRows.length, sourceCandidateCount: sourceCandidates.length, dailySymbolCount: 1 }) !== "ready") return null;
  const dailyRows = await db.select().from(autonomousResearchBars).where(eq35(autonomousResearchBars.runId, sourceRun.id)).orderBy(asc8(autonomousResearchBars.symbol), asc8(autonomousResearchBars.date));
  const dailyBySymbol = dailyRows.reduce((all, bar) => {
    (all[bar.symbol] ??= []).push({ date: bar.date, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: Number(bar.volume), turnover: Number(bar.turnover) });
    return all;
  }, {});
  if (getLocalIntradayBootstrapState({ minuteBarCount: minuteRows.length, sourceCandidateCount: sourceCandidates.length, dailySymbolCount: Object.keys(dailyBySymbol).length }) !== "ready") return null;
  const minuteBySymbol = minuteRows.reduce((all, bar) => {
    const bars = all.get(bar.symbol) ?? [];
    bars.push(bar);
    all.set(bar.symbol, bars);
    return all;
  }, /* @__PURE__ */ new Map());
  const runKey = `autonomous-v1:${tradingDate2}:local-intraday`;
  let run = existing ? (await db.select().from(autonomousResearchRuns).where(eq35(autonomousResearchRuns.id, existing.runId)).limit(1))[0] : (await db.select().from(autonomousResearchRuns).where(eq35(autonomousResearchRuns.runKey, runKey)).limit(1))[0];
  if (!run) {
    await db.insert(autonomousResearchRuns).values({ tradingDate: tradingDate2, runKey, policyVersion: sourceRun.policyVersion, phase: "intraday", dataStatus: "ready", universeJson: sourceRun.universeJson, summaryJson: { mode: "local_intraday_from_historical_survivors", sourceRunId: sourceRun.id, minuteSource: "kiwoom_ka10080" }, lastObservedAt: /* @__PURE__ */ new Date() });
    run = (await db.select().from(autonomousResearchRuns).where(eq35(autonomousResearchRuns.runKey, runKey)).limit(1))[0];
  }
  if (!run) return null;
  const names = getStoredUniverseNames(sourceRun.universeJson);
  const now = /* @__PURE__ */ new Date();
  for (const source of sourceCandidates) {
    const entries = Array.from(minuteBySymbol.entries()).flatMap(([symbol, minutes]) => {
      const bars = dailyBySymbol[symbol];
      if (!bars?.length) return [];
      const evaluation = evaluateExpression(source.rootGenomeJson, bars);
      if (!evaluation.eligible || evaluation.score < source.minimumScore) return [];
      const first = minutes[0];
      const latest = minutes.at(-1);
      return [{ symbol, name: names.get(symbol) ?? symbol, entryPrice: first.close, entryAt: first.minuteAt.toISOString(), evidence: { score: evaluation.score, matchedRuleCount: evaluation.evaluations.filter((item) => item.matched).length, details: evaluation.evaluations.filter((item) => item.matched).slice(0, 5).map((item) => item.detail) }, lastPrice: latest.close, lastObservedAt: latest.minuteAt.toISOString(), returnPercent: (latest.close - first.close) / first.close * 100 }];
    });
    const simulation = { status: entries.length ? "tracking" : "not_entered", entries, updatedAt: now.toISOString(), source: "local_ka10081_and_ka10080" };
    await db.insert(autonomousResearchCandidates).values({ runId: run.id, fingerprint: source.fingerprint, rootGenomeJson: source.rootGenomeJson, minimumScore: source.minimumScore, generationNumber: source.generationNumber, status: "survived", inSampleMetricsJson: source.inSampleMetricsJson, outOfSampleMetricsJson: source.outOfSampleMetricsJson, walkForwardMetricsJson: source.walkForwardMetricsJson, simulationJson: simulation, fitnessScore: source.fitnessScore, evaluatedAt: now }).onConflictDoUpdate({
      target: autonomousResearchCandidates.fingerprint,
      set: { simulationJson: simulation, updatedAt: now }
    });
  }
  const candidates = await db.select().from(autonomousResearchCandidates).where(and25(eq35(autonomousResearchCandidates.runId, run.id), eq35(autonomousResearchCandidates.status, "survived")));
  await persistDayTradeExperiment({ run, candidates, isClosing: false });
  return (await db.select().from(dayTradeExperiments).where(and25(eq35(dayTradeExperiments.runId, run.id), eq35(dayTradeExperiments.status, "tracking"))).limit(1))[0] ?? null;
}
async function closeLocalIntradayExperimentAtMarketClose(db, input) {
  if (!shouldCloseIntradayExperiment(input)) return null;
  const [experiment] = await db.select().from(dayTradeExperiments).where(and25(eq35(dayTradeExperiments.status, "tracking"), eq35(dayTradeExperiments.tradingDate, input.tradingDate))).orderBy(desc28(dayTradeExperiments.updatedAt)).limit(1);
  if (!experiment) return null;
  const [run] = await db.select().from(autonomousResearchRuns).where(eq35(autonomousResearchRuns.id, experiment.runId)).limit(1);
  if (!run) return null;
  const candidates = await db.select().from(autonomousResearchCandidates).where(and25(eq35(autonomousResearchCandidates.runId, run.id), eq35(autonomousResearchCandidates.status, "survived")));
  for (const candidate of candidates) {
    await db.update(autonomousResearchCandidates).set({ simulationJson: closeIntradayCandidateSimulation(candidate.simulationJson, input.capturedAt), updatedAt: input.capturedAt }).where(eq35(autonomousResearchCandidates.id, candidate.id));
  }
  const closedCandidates = await db.select().from(autonomousResearchCandidates).where(and25(eq35(autonomousResearchCandidates.runId, run.id), eq35(autonomousResearchCandidates.status, "survived")));
  await db.update(autonomousResearchRuns).set({ phase: "completed", lastObservedAt: input.capturedAt }).where(eq35(autonomousResearchRuns.id, run.id));
  await persistDayTradeExperiment({ run, candidates: closedCandidates, isClosing: true });
  return (await db.select().from(dayTradeExperiments).where(eq35(dayTradeExperiments.id, experiment.id)).limit(1))[0] ?? null;
}
function isLocalResearchNodeAuthorized(request) {
  const expected = process.env.LOCAL_RESEARCH_NODE_TOKEN?.trim();
  const supplied = request.header(RESEARCH_NODE_TOKEN_HEADER)?.trim();
  if (!expected || !supplied) return false;
  const expectedBytes = Buffer.from(expected, "utf8");
  const suppliedBytes = Buffer.from(supplied, "utf8");
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}
function normalizeSharedDatasetStreamWindow(value) {
  if (!value || typeof value !== "object") return null;
  const record = value;
  const startDate = typeof record.startDate === "string" ? record.startDate : "";
  const evaluationStartDate = typeof record.evaluationStartDate === "string" ? record.evaluationStartDate : "";
  const endDate = typeof record.endDate === "string" ? record.endDate : "";
  if (![startDate, evaluationStartDate, endDate].every((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)) || startDate > evaluationStartDate || evaluationStartDate > endDate) return null;
  return { startDate, evaluationStartDate, endDate };
}
function normalizeSharedDatasetStreamUniverse(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    const item = raw;
    const symbol = typeof item.symbol === "string" ? item.symbol.trim() : "";
    const name = typeof item.name === "string" && item.name.trim() ? item.name.trim().slice(0, 120) : symbol;
    return /^\d{6}$/.test(symbol) ? [{ symbol, name }] : [];
  });
}
function registerLocalResearchNodeRoutes(app2) {
  app2.get("/api/local-research-node/health", (request, response) => {
    response.setHeader("Cache-Control", "no-store, private, max-age=0");
    if (!isLocalResearchNodeAuthorized(request)) {
      return response.status(401).json({ status: "unauthorized" });
    }
    return response.json({
      status: "ready",
      mode: "local_automatic_execution",
      allowed: ["oauth_token", "daily_bar_collection", "daily_bar_collection_plan", "daily_bar_sync", "daily_dataset_promote", "daily_dataset_research", "research_dataset_upload", "shared_dataset_collection_plan", "shared_dataset_collection_sync", "shared_dataset_collection_status", "auto_order_plan", "execution_sync", "position_sync", "intraday_price_plan", "intraday_price_sync", "intraday_price_status", "intraday_minute_collection_plan", "intraday_minute_sync", "intraday_minute_backfill_plan", "intraday_minute_backfill_sync", "intraday_minute_collection_status"],
      blocked: ["manual_web_order_transmission"]
    });
  });
  app2.post("/api/local-research-node/kiwoom-terminal-connection", async (request, response) => {
    response.setHeader("Cache-Control", "no-store, private, max-age=0");
    if (!isLocalResearchNodeAuthorized(request)) return response.status(401).json({ status: "unauthorized" });
    const body = request.body;
    const terminalIp = typeof body?.terminalIp === "string" ? body.terminalIp.trim() : "";
    const status = body?.status === "connected" || body?.status === "failed" ? body.status : null;
    const errorCode = typeof body?.errorCode === "string" && /^[a-z0-9_]{1,80}$/i.test(body.errorCode) ? body.errorCode : null;
    const message = typeof body?.message === "string" ? body.message.replace(/bearer\s+\S+|secretkey\s*[:=]\s*\S+|appkey\s*[:=]\s*\S+/gi, "[redacted]").slice(0, 500) : "\uD0A4\uC6C0 REST \uB2E8\uB9D0 \uC778\uC99D \uACB0\uACFC\uB97C \uBC1B\uC558\uC2B5\uB2C8\uB2E4.";
    const verification = normalizeTerminalConnectionVerification2(body?.verification);
    if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(terminalIp) || !status) return response.status(400).json({ status: "invalid_payload", message: "terminalIp\uACFC \uC778\uC99D \uC0C1\uD0DC\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4." });
    const db = await getDb();
    if (!db) return response.status(503).json({ status: "unavailable", message: "\uC5F0\uAD6C \uB370\uC774\uD130\uBCA0\uC774\uC2A4\uB97C \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    const ownerOpenId = process.env.OWNER_OPEN_ID?.trim();
    let owner = ownerOpenId ? (await db.select({ id: users.id }).from(users).where(eq35(users.openId, ownerOpenId)).limit(1))[0] : null;
    if (!owner) {
      const adminCandidates = await db.select({ id: users.id }).from(users).where(eq35(users.role, "admin")).limit(2);
      owner = adminCandidates.length === 1 ? adminCandidates[0] : null;
    }
    if (!owner) return response.status(409).json({ status: "owner_not_ready", handlerVersion: TERMINAL_CONNECTION_HANDLER_VERSION, message: "\uB2E8\uB9D0 \uC778\uC99D \uACB0\uACFC\uB97C \uC5F0\uACB0\uD560 \uC18C\uC720\uC790 \uACC4\uC815\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uC18C\uC720\uC790 \uC124\uC815 \uB610\uB294 \uB2E8\uC77C \uC6B4\uC601\uC790 \uACC4\uC815\uC744 \uD655\uC778\uD558\uC138\uC694." });
    await db.insert(kiwoomTerminalConnectionChecks).values({ userId: owner.id, terminalIp, status, errorCode, message, verificationJson: verification, checkedAt: /* @__PURE__ */ new Date() });
    const roundTripVerified = status === "connected" && isTerminalRoundTripVerified2(verification);
    return response.json({ status: "recorded", handlerVersion: TERMINAL_CONNECTION_HANDLER_VERSION, terminalIp, connection: status, roundTripVerified, verification, nextAction: roundTripVerified ? "\uD0A4\uC6C0 API\xB7\uC11C\uBE44\uC2A4 \uC655\uBCF5\uC774 \uD655\uC778\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uACF5\uC6A9 \uB370\uC774\uD130 \uC218\uC9D1\uC744 \uC2DC\uC791\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4." : status === "connected" ? "OAuth \uB610\uB294 \uC77C\uBD80 \uB2E8\uACC4\uB9CC \uAE30\uB85D\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uD0A4\uC6C0 API \uC77D\uAE30\xB7\uC11C\uBE44\uC2A4 \uC800\uC7A5 \uACB0\uACFC \uC7AC\uD655\uC778\uC744 \uC644\uB8CC\uD558\uC138\uC694." : "\uD0A4\uC6C0 \uB2E8\uB9D0 \uB4F1\uB85D IP\uC640 OAuth \uC790\uACA9 \uC99D\uBA85\uC744 \uB2E4\uC2DC \uD655\uC778\uD558\uC138\uC694." });
  });
  app2.get("/api/local-research-node/kiwoom-terminal-connection", async (request, response) => {
    response.setHeader("Cache-Control", "no-store, private, max-age=0");
    if (!isLocalResearchNodeAuthorized(request)) return response.status(401).json({ status: "unauthorized" });
    const terminalIp = typeof request.query.terminalIp === "string" ? request.query.terminalIp.trim() : "";
    if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(terminalIp)) return response.status(400).json({ status: "invalid_request", message: "terminalIp\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." });
    const db = await getDb();
    if (!db) return response.status(503).json({ status: "unavailable", message: "\uC5F0\uAD6C \uB370\uC774\uD130\uBCA0\uC774\uC2A4\uB97C \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    const ownerOpenId = process.env.OWNER_OPEN_ID?.trim();
    let owner = ownerOpenId ? (await db.select({ id: users.id }).from(users).where(eq35(users.openId, ownerOpenId)).limit(1))[0] : null;
    if (!owner) {
      const adminCandidates = await db.select({ id: users.id }).from(users).where(eq35(users.role, "admin")).limit(2);
      owner = adminCandidates.length === 1 ? adminCandidates[0] : null;
    }
    if (!owner) return response.status(409).json({ status: "owner_not_ready", handlerVersion: TERMINAL_CONNECTION_HANDLER_VERSION });
    const check = (await db.select({ terminalIp: kiwoomTerminalConnectionChecks.terminalIp, status: kiwoomTerminalConnectionChecks.status, errorCode: kiwoomTerminalConnectionChecks.errorCode, message: kiwoomTerminalConnectionChecks.message, verificationJson: kiwoomTerminalConnectionChecks.verificationJson, checkedAt: kiwoomTerminalConnectionChecks.checkedAt }).from(kiwoomTerminalConnectionChecks).where(and25(eq35(kiwoomTerminalConnectionChecks.userId, owner.id), eq35(kiwoomTerminalConnectionChecks.terminalIp, terminalIp))).orderBy(desc28(kiwoomTerminalConnectionChecks.checkedAt)).limit(1))[0] ?? null;
    if (!check) return response.status(404).json({ status: "not_found", terminalIp });
    const verification = normalizeTerminalConnectionVerification2(check.verificationJson);
    return response.json({ status: "recorded", handlerVersion: TERMINAL_CONNECTION_HANDLER_VERSION, terminalIp: check.terminalIp, connection: check.status, verification, roundTripVerified: check.status === "connected" && isTerminalRoundTripVerified2(verification), checkedAt: check.checkedAt });
  });
  app2.get("/api/local-research-node/intraday-price-plan", async (request, response) => {
    response.setHeader("Cache-Control", "no-store, private, max-age=0");
    if (!isLocalResearchNodeAuthorized(request)) return response.status(401).json({ status: "unauthorized" });
    const db = await getDb();
    if (!db) return response.status(503).json({ status: "unavailable", message: "\uC5F0\uAD6C \uB370\uC774\uD130\uBCA0\uC774\uC2A4\uB97C \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    const [experiment] = await db.select().from(dayTradeExperiments).where(eq35(dayTradeExperiments.status, "tracking")).orderBy(desc28(dayTradeExperiments.updatedAt)).limit(1);
    if (!experiment) return response.status(409).json({ status: "waiting_for_data", message: "\uCD94\uC801 \uC911\uC778 \uC7A5\uC911 \uBAA8\uC758\uD22C\uC790 \uAE30\uB85D\uC774 \uC544\uC9C1 \uC5C6\uC2B5\uB2C8\uB2E4." });
    const positions = await db.select({ symbol: dayTradeExperimentPositions.symbol, name: dayTradeExperimentPositions.name }).from(dayTradeExperimentPositions).where(eq35(dayTradeExperimentPositions.experimentId, experiment.id));
    return response.json({ status: "ready", mode: "read_only_intraday_price_collection", experimentId: experiment.id, tradingDate: experiment.tradingDate, quotes: positions.map((position) => ({ symbol: position.symbol, name: position.name })) });
  });
  app2.get("/api/local-research-node/daily-bar-collection-plan", async (request, response) => {
    response.setHeader("Cache-Control", "no-store, private, max-age=0");
    if (!isLocalResearchNodeAuthorized(request)) return response.status(401).json({ status: "unauthorized" });
    const db = await getDb();
    if (!db) return response.status(503).json({ status: "unavailable", message: "\uC5F0\uAD6C \uB370\uC774\uD130\uBCA0\uC774\uC2A4\uB97C \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    const runs = await db.select({ universeJson: autonomousResearchRuns.universeJson }).from(autonomousResearchRuns).where(eq35(autonomousResearchRuns.dataStatus, "ready")).orderBy(desc28(autonomousResearchRuns.updatedAt)).limit(40);
    const symbols = selectLocalDailyCollectionUniverse(runs, 20);
    if (!symbols.length) return response.status(409).json({ status: "waiting_for_universe", message: "\uC2E4\uC81C \uC77C\uBD09 \uC218\uC9D1\uC5D0 \uC0AC\uC6A9\uD560 \uC800\uC7A5 \uC5F0\uAD6C \uC720\uB2C8\uBC84\uC2A4\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." });
    return response.json({ status: "ready", mode: "scheduled_daily_collection", adjustmentBasis: "adjusted", symbols });
  });
  app2.get("/api/local-research-node/shared-dataset-collection-plan", async (request, response) => {
    response.setHeader("Cache-Control", "no-store, private, max-age=0");
    if (!isLocalResearchNodeAuthorized(request)) return response.status(401).json({ status: "unauthorized" });
    const db = await getDb();
    if (!db) return response.status(503).json({ status: "unavailable", message: "\uC5F0\uAD6C \uB370\uC774\uD130\uBCA0\uC774\uC2A4\uB97C \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    const queued = (await db.select().from(sharedDatasetCollectionRequests).where(eq35(sharedDatasetCollectionRequests.status, "queued")).orderBy(desc28(sharedDatasetCollectionRequests.requestedAt)).limit(1))[0];
    if (!queued) return response.status(409).json({ status: "idle", message: "\uC5F0\uACB0 \uC2DC \uCC98\uB9AC\uD560 \uACF5\uC6A9 \uB370\uC774\uD130\uC14B \uC218\uC9D1 \uC694\uCCAD\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." });
    await db.update(sharedDatasetCollectionRequests).set({ status: "running", startedAt: /* @__PURE__ */ new Date(), lastError: null, progressJson: { stage: "accepted", message: "\uC9C0\uC815 \uB2E8\uB9D0 \uC218\uC9D1\uAE30\uAC00 \uC694\uCCAD\uC744 \uC811\uC218\uD588\uC2B5\uB2C8\uB2E4.", totalSymbols: queued.symbolCount, updatedAt: (/* @__PURE__ */ new Date()).toISOString() } }).where(eq35(sharedDatasetCollectionRequests.id, queued.id));
    return response.json({ status: "ready", mode: "manual_shared_dataset_read_only_collection", request: { id: queued.id, randomSeed: queued.randomSeed, symbolCount: queued.symbolCount, sampleDays: queued.sampleDays, requestFingerprint: queued.requestFingerprint, resumeCount: queued.resumeCount, requestedByUserId: queued.requestedByUserId } });
  });
  app2.post("/api/local-research-node/shared-dataset-collection-sync", async (request, response) => {
    response.setHeader("Cache-Control", "no-store, private, max-age=0");
    if (!isLocalResearchNodeAuthorized(request)) return response.status(401).json({ status: "unauthorized" });
    const body = request.body;
    const requestId = Number(body?.requestId);
    const universe = Array.isArray(body?.universe) ? body.universe.flatMap((raw) => {
      const item = raw;
      const symbol = typeof item.symbol === "string" ? item.symbol.trim() : "";
      const name = typeof item.name === "string" && item.name.trim() ? item.name.trim().slice(0, 120) : symbol;
      return /^\d{6}$/.test(symbol) ? [{ symbol, name }] : [];
    }) : [];
    if (!Number.isInteger(requestId) || requestId < 1 || !Array.isArray(body?.dailyBars) || !Array.isArray(body?.fiveMinuteBars) || !universe.length) return response.status(400).json({ status: "invalid_request", message: "requestId, universe, dailyBars, fiveMinuteBars\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4." });
    const db = await getDb();
    if (!db) return response.status(503).json({ status: "unavailable", message: "\uC5F0\uAD6C \uB370\uC774\uD130\uBCA0\uC774\uC2A4\uB97C \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    const collection = (await db.select().from(sharedDatasetCollectionRequests).where(eq35(sharedDatasetCollectionRequests.id, requestId)).limit(1))[0];
    if (!collection || collection.status !== "running") return response.status(409).json({ status: "invalid_request_state", message: "\uC2E4\uD589 \uC911\uC778 \uACF5\uC6A9 \uB370\uC774\uD130\uC14B \uC218\uC9D1 \uC694\uCCAD\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    if (new Set(universe.map((item) => item.symbol)).size !== universe.length || universe.length !== collection.symbolCount) return response.status(400).json({ status: "invalid_universe", message: "\uC218\uC9D1 \uC694\uCCAD\uC758 \uC885\uBAA9 \uC218\uC640 \uB3D9\uAE30\uD654 \uC720\uB2C8\uBC84\uC2A4\uAC00 \uC77C\uCE58\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4." });
    const selected = selectSharedCollectionPayload({ universe, dailyBars: body.dailyBars, fiveMinuteBars: body.fiveMinuteBars, sampleDays: collection.sampleDays, randomSeed: collection.randomSeed });
    if ("error" in selected) return response.status(400).json({ status: "invalid_source_data", message: selected.error });
    const sourceFingerprint = createHash7("sha256").update(JSON.stringify({ source: ["kiwoom_ka10081", "kiwoom_ka10080"], universe, window: selected.window, daily: selected.selectedDailyBars, fiveMinute: selected.selectedFiveMinuteBars.map((bar) => ({ ...bar, intervalAt: bar.intervalAt.toISOString() })) })).digest("hex");
    const existing = (await db.select().from(researchDatasets).where(and25(eq35(researchDatasets.sourceFingerprint, sourceFingerprint), eq35(researchDatasets.visibility, "shared_public"), eq35(researchDatasets.qualityStatus, "ready"))).limit(1))[0];
    if (existing) {
      await db.update(sharedDatasetCollectionRequests).set({ status: "completed", datasetId: existing.id, plannedUniverseJson: universe, acceptedDailyBarCount: existing.barCount, acceptedFiveMinuteBarCount: existing.minuteBarCount, progressJson: { stage: "completed", message: "\uAC19\uC740 \uC6D0\uBCF8\uC744 \uCC3E\uC544 \uAE30\uC874 \uACF5\uC6A9 \uB370\uC774\uD130\uC14B\uC744 \uC7AC\uC0AC\uC6A9\uD588\uC2B5\uB2C8\uB2E4.", totalSymbols: universe.length, completedDailySymbols: universe.length, completedFiveMinuteSymbols: universe.length, updatedAt: (/* @__PURE__ */ new Date()).toISOString() }, completedAt: /* @__PURE__ */ new Date() }).where(eq35(sharedDatasetCollectionRequests.id, collection.id));
      return response.json({ status: "reused", requestId: collection.id, datasetId: existing.id, versionKey: existing.versionKey, sourceFingerprint });
    }
    const now = /* @__PURE__ */ new Date();
    const versionKey = `shared-local-ka10081-ka10080:${selected.window.startDate}:${selected.window.endDate}:${sourceFingerprint.slice(0, 16)}`;
    const [created] = await db.insert(researchDatasets).values({ userId: collection.requestedByUserId, name: `\uACF5\uC6A9 \uB79C\uB364 \uC544\uB808\uB098 \xB7 ${universe.length}\uC885\uBAA9 \xB7 ${selected.window.evaluationStartDate}~${selected.window.endDate}`, source: "kiwoom_daily_five_minute", versionKey, visibility: "shared_public", randomSeed: collection.randomSeed, sourceFingerprint, universeJson: universe, startDate: selected.window.startDate, endDate: selected.window.endDate, barCount: selected.selectedDailyBars.length, minuteBarCount: selected.selectedFiveMinuteBars.length, adjustmentBasis: "adjusted", qualityStatus: "collecting", sourceCapturedAt: now, qualityReportJson: { state: "collecting", source: ["kiwoom_ka10081", "kiwoom_ka10080"], randomSeed: collection.randomSeed, sampleDays: collection.sampleDays, ...selected.window, universe, collectionRequestId: collection.id, fixedIpSource: true } }).returning();
    try {
      for (let offset = 0; offset < selected.selectedDailyBars.length; offset += 200) await db.insert(researchDailyBars).values(selected.selectedDailyBars.slice(offset, offset + 200).map((bar) => ({ datasetId: created.id, symbol: bar.symbol, date: bar.date, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: String(bar.volume), turnover: String(bar.turnover), source: "kiwoom_ka10081_local_shared_snapshot" })));
      for (let offset = 0; offset < selected.selectedFiveMinuteBars.length; offset += 200) await db.insert(researchFiveMinuteBars).values(selected.selectedFiveMinuteBars.slice(offset, offset + 200).map((bar) => ({ datasetId: created.id, symbol: bar.symbol, tradingDate: bar.tradingDate, intervalAt: bar.intervalAt, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: String(bar.volume), source: "kiwoom_ka10080_local_shared_snapshot", rawFingerprint: createHash7("sha256").update(JSON.stringify({ ...bar, intervalAt: bar.intervalAt.toISOString() })).digest("hex") })));
      await db.update(researchDatasets).set({ qualityStatus: "ready", readyAt: now, qualityReportJson: { state: "ready", source: ["kiwoom_ka10081", "kiwoom_ka10080"], sourceFingerprint, randomSeed: collection.randomSeed, sampleDays: collection.sampleDays, ...selected.window, universe, dailyBarCount: selected.selectedDailyBars.length, fiveMinuteBarCount: selected.selectedFiveMinuteBars.length, immutable: true, fixedIpSource: true, collectionRequestId: collection.id } }).where(eq35(researchDatasets.id, created.id));
      await db.update(sharedDatasetCollectionRequests).set({ status: "completed", datasetId: created.id, plannedUniverseJson: universe, acceptedDailyBarCount: selected.selectedDailyBars.length, acceptedFiveMinuteBarCount: selected.selectedFiveMinuteBars.length, progressJson: { stage: "completed", message: "\uC77C\uBD09\xB75\uBD84\uBD09 \uC6D0\uBCF8\uC744 \uAC80\uC99D\uD574 \uACF5\uC6A9 \uB370\uC774\uD130\uC14B \uBCF4\uAD00\uC18C\uC5D0 \uACE0\uC815\uD588\uC2B5\uB2C8\uB2E4.", totalSymbols: universe.length, completedDailySymbols: universe.length, completedFiveMinuteSymbols: universe.length, updatedAt: now.toISOString() }, completedAt: now }).where(eq35(sharedDatasetCollectionRequests.id, collection.id));
      return response.json({ status: "ready", requestId: collection.id, datasetId: created.id, versionKey, sourceFingerprint, acceptedDailyBarCount: selected.selectedDailyBars.length, acceptedFiveMinuteBarCount: selected.selectedFiveMinuteBars.length });
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : "\uACF5\uC6A9 \uC6D0\uBCF8 \uC2A4\uB0C5\uC0F7 \uC800\uC7A5 \uC2E4\uD328";
      await db.update(researchDatasets).set({ qualityStatus: "error", qualityReportJson: { state: "error", sourceFingerprint, error: message } }).where(eq35(researchDatasets.id, created.id));
      await db.update(sharedDatasetCollectionRequests).set({ status: "failed", lastError: message, completedAt: /* @__PURE__ */ new Date() }).where(eq35(sharedDatasetCollectionRequests.id, collection.id));
      return response.status(500).json({ status: "snapshot_failed", message });
    }
  });
  app2.post("/api/local-research-node/shared-dataset-collection-stream-start", async (request, response) => {
    response.setHeader("Cache-Control", "no-store, private, max-age=0");
    if (!isLocalResearchNodeAuthorized(request)) return response.status(401).json({ status: "unauthorized" });
    const body = request.body;
    const requestId = Number(body?.requestId);
    const universe = normalizeSharedDatasetStreamUniverse(body?.universe);
    const window = normalizeSharedDatasetStreamWindow(body?.window);
    const sourceFingerprint = typeof body?.sourceFingerprint === "string" && /^[a-f0-9]{64}$/i.test(body.sourceFingerprint) ? body.sourceFingerprint : "";
    const expectedDailyBarCount = Number(body?.expectedDailyBarCount);
    const expectedFiveMinuteBarCount = Number(body?.expectedFiveMinuteBarCount);
    if (!Number.isInteger(requestId) || requestId < 1 || !window || !sourceFingerprint || !Number.isInteger(expectedDailyBarCount) || expectedDailyBarCount < universe.length || expectedDailyBarCount > 1e4 || !Number.isInteger(expectedFiveMinuteBarCount) || expectedFiveMinuteBarCount < universe.length || expectedFiveMinuteBarCount > 15e4 || !universe.length) return response.status(400).json({ status: "invalid_request", message: "requestId, universe, window, sourceFingerprint, \uC608\uC0C1 \uC6D0\uBCF8 \uD589 \uC218\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4." });
    const db = await getDb();
    if (!db) return response.status(503).json({ status: "unavailable", message: "\uC5F0\uAD6C \uB370\uC774\uD130\uBCA0\uC774\uC2A4\uB97C \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    const collection = (await db.select().from(sharedDatasetCollectionRequests).where(eq35(sharedDatasetCollectionRequests.id, requestId)).limit(1))[0];
    if (!collection || collection.status !== "running") return response.status(409).json({ status: "invalid_request_state", message: "\uC2E4\uD589 \uC911\uC778 \uACF5\uC6A9 \uB370\uC774\uD130\uC14B \uC218\uC9D1 \uC694\uCCAD\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    if (new Set(universe.map((item) => item.symbol)).size !== universe.length || universe.length !== collection.symbolCount) return response.status(400).json({ status: "invalid_universe", message: "\uC218\uC9D1 \uC694\uCCAD\uC758 \uC885\uBAA9 \uC218\uC640 \uB3D9\uAE30\uD654 \uC720\uB2C8\uBC84\uC2A4\uAC00 \uC77C\uCE58\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4." });
    const existingReady = (await db.select().from(researchDatasets).where(and25(eq35(researchDatasets.sourceFingerprint, sourceFingerprint), eq35(researchDatasets.visibility, "shared_public"), eq35(researchDatasets.qualityStatus, "ready"))).limit(1))[0];
    if (existingReady) {
      await db.update(sharedDatasetCollectionRequests).set({ status: "completed", datasetId: existingReady.id, plannedUniverseJson: universe, acceptedDailyBarCount: existingReady.barCount, acceptedFiveMinuteBarCount: existingReady.minuteBarCount, progressJson: { stage: "completed", message: "\uAC19\uC740 \uC6D0\uBCF8\uC744 \uCC3E\uC544 \uAE30\uC874 \uACF5\uC6A9 \uB370\uC774\uD130\uC14B\uC744 \uC7AC\uC0AC\uC6A9\uD588\uC2B5\uB2C8\uB2E4.", totalSymbols: universe.length, completedDailySymbols: universe.length, completedFiveMinuteSymbols: universe.length, updatedAt: (/* @__PURE__ */ new Date()).toISOString() }, completedAt: /* @__PURE__ */ new Date() }).where(eq35(sharedDatasetCollectionRequests.id, collection.id));
      return response.json({ status: "reused", requestId: collection.id, datasetId: existingReady.id, versionKey: existingReady.versionKey, sourceFingerprint });
    }
    const attached = collection.datasetId ? (await db.select().from(researchDatasets).where(and25(eq35(researchDatasets.id, collection.datasetId), eq35(researchDatasets.qualityStatus, "collecting"))).limit(1))[0] : null;
    if (attached) return response.json({ status: "uploading", requestId: collection.id, datasetId: attached.id, versionKey: attached.versionKey, sourceFingerprint });
    const now = /* @__PURE__ */ new Date();
    const versionKey = `shared-local-ka10081-ka10080:${window.startDate}:${window.endDate}:${sourceFingerprint.slice(0, 16)}`;
    const [created] = await db.insert(researchDatasets).values({ userId: collection.requestedByUserId, name: `\uACF5\uC6A9 \uB79C\uB364 \uC544\uB808\uB098 \xB7 ${universe.length}\uC885\uBAA9 \xB7 ${window.evaluationStartDate}~${window.endDate}`, source: "kiwoom_daily_five_minute", versionKey, visibility: "shared_public", randomSeed: collection.randomSeed, sourceFingerprint, universeJson: universe, startDate: window.startDate, endDate: window.endDate, barCount: 0, minuteBarCount: 0, adjustmentBasis: "adjusted", qualityStatus: "collecting", sourceCapturedAt: now, qualityReportJson: { state: "streaming", protocol: "chunked_v1", source: ["kiwoom_ka10081", "kiwoom_ka10080"], randomSeed: collection.randomSeed, sampleDays: collection.sampleDays, ...window, universe, expectedDailyBarCount, expectedFiveMinuteBarCount, collectionRequestId: collection.id, fixedIpSource: true } }).returning();
    await db.update(sharedDatasetCollectionRequests).set({ datasetId: created.id, plannedUniverseJson: universe, progressJson: { stage: "stream_upload_start", message: "\uB300\uC6A9\uB7C9 \uC6D0\uBCF8\uC744 \uC7AC\uAC1C \uAC00\uB2A5\uD55C \uCCAD\uD06C\uB85C \uBCF4\uAD00\uC18C\uC5D0 \uC801\uC7AC\uD569\uB2C8\uB2E4.", totalSymbols: universe.length, completedDailySymbols: universe.length, completedFiveMinuteSymbols: universe.length, updatedAt: now.toISOString() } }).where(eq35(sharedDatasetCollectionRequests.id, collection.id));
    return response.json({ status: "uploading", requestId: collection.id, datasetId: created.id, versionKey, sourceFingerprint });
  });
  app2.post("/api/local-research-node/shared-dataset-collection-stream-chunk", async (request, response) => {
    response.setHeader("Cache-Control", "no-store, private, max-age=0");
    if (!isLocalResearchNodeAuthorized(request)) return response.status(401).json({ status: "unauthorized" });
    const body = request.body;
    const requestId = Number(body?.requestId);
    const datasetId = Number(body?.datasetId);
    const kind = body?.kind === "daily" || body?.kind === "five_minute" ? body.kind : null;
    const submitted = Array.isArray(body?.bars) ? body.bars : [];
    if (!Number.isInteger(requestId) || requestId < 1 || !Number.isInteger(datasetId) || datasetId < 1 || !kind || !submitted.length || submitted.length > 800) return response.status(400).json({ status: "invalid_request", message: "requestId, datasetId, kind, \uCD5C\uB300 800\uAC1C bars \uBC30\uC5F4\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." });
    const db = await getDb();
    if (!db) return response.status(503).json({ status: "unavailable", message: "\uC5F0\uAD6C \uB370\uC774\uD130\uBCA0\uC774\uC2A4\uB97C \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    const collection = (await db.select().from(sharedDatasetCollectionRequests).where(and25(eq35(sharedDatasetCollectionRequests.id, requestId), eq35(sharedDatasetCollectionRequests.datasetId, datasetId), eq35(sharedDatasetCollectionRequests.status, "running"))).limit(1))[0];
    const dataset = (await db.select().from(researchDatasets).where(and25(eq35(researchDatasets.id, datasetId), eq35(researchDatasets.qualityStatus, "collecting"))).limit(1))[0];
    if (!collection || !dataset) return response.status(409).json({ status: "invalid_request_state", message: "\uC7AC\uAC1C \uAC00\uB2A5\uD55C \uB300\uC6A9\uB7C9 \uC6D0\uBCF8 \uC801\uC7AC \uC0C1\uD0DC\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    const report = dataset.qualityReportJson && typeof dataset.qualityReportJson === "object" ? dataset.qualityReportJson : {};
    const universe = normalizeSharedDatasetStreamUniverse(dataset.universeJson);
    const symbols = new Set(universe.map((item) => item.symbol));
    const window = normalizeSharedDatasetStreamWindow(report);
    if (!window) return response.status(409).json({ status: "invalid_dataset_state", message: "\uB300\uC6A9\uB7C9 \uC6D0\uBCF8\uC758 \uB0A0\uC9DC \uCC3D \uBA54\uD0C0\uB370\uC774\uD130\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    if (kind === "daily") {
      const bars = submitted.flatMap((raw) => {
        const item = raw;
        const symbol = typeof item.symbol === "string" ? item.symbol.trim() : "";
        const candidate = { date: typeof item.date === "string" ? item.date.trim() : "", open: Number(item.open), high: Number(item.high), low: Number(item.low), close: Number(item.close), volume: Number(item.volume), turnover: Number(item.turnover) };
        const bar = symbols.has(symbol) ? selectValidLocalDailyBars({ bars: [candidate] }).bars[0] : null;
        return bar && bar.date >= window.startDate && bar.date <= window.endDate ? [{ datasetId, symbol, date: bar.date, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: String(bar.volume), turnover: String(bar.turnover), source: "kiwoom_ka10081_local_shared_snapshot" }] : [];
      });
      if (bars.length !== submitted.length) return response.status(400).json({ status: "invalid_source_data", message: "\uC77C\uBD09 \uCCAD\uD06C\uC5D0 \uC720\uD6A8\uD558\uC9C0 \uC54A\uC740 \uC6D0\uBCF8\uC774 \uD3EC\uD568\uB418\uC5B4 \uC788\uC2B5\uB2C8\uB2E4." });
      await db.insert(researchDailyBars).values(bars).onConflictDoUpdate({
        target: [researchDailyBars.datasetId, researchDailyBars.symbol, researchDailyBars.date],
        set: { open: sql4`excluded.open`, high: sql4`excluded.high`, low: sql4`excluded.low`, close: sql4`excluded.close`, volume: sql4`excluded.volume`, turnover: sql4`excluded.turnover`, source: sql4`excluded.source` }
      });
    } else {
      const bars = submitted.flatMap((raw) => {
        const item = raw;
        const symbol = typeof item.symbol === "string" ? item.symbol.trim() : "";
        const intervalAt = typeof item.intervalAt === "string" ? new Date(item.intervalAt) : /* @__PURE__ */ new Date(NaN);
        const open = Number(item.open);
        const high = Number(item.high);
        const low = Number(item.low);
        const close = Number(item.close);
        const volume = Number(item.volume);
        const tradingDate2 = Number.isNaN(intervalAt.getTime()) ? "" : sharedDatasetDate(intervalAt);
        if (!symbols.has(symbol) || !/^\d{4}-\d{2}-\d{2}$/.test(tradingDate2) || tradingDate2 < window.evaluationStartDate || tradingDate2 > window.endDate || ![open, high, low, close, volume].every(Number.isSafeInteger) || open < 1 || high < 1 || low < 1 || close < 1 || volume < 0 || low > Math.min(open, close) || high < Math.max(open, close)) return [];
        const rawFingerprint = createHash7("sha256").update(JSON.stringify({ symbol, tradingDate: tradingDate2, intervalAt: intervalAt.toISOString(), open, high, low, close, volume })).digest("hex");
        return [{ datasetId, symbol, tradingDate: tradingDate2, intervalAt, open, high, low, close, volume: String(volume), source: "kiwoom_ka10080_local_shared_snapshot", rawFingerprint }];
      });
      if (bars.length !== submitted.length) return response.status(400).json({ status: "invalid_source_data", message: "5\uBD84\uBD09 \uCCAD\uD06C\uC5D0 \uC720\uD6A8\uD558\uC9C0 \uC54A\uC740 \uC6D0\uBCF8\uC774 \uD3EC\uD568\uB418\uC5B4 \uC788\uC2B5\uB2C8\uB2E4." });
      await db.insert(researchFiveMinuteBars).values(bars).onConflictDoUpdate({
        target: [researchFiveMinuteBars.datasetId, researchFiveMinuteBars.symbol, researchFiveMinuteBars.tradingDate, researchFiveMinuteBars.intervalAt],
        set: { open: sql4`excluded.open`, high: sql4`excluded.high`, low: sql4`excluded.low`, close: sql4`excluded.close`, volume: sql4`excluded.volume`, source: sql4`excluded.source`, rawFingerprint: sql4`excluded.rawFingerprint` }
      });
    }
    return response.json({ status: "chunk_recorded", requestId, datasetId, kind, acceptedBarCount: submitted.length });
  });
  app2.post("/api/local-research-node/shared-dataset-collection-stream-finalize", async (request, response) => {
    response.setHeader("Cache-Control", "no-store, private, max-age=0");
    if (!isLocalResearchNodeAuthorized(request)) return response.status(401).json({ status: "unauthorized" });
    const body = request.body;
    const requestId = Number(body?.requestId);
    const datasetId = Number(body?.datasetId);
    if (!Number.isInteger(requestId) || requestId < 1 || !Number.isInteger(datasetId) || datasetId < 1) return response.status(400).json({ status: "invalid_request", message: "requestId\uC640 datasetId\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4." });
    const db = await getDb();
    if (!db) return response.status(503).json({ status: "unavailable", message: "\uC5F0\uAD6C \uB370\uC774\uD130\uBCA0\uC774\uC2A4\uB97C \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    const collection = (await db.select().from(sharedDatasetCollectionRequests).where(and25(eq35(sharedDatasetCollectionRequests.id, requestId), eq35(sharedDatasetCollectionRequests.datasetId, datasetId), eq35(sharedDatasetCollectionRequests.status, "running"))).limit(1))[0];
    const dataset = (await db.select().from(researchDatasets).where(and25(eq35(researchDatasets.id, datasetId), eq35(researchDatasets.qualityStatus, "collecting"))).limit(1))[0];
    if (!collection || !dataset) return response.status(409).json({ status: "invalid_request_state", message: "\uC644\uB8CC\uD560 \uB300\uC6A9\uB7C9 \uC6D0\uBCF8 \uC801\uC7AC \uC0C1\uD0DC\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    const report = dataset.qualityReportJson && typeof dataset.qualityReportJson === "object" ? dataset.qualityReportJson : {};
    const expectedDailyBarCount = Number(report.expectedDailyBarCount);
    const expectedFiveMinuteBarCount = Number(report.expectedFiveMinuteBarCount);
    const [daily] = await db.select({ total: count2() }).from(researchDailyBars).where(eq35(researchDailyBars.datasetId, datasetId));
    const [minute] = await db.select({ total: count2() }).from(researchFiveMinuteBars).where(eq35(researchFiveMinuteBars.datasetId, datasetId));
    const dailyBarCount = Number(daily?.total ?? 0);
    const fiveMinuteBarCount = Number(minute?.total ?? 0);
    if (dailyBarCount !== expectedDailyBarCount || fiveMinuteBarCount !== expectedFiveMinuteBarCount) return response.status(409).json({ status: "incomplete_upload", message: "\uB300\uC6A9\uB7C9 \uC6D0\uBCF8 \uCCAD\uD06C\uAC00 \uBAA8\uB450 \uC800\uC7A5\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4. \uAC19\uC740 \uC694\uCCAD\uC744 \uC7AC\uAC1C\uD558\uC138\uC694.", dailyBarCount, fiveMinuteBarCount, expectedDailyBarCount, expectedFiveMinuteBarCount });
    const now = /* @__PURE__ */ new Date();
    await db.update(researchDatasets).set({ barCount: dailyBarCount, minuteBarCount: fiveMinuteBarCount, qualityStatus: "ready", readyAt: now, qualityReportJson: { ...report, state: "ready", dailyBarCount, fiveMinuteBarCount, immutable: true, completedAt: now.toISOString() } }).where(eq35(researchDatasets.id, datasetId));
    await db.update(sharedDatasetCollectionRequests).set({ status: "completed", acceptedDailyBarCount: dailyBarCount, acceptedFiveMinuteBarCount: fiveMinuteBarCount, progressJson: { stage: "completed", message: "\uB300\uC6A9\uB7C9 \uC77C\uBD09\xB75\uBD84\uBD09 \uC6D0\uBCF8\uC744 \uCCAD\uD06C \uAC80\uC99D \uD6C4 \uACF5\uC6A9 \uBCF4\uAD00\uC18C\uC5D0 \uACE0\uC815\uD588\uC2B5\uB2C8\uB2E4.", totalSymbols: collection.symbolCount, completedDailySymbols: collection.symbolCount, completedFiveMinuteSymbols: collection.symbolCount, updatedAt: now.toISOString() }, completedAt: now }).where(eq35(sharedDatasetCollectionRequests.id, requestId));
    return response.json({ status: "ready", requestId, datasetId, versionKey: dataset.versionKey, sourceFingerprint: dataset.sourceFingerprint, acceptedDailyBarCount: dailyBarCount, acceptedFiveMinuteBarCount: fiveMinuteBarCount });
  });
  app2.post("/api/local-research-node/shared-dataset-collection-progress", async (request, response) => {
    response.setHeader("Cache-Control", "no-store, private, max-age=0");
    if (!isLocalResearchNodeAuthorized(request)) return response.status(401).json({ status: "unauthorized" });
    const body = request.body;
    const requestId = Number(body?.requestId);
    if (!Number.isInteger(requestId) || requestId < 1) return response.status(400).json({ status: "invalid_request", message: "\uC720\uD6A8\uD55C requestId\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4." });
    const db = await getDb();
    if (!db) return response.status(503).json({ status: "unavailable", message: "\uC5F0\uAD6C \uB370\uC774\uD130\uBCA0\uC774\uC2A4\uB97C \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    const stage = typeof body?.stage === "string" ? body.stage.slice(0, 48) : "collecting";
    const message = typeof body?.message === "string" ? body.message.slice(0, 500) : "\uD0A4\uC6C0 \uC6D0\uBCF8\uC744 \uC77D\uACE0 \uC788\uC2B5\uB2C8\uB2E4.";
    const totalSymbols = Number.isInteger(body?.totalSymbols) ? Math.max(0, Math.min(20, Number(body.totalSymbols))) : 0;
    const completedDailySymbols = Number.isInteger(body?.completedDailySymbols) ? Math.max(0, Math.min(totalSymbols || 20, Number(body.completedDailySymbols))) : 0;
    const completedFiveMinuteSymbols = Number.isInteger(body?.completedFiveMinuteSymbols) ? Math.max(0, Math.min(totalSymbols || 20, Number(body.completedFiveMinuteSymbols))) : 0;
    await db.update(sharedDatasetCollectionRequests).set({ progressJson: { stage, message, totalSymbols, completedDailySymbols, completedFiveMinuteSymbols, updatedAt: (/* @__PURE__ */ new Date()).toISOString() } }).where(and25(eq35(sharedDatasetCollectionRequests.id, requestId), eq35(sharedDatasetCollectionRequests.status, "running")));
    return response.json({ status: "progress_recorded" });
  });
  app2.post("/api/local-research-node/shared-dataset-collection-status", async (request, response) => {
    response.setHeader("Cache-Control", "no-store, private, max-age=0");
    if (!isLocalResearchNodeAuthorized(request)) return response.status(401).json({ status: "unauthorized" });
    const body = request.body;
    const requestId = Number(body?.requestId);
    const message = typeof body?.message === "string" ? body.message.slice(0, 500) : "\uACE0\uC815 IP \uC6D0\uBCF8 \uC218\uC9D1\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.";
    if (!Number.isInteger(requestId) || requestId < 1) return response.status(400).json({ status: "invalid_request", message: "\uC720\uD6A8\uD55C requestId\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4." });
    const db = await getDb();
    if (!db) return response.status(503).json({ status: "unavailable", message: "\uC5F0\uAD6C \uB370\uC774\uD130\uBCA0\uC774\uC2A4\uB97C \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    await db.update(sharedDatasetCollectionRequests).set({ status: "failed", lastError: message, progressJson: { stage: "failed", message, updatedAt: (/* @__PURE__ */ new Date()).toISOString() }, completedAt: /* @__PURE__ */ new Date() }).where(and25(eq35(sharedDatasetCollectionRequests.id, requestId), eq35(sharedDatasetCollectionRequests.status, "running")));
    return response.json({ status: "recorded" });
  });
  app2.get("/api/local-research-node/intraday-minute-backfill-plan", async (request, response) => {
    response.setHeader("Cache-Control", "no-store, private, max-age=0");
    if (!isLocalResearchNodeAuthorized(request)) return response.status(401).json({ status: "unauthorized" });
    const db = await getDb();
    if (!db) return response.status(503).json({ status: "unavailable", message: "\uC5F0\uAD6C \uB370\uC774\uD130\uBCA0\uC774\uC2A4\uB97C \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    const rawYear = Number(request.query.year);
    const currentYear = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric" }).format(/* @__PURE__ */ new Date()));
    const year = Number.isInteger(rawYear) && rawYear >= 2020 && rawYear <= currentYear ? rawYear : currentYear;
    const rawMaxSymbols = Number(request.query.maxSymbols);
    const maxSymbols = Number.isInteger(rawMaxSymbols) ? Math.max(1, Math.min(120, rawMaxSymbols)) : 60;
    const rawThreshold = Number(request.query.minAverageTurnoverWon);
    const minAverageTurnoverWon = Number.isSafeInteger(rawThreshold) && rawThreshold >= 0 ? rawThreshold : 1e10;
    const dailyBars = await db.select({ symbol: localResearchDailyBars.symbol, date: localResearchDailyBars.date, turnover: localResearchDailyBars.turnover }).from(localResearchDailyBars).where(eq35(localResearchDailyBars.adjustmentBasis, "adjusted")).orderBy(desc28(localResearchDailyBars.date)).limit(2e4);
    const runs = await db.select({ universeJson: autonomousResearchRuns.universeJson }).from(autonomousResearchRuns).where(eq35(autonomousResearchRuns.dataStatus, "ready")).orderBy(desc28(autonomousResearchRuns.updatedAt)).limit(40);
    const symbols = selectLiquidMinuteBackfillUniverse({ bars: dailyBars, knownNames: selectLocalDailyCollectionUniverse(runs, 120), thresholdWon: minAverageTurnoverWon, maxSymbols });
    if (!symbols.length) return response.status(409).json({ status: "waiting_for_liquid_universe", message: "\uCD5C\uADFC 30\uAC70\uB798\uC77C \uD3C9\uADE0 \uAC70\uB798\uB300\uAE08 \uAE30\uC900\uC744 \uCDA9\uC871\uD558\uB294 \uC2E4\uC81C \uC77C\uBD09 \uC720\uB2C8\uBC84\uC2A4\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.", minAverageTurnoverWon });
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(/* @__PURE__ */ new Date());
    const endDate = year === currentYear ? today : `${year}-12-31`;
    return response.json({ status: "ready", mode: "historical_multi_symbol_minute_backfill", year, startDate: `${year}-01-01`, endDate, source: "local_ka10081_recent_30_trading_days", minAverageTurnoverWon, universeCount: symbols.length, symbols, storage: { rawFormat: "gzip_json", retention: "local_research_node", serverFormat: "intraday_minute_bars", resume: "per_symbol" } });
  });
  app2.get("/api/local-research-node/intraday-minute-collection-plan", async (request, response) => {
    response.setHeader("Cache-Control", "no-store, private, max-age=0");
    if (!isLocalResearchNodeAuthorized(request)) return response.status(401).json({ status: "unauthorized" });
    const db = await getDb();
    if (!db) return response.status(503).json({ status: "unavailable", message: "\uC5F0\uAD6C \uB370\uC774\uD130\uBCA0\uC774\uC2A4\uB97C \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    const tradingDate2 = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(/* @__PURE__ */ new Date());
    const experiment = await ensureLocalIntradayExperiment(db, tradingDate2);
    if (!experiment && shouldCloseIntradayExperiment({ tradingDate: tradingDate2, capturedAt: /* @__PURE__ */ new Date() })) {
      return response.status(409).json({ status: "market_closed", message: "\uC7A5 \uB9C8\uAC10\uC73C\uB85C \uB2F9\uC77C \uBAA8\uC758 \uC2E4\uD5D8\uC774 \uC885\uB8CC\uB418\uC5B4 \uCD94\uAC00 1\uBD84\uBD09 \uC218\uC9D1\uC744 \uACC4\uD68D\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.", experimentId: null, tradingDate: tradingDate2 });
    }
    const positions = experiment?.status === "tracking" ? await db.select({ symbol: dayTradeExperimentPositions.symbol, name: dayTradeExperimentPositions.name }).from(dayTradeExperimentPositions).where(eq35(dayTradeExperimentPositions.experimentId, experiment.id)) : [];
    const runs = await db.select({ universeJson: autonomousResearchRuns.universeJson }).from(autonomousResearchRuns).where(eq35(autonomousResearchRuns.dataStatus, "ready")).orderBy(desc28(autonomousResearchRuns.updatedAt)).limit(40);
    const knownNames = selectLocalDailyCollectionUniverse(runs, 120);
    const recentDailyBars = await db.select({ symbol: localResearchDailyBars.symbol, date: localResearchDailyBars.date, turnover: localResearchDailyBars.turnover }).from(localResearchDailyBars).where(eq35(localResearchDailyBars.adjustmentBasis, "adjusted")).orderBy(desc28(localResearchDailyBars.date)).limit(2e4);
    const bootstrapQuotes = selectLiquidMinuteBackfillUniverse({ bars: recentDailyBars, knownNames, thresholdWon: 1e10, maxSymbols: 60 }).map((item) => ({ symbol: item.symbol, name: item.name }));
    const quotes = positions.length ? positions : bootstrapQuotes;
    const [requestRow] = await db.select().from(localMinuteCollectionRequests).where(and25(eq35(localMinuteCollectionRequests.tradingDate, tradingDate2), eq35(localMinuteCollectionRequests.status, "queued"))).orderBy(desc28(localMinuteCollectionRequests.requestedAt)).limit(1);
    if (requestRow) await db.update(localMinuteCollectionRequests).set({ status: "running", startedAt: /* @__PURE__ */ new Date(), lastSeenAt: /* @__PURE__ */ new Date() }).where(eq35(localMinuteCollectionRequests.id, requestRow.id));
    const plan = buildIntradayMinuteCollectionPlan({
      tradingDate: tradingDate2,
      experiment: experiment ? { id: experiment.id, tradingDate: experiment.tradingDate, status: experiment.status === "closed" ? "closed" : "tracking" } : null,
      quotes,
      request: requestRow ? { id: requestRow.id, requestedAt: requestRow.requestedAt } : null
    });
    return response.status(plan.status === "ready" ? 200 : 409).json(plan);
  });
  app2.post("/api/local-research-node/intraday-minute-sync", async (request, response) => {
    response.setHeader("Cache-Control", "no-store, private, max-age=0");
    if (!isLocalResearchNodeAuthorized(request)) return response.status(401).json({ status: "unauthorized" });
    const body = request.body;
    const tradingDate2 = typeof body?.tradingDate === "string" ? body.tradingDate : "";
    const capturedAt = typeof body?.capturedAt === "string" ? new Date(body.capturedAt) : /* @__PURE__ */ new Date(NaN);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tradingDate2) || Number.isNaN(capturedAt.getTime()) || !Array.isArray(body?.bars)) return response.status(400).json({ status: "invalid_request", message: "tradingDate, capturedAt, bars \uBC30\uC5F4\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." });
    const submitted = [];
    for (const raw of body.bars) {
      const item = raw;
      const minuteAt = typeof item.minuteAt === "string" ? new Date(item.minuteAt) : /* @__PURE__ */ new Date(NaN);
      submitted.push({ symbol: typeof item.symbol === "string" ? item.symbol.trim() : "", minuteAt, open: Number(item.open), high: Number(item.high), low: Number(item.low), close: Number(item.close), volume: Number(item.volume) });
    }
    const selected = selectClosedIntradayMinuteBars({ bars: submitted, tradingDate: tradingDate2, capturedAt });
    if (!selected.bars.length) return response.status(400).json({ status: "invalid_request", message: "\uC644\uACB0\uB41C \uC720\uD6A8 1\uBD84\uBD09\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.", rejectedBarCount: selected.rejected, diagnostics: { submittedBarCount: submitted.length, rejectedReasons: selected.rejectedReasons, tradingDate: tradingDate2, capturedAt: capturedAt.toISOString() } });
    const db = await getDb();
    if (!db) return response.status(503).json({ status: "unavailable", message: "\uC5F0\uAD6C \uB370\uC774\uD130\uBCA0\uC774\uC2A4\uB97C \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    const values = selected.bars.map((bar) => ({ tradingDate: tradingDate2, symbol: bar.symbol, minuteAt: bar.minuteAt, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: String(Math.trunc(bar.volume)), source: "kiwoom_ka10080", rawFingerprint: minuteBarFingerprint(bar), capturedAt }));
    await db.insert(intradayMinuteBars).values(values).onConflictDoUpdate({
      target: [intradayMinuteBars.tradingDate, intradayMinuteBars.symbol, intradayMinuteBars.minuteAt],
      set: { open: sql4`excluded.open`, high: sql4`excluded.high`, low: sql4`excluded.low`, close: sql4`excluded.close`, volume: sql4`excluded.volume`, rawFingerprint: sql4`excluded.rawFingerprint`, capturedAt: sql4`excluded.capturedAt` }
    });
    const ensuredExperiment = await ensureLocalIntradayExperiment(db, tradingDate2);
    const closedExperiment = await closeLocalIntradayExperimentAtMarketClose(db, { tradingDate: tradingDate2, capturedAt });
    const experiment = closedExperiment ?? ensuredExperiment;
    return response.json({ status: "synced", tradingDate: tradingDate2, acceptedBarCount: values.length, rejectedBarCount: selected.rejected, capturedAt: capturedAt.toISOString(), experimentId: experiment?.id ?? null, experimentStatus: experiment?.status ?? "waiting_for_historical_signals" });
  });
  app2.post("/api/local-research-node/intraday-minute-backfill-sync", async (request, response) => {
    response.setHeader("Cache-Control", "no-store, private, max-age=0");
    if (!isLocalResearchNodeAuthorized(request)) return response.status(401).json({ status: "unauthorized" });
    const body = request.body;
    const year = Number(body?.year);
    const capturedAt = typeof body?.capturedAt === "string" ? new Date(body.capturedAt) : /* @__PURE__ */ new Date(NaN);
    const currentYear = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric" }).format(/* @__PURE__ */ new Date()));
    if (!Number.isInteger(year) || year < 2020 || year > currentYear || Number.isNaN(capturedAt.getTime()) || !Array.isArray(body?.bars) || body.bars.length < 1 || body.bars.length > 1e4) return response.status(400).json({ status: "invalid_request", message: "\uC720\uD6A8\uD55C year, capturedAt, \uCD5C\uB300 10,000\uAC1C bars \uBC30\uC5F4\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." });
    const submitted = [];
    for (const raw of body.bars) {
      const item = raw;
      const minuteAt = typeof item.minuteAt === "string" ? new Date(item.minuteAt) : /* @__PURE__ */ new Date(NaN);
      submitted.push({ symbol: typeof item.symbol === "string" ? item.symbol.trim() : "", minuteAt, open: Number(item.open), high: Number(item.high), low: Number(item.low), close: Number(item.close), volume: Number(item.volume) });
    }
    const byTradingDate = /* @__PURE__ */ new Map();
    for (const bar of submitted) {
      const tradingDate2 = Number.isNaN(bar.minuteAt.getTime()) ? "invalid" : koreanTradingDate(bar.minuteAt);
      if (!tradingDate2.startsWith(`${year}-`)) continue;
      const items = byTradingDate.get(tradingDate2) ?? [];
      items.push(bar);
      byTradingDate.set(tradingDate2, items);
    }
    const selectedBars = [];
    let rejectedBarCount = submitted.length - Array.from(byTradingDate.values()).reduce((total, bars) => total + bars.length, 0);
    for (const [tradingDate2, bars] of Array.from(byTradingDate.entries())) {
      const selected = selectClosedIntradayMinuteBars({ bars, tradingDate: tradingDate2, capturedAt });
      rejectedBarCount += selected.rejected;
      selectedBars.push(...selected.bars.map((bar) => ({ ...bar, tradingDate: tradingDate2 })));
    }
    if (!selectedBars.length) return response.status(400).json({ status: "invalid_request", message: "\uC720\uD6A8\uD55C \uACFC\uAC70 \uC644\uACB0 1\uBD84\uBD09\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.", rejectedBarCount });
    const db = await getDb();
    if (!db) return response.status(503).json({ status: "unavailable", message: "\uC5F0\uAD6C \uB370\uC774\uD130\uBCA0\uC774\uC2A4\uB97C \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    for (let offset = 0; offset < selectedBars.length; offset += 1e3) {
      const values = selectedBars.slice(offset, offset + 1e3).map((bar) => ({ tradingDate: bar.tradingDate, symbol: bar.symbol, minuteAt: bar.minuteAt, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: String(Math.trunc(bar.volume)), source: "kiwoom_ka10080", rawFingerprint: minuteBarFingerprint(bar), capturedAt }));
      await db.insert(intradayMinuteBars).values(values).onConflictDoUpdate({
        target: [intradayMinuteBars.tradingDate, intradayMinuteBars.symbol, intradayMinuteBars.minuteAt],
        set: { open: sql4`excluded.open`, high: sql4`excluded.high`, low: sql4`excluded.low`, close: sql4`excluded.close`, volume: sql4`excluded.volume`, rawFingerprint: sql4`excluded.rawFingerprint`, capturedAt: sql4`excluded.capturedAt` }
      });
    }
    return response.json({ status: "synced", year, acceptedBarCount: selectedBars.length, rejectedBarCount, tradingDateCount: byTradingDate.size, capturedAt: capturedAt.toISOString() });
  });
  app2.post("/api/local-research-node/daily-bar-sync", async (request, response) => {
    response.setHeader("Cache-Control", "no-store, private, max-age=0");
    if (!isLocalResearchNodeAuthorized(request)) return response.status(401).json({ status: "unauthorized" });
    const body = request.body;
    const symbol = typeof body?.symbol === "string" ? body.symbol.trim() : "";
    const adjustmentBasis = body?.adjustmentBasis === "adjusted" || body?.adjustmentBasis === "unadjusted" ? body.adjustmentBasis : null;
    if (!/^\d{6}$/.test(symbol) || !adjustmentBasis || !Array.isArray(body?.bars)) return response.status(400).json({ status: "invalid_request", message: "6\uC790\uB9AC symbol, adjustmentBasis, bars \uBC30\uC5F4\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." });
    const submitted = body.bars.map((raw) => {
      const item = raw;
      return {
        date: typeof item.date === "string" ? item.date.trim() : "",
        open: Number(item.open),
        high: Number(item.high),
        low: Number(item.low),
        close: Number(item.close),
        volume: Number(item.volume),
        turnover: Number(item.turnover)
      };
    });
    const selected = selectValidLocalDailyBars({ bars: submitted });
    if (!selected.bars.length) return response.status(400).json({ status: "invalid_request", message: "\uC720\uD6A8\uD55C \uC2E4\uC81C \uC77C\uBD09\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.", submittedBarCount: submitted.length, rejectedBarCount: selected.rejected });
    const db = await getDb();
    if (!db) return response.status(503).json({ status: "unavailable", message: "\uC5F0\uAD6C \uB370\uC774\uD130\uBCA0\uC774\uC2A4\uB97C \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    const capturedAt = /* @__PURE__ */ new Date();
    const values = selected.bars.map((bar) => ({
      symbol,
      date: bar.date,
      adjustmentBasis,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: String(bar.volume),
      turnover: String(bar.turnover),
      source: "kiwoom_ka10081",
      rawFingerprint: dailyBarFingerprint({ symbol, adjustmentBasis, bar }),
      capturedAt
    }));
    await db.insert(localResearchDailyBars).values(values).onConflictDoUpdate({
      target: [localResearchDailyBars.symbol, localResearchDailyBars.date, localResearchDailyBars.adjustmentBasis],
      set: {
        open: sql4`excluded.open`,
        high: sql4`excluded.high`,
        low: sql4`excluded.low`,
        close: sql4`excluded.close`,
        volume: sql4`excluded.volume`,
        turnover: sql4`excluded.turnover`,
        rawFingerprint: sql4`excluded.rawFingerprint`,
        capturedAt: sql4`excluded.capturedAt`
      }
    });
    return response.json({ status: "synced", symbol, adjustmentBasis, acceptedBarCount: values.length, rejectedBarCount: selected.rejected, deduplicatedBarCount: selected.deduplicated, capturedAt: capturedAt.toISOString() });
  });
  app2.post("/api/local-research-node/daily-dataset-promote", async (request, response) => {
    response.setHeader("Cache-Control", "no-store, private, max-age=0");
    if (!isLocalResearchNodeAuthorized(request)) return response.status(401).json({ status: "unauthorized" });
    const body = request.body;
    const requestedSymbols = Array.from(new Set([
      ...typeof body?.symbol === "string" ? [body.symbol] : [],
      ...Array.isArray(body?.symbols) ? body.symbols.filter((item) => typeof item === "string") : []
    ].map((symbol) => symbol.trim()).filter((symbol) => /^\d{6}$/.test(symbol)))).sort();
    const adjustmentBasis = body?.adjustmentBasis === "adjusted" || body?.adjustmentBasis === "unadjusted" ? body.adjustmentBasis : null;
    if (!requestedSymbols.length || !adjustmentBasis) return response.status(400).json({ status: "invalid_request", message: "6\uC790\uB9AC symbol \uB610\uB294 symbols \uBC30\uC5F4\uACFC adjustmentBasis\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4." });
    const db = await getDb();
    if (!db) return response.status(503).json({ status: "unavailable", message: "\uC5F0\uAD6C \uB370\uC774\uD130\uBCA0\uC774\uC2A4\uB97C \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    const bars = await db.select().from(localResearchDailyBars).where(and25(inArray9(localResearchDailyBars.symbol, requestedSymbols), eq35(localResearchDailyBars.adjustmentBasis, adjustmentBasis))).orderBy(asc8(localResearchDailyBars.symbol), asc8(localResearchDailyBars.date));
    const barCountBySymbol = /* @__PURE__ */ new Map();
    for (const bar of bars) barCountBySymbol.set(bar.symbol, (barCountBySymbol.get(bar.symbol) ?? 0) + 1);
    const insufficientSymbols = requestedSymbols.filter((symbol) => (barCountBySymbol.get(symbol) ?? 0) < 85);
    if (insufficientSymbols.length) return response.status(409).json({ status: "insufficient_source_data", message: "\uBD88\uBCC0 \uB370\uC774\uD130\uC14B\uC5D0\uB294 \uC885\uBAA9\uBCC4 \uCD5C\uC18C 85\uAC1C\uC758 \uC2E4\uC81C \uC77C\uBD09\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.", insufficientSymbols, acceptedBarCountBySymbol: Object.fromEntries(barCountBySymbol) });
    const owner = (await db.select().from(users).where(eq35(users.role, "admin")).orderBy(asc8(users.id)).limit(1))[0];
    if (!owner) return response.status(409).json({ status: "owner_missing", message: "\uB9AC\uC11C\uCE58 \uB370\uC774\uD130\uC14B \uC18C\uC720 \uC6B4\uC601\uC790\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    const version = requestedSymbols.length === 1 ? buildLocalDailyDatasetVersion({ symbol: requestedSymbols[0], adjustmentBasis, bars }) : buildLocalDailyUniverseDatasetVersion({ symbols: requestedSymbols, adjustmentBasis, bars });
    const existing = (await db.select().from(researchDatasets).where(and25(eq35(researchDatasets.userId, owner.id), eq35(researchDatasets.versionKey, version.versionKey))).limit(1))[0];
    if (existing?.qualityStatus === "ready") return response.json({ status: "ready", datasetId: existing.id, versionKey: existing.versionKey, barCount: existing.barCount, sourceFingerprint: version.sourceFingerprint, reused: true });
    const now = /* @__PURE__ */ new Date();
    const dates = bars.map((bar) => bar.date).sort();
    let datasetId = existing?.id;
    if (datasetId) {
      await db.update(researchDatasets).set({ qualityStatus: "collecting", qualityReportJson: { state: "collecting", source: "local_research_daily_bars", rawSource: "kiwoom_ka10081", sourceFingerprint: version.sourceFingerprint, immutable: true, symbols: requestedSymbols, symbolCount: requestedSymbols.length } }).where(eq35(researchDatasets.id, datasetId));
    } else {
      const [created] = await db.insert(researchDatasets).values({
        userId: owner.id,
        name: `\uB85C\uCEEC \uD0A4\uC6C0 \uC2E4\uC81C \uC77C\uBD09 ${requestedSymbols.length}\uC885\uBAA9 ${dates[0]}~${dates.at(-1)}`,
        source: "kiwoom_daily",
        versionKey: version.versionKey,
        universeJson: requestedSymbols.map((symbol) => ({ symbol, name: symbol })),
        startDate: dates[0],
        endDate: dates.at(-1),
        barCount: bars.length,
        adjustmentBasis,
        qualityStatus: "collecting",
        qualityReportJson: { state: "collecting", source: "local_research_daily_bars", rawSource: "kiwoom_ka10081", sourceFingerprint: version.sourceFingerprint, immutable: true, symbols: requestedSymbols, symbolCount: requestedSymbols.length },
        sourceCapturedAt: now
      }).returning();
      datasetId = created.id;
    }
    try {
      const snapshotRows = bars.map((bar) => ({ datasetId, symbol: bar.symbol, date: bar.date, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: String(bar.volume), turnover: String(bar.turnover), source: "kiwoom_ka10081_local_snapshot", capturedAt: now }));
      for (let offset = 0; offset < snapshotRows.length; offset += 100) {
        await db.insert(researchDailyBars).values(snapshotRows.slice(offset, offset + 100)).onConflictDoUpdate({
          target: [researchDailyBars.datasetId, researchDailyBars.symbol, researchDailyBars.date],
          set: { capturedAt: now }
        });
      }
      await db.update(researchDatasets).set({ qualityStatus: "ready", readyAt: now, qualityReportJson: { state: "ready", source: "local_research_daily_bars", rawSource: "kiwoom_ka10081", sourceFingerprint: version.sourceFingerprint, immutable: true, symbols: requestedSymbols, symbolCount: requestedSymbols.length, adjustmentBasis, barCount: bars.length, startDate: dates[0], endDate: dates.at(-1), barCountBySymbol: Object.fromEntries(barCountBySymbol) } }).where(eq35(researchDatasets.id, datasetId));
      return response.json({ status: "ready", datasetId, versionKey: version.versionKey, barCount: bars.length, symbolCount: requestedSymbols.length, sourceFingerprint: version.sourceFingerprint, reused: false });
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : "\uC6D0\uBCF8 \uC2A4\uB0C5\uC0F7 \uC800\uC7A5\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.";
      await db.update(researchDatasets).set({ qualityStatus: "error", qualityReportJson: { state: "error", source: "local_research_daily_bars", sourceFingerprint: version.sourceFingerprint, error: message } }).where(eq35(researchDatasets.id, datasetId));
      return response.status(500).json({ status: "snapshot_failed", message });
    }
  });
  app2.post("/api/local-research-node/daily-dataset-research", async (request, response) => {
    response.setHeader("Cache-Control", "no-store, private, max-age=0");
    if (!isLocalResearchNodeAuthorized(request)) return response.status(401).json({ status: "unauthorized" });
    const datasetId = Number(request.body?.datasetId);
    if (!Number.isInteger(datasetId) || datasetId < 1) return response.status(400).json({ status: "invalid_request", message: "\uC720\uD6A8\uD55C datasetId\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4." });
    const result = await publicHistoricalBacktest.runLocalSnapshot(datasetId);
    return response.status(result.status === "waiting" ? 409 : 200).json({ ...result, datasetId, source: "kiwoom_ka10081_local_snapshot" });
  });
  app2.post("/api/local-research-node/intraday-minute-collection-status", async (request, response) => {
    response.setHeader("Cache-Control", "no-store, private, max-age=0");
    if (!isLocalResearchNodeAuthorized(request)) return response.status(401).json({ status: "unauthorized" });
    const body = request.body;
    const requestId = Number(body?.requestId);
    const status = body?.status === "completed" ? "completed" : body?.status === "failed" ? "failed" : null;
    const acceptedBarCount = Math.max(0, Math.floor(Number(body?.acceptedBarCount ?? 0)));
    const rejectedBarCount = Math.max(0, Math.floor(Number(body?.rejectedBarCount ?? 0)));
    const message = typeof body?.message === "string" ? body.message.trim().slice(0, 500) : null;
    if (!Number.isInteger(requestId) || requestId < 1 || !status || !Number.isFinite(acceptedBarCount) || !Number.isFinite(rejectedBarCount)) return response.status(400).json({ status: "invalid_request", message: "\uC694\uCCAD ID\uC640 \uC644\uB8CC\xB7\uC2E4\uD328 \uC0C1\uD0DC\uAC00 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4." });
    const db = await getDb();
    if (!db) return response.status(503).json({ status: "unavailable", message: "\uC5F0\uAD6C \uB370\uC774\uD130\uBCA0\uC774\uC2A4\uB97C \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    await db.update(localMinuteCollectionRequests).set({ status, acceptedBarCount, rejectedBarCount, lastError: status === "failed" ? message ?? "1\uBD84\uBD09 \uC218\uC9D1 \uC2E4\uD328" : null, completedAt: /* @__PURE__ */ new Date(), lastSeenAt: /* @__PURE__ */ new Date() }).where(eq35(localMinuteCollectionRequests.id, requestId));
    return response.json({ status: "recorded" });
  });
  app2.post("/api/local-research-node/intraday-price-sync", async (request, response) => {
    response.setHeader("Cache-Control", "no-store, private, max-age=0");
    if (!isLocalResearchNodeAuthorized(request)) return response.status(401).json({ status: "unauthorized" });
    const body = request.body;
    if (!body || typeof body.tradingDate !== "string" || !Array.isArray(body.quotes)) return response.status(400).json({ status: "invalid_request", message: "tradingDate\uC640 quotes \uBC30\uC5F4\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." });
    const parsedQuotes = [];
    let rejected = 0;
    for (const raw of body.quotes) {
      const item = raw;
      const symbol = typeof item.symbol === "string" ? item.symbol.trim() : "";
      const price = Number(item.price);
      const observedAt = typeof item.observedAt === "string" ? new Date(item.observedAt) : /* @__PURE__ */ new Date(NaN);
      if (!symbol || symbol.length > 24 || !Number.isInteger(price) || price < 1 || Number.isNaN(observedAt.getTime())) {
        rejected += 1;
        continue;
      }
      parsedQuotes.push({ symbol, price, observedAt });
    }
    if (!parsedQuotes.length) return response.status(400).json({ status: "invalid_request", message: "\uC720\uD6A8\uD55C \uC2E4\uC81C \uC2DC\uC138\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.", rejected });
    const db = await getDb();
    if (!db) return response.status(503).json({ status: "unavailable", message: "\uC5F0\uAD6C \uB370\uC774\uD130\uBCA0\uC774\uC2A4\uB97C \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    const [experiment] = await db.select().from(dayTradeExperiments).where(and25(eq35(dayTradeExperiments.status, "tracking"), eq35(dayTradeExperiments.tradingDate, body.tradingDate))).orderBy(desc28(dayTradeExperiments.updatedAt)).limit(1);
    if (!experiment) return response.status(409).json({ status: "waiting_for_data", message: "\uD574\uB2F9 \uAC70\uB798\uC77C\uC758 \uCD94\uC801 \uC911\uC778 \uC7A5\uC911 \uBAA8\uC758\uD22C\uC790 \uAE30\uB85D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." });
    const positions = await db.select().from(dayTradeExperimentPositions).where(eq35(dayTradeExperimentPositions.experimentId, experiment.id));
    const { latestBySymbol, ignored } = selectFreshIntradayQuotes({ quotes: parsedQuotes, lastObservedAtBySymbol: new Map(positions.map((position) => [position.symbol, position.lastObservedAt])) });
    if (!latestBySymbol.size) {
      await db.insert(localResearchNodeSyncEvents).values({ experimentId: experiment.id, tradingDate: experiment.tradingDate, status: "partial", quoteCount: 0, rejectedQuoteCount: rejected + ignored, message: "\uC800\uC7A5\uB41C \uC2E4\uC81C \uC2DC\uC138\uBCF4\uB2E4 \uC0C8\uB85C\uC6B4 \uAC12\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." });
      return response.json({ status: "synced", experimentId: experiment.id, acceptedQuoteCount: 0, rejectedQuoteCount: rejected + ignored, message: "\uC800\uC7A5\uB41C \uC2E4\uC81C \uC2DC\uC138\uBCF4\uB2E4 \uC0C8\uB85C\uC6B4 \uAC12\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." });
    }
    const portfolio = calculateDayTradePortfolio(positions.map((position) => ({ id: String(position.id), entryPrice: position.entryPrice, currentPrice: latestBySymbol.get(position.symbol)?.price ?? position.lastPrice ?? void 0 })), experiment.totalCapital, Number(experiment.buyFeeRate));
    const ledgerById = new Map(portfolio.positions.map((ledger) => [ledger.id, ledger]));
    for (const position of positions) {
      const quote = latestBySymbol.get(position.symbol);
      const ledger = ledgerById.get(String(position.id));
      if (!ledger) continue;
      await db.update(dayTradeExperimentPositions).set({ lastPrice: quote?.price ?? position.lastPrice, lastObservedAt: quote?.observedAt ?? position.lastObservedAt, buyFee: ledger.buyFee, estimatedExitFee: ledger.estimatedExitFee, netValue: Math.round(ledger.netValue), netPnl: Math.round(ledger.netPnl), netReturnPercent: ledger.netReturnPercent.toFixed(4) }).where(eq35(dayTradeExperimentPositions.id, position.id));
    }
    await db.update(dayTradeExperiments).set({ netValue: Math.round(portfolio.netValue), netPnl: Math.round(portfolio.netPnl), netReturnPercent: portfolio.netReturnPercent.toFixed(4) }).where(eq35(dayTradeExperiments.id, experiment.id));
    const latestObservedAt = Array.from(latestBySymbol.values()).reduce((latest, quote) => !latest || quote.observedAt > latest ? quote.observedAt : latest, null);
    await db.insert(localResearchNodeSyncEvents).values({ experimentId: experiment.id, tradingDate: experiment.tradingDate, status: rejected ? "partial" : "success", quoteCount: latestBySymbol.size, rejectedQuoteCount: rejected + ignored, message: rejected ? "\uC77C\uBD80 \uC2DC\uC138 \uC785\uB825\uC774 \uAC70\uBD80\uB418\uC5C8\uC2B5\uB2C8\uB2E4." : null, observedAt: latestObservedAt });
    return response.json({ status: "synced", experimentId: experiment.id, acceptedQuoteCount: latestBySymbol.size, rejectedQuoteCount: rejected + ignored, latestObservedAt: latestObservedAt?.toISOString() ?? null, netValue: Math.round(portfolio.netValue), netPnl: Math.round(portfolio.netPnl), netReturnPercent: portfolio.netReturnPercent });
  });
  app2.post("/api/local-research-node/intraday-price-status", async (request, response) => {
    response.setHeader("Cache-Control", "no-store, private, max-age=0");
    if (!isLocalResearchNodeAuthorized(request)) return response.status(401).json({ status: "unauthorized" });
    const body = request.body;
    const tradingDate2 = typeof body?.tradingDate === "string" ? body.tradingDate : "";
    const status = body?.status === "partial" ? "partial" : body?.status === "failed" ? "failed" : null;
    const experimentId = Number(body?.experimentId);
    const quoteCount = Math.max(0, Math.floor(Number(body?.quoteCount ?? 0)));
    const rejectedQuoteCount = Math.max(0, Math.floor(Number(body?.rejectedQuoteCount ?? 0)));
    const message = typeof body?.message === "string" ? body.message.trim().slice(0, 500) : null;
    const observedAt = typeof body?.observedAt === "string" ? new Date(body.observedAt) : null;
    if (!tradingDate2 || !status || !message || !Number.isFinite(quoteCount) || !Number.isFinite(rejectedQuoteCount) || observedAt && Number.isNaN(observedAt.getTime())) return response.status(400).json({ status: "invalid_request", message: "\uC2E4\uD328\xB7\uBD80\uBD84 \uC2E4\uD328 \uC0C1\uD0DC \uAE30\uB85D\uC5D0 \uD544\uC694\uD55C \uAC12\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4." });
    const db = await getDb();
    if (!db) return response.status(503).json({ status: "unavailable", message: "\uC5F0\uAD6C \uB370\uC774\uD130\uBCA0\uC774\uC2A4\uB97C \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    await db.insert(localResearchNodeSyncEvents).values({ experimentId: Number.isInteger(experimentId) && experimentId > 0 ? experimentId : null, tradingDate: tradingDate2, status, quoteCount, rejectedQuoteCount, message, observedAt });
    return response.json({ status: "recorded" });
  });
  app2.get("/api/local-research-node/auto-order-plan", async (request, response) => {
    response.setHeader("Cache-Control", "no-store, private, max-age=0");
    if (!isLocalResearchNodeAuthorized(request)) return response.status(401).json({ status: "unauthorized" });
    const db = await getDb();
    if (!db) return response.status(503).json({ status: "unavailable", message: "\uC5F0\uAD6C \uB370\uC774\uD130\uBCA0\uC774\uC2A4\uB97C \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    const tradingDate2 = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(/* @__PURE__ */ new Date());
    const experiment = await ensureLocalIntradayExperiment(db, tradingDate2);
    if (!experiment) return response.status(409).json({ status: "waiting_for_data", message: "\uC7A5\uC911 \uC2E4\uC2DC\uAC04 \uBAA8\uC758\uD22C\uC790 \uC870\uAC74\uC2DD \uAE30\uB85D\uC774 \uC544\uC9C1 \uC5C6\uC2B5\uB2C8\uB2E4." });
    if (experiment.status !== "tracking") return response.status(409).json({ status: "market_closed", message: "\uC7A5 \uB9C8\uAC10\uC73C\uB85C \uB2F9\uC77C \uBAA8\uC758 \uC2E4\uD5D8\uC774 \uC885\uB8CC\uB418\uC5B4 \uC0C8 \uC790\uB3D9 \uC8FC\uBB38 \uACC4\uD68D\uC744 \uB9CC\uB4E4\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.", experimentId: experiment.id, tradingDate: experiment.tradingDate });
    const [policy] = await db.select().from(autoTradePolicies).where(eq35(autoTradePolicies.status, "active")).orderBy(desc28(autoTradePolicies.updatedAt)).limit(1);
    if (!policy) return response.status(409).json({ status: "waiting_for_policy", message: "\uD65C\uC131 \uC790\uB3D9 \uC2E4\uD22C \uC815\uCC45\uC774 \uC544\uC9C1 \uC5C6\uC2B5\uB2C8\uB2E4." });
    const profile = (await db.select().from(tradingProfiles).where(eq35(tradingProfiles.userId, policy.userId)).limit(1))[0];
    if (!profile || profile.killSwitch || !profile.autoTradeEnabled) return response.status(409).json({ status: "automatic_execution_paused", message: "\uC790\uB3D9\uB9E4\uB9E4 \uD65C\uC131\uD654\uC640 \uD0AC \uC2A4\uC704\uCE58 \uD574\uC81C\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4." });
    const positions = await db.select().from(dayTradeExperimentPositions).where(eq35(dayTradeExperimentPositions.experimentId, experiment.id));
    const candidateIds = Array.from(new Set(positions.map((position) => position.candidateId)));
    const candidates = candidateIds.length ? await db.select({ id: autonomousResearchCandidates.id, fitnessScore: autonomousResearchCandidates.fitnessScore }).from(autonomousResearchCandidates).where(inArray9(autonomousResearchCandidates.id, candidateIds)) : [];
    const fitnessByCandidateId = new Map(candidates.map((candidate) => [candidate.id, Number(candidate.fitnessScore ?? 0)]));
    const plan = buildLocalAutoOrderPlan({
      experimentId: experiment.id,
      tradingDate: experiment.tradingDate,
      policyVersion: String(policy.version),
      totalCapital: policy.totalCapital,
      policyId: policy.id,
      positions,
      fitnessByCandidateId,
      maxPositions: policy.maxConcurrentPositions
    });
    return response.json({ ...plan, totalCapital: policy.totalCapital, policy: {
      id: policy.id,
      version: policy.version,
      totalCapital: policy.totalCapital,
      maxConcurrentPositions: policy.maxConcurrentPositions,
      stopLossPercent: Number(policy.stopLossPercent),
      takeProfitPercent: Number(policy.takeProfitPercent),
      dailyLossLimitPercent: Number(policy.dailyLossLimitPercent)
    } });
  });
  app2.post("/api/local-research-node/execution-sync", async (request, response) => {
    response.setHeader("Cache-Control", "no-store, private, max-age=0");
    if (!isLocalResearchNodeAuthorized(request)) return response.status(401).json({ status: "unauthorized" });
    const body = request.body;
    if (!body || !Array.isArray(body.orders) || !Array.isArray(body.positions)) return response.status(400).json({ status: "invalid_request", message: "\uC8FC\uBB38\uACFC \uD3EC\uC9C0\uC158 \uBC30\uC5F4\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." });
    const db = await getDb();
    if (!db) return response.status(503).json({ status: "unavailable", message: "\uC5F0\uAD6C \uB370\uC774\uD130\uBCA0\uC774\uC2A4\uB97C \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    const policyId = Number(body.policyId);
    const policyVersion = Number(body.policyVersion);
    const [policy] = await db.select().from(autoTradePolicies).where(and25(eq35(autoTradePolicies.id, policyId), eq35(autoTradePolicies.version, policyVersion))).limit(1);
    if (!policy) return response.status(409).json({ status: "policy_missing", message: "\uC2E4\uD589 \uC2DC\uC791 \uC2DC\uC810\uC758 \uC790\uB3D9 \uC2E4\uD22C \uC815\uCC45 \uAE30\uB85D\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    const policySnapshot = { id: policy.id, version: policy.version, totalCapital: policy.totalCapital, maxConcurrentPositions: policy.maxConcurrentPositions, stopLossPercent: Number(policy.stopLossPercent), takeProfitPercent: Number(policy.takeProfitPercent), dailyLossLimitPercent: Number(policy.dailyLossLimitPercent) };
    const accepted = [];
    for (const raw of body.orders) {
      const item = raw;
      const side = item.side === "sell" ? "sell" : item.side === "buy" ? "buy" : null;
      const status = item.status === "rejected" ? "rejected" : item.status === "filled" ? "filled" : item.status === "submitted" ? "submitted" : null;
      const candidateId = Number(item.candidateId);
      const hasCandidateId = Number.isInteger(candidateId) && candidateId > 0;
      const quantity = Number(item.quantity);
      const price = Number(item.price);
      const symbol = typeof item.symbol === "string" ? item.symbol.trim() : "";
      const name = typeof item.name === "string" && item.name.trim() ? item.name.trim() : symbol;
      const dedupeKey = typeof item.dedupeKey === "string" ? item.dedupeKey.trim() : "";
      if (!side || !status || side === "buy" && !hasCandidateId || !Number.isInteger(quantity) || quantity < 1 || !Number.isInteger(price) || price < 1 || !symbol || !dedupeKey || dedupeKey.length > 160) continue;
      let intent = (await db.select().from(orderIntents).where(and25(eq35(orderIntents.userId, policy.userId), eq35(orderIntents.dedupeKey, dedupeKey))).limit(1))[0];
      if (!intent) {
        const [created] = await db.insert(orderIntents).values({ userId: policy.userId, sourceCandidateId: hasCandidateId ? candidateId : null, symbol, name, side, orderType: "limit", quantity, price, amount: quantity * price, status, riskReasonsJson: status === "rejected" ? [String(item.message ?? "\uB85C\uCEEC \uC2E4\uD589\uAE30\uC5D0\uC11C \uC8FC\uBB38\uC774 \uAC70\uBD80\uB418\uC5C8\uC2B5\uB2C8\uB2E4.")] : [], autoPolicyId: policy.id, autoPolicyVersion: policy.version, autoPolicySnapshotJson: policySnapshot, executionOrigin: "local_node", dedupeKey, brokerOrderId: typeof item.brokerOrderId === "string" ? item.brokerOrderId : null }).returning();
        intent = (await db.select().from(orderIntents).where(eq35(orderIntents.id, created.id)).limit(1))[0];
      } else if (["submitted", "filled"].includes(status) && intent.status !== "filled") {
        await db.update(orderIntents).set({ status, brokerOrderId: typeof item.brokerOrderId === "string" ? item.brokerOrderId : intent.brokerOrderId }).where(eq35(orderIntents.id, intent.id));
      }
      if (!intent) continue;
      const prior = await db.select({ id: orderExecutions.id }).from(orderExecutions).where(and25(eq35(orderExecutions.orderIntentId, intent.id), eq35(orderExecutions.executionStatus, status))).limit(1);
      if (!prior.length) await db.insert(orderExecutions).values({ orderIntentId: intent.id, brokerOrderId: typeof item.brokerOrderId === "string" ? item.brokerOrderId : null, executionStatus: status, filledQuantity: status === "filled" ? quantity : 0, filledPrice: status === "filled" ? price : null, responseJson: { source: "local_research_node", message: item.message ?? null } });
      accepted.push(intent.id);
    }
    for (const raw of body.positions) {
      const item = raw;
      const symbol = typeof item.symbol === "string" ? item.symbol.trim() : "";
      const name = typeof item.name === "string" && item.name.trim() ? item.name.trim() : symbol;
      const quantity = Number(item.quantity);
      const averagePrice = Number(item.averagePrice);
      const currentPrice = Number(item.currentPrice);
      const profitLoss = Number(item.profitLoss);
      const profitLossRate = Number(item.profitLossRate);
      if (!symbol || ![quantity, averagePrice, currentPrice, profitLoss, profitLossRate].every(Number.isFinite) || quantity < 0 || averagePrice < 0 || currentPrice < 0) continue;
      await db.insert(positionSnapshots).values({ userId: policy.userId, symbol, name, quantity: Math.floor(quantity), averagePrice: Math.floor(averagePrice), currentPrice: Math.floor(currentPrice), profitLoss: Math.floor(profitLoss), profitLossRate: String(profitLossRate) });
    }
    return response.json({ status: "synced", orderIntentIds: accepted, policyVersion: policy.version });
  });
}

// server/_core/index.ts
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}
async function findAvailablePort(startPort = 3e3) {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}
function registerApiRoutes(app2) {
  app2.set("trust proxy", 1);
  app2.use(express2.json({ limit: "50mb" }));
  app2.use(express2.urlencoded({ limit: "50mb", extended: true }));
  registerOAuthRoutes(app2);
  registerLocalResearchNodeRoutes(app2);
  app2.post("/api/scheduled/ranking-refresh", rankingRefreshHandler);
  app2.post("/api/scheduled/autonomous-research", (req, res) => void autonomousResearchHandler(req, res));
  app2.post("/api/scheduled/research-governance", (req, res) => void researchGovernanceHandler(req, res));
  app2.post("/api/scheduled/minute-research", (req, res) => void minuteResearchHandler(req, res));
  app2.use("/api/trpc", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store, private, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    next();
  });
  app2.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext
    })
  );
  app2.use("/api/trpc", trpcJsonFallback);
}
async function startServer() {
  const app2 = express2();
  const server = createServer(app2);
  registerApiRoutes(app2);
  if (process.env.NODE_ENV === "development") {
    await setupVite(app2, server);
  } else {
    serveStatic(app2);
  }
  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);
  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }
  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}
if (!process.env.VITEST) startServer().catch(console.error);

// server/vercel-handler.ts
var app = express3();
registerApiRoutes(app);
serveStatic(app);
function handler(req, res) {
  return app(req, res);
}
export {
  handler as default
};
