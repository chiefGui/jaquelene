CREATE TABLE `campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`scenario_id` text NOT NULL,
	`started_at` integer NOT NULL,
	CONSTRAINT `fk_campaigns_scenario_id_scenarios_id_fk` FOREIGN KEY (`scenario_id`) REFERENCES `scenarios`(`id`)
);
--> statement-breakpoint
CREATE INDEX `campaigns_scenario_started_at_index` ON `campaigns` (`scenario_id`,`started_at`,`id`);