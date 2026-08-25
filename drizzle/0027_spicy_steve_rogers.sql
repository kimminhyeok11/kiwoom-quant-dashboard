CREATE TABLE `public_strategy_card_collections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`cardId` int NOT NULL,
	`userId` int NOT NULL,
	`presetId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `public_strategy_card_collections_id` PRIMARY KEY(`id`),
	CONSTRAINT `public_strategy_card_collections_card_user_unique` UNIQUE(`cardId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `public_strategy_cards` (
	`id` int AUTO_INCREMENT NOT NULL,
	`creatorUserId` int NOT NULL,
	`sourceCandidateId` int NOT NULL,
	`sourceSweepId` int NOT NULL,
	`strategyFingerprint` varchar(64) NOT NULL,
	`title` varchar(120) NOT NULL,
	`rootGenomeJson` json NOT NULL,
	`minimumScore` int NOT NULL,
	`datasetFingerprint` varchar(64) NOT NULL,
	`arenaEvidenceJson` json NOT NULL,
	`validationEvidenceJson` json NOT NULL,
	`visibility` enum('public','hidden') NOT NULL DEFAULT 'public',
	`publishedAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `public_strategy_cards_id` PRIMARY KEY(`id`),
	CONSTRAINT `public_strategy_cards_source_candidate_unique` UNIQUE(`sourceCandidateId`)
);
--> statement-breakpoint
CREATE INDEX `public_strategy_card_collections_user_idx` ON `public_strategy_card_collections` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `public_strategy_cards_visibility_published_idx` ON `public_strategy_cards` (`visibility`,`publishedAt`);--> statement-breakpoint
CREATE INDEX `public_strategy_cards_creator_idx` ON `public_strategy_cards` (`creatorUserId`,`publishedAt`);