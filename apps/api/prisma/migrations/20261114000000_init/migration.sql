-- CreateTable
CREATE TABLE `agencies` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `email` VARCHAR(191) NULL,
    `phone` VARCHAR(20) NULL,
    `address` VARCHAR(500) NULL,
    `city` VARCHAR(100) NULL,
    `state` VARCHAR(100) NULL,
    `country` CHAR(2) NOT NULL DEFAULT 'IN',
    `timezone` VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(20) NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `last_login_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `agency_members` (
    `id` CHAR(36) NOT NULL,
    `agency_id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `role` ENUM('OWNER', 'ADMIN', 'AGENT') NOT NULL DEFAULT 'AGENT',
    `joined_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `agency_members_user_id_idx`(`user_id`),
    UNIQUE INDEX `agency_members_agency_id_user_id_key`(`agency_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `agency_invitations` (
    `id` CHAR(36) NOT NULL,
    `agency_id` CHAR(36) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `role` ENUM('OWNER', 'ADMIN', 'AGENT') NOT NULL DEFAULT 'AGENT',
    `token_hash` CHAR(64) NOT NULL,
    `invited_by_id` CHAR(36) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `accepted_at` DATETIME(3) NULL,
    `revoked_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `agency_invitations_token_hash_key`(`token_hash`),
    INDEX `agency_invitations_agency_id_email_idx`(`agency_id`, `email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `refresh_tokens` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `family_id` CHAR(36) NOT NULL,
    `token_hash` CHAR(64) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `revoked_at` DATETIME(3) NULL,
    `replaced_by_id` CHAR(36) NULL,
    `user_agent` VARCHAR(255) NULL,
    `ip_address` VARCHAR(45) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `refresh_tokens_token_hash_key`(`token_hash`),
    INDEX `refresh_tokens_user_id_idx`(`user_id`),
    INDEX `refresh_tokens_family_id_idx`(`family_id`),
    INDEX `refresh_tokens_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `password_reset_tokens` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `token_hash` CHAR(64) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `used_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `password_reset_tokens_token_hash_key`(`token_hash`),
    INDEX `password_reset_tokens_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `leads` (
    `id` CHAR(36) NOT NULL,
    `agency_id` CHAR(36) NOT NULL,
    `assigned_user_id` CHAR(36) NULL,
    `name` VARCHAR(150) NOT NULL,
    `phone` VARCHAR(20) NOT NULL,
    `email` VARCHAR(191) NULL,
    `source` ENUM('WALK_IN', 'PHONE', 'WHATSAPP', 'REFERRAL', 'WEBSITE', 'PROPERTY_PORTAL', 'SOCIAL_MEDIA', 'NEWSPAPER', 'OTHER') NOT NULL DEFAULT 'OTHER',
    `budget_min` DECIMAL(14, 2) NULL,
    `budget_max` DECIMAL(14, 2) NULL,
    `preferred_location` VARCHAR(191) NULL,
    `bhk` TINYINT UNSIGNED NULL,
    `property_type` ENUM('APARTMENT', 'BUNGALOW', 'ROW_HOUSE', 'TENEMENT', 'PENTHOUSE', 'PLOT', 'SHOP', 'OFFICE', 'OTHER') NULL,
    `listing_type` ENUM('SALE', 'RENT') NOT NULL DEFAULT 'SALE',
    `area_min` DECIMAL(12, 2) NULL,
    `area_max` DECIMAL(12, 2) NULL,
    `area_unit` ENUM('SQFT', 'SQYD', 'SQM') NULL,
    `status` ENUM('NEW', 'CONTACTED', 'QUALIFIED', 'SITE_VISIT', 'NEGOTIATION', 'WON', 'LOST') NOT NULL DEFAULT 'NEW',
    `priority` ENUM('LOW', 'MEDIUM', 'HIGH') NOT NULL DEFAULT 'MEDIUM',
    `next_follow_up_at` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `leads_agency_id_deleted_at_status_idx`(`agency_id`, `deleted_at`, `status`),
    INDEX `leads_agency_id_deleted_at_created_at_idx`(`agency_id`, `deleted_at`, `created_at`),
    INDEX `leads_agency_id_assigned_user_id_idx`(`agency_id`, `assigned_user_id`),
    INDEX `leads_agency_id_next_follow_up_at_idx`(`agency_id`, `next_follow_up_at`),
    INDEX `leads_agency_id_phone_idx`(`agency_id`, `phone`),
    INDEX `leads_assigned_user_id_idx`(`assigned_user_id`),
    UNIQUE INDEX `leads_agency_id_id_key`(`agency_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lead_activities` (
    `id` CHAR(36) NOT NULL,
    `agency_id` CHAR(36) NOT NULL,
    `lead_id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NULL,
    `activity_type` ENUM('NOTE', 'CALL', 'WHATSAPP', 'EMAIL', 'MEETING', 'STATUS_CHANGE', 'ASSIGNMENT', 'FOLLOW_UP', 'SITE_VISIT', 'SYSTEM') NOT NULL,
    `description` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `lead_activities_agency_id_lead_id_created_at_idx`(`agency_id`, `lead_id`, `created_at`),
    INDEX `lead_activities_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `properties` (
    `id` CHAR(36) NOT NULL,
    `agency_id` CHAR(36) NOT NULL,
    `assigned_user_id` CHAR(36) NULL,
    `title` VARCHAR(200) NOT NULL,
    `property_type` ENUM('APARTMENT', 'BUNGALOW', 'ROW_HOUSE', 'TENEMENT', 'PENTHOUSE', 'PLOT', 'SHOP', 'OFFICE', 'OTHER') NOT NULL,
    `listing_type` ENUM('SALE', 'RENT') NOT NULL,
    `project_name` VARCHAR(191) NULL,
    `location` VARCHAR(191) NOT NULL,
    `city` VARCHAR(100) NOT NULL DEFAULT 'Ahmedabad',
    `price` DECIMAL(14, 2) NOT NULL,
    `bhk` TINYINT UNSIGNED NULL,
    `area` DECIMAL(12, 2) NULL,
    `area_unit` ENUM('SQFT', 'SQYD', 'SQM') NOT NULL DEFAULT 'SQFT',
    `furnishing` ENUM('UNFURNISHED', 'SEMI_FURNISHED', 'FULLY_FURNISHED') NULL,
    `floor` VARCHAR(30) NULL,
    `parking` TINYINT UNSIGNED NOT NULL DEFAULT 0,
    `description` TEXT NULL,
    `owner_name` VARCHAR(150) NULL,
    `owner_phone` VARCHAR(20) NULL,
    `availability_status` ENUM('AVAILABLE', 'ON_HOLD', 'SOLD', 'RENTED', 'ARCHIVED') NOT NULL DEFAULT 'AVAILABLE',
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `properties_agency_id_deleted_at_availability_status_idx`(`agency_id`, `deleted_at`, `availability_status`),
    INDEX `properties_agency_id_listing_type_property_type_price_idx`(`agency_id`, `listing_type`, `property_type`, `price`),
    INDEX `properties_agency_id_city_location_idx`(`agency_id`, `city`, `location`),
    INDEX `properties_agency_id_bhk_idx`(`agency_id`, `bhk`),
    INDEX `properties_assigned_user_id_idx`(`assigned_user_id`),
    UNIQUE INDEX `properties_agency_id_id_key`(`agency_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `property_images` (
    `id` CHAR(36) NOT NULL,
    `agency_id` CHAR(36) NOT NULL,
    `property_id` CHAR(36) NOT NULL,
    `storage_key` VARCHAR(255) NOT NULL,
    `original_file_name` VARCHAR(255) NOT NULL,
    `mime_type` VARCHAR(100) NOT NULL,
    `size_bytes` INTEGER UNSIGNED NOT NULL,
    `display_order` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `property_images_storage_key_key`(`storage_key`),
    INDEX `property_images_agency_id_property_id_display_order_idx`(`agency_id`, `property_id`, `display_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `follow_ups` (
    `id` CHAR(36) NOT NULL,
    `agency_id` CHAR(36) NOT NULL,
    `lead_id` CHAR(36) NOT NULL,
    `assigned_user_id` CHAR(36) NULL,
    `due_at` DATETIME(3) NOT NULL,
    `status` ENUM('PENDING', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `notes` TEXT NULL,
    `completed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `follow_ups_agency_id_status_due_at_idx`(`agency_id`, `status`, `due_at`),
    INDEX `follow_ups_agency_id_assigned_user_id_status_due_at_idx`(`agency_id`, `assigned_user_id`, `status`, `due_at`),
    INDEX `follow_ups_agency_id_lead_id_due_at_idx`(`agency_id`, `lead_id`, `due_at`),
    INDEX `follow_ups_assigned_user_id_idx`(`assigned_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `site_visits` (
    `id` CHAR(36) NOT NULL,
    `agency_id` CHAR(36) NOT NULL,
    `lead_id` CHAR(36) NOT NULL,
    `property_id` CHAR(36) NOT NULL,
    `assigned_user_id` CHAR(36) NULL,
    `scheduled_at` DATETIME(3) NOT NULL,
    `status` ENUM('SCHEDULED', 'COMPLETED', 'CANCELLED', 'RESCHEDULED') NOT NULL DEFAULT 'SCHEDULED',
    `feedback` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `site_visits_agency_id_status_scheduled_at_idx`(`agency_id`, `status`, `scheduled_at`),
    INDEX `site_visits_agency_id_lead_id_idx`(`agency_id`, `lead_id`),
    INDEX `site_visits_agency_id_property_id_idx`(`agency_id`, `property_id`),
    INDEX `site_visits_assigned_user_id_idx`(`assigned_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `message_templates` (
    `id` CHAR(36) NOT NULL,
    `agency_id` CHAR(36) NOT NULL,
    `title` VARCHAR(150) NOT NULL,
    `message` TEXT NOT NULL,
    `category` VARCHAR(50) NOT NULL DEFAULT 'GENERAL',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `message_templates_agency_id_category_idx`(`agency_id`, `category`),
    UNIQUE INDEX `message_templates_agency_id_title_key`(`agency_id`, `title`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `subscriptions` (
    `id` CHAR(36) NOT NULL,
    `agency_id` CHAR(36) NOT NULL,
    `plan` ENUM('FREE', 'STARTER', 'PROFESSIONAL', 'BUSINESS') NOT NULL DEFAULT 'FREE',
    `status` ENUM('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED') NOT NULL DEFAULT 'ACTIVE',
    `lead_limit` INTEGER UNSIGNED NULL,
    `user_limit` SMALLINT UNSIGNED NULL,
    `starts_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expires_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `subscriptions_agency_id_key`(`agency_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` CHAR(36) NOT NULL,
    `agency_id` CHAR(36) NULL,
    `actor_user_id` CHAR(36) NULL,
    `action` VARCHAR(100) NOT NULL,
    `entity_type` VARCHAR(50) NULL,
    `entity_id` CHAR(36) NULL,
    `metadata` JSON NULL,
    `ip_address` VARCHAR(45) NULL,
    `user_agent` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_agency_id_created_at_idx`(`agency_id`, `created_at`),
    INDEX `audit_logs_agency_id_entity_type_entity_id_idx`(`agency_id`, `entity_type`, `entity_id`),
    INDEX `audit_logs_actor_user_id_idx`(`actor_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `agency_members` ADD CONSTRAINT `agency_members_agency_id_fkey` FOREIGN KEY (`agency_id`) REFERENCES `agencies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `agency_members` ADD CONSTRAINT `agency_members_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `agency_invitations` ADD CONSTRAINT `agency_invitations_agency_id_fkey` FOREIGN KEY (`agency_id`) REFERENCES `agencies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `agency_invitations` ADD CONSTRAINT `agency_invitations_invited_by_id_fkey` FOREIGN KEY (`invited_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `refresh_tokens` ADD CONSTRAINT `refresh_tokens_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `password_reset_tokens` ADD CONSTRAINT `password_reset_tokens_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leads` ADD CONSTRAINT `leads_agency_id_fkey` FOREIGN KEY (`agency_id`) REFERENCES `agencies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leads` ADD CONSTRAINT `leads_assigned_user_id_fkey` FOREIGN KEY (`assigned_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead_activities` ADD CONSTRAINT `lead_activities_agency_id_fkey` FOREIGN KEY (`agency_id`) REFERENCES `agencies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead_activities` ADD CONSTRAINT `lead_activities_agency_id_lead_id_fkey` FOREIGN KEY (`agency_id`, `lead_id`) REFERENCES `leads`(`agency_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead_activities` ADD CONSTRAINT `lead_activities_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `properties` ADD CONSTRAINT `properties_agency_id_fkey` FOREIGN KEY (`agency_id`) REFERENCES `agencies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `properties` ADD CONSTRAINT `properties_assigned_user_id_fkey` FOREIGN KEY (`assigned_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `property_images` ADD CONSTRAINT `property_images_agency_id_fkey` FOREIGN KEY (`agency_id`) REFERENCES `agencies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `property_images` ADD CONSTRAINT `property_images_agency_id_property_id_fkey` FOREIGN KEY (`agency_id`, `property_id`) REFERENCES `properties`(`agency_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `follow_ups` ADD CONSTRAINT `follow_ups_agency_id_fkey` FOREIGN KEY (`agency_id`) REFERENCES `agencies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `follow_ups` ADD CONSTRAINT `follow_ups_agency_id_lead_id_fkey` FOREIGN KEY (`agency_id`, `lead_id`) REFERENCES `leads`(`agency_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `follow_ups` ADD CONSTRAINT `follow_ups_assigned_user_id_fkey` FOREIGN KEY (`assigned_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `site_visits` ADD CONSTRAINT `site_visits_agency_id_fkey` FOREIGN KEY (`agency_id`) REFERENCES `agencies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `site_visits` ADD CONSTRAINT `site_visits_agency_id_lead_id_fkey` FOREIGN KEY (`agency_id`, `lead_id`) REFERENCES `leads`(`agency_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `site_visits` ADD CONSTRAINT `site_visits_agency_id_property_id_fkey` FOREIGN KEY (`agency_id`, `property_id`) REFERENCES `properties`(`agency_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `site_visits` ADD CONSTRAINT `site_visits_assigned_user_id_fkey` FOREIGN KEY (`assigned_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `message_templates` ADD CONSTRAINT `message_templates_agency_id_fkey` FOREIGN KEY (`agency_id`) REFERENCES `agencies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_agency_id_fkey` FOREIGN KEY (`agency_id`) REFERENCES `agencies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_agency_id_fkey` FOREIGN KEY (`agency_id`) REFERENCES `agencies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_actor_user_id_fkey` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
