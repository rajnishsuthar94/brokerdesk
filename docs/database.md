# BrokerDesk – Database design

Source of truth: `apps/api/prisma/schema.prisma`. The first migration is `apps/api/prisma/migrations/20261114000000_init`.

## Conventions

| Topic | Decision | Why |
|---|---|---|
| Primary keys | UUID **v7** stored as `CHAR(36)` | v7 IDs are time-ordered, so inserts into InnoDB's clustered index stay append-only. The brief asked for UUIDs |
| Naming | snake_case tables/columns (`@@map`/`@map`), camelCase in code | Follows MySQL convention |
| Money | `DECIMAL(14,2)` | Avoids floating-point rounding. Holds up to ₹999,999,999,999.99 |
| Area | `DECIMAL(12,2)` plus an `area_unit` enum (SQFT/SQYD/SQM) | Ahmedabad listings commonly use sq. yd. for bungalows and plots |
| Time | `DATETIME(3)` in **UTC** (MySQL server `default-time-zone=+00:00`) | The UI converts to Asia/Kolkata |
| Enums | MySQL `ENUM` columns generated from Prisma enums, mirrored in `packages/shared-types` | Adding a value needs a migration |
| Charset | `utf8mb4` / `utf8mb4_unicode_ci` | Handles Gujarati/Hindi names and emoji |
| Phones | `VARCHAR(20)`, E.164 (`+919876543210`), normalised by the application | |

## Deletion strategy

- Business records use `ON DELETE RESTRICT` (agencies, leads, properties, follow-ups, visits, activities, templates, subscriptions, audit logs). A stray delete cannot cascade through customer data.
- Leads and properties are **soft-deleted** through `deleted_at`, and their history is kept. Archiving a property can also use `availability_status = ARCHIVED`.
- Optional assignee/author references use `ON DELETE SET NULL`.
- Only security tokens (`refresh_tokens`, `password_reset_tokens`) cascade when their user is deleted.

## Tenant safety in the schema

- Every tenant-owned table has `agency_id` with a foreign key to `agencies`.
- `leads` and `properties` have `UNIQUE (agency_id, id)`. Child tables use that key as a **composite foreign key**:
  - `lead_activities (agency_id, lead_id) → leads (agency_id, id)`
  - `follow_ups (agency_id, lead_id) → leads (agency_id, id)`
  - `site_visits (agency_id, lead_id) → leads`, `(agency_id, property_id) → properties`
  - `property_images (agency_id, property_id) → properties`
  
  Verified on MySQL 8.4.11: inserting a follow-up for agency B that references agency A's lead fails with `ER_NO_REFERENCED_ROW_2 (1452)`.
- One limitation: Prisma cannot model a composite FK on an *optional* relation, so `assigned_user_id` references `users(id)` directly. Assignee membership is checked in the service layer (Phase 2+).
- Prisma note: because `agency_id` is shared between relations, children must be created with an explicit `agencyId` (`createMany`/`create` on the child model). Nested writes through the parent will not work.

## Changes from the brief

| Change | Reason |
|---|---|
| **Added `agency_invitations`** | The brief requires "invite team member". The table stores a SHA-256 token hash, role, expiry, and accepted/revoked timestamps |
| **Added `refresh_tokens`** | The brief requires refresh-token rotation and revocation. Each row stores a hash only. `family_id` enables reuse detection: replaying a rotated token revokes the whole family |
| **Added `password_reset_tokens`** | Needed for forgot/reset password. Tokens are hashed, single-use (`used_at`), and expire |
| **Added `audit_logs`** | The brief requires audit logging. The table is append-only. `agency_id` is nullable for pre-tenant events such as login |
| `leads.area_min/area_max/area_unit` | Matching on area "when supplied" needs the buyer's area requirement |
| `leads.deleted_at`, `properties.deleted_at` | Soft delete ("delete with safeguards", "delete or archive") |
| `property_images.mime_type`, `size_bytes` | Needed to validate and serve uploads safely |
| `users.last_login_at` | Security visibility |
| `agencies.public_slug` (UNIQUE) and `enquiry_form_enabled` | Public enquiry form (migration `20261114170000_enquiry_form`). Hand-written migration: existing agencies are backfilled with a unique slug before the column becomes NOT NULL |
| Lead source `ENQUIRY_FORM` | Leads created from the public form |
| `agencies.timezone` (default `Asia/Kolkata`), `country` (ISO-2, default `IN`) | Per-agency localisation |
| `subscriptions.agency_id` is UNIQUE | Each agency has one current subscription. Limits are copied from the plan catalogue when the plan changes, so later catalogue edits never change an existing customer's limits. `NULL` means unlimited |
| `subscriptions.status` adds `TRIALING`, `PAST_DUE` | Ready for billing later. No payment gateway is integrated |
| `message_templates`: `UNIQUE (agency_id, title)` | Prevents duplicate template names within an agency |
| `properties.floor` is `VARCHAR(30)` | Brokers write values like "G", "7 of 13", "Penthouse" |
| `properties.parking` is a count | |
| `lead_activities.user_id` is nullable | Allows system-generated entries |

## Derived columns (Phase 5)

- `leads.next_follow_up_at` is a **denormalised copy** of the earliest PENDING follow-up, used for fast list filters and sorting. It is only written by `syncNextFollowUp()`, after every follow-up change. It can't be edited directly: it can be set on create only, and that creates a real follow-up.
- `leads.closed_at` (migration `20261115090000_lead_closed_at`) is set when a lead becomes WON/LOST and cleared if it is reopened. Monthly "deals closed" counts use it instead of `updated_at`, which changes on any edit. The migration backfills existing WON/LOST rows with `updated_at` as the best available estimate.

## Indexes

Indexes are composite and lead with `agency_id`, so every tenant-scoped list query can use them. Examples:

- leads: `(agency_id, status, closed_at)` (deals-closed chart),
  `(agency_id, deleted_at, status)`, `(agency_id, deleted_at, created_at)`, `(agency_id, assigned_user_id)`, `(agency_id, next_follow_up_at)`, `(agency_id, phone)` (duplicate detection on CSV import)
- properties: `(agency_id, listing_type, property_type, price)` (matching), `(agency_id, city, location)`, `(agency_id, bhk)`
- follow_ups: `(agency_id, status, due_at)` (today/overdue/upcoming views), `(agency_id, assigned_user_id, status, due_at)`
- site_visits: `(agency_id, status, scheduled_at)`

## Workflow

```bash
# Change schema.prisma, then create a migration (needs MySQL + shadow DB):
npm run db:migrate:dev -- --name describe_change
# Apply migrations (CI / production):
npm run db:migrate
```
