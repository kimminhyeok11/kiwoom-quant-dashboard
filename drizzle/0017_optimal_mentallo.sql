ALTER TABLE `order_intents` ADD `sourceCandidateId` int;--> statement-breakpoint
ALTER TABLE `order_intents` ADD `sourceObservationId` int;--> statement-breakpoint
CREATE INDEX `order_intents_source_observation_idx` ON `order_intents` (`sourceObservationId`);