ALTER TABLE `spaces` ADD `timeline` text DEFAULT '' NOT NULL;
--> statement-breakpoint
UPDATE `spaces` SET `timeline` = lower(hex(randomblob(16)));
