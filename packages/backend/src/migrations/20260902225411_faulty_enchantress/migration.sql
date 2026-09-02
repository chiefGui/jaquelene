CREATE TABLE `campaign_generation_preferences` (
	`campaign_id` text PRIMARY KEY NOT NULL,
	`provider_id` text,
	`model_id` text,
	`name` text,
	`brand_id` text,
	`reasoning_preset` text,
	CONSTRAINT `fk_campaign_generation_preferences_campaign_id_campaigns_id_fk` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON DELETE CASCADE,
	CONSTRAINT "campaign_generation_preferences_values_valid" CHECK((
          ("provider_id" IS NULL
            AND "model_id" IS NULL
            AND "name" IS NULL
            AND "brand_id" IS NULL)
          OR
          ("provider_id" IS NOT NULL
            AND "model_id" IS NOT NULL
            AND "name" IS NOT NULL
            AND "brand_id" IS NOT NULL
            AND length(trim("provider_id")) > 0
            AND length(trim("model_id")) > 0
            AND length(trim("name")) > 0
            AND length(trim("brand_id")) > 0)
        )
        AND ("provider_id" IS NOT NULL OR "reasoning_preset" IS NOT NULL)
        AND ("reasoning_preset" IS NULL OR "reasoning_preset" IN ('automatic', 'on', 'off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max')))
);
--> statement-breakpoint
CREATE TABLE `campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`thread_id` text NOT NULL,
	`started_at` integer NOT NULL,
	CONSTRAINT `fk_campaigns_thread_id_threads_id_fk` FOREIGN KEY (`thread_id`) REFERENCES `threads`(`id`),
	CONSTRAINT "campaigns_title_valid" CHECK("title" = trim("title", char(9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279)) AND length("title") > 0 AND length("title") <= 120),
	CONSTRAINT "campaigns_started_at_nonnegative" CHECK("started_at" >= 0)
);
--> statement-breakpoint
CREATE TABLE `generations` (
	`id` text PRIMARY KEY NOT NULL,
	`turn_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`model_id` text NOT NULL,
	`reasoning_preset` text,
	`reasoning_preset_source` text,
	`kind` text NOT NULL,
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
	CONSTRAINT "generations_kind_valid" CHECK("kind" IN ('reply', 'retry', 'regeneration')),
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
CREATE TABLE `campaign_prompt_selections` (
	`campaign_id` text NOT NULL,
	`kind` text NOT NULL,
	`prompt_key` text NOT NULL,
	CONSTRAINT `campaign_prompt_selections_pk` PRIMARY KEY(`campaign_id`, `kind`),
	CONSTRAINT `fk_campaign_prompt_selections_campaign_id_campaigns_id_fk` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_campaign_prompt_selections_kind_prompt_kinds_key_fk` FOREIGN KEY (`kind`) REFERENCES `prompt_kinds`(`key`) ON DELETE CASCADE,
	CONSTRAINT `campaign_prompt_selections_prompt_fk` FOREIGN KEY (`kind`,`prompt_key`) REFERENCES `prompts`(`kind`,`key`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `prompt_default_overrides` (
	`kind` text PRIMARY KEY NOT NULL,
	`prompt_key` text NOT NULL,
	CONSTRAINT `fk_prompt_default_overrides_kind_prompt_kinds_key_fk` FOREIGN KEY (`kind`) REFERENCES `prompt_kinds`(`key`) ON DELETE CASCADE,
	CONSTRAINT `prompt_default_overrides_prompt_fk` FOREIGN KEY (`kind`,`prompt_key`) REFERENCES `prompts`(`kind`,`key`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `prompt_kind_fallbacks` (
	`kind` text PRIMARY KEY NOT NULL,
	`prompt_key` text NOT NULL,
	CONSTRAINT `fk_prompt_kind_fallbacks_kind_prompt_kinds_key_fk` FOREIGN KEY (`kind`) REFERENCES `prompt_kinds`(`key`) ON DELETE CASCADE,
	CONSTRAINT `prompt_kind_fallbacks_prompt_fk` FOREIGN KEY (`kind`,`prompt_key`) REFERENCES `prompts`(`kind`,`key`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE `prompt_kinds` (
	`key` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	CONSTRAINT "prompt_kinds_key_valid" CHECK(length("key") > 0 AND length("key") <= 64 AND "key" NOT GLOB '*[^a-z0-9-]*' AND "key" GLOB '[a-z]*'),
	CONSTRAINT "prompt_kinds_name_valid" CHECK("name" = trim("name", char(9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279)) AND length("name") > 0),
	CONSTRAINT "prompt_kinds_description_valid" CHECK("description" = trim("description", char(9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279)) AND length("description") > 0)
);
--> statement-breakpoint
CREATE TABLE `prompts` (
	`key` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`origin` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_prompts_kind_prompt_kinds_key_fk` FOREIGN KEY (`kind`) REFERENCES `prompt_kinds`(`key`),
	CONSTRAINT "prompts_key_valid" CHECK(length("key") > 0 AND length("key") <= 128),
	CONSTRAINT "prompts_origin_valid" CHECK("origin" IN ('factory', 'custom')),
	CONSTRAINT "prompts_title_valid" CHECK("title" = trim("title", char(9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279)) AND length("title") > 0 AND length("title") <= 120),
	CONSTRAINT "prompts_body_valid" CHECK(length(trim("body", char(9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279))) > 0 AND length("body") <= 20000),
	CONSTRAINT "prompts_created_at_nonnegative" CHECK("created_at" >= 0)
);
--> statement-breakpoint
CREATE TABLE `thread_messages` (
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
	CONSTRAINT "provider_attempts_failure_kind_valid" CHECK("failure_kind" IS NULL OR "failure_kind" IN ('provider', 'interrupted')),
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
CREATE INDEX `campaigns_started_at_index` ON `campaigns` (`started_at`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `campaigns_thread_unique` ON `campaigns` (`thread_id`);--> statement-breakpoint
CREATE INDEX `generations_turn_started_at_idx` ON `generations` (`turn_id`,`started_at`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `generations_pending_turn_unique` ON `generations` (`turn_id`) WHERE "generations"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX `generations_output_message_unique` ON `generations` (`output_message_id`);--> statement-breakpoint
CREATE INDEX `campaign_prompt_selections_prompt_index` ON `campaign_prompt_selections` (`prompt_key`);--> statement-breakpoint
CREATE INDEX `prompt_default_overrides_prompt_index` ON `prompt_default_overrides` (`prompt_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `prompt_kind_fallbacks_prompt_unique` ON `prompt_kind_fallbacks` (`prompt_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `prompts_kind_key_unique` ON `prompts` (`kind`,`key`);--> statement-breakpoint
CREATE INDEX `prompts_kind_created_at_index` ON `prompts` (`kind`,`created_at`,`key`);--> statement-breakpoint
CREATE UNIQUE INDEX `thread_messages_thread_sequence_unique` ON `thread_messages` (`thread_id`,`sequence`);--> statement-breakpoint
CREATE UNIQUE INDEX `thread_messages_thread_id_unique` ON `thread_messages` (`thread_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `thread_messages_thread_parent_id_unique` ON `thread_messages` (`thread_id`,`parent_message_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `thread_messages_turn_id_unique` ON `thread_messages` (`turn_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `thread_messages_turn_user_unique` ON `thread_messages` (`turn_id`) WHERE "thread_messages"."author" = 'user';--> statement-breakpoint
CREATE UNIQUE INDEX `turns_thread_id_unique` ON `turns` (`thread_id`,`id`);--> statement-breakpoint
CREATE INDEX `provider_attempts_generation_idx` ON `provider_attempts` (`generation_id`,`started_at`,`id`);--> statement-breakpoint
CREATE INDEX `provider_attempts_started_at_idx` ON `provider_attempts` (`started_at`,`id`);--> statement-breakpoint
CREATE INDEX `provider_attempts_campaign_started_at_idx` ON `provider_attempts` (`campaign_id`,`started_at`,`id`);