/**
 * Local development seed.
 *
 * Creates two independent agencies (A and B) with users, memberships,
 * subscriptions, leads, properties, follow-ups, site visits and message
 * templates. Two agencies are deliberate: they are used to manually and
 * automatically verify cross-tenant isolation.
 *
 * Run: npm run prisma:seed -w @brokerdesk/api   (after migrations)
 *
 * Idempotent: if the seed owner already exists, nothing is written.
 * Refuses to run when NODE_ENV=production.
 */
import { config as loadEnv } from 'dotenv';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import argon2 from 'argon2';
import {
  AreaUnit,
  AvailabilityStatus,
  Furnishing,
  LeadActivityType,
  LeadPriority,
  LeadSource,
  LeadStatus,
  ListingType,
  MemberRole,
  PropertyType,
  SiteVisitStatus,
  SubscriptionPlan,
  SubscriptionStatus,
} from '../src/generated/prisma/enums.js';
import { PrismaClient, type Prisma } from '../src/generated/prisma/client.js';
import { makePublicSlug } from '../src/common/utils/slug.js';
import { DEFAULT_PLAN_CATALOG } from '../src/subscriptions/plan-catalog.js';

loadEnv({ path: ['.env', '../../.env'], quiet: true });

if (process.env['NODE_ENV'] === 'production') {
  console.error('Refusing to seed: NODE_ENV=production.');
  process.exit(1);
}

const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env first.');
  process.exit(1);
}

/** Local-only default; override with SEED_USER_PASSWORD. */
const SEED_PASSWORD = process.env['SEED_USER_PASSWORD'] ?? 'BrokerDesk@2026';
const SEED_OWNER_EMAIL = 'owner@sabarmati-realty.test';

const prisma = new PrismaClient({ adapter: new PrismaMariaDb(databaseUrl) });

const DAY_MS = 24 * 60 * 60 * 1000;
/** A Date `days` from now at the given IST wall-clock hour (IST = UTC+05:30). */
function istAt(days: number, hour: number, minute = 0): Date {
  const nowIst = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const utcMidnightOfIstDay = Date.UTC(
    nowIst.getUTCFullYear(),
    nowIst.getUTCMonth(),
    nowIst.getUTCDate(),
  );
  return new Date(utcMidnightOfIstDay + days * DAY_MS + (hour * 60 + minute - 330) * 60 * 1000);
}

function subscriptionFor(plan: SubscriptionPlan): Prisma.SubscriptionCreateWithoutAgencyInput {
  const def = DEFAULT_PLAN_CATALOG[plan];
  return {
    plan,
    status: SubscriptionStatus.ACTIVE,
    leadLimit: def.leadLimit,
    userLimit: def.userLimit,
  };
}

async function main(): Promise<void> {
  const existing = await prisma.user.findUnique({ where: { email: SEED_OWNER_EMAIL } });
  if (existing) {
    console.log('Seed data already present — skipping.');
    return;
  }

  const passwordHash = await argon2.hash(SEED_PASSWORD, { type: argon2.argon2id });

  await prisma.$transaction(async (tx) => {
    // ── Users ──────────────────────────────────────────────────────────────
    const [ownerA, agentA, ownerB] = await Promise.all([
      tx.user.create({
        data: { name: 'Ramesh Patel', email: SEED_OWNER_EMAIL, phone: '+919825012345', passwordHash },
      }),
      tx.user.create({
        data: { name: 'Kavya Shah', email: 'agent@sabarmati-realty.test', phone: '+919824098765', passwordHash },
      }),
      tx.user.create({
        data: { name: 'Hiral Desai', email: 'owner@navrang-homes.test', phone: '+919898011122', passwordHash },
      }),
    ]);

    // ── Agencies + memberships + subscriptions ─────────────────────────────
    const agencyA = await tx.agency.create({
      data: {
        name: 'Sabarmati Realty',
        publicSlug: makePublicSlug('Sabarmati Realty'),
        email: 'hello@sabarmati-realty.test',
        phone: '+917926501234',
        address: '402, Shivalik Shilp, Iscon Cross Road, SG Highway',
        city: 'Ahmedabad',
        state: 'Gujarat',
        members: {
          create: [
            { userId: ownerA.id, role: MemberRole.OWNER },
            { userId: agentA.id, role: MemberRole.AGENT },
          ],
        },
        subscription: { create: subscriptionFor(SubscriptionPlan.PROFESSIONAL) },
      },
    });

    const agencyB = await tx.agency.create({
      data: {
        name: 'Navrang Homes',
        publicSlug: makePublicSlug('Navrang Homes'),
        email: 'contact@navrang-homes.test',
        phone: '+917926409876',
        address: '12, Swastik Society, Navrangpura',
        city: 'Ahmedabad',
        state: 'Gujarat',
        members: { create: [{ userId: ownerB.id, role: MemberRole.OWNER }] },
        subscription: { create: subscriptionFor(SubscriptionPlan.FREE) },
      },
    });

    // ── Properties ─────────────────────────────────────────────────────────
    const propA1 = await tx.property.create({
      data: {
        agencyId: agencyA.id,
        assignedUserId: agentA.id,
        title: '3 BHK in Shela, near Club O7',
        propertyType: PropertyType.APARTMENT,
        listingType: ListingType.SALE,
        projectName: 'Applewoods Sorrel',
        location: 'Shela',
        price: '8500000.00',
        bhk: 3,
        area: '1650.00',
        areaUnit: AreaUnit.SQFT,
        furnishing: Furnishing.SEMI_FURNISHED,
        floor: '7 of 13',
        parking: 1,
        ownerName: 'Mahesh Joshi',
        ownerPhone: '+919825511223',
        description: 'East-facing, society with clubhouse and pool.',
      },
    });

    const propA2 = await tx.property.create({
      data: {
        agencyId: agencyA.id,
        assignedUserId: ownerA.id,
        title: '2 BHK for rent in Prahlad Nagar',
        propertyType: PropertyType.APARTMENT,
        listingType: ListingType.RENT,
        location: 'Prahlad Nagar',
        price: '28000.00',
        bhk: 2,
        area: '1150.00',
        areaUnit: AreaUnit.SQFT,
        furnishing: Furnishing.FULLY_FURNISHED,
        floor: '4',
        parking: 1,
        ownerName: 'Neha Trivedi',
        ownerPhone: '+919727033445',
      },
    });

    await tx.property.create({
      data: {
        agencyId: agencyA.id,
        title: '4 BHK Bungalow in Bopal',
        propertyType: PropertyType.BUNGALOW,
        listingType: ListingType.SALE,
        projectName: 'Shaligram Bungalows',
        location: 'Bopal',
        price: '24500000.00',
        bhk: 4,
        area: '300.00',
        areaUnit: AreaUnit.SQYD,
        furnishing: Furnishing.UNFURNISHED,
        parking: 2,
        availabilityStatus: AvailabilityStatus.ON_HOLD,
      },
    });

    const propB1 = await tx.property.create({
      data: {
        agencyId: agencyB.id,
        title: '2 BHK resale in Gota',
        propertyType: PropertyType.APARTMENT,
        listingType: ListingType.SALE,
        location: 'Gota',
        price: '4200000.00',
        bhk: 2,
        area: '1080.00',
        areaUnit: AreaUnit.SQFT,
        parking: 1,
      },
    });

    // ── Leads (+ activity history) ─────────────────────────────────────────
    const leadA1 = await tx.lead.create({
      data: {
        agencyId: agencyA.id,
        assignedUserId: agentA.id,
        name: 'Amit Mehta',
        phone: '+919879012345',
        email: 'amit.mehta@example.com',
        source: LeadSource.PROPERTY_PORTAL,
        budgetMin: '7500000.00',
        budgetMax: '9000000.00',
        preferredLocation: 'Shela',
        bhk: 3,
        propertyType: PropertyType.APARTMENT,
        listingType: ListingType.SALE,
        status: LeadStatus.QUALIFIED,
        priority: LeadPriority.HIGH,
        nextFollowUpAt: istAt(0, 17),
        notes: 'Wants ready possession; school nearby is important.',
      },
    });

    // Created separately: activities reference the lead through the composite
    // (agency_id, lead_id) key, so agencyId must be supplied explicitly.
    await tx.leadActivity.createMany({
      data: [
        { agencyId: agencyA.id, leadId: leadA1.id, userId: agentA.id, activityType: LeadActivityType.CALL, description: 'First call: needs 3 BHK around Shela/Bopal.' },
        { agencyId: agencyA.id, leadId: leadA1.id, userId: agentA.id, activityType: LeadActivityType.STATUS_CHANGE, description: 'Status changed from CONTACTED to QUALIFIED.' },
      ],
    });

    const leadA2 = await tx.lead.create({
      data: {
        agencyId: agencyA.id,
        assignedUserId: ownerA.id,
        name: 'Priya Iyer',
        phone: '+919426055667',
        source: LeadSource.WHATSAPP,
        budgetMin: '20000.00',
        budgetMax: '30000.00',
        preferredLocation: 'Prahlad Nagar',
        bhk: 2,
        propertyType: PropertyType.APARTMENT,
        listingType: ListingType.RENT,
        status: LeadStatus.NEW,
        priority: LeadPriority.MEDIUM,
        nextFollowUpAt: istAt(-1, 11),
      },
    });

    await tx.lead.create({
      data: {
        agencyId: agencyA.id,
        name: 'Harshad Bhatt',
        phone: '+919723344556',
        source: LeadSource.REFERRAL,
        budgetMin: '20000000.00',
        budgetMax: '26000000.00',
        preferredLocation: 'Bopal',
        bhk: 4,
        propertyType: PropertyType.BUNGALOW,
        listingType: ListingType.SALE,
        status: LeadStatus.WON,
        priority: LeadPriority.LOW,
      },
    });

    const leadB1 = await tx.lead.create({
      data: {
        agencyId: agencyB.id,
        assignedUserId: ownerB.id,
        name: 'Sanjay Rathod',
        phone: '+919909988776',
        source: LeadSource.WALK_IN,
        budgetMax: '4500000.00',
        preferredLocation: 'Gota',
        bhk: 2,
        listingType: ListingType.SALE,
        status: LeadStatus.CONTACTED,
      },
    });

    // ── Follow-ups (today, overdue, upcoming) ──────────────────────────────
    await tx.followUp.createMany({
      data: [
        { agencyId: agencyA.id, leadId: leadA1.id, assignedUserId: agentA.id, dueAt: istAt(0, 17), notes: 'Share Applewoods brochure and floor plan.' },
        { agencyId: agencyA.id, leadId: leadA2.id, assignedUserId: ownerA.id, dueAt: istAt(-1, 11), notes: 'Confirm move-in date and pet policy.' },
        { agencyId: agencyA.id, leadId: leadA1.id, assignedUserId: agentA.id, dueAt: istAt(3, 12), notes: 'Discuss home-loan pre-approval.' },
        { agencyId: agencyB.id, leadId: leadB1.id, assignedUserId: ownerB.id, dueAt: istAt(1, 10) },
      ],
    });

    // ── Site visits ────────────────────────────────────────────────────────
    await tx.siteVisit.createMany({
      data: [
        { agencyId: agencyA.id, leadId: leadA1.id, propertyId: propA1.id, assignedUserId: agentA.id, scheduledAt: istAt(2, 11, 30) },
        { agencyId: agencyA.id, leadId: leadA2.id, propertyId: propA2.id, assignedUserId: ownerA.id, scheduledAt: istAt(-2, 16), status: SiteVisitStatus.COMPLETED, feedback: 'Liked the flat; wants semi-furnished option too.' },
        { agencyId: agencyB.id, leadId: leadB1.id, propertyId: propB1.id, assignedUserId: ownerB.id, scheduledAt: istAt(4, 10) },
      ],
    });

    // ── WhatsApp message templates ─────────────────────────────────────────
    await tx.messageTemplate.createMany({
      data: [
        {
          agencyId: agencyA.id,
          title: 'Greeting',
          category: 'GREETING',
          message: 'Namaste {{leadName}}, this is {{agentName}} from Sabarmati Realty. Thank you for your enquiry! When is a good time to talk?',
        },
        {
          agencyId: agencyA.id,
          title: 'Property details',
          category: 'PROPERTY',
          message: 'Hi {{leadName}}, sharing details of {{propertyTitle}} at {{location}} – {{price}}. Would you like to schedule a site visit?',
        },
        {
          agencyId: agencyB.id,
          title: 'Greeting',
          category: 'GREETING',
          message: 'Hello {{leadName}}, Navrang Homes here. How can we help you find your new home?',
        },
      ],
    });
  });

  console.log('Seed complete.');
  console.log(`  Agency A owner: ${SEED_OWNER_EMAIL}`);
  console.log('  Agency A agent: agent@sabarmati-realty.test');
  console.log('  Agency B owner: owner@navrang-homes.test');
  console.log(
    process.env['SEED_USER_PASSWORD']
      ? '  Password: value of SEED_USER_PASSWORD'
      : '  Password: BrokerDesk@2026 (local development only)',
  );
}

try {
  await main();
} catch (error: unknown) {
  console.error('Seed failed:', error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
