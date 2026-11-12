CREATE TABLE `items` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`version` integer NOT NULL,
	`deleted_at` integer,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`list_id` text NOT NULL,
	`title` text NOT NULL,
	`quantity` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`position` text NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`list_id`) REFERENCES `lists`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `items_space_version` ON `items` (`space_id`,`version`);--> statement-breakpoint
CREATE INDEX `items_list` ON `items` (`list_id`);--> statement-breakpoint
CREATE TABLE `lists` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`version` integer NOT NULL,
	`deleted_at` integer,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `lists_space_version` ON `lists` (`space_id`,`version`);--> statement-breakpoint
CREATE TABLE `processed_mutations` (
	`mutation_id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`client_id` text,
	`result` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `spaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
