CREATE TEMP TABLE `__thread_history_reset_guard` (
	`has_messages` integer NOT NULL CHECK (`has_messages` = 0)
);--> statement-breakpoint
INSERT INTO `__thread_history_reset_guard` (`has_messages`)
SELECT EXISTS (SELECT 1 FROM `thread_messages` LIMIT 1);--> statement-breakpoint
DROP TABLE `__thread_history_reset_guard`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_thread_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`turn_id` text NOT NULL,
	`parent_message_id` text,
	`active_child_message_id` text,
	`sequence` integer NOT NULL,
	`author` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_thread_messages_thread_id_threads_id_fk` FOREIGN KEY (`thread_id`) REFERENCES `threads`(`id`) ON DELETE CASCADE,
	CONSTRAINT `thread_messages_turn_fk` FOREIGN KEY (`thread_id`,`turn_id`) REFERENCES `turns`(`thread_id`,`id`) ON DELETE CASCADE,
	CONSTRAINT `thread_messages_parent_fk` FOREIGN KEY (`thread_id`,`parent_message_id`) REFERENCES `thread_messages`(`thread_id`,`id`),
	CONSTRAINT `thread_messages_active_child_fk` FOREIGN KEY (`thread_id`,`id`,`active_child_message_id`) REFERENCES `thread_messages`(`thread_id`,`parent_message_id`,`id`),
	CONSTRAINT "thread_messages_sequence_positive" CHECK("sequence" > 0),
	CONSTRAINT "thread_messages_author_valid" CHECK("author" IN ('user', 'assistant')),
	CONSTRAINT "thread_messages_parent_valid" CHECK("author" = 'user' OR "parent_message_id" IS NOT NULL),
	CONSTRAINT "thread_messages_content_valid" CHECK(length(trim("content")) > 0 AND length("content") <= 100000),
	CONSTRAINT "thread_messages_created_at_nonnegative" CHECK("created_at" >= 0)
);
--> statement-breakpoint
DROP TABLE `thread_messages`;--> statement-breakpoint
ALTER TABLE `__new_thread_messages` RENAME TO `thread_messages`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `thread_messages_thread_sequence_unique` ON `thread_messages` (`thread_id`,`sequence`);--> statement-breakpoint
CREATE UNIQUE INDEX `thread_messages_thread_id_unique` ON `thread_messages` (`thread_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `thread_messages_thread_parent_id_unique` ON `thread_messages` (`thread_id`,`parent_message_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `thread_messages_turn_id_unique` ON `thread_messages` (`turn_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `thread_messages_turn_user_unique` ON `thread_messages` (`turn_id`) WHERE "thread_messages"."author" = 'user';
