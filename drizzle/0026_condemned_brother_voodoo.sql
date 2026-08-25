CREATE TABLE `minute_research_symbol_metrics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sweepId` int NOT NULL,
	`candidateId` int NOT NULL,
	`tradingDate` varchar(10) NOT NULL,
	`symbol` varchar(24) NOT NULL,
	`regime` enum('trend_up','trend_down','range','volatile') NOT NULL,
	`tradeCount` int NOT NULL DEFAULT 0,
	`winRate` decimal(9,4) NOT NULL DEFAULT '0',
	`netReturnPercent` decimal(14,6) NOT NULL DEFAULT '0',
	`expectancyPercent` decimal(14,6) NOT NULL DEFAULT '0',
	`maxDrawdownPercent` decimal(14,6) NOT NULL DEFAULT '0',
	`metricsJson` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `minute_research_symbol_metrics_id` PRIMARY KEY(`id`),
	CONSTRAINT `minute_research_symbol_metric_unique` UNIQUE(`candidateId`,`tradingDate`,`symbol`)
);
--> statement-breakpoint
CREATE INDEX `minute_research_symbol_metric_sweep_regime_idx` ON `minute_research_symbol_metrics` (`sweepId`,`regime`,`tradingDate`);