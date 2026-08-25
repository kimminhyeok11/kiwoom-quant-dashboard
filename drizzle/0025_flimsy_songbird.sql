CREATE TABLE `minute_research_candidates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sweepId` int NOT NULL,
	`strategyFingerprint` varchar(64) NOT NULL,
	`fingerprint` varchar(64) NOT NULL,
	`rootGenomeJson` json NOT NULL,
	`minimumScore` int NOT NULL,
	`status` enum('evaluated','promoted','rejected','insufficient_validation','failed') NOT NULL DEFAULT 'evaluated',
	`fitnessScore` decimal(14,6) NOT NULL,
	`tradeCount` int NOT NULL DEFAULT 0,
	`winRate` decimal(9,4) NOT NULL DEFAULT '0',
	`netReturnPercent` decimal(14,6) NOT NULL DEFAULT '0',
	`expectancyPercent` decimal(14,6) NOT NULL DEFAULT '0',
	`maxDrawdownPercent` decimal(14,6) NOT NULL DEFAULT '0',
	`validationTradeCount` int NOT NULL DEFAULT 0,
	`validationReturnPercent` decimal(14,6) NOT NULL DEFAULT '0',
	`validationExpectancyPercent` decimal(14,6) NOT NULL DEFAULT '0',
	`validationMaxDrawdownPercent` decimal(14,6) NOT NULL DEFAULT '0',
	`inSampleMetricsJson` json NOT NULL,
	`outOfSampleMetricsJson` json,
	`qualificationJson` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `minute_research_candidates_id` PRIMARY KEY(`id`),
	CONSTRAINT `minute_research_candidate_sweep_fingerprint_unique` UNIQUE(`sweepId`,`fingerprint`)
);
--> statement-breakpoint
CREATE TABLE `minute_research_daily_metrics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sweepId` int NOT NULL,
	`candidateId` int NOT NULL,
	`tradingDate` varchar(10) NOT NULL,
	`symbolCount` int NOT NULL DEFAULT 0,
	`tradeCount` int NOT NULL DEFAULT 0,
	`winRate` decimal(9,4) NOT NULL DEFAULT '0',
	`netReturnPercent` decimal(14,6) NOT NULL DEFAULT '0',
	`expectancyPercent` decimal(14,6) NOT NULL DEFAULT '0',
	`maxDrawdownPercent` decimal(14,6) NOT NULL DEFAULT '0',
	`metricsJson` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `minute_research_daily_metrics_id` PRIMARY KEY(`id`),
	CONSTRAINT `minute_research_daily_metric_unique` UNIQUE(`candidateId`,`tradingDate`)
);
--> statement-breakpoint
CREATE TABLE `minute_research_programs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`status` enum('active','paused') NOT NULL DEFAULT 'active',
	`cronExpression` varchar(64) NOT NULL,
	`scheduleCronTaskUid` varchar(65),
	`configurationJson` json NOT NULL,
	`lastSweepId` int,
	`lastError` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `minute_research_programs_id` PRIMARY KEY(`id`),
	CONSTRAINT `minute_research_program_user_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `minute_research_sweeps` (
	`id` int AUTO_INCREMENT NOT NULL,
	`programId` int NOT NULL,
	`runKey` varchar(128) NOT NULL,
	`tradingDatesJson` json NOT NULL,
	`datasetFingerprint` varchar(64) NOT NULL,
	`configurationJson` json NOT NULL,
	`status` enum('queued','running','completed','waiting_for_data','failed') NOT NULL DEFAULT 'queued',
	`generatedCount` int NOT NULL DEFAULT 0,
	`evaluatedCount` int NOT NULL DEFAULT 0,
	`promotedCount` int NOT NULL DEFAULT 0,
	`rejectedCount` int NOT NULL DEFAULT 0,
	`summaryJson` json,
	`lastError` varchar(500),
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `minute_research_sweeps_id` PRIMARY KEY(`id`),
	CONSTRAINT `minute_research_sweep_run_key_unique` UNIQUE(`runKey`)
);
--> statement-breakpoint
CREATE INDEX `minute_research_candidate_sweep_status_idx` ON `minute_research_candidates` (`sweepId`,`status`,`fitnessScore`);--> statement-breakpoint
CREATE INDEX `minute_research_candidate_strategy_idx` ON `minute_research_candidates` (`strategyFingerprint`,`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `minute_research_daily_metric_sweep_date_idx` ON `minute_research_daily_metrics` (`sweepId`,`tradingDate`);--> statement-breakpoint
CREATE INDEX `minute_research_program_task_idx` ON `minute_research_programs` (`scheduleCronTaskUid`,`status`);--> statement-breakpoint
CREATE INDEX `minute_research_sweep_program_status_idx` ON `minute_research_sweeps` (`programId`,`status`,`updatedAt`);