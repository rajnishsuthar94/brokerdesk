# BrokerDesk – Production deployment

This guide deploys BrokerDesk to a single Linux server with Docker Compose. The parts are:

```
Internet ──443──▶ Caddy (TLS, HSTS) ──▶ web: nginx (SPA + security headers) ──/api──▶ api: NestJS ──▶ MySQL 8.4
                                                                                        └─▶ volume: property photos
```

Everything is on one origin (`https://app.example.in`, with `/api` proxied), so the refresh cookie stays `SameSite=Strict` and no CORS is needed. Only ports 80 and 443 are published. MySQL, the API and nginx are reachable on the internal Docker network only.

> **What has been verified, and what has not.** The application is tested by the automated suites (`npm test`, `npm run test:e2e`). This includes a **production web build served with the exact `security-headers.conf`**, which checks the CSP, the service worker, offline loading and the manifest.
>
> **The Docker images and compose files have not been built or run in this repository's development environment**, because Docker isn't installed there. The YAML has been syntax-checked only. Do a full rehearsal on a staging server (steps 1–6) before going live.

## 1. Server

- A Linux VM with **2 vCPU, 4 GB RAM and 40 GB SSD** is plenty to start with. An Indian region (e.g. Mumbai) keeps latency low and data in India.
- Docker Engine and the **Compose plugin v2.24+** (needed for `!reset` in the production overlay).
- A domain such as `app.example.in` with an **A record pointing at the server**.
- Firewall: allow 22 (SSH, ideally restricted to your IP), 80 and 443. Nothing else.
- Unattended security updates enabled. Log in with SSH keys only.

## 2. Configuration

```bash
git clone <your-repo> /opt/brokerdesk && cd /opt/brokerdesk
cp .env.example .env && chmod 600 .env
```

Edit `.env`. **Never commit it.**

| Variable | Production value |
|---|---|
| `MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD` | Long random values: `openssl rand -base64 32` |
| `JWT_ACCESS_SECRET` | ≥ 32 random characters: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`. Rotating it signs everyone out and invalidates image URLs |
| `APP_BASE_URL` | `https://app.example.in` (used in reset and invitation links) |
| `BROKERDESK_DOMAIN` | `app.example.in` (Caddy requests the certificate for it) |
| `SALES_CONTACT_EMAIL` | Address shown on the Plan page; receives upgrade requests once email works |
| `PLAN_CATALOG_JSON` | Optional price/limit overrides, e.g. `{"STARTER":{"monthlyPricePaise":59900}}` |
| `AUTH_THROTTLE_LIMIT` / `_TTL_SECONDS` | Defaults: 10 per 60 s per IP |
| `PUBLIC_ENQUIRY_*` | Defaults: 5 per 10 min per IP; 200 per agency per day |
| `MEDIA_URL_TTL_SECONDS` | Default 3600 |

The production overlay **sets these for you**: `NODE_ENV=production`, `REFRESH_COOKIE_SECURE=true`, `SWAGGER_ENABLED=false`, `TRUST_PROXY_HOPS=2` and `MAIL_DRIVER=none`.

The API **refuses to start** with insecure production settings: a placeholder JWT secret, http URLs, insecure cookies, or `MAIL_DRIVER=log`.

## 3. First start

```bash
docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml --profile app up -d --build
docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml ps
```

The `migrate` job applies all Prisma migrations (`prisma migrate deploy`) and exits. The API then starts (its health check is `/api/v1/health/live`), followed by nginx and Caddy. Within a minute or two Caddy will have a certificate.

**Smoke test:**

```bash
curl -s https://app.example.in/api/v1/health      # {"status":"ok",...,"database":{"status":"up"}}
curl -sI https://app.example.in/ | grep -iE 'strict-transport|content-security|x-frame'
```

Then, in a browser:
1. Register an account and create the agency.
2. Add a lead and a property, and check the match.
3. Schedule a follow-up and a site visit.
4. Install the app from the browser menu, if you want to check the PWA.

**Do not run the seed** (`npm run db:seed`) in production; it refuses to run when `NODE_ENV=production`.

## 4. Releasing a new version

```bash
cd /opt/brokerdesk && git pull
./deploy/backup.sh                                   # always back up before migrating
docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml --profile app up -d --build
```

Migrations run automatically before the new API starts. They are additive by convention; review any destructive SQL in `apps/api/prisma/migrations/*` before deploying.

Open browsers pick up the new web version through the service worker: they show **"A new version of BrokerDesk is ready → Reload"**. `index.html` and the service-worker files are never cached, and hashed JS/CSS is cached for a year.

**Rollback:**
1. `git checkout <previous tag>`.
2. Rebuild.
3. If a migration must be undone, restore the pre-release backup. Prisma has no automatic down-migrations.

## 5. Backups and restore

Two things must be backed up together:
- the **MySQL database**;
- the **`api-storage` volume** (property photos).

```bash
chmod +x deploy/backup.sh
crontab -e   # 15 2 * * *  cd /opt/brokerdesk && ./deploy/backup.sh >> /var/log/brokerdesk-backup.log 2>&1
```

The script writes `backups/brokerdesk-db-<time>.sql.gz` and `brokerdesk-photos-<time>.tar.gz` and keeps 14 days. **Copy them off the server** (object storage or another machine), and test a restore every quarter:

```bash
gunzip -c backups/brokerdesk-db-<time>.sql.gz | docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml exec -T mysql \
  sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot "$MYSQL_DATABASE"'
docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml exec -T api tar -C /repo/apps/api -xzf - < backups/brokerdesk-photos-<time>.tar.gz
```

## 6. Operations

| Task | How |
|---|---|
| Logs | `docker compose … logs -f api` (JSON-free plain logs; no secrets or tokens are logged) |
| Health monitoring | Poll `https://app.example.in/api/v1/health` from an uptime monitor (returns 503 when MySQL is down) |
| Change an agency's plan after payment | `docker compose … exec api node dist/cli/set-plan.js --agency <id> --plan PROFESSIONAL --months 12` (audited; there is no payment gateway) |
| Find an agency id | From the upgrade-request email, or `SELECT id, name FROM agencies WHERE name LIKE '%…%'` |
| Audit trail | Table `audit_logs` (logins, role changes, exports, plan changes, …) |

## 7. Known limitations (read before launch)

- **No email provider yet.** With `MAIL_DRIVER=none`:
  - password-reset emails are not sent, so users can't reset forgotten passwords;
  - upgrade requests are recorded but not emailed.

  Invitation links are still shown to the inviting admin.

  **Integrate an email provider (SES, SMTP, etc.) before a public launch.** `MailService` is the single place to change.
- **Single API instance.** Rate limits are kept in memory. To run more than one API container, move the throttler storage to Redis first.
- **Local file storage.** Photos are on a Docker volume on the same server. For multiple servers, implement the S3-compatible driver behind `StorageService`.
- **No push, SMS or email reminders.** The reminder bell polls while the app is open. Push needs a push service, VAPID keys and a scheduler, none of which are built.
- **No online payments.** This is by design for now; plans are changed by the operator CLI.
- **MySQL inside Docker** uses `allowPublicKeyRetrieval=true` on the private network. If you use a managed MySQL instead, connect with TLS (`?ssl=true` plus the provider's CA) and drop that flag.
