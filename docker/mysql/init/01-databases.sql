-- Runs once, on first start of an empty MySQL data volume.
-- The main database and application user are created by the official image from
-- MYSQL_DATABASE / MYSQL_USER / MYSQL_PASSWORD.
--
-- `prisma migrate dev` needs a disposable shadow database to detect schema drift.
-- Granting a dedicated shadow DB avoids giving the app user global CREATE rights.
-- `brokerdesk_test` is used by integration tests (Phase 2+).
CREATE DATABASE IF NOT EXISTS `brokerdesk_shadow` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS `brokerdesk_test` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON `brokerdesk_shadow`.* TO 'brokerdesk'@'%';
GRANT ALL PRIVILEGES ON `brokerdesk_test`.* TO 'brokerdesk'@'%';
FLUSH PRIVILEGES;
