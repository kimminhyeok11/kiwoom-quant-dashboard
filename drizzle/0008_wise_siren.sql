CREATE TABLE `evolution_candidates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`searchId` int NOT NULL,
	`generationId` int NOT NULL,
	`fingerprint` varchar(64) NOT NULL,
	`rootGenomeJson` json NOT NULL,
	`minimumScore` int NOT NULL,
	`origin` enum('seed','elite','crossover','mutation','manual_expand') NOT NULL,
	`parentCandidateIdsJson` json,
	`mutationJson` json,
	`inSampleMetricsJson` json,
	`outOfSampleMetricsJson` json,
	`fitnessScore` decimal(12,6),
	`status` enum('created','evaluated','survived','rejected','failed') NOT NULL DEFAULT 'created',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`evaluatedAt` timestamp,
	CONSTRAINT `evolution_candidates_id` PRIMARY KEY(`id`),
	CONSTRAINT `evolution_candidates_search_fingerprint_unique` UNIQUE(`searchId`,`fingerprint`)
);
--> statement-breakpoint
CREATE TABLE `evolution_generations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`searchId` int NOT NULL,
	`generationNumber` int NOT NULL,
	`populationSize` int NOT NULL,
	`uniqueCandidateCount` int NOT NULL DEFAULT 0,
	`survivorCount` int NOT NULL DEFAULT 0,
	`status` enum('queued','generating','evaluating','completed','failed') NOT NULL DEFAULT 'queued',
	`selectionSummaryJson` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `evolution_generations_id` PRIMARY KEY(`id`),
	CONSTRAINT `evolution_generations_search_number_unique` UNIQUE(`searchId`,`generationNumber`)
);
--> statement-breakpoint
CREATE TABLE `evolution_searches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`datasetId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`randomSeed` int NOT NULL,
	`configurationJson` json NOT NULL,
	`status` enum('draft','queued','running','completed','failed','cancelled') NOT NULL DEFAULT 'draft',
	`summaryJson` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `evolution_searches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `evolution_candidates_generation_status_idx` ON `evolution_candidates` (`generationId`,`status`);--> statement-breakpoint
CREATE INDEX `evolution_candidates_search_fitness_idx` ON `evolution_candidates` (`searchId`,`fitnessScore`);--> statement-breakpoint
CREATE INDEX `evolution_generations_search_status_idx` ON `evolution_generations` (`searchId`,`status`);--> statement-breakpoint
CREATE INDEX `evolution_searches_user_created_idx` ON `evolution_searches` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `evolution_searches_dataset_status_idx` ON `evolution_searches` (`datasetId`,`status`);