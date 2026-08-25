CREATE TABLE `research_datasets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`source` enum('kiwoom_daily') NOT NULL DEFAULT 'kiwoom_daily',
	`versionKey` varchar(80) NOT NULL,
	`universeJson` json NOT NULL,
	`startDate` varchar(10) NOT NULL,
	`endDate` varchar(10) NOT NULL,
	`barCount` int NOT NULL DEFAULT 0,
	`adjustmentBasis` enum('adjusted','unadjusted','unknown') NOT NULL DEFAULT 'unknown',
	`qualityStatus` enum('draft','collecting','ready','error') NOT NULL DEFAULT 'draft',
	`qualityReportJson` json,
	`sourceCapturedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`readyAt` timestamp,
	CONSTRAINT `research_datasets_id` PRIMARY KEY(`id`),
	CONSTRAINT `research_datasets_user_version_unique` UNIQUE(`userId`,`versionKey`)
);
--> statement-breakpoint
CREATE TABLE `research_experiments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`datasetId` int NOT NULL,
	`presetId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`strategySnapshotJson` json NOT NULL,
	`assumptionsJson` json NOT NULL,
	`informationCutoffTradingDays` int NOT NULL DEFAULT 1,
	`trainingStartDate` varchar(10),
	`trainingEndDate` varchar(10),
	`validationStartDate` varchar(10),
	`validationEndDate` varchar(10),
	`status` enum('draft','queued','running','completed','failed') NOT NULL DEFAULT 'draft',
	`resultsJson` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `research_experiments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `walk_forward_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`experimentId` int NOT NULL,
	`status` enum('queued','running','completed','failed') NOT NULL DEFAULT 'queued',
	`configurationJson` json NOT NULL,
	`resultsJson` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `walk_forward_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `research_datasets_user_status_idx` ON `research_datasets` (`userId`,`qualityStatus`,`createdAt`);--> statement-breakpoint
CREATE INDEX `research_experiments_user_created_idx` ON `research_experiments` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `research_experiments_dataset_idx` ON `research_experiments` (`datasetId`,`status`);--> statement-breakpoint
CREATE INDEX `walk_forward_runs_user_created_idx` ON `walk_forward_runs` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `walk_forward_runs_experiment_idx` ON `walk_forward_runs` (`experimentId`,`status`);