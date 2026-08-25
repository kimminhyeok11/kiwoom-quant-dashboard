CREATE TABLE `research_committee_reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`runId` int NOT NULL,
	`sourceRunId` int NOT NULL,
	`evidenceFingerprint` varchar(64) NOT NULL,
	`policyVersion` varchar(40) NOT NULL,
	`model` varchar(80) NOT NULL,
	`status` enum('running','completed','failed') NOT NULL DEFAULT 'running',
	`evidenceJson` json NOT NULL,
	`memberReviewsJson` json,
	`deliberationJson` json,
	`lastError` varchar(500),
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `research_committee_reports_id` PRIMARY KEY(`id`),
	CONSTRAINT `committee_reports_run_evidence_unique` UNIQUE(`runId`,`evidenceFingerprint`)
);
--> statement-breakpoint
CREATE INDEX `committee_reports_run_status_idx` ON `research_committee_reports` (`runId`,`status`,`updatedAt`);