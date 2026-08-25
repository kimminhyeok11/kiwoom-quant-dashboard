CREATE TABLE `backtest_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`presetId` int NOT NULL,
	`status` enum('queued','running','completed','failed') NOT NULL DEFAULT 'queued',
	`startDate` varchar(10) NOT NULL,
	`endDate` varchar(10) NOT NULL,
	`initialCapital` int NOT NULL,
	`totalReturn` decimal(8,3),
	`winRate` decimal(6,2),
	`tradeCount` int,
	`maxDrawdown` decimal(8,3),
	`resultsJson` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `backtest_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `order_executions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderIntentId` int NOT NULL,
	`brokerOrderId` varchar(80),
	`executionStatus` varchar(40) NOT NULL,
	`filledQuantity` int NOT NULL DEFAULT 0,
	`filledPrice` int,
	`responseJson` json,
	`executedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `order_executions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `order_intents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`presetId` int,
	`symbol` varchar(24) NOT NULL,
	`name` varchar(120) NOT NULL,
	`side` enum('buy','sell') NOT NULL,
	`orderType` enum('market','limit') NOT NULL DEFAULT 'limit',
	`quantity` int NOT NULL,
	`price` int NOT NULL,
	`amount` int NOT NULL,
	`status` enum('pending_confirmation','confirmed','blocked','submitted','filled','rejected','cancelled') NOT NULL DEFAULT 'pending_confirmation',
	`riskReasonsJson` json,
	`confirmationNonce` varchar(64),
	`confirmedAt` timestamp,
	`brokerOrderId` varchar(80),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `order_intents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `position_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`symbol` varchar(24) NOT NULL,
	`name` varchar(120) NOT NULL,
	`quantity` int NOT NULL,
	`averagePrice` int NOT NULL,
	`currentPrice` int NOT NULL,
	`profitLoss` int NOT NULL,
	`profitLossRate` decimal(8,3) NOT NULL,
	`capturedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `position_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ranking_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`presetId` int NOT NULL,
	`symbol` varchar(24) NOT NULL,
	`name` varchar(120) NOT NULL,
	`score` decimal(8,2) NOT NULL,
	`price` int NOT NULL,
	`changeRate` decimal(7,3) NOT NULL,
	`matchedRulesJson` json NOT NULL,
	`capturedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ranking_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `strategy_presets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`description` varchar(500),
	`rulesJson` json NOT NULL,
	`scoringJson` json,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `strategy_presets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `trading_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`environment` enum('mock','live') NOT NULL DEFAULT 'mock',
	`accountNumberMasked` varchar(32),
	`tokenExpiresAt` timestamp,
	`connectionStatus` enum('disconnected','ready','error') NOT NULL DEFAULT 'disconnected',
	`refreshIntervalSeconds` int NOT NULL DEFAULT 60,
	`maxBuyAmount` int NOT NULL DEFAULT 500000,
	`dailyTradeLimit` int NOT NULL DEFAULT 3,
	`killSwitch` boolean NOT NULL DEFAULT true,
	`autoTradeEnabled` boolean NOT NULL DEFAULT false,
	`requireConfirmation` boolean NOT NULL DEFAULT true,
	`scheduleCronTaskUid` varchar(65),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `trading_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `trading_profiles_user_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE INDEX `backtest_runs_user_idx` ON `backtest_runs` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `order_executions_intent_idx` ON `order_executions` (`orderIntentId`);--> statement-breakpoint
CREATE INDEX `order_intents_user_status_idx` ON `order_intents` (`userId`,`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `position_snapshots_user_idx` ON `position_snapshots` (`userId`,`capturedAt`);--> statement-breakpoint
CREATE INDEX `ranking_snapshots_lookup_idx` ON `ranking_snapshots` (`userId`,`presetId`,`capturedAt`);--> statement-breakpoint
CREATE INDEX `strategy_presets_user_idx` ON `strategy_presets` (`userId`);