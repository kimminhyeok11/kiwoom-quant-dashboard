CREATE TABLE `autonomous_research_bars` (
	`id` int AUTO_INCREMENT NOT NULL,
	`runId` int NOT NULL,
	`symbol` varchar(24) NOT NULL,
	`date` varchar(10) NOT NULL,
	`open` int NOT NULL,
	`high` int NOT NULL,
	`low` int NOT NULL,
	`close` int NOT NULL,
	`volume` decimal(20,0) NOT NULL,
	`turnover` decimal(24,0) NOT NULL,
	`source` varchar(48) NOT NULL DEFAULT 'kiwoom_ka10081',
	`capturedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `autonomous_research_bars_id` PRIMARY KEY(`id`),
	CONSTRAINT `auto_bars_run_symbol_date_uq` UNIQUE(`runId`,`symbol`,`date`)
);
--> statement-breakpoint
CREATE INDEX `auto_bars_run_symbol_date_idx` ON `autonomous_research_bars` (`runId`,`symbol`,`date`);