CREATE TABLE `kiwoom_terminal_connection_checks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`terminalIp` varchar(45) NOT NULL,
	`status` enum('connected','failed') NOT NULL,
	`errorCode` varchar(80),
	`message` varchar(500) NOT NULL,
	`checkedAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `kiwoom_terminal_connection_checks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `kiwoom_terminal_checks_user_time_idx` ON `kiwoom_terminal_connection_checks` (`userId`,`checkedAt`);--> statement-breakpoint
CREATE INDEX `kiwoom_terminal_checks_ip_time_idx` ON `kiwoom_terminal_connection_checks` (`terminalIp`,`checkedAt`);