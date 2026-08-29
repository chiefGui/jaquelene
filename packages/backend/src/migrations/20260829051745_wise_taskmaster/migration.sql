CREATE TABLE `generations` (
	`id` text PRIMARY KEY NOT NULL,
	`turn_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`model_id` text NOT NULL,
	`status` text NOT NULL,
	`failure_kind` text,
	`provider_generation_id` text,
	`resolved_model_id` text,
	`finish_reason` text,
	`input_tokens` integer,
	`output_tokens` integer,
	`total_tokens` integer,
	`output_message_id` text,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	CONSTRAINT `fk_generations_turn_id_turns_id_fk` FOREIGN KEY (`turn_id`) REFERENCES `turns`(`id`) ON DELETE CASCADE,
	CONSTRAINT `generations_output_message_fk` FOREIGN KEY (`turn_id`,`output_message_id`) REFERENCES `thread_messages`(`turn_id`,`id`),
	CONSTRAINT "generations_model_reference_valid" CHECK(length(trim("provider_id")) > 0 AND length(trim("model_id")) > 0),
	CONSTRAINT "generations_status_valid" CHECK("status" IN ('pending', 'completed', 'failed')),
	CONSTRAINT "generations_failure_kind_valid" CHECK("failure_kind" IS NULL OR "failure_kind" IN ('prompt', 'provider', 'invalid-output', 'interrupted', 'storage')),
	CONSTRAINT "generations_provider_result_valid" CHECK(("provider_generation_id" IS NULL OR length(trim("provider_generation_id")) > 0)
        AND ("resolved_model_id" IS NULL OR length(trim("resolved_model_id")) > 0)
        AND ("finish_reason" IS NULL OR length(trim("finish_reason")) > 0)),
	CONSTRAINT "generations_usage_valid" CHECK(("input_tokens" IS NULL AND "output_tokens" IS NULL AND "total_tokens" IS NULL)
        OR ("input_tokens" IS NOT NULL
          AND "output_tokens" IS NOT NULL
          AND "total_tokens" IS NOT NULL
          AND "input_tokens" >= 0
          AND "output_tokens" >= 0
          AND "total_tokens" >= 0)),
	CONSTRAINT "generations_started_at_nonnegative" CHECK("started_at" >= 0),
	CONSTRAINT "generations_finished_at_valid" CHECK("finished_at" IS NULL OR "finished_at" >= "started_at"),
	CONSTRAINT "generations_state_valid" CHECK(("status" = 'pending'
          AND "finished_at" IS NULL
          AND "failure_kind" IS NULL
          AND "output_message_id" IS NULL)
        OR ("status" = 'completed'
          AND "finished_at" IS NOT NULL
          AND "failure_kind" IS NULL
          AND "output_message_id" IS NOT NULL)
        OR ("status" = 'failed'
          AND "finished_at" IS NOT NULL
          AND "failure_kind" IS NOT NULL
          AND "output_message_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE `thread_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`turn_id` text NOT NULL,
	`parent_message_id` text,
	`sequence` integer NOT NULL,
	`author` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_thread_messages_thread_id_threads_id_fk` FOREIGN KEY (`thread_id`) REFERENCES `threads`(`id`) ON DELETE CASCADE,
	CONSTRAINT `thread_messages_turn_fk` FOREIGN KEY (`thread_id`,`turn_id`) REFERENCES `turns`(`thread_id`,`id`) ON DELETE CASCADE,
	CONSTRAINT `thread_messages_parent_fk` FOREIGN KEY (`thread_id`,`parent_message_id`) REFERENCES `thread_messages`(`thread_id`,`id`),
	CONSTRAINT "thread_messages_sequence_positive" CHECK("sequence" > 0),
	CONSTRAINT "thread_messages_author_valid" CHECK("author" IN ('user', 'assistant')),
	CONSTRAINT "thread_messages_parent_valid" CHECK("author" = 'user' OR "parent_message_id" IS NOT NULL),
	CONSTRAINT "thread_messages_content_valid" CHECK(length(trim("content")) > 0 AND length("content") <= 100000),
	CONSTRAINT "thread_messages_created_at_nonnegative" CHECK("created_at" >= 0)
);
--> statement-breakpoint
CREATE TABLE `threads` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`last_message_sequence` integer DEFAULT 0 NOT NULL,
	`active_message_id` text,
	CONSTRAINT `fk_threads_active_message_id_thread_messages_id_fk` FOREIGN KEY (`active_message_id`) REFERENCES `thread_messages`(`id`) ON DELETE SET NULL,
	CONSTRAINT `threads_active_message_thread_fk` FOREIGN KEY (`id`,`active_message_id`) REFERENCES `thread_messages`(`thread_id`,`id`),
	CONSTRAINT "threads_created_at_nonnegative" CHECK("created_at" >= 0),
	CONSTRAINT "threads_last_message_sequence_nonnegative" CHECK("last_message_sequence" >= 0)
);
--> statement-breakpoint
CREATE TABLE `turns` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_turns_thread_id_threads_id_fk` FOREIGN KEY (`thread_id`) REFERENCES `threads`(`id`) ON DELETE CASCADE,
	CONSTRAINT "turns_created_at_nonnegative" CHECK("created_at" >= 0)
);
--> statement-breakpoint
ALTER TABLE `campaigns` ADD `thread_id` text NOT NULL REFERENCES threads(id);--> statement-breakpoint
CREATE UNIQUE INDEX `campaigns_thread_unique` ON `campaigns` (`thread_id`);--> statement-breakpoint
CREATE INDEX `generations_turn_started_at_idx` ON `generations` (`turn_id`,`started_at`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `generations_pending_turn_unique` ON `generations` (`turn_id`) WHERE "generations"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX `generations_output_message_unique` ON `generations` (`output_message_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `generations_provider_generation_unique` ON `generations` (`provider_id`,`provider_generation_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `thread_messages_thread_sequence_unique` ON `thread_messages` (`thread_id`,`sequence`);--> statement-breakpoint
CREATE UNIQUE INDEX `thread_messages_thread_id_unique` ON `thread_messages` (`thread_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `thread_messages_turn_id_unique` ON `thread_messages` (`turn_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `thread_messages_turn_user_unique` ON `thread_messages` (`turn_id`) WHERE "thread_messages"."author" = 'user';--> statement-breakpoint
CREATE INDEX `thread_messages_parent_idx` ON `thread_messages` (`thread_id`,`parent_message_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `turns_thread_id_unique` ON `turns` (`thread_id`,`id`);
