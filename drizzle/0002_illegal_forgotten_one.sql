ALTER TABLE `analyses` MODIFY COLUMN `userId` int;--> statement-breakpoint
ALTER TABLE `analyses` MODIFY COLUMN `processingTimeMs` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `contracts` MODIFY COLUMN `userId` int;--> statement-breakpoint
ALTER TABLE `analyses` DROP COLUMN `riskLevel`;