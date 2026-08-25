ALTER TABLE `public_strategy_cards` ADD `version` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `public_strategy_cards` ADD `parentCardId` int;