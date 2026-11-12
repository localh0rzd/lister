CREATE TABLE `run_items` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`version` integer NOT NULL,
	`deleted_at` integer,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`run_id` text NOT NULL,
	`title` text NOT NULL,
	`quantity` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`position` text NOT NULL,
	`sources` text DEFAULT '[]' NOT NULL,
	`state` text DEFAULT 'unchecked' NOT NULL,
	`state_by` text,
	`state_at` integer,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `run_items_space_version` ON `run_items` (`space_id`,`version`);--> statement-breakpoint
CREATE INDEX `run_items_run` ON `run_items` (`run_id`);--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`version` integer NOT NULL,
	`deleted_at` integer,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`title` text NOT NULL,
	`source_list_id` text,
	`finished_at` integer,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `runs_space_version` ON `runs` (`space_id`,`version`);