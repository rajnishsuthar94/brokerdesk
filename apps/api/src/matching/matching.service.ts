import { Injectable, NotFoundException } from '@nestjs/common';
import type { LeadMatch, PropertyMatch } from '@brokerdesk/shared-types';
import type { TenantContext } from '../common/auth/auth.types.js';
import { AvailabilityStatus, LeadStatus } from '../generated/prisma/enums.js';
import { leadScope } from '../leads/lead-query.js';
import { MediaUrlService } from '../media/media-url.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { propertyScope } from '../properties/property-query.js';
import { type BuyerRequirement, type PropertyFacts, compareMatches, evaluateMatch } from './match-engine.js';

/** Results returned per request (best first). */
export const MAX_MATCHES = 30;
/** Candidate properties are pre-filtered in SQL to at most this multiple of the budget. */
const PRICE_PREFILTER = 1.5;
/** Listings that can still be offered to a buyer. */
const OFFERABLE: AvailabilityStatus[] = [AvailabilityStatus.AVAILABLE, AvailabilityStatus.ON_HOLD];

const num = (v: { toNumber(): number } | null): number | null => (v === null ? null : v.toNumber());

/**
 * Connects the pure match engine to the database, in both directions, always
 * inside the caller's tenant scope:
 * - properties for a lead: the lead must be visible to the caller (agents: their own);
 * - leads for a property: only leads the caller may see are considered.
 * SQL only narrows candidates (same agency, same buy/rent, offerable, price
 * bound); every ranking decision is made by the explainable engine.
 */
@Injectable()
export class MatchingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly urls: MediaUrlService,
  ) {}

  async propertiesForLead(ctx: TenantContext, leadId: string): Promise<PropertyMatch[]> {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, ...leadScope(ctx) },
      select: {
        listingType: true, budgetMin: true, budgetMax: true, preferredLocation: true, bhk: true,
        propertyType: true, areaMin: true, areaMax: true, areaUnit: true,
      },
    });
    if (!lead) throw new NotFoundException('Lead not found');
    const req: BuyerRequirement = {
      ...lead,
      budgetMin: num(lead.budgetMin),
      budgetMax: num(lead.budgetMax),
      areaMin: num(lead.areaMin),
      areaMax: num(lead.areaMax),
    };

    const candidates = await this.prisma.property.findMany({
      where: {
        ...propertyScope(ctx),
        listingType: req.listingType,
        availabilityStatus: { in: OFFERABLE },
        ...(req.budgetMax !== null ? { price: { lte: req.budgetMax * PRICE_PREFILTER } } : {}),
      },
      select: {
        id: true, title: true, location: true, city: true, projectName: true, price: true, listingType: true,
        propertyType: true, bhk: true, area: true, areaUnit: true, availabilityStatus: true,
        images: { select: { storageKey: true }, orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }], take: 1 },
      },
      take: 500,
    });

    return candidates
      .map((p) => {
        const facts: PropertyFacts = { ...p, price: p.price.toNumber(), area: num(p.area) };
        return { p, facts, summary: evaluateMatch(req, facts) };
      })
      .sort((a, b) => compareMatches({ summary: a.summary, price: a.facts.price }, { summary: b.summary, price: b.facts.price }, req.budgetMax))
      .slice(0, MAX_MATCHES)
      .map(({ p, facts, summary }) => ({
        ...summary,
        property: {
          id: p.id,
          title: p.title,
          location: p.location,
          city: p.city,
          price: facts.price,
          listingType: p.listingType,
          propertyType: p.propertyType,
          bhk: p.bhk,
          availabilityStatus: p.availabilityStatus,
          coverImageUrl: p.images[0] ? this.urls.sign(p.images[0].storageKey) : null,
        },
      }));
  }

  async leadsForProperty(ctx: TenantContext, propertyId: string): Promise<LeadMatch[]> {
    const p = await this.prisma.property.findFirst({
      where: { id: propertyId, ...propertyScope(ctx) },
      select: {
        listingType: true, price: true, location: true, city: true, projectName: true, bhk: true,
        propertyType: true, area: true, areaUnit: true,
      },
    });
    if (!p) throw new NotFoundException('Property not found');
    const facts: PropertyFacts = { ...p, price: p.price.toNumber(), area: num(p.area) };

    const leads = await this.prisma.lead.findMany({
      where: {
        ...leadScope(ctx), // agents only ever see their own leads here too
        listingType: facts.listingType,
        status: { notIn: [LeadStatus.WON, LeadStatus.LOST] },
        OR: [{ budgetMax: null }, { budgetMax: { gte: facts.price / PRICE_PREFILTER } }],
      },
      select: {
        id: true, name: true, phone: true, status: true, listingType: true, budgetMin: true, budgetMax: true,
        preferredLocation: true, bhk: true, propertyType: true, areaMin: true, areaMax: true, areaUnit: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 1000,
    });

    return leads
      .map((l) => {
        const req: BuyerRequirement = {
          ...l,
          budgetMin: num(l.budgetMin),
          budgetMax: num(l.budgetMax),
          areaMin: num(l.areaMin),
          areaMax: num(l.areaMax),
        };
        return { l, req, summary: evaluateMatch(req, facts) };
      })
      .sort((a, b) => compareMatches({ summary: a.summary, price: facts.price }, { summary: b.summary, price: facts.price }, null))
      .slice(0, MAX_MATCHES)
      .map(({ l, req, summary }) => ({
        ...summary,
        lead: {
          id: l.id,
          name: l.name,
          phone: l.phone,
          status: l.status,
          budgetMin: req.budgetMin,
          budgetMax: req.budgetMax,
          preferredLocation: l.preferredLocation,
          bhk: l.bhk,
        },
      }));
  }
}
