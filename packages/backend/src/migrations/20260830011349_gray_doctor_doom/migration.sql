CREATE TABLE `campaign_generation_configuration_overrides` (
	`campaign_id` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`model_id` text NOT NULL,
	`name` text NOT NULL,
	`brand_id` text NOT NULL,
	`reasoning_effort` text,
	CONSTRAINT `fk_campaign_generation_configuration_overrides_campaign_id_campaigns_id_fk` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON DELETE CASCADE,
	CONSTRAINT "campaign_generation_configuration_overrides_values_valid" CHECK(length(trim("provider_id")) > 0
        AND length(trim("model_id")) > 0
        AND length(trim("name")) > 0
        AND length(trim("brand_id")) > 0
        AND ("reasoning_effort" IS NULL OR "reasoning_effort" IN ('max', 'xhigh', 'high', 'medium', 'low', 'minimal', 'none')))
);
