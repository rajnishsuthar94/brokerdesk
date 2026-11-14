import { validateEnv } from './env.validation.js';

const SECRET = 'a'.repeat(20) + 'B7xQ9mZ2kL4pR8tW1vY6';
const base = { DATABASE_URL: 'mysql://u:p@localhost:3306/brokerdesk', JWT_ACCESS_SECRET: SECRET };
const prodBase = {
  ...base,
  NODE_ENV: 'production',
  APP_BASE_URL: 'https://app.brokerdesk.in',
};

describe('validateEnv', () => {
  it('applies safe defaults for development', () => {
    expect(validateEnv(base)).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      DATABASE_URL: base.DATABASE_URL,
      CORS_ORIGINS: [],
      SWAGGER_ENABLED: true,
      TRUST_PROXY_HOPS: 0,
      JWT_ACCESS_SECRET: SECRET,
      JWT_ACCESS_TTL_SECONDS: 900,
      REFRESH_TOKEN_TTL_DAYS: 30,
      REFRESH_COOKIE_SECURE: false,
      PASSWORD_RESET_TTL_MINUTES: 30,
      INVITATION_TTL_DAYS: 7,
      AUTH_THROTTLE_LIMIT: 10,
      AUTH_THROTTLE_TTL_SECONDS: 60,
      PUBLIC_ENQUIRY_THROTTLE_LIMIT: 5,
      PUBLIC_ENQUIRY_THROTTLE_TTL_SECONDS: 600,
      PUBLIC_ENQUIRY_DAILY_CAP: 200,
      STORAGE_LOCAL_DIR: 'storage',
      MEDIA_URL_TTL_SECONDS: 3600,
      APP_BASE_URL: 'http://localhost:4200',
      MAIL_DRIVER: 'log',
      PLAN_OVERRIDES: {},
      SALES_CONTACT_EMAIL: null,
    });
  });

  it('accepts plan catalogue overrides and a sales contact', () => {
    const env = validateEnv({ ...base, PLAN_CATALOG_JSON: '{"STARTER":{"leadLimit":300}}', SALES_CONTACT_EMAIL: 'sales@brokerdesk.in' });
    expect(env.PLAN_OVERRIDES).toEqual({ STARTER: { leadLimit: 300 } });
    expect(env.SALES_CONTACT_EMAIL).toBe('sales@brokerdesk.in');
  });

  it('rejects a bad plan catalogue and sales contact at boot', () => {
    expect(() => validateEnv({ ...base, PLAN_CATALOG_JSON: '{"GOLD":{}}', SALES_CONTACT_EMAIL: 'not-an-email' }))
      .toThrow(/unknown plan "GOLD"[\s\S]*SALES_CONTACT_EMAIL must be an email/);
  });

  it('uses secure defaults in production', () => {
    const env = validateEnv(prodBase);
    expect(env.SWAGGER_ENABLED).toBe(false);
    expect(env.REFRESH_COOKIE_SECURE).toBe(true);
    expect(env.MAIL_DRIVER).toBe('none');
  });

  it('parses comma-separated CORS origins and strips a trailing slash from APP_BASE_URL', () => {
    const env = validateEnv({ ...base, CORS_ORIGINS: 'http://localhost:4200, https://app.example.com', APP_BASE_URL: 'http://localhost:4200/' });
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:4200', 'https://app.example.com']);
    expect(env.APP_BASE_URL).toBe('http://localhost:4200');
  });

  it.each([
    ['missing DATABASE_URL', { JWT_ACCESS_SECRET: SECRET }, /DATABASE_URL is required/],
    ['non-MySQL DATABASE_URL', { ...base, DATABASE_URL: 'postgres://x' }, /must start with mysql/],
    ['missing JWT secret', { DATABASE_URL: base.DATABASE_URL }, /JWT_ACCESS_SECRET is required/],
    ['short JWT secret', { ...base, JWT_ACCESS_SECRET: 'short' }, /at least 32 characters/],
  ])('rejects %s', (_label, raw, message) => {
    expect(() => validateEnv(raw)).toThrow(message);
  });

  it.each([
    ['placeholder JWT secret', { JWT_ACCESS_SECRET: 'change-me-generate-a-long-random-secret-value-here' }, /placeholder/],
    ['insecure refresh cookie', { REFRESH_COOKIE_SECURE: 'false' }, /REFRESH_COOKIE_SECURE must be true/],
    ['http APP_BASE_URL', { APP_BASE_URL: 'http://app.example.com' }, /APP_BASE_URL must use https/],
    ['http CORS origin', { CORS_ORIGINS: 'http://app.example.com' }, /https:\/\/ origins in production/],
    ['mail tokens in logs', { MAIL_DRIVER: 'log' }, /MAIL_DRIVER=log/],
  ])('refuses %s in production', (_label, override, message) => {
    expect(() => validateEnv({ ...prodBase, ...override })).toThrow(message);
  });

  it('reports every problem at once', () => {
    expect(() =>
      validateEnv({ NODE_ENV: 'staging', PORT: 'abc', SWAGGER_ENABLED: 'yes', CORS_ORIGINS: 'example.com/path' }),
    ).toThrow(
      expect.objectContaining({
        message: expect.stringMatching(/NODE_ENV[\s\S]*DATABASE_URL[\s\S]*CORS_ORIGINS[\s\S]*JWT_ACCESS_SECRET[\s\S]*PORT[\s\S]*SWAGGER_ENABLED/),
      }),
    );
  });
});
