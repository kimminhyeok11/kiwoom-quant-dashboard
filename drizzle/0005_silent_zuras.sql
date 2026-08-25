CREATE TABLE `hts_condition_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`conditionSequence` varchar(3) NOT NULL,
	`conditionName` varchar(120) NOT NULL,
	`candidatesJson` json NOT NULL,
	`capturedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `hts_condition_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `hts_condition_snapshots_lookup_idx` ON `hts_condition_snapshots` (`userId`,`conditionSequence`,`capturedAt`);