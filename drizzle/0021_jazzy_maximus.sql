CREATE TABLE `local_research_node_sync_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`experimentId` int,
	`tradingDate` varchar(10) NOT NULL,
	`channel` enum('intraday_price') NOT NULL DEFAULT 'intraday_price',
	`status` enum('success','partial','failed') NOT NULL,
	`quoteCount` int NOT NULL DEFAULT 0,
	`rejectedQuoteCount` int NOT NULL DEFAULT 0,
	`message` varchar(500),
	`observedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `local_research_node_sync_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `local_node_sync_experiment_time_idx` ON `local_research_node_sync_events` (`experimentId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `local_node_sync_date_time_idx` ON `local_research_node_sync_events` (`tradingDate`,`createdAt`);