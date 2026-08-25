CREATE TABLE `strategy_survival_ledgers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`presetId` int NOT NULL,
	`timeframe` enum('daily','five_minute') NOT NULL,
	`status` enum('promoted','observe','rejected') NOT NULL,
	`criteriaJson` json NOT NULL,
	`evidenceJson` json NOT NULL,
	`improvementPlanJson` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `strategy_survival_ledgers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `strategy_survival_ledgers_user_created_idx` ON `strategy_survival_ledgers` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `strategy_survival_ledgers_preset_time_idx` ON `strategy_survival_ledgers` (`presetId`,`timeframe`,`createdAt`);