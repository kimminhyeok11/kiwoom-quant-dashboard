CREATE TABLE `public_strategy_card_comments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`cardId` int NOT NULL,
	`userId` int NOT NULL,
	`body` varchar(800) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `public_strategy_card_comments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `public_strategy_card_favorites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`cardId` int NOT NULL,
	`userId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `public_strategy_card_favorites_id` PRIMARY KEY(`id`),
	CONSTRAINT `public_strategy_card_favorites_card_user_unique` UNIQUE(`cardId`,`userId`)
);
--> statement-breakpoint
CREATE INDEX `public_strategy_card_comments_card_created_idx` ON `public_strategy_card_comments` (`cardId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `public_strategy_card_comments_user_idx` ON `public_strategy_card_comments` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `public_strategy_card_favorites_card_created_idx` ON `public_strategy_card_favorites` (`cardId`,`createdAt`);