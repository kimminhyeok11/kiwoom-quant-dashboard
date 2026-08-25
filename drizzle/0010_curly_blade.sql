CREATE TABLE `autonomous_research_candidates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`runId` int NOT NULL,
	`fingerprint` varchar(64) NOT NULL,
	`rootGenomeJson` json NOT NULL,
	`minimumScore` int NOT NULL,
	`generationNumber` int NOT NULL DEFAULT 0,
	`status` enum('generated','evaluating','tracking','survived','rejected','waiting_for_data','failed') NOT NULL DEFAULT 'generated',
	`inSampleMetricsJson` json,
	`outOfSampleMetricsJson` json,
	`walkForwardMetricsJson` json,
	`simulationJson` json,
	`fitnessScore` decimal(12,6),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`evaluatedAt` timestamp,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `autonomous_research_candidates_id` PRIMARY KEY(`id`),
	CONSTRAINT `autonomous_research_candidates_run_fingerprint_unique` UNIQUE(`runId`,`fingerprint`)
);
--> statement-breakpoint
CREATE TABLE `autonomous_research_observations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`runId` int NOT NULL,
	`candidateId` int,
	`symbol` varchar(24) NOT NULL,
	`name` varchar(120),
	`price` int NOT NULL,
	`changeRate` decimal(7,3),
	`source` varchar(48) NOT NULL,
	`capturedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `autonomous_research_observations_id` PRIMARY KEY(`id`),
	CONSTRAINT `auto_obs_run_cand_symbol_time_uq` UNIQUE(`runId`,`candidateId`,`symbol`,`capturedAt`)
);
--> statement-breakpoint
CREATE TABLE `autonomous_research_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tradingDate` varchar(10) NOT NULL,
	`phase` enum('preparing','opening','intraday','closing','completed','waiting_for_data','incomplete','failed') NOT NULL DEFAULT 'preparing',
	`runKey` varchar(96) NOT NULL,
	`dataStatus` enum('pending','ready','waiting','incomplete','error') NOT NULL DEFAULT 'pending',
	`universeJson` json,
	`policyVersion` varchar(40) NOT NULL,
	`summaryJson` json,
	`lastError` varchar(500),
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`lastObservedAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `autonomous_research_runs_id` PRIMARY KEY(`id`),
	CONSTRAINT `autonomous_research_runs_run_key_unique` UNIQUE(`runKey`)
);
--> statement-breakpoint
CREATE INDEX `autonomous_research_candidates_run_status_idx` ON `autonomous_research_candidates` (`runId`,`status`);--> statement-breakpoint
CREATE INDEX `autonomous_research_candidates_run_fitness_idx` ON `autonomous_research_candidates` (`runId`,`fitnessScore`);--> statement-breakpoint
CREATE INDEX `auto_obs_run_time_idx` ON `autonomous_research_observations` (`runId`,`capturedAt`);--> statement-breakpoint
CREATE INDEX `autonomous_research_runs_date_phase_idx` ON `autonomous_research_runs` (`tradingDate`,`phase`,`updatedAt`);
