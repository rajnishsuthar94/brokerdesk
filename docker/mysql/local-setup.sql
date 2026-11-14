-- One-time setup for a natively installed MySQL 8.4 (no Docker).
-- Run as root:   mysql -u root -p < docker/mysql/local-setup.sql
--
-- BEFORE RUNNING: replace change-me-local-dev-password below with the same
-- password used in DATABASE_URL / SHADOW_DATABASE_URL in your .env.
-- Do not commit a real password back into this file.

CREATE DATABASE IF NOT EXISTS `brokerdesk` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS `brokerdesk_shadow` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS `brokerdesk_test` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'brokerdesk'@'localhost' IDENTIFIED BY 'change-me-local-dev-password';
-- Re-running the script also resets the password (e.g. after changing .env).
ALTER USER 'brokerdesk'@'localhost' IDENTIFIED BY 'change-me-local-dev-password';
GRANT ALL PRIVILEGES ON `brokerdesk`.* TO 'brokerdesk'@'localhost';
GRANT ALL PRIVILEGES ON `brokerdesk_shadow`.* TO 'brokerdesk'@'localhost';
GRANT ALL PRIVILEGES ON `brokerdesk_test`.* TO 'brokerdesk'@'localhost';
FLUSH PRIVILEGES;

-- Keep stored DATETIME values in UTC, matching docker/mysql/conf.d/brokerdesk.cnf.
-- (Lasts until the server restarts; to make it permanent add
--  default-time-zone='+00:00' under [mysqld] in my.ini.)
SET GLOBAL time_zone = '+00:00';
