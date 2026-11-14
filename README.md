# BrokerDesk

A mobile-first, multi-tenant CRM for real estate brokers in Ahmedabad and across India. It covers leads, property inventory, buyer–property matching, follow-ups, and site visits.

| | |
|---|---|
| Frontend | Angular 22 (standalone, signals, zoneless) + Tailwind CSS 4 — `apps/web` |
| Backend | NestJS 12 (ESM) REST API + Swagger — `apps/api` |
| Database | MySQL 8.4 LTS via Prisma 7 — `apps/api/prisma` |
| Shared | Enums, API types and pure business rules — `packages/shared-types` |
| Tests | Vitest (API + web), Playwright (e2e) |

See [docs/architecture.md](docs/architecture.md), [docs/database.md](docs/database.md) and [docs/security.md](docs/security.md).

## Status

| Phase | Scope | Status |
|---|---|---|
| 1 | Monorepo, Angular, NestJS, MySQL/Docker, Prisma schema + first migration, health check | ✅ Done |
| 2 | Auth, agencies, membership, roles, tenant isolation, team & settings UI | ✅ Done |
| 3 | Leads: CRUD, search/filters/sort/pagination, assignment, status, activity history, Excel/CSV import, CSV export | ✅ Done |
| 3+ | Online enquiry form: public link + QR code per agency, submissions become leads | ✅ Done |
| 4 | Property inventory, photos (private, EXIF/GPS stripped), explainable buyer–property matching | ✅ Done |
| 5 | Follow-ups (today/overdue/upcoming), site visits, dashboard with KPIs & charts, in-app reminder bell | ✅ Done |
| 6 | Reports (IST ranges, Indian FY, CSV), plan & usage with upgrade requests (no payment gateway), WhatsApp templates | ✅ Done |
| 7 | PWA (installable, offline app shell, update prompt), responsive check at 360 px, security review & fixes, CSP, production deployment (Caddy/HTTPS, backups) | ✅ Done |

## Prerequisites

- **Node.js 22.22.3+** (see `.nvmrc`) and npm 10+
- **MySQL 8.4**: either Docker Desktop (recommended), or a local MySQL 8.4 server

## Local setup

```bash
# 1. Install all workspaces (also builds shared-types and generates the Prisma client)
npm install

# 2. Configure the environment (one .env at the repo root serves Docker, API and Prisma)
cp .env.example .env
#    then edit the passwords in .env – keep DATABASE_URL in sync with MYSQL_PASSWORD –
#    and set JWT_ACCESS_SECRET to a random value:
#    node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"

# 3. Start MySQL
npm run db:up            # = docker compose up -d mysql

# 4. Create the schema and load demo data
npm run db:migrate
npm run db:seed

# 5. Run the apps (two terminals)
npm run dev:api          # http://localhost:3000/api/v1  · Swagger: http://localhost:3000/api/docs
npm run dev:web          # http://localhost:4200 (proxies /api to :3000)
```

**Changing `packages/shared-types`?** The web app compiles it from source, so `dev:web` picks up changes instantly. The API loads its compiled `dist/`, so also run `npm run dev:types` in a third terminal (or `npm run build:types` once) and let `dev:api` restart.

Open http://localhost:4200 and create an account (or log in with a demo account below).

**Email in development:** no email provider is integrated yet. With `MAIL_DRIVER=log` (the dev default) password-reset and invitation emails, including their links, are printed in the `dev:api` terminal. Invitation links are also shown to the inviting owner/admin with a **Share on WhatsApp** button.

### Without Docker (native MySQL on Windows)

Skip step 3 (`npm run db:up`) and do this instead:

1. Install MySQL 8.4 from an **Administrator** terminal: `winget install Oracle.MySQL`
2. Run **MySQL Configurator** (Start menu) to configure the server. Choose port 3306, set a root password, and run it as a Windows service.
3. Edit `docker/mysql/local-setup.sql` so its password matches the one in `.env` (`DATABASE_URL`). Then run it:
   ```bash
   "C:\Program Files\MySQL\MySQL Server 8.4\bin\mysql.exe" -u root -p < docker/mysql/local-setup.sql
   ```
4. Continue with step 4 (`npm run db:migrate`, `npm run db:seed`).

### Getting leads automatically: the online enquiry form

Leads → **Get leads online** shows your agency's public enquiry link and QR code. Share the link on WhatsApp, Instagram or Facebook, or print the QR code. When a buyer fills it in, they appear in Leads with source **"Enquiry form / QR"**, unassigned (so owners/admins can assign them).

The QR code and links use `APP_BASE_URL`. With the local default (`http://localhost:4200`) a phone **cannot** open them. To try it on a real phone, set `APP_BASE_URL` to your computer's LAN address (e.g. `http://192.168.1.10:4200`) and run `npm run dev:web -- --host 0.0.0.0`. In production it must be your public HTTPS domain.

### Demo accounts (seed, local only)

The seed creates two separate agencies so cross-tenant isolation can be tried by hand:

| Agency | Email | Role |
|---|---|---|
| Sabarmati Realty (Professional plan) | owner@sabarmati-realty.test | Owner |
| Sabarmati Realty | agent@sabarmati-realty.test | Agent |
| Navrang Homes (Free plan) | owner@navrang-homes.test | Owner |

The password is `BrokerDesk@2026` unless `SEED_USER_PASSWORD` is set. The seed refuses to run when `NODE_ENV=production`, and does nothing if the seed data already exists.

### Full stack in containers

```bash
docker compose --profile app up --build    # MySQL → migrate → API → web at http://localhost:8080
```

## Commands

| Command | What it does |
|---|---|
| `npm run build` | Build shared-types, API and web (production) |
| `npm run lint` | oxlint (API) + angular-eslint (web) |
| `npm run typecheck` | `tsc --noEmit` for shared-types and API (web is type-checked by `ng build`) |
| `npm test` | API unit tests, API e2e tests (including the cross-tenant security suite) and web unit tests |
| `npm run test:e2e` | Playwright browser tests. Starts its own API (:3300) and web (:4400), so it never touches your dev servers |
| `npm run db:migrate:dev -- --name x` | Create a migration from schema changes |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:seed` | Load demo data |
| `npm run db:studio` | Prisma Studio |

**Test database.** API e2e and Playwright tests use `TEST_DATABASE_URL` (from `.env`). The database name must end in `_test`. Tests migrate it and **wipe all its tables**, and they never touch your dev database. Without `TEST_DATABASE_URL`, the database-backed API suites are skipped (reported as skipped) and Playwright refuses to start.

Optional switches:

- `E2E_CHANNEL=msedge` (or `chrome`) makes Playwright use an installed browser. Otherwise run `npx playwright install chromium` once.
- `E2E_BASE_URL=http://host:port` tests an already-running deployment.

## API endpoints

All routes require a Bearer access token **and** a verified membership of the active agency, unless marked otherwise. The full reference is in Swagger at `/api/docs`.

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/v1/health`, `/health/live` | public | Readiness (incl. MySQL) / liveness |
| POST | `/api/v1/auth/register` | public, rate-limited | Create account (+ agency if `agencyName` is given) |
| POST | `/api/v1/auth/login` | public, rate-limited | Log in. Returns an access token and sets the HttpOnly refresh cookie |
| POST | `/api/v1/auth/refresh` | refresh cookie + `X-BrokerDesk-Client` header | Rotate the refresh token; new access token |
| POST | `/api/v1/auth/logout` | refresh cookie + header | Revoke this device's session |
| POST | `/api/v1/auth/forgot-password` | public, rate-limited | Always 202; emails a reset link if the account exists |
| POST | `/api/v1/auth/reset-password` | public, rate-limited | One-time token; signs out all devices |
| GET | `/api/v1/auth/me` | signed in | Profile + memberships |
| POST | `/api/v1/auth/switch-agency` | signed in | Access token for another agency the user belongs to |
| POST | `/api/v1/auth/change-password` | signed in | Signs out other devices |
| PATCH | `/api/v1/users/me` | signed in | Update name / mobile |
| POST | `/api/v1/agencies` | signed in | Create another agency (caller becomes owner) |
| GET / PATCH | `/api/v1/agencies/current` | member / owner+admin | View / edit agency details |
| POST | `/api/v1/agencies/current/leave` | member | Leave (last owner cannot) |
| GET | `/api/v1/agencies/current/members` | member | Team list |
| PATCH / DELETE | `/api/v1/agencies/current/members/:id` | owner, admin (agents only) | Change role / remove |
| GET / POST / DELETE | `/api/v1/agencies/current/invitations[/:id]` | owner, admin | Pending invitations (seat limits enforced) |
| POST | `/api/v1/invitations/preview`, `/accept` | public / signed in | Invitee side (token in body; email must match) |
| GET | `/api/v1/leads` | member* | Search (`search`), filters (`status`, `priority`, `source`, `listingType`, `propertyType`, `assignedTo`=me/unassigned/id, `followUp`=overdue/today/upcoming/none), `sort`/`order`, `page`/`pageSize` (≤100) |
| POST | `/api/v1/leads` | member* | Create (409 `DUPLICATE_LEAD` unless `allowDuplicate`; 403 `LEAD_LIMIT_REACHED` over plan limit) |
| GET / PATCH / DELETE | `/api/v1/leads/:id` | member* / member* / owner+admin | Read, edit, soft-delete |
| PATCH | `/api/v1/leads/:id/status`, `/assignee` | member* / owner+admin | Change status (with note), assign |
| GET / POST | `/api/v1/leads/:id/activities` | member* | History; log a note / call / WhatsApp / email / meeting |
| GET | `/api/v1/leads/export` | owner, admin | CSV of the filtered leads (Excel-safe) |
| POST | `/api/v1/leads/import?mode=preview|commit&duplicates=skip|create` | owner, admin | Multipart `file`: Excel `.xlsx` (first sheet) or CSV, ≤ 1 MB / 2,000 rows. Type detected from content; old `.xls` rejected |

| GET / POST | `/api/v1/public/enquiry/:slug` | **public**, rate-limited | Agency name/city; submit an enquiry (consent required). Creates a lead, or adds to the existing lead with that phone |
| GET / PATCH | `/api/v1/agencies/current/enquiry-form` | member / owner+admin | Link + on/off |
| POST | `/api/v1/agencies/current/enquiry-form/reset-link` | owner, admin | New link; the old one stops working |

| GET / POST | `/api/v1/properties` | member | List (search, listing/type/BHK/price/availability filters, sort, paging); create |
| GET / PATCH / DELETE | `/api/v1/properties/:id` | member / owner+admin+assigned agent / owner+admin | Read, edit, soft-delete (or set ARCHIVED) |
| POST / DELETE / PUT | `/api/v1/properties/:id/images`, `/images/:imageId`, `/images/order` | owner+admin+assigned agent | Upload (≤10 per request, ≤20 per property; re-encoded to WebP, metadata stripped), delete, reorder (first = cover) |
| GET | `/api/v1/media/…?exp&sig` | signed URL | Serves private images; URLs come from property responses and expire |
| GET | `/api/v1/leads/:id/matches` | member* | Best properties for a buyer, with per-criterion explanations |
| GET | `/api/v1/properties/:id/matches` | member* | Best buyers for a property (agents: only their own leads) |

| GET / POST | `/api/v1/follow-ups` | member* | List by `view` = today / overdue / upcoming / completed / cancelled / all (IST days); schedule one |
| PATCH | `/api/v1/follow-ups/:id` | member* | Reschedule, edit notes, reassign (pending only) |
| POST | `/api/v1/follow-ups/:id/complete`, `/cancel` | member* | Mark done (optional `outcome`, optional `nextDueAt` schedules the next one) / cancel |
| GET | `/api/v1/leads/:id/follow-ups` | member* | Follow-up history of a lead |
| GET / POST | `/api/v1/site-visits` | member* | List by `view` = upcoming / past / all; schedule (lead + property + time) |
| PATCH | `/api/v1/site-visits/:id` | member* | Reschedule / reassign an open visit |
| POST | `/api/v1/site-visits/:id/complete`, `/cancel` | member* | Record the visit (optional `feedback`) / cancel |
| GET | `/api/v1/leads/:id/site-visits`, `/properties/:id/site-visits` | member* | Visits of a lead / of a property |
| GET | `/api/v1/dashboard` | member* | KPIs, last-6-months charts (IST months), lead mix, today's agenda |
| GET | `/api/v1/dashboard/reminders` | member | The caller's own overdue / due-today follow-ups and today's visits (header bell) |

| GET | `/api/v1/reports?from=YYYY-MM-DD&to=YYYY-MM-DD` | member* | Report for an IST date range (≤ 366 days, default this month): totals, sources, funnel, team, top properties |
| GET | `/api/v1/reports/export?section=team|sources` | owner, admin | CSV of a report table (audited) |
| GET | `/api/v1/subscription` | member | Plan, status, limits in force, usage, plan catalogue |
| POST | `/api/v1/subscription/upgrade-request` | owner, admin | Ask for a plan (audited, emailed to `SALES_CONTACT_EMAIL`; 10-minute cooldown). **No payment is taken** |
| GET / POST | `/api/v1/message-templates` | member / owner+admin | WhatsApp message templates (≤ 50 per agency) |
| PATCH / DELETE | `/api/v1/message-templates/:id` | owner, admin | Edit / delete |
| POST | `/api/v1/message-templates/defaults` | owner, admin | Add the starter templates the agency doesn't have yet |

* **Agents only see and work on leads assigned to them.** Leads they create are assigned to them, and leads outside their scope return 404. Owners and admins see every lead in the agency. Follow-ups, site visits and dashboard numbers follow the same rule, because they are scoped through the lead.

**Reminders are in-app only.** The header bell re-checks every 5 minutes while BrokerDesk is open. There are no push, SMS or email notifications yet, because that needs notification infrastructure that isn't built.

## Plans and billing (no payment gateway)

BrokerDesk does not take online payments. Plans are managed like this:

1. **Limits are enforced on the server.** New leads (including imports and enquiry-form leads) and team seats are checked against the agency's plan inside a locked transaction.
2. **An ended plan falls back to Free limits.** When a paid plan is cancelled, expired or past its end date, the Free plan's limits apply. Nothing is deleted; only adding beyond those limits is blocked.
3. **Customers ask for an upgrade from the app.** Owners and admins send a request from **Plan & usage**. It is audited and emailed to `SALES_CONTACT_EMAIL`.
4. **An operator applies the plan after payment is arranged.** Run:
   ```bash
   npm run plan:set -w @brokerdesk/api -- --agency <agency-id> --plan PROFESSIONAL --months 12
   # in the production image: node dist/cli/set-plan.js --agency … --plan … --months …
   ```
   This is deliberately not reachable over HTTP. It snapshots the plan's limits and writes the change to the audit log.
5. **Prices and limits are configurable.** The defaults are in `apps/api/src/subscriptions/plan-catalog.ts` (prices in paise). Override them with `PLAN_CATALOG_JSON`, which is validated at boot.

**WhatsApp:** messages use WhatsApp's official click-to-chat links (`https://wa.me/<number>?text=…`). WhatsApp opens with the text ready, and the broker reviews and sends it. Nothing is sent automatically, and no unofficial automation is used.

## Security notes

- Secrets live only in `.env` / the server environment. `.env` is git-ignored, and the Angular bundle contains no configuration secrets. The API base URL is the relative `/api/v1`.
- MySQL is published on `127.0.0.1` only.
- `allowPublicKeyRetrieval=true` in `DATABASE_URL` is for local, non-TLS MySQL 8.4 only. In production, connect over TLS (`?ssl=true` plus CA settings) and drop it.
- Authentication and tenant-isolation design: see [docs/security.md](docs/security.md).
- **Production deployment:** [docs/deployment.md](docs/deployment.md). **Security review:** [docs/security-review.md](docs/security-review.md).

## Mobile app (PWA)

Production builds are an installable Progressive Web App. Use "Install app" / "Add to Home screen" in Chrome or Edge on Android and desktop, or Safari's Share → Add to Home Screen on iPhone.

- The app shell is cached, so BrokerDesk opens offline and shows an offline notice. Loading and saving data still need a connection; API data is never cached on the device.
- New releases show a "Reload" prompt.
- There are **no push notifications**: reminders appear in the app while it is open.
