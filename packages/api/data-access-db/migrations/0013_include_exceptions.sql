CREATE TABLE `include_exceptions` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`version` integer NOT NULL,
	`deleted_at` integer,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`include_id` text NOT NULL,
	`target_kind` text NOT NULL,
	`target_id` text NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`include_id`) REFERENCES `includes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `include_exceptions_space_version` ON `include_exceptions` (`space_id`,`version`);--> statement-breakpoint
CREATE INDEX `include_exceptions_include` ON `include_exceptions` (`include_id`);