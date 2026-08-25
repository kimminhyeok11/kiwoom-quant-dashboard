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
  varchar,
} from "drizzle-orm/pg-core";

// Define enums
const roleEnum = pgEnum("role", ["user", "admin"]);
const environmentEnum = pgEnum("environment", ["mock", "live"]);
const connectionStatusEnum = pgEnum("connectionStatus", ["connected", "failed"]);
const autoTradePolicyStatusEnum = pgEnum("autoTradePolicyStatus", ["active", "superseded", "paused"]);
const visibilityEnum = pgEnum("visibility", ["public", "hidden"]);
const timeframeEnum = pgEnum("timeframe", ["daily", "five_minute"]);
const adjustmentBasisEnum = pgEnum("adjustmentBasis", ["adjusted", "unadjusted", "unknown"]);
const qualityStatusEnum = pgEnum("qualityStatus", ["draft", "collecting", "ready", "error"]);
const sourceEnum = pgEnum("source", ["kiwoom_daily", "kiwoom_daily_five_minute"]);
const originEnum = pgEnum("origin", ["seed", "elite", "crossover", "mutation", "manual_expand"]);
const candidateStatusEnum = pgEnum("candidateStatus", ["created", "evaluated", "survived", "rejected", "failed"]);
const phaseEnum = pgEnum("phase", ["preparing", "opening", "intraday", "closing", "completed", "waiting_for_data", "incomplete", "failed"]);
const dataStatusEnum = pgEnum("dataStatus", ["pending", "ready", "waiting", "incomplete", "error"]);
const channelEnum = pgEnum("channel", ["intraday_price"]);
const sideEnum = pgEnum("side", ["buy", "sell"]);
const orderTypeEnum = pgEnum("orderType", ["market", "limit"]);
const orderStatusEnum = pgEnum("orderStatus", ["pending_confirmation", "confirmed", "submitting", "blocked", "submitted", "filled", "rejected", "cancelled"]);
const executionOriginEnum = pgEnum("executionOrigin", ["manual", "local_node"]);
const eventTypeEnum = pgEnum("eventType", ["entry", "mark", "exit"]);
const regimeEnum = pgEnum("regime", ["trend_up", "trend_down", "range", "volatile"]);
const scopeEnum = pgEnum("scope", ["stored_daily_bars", "external_verification"]);
const trackingStatusEnum = pgEnum("trackingStatus", ["tracking", "closed", "cash_only"]);
const minuteResearchStatusEnum = pgEnum("minuteResearchStatus", ["evaluated", "promoted", "rejected", "insufficient_validation", "failed"]);
const governanceStatusEnum = pgEnum("governanceStatus", ["running", "completed", "failed", "skipped"]);

// Generic status enums for various tables
const rankingRefreshStatusEnum = pgEnum("rankingRefreshStatus", ["idle", "running", "ready", "error", "paused"]);
const experimentStatusEnum = pgEnum("experimentStatus", ["draft", "queued", "running", "completed", "failed"]);
const evolutionSearchStatusEnum = pgEnum("evolutionSearchStatus", ["draft", "queued", "running", "completed", "failed", "cancelled"]);
const generationStatusEnum = pgEnum("generationStatus", ["queued", "generating", "evaluating", "completed", "failed"]);
const autonomousPhaseEnum = pgEnum("autonomousPhase", ["preparing", "opening", "intraday", "closing", "completed", "waiting_for_data", "incomplete", "failed"]);
const autonomousTaskStatusEnum = pgEnum("autonomousTaskStatus", ["running", "completed", "waiting_for_data", "failed"]);
const connectionCheckStatusEnum = pgEnum("connectionCheckStatus", ["connected", "failed"]);
const survivalStatusEnum = pgEnum("survivalStatus", ["promoted", "observe", "rejected"]);
const collectionRequestStatusEnum = pgEnum("collectionRequestStatus", ["queued", "running", "completed", "failed", "cancelled"]);
const dayTradeStatusEnum = pgEnum("dayTradeStatus", ["tracking", "closed"]);
const syncEventStatusEnum = pgEnum("syncEventStatus", ["success", "partial", "failed"]);
const backtestStatusEnum = pgEnum("backtestStatus", ["queued", "running", "completed", "failed"]);
const portfolioStatusEnum = pgEnum("portfolioStatus", ["active", "closed"]);
const positionStatusEnum = pgEnum("positionStatus", ["open", "closed"]);
const minuteProgramStatusEnum = pgEnum("minuteProgramStatus", ["active", "paused"]);
const sweepStatusEnum = pgEnum("sweepStatus", ["queued", "running", "completed", "waiting_for_data", "failed"]);
const committeeStatusEnum = pgEnum("committeeStatus", ["running", "completed", "failed"]);
const revalidationStatusEnum = pgEnum("revalidationStatus", ["queued", "running", "completed", "blocked", "failed"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  avatarId: varchar("avatarId", { length: 32 }).default("nebula").notNull(),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: roleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const tradingProfiles = pgTable(
  "trading_profiles",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    environment: environmentEnum("environment").default("mock").notNull(),
    accountNumberMasked: varchar("accountNumberMasked", { length: 32 }),
    tokenExpiresAt: timestamp("tokenExpiresAt"),
    connectionStatus: connectionStatusEnum("connectionStatus").default("failed").notNull(),
    refreshIntervalSeconds: integer("refreshIntervalSeconds").default(60).notNull(),
    maxBuyAmount: integer("maxBuyAmount").default(500000).notNull(),
    dailyTradeLimit: integer("dailyTradeLimit").default(3).notNull(),
    killSwitch: boolean("killSwitch").default(true).notNull(),
    autoTradeEnabled: boolean("autoTradeEnabled").default(false).notNull(),
    requireConfirmation: boolean("requireConfirmation").default(true).notNull(),
    scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("trading_profiles_user_unique").on(table.userId)],
);

export const autoTradePolicies = pgTable(
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
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("auto_trade_policies_user_version_unique").on(table.userId, table.version), index("auto_trade_policies_user_status_idx").on(table.userId, table.status, table.updatedAt)],
);

export const strategyPresets = pgTable(
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
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [index("strategy_presets_user_idx").on(table.userId)],
);

export const publicStrategyCards = pgTable(
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
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [index("public_strategy_cards_source_candidate_idx").on(table.sourceCandidateId), index("public_strategy_cards_visibility_published_idx").on(table.visibility, table.publishedAt), index("public_strategy_cards_creator_idx").on(table.creatorUserId, table.publishedAt)],
);

export const publicStrategyCardCollections = pgTable(
  "public_strategy_card_collections",
  {
    id: serial("id").primaryKey(),
    cardId: integer("cardId").notNull(),
    userId: integer("userId").notNull(),
    presetId: integer("presetId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("public_strategy_card_collections_card_user_unique").on(table.cardId, table.userId), index("public_strategy_card_collections_user_idx").on(table.userId, table.createdAt)],
);

export const publicStrategyCardComments = pgTable(
  "public_strategy_card_comments",
  {
    id: serial("id").primaryKey(),
    cardId: integer("cardId").notNull(),
    userId: integer("userId").notNull(),
    body: varchar("body", { length: 800 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [index("public_strategy_card_comments_card_created_idx").on(table.cardId, table.createdAt), index("public_strategy_card_comments_user_idx").on(table.userId, table.createdAt)],
);

export const publicStrategyCardFavorites = pgTable(
  "public_strategy_card_favorites",
  {
    id: serial("id").primaryKey(),
    cardId: integer("cardId").notNull(),
    userId: integer("userId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("public_strategy_card_favorites_card_user_unique").on(table.cardId, table.userId), index("public_strategy_card_favorites_card_created_idx").on(table.cardId, table.createdAt)],
);

export const rankingSnapshots = pgTable(
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
    capturedAt: timestamp("capturedAt").defaultNow().notNull(),
  },
  table => [index("ranking_snapshots_lookup_idx").on(table.userId, table.presetId, table.capturedAt), uniqueIndex("ranking_snapshots_run_symbol_unique").on(table.userId, table.presetId, table.symbol, table.runKey)],
);

export const rankingRefreshProfiles = pgTable(
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
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("ranking_refresh_profiles_user_unique").on(table.userId), index("ranking_refresh_profiles_task_idx").on(table.scheduleCronTaskUid)],
);

export const htsConditionSnapshots = pgTable(
  "hts_condition_snapshots",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    conditionSequence: varchar("conditionSequence", { length: 3 }).notNull(),
    conditionName: varchar("conditionName", { length: 120 }).notNull(),
    candidatesJson: json("candidatesJson").notNull(),
    capturedAt: timestamp("capturedAt").defaultNow().notNull(),
  },
  table => [index("hts_condition_snapshots_lookup_idx").on(table.userId, table.conditionSequence, table.capturedAt)],
);

export const researchDatasets = pgTable(
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
    readyAt: timestamp("readyAt"),
  },
  table => [uniqueIndex("research_datasets_user_version_unique").on(table.userId, table.versionKey), index("research_datasets_user_status_idx").on(table.userId, table.qualityStatus, table.createdAt), index("research_datasets_public_ready_idx").on(table.visibility, table.qualityStatus, table.readyAt), index("research_datasets_source_fingerprint_idx").on(table.sourceFingerprint)],
);

export const researchDailyBars = pgTable(
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
    capturedAt: timestamp("capturedAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("research_daily_bars_dataset_symbol_date_unique").on(table.datasetId, table.symbol, table.date), index("research_daily_bars_dataset_symbol_date_idx").on(table.datasetId, table.symbol, table.date)],
);

export const researchFiveMinuteBars = pgTable(
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
    capturedAt: timestamp("capturedAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("research_five_minute_dataset_symbol_time_unique").on(table.datasetId, table.symbol, table.intervalAt), index("research_five_minute_dataset_symbol_date_idx").on(table.datasetId, table.symbol, table.tradingDate)],
);

export const sharedDatasetBacktests = pgTable(
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
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("shared_dataset_backtests_user_created_idx").on(table.userId, table.createdAt), index("shared_dataset_backtests_dataset_created_idx").on(table.datasetId, table.createdAt)],
);

export const strategySurvivalLedgers = pgTable(
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
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("strategy_survival_ledgers_user_created_idx").on(table.userId, table.createdAt), index("strategy_survival_ledgers_preset_time_idx").on(table.presetId, table.timeframe, table.createdAt)],
);

export const sharedDatasetCollectionRequests = pgTable(
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
    completedAt: timestamp("completedAt"),
  },
  table => [uniqueIndex("shared_dataset_collection_request_fingerprint_unique").on(table.requestFingerprint), index("shared_dataset_collection_request_status_idx").on(table.status, table.requestedAt), index("shared_dataset_collection_request_user_idx").on(table.requestedByUserId, table.requestedAt)],
);

export const kiwoomTerminalConnectionChecks = pgTable(
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
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("kiwoom_terminal_checks_user_time_idx").on(table.userId, table.checkedAt), index("kiwoom_terminal_checks_ip_time_idx").on(table.terminalIp, table.checkedAt)],
);

export const localResearchDailyBars = pgTable(
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
    capturedAt: timestamp("capturedAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("local_research_daily_bars_symbol_date_adjustment_unique").on(table.symbol, table.date, table.adjustmentBasis), index("local_research_daily_bars_symbol_date_idx").on(table.symbol, table.date, table.capturedAt)],
);

export const researchExperiments = pgTable(
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
    completedAt: timestamp("completedAt"),
  },
  table => [index("research_experiments_user_created_idx").on(table.userId, table.createdAt), index("research_experiments_dataset_idx").on(table.datasetId, table.status)],
);

export const walkForwardRuns = pgTable(
  "walk_forward_runs",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    experimentId: integer("experimentId").notNull(),
    status: backtestStatusEnum("status").default("queued").notNull(),
    configurationJson: json("configurationJson").notNull(),
    resultsJson: json("resultsJson"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    completedAt: timestamp("completedAt"),
  },
  table => [index("walk_forward_runs_user_created_idx").on(table.userId, table.createdAt), index("walk_forward_runs_experiment_idx").on(table.experimentId, table.status)],
);

export const evolutionSearches = pgTable(
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
    completedAt: timestamp("completedAt"),
  },
  table => [index("evolution_searches_user_created_idx").on(table.userId, table.createdAt), index("evolution_searches_dataset_status_idx").on(table.datasetId, table.status)],
);

export const evolutionGenerations = pgTable(
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
    completedAt: timestamp("completedAt"),
  },
  table => [uniqueIndex("evolution_generations_search_number_unique").on(table.searchId, table.generationNumber), index("evolution_generations_search_status_idx").on(table.searchId, table.status)],
);

export const evolutionCandidates = pgTable(
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
    evaluatedAt: timestamp("evaluatedAt"),
  },
  table => [uniqueIndex("evolution_candidates_search_fingerprint_unique").on(table.searchId, table.fingerprint), index("evolution_candidates_generation_status_idx").on(table.generationId, table.status), index("evolution_candidates_search_fitness_idx").on(table.searchId, table.fitnessScore)],
);

export const autonomousResearchRuns = pgTable(
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
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("autonomous_research_runs_run_key_unique").on(table.runKey), index("autonomous_research_runs_date_phase_idx").on(table.tradingDate, table.phase, table.updatedAt)],
);

export const autonomousResearchTasks = pgTable(
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
    completedAt: timestamp("completedAt"),
  },
  table => [uniqueIndex("auto_research_tasks_run_key_uq").on(table.runKey), index("auto_research_tasks_run_phase_idx").on(table.runId, table.phase, table.startedAt)],
);

export const autonomousResearchBars = pgTable(
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
    capturedAt: timestamp("capturedAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("auto_bars_run_symbol_date_uq").on(table.runId, table.symbol, table.date), index("auto_bars_run_symbol_date_idx").on(table.runId, table.symbol, table.date)],
);

export const intradayMinuteBars = pgTable(
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
    capturedAt: timestamp("capturedAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("intraday_minute_bar_date_symbol_time_uq").on(table.tradingDate, table.symbol, table.minuteAt), index("intraday_minute_bar_symbol_time_idx").on(table.symbol, table.minuteAt), index("intraday_minute_bar_date_captured_idx").on(table.tradingDate, table.capturedAt)],
);

export const autonomousResearchCandidates = pgTable(
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
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("autonomous_research_candidates_run_fingerprint_unique").on(table.runId, table.fingerprint), index("autonomous_research_candidates_run_status_idx").on(table.runId, table.status), index("autonomous_research_candidates_run_fitness_idx").on(table.runId, table.fitnessScore)],
);

export const researchCommitteeReports = pgTable(
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
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("committee_reports_run_evidence_unique").on(table.runId, table.evidenceFingerprint),
    index("committee_reports_run_status_idx").on(table.runId, table.status, table.updatedAt),
  ],
);

export const researchGovernanceSchedules = pgTable(
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
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("research_governance_schedule_task_uid_unique").on(table.taskUid)],
);

export const researchGovernanceCycles = pgTable(
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
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("research_governance_cycle_fingerprint_unique").on(table.cycleFingerprint),
    index("research_governance_cycles_run_status_idx").on(table.runId, table.status, table.updatedAt),
    index("research_governance_cycles_committee_idx").on(table.committeeReportId, table.updatedAt),
  ],
);

export const researchRevalidationJobs = pgTable(
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
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("research_revalidation_job_fingerprint_unique").on(table.jobFingerprint),
    index("research_revalidation_cycle_status_idx").on(table.governanceCycleId, table.status, table.updatedAt),
    index("research_revalidation_source_priority_idx").on(table.sourceRunId, table.priorityId),
  ],
);

export const autonomousResearchObservations = pgTable(
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
    capturedAt: timestamp("capturedAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("auto_obs_run_cand_symbol_time_uq").on(table.runId, table.candidateId, table.symbol, table.capturedAt), index("auto_obs_run_time_idx").on(table.runId, table.capturedAt)],
);

export const dayTradeExperiments = pgTable(
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
    closedAt: timestamp("closedAt"),
  },
  table => [uniqueIndex("day_trade_experiments_run_unique").on(table.runId), index("day_trade_experiments_date_status_idx").on(table.tradingDate, table.status, table.updatedAt)],
);

export const dayTradeExperimentPositions = pgTable(
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
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("day_trade_position_experiment_symbol_unique").on(table.experimentId, table.symbol), index("day_trade_positions_candidate_idx").on(table.candidateId, table.updatedAt), index("day_trade_positions_experiment_status_idx").on(table.experimentId, table.status, table.updatedAt)],
);

export const localResearchNodeSyncEvents = pgTable(
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
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("local_node_sync_experiment_time_idx").on(table.experimentId, table.createdAt), index("local_node_sync_date_time_idx").on(table.tradingDate, table.createdAt)],
);

export const backtestRuns = pgTable(
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
    completedAt: timestamp("completedAt"),
  },
  table => [index("backtest_runs_user_idx").on(table.userId, table.createdAt)],
);

export const orderIntents = pgTable(
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
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [index("order_intents_user_status_idx").on(table.userId, table.status, table.createdAt), index("order_intents_source_observation_idx").on(table.sourceObservationId), uniqueIndex("order_intents_user_dedupe_unique").on(table.userId, table.dedupeKey)],
);

export const localMinuteCollectionRequests = pgTable(
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
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("local_minute_collection_request_key_uq").on(table.requestKey), index("local_minute_collection_status_time_idx").on(table.status, table.updatedAt), index("local_minute_collection_date_time_idx").on(table.tradingDate, table.updatedAt)],
);

export const orderExecutions = pgTable(
  "order_executions",
  {
    id: serial("id").primaryKey(),
    orderIntentId: integer("orderIntentId").notNull(),
    brokerOrderId: varchar("brokerOrderId", { length: 80 }),
    executionStatus: varchar("executionStatus", { length: 40 }).notNull(),
    filledQuantity: integer("filledQuantity").default(0).notNull(),
    filledPrice: integer("filledPrice"),
    responseJson: json("responseJson"),
    executedAt: timestamp("executedAt").defaultNow().notNull(),
  },
  table => [index("order_executions_intent_idx").on(table.orderIntentId)],
);

export const positionSnapshots = pgTable(
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
    capturedAt: timestamp("capturedAt").defaultNow().notNull(),
  },
  table => [index("position_snapshots_user_idx").on(table.userId, table.capturedAt)],
);

export const paperPortfolios = pgTable(
  "paper_portfolios",
  {
    id: serial("id").primaryKey(),
    userId: integer("userId").notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    initialCash: integer("initialCash").notNull(),
    cashBalance: integer("cashBalance").notNull(),
    status: varchar("status", { length: 50 }).default("active").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [index("paper_portfolios_user_status_idx").on(table.userId, table.status, table.updatedAt)],
);

export const paperPositions = pgTable(
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
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [index("paper_positions_portfolio_status_idx").on(table.portfolioId, table.status, table.updatedAt), index("paper_positions_candidate_idx").on(table.sourceCandidateId)],
);

export const paperPortfolioPriceEvents = pgTable(
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
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("paper_price_events_position_time_idx").on(table.positionId, table.sourceTimestamp), index("paper_price_events_portfolio_time_idx").on(table.portfolioId, table.sourceTimestamp)],
);

/**
 * Research-only configuration. This table never participates in order intent,
 * broker transmission, or paper-portfolio selection.
 */
export const minuteResearchPrograms = pgTable(
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
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("minute_research_program_user_unique").on(table.userId), index("minute_research_program_task_idx").on(table.scheduleCronTaskUid, table.status)],
);

export const minuteResearchSweeps = pgTable(
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
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("minute_research_sweep_run_key_unique").on(table.runKey), index("minute_research_sweep_program_status_idx").on(table.programId, table.status, table.updatedAt)],
);

export const minuteResearchCandidates = pgTable(
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
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("minute_research_candidate_sweep_fingerprint_unique").on(table.sweepId, table.fingerprint), index("minute_research_candidate_sweep_status_idx").on(table.sweepId, table.status, table.fitnessScore), index("minute_research_candidate_strategy_idx").on(table.strategyFingerprint, table.status, table.createdAt)],
);

export const minuteResearchDailyMetrics = pgTable(
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
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("minute_research_daily_metric_unique").on(table.candidateId, table.tradingDate), index("minute_research_daily_metric_sweep_date_idx").on(table.sweepId, table.tradingDate)],
);

/** Promoted research formulas only: per-symbol and market-regime evidence. */
export const minuteResearchSymbolMetrics = pgTable(
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
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("minute_research_symbol_metric_unique").on(table.candidateId, table.tradingDate, table.symbol), index("minute_research_symbol_metric_sweep_regime_idx").on(table.sweepId, table.regime, table.tradingDate)],
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
