CREATE TABLE `auto_trade_policies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`version` int NOT NULL,
	`status` enum('active','superseded','paused') NOT NULL DEFAULT 'active',
	`totalCapital` int NOT NULL,
	`maxConcurrentPositions` int NOT NULL,
	`stopLossPercent` decimal(8,4) NOT NULL,
	`takeProfitPercent` decimal(8,4) NOT NULL,
	`dailyLossLimitPercent` decimal(8,4) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `auto_trade_policies_id` PRIMARY KEY(`id`),
	CONSTRAINT `auto_trade_policies_user_version_unique` UNIQUE(`userId`,`version`)
);
--> statement-breakpoint
CREATE INDEX `auto_trade_policies_user_status_idx` ON `auto_trade_policies` (`userId`,`status`,`updatedAt`);