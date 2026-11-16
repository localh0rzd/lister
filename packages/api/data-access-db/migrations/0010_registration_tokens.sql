CREATE TABLE `registration_tokens` (
	`token` text PRIMARY KEY NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `registration_tokens_expires` ON `registration_tokens` (`expires_at`);