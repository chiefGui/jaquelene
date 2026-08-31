CREATE TABLE `campaign_continuation` (
	`id` integer PRIMARY KEY,
	`campaign_id` text NOT NULL,
	CONSTRAINT `fk_campaign_continuation_campaign_id_campaigns_id_fk` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON DELETE CASCADE,
	CONSTRAINT "campaign_continuation_singleton" CHECK("id" = 1)
);
