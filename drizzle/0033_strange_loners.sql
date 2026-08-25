CREATE TABLE `research_five_minute_bars` (
	`id` int AUTO_INCREMENT NOT NULL,
	`datasetId` int NOT NULL,
	`symbol` varchar(24) NOT NULL,
	`tradingDate` varchar(10) NOT NULL,
	`intervalAt` timestamp NOT NULL,
	`open` int NOT NULL,
	`high` int NOT NULL,
	`low` int NOT NULL,
	`close` int NOT NULL,
	`volume` decimal(20,0) NOT NULL,
	`source` varchar(48) NOT NULL DEFAULT 'kiwoom_ka10080_5m_aggregate',
	`rawFingerprint` varchar(64) NOT NULL,
	`capturedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `research_five_minute_bars_id` PRIMARY KEY(`id`),
	CONSTRAINT `research_five_minute_dataset_symbol_time_unique` UNIQUE(`datasetId`,`symbol`,`intervalAt`)
);
--> statement-breakpoint
CREATE TABLE `shared_dataset_backtests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`datasetId` int NOT NULL,
	`presetId` int NOT NULL,
	`timeframe` enum('daily','five_minute') NOT NULL,
	`symbol` varchar(24) NOT NULL,
	`assumptionsJson` json NOT NULL,
	`resultsJson` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `shared_dataset_backtests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `research_datasets` MODIFY COLUMN `source` enum('kiwoom_daily','kiwoom_daily_five_minute') NOT NULL DEFAULT 'kiwoom_daily';--> statement-breakpoint
ALTER TABLE `research_datasets` ADD `visibility` enum('private','shared_public') DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE `research_datasets` ADD `randomSeed` int;--> statement-breakpoint
ALTER TABLE `research_datasets` ADD `sourceFingerprint` varchar(64);--> statement-breakpoint
ALTER TABLE `research_datasets` ADD `minuteBarCount` int DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `research_five_minute_dataset_symbol_date_idx` ON `research_five_minute_bars` (`datasetId`,`symbol`,`tradingDate`);--> statement-breakpoint
CREATE INDEX `shared_dataset_backtests_user_created_idx` ON `shared_dataset_backtests` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `shared_dataset_backtests_dataset_created_idx` ON `shared_dataset_backtests` (`datasetId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `research_datasets_public_ready_idx` ON `research_datasets` (`visibility`,`qualityStatus`,`readyAt`);--> statement-breakpoint
CREATE INDEX `research_datasets_source_fingerprint_idx` ON `research_datasets` (`sourceFingerprint`);