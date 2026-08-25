CREATE TABLE `intraday_minute_bars` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tradingDate` varchar(10) NOT NULL,
	`symbol` varchar(24) NOT NULL,
	`minuteAt` timestamp NOT NULL,
	`open` int NOT NULL,
	`high` int NOT NULL,
	`low` int NOT NULL,
	`close` int NOT NULL,
	`volume` decimal(20,0) NOT NULL,
	`source` varchar(48) NOT NULL DEFAULT 'kiwoom_ka10080',
	`rawFingerprint` varchar(64) NOT NULL,
	`capturedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `intraday_minute_bars_id` PRIMARY KEY(`id`),
	CONSTRAINT `intraday_minute_bar_date_symbol_time_uq` UNIQUE(`tradingDate`,`symbol`,`minuteAt`)
);
--> statement-breakpoint
CREATE INDEX `intraday_minute_bar_symbol_time_idx` ON `intraday_minute_bars` (`symbol`,`minuteAt`);--> statement-breakpoint
CREATE INDEX `intraday_minute_bar_date_captured_idx` ON `intraday_minute_bars` (`tradingDate`,`capturedAt`);