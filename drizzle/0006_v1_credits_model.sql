CREATE TABLE IF NOT EXISTS `userCredits` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `freeCreditsGranted` int NOT NULL DEFAULT 3,
  `paidCreditsGranted` int NOT NULL DEFAULT 0,
  `creditsConsumed` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `userCredits_id` PRIMARY KEY(`id`),
  CONSTRAINT `userCredits_userId_unique` UNIQUE(`userId`)
);

UPDATE `analyses`
SET `mode` = 'standard'
WHERE `mode` IN ('quick', 'deep');

ALTER TABLE `analyses`
MODIFY COLUMN `mode` enum('standard') NOT NULL DEFAULT 'standard';
