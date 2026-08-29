CREATE TABLE `generations` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`context_sequence` integer NOT NULL,
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
	CONSTRAINT `fk_generations_thread_id_threads_id_fk` FOREIGN KEY (`thread_id`) REFERENCES `threads`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_generations_output_message_id_thread_messages_id_fk` FOREIGN KEY (`output_message_id`) REFERENCES `thread_messages`(`id`),
	CONSTRAINT `generations_context_message_fk` FOREIGN KEY (`thread_id`,`context_sequence`) REFERENCES `thread_messages`(`thread_id`,`sequence`),
	CONSTRAINT "generations_context_sequence_positive" CHECK("context_sequence" > 0),
	CONSTRAINT "generations_model_reference_valid" CHECK(length(trim("provider_id")) > 0 AND length(trim("model_id")) > 0),
	CONSTRAINT "generations_status_valid" CHECK("status" IN ('pending', 'completed', 'failed')),
	CONSTRAINT "generations_failure_kind_valid" CHECK("failure_kind" IS NULL OR "failure_kind" IN ('provider', 'invalid-output', 'superseded', 'interrupted', 'storage')),
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
CREATE INDEX `generations_thread_idx` ON `generations` (`thread_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `generations_pending_thread_unique` ON `generations` (`thread_id`) WHERE "generations"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX `generations_output_message_unique` ON `generations` (`output_message_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `generations_provider_generation_unique` ON `generations` (`provider_id`,`provider_generation_id`);