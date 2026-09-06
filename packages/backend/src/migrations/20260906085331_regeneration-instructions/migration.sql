ALTER TABLE `generations` ADD `regeneration_source_message_id` text;--> statement-breakpoint
ALTER TABLE `generations` ADD `regeneration_instructions` text;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_generations` (
	`id` text PRIMARY KEY NOT NULL,
	`turn_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`model_id` text NOT NULL,
	`reasoning_preset` text,
	`reasoning_preset_source` text,
	`intent` text NOT NULL,
	`status` text NOT NULL,
	`failure_kind` text,
	`output_message_id` text,
	`regeneration_source_message_id` text,
	`regeneration_instructions` text,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	CONSTRAINT `fk_generations_turn_id_turns_id_fk` FOREIGN KEY (`turn_id`) REFERENCES `turns`(`id`) ON DELETE CASCADE,
	CONSTRAINT `generations_output_message_fk` FOREIGN KEY (`turn_id`,`output_message_id`) REFERENCES `thread_messages`(`turn_id`,`id`),
	CONSTRAINT `generations_regeneration_source_fk` FOREIGN KEY (`turn_id`,`regeneration_source_message_id`) REFERENCES `thread_messages`(`turn_id`,`id`),
	CONSTRAINT "generations_regeneration_valid" CHECK(("regeneration_source_message_id" IS NULL AND "regeneration_instructions" IS NULL)
        OR ("intent" = 'regeneration'
          AND "regeneration_source_message_id" IS NOT NULL
          AND "regeneration_instructions" IS NOT NULL
          AND length(trim("regeneration_instructions")) BETWEEN 1 AND 2000)),
	CONSTRAINT "generations_model_reference_valid" CHECK(length(trim("provider_id")) > 0 AND length(trim("model_id")) > 0),
	CONSTRAINT "generations_reasoning_valid" CHECK(("reasoning_preset" IS NULL AND "reasoning_preset_source" IS NULL)
        OR ("reasoning_preset" IS NOT NULL
          AND "reasoning_preset_source" IS NOT NULL
          AND "reasoning_preset" IN ('automatic', 'on', 'off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max')
          AND "reasoning_preset_source" IN ('model-default', 'selection'))),
	CONSTRAINT "generations_intent_valid" CHECK("intent" IN ('reply', 'retry', 'regeneration')),
	CONSTRAINT "generations_status_valid" CHECK("status" IN ('pending', 'completed', 'failed')),
	CONSTRAINT "generations_failure_kind_valid" CHECK("failure_kind" IS NULL OR "failure_kind" IN ('preparation', 'provider', 'invalid-output', 'interrupted', 'storage')),
	CONSTRAINT "generations_started_at_nonnegative" CHECK("started_at" >= 0),
	CONSTRAINT "generations_finished_at_valid" CHECK("finished_at" IS NULL
        OR "finished_at" >= "started_at"),
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
INSERT INTO `__new_generations`(`id`, `turn_id`, `provider_id`, `model_id`, `reasoning_preset`, `reasoning_preset_source`, `intent`, `status`, `failure_kind`, `output_message_id`, `started_at`, `finished_at`) SELECT `id`, `turn_id`, `provider_id`, `model_id`, `reasoning_preset`, `reasoning_preset_source`, `intent`, `status`, `failure_kind`, `output_message_id`, `started_at`, `finished_at` FROM `generations`;--> statement-breakpoint
DROP TABLE `generations`;--> statement-breakpoint
ALTER TABLE `__new_generations` RENAME TO `generations`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `generations_turn_started_at_idx` ON `generations` (`turn_id`,`started_at`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `generations_pending_turn_unique` ON `generations` (`turn_id`) WHERE "generations"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX `generations_output_message_unique` ON `generations` (`output_message_id`);