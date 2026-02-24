ALTER TABLE `analyses` ADD `mode` enum('quick','deep') DEFAULT 'quick' NOT NULL;--> statement-breakpoint
ALTER TABLE `analyses` ADD `contentHash` varchar(64);