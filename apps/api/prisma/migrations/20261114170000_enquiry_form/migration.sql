-- Online enquiry form (public lead capture).
--
-- Hand-written so it is safe on databases that already contain agencies:
-- the public slug is added as NULLable, backfilled with a unique, unguessable
-- value per agency, and only then made NOT NULL + UNIQUE.

-- AlterTable: enquiry form switch + public slug (temporarily nullable)
ALTER TABLE `agencies`
    ADD COLUMN `enquiry_form_enabled` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `public_slug` VARCHAR(80) NULL;

-- Backfill: "<name-as-slug>-<8 random hex chars>", e.g. "sabarmati-realty-3f9c2a1b".
-- Names without Latin letters/digits (e.g. Gujarati) fall back to "agency".
UPDATE `agencies`
SET `public_slug` = CONCAT(
    COALESCE(
        NULLIF(TRIM(BOTH '-' FROM LEFT(REGEXP_REPLACE(LOWER(`name`), '[^a-z0-9]+', '-'), 40)), ''),
        'agency'
    ),
    '-',
    LEFT(SHA2(CONCAT(`id`, RAND(), NOW(6)), 256), 8)
)
WHERE `public_slug` IS NULL;

ALTER TABLE `agencies` MODIFY `public_slug` VARCHAR(80) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX `agencies_public_slug_key` ON `agencies`(`public_slug`);

-- AlterTable: new lead source
ALTER TABLE `leads` MODIFY `source` ENUM('WALK_IN', 'PHONE', 'WHATSAPP', 'REFERRAL', 'WEBSITE', 'PROPERTY_PORTAL', 'SOCIAL_MEDIA', 'NEWSPAPER', 'ENQUIRY_FORM', 'OTHER') NOT NULL DEFAULT 'OTHER';
