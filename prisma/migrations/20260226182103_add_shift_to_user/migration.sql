/*
  Warnings:

  - You are about to drop the column `advanceBookingDays` on the `saassettings` table. All the data in the column will be lost.
  - You are about to drop the column `cancellationWindow` on the `saassettings` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `member` ADD COLUMN `cards` JSON NULL;

-- AlterTable
ALTER TABLE `saassettings` DROP COLUMN `advanceBookingDays`,
    DROP COLUMN `cancellationWindow`,
    ADD COLUMN `benefitAdvanceBookingDays` INTEGER NOT NULL DEFAULT 14,
    ADD COLUMN `benefitCancellationWindow` INTEGER NOT NULL DEFAULT 24,
    ADD COLUMN `classAdvanceBookingDays` INTEGER NOT NULL DEFAULT 7,
    ADD COLUMN `classCancellationWindow` INTEGER NOT NULL DEFAULT 4;

-- AlterTable
ALTER TABLE `tenant` ADD COLUMN `email` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `tenantsettings` ADD COLUMN `apiKeys` JSON NULL,
    ADD COLUMN `gstPercent` DECIMAL(5, 2) NOT NULL DEFAULT 18.00,
    ADD COLUMN `invoicePrefix` VARCHAR(191) NOT NULL DEFAULT 'INV-',
    ADD COLUMN `invoiceStartNumber` INTEGER NOT NULL DEFAULT 1001,
    ADD COLUMN `messageTemplates` JSON NULL,
    ADD COLUMN `webhooks` JSON NULL;

-- AlterTable
ALTER TABLE `user` ADD COLUMN `commission` DECIMAL(5, 2) NULL DEFAULT 0.00,
    ADD COLUMN `shift` VARCHAR(191) NULL DEFAULT 'Full Day (9AM - 6PM)';

-- CreateTable
CREATE TABLE `rewardcatalog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tenantId` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `points` INTEGER NOT NULL,
    `description` TEXT NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'Active',

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `store_product` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tenantId` INTEGER NOT NULL DEFAULT 1,
    `name` VARCHAR(191) NOT NULL,
    `sku` VARCHAR(191) NULL,
    `category` VARCHAR(191) NOT NULL,
    `price` DECIMAL(10, 2) NOT NULL,
    `originalPrice` DECIMAL(10, 2) NULL,
    `rating` DECIMAL(2, 1) NULL DEFAULT 5.0,
    `image` TEXT NULL,
    `description` TEXT NULL,
    `stock` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(191) NOT NULL DEFAULT 'Active',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `store_order` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` INTEGER NOT NULL DEFAULT 1,
    `memberId` INTEGER NOT NULL,
    `itemsCount` INTEGER NOT NULL DEFAULT 0,
    `total` DECIMAL(10, 2) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'Processing',
    `date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `store_order_item` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `orderId` VARCHAR(191) NOT NULL,
    `productId` INTEGER NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `priceAtBuy` DECIMAL(10, 2) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `amenity` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tenantId` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `icon` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'Active',
    `gender` VARCHAR(191) NOT NULL DEFAULT 'UNISEX',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `promo_code` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tenantId` INTEGER NOT NULL DEFAULT 1,
    `code` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL DEFAULT 'PERCENTAGE',
    `value` DECIMAL(10, 2) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'Active',
    `expiryDate` DATETIME(3) NULL,
    `usageLimit` INTEGER NULL,
    `usedCount` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `promo_code_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `device` ADD CONSTRAINT `device_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoice` ADD CONSTRAINT `invoice_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rewardcatalog` ADD CONSTRAINT `rewardcatalog_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `store_order` ADD CONSTRAINT `store_order_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `store_order_item` ADD CONSTRAINT `store_order_item_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `store_order`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `store_order_item` ADD CONSTRAINT `store_order_item_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `store_product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `amenity` ADD CONSTRAINT `amenity_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `promo_code` ADD CONSTRAINT `promo_code_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
