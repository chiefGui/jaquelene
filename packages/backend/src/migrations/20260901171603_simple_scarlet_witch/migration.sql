ALTER TABLE `generations` ADD `upstream_provider_id` text;--> statement-breakpoint
ALTER TABLE `generations` ADD `cache_read_input_tokens` integer;--> statement-breakpoint
ALTER TABLE `generations` ADD `cache_write_input_tokens` integer;--> statement-breakpoint
ALTER TABLE `generations` ADD `reasoning_output_tokens` integer;--> statement-breakpoint
ALTER TABLE `generations` ADD `cost_currency` text;--> statement-breakpoint
ALTER TABLE `generations` ADD `cost_amount_nanos` integer;--> statement-breakpoint
ALTER TABLE `generations` ADD `cost_source` text;--> statement-breakpoint
ALTER TABLE `generations` ADD `provider_started_at` integer;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_generations` (
	`id` text PRIMARY KEY NOT NULL,
	`turn_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`model_id` text NOT NULL,
	`reasoning_preset` text,
	`reasoning_preset_source` text,
	`status` text NOT NULL,
	`failure_kind` text,
	`provider_generation_id` text,
	`resolved_model_id` text,
	`upstream_provider_id` text,
	`finish_reason` text,
	`input_tokens` integer,
	`cache_read_input_tokens` integer,
	`cache_write_input_tokens` integer,
	`output_tokens` integer,
	`reasoning_output_tokens` integer,
	`total_tokens` integer,
	`cost_currency` text,
	`cost_amount_nanos` integer,
	`cost_source` text,
	`output_message_id` text,
	`started_at` integer NOT NULL,
	`provider_started_at` integer,
	`finished_at` integer,
	CONSTRAINT `fk_generations_turn_id_turns_id_fk` FOREIGN KEY (`turn_id`) REFERENCES `turns`(`id`) ON DELETE CASCADE,
	CONSTRAINT `generations_output_message_fk` FOREIGN KEY (`turn_id`,`output_message_id`) REFERENCES `thread_messages`(`turn_id`,`id`),
	CONSTRAINT "generations_model_reference_valid" CHECK(length(trim("provider_id")) > 0 AND length(trim("model_id")) > 0),
	CONSTRAINT "generations_reasoning_valid" CHECK(("reasoning_preset" IS NULL AND "reasoning_preset_source" IS NULL)
        OR ("reasoning_preset" IS NOT NULL
          AND "reasoning_preset_source" IS NOT NULL
          AND "reasoning_preset" IN ('automatic', 'on', 'off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max')
          AND "reasoning_preset_source" IN ('model-default', 'selection'))),
	CONSTRAINT "generations_status_valid" CHECK("status" IN ('pending', 'completed', 'failed')),
	CONSTRAINT "generations_failure_kind_valid" CHECK("failure_kind" IS NULL OR "failure_kind" IN ('preparation', 'provider', 'invalid-output', 'interrupted', 'storage')),
	CONSTRAINT "generations_provider_result_valid" CHECK(("provider_generation_id" IS NULL OR length(trim("provider_generation_id")) > 0)
        AND ("resolved_model_id" IS NULL OR length(trim("resolved_model_id")) > 0)
        AND ("upstream_provider_id" IS NULL OR length(trim("upstream_provider_id")) > 0)
        AND ("finish_reason" IS NULL OR length(trim("finish_reason")) > 0)),
	CONSTRAINT "generations_usage_valid" CHECK(("input_tokens" IS NULL AND "output_tokens" IS NULL AND "total_tokens" IS NULL)
        OR ("input_tokens" IS NOT NULL
          AND "output_tokens" IS NOT NULL
          AND "total_tokens" IS NOT NULL
		  AND "input_tokens" >= 0
		  AND "output_tokens" >= 0
		  AND "total_tokens" >= "input_tokens"
		  AND "total_tokens" >= "output_tokens")),
	CONSTRAINT "generations_usage_details_valid" CHECK(("cache_read_input_tokens" IS NULL
          OR ("input_tokens" IS NOT NULL
            AND "cache_read_input_tokens" >= 0
            AND "cache_read_input_tokens" <= "input_tokens"))
        AND ("cache_write_input_tokens" IS NULL
          OR ("input_tokens" IS NOT NULL
            AND "cache_write_input_tokens" >= 0
            AND "cache_write_input_tokens" <= "input_tokens"))
        AND ("reasoning_output_tokens" IS NULL
          OR ("output_tokens" IS NOT NULL
            AND "reasoning_output_tokens" >= 0
            AND "reasoning_output_tokens" <= "output_tokens"))),
	CONSTRAINT "generations_cost_valid" CHECK(("cost_currency" IS NULL
          AND "cost_amount_nanos" IS NULL
          AND "cost_source" IS NULL)
		OR ("cost_currency" = 'USD'
		  AND "cost_amount_nanos" IS NOT NULL
		  AND "cost_amount_nanos" >= 0
		  AND "input_tokens" IS NOT NULL
		  AND "cost_source" IN ('provider-reported', 'estimated'))),
	CONSTRAINT "generations_started_at_nonnegative" CHECK("started_at" >= 0),
	CONSTRAINT "generations_provider_started_at_valid" CHECK("provider_started_at" IS NULL
        OR "provider_started_at" >= "started_at"),
	CONSTRAINT "generations_finished_at_valid" CHECK("finished_at" IS NULL
        OR ("finished_at" >= "started_at"
          AND ("provider_started_at" IS NULL
            OR "finished_at" >= "provider_started_at"))),
	CONSTRAINT "generations_provider_attempt_valid" CHECK(("status" <> 'completed' OR "provider_started_at" IS NOT NULL)
        AND ("failure_kind" <> 'preparation' OR "provider_started_at" IS NULL)
        AND ("failure_kind" NOT IN ('provider', 'invalid-output')
          OR "provider_started_at" IS NOT NULL)
        AND (("provider_generation_id" IS NULL
            AND "resolved_model_id" IS NULL
            AND "upstream_provider_id" IS NULL
            AND "finish_reason" IS NULL
            AND "input_tokens" IS NULL
            AND "cost_amount_nanos" IS NULL)
          OR "provider_started_at" IS NOT NULL)),
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
INSERT INTO `__new_generations`(`id`, `turn_id`, `provider_id`, `model_id`, `reasoning_preset`, `reasoning_preset_source`, `status`, `failure_kind`, `provider_generation_id`, `resolved_model_id`, `finish_reason`, `input_tokens`, `output_tokens`, `total_tokens`, `output_message_id`, `started_at`, `provider_started_at`, `finished_at`) SELECT `id`, `turn_id`, `provider_id`, `model_id`, `reasoning_preset`, `reasoning_preset_source`, `status`, `failure_kind`, `provider_generation_id`, `resolved_model_id`, `finish_reason`, `input_tokens`, `output_tokens`, `total_tokens`, `output_message_id`, `started_at`, CASE WHEN `status` = 'completed' OR `failure_kind` IN ('provider', 'invalid-output') OR (`failure_kind` = 'storage' AND (`provider_generation_id` IS NOT NULL OR `resolved_model_id` IS NOT NULL OR `finish_reason` IS NOT NULL OR `input_tokens` IS NOT NULL)) THEN `started_at` ELSE NULL END, `finished_at` FROM `generations`;--> statement-breakpoint
DROP TABLE `generations`;--> statement-breakpoint
ALTER TABLE `__new_generations` RENAME TO `generations`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `generations_turn_started_at_idx` ON `generations` (`turn_id`,`started_at`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `generations_pending_turn_unique` ON `generations` (`turn_id`) WHERE "generations"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX `generations_output_message_unique` ON `generations` (`output_message_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `generations_provider_generation_unique` ON `generations` (`provider_id`,`provider_generation_id`);
