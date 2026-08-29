CREATE TABLE `thread_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`author` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_thread_messages_thread_id_threads_id_fk` FOREIGN KEY (`thread_id`) REFERENCES `threads`(`id`) ON DELETE CASCADE,
	CONSTRAINT "thread_messages_sequence_positive" CHECK("sequence" > 0),
	CONSTRAINT "thread_messages_author_valid" CHECK("author" IN ('user', 'assistant')),
	CONSTRAINT "thread_messages_content_valid" CHECK(length(trim("content")) > 0 AND length("content") <= 100000),
	CONSTRAINT "thread_messages_created_at_nonnegative" CHECK("created_at" >= 0)
);
--> statement-breakpoint
CREATE TABLE `threads` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`last_message_sequence` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "threads_created_at_nonnegative" CHECK("created_at" >= 0),
	CONSTRAINT "threads_last_message_sequence_nonnegative" CHECK("last_message_sequence" >= 0)
);
--> statement-breakpoint
ALTER TABLE `campaigns` ADD `thread_id` text NOT NULL REFERENCES threads(id);--> statement-breakpoint
CREATE UNIQUE INDEX `campaigns_thread_unique` ON `campaigns` (`thread_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `thread_messages_thread_sequence_unique` ON `thread_messages` (`thread_id`,`sequence`);