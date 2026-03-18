ALTER TABLE `contracts`
MODIFY COLUMN `contentType` enum('pdf','text','images') NOT NULL;
