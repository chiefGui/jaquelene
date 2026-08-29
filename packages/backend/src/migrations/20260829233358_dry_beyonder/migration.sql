ALTER TABLE `campaigns` ADD `model_provider_id` text;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `model_id` text;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `model_name` text;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `model_brand_id` text;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`scenario_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`model_provider_id` text,
	`model_id` text,
	`model_name` text,
	`model_brand_id` text,
	`started_at` integer NOT NULL,
	CONSTRAINT `fk_campaigns_scenario_id_scenarios_id_fk` FOREIGN KEY (`scenario_id`) REFERENCES `scenarios`(`id`),
	CONSTRAINT `fk_campaigns_thread_id_threads_id_fk` FOREIGN KEY (`thread_id`) REFERENCES `threads`(`id`),
	CONSTRAINT "campaigns_model_override_valid" CHECK(("model_provider_id" IS NULL
          AND "model_id" IS NULL
          AND "model_name" IS NULL
          AND "model_brand_id" IS NULL)
        OR ("model_provider_id" IS NOT NULL
          AND "model_id" IS NOT NULL
          AND "model_name" IS NOT NULL
          AND "model_brand_id" IS NOT NULL
          AND length(trim("model_provider_id")) > 0
          AND length(trim("model_id")) > 0
          AND length(trim("model_name")) > 0
          AND length(trim("model_brand_id")) > 0))
);
--> statement-breakpoint
INSERT INTO `__new_campaigns`(`id`, `scenario_id`, `thread_id`, `started_at`) SELECT `id`, `scenario_id`, `thread_id`, `started_at` FROM `campaigns`;--> statement-breakpoint
DROP TABLE `campaigns`;--> statement-breakpoint
ALTER TABLE `__new_campaigns` RENAME TO `campaigns`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `campaigns_scenario_started_at_index` ON `campaigns` (`scenario_id`,`started_at`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `campaigns_thread_unique` ON `campaigns` (`thread_id`);