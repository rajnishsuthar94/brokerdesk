/**
 * Operator CLI: put an agency on a plan after payment was arranged offline.
 * There is no payment gateway and no HTTP endpoint for this on purpose.
 *
 *   npm run plan:set -w @brokerdesk/api -- --agency <agency-id> --plan PROFESSIONAL --months 12
 *   npm run plan:set -w @brokerdesk/api -- --agency <agency-id> --plan FREE            (no end date)
 *   node dist/cli/set-plan.js --agency … --plan … --months …                           (production image)
 *
 * Limits are snapshotted from the plan catalogue (defaults + PLAN_CATALOG_JSON).
 * The change is written to the audit log.
 */
import { parseArgs } from 'node:util';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { AuditAction } from '../audit/audit.service.js';
import { PrismaClient } from '../generated/prisma/client.js';
import { SubscriptionPlan } from '../generated/prisma/enums.js';
import { PLAN_ORDER, buildCatalog, parsePlanOverrides, planChange } from '../subscriptions/plan-catalog.js';

// Local runs read the repo .env (Node's built-in loader; no dev dependency, so this
// also works in the production image, where variables come from the environment).
for (const file of ['.env', '../../.env']) {
  try {
    process.loadEnvFile(file);
    break;
  } catch {
    // No such file: rely on the environment.
  }
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const { values } = parseArgs({
  options: { agency: { type: 'string' }, plan: { type: 'string' }, months: { type: 'string' } },
});
const agencyId = values.agency ?? fail('Missing --agency <agency-id>');
const planArg = (values.plan ?? fail(`Missing --plan (${PLAN_ORDER.join(' | ')})`)).toUpperCase();
if (!(PLAN_ORDER as readonly string[]).includes(planArg)) fail(`Unknown plan "${planArg}" (${PLAN_ORDER.join(' | ')})`);
const plan = planArg as SubscriptionPlan;
let months: number | null = null;
if (values.months !== undefined) {
  months = Number(values.months);
  if (!Number.isInteger(months) || months < 1 || months > 36) fail('--months must be a whole number from 1 to 36');
} else if (plan !== SubscriptionPlan.FREE) {
  fail('Paid plans need --months <n> (the subscription ends after that and Free limits apply)');
}

const databaseUrl = process.env['DATABASE_URL'] ?? fail('DATABASE_URL is not set');
const { overrides, problems } = parsePlanOverrides(process.env['PLAN_CATALOG_JSON']);
if (problems.length > 0) fail(problems.join('\n'));
const catalog = buildCatalog(overrides);

const prisma = new PrismaClient({ adapter: new PrismaMariaDb(databaseUrl) });
try {
  const agency = await prisma.agency.findUnique({ where: { id: agencyId }, select: { name: true } });
  if (!agency) fail(`No agency with id ${agencyId}`);
  const data = planChange(catalog, plan, months);
  await prisma.$transaction(async (tx) => {
    await tx.subscription.update({ where: { agencyId }, data });
    await tx.auditLog.create({
      data: {
        action: AuditAction.SUBSCRIPTION_CHANGED,
        agencyId,
        entityType: 'subscription',
        metadata: { plan, months, expiresAt: data.expiresAt?.toISOString() ?? null, by: 'cli' },
      },
    });
  });
  const until = data.expiresAt ? ` until ${data.expiresAt.toISOString().slice(0, 10)}` : '';
  const limit = (n: number | null): string => (n === null ? 'unlimited' : String(n));
  process.stdout.write(`${agency.name}: ${catalog[plan].displayName}${until} (leads ${limit(data.leadLimit)}, users ${limit(data.userLimit)})\n`);
} finally {
  await prisma.$disconnect();
}
