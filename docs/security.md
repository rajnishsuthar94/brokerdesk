# BrokerDesk – Security model

This page covers how authentication, tenant isolation and authorization work. It also lists what is verified by tests and what is still open.

## 1. Tenant isolation

**Rule: an agency never sees or changes another agency's data, and the browser is never trusted to say which agency it belongs to.**

Isolation is enforced in four layers:

| Layer | Mechanism | Where |
|---|---|---|
| Database | Every tenant-owned table has `agency_id`. Child rows reference parents through **composite foreign keys** `(agency_id, parent_id) → parent(agency_id, id)`, so MySQL rejects a follow-up in agency B that points at a lead in agency A | `prisma/schema.prisma` |
| Request context | A global `AccessGuard` checks the JWT. **On every request** it then loads the user's `agency_members` row for the agency named in the token. The resulting `TenantContext { userId, agencyId, memberId, role }` comes from that row. The role is never read from the token | `auth/guards/access.guard.ts` |
| Deny by default | Every route requires authentication **and** a verified membership. Exceptions must be marked explicitly: `@Public()` or `@AllowNoAgency()` | `common/auth/auth.decorators.ts` |
| Services | Every query on tenant data filters by `ctx.agencyId`, and lookups by id use `findFirst({ where: { id, agencyId } })`. Another agency's id gives the **same 404** as a random id, so its existence can't be inferred. Request bodies cannot carry `agencyId` (`forbidNonWhitelisted` rejects unknown fields) | e.g. `agencies/members.service.ts` |

Because the membership is re-checked on every request, a removed member or a changed role takes effect **immediately**. Nobody has to wait for an access token to expire.

**Rules for future features (Phase 3+):**

1. Inject `@Tenant() ctx` and filter every query by `ctx.agencyId`.
2. Never accept `agencyId` from a request body, query string or header.
3. Before storing an assignee id sent by a client, call `MembersService.assertIsMember(ctx.agencyId, userId)`. Prisma cannot model a composite FK for optional assignees.
4. Add the new resource to the cross-tenant suite (`apps/api/test/tenant-isolation.e2e-spec.ts`).

## 2. Authentication

| Aspect | Implementation |
|---|---|
| Passwords | Argon2id (m = 19 MiB, t = 2, p = 1; OWASP minimum). Old hashes are upgraded on login via `needsRehash`. Policy: 8–128 characters with at least one letter and one digit |
| User enumeration | Login always runs a full Argon2 verification, even for unknown emails, and returns one generic message. Forgot-password always returns 202 and does its work after responding. Registration does reveal that an email is taken (409); rate limiting mitigates this |
| Access token | JWT HS256, 15 min, with issuer/audience checked and `alg` pinned. Claims: `sub`, `aid` (agency hint), `typ`. The browser keeps it **in memory only**, never in localStorage |
| Refresh token | 256-bit random value in an **HttpOnly, SameSite=Strict, Secure (prod)** cookie scoped to `/api/v1/auth`. Only its SHA-256 is stored. **Rotated on every use** |
| Reuse detection | Presenting an already-rotated token revokes the whole token family and writes an audit event. A 30 s grace window treats two tabs refreshing at once as a race (`REFRESH_RACE`, client retries) rather than theft |
| CSRF | Cookie-authenticated endpoints (refresh, logout) also need an `X-BrokerDesk-Client` header, which cross-site forms cannot set. Together with SameSite=Strict and the same-origin deployment, this blocks CSRF |
| Password reset | Single-use, 30 min token. A new request invalidates older links. A successful reset **signs out every device** |
| Password change | Needs the current password. Signs out every other device |
| Rate limiting | `/auth/*` and `/invitations/*`: 10 requests/min per client IP by default (`AUTH_THROTTLE_*`). The store is in memory, so a shared store (Redis) is needed before running more than one API instance |
| Deactivated users | Refused at login, refresh and on every request |

## 3. Authorization (roles)

The rules live in `packages/shared-types/src/member-policy.ts`, a single source of truth. The API uses them to enforce access; the UI uses them only to decide which buttons to show.

| Actor | Invite / assign | Change role or remove |
|---|---|---|
| OWNER | Owner, Admin, Agent | Anyone except themselves |
| ADMIN | Admin, Agent | Agents only |
| AGENT | — | — |

Also enforced:

- Nobody can change their own role.
- An agency always keeps at least one owner (`SELECT … FOR UPDATE` prevents races).
- Seat limits come from the subscription and include pending invitations (row-locked).
- Each account can own at most 5 agencies.
- Invitations can only be accepted by the invited email address.

### Leads (Phase 3)

| Role | Sees | Can |
|---|---|---|
| OWNER, ADMIN | Every lead in the agency | Everything: create, edit, status, assign, delete (soft), import, export |
| AGENT | **Only leads assigned to them** | Create (auto-assigned to themselves), edit, change status, log activity. Cannot reassign, delete, import or export |

- Every lead query starts from `leadScope(ctx)` (`apps/api/src/leads/lead-query.ts`): same agency, not deleted, and for agents assigned to them. A lead outside the caller's scope gets the same 404 as a missing one.
- Assignees are always checked against the caller's agency (`MembersService.assertIsMember`), including assignees named in CSV imports.
- Duplicate-phone detection is per agency. Agents are not told the name of a duplicate lead they cannot see.
- CSV export neutralises formula injection (cells starting with `= + - @` get a leading apostrophe), is limited to owners/admins, and is audited.
- Plan lead limits are enforced inside the create/import transaction with a row lock.
- **Excel import:** the file type is detected from its content, not its name. An `.xlsx` is a ZIP archive that the parser unpacks in memory, so the ZIP directory is inspected **before** any decompression: archives declaring more than 20 MB uncompressed or more than 200 entries are rejected (zip-bomb protection; covered by a unit test and an e2e test with a real 30 MB-of-zeros bomb). Together with the 1 MB upload cap, the 2,000-row cap and owner/admin-only access. Limitation: the check trusts the sizes declared in the archive; a deliberately falsified directory is only bounded by those other limits.

### Public enquiry form

`/api/v1/public/enquiry/:slug` is the only route that writes data without a login, so it is deliberately narrow:

- **Link:** `<name>-<8 random hex>`. It can't be enumerated, can be reset (the old link dies immediately) and switched off. Unknown, malformed and disabled links all return the same 404.
- **Input:** the public DTO accepts only requirement fields. Status, priority, assignee, source and agency are always set by the server, and extra fields return 400.
- **Consent:** a contact-consent checkbox is required (India's DPDP Act). Its acceptance is recorded in the lead's history.
- **Spam:**
  - per-IP rate limit (5 per 10 minutes by default), separate from the login limit;
  - daily cap of new form leads per agency (200);
  - hidden honeypot field: bots that fill it get a fake success and nothing is stored.
- **No inference:** every accepted submission returns the same `{ received: true }`, whether it created a lead, updated a repeat enquirer's history or was dropped as a bot.
- **Plan limit:** over the lead limit, the visitor sees a generic "contact the agency directly" message and the agency gets an audit entry.

### Properties, photos & matching (Phase 4)

- Inventory is shared within an agency: every member can view it. Editing is limited to owners/admins and the assigned agent; deleting to owners/admins. Every query starts from `propertyScope(ctx)`.
- **Photos:**
  - re-encoded server-side with `sharp`;
  - the real format is checked from the bytes (JPG/PNG/WebP only; SVG/HTML/executables rejected);
  - EXIF orientation is applied and then **all metadata is stripped**, including the GPS location phone photos carry;
  - resized to fit 1600 px and stored as WebP;
  - decoded-pixel limit of 50 MP (image bombs);
  - 8 MB per file, 10 per upload, 20 per property;
  - an upload with any bad file stores nothing.
- **Private delivery:** images are never public. API responses contain **signed, expiring URLs**: an HMAC over key + expiry, using a key derived from `JWT_ACCESS_SECRET`. Tampered, swapped, extended or expired signatures and path-traversal attempts all return the same 404. Storage keys are validated by a strict pattern and resolved inside the storage root only.
- **Matching** runs inside the caller's scope in both directions: a lead's matches only include the agency's own offerable properties; a property's matching buyers only include leads the caller may see.

### Follow-ups, site visits & dashboard (Phase 5)

- Every query starts from `followUpScope(ctx)` / `siteVisitScope(ctx)` = `{ agencyId, lead: leadScope(ctx) }`, so visibility is inherited from the lead (agents: their own leads). Creating a visit also checks the property against `propertyScope(ctx)`, so you can't pair A's lead with B's property, or the other way round.
- **Assignees:** agents can only assign work to themselves. Owners and admins can assign members, but **an agent can only be given work on a lead assigned to that agent** (otherwise the task would be invisible to them). When a lead is reassigned, the previous assignee's open follow-ups and visits on it move to the new assignee.
- Dashboard numbers come from the same scopes. The reminder counts are additionally limited to items assigned to the caller.

### Reports, plans & templates (Phase 6)

- **Reports** reuse `leadScope` / `followUpScope` / `siteVisitScope`. Agents get their own numbers and only their own team row. CSV exports are for owners/admins only and are audited. Report ranges are validated (real dates, ≤ 366 days).
- **Plan changes are not exposed over HTTP.** Customers can only *request* an upgrade (owners/admins, audited, with a 10-minute cooldown against spamming the sales inbox). Plans are applied by an operator CLI. Limits are always enforced server-side, and an ended plan falls back to Free limits.
- **Message templates** are agency-scoped (every query filters by `agencyId`; foreign ids → 404). Only owners/admins can change them, with at most 50 per agency and 2,000 characters each. They are rendered in the browser, and Angular escapes them.

## 4. Audit log

The `audit_logs` table is append-only. It records register, login, failed login, logout, refresh-reuse detection, password reset requests and resets, password changes, agency switches, agency created/updated, invitation created/revoked/accepted, member role changed/removed/left, lead assigned / deleted, leads imported / exported, enquiry form switched on/off, link reset, enquiry rejected for the lead limit, subscription upgrade requested / plan changed (CLI), message templates changed, report exported. Each entry stores IP and user agent, and never secrets.

## 5. Verified by automated tests

| Suite | Covers |
|---|---|
| `apps/api/test/tenant-isolation.e2e-spec.ts` | **Agency A vs B**: listing, editing and deleting B's members/invitations by id, identical responses for foreign vs random ids, switch/login/refresh into B, a **validly signed JWT claiming B**, agency ids smuggled in bodies, accepting B's invitation, immediate loss of access after removal, DB-level composite-FK rejection. **Leads:** read/edit/status/assign/delete/activities on B's lead by id, list/search/export never include B, duplicate detection does not reveal B's buyers, no assigning to B's members (incl. CSV), a forged-agency token cannot list leads. **Properties:** every operation on B's property/photos by id → 404, never listed/searched, never offered in A's matches (even as a perfect match) and A's buyers never offered to B, no assigning to B's members, forged token → 403. **Templates/reports/subscription:** B's templates can't be listed, edited or deleted; A's reports and CSV never include B's people or numbers; usage counts only A. **Follow-ups & visits:** no scheduling on B's leads/properties or mixing A's lead with B's property; complete/cancel/reschedule B's items by id → 404 identical to a random id; never listed; A's dashboard never counts or shows B's data |
| `apps/api/test/leads.e2e-spec.ts` | Lead CRUD and validation, duplicates, agent scope and restrictions, history, soft delete, search/filters/sort/pagination, CSV export (injection-safe), CSV import (preview, errors, duplicates, mapping), lead limit |
| `apps/api/test/enquiry-form.e2e-spec.ts` | Public form: lead creation, dedup into history, consent, field injection (status/assignee/agency/source), honeypot, 404 parity, link reset, agent permissions, tenant isolation, lead limit, per-IP rate limit vs daily cap, rate limits kept separate from login |
| `apps/api/test/properties.e2e-spec.ts` | Property CRUD/validation, agent edit rules, assignment within agency, archive/soft delete, search & filters, photo re-encoding with **GPS stripped (verified on a real EXIF/GPS JPEG)**, rejection of disguised files/SVG (all-or-nothing), signed URL tampering/expiry/traversal, reorder/delete, matching ranking and agent visibility |
| `apps/api/test/activities.e2e-spec.ts` | Follow-up views (IST today/overdue/upcoming), lead `next_follow_up_at` kept in sync, complete with next follow-up / reschedule / cancel recorded in history, agent scope, assignee rules and hand-over on reassignment; site visits (lead → Site Visit status, reschedule, feedback, cancel, per-property history); dashboard totals, conversion, monthly charts, agenda; personal reminder counts |
| `apps/api/test/business.e2e-spec.ts` | Subscription summary and catalogue overrides, ended plan → Free limits (nothing deleted), upgrade requests (roles, validation, email, audit, cooldown); reports (defaults, totals, sources, funnel, team incl. unassigned, top properties, agent scope, invalid ranges, CSV + audit + roles); templates (starter set idempotent, CRUD, unique titles, validation, roles) |
| `apps/api/test/route-protection.e2e-spec.ts` | Enumerates every registered route; all except an explicit public allowlist return 401 without a token |
| `e2e/tests/prod-build.spec.ts` (Playwright) | Production build with the deployment headers: no CSP violations, manifest/icons, service worker active, offline app shell, no API data in the SW cache |
| `apps/api/test/team-rbac.e2e-spec.ts` | Every role rule, last-owner protection, immediate role changes, invitation lifecycle (single use, expiry, revoke), seat limits |
| `apps/api/test/auth.e2e-spec.ts` | Hashing, cookie flags, generic login errors, tampered / foreign-secret / expired / `alg=none` tokens, rotation, race vs reuse detection, logout, reset (single use, newest link only, sign-out-all), change password, rate limiting (429) |
| `apps/web/src/app/**/*.spec.ts` | Access token never persisted, single-flight refresh, interceptor retry/expiry, open-redirect protection, route table (including the redirect-loop regression) |
| `e2e/tests/*.spec.ts` (Playwright) | All 7 critical flows: register + agency, login, add a lead, add a property, match them, schedule (and complete) a follow-up, schedule (and record) a site visit; plus cookie restore without a JWT in storage, deep links, invite → join → promote, imports, enquiry form, reminder bell |

The tenant-isolation suite has itself been checked. Temporarily removing the `agencyId` filter from member lookups, from `leadScope`, from `propertyScope`, from `followUpScope`, from `siteVisitScope`, or from the message-template lookup makes it fail.

## 6. Known gaps (planned)

- **No email provider yet.** In production `MAIL_DRIVER=none` drops reset emails, so password reset won't work until an email provider is added. Invitation links are still shown to the inviter.
- **Rate limiting is per IP only.** A per-account lockout for distributed credential stuffing is not implemented.
- **Email verification** at registration is not implemented.
- **The rate-limit store is in memory**: one API instance only, until it moves to Redis.
- **CSP:** a strict CSP is in place (`apps/web/security-headers.conf`). It still allows `style-src 'unsafe-inline'` for Angular component styles. See [security-review.md](security-review.md).
