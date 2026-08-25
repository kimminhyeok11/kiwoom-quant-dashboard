CREATE TABLE `ranking_refresh_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`presetId` int NOT NULL,
	`universeJson` json NOT NULL,
	`maxPagesPerSymbol` int NOT NULL DEFAULT 3,
	`cronExpression` varchar(48) NOT NULL DEFAULT '0 */15 * * * *',
	`scheduleCronTaskUid` varchar(65),
	`status` enum('idle','running','ready','error','paused') NOT NULL DEFAULT 'idle',
	`lastRunKey` varchar(64),
	`lastRunAt` timestamp,
	`lastCompletedAt` timestamp,
	`lastError` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ranking_refresh_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `ranking_refresh_profiles_user_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE INDEX `ranking_refresh_profiles_task_idx` ON `ranking_refresh_profiles` (`scheduleCronTaskUid`);