CREATE TABLE `autonomous_research_tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`runId` int NOT NULL,
	`runKey` varchar(96) NOT NULL,
	`phase` enum('preparing','opening','intraday','closing') NOT NULL,
	`status` enum('running','completed','waiting_for_data','failed') NOT NULL DEFAULT 'running',
	`resultJson` json,
	`lastError` varchar(500),
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `autonomous_research_tasks_id` PRIMARY KEY(`id`),
	CONSTRAINT `auto_research_tasks_run_key_uq` UNIQUE(`runKey`)
);
--> statement-breakpoint
CREATE INDEX `auto_research_tasks_run_phase_idx` ON `autonomous_research_tasks` (`runId`,`phase`,`startedAt`);