CREATE TABLE `research_revalidation_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`governanceCycleId` int NOT NULL,
	`sourceRunId` int NOT NULL,
	`priorityId` varchar(80) NOT NULL,
	`priorityTitle` varchar(240) NOT NULL,
	`evidenceFingerprint` varchar(64) NOT NULL,
	`jobFingerprint` varchar(64) NOT NULL,
	`scope` enum('stored_daily_bars','external_verification') NOT NULL,
	`status` enum('queued','running','completed','blocked','failed') NOT NULL DEFAULT 'queued',
	`acceptanceCriteria` text NOT NULL,
	`blocker` varchar(500),
	`resultJson` json,
	`lastError` varchar(500),
	`startedAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `research_revalidation_jobs_id` PRIMARY KEY(`id`),
	CONSTRAINT `research_revalidation_job_fingerprint_unique` UNIQUE(`jobFingerprint`)
);
--> statement-breakpoint
CREATE INDEX `research_revalidation_cycle_status_idx` ON `research_revalidation_jobs` (`governanceCycleId`,`status`,`updatedAt`);--> statement-breakpoint
CREATE INDEX `research_revalidation_source_priority_idx` ON `research_revalidation_jobs` (`sourceRunId`,`priorityId`);