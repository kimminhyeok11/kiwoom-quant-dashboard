CREATE TABLE `research_governance_cycles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`runId` int NOT NULL,
	`committeeReportId` int NOT NULL,
	`evidenceFingerprint` varchar(64) NOT NULL,
	`cycleFingerprint` varchar(64) NOT NULL,
	`policyVersion` varchar(40) NOT NULL,
	`managerModel` varchar(80) NOT NULL,
	`status` enum('running','completed','failed','skipped') NOT NULL DEFAULT 'running',
	`sourceSummaryJson` json NOT NULL,
	`managerDirectiveJson` json,
	`leaderFollowUpsJson` json,
	`lastError` varchar(500),
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `research_governance_cycles_id` PRIMARY KEY(`id`),
	CONSTRAINT `research_governance_cycle_fingerprint_unique` UNIQUE(`cycleFingerprint`)
);
--> statement-breakpoint
CREATE TABLE `research_governance_schedules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`taskUid` varchar(65),
	`scheduleVersion` varchar(40) NOT NULL,
	`cronExpression` varchar(64) NOT NULL,
	`isEnabled` boolean NOT NULL DEFAULT true,
	`latestCycleId` int,
	`lastError` varchar(500),
	`lastRequestedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `research_governance_schedules_id` PRIMARY KEY(`id`),
	CONSTRAINT `research_governance_schedule_task_uid_unique` UNIQUE(`taskUid`)
);
--> statement-breakpoint
CREATE INDEX `research_governance_cycles_run_status_idx` ON `research_governance_cycles` (`runId`,`status`,`updatedAt`);--> statement-breakpoint
CREATE INDEX `research_governance_cycles_committee_idx` ON `research_governance_cycles` (`committeeReportId`,`updatedAt`);