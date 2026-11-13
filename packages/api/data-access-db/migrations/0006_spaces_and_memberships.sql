CREATE TABLE `memberships` (
	`space_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`space_id`, `user_id`),
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `memberships_user` ON `memberships` (`user_id`);--> statement-breakpoint
ALTER TABLE `spaces` ADD `personal` integer DEFAULT false NOT NULL;--> statement-breakpoint
-- Accounts created before spaces existed get their personal space.
CREATE TEMP TABLE `personal_backfill` AS
SELECT `id` AS `user_id`, `display_name`, `created_at`, hex(randomblob(16)) AS `h` FROM `users`;
--> statement-breakpoint
INSERT INTO `spaces` (`id`, `name`, `personal`, `version`, `created_at`)
SELECT lower(substr(`h`, 1, 8) || '-' || substr(`h`, 9, 4) || '-4' || substr(`h`, 14, 3) || '-a' || substr(`h`, 18, 3) || '-' || substr(`h`, 21, 12)),
  `display_name`, 1, 0, `created_at`
FROM `personal_backfill`;
--> statement-breakpoint
INSERT INTO `memberships` (`space_id`, `user_id`, `role`, `created_at`)
SELECT lower(substr(`h`, 1, 8) || '-' || substr(`h`, 9, 4) || '-4' || substr(`h`, 14, 3) || '-a' || substr(`h`, 18, 3) || '-' || substr(`h`, 21, 12)),
  `user_id`, 'owner', `created_at`
FROM `personal_backfill`;
--> statement-breakpoint
DROP TABLE `personal_backfill`;
