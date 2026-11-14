-- Lead close time (WON/LOST) for conversion reporting.
-- AlterTable
ALTER TABLE `leads` ADD COLUMN `closed_at` DATETIME(3) NULL;

-- CreateIndex
CREATE INDEX `leads_agency_id_status_closed_at_idx` ON `leads`(`agency_id`, `status`, `closed_at`);


-- Backfill: leads already closed get their last update time as the close time.
UPDATE `leads` SET `closed_at` = `updated_at` WHERE `status` IN ('WON', 'LOST') AND `closed_at` IS NULL;
