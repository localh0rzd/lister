CREATE TABLE `includes` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`version` integer NOT NULL,
	`deleted_at` integer,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`parent_list_id` text NOT NULL,
	`child_list_id` text NOT NULL,
	`position` text NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`parent_list_id`) REFERENCES `lists`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`child_list_id`) REFERENCES `lists`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `includes_space_version` ON `includes` (`space_id`,`version`);--> statement-breakpoint
CREATE INDEX `includes_parent` ON `includes` (`parent_list_id`);--> statement-breakpoint
CREATE INDEX `includes_child` ON `includes` (`child_list_id`);