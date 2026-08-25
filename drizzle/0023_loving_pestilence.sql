CREATE TABLE `local_minute_collection_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tradingDate` varchar(10) NOT NULL,
	`requestKey` varchar(64) NOT NULL,
	`status` enum('queued','running','completed','failed') NOT NULL DEFAULT 'queued',
	`source` varchar(48) NOT NULL DEFAULT 'public_intraday_monitor',
	`acceptedBarCount` int NOT NULL DEFAULT 0,
	`rejectedBarCount` int NOT NULL DEFAULT 0,
	`lastError` varchar(500),
	`requestedAt` timestamp NOT NULL DEFAULT (now()),
	`startedAt` timestamp,
	`completedAt` timestamp,
	`lastSeenAt` timestamp,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `local_minute_collection_requests_id` PRIMARY KEY(`id`),
	CONSTRAINT `local_minute_collection_request_key_uq` UNIQUE(`requestKey`)
);
--> statement-breakpoint
CREATE INDEX `local_minute_collection_status_time_idx` ON `local_minute_collection_requests` (`status`,`updatedAt`);--> statement-breakpoint
CREATE INDEX `local_minute_collection_date_time_idx` ON `local_minute_collection_requests` (`tradingDate`,`updatedAt`);