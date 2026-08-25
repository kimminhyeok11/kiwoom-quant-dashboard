CREATE TABLE `local_research_daily_bars` (
	`id` int AUTO_INCREMENT NOT NULL,
	`symbol` varchar(24) NOT NULL,
	`date` varchar(10) NOT NULL,
	`adjustmentBasis` enum('adjusted','unadjusted') NOT NULL,
	`open` int NOT NULL,
	`high` int NOT NULL,
	`low` int NOT NULL,
	`close` int NOT NULL,
	`volume` decimal(20,0) NOT NULL,
	`turnover` decimal(24,0) NOT NULL,
	`source` varchar(40) NOT NULL DEFAULT 'kiwoom_ka10081',
	`rawFingerprint` varchar(64) NOT NULL,
	`capturedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `local_research_daily_bars_id` PRIMARY KEY(`id`),
	CONSTRAINT `local_research_daily_bars_symbol_date_adjustment_unique` UNIQUE(`symbol`,`date`,`adjustmentBasis`)
);
--> statement-breakpoint
CREATE INDEX `local_research_daily_bars_symbol_date_idx` ON `local_research_daily_bars` (`symbol`,`date`,`capturedAt`);