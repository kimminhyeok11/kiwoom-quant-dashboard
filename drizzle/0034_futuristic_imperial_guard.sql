CREATE TABLE `shared_dataset_collection_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`requestedByUserId` int NOT NULL,
	`randomSeed` int NOT NULL,
	`symbolCount` int NOT NULL,
	`sampleDays` int NOT NULL,
	`status` enum('queued','running','completed','failed','cancelled') NOT NULL DEFAULT 'queued',
	`requestFingerprint` varchar(64) NOT NULL,
	`plannedUniverseJson` json,
	`datasetId` int,
	`acceptedDailyBarCount` int NOT NULL DEFAULT 0,
	`acceptedFiveMinuteBarCount` int NOT NULL DEFAULT 0,
	`lastError` varchar(500),
	`requestedAt` timestamp NOT NULL DEFAULT (now()),
	`startedAt` timestamp,
	`completedAt` timestamp,
	CONSTRAINT `shared_dataset_collection_requests_id` PRIMARY KEY(`id`),
	CONSTRAINT `shared_dataset_collection_request_fingerprint_unique` UNIQUE(`requestFingerprint`)
);
--> statement-breakpoint
CREATE INDEX `shared_dataset_collection_request_status_idx` ON `shared_dataset_collection_requests` (`status`,`requestedAt`);--> statement-breakpoint
CREATE INDEX `shared_dataset_collection_request_user_idx` ON `shared_dataset_collection_requests` (`requestedByUserId`,`requestedAt`);