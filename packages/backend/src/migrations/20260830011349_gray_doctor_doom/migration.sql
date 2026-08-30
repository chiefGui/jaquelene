CREATE TABLE `campaign_model_overrides` (
	`campaign_id` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`model_id` text NOT NULL,
	`name` text NOT NULL,
	`brand_id` text NOT NULL,
	CONSTRAINT `fk_campaign_model_overrides_campaign_id_campaigns_id_fk` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON DELETE CASCADE,
	CONSTRAINT "campaign_model_overrides_values_valid" CHECK(length(trim("provider_id")) > 0
        AND length(trim("model_id")) > 0
        AND length(trim("name")) > 0
        AND length(trim("brand_id")) > 0)
);
