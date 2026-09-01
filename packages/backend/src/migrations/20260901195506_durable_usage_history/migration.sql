CREATE TABLE `provider_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`generation_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`campaign_id` text,
	`provider_id` text NOT NULL,
	`requested_model_id` text NOT NULL,
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
	`started_at` integer NOT NULL,
	`finished_at` integer,
	CONSTRAINT "provider_attempts_references_valid" CHECK(length(trim("generation_id")) > 0
        AND length(trim("thread_id")) > 0
        AND ("campaign_id" IS NULL OR length(trim("campaign_id")) > 0)
        AND length(trim("provider_id")) > 0
        AND length(trim("requested_model_id")) > 0),
	CONSTRAINT "provider_attempts_status_valid" CHECK("status" IN ('pending', 'completed', 'failed')),
	CONSTRAINT "provider_attempts_failure_kind_valid" CHECK("failure_kind" IS NULL OR "failure_kind" IN ('provider', 'invalid-output', 'interrupted', 'storage')),
	CONSTRAINT "provider_attempts_provider_result_valid" CHECK(("provider_generation_id" IS NULL OR length(trim("provider_generation_id")) > 0)
        AND ("resolved_model_id" IS NULL OR length(trim("resolved_model_id")) > 0)
        AND ("upstream_provider_id" IS NULL OR length(trim("upstream_provider_id")) > 0)
        AND ("finish_reason" IS NULL OR length(trim("finish_reason")) > 0)),
	CONSTRAINT "provider_attempts_usage_valid" CHECK(("input_tokens" IS NULL AND "output_tokens" IS NULL AND "total_tokens" IS NULL)
        OR ("input_tokens" IS NOT NULL
          AND "output_tokens" IS NOT NULL
          AND "total_tokens" IS NOT NULL
          AND "input_tokens" >= 0
          AND "output_tokens" >= 0
          AND "total_tokens" >= "input_tokens"
          AND "total_tokens" >= "output_tokens")),
	CONSTRAINT "provider_attempts_usage_details_valid" CHECK(("cache_read_input_tokens" IS NULL
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
	CONSTRAINT "provider_attempts_cost_valid" CHECK(("cost_currency" IS NULL
          AND "cost_amount_nanos" IS NULL
          AND "cost_source" IS NULL)
        OR ("cost_currency" GLOB '[A-Z][A-Z][A-Z]'
          AND "cost_amount_nanos" IS NOT NULL
          AND "cost_amount_nanos" >= 0
          AND "input_tokens" IS NOT NULL
          AND "cost_source" IN ('provider-reported', 'estimated'))),
	CONSTRAINT "provider_attempts_started_at_nonnegative" CHECK("started_at" >= 0),
	CONSTRAINT "provider_attempts_finished_at_valid" CHECK("finished_at" IS NULL OR "finished_at" >= "started_at"),
	CONSTRAINT "provider_attempts_state_valid" CHECK(("status" = 'pending'
          AND "finished_at" IS NULL
          AND "failure_kind" IS NULL)
        OR ("status" = 'completed'
          AND "finished_at" IS NOT NULL
          AND "failure_kind" IS NULL)
        OR ("status" = 'failed'
          AND "finished_at" IS NOT NULL
          AND "failure_kind" IS NOT NULL))
);
--> statement-breakpoint
INSERT INTO `provider_attempts` (
	`id`, `generation_id`, `thread_id`, `campaign_id`, `provider_id`, `requested_model_id`,
	`status`, `failure_kind`, `provider_generation_id`, `resolved_model_id`,
	`upstream_provider_id`, `finish_reason`, `input_tokens`, `cache_read_input_tokens`,
	`cache_write_input_tokens`, `output_tokens`, `reasoning_output_tokens`, `total_tokens`,
	`cost_currency`, `cost_amount_nanos`, `cost_source`, `started_at`, `finished_at`
)
SELECT
	'attempt_' || substr(`generations`.`id`, length('generation_') + 1),
	`generations`.`id`, `turns`.`thread_id`, `campaigns`.`id`,
	`generations`.`provider_id`, `generations`.`model_id`, `generations`.`status`,
	`generations`.`failure_kind`, `generations`.`provider_generation_id`,
	`generations`.`resolved_model_id`, `generations`.`upstream_provider_id`,
	`generations`.`finish_reason`, `generations`.`input_tokens`,
	`generations`.`cache_read_input_tokens`, `generations`.`cache_write_input_tokens`,
	`generations`.`output_tokens`, `generations`.`reasoning_output_tokens`,
	`generations`.`total_tokens`, `generations`.`cost_currency`,
	`generations`.`cost_amount_nanos`, `generations`.`cost_source`,
	`generations`.`provider_started_at`, `generations`.`finished_at`
FROM `generations`
INNER JOIN `turns` ON `turns`.`id` = `generations`.`turn_id`
LEFT JOIN `campaigns` ON `campaigns`.`thread_id` = `turns`.`thread_id`
WHERE `generations`.`provider_started_at` IS NOT NULL;
--> statement-breakpoint
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
	`output_message_id` text,
	`started_at` integer NOT NULL,
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
INSERT INTO `__new_generations`(`id`, `turn_id`, `provider_id`, `model_id`, `reasoning_preset`, `reasoning_preset_source`, `status`, `failure_kind`, `output_message_id`, `started_at`, `finished_at`) SELECT `id`, `turn_id`, `provider_id`, `model_id`, `reasoning_preset`, `reasoning_preset_source`, `status`, `failure_kind`, `output_message_id`, `started_at`, `finished_at` FROM `generations`;--> statement-breakpoint
DROP TABLE `generations`;--> statement-breakpoint
ALTER TABLE `__new_generations` RENAME TO `generations`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
DROP INDEX IF EXISTS `generations_provider_generation_unique`;--> statement-breakpoint
CREATE INDEX `generations_turn_started_at_idx` ON `generations` (`turn_id`,`started_at`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `generations_pending_turn_unique` ON `generations` (`turn_id`) WHERE "generations"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX `generations_output_message_unique` ON `generations` (`output_message_id`);--> statement-breakpoint
CREATE INDEX `provider_attempts_generation_idx` ON `provider_attempts` (`generation_id`,`started_at`,`id`);--> statement-breakpoint
CREATE INDEX `provider_attempts_started_at_idx` ON `provider_attempts` (`started_at`,`id`);--> statement-breakpoint
CREATE INDEX `provider_attempts_campaign_started_at_idx` ON `provider_attempts` (`campaign_id`,`started_at`,`id`);
