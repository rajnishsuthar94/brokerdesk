import { BadRequestException, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync, type ValidationError } from 'class-validator';
import { parse } from 'csv-parse/sync';
import type {
  LeadImportDuplicate,
  LeadImportResult,
  LeadImportRowIssue,
} from '@brokerdesk/shared-types';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import type { TenantContext } from '../common/auth/auth.types.js';
import { toCsv } from '../common/utils/csv.js';
import { detectSpreadsheet, readXlsxRows } from '../common/utils/spreadsheet.js';
import { parseBhk, parseIndianAmount, parseIndianDate } from '../common/utils/indian-formats.js';
import type { RequestMeta } from '../common/http/request-meta.js';
import type { Prisma } from '../generated/prisma/client.js';
import {
  FollowUpStatus,
  LeadPriority,
  LeadSource,
  LeadStatus,
  ListingType,
  PropertyType,
} from '../generated/prisma/enums.js';
import { closedAtFor } from '../follow-ups/follow-up-sync.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SubscriptionLimitsService } from '../subscriptions/subscription-limits.service.js';
import { CreateLeadDto, type LeadFiltersDto } from './dto/lead.dto.js';
import { buildLeadOrderBy, buildLeadWhere } from './lead-query.js';
import { leadSelect, toLeadView } from './lead.mapper.js';

export const MAX_IMPORT_ROWS = 2000;
export const MAX_EXPORT_ROWS = 10_000;

/** Header aliases (lower-cased, spaces/underscores/dashes removed) → field. */
const HEADER_ALIASES: Readonly<Record<string, string>> = {
  name: 'name', leadname: 'name', buyername: 'name', customername: 'name', fullname: 'name',
  phone: 'phone', mobile: 'phone', mobileno: 'phone', mobilenumber: 'phone', phonenumber: 'phone', contact: 'phone', whatsapp: 'phone',
  email: 'email', emailaddress: 'email', emailid: 'email',
  source: 'source', leadsource: 'source',
  budgetmin: 'budgetMin', minbudget: 'budgetMin', budgetfrom: 'budgetMin',
  budgetmax: 'budgetMax', maxbudget: 'budgetMax', budget: 'budgetMax', budgetto: 'budgetMax',
  location: 'preferredLocation', preferredlocation: 'preferredLocation', area: 'preferredLocation', locality: 'preferredLocation',
  bhk: 'bhk', bedrooms: 'bhk', configuration: 'bhk',
  propertytype: 'propertyType', type: 'propertyType',
  listingtype: 'listingType', saleorrent: 'listingType', requirement: 'listingType', purpose: 'listingType',
  status: 'status', leadstatus: 'status',
  priority: 'priority',
  nextfollowup: 'nextFollowUpAt', nextfollowupdate: 'nextFollowUpAt', followup: 'nextFollowUpAt', followupdate: 'nextFollowUpAt',
  notes: 'notes', note: 'notes', remarks: 'notes', comments: 'notes',
  assignedto: 'assignedTo', agent: 'assignedTo', agentemail: 'assignedTo',
};

const key = (s: string): string => s.toLowerCase().replace(/[\s_\-./]+/g, '');

function lookup<T extends string>(table: Readonly<Record<string, T>>, raw: string): T | undefined {
  return table[key(raw)];
}

const STATUS_ALIASES: Readonly<Record<string, LeadStatus>> = {
  new: LeadStatus.NEW, fresh: LeadStatus.NEW,
  contacted: LeadStatus.CONTACTED, called: LeadStatus.CONTACTED,
  qualified: LeadStatus.QUALIFIED, interested: LeadStatus.QUALIFIED,
  sitevisit: LeadStatus.SITE_VISIT, visit: LeadStatus.SITE_VISIT, visited: LeadStatus.SITE_VISIT,
  negotiation: LeadStatus.NEGOTIATION, negotiating: LeadStatus.NEGOTIATION,
  won: LeadStatus.WON, closed: LeadStatus.WON, closedwon: LeadStatus.WON, booked: LeadStatus.WON, deal: LeadStatus.WON,
  lost: LeadStatus.LOST, closedlost: LeadStatus.LOST, notinterested: LeadStatus.LOST, dead: LeadStatus.LOST,
};

const SOURCE_ALIASES: Readonly<Record<string, LeadSource>> = {
  walkin: LeadSource.WALK_IN, office: LeadSource.WALK_IN,
  phone: LeadSource.PHONE, call: LeadSource.PHONE, phonecall: LeadSource.PHONE,
  whatsapp: LeadSource.WHATSAPP,
  referral: LeadSource.REFERRAL, reference: LeadSource.REFERRAL,
  website: LeadSource.WEBSITE, web: LeadSource.WEBSITE,
  propertyportal: LeadSource.PROPERTY_PORTAL, portal: LeadSource.PROPERTY_PORTAL,
  '99acres': LeadSource.PROPERTY_PORTAL, magicbricks: LeadSource.PROPERTY_PORTAL, housing: LeadSource.PROPERTY_PORTAL, housingcom: LeadSource.PROPERTY_PORTAL, nobroker: LeadSource.PROPERTY_PORTAL,
  socialmedia: LeadSource.SOCIAL_MEDIA, social: LeadSource.SOCIAL_MEDIA, facebook: LeadSource.SOCIAL_MEDIA, instagram: LeadSource.SOCIAL_MEDIA,
  enquiryform: LeadSource.ENQUIRY_FORM, enquiry: LeadSource.ENQUIRY_FORM, qr: LeadSource.ENQUIRY_FORM, qrcode: LeadSource.ENQUIRY_FORM,
  newspaper: LeadSource.NEWSPAPER, newspaperad: LeadSource.NEWSPAPER, ad: LeadSource.NEWSPAPER,
  other: LeadSource.OTHER, others: LeadSource.OTHER,
};

const PROPERTY_TYPE_ALIASES: Readonly<Record<string, PropertyType>> = {
  apartment: PropertyType.APARTMENT, flat: PropertyType.APARTMENT,
  bungalow: PropertyType.BUNGALOW, villa: PropertyType.BUNGALOW,
  rowhouse: PropertyType.ROW_HOUSE, duplex: PropertyType.ROW_HOUSE,
  tenement: PropertyType.TENEMENT,
  penthouse: PropertyType.PENTHOUSE,
  plot: PropertyType.PLOT, land: PropertyType.PLOT,
  shop: PropertyType.SHOP, showroom: PropertyType.SHOP,
  office: PropertyType.OFFICE,
  other: PropertyType.OTHER,
};

const LISTING_ALIASES: Readonly<Record<string, ListingType>> = {
  sale: ListingType.SALE, buy: ListingType.SALE, purchase: ListingType.SALE, resale: ListingType.SALE,
  rent: ListingType.RENT, rental: ListingType.RENT, lease: ListingType.RENT,
};

const PRIORITY_ALIASES: Readonly<Record<string, LeadPriority>> = {
  low: LeadPriority.LOW, medium: LeadPriority.MEDIUM, normal: LeadPriority.MEDIUM, high: LeadPriority.HIGH, hot: LeadPriority.HIGH, urgent: LeadPriority.HIGH,
};

const FIELD_LABELS: Readonly<Record<string, string>> = {
  name: 'Name', phone: 'Phone', email: 'Email', source: 'Source', budgetMin: 'Budget min', budgetMax: 'Budget max',
  preferredLocation: 'Location', bhk: 'BHK', propertyType: 'Property type', listingType: 'Sale/Rent', status: 'Status',
  priority: 'Priority', nextFollowUpAt: 'Next follow-up', notes: 'Notes', assignedTo: 'Assigned to',
};

interface PreparedRow {
  readonly row: number;
  readonly name: string;
  readonly dto: CreateLeadDto | null;
  readonly messages: string[];
}

function validationMessages(errors: ValidationError[]): string[] {
  return errors.flatMap((e) => Object.values(e.constraints ?? {}).map((m) => `${FIELD_LABELS[e.property] ?? e.property}: ${m}`));
}

/** Lead import (CSV or Excel .xlsx) and CSV export. */
@Injectable()
export class LeadFileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limits: SubscriptionLimitsService,
    private readonly audit: AuditService,
  ) {}

  // ── Export ─────────────────────────────────────────────────────────────────

  async export(ctx: TenantContext, filters: LeadFiltersDto, meta: RequestMeta): Promise<{ csv: string; count: number }> {
    const rows = await this.prisma.lead.findMany({
      where: buildLeadWhere(ctx, filters, new Date()),
      select: leadSelect,
      orderBy: buildLeadOrderBy(filters),
      take: MAX_EXPORT_ROWS,
    });
    const ist = (d: string | null): string =>
      d ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(d)) : '';
    const csv = toCsv(
      ['Name', 'Phone', 'Email', 'Source', 'Budget Min (INR)', 'Budget Max (INR)', 'Preferred Location', 'BHK', 'Property Type',
        'Sale/Rent', 'Status', 'Priority', 'Next Follow-up', 'Assigned To', 'Notes', 'Created On'],
      rows.map(toLeadView).map((l) => [
        l.name, l.phone, l.email, l.source, l.budgetMin, l.budgetMax, l.preferredLocation, l.bhk, l.propertyType,
        l.listingType, l.status, l.priority, ist(l.nextFollowUpAt), l.assignedUser?.name, l.notes, ist(l.createdAt),
      ]),
    );
    await this.audit.recordSafely({
      action: AuditAction.LEADS_EXPORTED,
      agencyId: ctx.agencyId,
      actorUserId: ctx.userId,
      entityType: 'lead',
      metadata: { count: rows.length, filters: JSON.parse(JSON.stringify(filters)) as Prisma.InputJsonObject },
      meta,
    });
    return { csv, count: rows.length };
  }

  // ── Import ─────────────────────────────────────────────────────────────────

  async import(
    ctx: TenantContext,
    file: Buffer,
    mode: 'preview' | 'commit',
    duplicateStrategy: 'skip' | 'create',
    meta: RequestMeta,
  ): Promise<LeadImportResult> {
    const records = await this.parse(file);
    const members = await this.prisma.agencyMember.findMany({
      where: { agencyId: ctx.agencyId },
      select: { userId: true, user: { select: { email: true, name: true } } },
    });
    const prepared = records.map((r, i) => this.prepareRow(r, i + 1, members));

    const invalid: LeadImportRowIssue[] = prepared
      .filter((p) => p.messages.length > 0)
      .map((p) => ({ row: p.row, name: p.name, messages: p.messages }));
    const valid = prepared.filter((p): p is PreparedRow & { dto: CreateLeadDto } => p.dto !== null && p.messages.length === 0);

    // Duplicates: against existing (non-deleted) leads, and repeats within the file.
    const phones = [...new Set(valid.map((p) => p.dto.phone))];
    const existing = phones.length
      ? await this.prisma.lead.findMany({
          where: { agencyId: ctx.agencyId, deletedAt: null, phone: { in: phones } },
          select: { phone: true, name: true },
        })
      : [];
    const existingByPhone = new Map(existing.map((e) => [e.phone, e.name]));
    const seen = new Set<string>();
    const duplicates: LeadImportDuplicate[] = [];
    const toCreate: CreateLeadDto[] = [];
    for (const p of valid) {
      const existingName = existingByPhone.get(p.dto.phone);
      const inFile = seen.has(p.dto.phone);
      seen.add(p.dto.phone);
      if (existingName !== undefined || inFile) {
        duplicates.push({
          row: p.row,
          name: p.name,
          phone: p.dto.phone,
          kind: existingName !== undefined ? 'existing' : 'file',
          ...(existingName !== undefined ? { existingLeadName: existingName } : {}),
        });
        if (duplicateStrategy === 'skip') continue;
      }
      toCreate.push(p.dto);
    }

    const result = { totalRows: records.length, validRows: valid.length, invalid, duplicates, toCreate: toCreate.length };
    if (mode === 'preview') return { mode, ...result, created: 0 };

    if (toCreate.length === 0) return { mode, ...result, created: 0 };
    await this.prisma.$transaction(async (tx) => {
      await this.limits.assertLeadCapacity(tx, ctx.agencyId, toCreate.length);
      const rows = toCreate.map((d) => {
        const status = d.status ?? LeadStatus.NEW;
        return {
          dto: d,
          data: {
          agencyId: ctx.agencyId,
          name: d.name,
          phone: d.phone,
          email: d.email ?? null,
          source: d.source ?? LeadSource.OTHER,
          budgetMin: d.budgetMin ?? null,
          budgetMax: d.budgetMax ?? null,
          preferredLocation: d.preferredLocation ?? null,
          bhk: d.bhk ?? null,
          propertyType: d.propertyType ?? null,
          listingType: d.listingType ?? ListingType.SALE,
          status,
          closedAt: closedAtFor(status, null) ?? null,
          priority: d.priority ?? LeadPriority.MEDIUM,
          nextFollowUpAt: d.nextFollowUpAt ? new Date(d.nextFollowUpAt) : null,
          notes: d.notes ?? null,
          assignedUserId: d.assignedUserId ?? null,
          } satisfies Prisma.LeadCreateManyInput,
        };
      });
      // Rows without a follow-up date: one fast bulk insert.
      await tx.lead.createMany({ data: rows.filter((r) => !r.dto.nextFollowUpAt).map((r) => r.data) });
      // Rows with a follow-up date also get a real follow-up record (needs the lead id).
      for (const r of rows.filter((x) => x.dto.nextFollowUpAt)) {
        const lead = await tx.lead.create({ data: r.data, select: { id: true } });
        await tx.followUp.create({
          data: {
            agencyId: ctx.agencyId,
            leadId: lead.id,
            // Same default as scheduling a follow-up: the lead's assignee, else whoever imported it.
            assignedUserId: r.data.assignedUserId ?? ctx.userId,
            dueAt: r.data.nextFollowUpAt!,
            status: FollowUpStatus.PENDING,
          },
        });
      }
      await this.audit.record(
        {
          action: AuditAction.LEADS_IMPORTED,
          agencyId: ctx.agencyId,
          actorUserId: ctx.userId,
          entityType: 'lead',
          metadata: { created: toCreate.length, invalid: invalid.length, duplicates: duplicates.length, duplicateStrategy },
          meta,
        },
        tx,
      );
    });
    return { mode, ...result, created: toCreate.length };
  }

  /** CSV or Excel (.xlsx, first sheet) → one record per data row, keyed by field name. */
  private async parse(file: Buffer): Promise<Record<string, string>[]> {
    const kind = detectSpreadsheet(file);
    if (kind === 'xls') {
      throw new BadRequestException('Old Excel files (.xls) are not supported. In Excel use File → Save As → Excel Workbook (.xlsx) or CSV.');
    }
    const rows = kind === 'xlsx' ? await readXlsxRows(file) : this.readCsvRows(file);

    const [headerRow, ...dataRows] = rows;
    const fields = (headerRow ?? []).map((h) => HEADER_ALIASES[key(h)] ?? null);
    if (!fields.includes('name') || !fields.includes('phone')) {
      throw new BadRequestException('The file must have "Name" and "Phone" columns. Download the template to see the format.');
    }
    const records = dataRows
      .filter((cells) => cells.some((c) => c.trim() !== ''))
      .map((cells) => {
        const record: Record<string, string> = {};
        fields.forEach((field, i) => {
          if (field && record[field] === undefined) record[field] = (cells[i] ?? '').trim();
        });
        return record;
      });
    if (records.length === 0) throw new BadRequestException('The file has no data rows.');
    if (records.length > MAX_IMPORT_ROWS) {
      throw new BadRequestException(`A file can have at most ${MAX_IMPORT_ROWS} rows. Split it into smaller files.`);
    }
    return records;
  }

  private readCsvRows(file: Buffer): string[][] {
    try {
      return parse(file, { bom: true, skip_empty_lines: true, trim: true, relax_column_count: true }) as string[][];
    } catch {
      throw new BadRequestException('Could not read the file. Save it as CSV (comma-separated) or Excel (.xlsx) and try again.');
    }
  }

  /** Converts one spreadsheet row to a CreateLeadDto and validates it with the same rules as the form. */
  private prepareRow(
    r: Record<string, string>,
    row: number,
    members: { userId: string; user: { email: string; name: string } }[],
  ): PreparedRow {
    const messages: string[] = [];
    const get = (f: string): string | undefined => {
      const v = r[f]?.trim();
      return v ? v : undefined;
    };
    const name = get('name') ?? '';

    const amount = (f: 'budgetMin' | 'budgetMax'): number | undefined => {
      const v = get(f);
      if (v === undefined) return undefined;
      const n = parseIndianAmount(v);
      if (n === null) messages.push(`${FIELD_LABELS[f]}: "${v}" is not an amount (e.g. 8500000, 85 L, 1.2 Cr)`);
      return n ?? undefined;
    };
    const mapped = <T extends string>(f: string, table: Readonly<Record<string, T>>, strict: boolean): T | undefined => {
      const v = get(f);
      if (v === undefined) return undefined;
      const hit = lookup(table, v);
      if (!hit && strict) messages.push(`${FIELD_LABELS[f]}: "${v}" is not recognised`);
      return hit;
    };

    const bhkRaw = get('bhk');
    const bhk = bhkRaw === undefined ? undefined : parseBhk(bhkRaw);
    if (bhkRaw !== undefined && bhk === null) messages.push(`BHK: "${bhkRaw}" is not a number of bedrooms`);

    const followRaw = get('nextFollowUpAt');
    const follow = followRaw === undefined ? undefined : parseIndianDate(followRaw);
    if (followRaw !== undefined && follow === null) messages.push(`Next follow-up: "${followRaw}" is not a date (use DD/MM/YYYY)`);

    const assigneeRaw = get('assignedTo')?.toLowerCase();
    const assignee = assigneeRaw
      ? members.find((m) => m.user.email === assigneeRaw || m.user.name.toLowerCase() === assigneeRaw)
      : undefined;
    if (assigneeRaw && !assignee) messages.push(`Assigned to: "${assigneeRaw}" is not a member of your team`);

    const plain = {
      name,
      phone: get('phone'),
      email: get('email'),
      // Unknown sources fall back to "Other" rather than failing the row.
      source: get('source') ? (lookup(SOURCE_ALIASES, get('source')!) ?? LeadSource.OTHER) : undefined,
      budgetMin: amount('budgetMin'),
      budgetMax: amount('budgetMax'),
      preferredLocation: get('preferredLocation'),
      bhk: bhk ?? undefined,
      propertyType: mapped('propertyType', PROPERTY_TYPE_ALIASES, true),
      listingType: mapped('listingType', LISTING_ALIASES, true),
      status: mapped('status', STATUS_ALIASES, true),
      priority: mapped('priority', PRIORITY_ALIASES, true),
      nextFollowUpAt: follow?.toISOString(),
      notes: get('notes'),
      assignedUserId: assignee?.userId,
    };
    const dto = plainToInstance(CreateLeadDto, plain);
    messages.push(...validationMessages(validateSync(dto, { whitelist: true })));
    if (typeof dto.budgetMin === 'number' && typeof dto.budgetMax === 'number' && dto.budgetMin > dto.budgetMax) {
      messages.push('Budget: minimum is more than maximum');
    }
    return { row, name: name || '(no name)', dto: messages.length === 0 ? dto : null, messages };
  }
}
