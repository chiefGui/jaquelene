CREATE TABLE `campaign_continuation` (
	`id` integer PRIMARY KEY,
	`campaign_id` text NOT NULL,
	CONSTRAINT `fk_campaign_continuation_campaign_id_campaigns_id_fk` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON DELETE CASCADE,
	CONSTRAINT "campaign_continuation_singleton" CHECK("id" = 1)
);
--> statement-breakpoint
INSERT INTO `campaign_continuation` (`id`, `campaign_id`)
SELECT 1, `campaigns`.`id`
FROM `campaigns`
INNER JOIN `thread_messages` ON `thread_messages`.`thread_id` = `campaigns`.`thread_id`
WHERE `thread_messages`.`author` = 'user'
ORDER BY `thread_messages`.`created_at` DESC, `thread_messages`.`id` DESC
LIMIT 1;
