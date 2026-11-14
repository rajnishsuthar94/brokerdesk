import { type PlanOverrides, parsePlanOverrides } from '../subscriptions/plan-catalog.js';

/**
 * Environment validation for the API.
 *
 * Fails fast at boot with a readable message instead of failing later at the first
 * request. Production gets extra checks that refuse insecure settings.
 */

export const NODE_ENVS = ['development', 'test', 'production'] as const;
export type NodeEnv = (typeof NODE_ENVS)[number];

export const MAIL_DRIVERS = ['log', 'none'] as const;
export type MailDriver = (typeof MAIL_DRIVERS)[number];

export interface AppEnv {
  readonly NODE_ENV: NodeEnv;
  readonly PORT: number;
  readonly DATABASE_URL: string;
  /** Browser origins allowed by CORS. Empty means same-origin only. */
  readonly CORS_ORIGINS: readonly string[];
  readonly SWAGGER_ENABLED: boolean;
  /** Number of reverse-proxy hops to trust for client IP (express `trust proxy`). */
  readonly TRUST_PROXY_HOPS: number;

  // ── Authentication ──
  /** HMAC secret for access tokens (>= 32 chars). Never shipped to the browser. */
  readonly JWT_ACCESS_SECRET: string;
  readonly JWT_ACCESS_TTL_SECONDS: number;
  readonly REFRESH_TOKEN_TTL_DAYS: number;
  /** `Secure` flag on the refresh-token cookie. Must be true in production (HTTPS). */
  readonly REFRESH_COOKIE_SECURE: boolean;
  readonly PASSWORD_RESET_TTL_MINUTES: number;
  readonly INVITATION_TTL_DAYS: number;
  /** Max requests per client IP per window on authentication endpoints. */
  readonly AUTH_THROTTLE_LIMIT: number;
  readonly AUTH_THROTTLE_TTL_SECONDS: number;
  /** Max public enquiry-form submissions per client IP per window. */
  readonly PUBLIC_ENQUIRY_THROTTLE_LIMIT: number;
  readonly PUBLIC_ENQUIRY_THROTTLE_TTL_SECONDS: number;
  /** Max new leads per agency per IST day from the public form (spam damage limit). */
  readonly PUBLIC_ENQUIRY_DAILY_CAP: number;

  // ── Media (property images) ──
  /** Directory for uploaded files (local storage driver). Relative to the API's working directory. */
  readonly STORAGE_LOCAL_DIR: string;
  /** Lifetime of signed image URLs. */
  readonly MEDIA_URL_TTL_SECONDS: number;

  // ── Links & mail ──
  /** Public URL of the web app, used to build password-reset and invitation links. */
  readonly APP_BASE_URL: string;
  /** `log`: write emails to the server log (development only). `none`: drop them. */
  readonly MAIL_DRIVER: MailDriver;

  // ── Subscriptions (no payment gateway) ──
  /** Per-plan overrides of the default catalogue (from PLAN_CATALOG_JSON). */
  readonly PLAN_OVERRIDES: PlanOverrides;
  /** Shown to customers and receives upgrade requests. Optional. */
  readonly SALES_CONTACT_EMAIL: string | null;
}

type RawEnv = Record<string, unknown>;

class EnvValidationError extends Error {
  constructor(problems: readonly string[]) {
    super(`Invalid environment configuration:\n  - ${problems.join('\n  - ')}`);
    this.name = 'EnvValidationError';
  }
}

function readString(raw: RawEnv, key: string): string | undefined {
  const value = raw[key];
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
    return undefined;
  }
  const trimmed = String(value).trim();
  return trimmed === '' ? undefined : trimmed;
}

function readInt(
  raw: RawEnv,
  key: string,
  fallback: number,
  min: number,
  max: number,
  problems: string[],
): number {
  const value = readString(raw, key);
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    problems.push(`${key} must be an integer between ${min} and ${max} (got "${value}")`);
    return fallback;
  }
  return parsed;
}

function readBool(raw: RawEnv, key: string, fallback: boolean, problems: string[]): boolean {
  const value = readString(raw, key)?.toLowerCase();
  if (value === undefined) return fallback;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  problems.push(`${key} must be "true" or "false" (got "${value}")`);
  return fallback;
}

function oneOf<T extends string>(allowed: readonly T[], value: string): value is T {
  return (allowed as readonly string[]).includes(value);
}

export function validateEnv(raw: RawEnv): AppEnv {
  const problems: string[] = [];

  const nodeEnvRaw = readString(raw, 'NODE_ENV') ?? 'development';
  let nodeEnv: NodeEnv = 'development';
  if (oneOf(NODE_ENVS, nodeEnvRaw)) {
    nodeEnv = nodeEnvRaw;
  } else {
    problems.push(`NODE_ENV must be one of ${NODE_ENVS.join(', ')} (got "${nodeEnvRaw}")`);
  }
  const isProd = nodeEnv === 'production';

  const databaseUrl = readString(raw, 'DATABASE_URL');
  if (databaseUrl === undefined) {
    problems.push('DATABASE_URL is required (mysql://user:password@host:3306/database)');
  } else if (!/^(mysql|mariadb):\/\//.test(databaseUrl)) {
    problems.push('DATABASE_URL must start with mysql:// or mariadb://');
  }

  const corsOrigins = (readString(raw, 'CORS_ORIGINS') ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  for (const origin of corsOrigins) {
    if (!/^https?:\/\/[^/\s]+$/.test(origin)) {
      problems.push(`CORS_ORIGINS entry "${origin}" must be a bare origin like https://app.example.com`);
    }
  }
  if (isProd && corsOrigins.some((o) => o.startsWith('http://'))) {
    problems.push('CORS_ORIGINS must use https:// origins in production');
  }

  const jwtSecret = readString(raw, 'JWT_ACCESS_SECRET');
  if (jwtSecret === undefined) {
    problems.push('JWT_ACCESS_SECRET is required (see .env.example for how to generate one)');
  } else if (jwtSecret.length < 32) {
    problems.push('JWT_ACCESS_SECRET must be at least 32 characters');
  } else if (isProd && /change-me|example|placeholder/i.test(jwtSecret)) {
    problems.push('JWT_ACCESS_SECRET looks like a placeholder; use a random value in production');
  }

  const cookieSecure = readBool(raw, 'REFRESH_COOKIE_SECURE', isProd, problems);
  if (isProd && !cookieSecure) {
    problems.push('REFRESH_COOKIE_SECURE must be true in production');
  }

  const appBaseUrl = (readString(raw, 'APP_BASE_URL') ?? 'http://localhost:4200').replace(/\/+$/, '');
  if (!/^https?:\/\/\S+$/.test(appBaseUrl)) {
    problems.push('APP_BASE_URL must be an absolute http(s) URL');
  } else if (isProd && !appBaseUrl.startsWith('https://')) {
    problems.push('APP_BASE_URL must use https:// in production');
  }

  const mailDriverRaw = readString(raw, 'MAIL_DRIVER') ?? (isProd ? 'none' : 'log');
  let mailDriver: MailDriver = 'none';
  if (oneOf(MAIL_DRIVERS, mailDriverRaw)) {
    mailDriver = mailDriverRaw;
  } else {
    problems.push(`MAIL_DRIVER must be one of ${MAIL_DRIVERS.join(', ')} (got "${mailDriverRaw}")`);
  }
  if (isProd && mailDriver === 'log') {
    problems.push('MAIL_DRIVER=log would write reset and invitation tokens to production logs');
  }

  const plans = parsePlanOverrides(readString(raw, 'PLAN_CATALOG_JSON'));
  problems.push(...plans.problems);
  const salesContact = readString(raw, 'SALES_CONTACT_EMAIL') ?? null;
  if (salesContact !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(salesContact)) {
    problems.push('SALES_CONTACT_EMAIL must be an email address');
  }

  const env: AppEnv = {
    NODE_ENV: nodeEnv,
    PORT: readInt(raw, 'PORT', 3000, 1, 65535, problems),
    DATABASE_URL: databaseUrl ?? '',
    CORS_ORIGINS: corsOrigins,
    SWAGGER_ENABLED: readBool(raw, 'SWAGGER_ENABLED', !isProd, problems),
    TRUST_PROXY_HOPS: readInt(raw, 'TRUST_PROXY_HOPS', 0, 0, 10, problems),
    JWT_ACCESS_SECRET: jwtSecret ?? '',
    JWT_ACCESS_TTL_SECONDS: readInt(raw, 'JWT_ACCESS_TTL_SECONDS', 900, 60, 3600, problems),
    REFRESH_TOKEN_TTL_DAYS: readInt(raw, 'REFRESH_TOKEN_TTL_DAYS', 30, 1, 90, problems),
    REFRESH_COOKIE_SECURE: cookieSecure,
    PASSWORD_RESET_TTL_MINUTES: readInt(raw, 'PASSWORD_RESET_TTL_MINUTES', 30, 5, 1440, problems),
    INVITATION_TTL_DAYS: readInt(raw, 'INVITATION_TTL_DAYS', 7, 1, 30, problems),
    AUTH_THROTTLE_LIMIT: readInt(raw, 'AUTH_THROTTLE_LIMIT', 10, 1, 100_000, problems),
    AUTH_THROTTLE_TTL_SECONDS: readInt(raw, 'AUTH_THROTTLE_TTL_SECONDS', 60, 1, 3600, problems),
    PUBLIC_ENQUIRY_THROTTLE_LIMIT: readInt(raw, 'PUBLIC_ENQUIRY_THROTTLE_LIMIT', 5, 1, 100_000, problems),
    PUBLIC_ENQUIRY_THROTTLE_TTL_SECONDS: readInt(raw, 'PUBLIC_ENQUIRY_THROTTLE_TTL_SECONDS', 600, 1, 86_400, problems),
    PUBLIC_ENQUIRY_DAILY_CAP: readInt(raw, 'PUBLIC_ENQUIRY_DAILY_CAP', 200, 1, 100_000, problems),
    STORAGE_LOCAL_DIR: readString(raw, 'STORAGE_LOCAL_DIR') ?? 'storage',
    MEDIA_URL_TTL_SECONDS: readInt(raw, 'MEDIA_URL_TTL_SECONDS', 3600, 60, 86_400, problems),
    APP_BASE_URL: appBaseUrl,
    MAIL_DRIVER: mailDriver,
    PLAN_OVERRIDES: plans.overrides,
    SALES_CONTACT_EMAIL: salesContact,
  };

  if (problems.length > 0) {
    throw new EnvValidationError(problems);
  }
  return env;
}
