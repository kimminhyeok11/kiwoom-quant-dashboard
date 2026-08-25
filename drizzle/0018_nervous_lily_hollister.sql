CREATE TABLE `day_trade_experiment_positions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`experimentId` int NOT NULL,
	`candidateId` int NOT NULL,
	`candidateFingerprint` varchar(64) NOT NULL,
	`symbol` varchar(24) NOT NULL,
	`name` varchar(120) NOT NULL,
	`signalCount` int NOT NULL DEFAULT 1,
	`quantity` int NOT NULL,
	`allocation` int NOT NULL,
	`entryPrice` int NOT NULL,
	`entryAt` timestamp NOT NULL,
	`lastPrice` int,
	`lastObservedAt` timestamp,
	`exitPrice` int,
	`exitAt` timestamp,
	`buyFee` int NOT NULL DEFAULT 0,
	`estimatedExitFee` int NOT NULL DEFAULT 0,
	`netValue` int NOT NULL DEFAULT 0,
	`netPnl` int NOT NULL DEFAULT 0,
	`netReturnPercent` decimal(10,4) NOT NULL DEFAULT '0',
	`status` enum('tracking','closed','cash_only') NOT NULL DEFAULT 'tracking',
	`evidenceJson` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `day_trade_experiment_positions_id` PRIMARY KEY(`id`),
	CONSTRAINT `day_trade_position_experiment_symbol_unique` UNIQUE(`experimentId`,`symbol`)
);
--> statement-breakpoint
CREATE TABLE `day_trade_experiments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`runId` int NOT NULL,
	`tradingDate` varchar(10) NOT NULL,
	`policyVersion` varchar(40) NOT NULL,
	`status` enum('tracking','closed') NOT NULL DEFAULT 'tracking',
	`totalCapital` int NOT NULL,
	`buyFeeRate` decimal(8,6) NOT NULL,
	`sellFeeRate` decimal(8,6) NOT NULL,
	`signalCount` int NOT NULL DEFAULT 0,
	`selectedPositionCount` int NOT NULL DEFAULT 0,
	`netValue` int NOT NULL DEFAULT 0,
	`netPnl` int NOT NULL DEFAULT 0,
	`netReturnPercent` decimal(10,4) NOT NULL DEFAULT '0',
	`sourceFingerprint` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`closedAt` timestamp,
	CONSTRAINT `day_trade_experiments_id` PRIMARY KEY(`id`),
	CONSTRAINT `day_trade_experiments_run_unique` UNIQUE(`runId`)
);
--> statement-breakpoint
CREATE INDEX `day_trade_positions_candidate_idx` ON `day_trade_experiment_positions` (`candidateId`,`updatedAt`);--> statement-breakpoint
CREATE INDEX `day_trade_positions_experiment_status_idx` ON `day_trade_experiment_positions` (`experimentId`,`status`,`updatedAt`);--> statement-breakpoint
CREATE INDEX `day_trade_experiments_date_status_idx` ON `day_trade_experiments` (`tradingDate`,`status`,`updatedAt`);