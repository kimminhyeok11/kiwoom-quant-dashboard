ALTER TABLE `shared_dataset_collection_requests` ADD `progressJson` json;--> statement-breakpoint
ALTER TABLE `shared_dataset_collection_requests` ADD `resumeCount` int DEFAULT 0 NOT NULL;