CREATE TABLE IF NOT EXISTS `iapPurchases` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `transactionId` varchar(128) NOT NULL,
  `productId` varchar(128) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `iapPurchases_id` PRIMARY KEY(`id`),
  CONSTRAINT `iapPurchases_transactionId_unique` UNIQUE(`transactionId`)
);
