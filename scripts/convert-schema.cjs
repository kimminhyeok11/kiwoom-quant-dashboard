const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, '../drizzle/schema.ts');
let content = fs.readFileSync(schemaPath, 'utf-8');

// Define replacements
const replacements = [
  // Replace mysqlTable with pgTable
  [/mysqlTable\(/g, 'pgTable('],
  
  // Replace int("id").autoincrement() with serial("id")
  [/int\("id"\)\.autoincrement\(\)\.primaryKey\(\)/g, 'serial("id").primaryKey()'],
  
  // Replace all remaining int with integer
  [/int\(/g, 'integer('],
  
  // Replace mysqlEnum with predefined enum variables
  [/mysqlEnum\("role", \["user", "admin"\]\)/g, 'roleEnum("role")'],
  [/mysqlEnum\("environment", \["mock", "live"\]\)/g, 'environmentEnum("environment")'],
  [/mysqlEnum\("connectionStatus", \["disconnected", "ready", "error"\]\)/g, 'connectionStatusEnum("connectionStatus")'],
  [/mysqlEnum\("status", \["active", "superseded", "paused"\]\)/g, 'autoTradePolicyStatusEnum("status")'],
  [/mysqlEnum\("visibility", \["public", "hidden"\]\)/g, 'visibilityEnum("visibility")'],
  [/mysqlEnum\("timeframe", \["daily", "five_minute"\]\)/g, 'timeframeEnum("timeframe")'],
  [/mysqlEnum\("adjustmentBasis", \["adjusted", "unadjusted"\]\)/g, 'adjustmentBasisEnum("adjustmentBasis")'],
  [/mysqlEnum\("adjustmentBasis", \["adjusted", "unadjusted", "unknown"\]\)/g, 'adjustmentBasisEnum("adjustmentBasis")'],
  [/mysqlEnum\("qualityStatus", \["draft", "collecting", "ready", "error"\]\)/g, 'qualityStatusEnum("qualityStatus")'],
  [/mysqlEnum\("source", \["kiwoom_daily", "kiwoom_daily_five_minute"\]\)/g, 'sourceEnum("source")'],
  [/mysqlEnum\("origin", \["seed", "elite", "crossover", "mutation", "manual_expand"\]\)/g, 'originEnum("origin")'],
  [/mysqlEnum\("status", \["created", "evaluated", "survived", "rejected", "failed"\]\)/g, 'candidateStatusEnum("status")'],
  [/mysqlEnum\("phase", \["preparing", "opening", "intraday", "closing", "completed", "waiting_for_data", "incomplete", "failed"\]\)/g, 'phaseEnum("phase")'],
  [/mysqlEnum\("dataStatus", \["pending", "ready", "waiting", "incomplete", "error"\]\)/g, 'dataStatusEnum("dataStatus")'],
  [/mysqlEnum\("channel", \["intraday_price"\]\)/g, 'channelEnum("channel")'],
  [/mysqlEnum\("side", \["buy", "sell"\]\)/g, 'sideEnum("side")'],
  [/mysqlEnum\("orderType", \["market", "limit"\]\)/g, 'orderTypeEnum("orderType")'],
  [/mysqlEnum\("status", \["pending_confirmation", "confirmed", "submitting", "blocked", "submitted", "filled", "rejected", "cancelled"\]\)/g, 'orderStatusEnum("status")'],
  [/mysqlEnum\("executionOrigin", \["manual", "local_node"\]\)/g, 'executionOriginEnum("executionOrigin")'],
  [/mysqlEnum\("eventType", \["entry", "mark", "exit"\]\)/g, 'eventTypeEnum("eventType")'],
  [/mysqlEnum\("regime", \["trend_up", "trend_down", "range", "volatile"\]\)/g, 'regimeEnum("regime")'],
  [/mysqlEnum\("scope", \["stored_daily_bars", "external_verification"\]\)/g, 'scopeEnum("scope")'],
  [/mysqlEnum\("status", \["tracking", "closed"\]\)/g, 'trackingStatusEnum("status")'],
  [/mysqlEnum\("status", \["tracking", "closed", "cash_only"\]\)/g, 'trackingStatusEnum("status")'],
  [/mysqlEnum\("status", \["evaluated", "promoted", "rejected", "insufficient_validation", "failed"\]\)/g, 'minuteResearchStatusEnum("status")'],
  [/mysqlEnum\("status", \["running", "completed", "failed", "skipped"\]\)/g, 'governanceStatusEnum("status")'],
  
  // Remove onUpdateNow() - PostgreSQL handles this differently
  [/\.onUpdateNow\(\)/g, ''],
  
  // Handle other status enums that might have different values
  [/mysqlEnum\("status", \[([^\]]+)\]\)/g, (match, values) => {
    // Map specific status values to appropriate enums
    if (values.includes('idle') && values.includes('running')) {
      return 'rankingRefreshStatusEnum("status")';
    }
    if (values.includes('draft') && values.includes('queued')) {
      return 'experimentStatusEnum("status")';
    }
    if (values.includes('queued') && values.includes('running') && values.includes('cancelled')) {
      return 'evolutionSearchStatusEnum("status")';
    }
    if (values.includes('generating')) {
      return 'generationStatusEnum("status")';
    }
    if (values.includes('connected') && values.includes('failed')) {
      return 'connectionCheckStatusEnum("status")';
    }
    if (values.includes('promoted') && values.includes('observe')) {
      return 'survivalStatusEnum("status")';
    }
    if (values.includes('cancelled') && values.includes('running')) {
      return 'collectionRequestStatusEnum("status")';
    }
    if (values.includes('success') && values.includes('partial')) {
      return 'syncEventStatusEnum("status")';
    }
    if (values.includes('queued') && values.includes('running') && values.includes('completed') && values.includes('failed')) {
      return 'backtestStatusEnum("status")';
    }
    if (values.includes('active') && values.includes('closed')) {
      return 'portfolioStatusEnum("status")';
    }
    if (values.includes('open') && values.includes('closed')) {
      return 'positionStatusEnum("status")';
    }
    if (values.includes('active') && values.includes('paused')) {
      return 'minuteProgramStatusEnum("status")';
    }
    if (values.includes('queued') && values.includes('running') && values.includes('waiting_for_data')) {
      return 'sweepStatusEnum("status")';
    }
    if (values.includes('running') && values.includes('completed') && values.includes('failed')) {
      return 'committeeStatusEnum("status")';
    }
    if (values.includes('queued') && values.includes('running') && values.includes('blocked')) {
      return 'revalidationStatusEnum("status")';
    }
    // Default to varchar for unknown status enums
    return 'varchar("status", { length: 50 })';
  }],
  
  // Handle other mysqlEnum patterns
  [/mysqlEnum\("([a-zA-Z_]+)", \[([^\]]+)\]\)/g, (match, enumName, values) => {
    // Replace with varchar for complex enums
    return `varchar("${enumName}", { length: 50 })`;
  }],
];

// Apply replacements
replacements.forEach(([pattern, replacement]) => {
  content = content.replace(pattern, replacement);
});

// Post-processing: Fix status enums based on table context
content = content.replace(
  /export const rankingRefreshProfiles = pgTable\([^}]*status: autoTradePolicyStatusEnum\("status"\)/g,
  'export const rankingRefreshProfiles = pgTable(  "ranking_refresh_profiles",\n  {\n    id: serial("id").primaryKey(),\n    userId: integer("userId").notNull(),\n    presetId: integer("presetId").notNull(),\n    universeJson: json("universeJson").notNull(),\n    maxPagesPerSymbol: integer("maxPagesPerSymbol").default(3).notNull(),\n    cronExpression: varchar("cronExpression", { length: 48 }).default("0 */15 * * * *").notNull(),\n    scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),\n    status: rankingRefreshStatusEnum("status")'
);
content = content.replace(
  /export const researchExperiments = pgTable\([^}]*status: autoTradePolicyStatusEnum\("status"\)/g,
  'export const researchExperiments = pgTable(  "research_experiments",\n  {\n    id: serial("id").primaryKey(),\n    userId: integer("userId").notNull(),\n    presetId: integer("presetId").notNull(),\n    status: experimentStatusEnum("status")'
);
content = content.replace(
  /export const evolutionSearches = pgTable\([^}]*status: autoTradePolicyStatusEnum\("status"\)/g,
  'export const evolutionSearches = pgTable(  "evolution_searches",\n  {\n    id: serial("id").primaryKey(),\n    userId: integer("userId").notNull(),\n    presetId: integer("presetId").notNull(),\n    status: evolutionSearchStatusEnum("status")'
);
content = content.replace(
  /export const evolutionGenerations = pgTable\([^}]*status: autoTradePolicyStatusEnum\("status"\)/g,
  'export const evolutionGenerations = pgTable(  "evolution_generations",\n  {\n    id: serial("id").primaryKey(),\n    searchId: integer("searchId").notNull(),\n    generationIndex: integer("generationIndex").notNull(),\n    status: generationStatusEnum("status")'
);
content = content.replace(
  /export const autonomousResearchTasks = pgTable\([^}]*status: autoTradePolicyStatusEnum\("status"\)/g,
  'export const autonomousResearchTasks = pgTable(  "autonomous_research_tasks",\n  {\n    id: serial("id").primaryKey(),\n    userId: integer("userId").notNull(),\n    presetId: integer("presetId").notNull(),\n    status: autonomousTaskStatusEnum("status")'
);
content = content.replace(
  /export const connectionChecks = pgTable\([^}]*status: autoTradePolicyStatusEnum\("status"\)/g,
  'export const connectionChecks = pgTable(  "connection_checks",\n  {\n    id: serial("id").primaryKey(),\n    userId: integer("userId").notNull(),\n    status: connectionCheckStatusEnum("status")'
);
content = content.replace(
  /export const evolutionSurvival = pgTable\([^}]*status: autoTradePolicyStatusEnum\("status"\)/g,
  'export const evolutionSurvival = pgTable(  "evolution_survival",\n  {\n    id: serial("id").primaryKey(),\n    searchId: integer("searchId").notNull(),\n    status: survivalStatusEnum("status")'
);
content = content.replace(
  /export const localMinuteCollectionRequests = pgTable\([^}]*status: autoTradePolicyStatusEnum\("status"\)/g,
  'export const localMinuteCollectionRequests = pgTable(  "local_minute_collection_requests",\n  {\n    id: serial("id").primaryKey(),\n    status: collectionRequestStatusEnum("status")'
);
content = content.replace(
  /export const localResearchNodeSyncEvents = pgTable\([^}]*status: autoTradePolicyStatusEnum\("status"\)/g,
  'export const localResearchNodeSyncEvents = pgTable(  "local_research_node_sync_events",\n  {\n    id: serial("id").primaryKey(),\n    status: syncEventStatusEnum("status")'
);
content = content.replace(
  /export const backtestRuns = pgTable\([^}]*status: autoTradePolicyStatusEnum\("status"\)/g,
  'export const backtestRuns = pgTable(  "backtest_runs",\n  {\n    id: serial("id").primaryKey(),\n    userId: integer("userId").notNull(),\n    presetId: integer("presetId").notNull(),\n    status: backtestStatusEnum("status")'
);
content = content.replace(
  /export const paperPortfolios = pgTable\([^}]*status: autoTradePolicyStatusEnum\("status"\)/g,
  'export const paperPortfolios = pgTable(  "paper_portfolios",\n  {\n    id: serial("id").primaryKey(),\n    userId: integer("userId").notNull(),\n    status: portfolioStatusEnum("status")'
);
content = content.replace(
  /export const paperPositions = pgTable\([^}]*status: autoTradePolicyStatusEnum\("status"\)/g,
  'export const paperPositions = pgTable(  "paper_positions",\n  {\n    id: serial("id").primaryKey(),\n    portfolioId: integer("portfolioId").notNull(),\n    status: positionStatusEnum("status")'
);
content = content.replace(
  /export const minuteResearchPrograms = pgTable\([^}]*status: autoTradePolicyStatusEnum\("status"\)/g,
  'export const minuteResearchPrograms = pgTable(  "minute_research_programs",\n  {\n    id: serial("id").primaryKey(),\n    userId: integer("userId").notNull(),\n    status: minuteProgramStatusEnum("status")'
);
content = content.replace(
  /export const minuteResearchSweeps = pgTable\([^}]*status: autoTradePolicyStatusEnum\("status"\)/g,
  'export const minuteResearchSweeps = pgTable(  "minute_research_sweeps",\n  {\n    id: serial("id").primaryKey(),\n    programId: integer("programId").notNull(),\n    status: sweepStatusEnum("status")'
);
content = content.replace(
  /export const researchCommittee = pgTable\([^}]*status: autoTradePolicyStatusEnum\("status"\)/g,
  'export const researchCommittee = pgTable(  "research_committee",\n  {\n    id: serial("id").primaryKey(),\n    status: committeeStatusEnum("status")'
);
content = content.replace(
  /export const researchRevalidation = pgTable\([^}]*status: autoTradePolicyStatusEnum\("status"\)/g,
  'export const researchRevalidation = pgTable(  "research_revalidation",\n  {\n    id: serial("id").primaryKey(),\n    status: revalidationStatusEnum("status")'
);
content = content.replace(
  /export const dayTradeExperiments = pgTable\([^}]*status: autoTradePolicyStatusEnum\("status"\)/g,
  'export const dayTradeExperiments = pgTable(  "day_trade_experiments",\n  {\n    id: serial("id").primaryKey(),\n    status: dayTradeStatusEnum("status")'
);
content = content.replace(
  /export const dayTradeExperimentPositions = pgTable\([^}]*status: autoTradePolicyStatusEnum\("status"\)/g,
  'export const dayTradeExperimentPositions = pgTable(  "day_trade_experiment_positions",\n  {\n    id: serial("id").primaryKey(),\n    status: trackingStatusEnum("status")'
);

// Write back
fs.writeFileSync(schemaPath, content, 'utf-8');
console.log('Schema conversion completed');
