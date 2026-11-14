import { ForbiddenException, HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { EnquiryChannel, EnquiryFormSettings, PublicEnquiryInfo } from '@brokerdesk/shared-types';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import type { TenantContext } from '../common/auth/auth.types.js';
import type { RequestMeta } from '../common/http/request-meta.js';
import { istDayRange } from '../common/utils/indian-formats.js';
import { makePublicSlug } from '../common/utils/slug.js';
import { AppConfigService } from '../config/app-config.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { LeadActivityType, LeadPriority, LeadSource, LeadStatus, ListingType } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SubscriptionLimitsService } from '../subscriptions/subscription-limits.service.js';
import type { PublicEnquiryDto } from './dto/enquiry.dto.js';

const CHANNEL_LABELS: Readonly<Record<EnquiryChannel, string>> = {
  qr: 'QR code',
  whatsapp: 'WhatsApp link',
  instagram: 'Instagram link',
  facebook: 'Facebook link',
  website: 'website link',
  other: 'shared link',
};

const NOT_AVAILABLE = 'This enquiry form is not available. Please contact the agency directly.';

/**
 * Public lead capture. Every submission becomes a lead (or, for a known phone
 * number, a new entry in that lead's history). Visitors never learn anything
 * about the agency's data: all successful submissions get the same response.
 */
@Injectable()
export class EnquiriesService {
  private readonly logger = new Logger(EnquiriesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly limits: SubscriptionLimitsService,
    private readonly audit: AuditService,
    private readonly config: AppConfigService,
  ) {}

  // ── Public ────────────────────────────────────────────────────────────────

  async publicInfo(slug: string): Promise<PublicEnquiryInfo> {
    const agency = await this.findOpenForm(slug);
    return { agencyName: agency.name, city: agency.city, phone: agency.phone };
  }

  async submit(slug: string, dto: PublicEnquiryDto, meta: RequestMeta): Promise<void> {
    const agency = await this.findOpenForm(slug);

    if (dto.website?.trim()) {
      // Bot filled the hidden field: pretend success, store nothing.
      this.logger.warn(`Honeypot triggered on enquiry form of agency ${agency.id} from ${meta.ipAddress ?? 'unknown IP'}`);
      return;
    }

    const { start } = istDayRange(new Date());
    const today = await this.prisma.lead.count({
      where: { agencyId: agency.id, source: LeadSource.ENQUIRY_FORM, createdAt: { gte: start } },
    });
    if (today >= this.config.get('PUBLIC_ENQUIRY_DAILY_CAP')) {
      throw new HttpException(
        'This agency has received many enquiries today. Please call them directly or try again tomorrow.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const channel = CHANNEL_LABELS[dto.channel ?? 'other'];
    const details = this.describe(dto);

    try {
      await this.prisma.$transaction(async (tx) => {
        const existing = await tx.lead.findFirst({
          where: { agencyId: agency.id, phone: dto.phone, deletedAt: null },
          select: { id: true },
          orderBy: { createdAt: 'desc' },
        });

        if (existing) {
          // Same person enquiring again: add to their history instead of duplicating.
          await tx.leadActivity.create({
            data: {
              agencyId: agency.id,
              leadId: existing.id,
              activityType: LeadActivityType.SYSTEM,
              description: `Enquired again via the online form (${channel}).${details}`,
            },
          });
          await tx.lead.update({ where: { id: existing.id }, data: { updatedAt: new Date() } });
          return;
        }

        await this.limits.assertLeadCapacity(tx, agency.id, 1);
        const lead = await tx.lead.create({
          data: {
            agencyId: agency.id,
            name: dto.name,
            phone: dto.phone,
            email: dto.email ?? null,
            source: LeadSource.ENQUIRY_FORM,
            listingType: dto.listingType ?? ListingType.SALE,
            propertyType: dto.propertyType ?? null,
            bhk: dto.bhk ?? null,
            budgetMax: dto.budgetMax ?? null,
            preferredLocation: dto.preferredLocation ?? null,
            notes: dto.message ?? null,
            status: LeadStatus.NEW,
            priority: LeadPriority.MEDIUM,
          },
          select: { id: true },
        });
        await tx.leadActivity.create({
          data: {
            agencyId: agency.id,
            leadId: lead.id,
            activityType: LeadActivityType.SYSTEM,
            description: `Enquiry received via the online form (${channel}). The buyer agreed to be contacted.`,
          },
        });
      });
    } catch (error: unknown) {
      if (error instanceof ForbiddenException) {
        // Plan lead limit reached: tell the owner (audit) and the visitor (generic).
        await this.audit.recordSafely({
          action: AuditAction.ENQUIRY_REJECTED_LIMIT,
          agencyId: agency.id,
          metadata: { channel: dto.channel ?? 'other' },
          meta,
        });
        throw new ForbiddenException(
          'This agency cannot accept online enquiries right now. Please contact them directly.',
        );
      }
      throw error;
    }
  }

  // ── Settings (signed-in members) ───────────────────────────────────────────

  async settings(ctx: TenantContext): Promise<EnquiryFormSettings> {
    const agency = await this.prisma.agency.findUniqueOrThrow({
      where: { id: ctx.agencyId },
      select: { publicSlug: true, enquiryFormEnabled: true },
    });
    return this.toSettings(agency.publicSlug, agency.enquiryFormEnabled);
  }

  async setEnabled(ctx: TenantContext, enabled: boolean, meta: RequestMeta): Promise<EnquiryFormSettings> {
    const agency = await this.prisma.agency.update({
      where: { id: ctx.agencyId },
      data: { enquiryFormEnabled: enabled },
      select: { publicSlug: true, enquiryFormEnabled: true },
    });
    await this.audit.recordSafely({
      action: AuditAction.ENQUIRY_FORM_UPDATED,
      agencyId: ctx.agencyId,
      actorUserId: ctx.userId,
      entityType: 'agency',
      entityId: ctx.agencyId,
      metadata: { enabled },
      meta,
    });
    return this.toSettings(agency.publicSlug, agency.enquiryFormEnabled);
  }

  /** New link; the old one stops working immediately (e.g. after spam). */
  async resetLink(ctx: TenantContext, meta: RequestMeta): Promise<EnquiryFormSettings> {
    const current = await this.prisma.agency.findUniqueOrThrow({ where: { id: ctx.agencyId }, select: { name: true } });
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const agency = await this.prisma.agency.update({
          where: { id: ctx.agencyId },
          data: { publicSlug: makePublicSlug(current.name) },
          select: { publicSlug: true, enquiryFormEnabled: true },
        });
        await this.audit.recordSafely({
          action: AuditAction.ENQUIRY_LINK_RESET,
          agencyId: ctx.agencyId,
          actorUserId: ctx.userId,
          entityType: 'agency',
          entityId: ctx.agencyId,
          meta,
        });
        return this.toSettings(agency.publicSlug, agency.enquiryFormEnabled);
      } catch (error: unknown) {
        // 32 random bits: a collision is astronomically unlikely, but retry anyway.
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
      }
    }
    throw new Error('Could not generate a unique enquiry link');
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  /** Unknown and disabled forms look the same (404). */
  private async findOpenForm(slug: string): Promise<{ id: string; name: string; city: string | null; phone: string | null }> {
    const agency = await this.prisma.agency.findUnique({
      where: { publicSlug: slug },
      select: { id: true, name: true, city: true, phone: true, enquiryFormEnabled: true },
    });
    if (!agency?.enquiryFormEnabled) throw new NotFoundException(NOT_AVAILABLE);
    return agency;
  }

  private toSettings(slug: string, enabled: boolean): EnquiryFormSettings {
    return { slug, enabled, url: `${this.config.get('APP_BASE_URL')}/enquire/${slug}` };
  }

  /** Requirement summary for a repeat enquiry's history entry. */
  private describe(dto: PublicEnquiryDto): string {
    const parts = [
      dto.listingType === ListingType.RENT ? 'Rent' : dto.listingType ? 'Buy' : null,
      dto.bhk ? `${dto.bhk} BHK` : null,
      dto.propertyType ?? null,
      dto.preferredLocation ?? null,
      dto.budgetMax ? `budget up to ₹${dto.budgetMax.toLocaleString('en-IN')}` : null,
    ].filter(Boolean);
    const requirement = parts.length ? ` Looking for: ${parts.join(', ')}.` : '';
    const message = dto.message ? ` Message: "${dto.message}"` : '';
    return requirement + message;
  }
}
