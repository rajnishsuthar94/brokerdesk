import { SubscriptionPlan, SubscriptionStatus } from '../generated/prisma/enums.js';
import { DEFAULT_PLAN_CATALOG, buildCatalog, effectiveLimits, parsePlanOverrides } from './plan-catalog.js';

describe('plan catalogue overrides', () => {
  it('merges valid overrides over the defaults', () => {
    const { overrides, problems } = parsePlanOverrides('{"STARTER":{"monthlyPricePaise":59900,"leadLimit":300},"BUSINESS":{"userLimit":null}}');
    expect(problems).toEqual([]);
    const catalog = buildCatalog(overrides);
    expect(catalog.STARTER).toMatchObject({ plan: 'STARTER', displayName: 'Starter', monthlyPricePaise: 59900, leadLimit: 300, userLimit: 1 });
    expect(catalog.BUSINESS.userLimit).toBeNull();
    expect(catalog.FREE).toEqual(DEFAULT_PLAN_CATALOG.FREE);
  });

  it.each([
    ['not json', 'not valid JSON'],
    ['[]', 'must be an object'],
    ['{"GOLD":{}}', 'unknown plan "GOLD"'],
    ['{"FREE":{"leadLimit":0}}', 'FREE.leadLimit'],
    ['{"FREE":{"monthlyPricePaise":4.99}}', 'monthlyPricePaise'],
    ['{"FREE":{"discount":5}}', 'unknown field "discount"'],
    ['{"FREE":{"displayName":""}}', 'displayName'],
  ])('rejects %s', (raw, problem) => {
    expect(parsePlanOverrides(raw).problems.join('\n')).toContain(problem);
  });

  it('empty or missing means defaults', () => {
    expect(parsePlanOverrides(undefined)).toEqual({ overrides: {}, problems: [] });
    expect(parsePlanOverrides('  ')).toEqual({ overrides: {}, problems: [] });
  });
});

describe('effectiveLimits', () => {
  const catalog = buildCatalog();
  const now = new Date('2026-11-15T06:00:00Z');
  const pro = { plan: SubscriptionPlan.PROFESSIONAL, status: SubscriptionStatus.ACTIVE, expiresAt: null, leadLimit: 1000, userLimit: 3 };

  it('uses the snapshotted limits while live (active, trialing, past due)', () => {
    expect(effectiveLimits(pro, catalog, now)).toEqual({ active: true, leadLimit: 1000, userLimit: 3 });
    expect(effectiveLimits({ ...pro, status: SubscriptionStatus.PAST_DUE }, catalog, now).active).toBe(true);
    expect(effectiveLimits({ ...pro, status: SubscriptionStatus.TRIALING, expiresAt: new Date('2026-12-01T00:00:00Z') }, catalog, now).active).toBe(true);
  });

  it('falls back to Free limits when cancelled, expired or past the end date', () => {
    const free = { active: false, leadLimit: 25, userLimit: 1 };
    expect(effectiveLimits({ ...pro, status: SubscriptionStatus.CANCELLED }, catalog, now)).toEqual(free);
    expect(effectiveLimits({ ...pro, status: SubscriptionStatus.EXPIRED }, catalog, now)).toEqual(free);
    expect(effectiveLimits({ ...pro, expiresAt: new Date('2026-11-15T05:59:59Z') }, catalog, now)).toEqual(free);
    expect(effectiveLimits(null, catalog, now)).toEqual(free);
  });
});
