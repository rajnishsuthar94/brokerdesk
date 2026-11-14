# BrokerDesk – Security review (Phase 7, November 2026)

A review of the whole application before production, against the project rules:
- tenant isolation;
- never trusting a client-supplied `agency_id`;
- no secrets in the frontend or the repository;
- no unofficial WhatsApp automation;
- no payment gateway.

The design is described in [security.md](security.md); this file records what was checked and what was fixed.

## Method

1. **Automated suites:**
   - API unit tests;
   - API end-to-end tests against real MySQL, including the cross-tenant suite;
   - web unit tests;
   - Playwright, including a test of the production build served with the deployment headers.
2. **Mutation checks of the isolation tests.** The tenant filter was removed in turn from:
   - member lookup;
   - `leadScope`;
   - `propertyScope`;
   - `followUpScope`;
   - `siteVisitScope`;
   - the message-template lookup.

   The tests failed every time, as they should. The route-protection test was also mutated by marking a controller `@Public()`, and it failed.
3. **Route inventory.** A new test (`apps/api/test/route-protection.e2e-spec.ts`) lists **every registered route**. All of them return **401 without a token**, except an explicit allowlist:
   - health;
   - register / login / refresh / logout / forgot-password / reset-password;
   - invitation preview;
   - the public enquiry form;
   - signed media URLs.
4. **Dependency audit:** `npm audit --omit=dev` reports **0 vulnerabilities in production dependencies**.

   The full audit lists 12 *moderate* issues. They all come from one `minimatch` ReDoS advisory, pulled in through the dev-only lint toolchain (`typescript-eslint`, `angular-eslint`).
   - That code never runs in production or on untrusted input.
   - The suggested "fix" is a downgrade to angular-eslint 18, which is incompatible with Angular 22.
   - **Accepted. Re-check when the lint packages release a patched version.**
5. **Secrets scan:**
   - The production web bundle contains no environment variable names, connection strings or the JWT secret value (checked against the real `.env`).
   - `.env`, uploads (`apps/api/storage`) and build output are git-ignored.
6. **Configuration review:** Dockerfiles, compose files, nginx, Helmet, CORS and production env validation.

## Findings and fixes

| # | Finding | Severity | Fix |
|---|---|---|---|
| 1 | nginx cached every `*.js` for a year as `immutable`, including `ngsw-worker.js`, so a service worker could pin users to an old release | High (availability) | Service-worker files and the manifest are served `no-cache`, in an explicit location block |
| 2 | No Content-Security-Policy on the web app. A CSP was also impossible as built, because the production `index.html` contained an inline script (critical-CSS loader) | Medium | Critical-CSS inlining disabled. Strict CSP added (`script-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`, …) with COOP, a fuller Permissions-Policy, and headers repeated in every nginx location. **Verified against the real production build in Playwright**: no CSP violations, styles applied, charts and forms work |
| 3 | Photos had no persistent volume, and the non-root API user could not write the storage directory in the image | High (data loss) | `api-storage` volume, plus a `chown`ed directory in the image. Covered by the backup script |
| 4 | nginx `client_max_body_size 10m` was smaller than one allowed photo upload (10 × 8 MB) | Low (functional) | Raised to 90 MB, matching the API's own limits, which are still enforced |
| 5 | Plan CLI depended on `dotenv`, a dev dependency, so it would crash in the production image | Low | Uses Node's built-in `process.loadEnvFile`, which never overrides existing variables (verified) |
| 6 | Follow-ups and site visits could be assigned to an agent who cannot see the lead, so the reminder was invisible | Low (integrity) | Agents can only be given work on leads assigned to them. Reassigning a lead hands over open work |
| 7 | Follow-ups created with unassigned leads (create/import) had no assignee, so they were in nobody's reminders | Low | Defaults to the creator, like the follow-up endpoint |
| 8 | Service worker could cache API responses (tenant data, signed URLs) | Prevented by design | `dataGroups: []` and `/api/**` excluded from navigation. **Tested**: the cache holds app files only |

## Confirmed controls

- **Tenant isolation:**
  - Every query is built from the server-side `TenantContext`. The agency comes from a verified membership, never from the request.
  - Composite foreign keys `(agency_id, …)` stop cross-tenant references at the database level.
  - Foreign ids return the same 404 as random ids.
- **Authentication:**
  - Argon2id password hashing.
  - 15-minute JWTs, kept in memory only.
  - Rotating, hashed refresh tokens in HttpOnly `SameSite=Strict` cookies, with reuse detection.
  - The refresh/logout endpoints require the `X-BrokerDesk-Client` header (CSRF defence).
  - Login, registration, reset and the public form are rate-limited.
- **Authorization:** role guards on every privileged route. Agents are scoped to their own leads in all features: leads, follow-ups, visits, dashboard and reports.
- **Uploads:**
  - The real file type is detected from the bytes.
  - Images are re-encoded to WebP, with EXIF/GPS stripped.
  - Pixel limits are enforced.
  - Files are private and served through signed, expiring URLs.
- **Spreadsheet import:** content sniffing, zip-bomb guard, row/size limits, and formula-injection-safe CSV export.
- **WhatsApp:** official `wa.me` click-to-chat links only. Nothing is sent automatically, and no scraping is used.
- **Payments:** no gateway. Plan changes go through the operator CLI only (not HTTP) and are audited.
- **Production configuration:** the API refuses to boot with a placeholder JWT secret, http URLs, insecure cookies or log-mode email. Swagger is off in production, and MySQL is never published.

## Open items (accepted for now, tracked)

1. **Email provider** is needed for password reset and upgrade-request emails.
2. **Per-account login lockout** is missing; rate limiting is per IP only.
3. **Email verification** at signup is not implemented.
4. **Redis-backed rate limiting** is needed before running more than one API instance.
5. **`style-src 'unsafe-inline'`** is required by Angular component styles. Consider nonce-based CSP (`ngCspNonce`) later.
6. **Re-run this review and `npm audit` for every release.**
