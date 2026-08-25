ALTER TABLE `order_intents` ADD `autoPolicyId` int;--> statement-breakpoint
ALTER TABLE `order_intents` ADD `autoPolicyVersion` int;--> statement-breakpoint
ALTER TABLE `order_intents` ADD `autoPolicySnapshotJson` json;--> statement-breakpoint
ALTER TABLE `order_intents` ADD `executionOrigin` enum('manual','local_node') DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `order_intents` ADD `dedupeKey` varchar(160);--> statement-breakpoint
ALTER TABLE `order_intents` ADD CONSTRAINT `order_intents_user_dedupe_unique` UNIQUE(`userId`,`dedupeKey`);