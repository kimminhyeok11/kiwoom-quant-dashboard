CREATE TABLE `research_daily_bars` (
	`id` int AUTO_INCREMENT NOT NULL,
	`datasetId` int NOT NULL,
	`symbol` varchar(24) NOT NULL,
	`date` varchar(10) NOT NULL,
	`open` int NOT NULL,
	`high` int NOT NULL,
	`low` int NOT NULL,
	`close` int NOT NULL,
	`volume` decimal(20,0) NOT NULL,
	`turnover` decimal(24,0) NOT NULL,
	`source` varchar(40) NOT NULL DEFAULT 'kiwoom_ka10081',
	`capturedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `research_daily_bars_id` PRIMARY KEY(`id`),
	CONSTRAINT `research_daily_bars_dataset_symbol_date_unique` UNIQUE(`datasetId`,`symbol`,`date`)
);
--> statement-breakpoint
CREATE INDEX `research_daily_bars_dataset_symbol_date_idx` ON `research_daily_bars` (`datasetId`,`symbol`,`date`);