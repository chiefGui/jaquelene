CREATE TABLE `campaign_roleplay_instructions` (
	`campaign_id` text PRIMARY KEY NOT NULL,
	`instruction_id` text,
	CONSTRAINT `fk_campaign_roleplay_instructions_campaign_id_campaigns_id_fk` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_campaign_roleplay_instructions_instruction_id_roleplay_instructions_id_fk` FOREIGN KEY (`instruction_id`) REFERENCES `roleplay_instructions`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `roleplay_instruction_preferences` (
	`slot` integer PRIMARY KEY,
	`default_instruction_id` text NOT NULL,
	CONSTRAINT `fk_roleplay_instruction_preferences_default_instruction_id_roleplay_instructions_id_fk` FOREIGN KEY (`default_instruction_id`) REFERENCES `roleplay_instructions`(`id`) ON DELETE CASCADE,
	CONSTRAINT "roleplay_instruction_preferences_singleton" CHECK("slot" = 1)
);
--> statement-breakpoint
CREATE TABLE `roleplay_instructions` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "roleplay_instructions_title_valid" CHECK("title" = trim("title", char(9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279)) AND length("title") > 0 AND length("title") <= 120),
	CONSTRAINT "roleplay_instructions_body_valid" CHECK(length(trim("body", char(9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279))) > 0 AND length("body") <= 20000),
	CONSTRAINT "roleplay_instructions_created_at_nonnegative" CHECK("created_at" >= 0)
);
--> statement-breakpoint
CREATE INDEX `campaign_roleplay_instructions_instruction_index` ON `campaign_roleplay_instructions` (`instruction_id`);