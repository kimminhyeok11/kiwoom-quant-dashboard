CREATE TABLE `paper_portfolio_price_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`portfolioId` int NOT NULL,
	`positionId` int NOT NULL,
	`eventType` enum('entry','mark','exit') NOT NULL,
	`price` int NOT NULL,
	`source` varchar(48) NOT NULL,
	`sourceTimestamp` timestamp NOT NULL,
	`evidenceJson` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `paper_portfolio_price_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `paper_portfolios` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`initialCash` int NOT NULL,
	`cashBalance` int NOT NULL,
	`status` enum('active','closed') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `paper_portfolios_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `paper_positions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`portfolioId` int NOT NULL,
	`sourceCandidateId` int,
	`symbol` varchar(24) NOT NULL,
	`name` varchar(120) NOT NULL,
	`quantity` int NOT NULL,
	`entryPrice` int NOT NULL,
	`latestPrice` int NOT NULL,
	`unrealizedPnl` int NOT NULL DEFAULT 0,
	`status` enum('open','closed') NOT NULL DEFAULT 'open',
	`openedAt` timestamp NOT NULL DEFAULT (now()),
	`closedAt` timestamp,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `paper_positions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `paper_price_events_position_time_idx` ON `paper_portfolio_price_events` (`positionId`,`sourceTimestamp`);--> statement-breakpoint
CREATE INDEX `paper_price_events_portfolio_time_idx` ON `paper_portfolio_price_events` (`portfolioId`,`sourceTimestamp`);--> statement-breakpoint
CREATE INDEX `paper_portfolios_user_status_idx` ON `paper_portfolios` (`userId`,`status`,`updatedAt`);--> statement-breakpoint
CREATE INDEX `paper_positions_portfolio_status_idx` ON `paper_positions` (`portfolioId`,`status`,`updatedAt`);--> statement-breakpoint
CREATE INDEX `paper_positions_candidate_idx` ON `paper_positions` (`sourceCandidateId`);