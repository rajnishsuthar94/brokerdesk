import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  ApiErrorCode,
  MAX_PROPERTY_IMAGES,
  canDeleteProperties,
  canEditProperty,
  type Paginated,
  type PropertyView,
} from '@brokerdesk/shared-types';
import { MembersService } from '../agencies/members.service.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import type { TenantContext } from '../common/auth/auth.types.js';
import { forbidden } from '../common/http/api-errors.js';
import type { RequestMeta } from '../common/http/request-meta.js';
import type { Prisma } from '../generated/prisma/client.js';
import { ImageProcessorService } from '../media/image-processor.service.js';
import { MediaUrlService } from '../media/media-url.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import type { CreatePropertyDto, ListPropertiesQueryDto, PropertyDetailsDto, UpdatePropertyDto } from './dto/property.dto.js';
import { buildPropertyOrderBy, buildPropertyWhere, propertyScope } from './property-query.js';
import { propertySelect, type PropertyRow, toPropertyView } from './property.mapper.js';

type Db = Prisma.TransactionClient | PrismaService;

function detailsData(dto: PropertyDetailsDto): Prisma.PropertyUncheckedUpdateInput {
  return {
    projectName: dto.projectName,
    city: dto.city,
    bhk: dto.bhk,
    area: dto.area,
    areaUnit: dto.areaUnit,
    furnishing: dto.furnishing,
    floor: dto.floor,
    parking: dto.parking,
    description: dto.description,
    ownerName: dto.ownerName,
    ownerPhone: dto.ownerPhone,
    availabilityStatus: dto.availabilityStatus,
  };
}

@Injectable()
export class PropertiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly members: MembersService,
    private readonly audit: AuditService,
    private readonly urls: MediaUrlService,
    private readonly images: ImageProcessorService,
    private readonly storage: StorageService,
  ) {}

  private view(row: PropertyRow): PropertyView {
    return toPropertyView(row, this.urls);
  }

  async list(ctx: TenantContext, q: ListPropertiesQueryDto): Promise<Paginated<PropertyView>> {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    const where = buildPropertyWhere(ctx, q);
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.property.count({ where }),
      this.prisma.property.findMany({
        where,
        select: propertySelect,
        orderBy: buildPropertyOrderBy(q),
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { items: rows.map((r) => this.view(r)), total, page, pageSize };
  }

  async get(ctx: TenantContext, id: string): Promise<PropertyView> {
    return this.view(await this.findVisible(this.prisma, ctx, id));
  }

  async create(ctx: TenantContext, dto: CreatePropertyDto): Promise<PropertyView> {
    const assignedUserId = await this.resolveAssignee(ctx, dto.assignedUserId, true);
    const row = await this.prisma.property.create({
      data: {
        ...(detailsData(dto) as Prisma.PropertyUncheckedCreateInput),
        agencyId: ctx.agencyId,
        title: dto.title,
        propertyType: dto.propertyType,
        listingType: dto.listingType,
        location: dto.location,
        price: dto.price,
        assignedUserId,
      },
      select: propertySelect,
    });
    return this.view(row);
  }

  async update(ctx: TenantContext, id: string, dto: UpdatePropertyDto): Promise<PropertyView> {
    return this.prisma.$transaction(async (tx) => {
      const current = await this.findEditable(tx, ctx, id);
      let assignedUserId: string | null | undefined;
      if (dto.assignedUserId !== undefined && dto.assignedUserId !== (current.assignedUser?.id ?? null)) {
        assignedUserId = await this.resolveAssignee(ctx, dto.assignedUserId, false, tx);
      }
      const row = await tx.property.update({
        where: { id },
        data: {
          ...detailsData(dto),
          title: dto.title,
          propertyType: dto.propertyType,
          listingType: dto.listingType,
          location: dto.location,
          price: dto.price,
          assignedUserId,
        },
        select: propertySelect,
      });
      return this.view(row);
    });
  }

  /** Soft delete (managers). Use availabilityStatus = ARCHIVED to just hide a listing. */
  async remove(ctx: TenantContext, id: string, meta: RequestMeta): Promise<void> {
    if (!canDeleteProperties(ctx.role)) {
      throw forbidden(ApiErrorCode.INSUFFICIENT_ROLE, 'Only owners and admins can delete properties.');
    }
    await this.prisma.$transaction(async (tx) => {
      const p = await this.findVisible(tx, ctx, id);
      await tx.property.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.audit.record(
        {
          action: AuditAction.PROPERTY_DELETED,
          agencyId: ctx.agencyId,
          actorUserId: ctx.userId,
          entityType: 'property',
          entityId: id,
          metadata: { title: p.title },
          meta,
        },
        tx,
      );
    });
  }

  // ── Images ─────────────────────────────────────────────────────────────────

  async addImages(ctx: TenantContext, id: string, files: Express.Multer.File[]): Promise<PropertyView> {
    if (files.length === 0) throw new BadRequestException('Choose at least one photo.');
    const current = await this.findEditable(this.prisma, ctx, id);
    if (current.images.length + files.length > MAX_PROPERTY_IMAGES) {
      throw new BadRequestException(
        `A property can have at most ${MAX_PROPERTY_IMAGES} photos (it has ${current.images.length}).`,
      );
    }
    // Re-encode everything first: if any file is invalid, nothing is stored.
    const processed = await Promise.all(files.map((f) => this.images.process(f.buffer)));

    const stored: string[] = [];
    try {
      const start = current.images.reduce((max, i) => Math.max(max, i.displayOrder + 1), 0);
      const records: Prisma.PropertyImageCreateManyInput[] = [];
      for (const [i, img] of processed.entries()) {
        const imageId = randomUUID();
        const storageKey = `${ctx.agencyId}/${id}/${imageId}.webp`;
        await this.storage.put(storageKey, img.data);
        stored.push(storageKey);
        records.push({
          id: imageId,
          agencyId: ctx.agencyId,
          propertyId: id,
          storageKey,
          originalFileName: (files[i]?.originalname ?? 'photo').slice(0, 255),
          mimeType: 'image/webp',
          sizeBytes: img.data.length,
          displayOrder: start + i,
        });
      }
      await this.prisma.propertyImage.createMany({ data: records });
    } catch (error: unknown) {
      await Promise.all(stored.map((key) => this.storage.remove(key)));
      throw error;
    }
    return this.get(ctx, id);
  }

  async removeImage(ctx: TenantContext, id: string, imageId: string): Promise<PropertyView> {
    await this.findEditable(this.prisma, ctx, id);
    const image = await this.prisma.propertyImage.findFirst({
      where: { id: imageId, propertyId: id, agencyId: ctx.agencyId },
      select: { id: true, storageKey: true },
    });
    if (!image) throw new NotFoundException('Photo not found');
    await this.prisma.propertyImage.delete({ where: { id: image.id } });
    await this.storage.remove(image.storageKey);
    return this.get(ctx, id);
  }

  /** The first image is the cover. `imageIds` must list exactly the property's images. */
  async reorderImages(ctx: TenantContext, id: string, imageIds: string[]): Promise<PropertyView> {
    await this.prisma.$transaction(async (tx) => {
      const current = await this.findEditable(tx, ctx, id);
      const existing = new Set(current.images.map((i) => i.id));
      if (imageIds.length !== existing.size || new Set(imageIds).size !== imageIds.length || !imageIds.every((i) => existing.has(i))) {
        throw new BadRequestException('The photo list is out of date. Refresh and try again.');
      }
      for (const [displayOrder, imageId] of imageIds.entries()) {
        await tx.propertyImage.update({ where: { id: imageId }, data: { displayOrder } });
      }
    });
    return this.get(ctx, id);
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  /** Tenant-scoped: another agency's property id behaves exactly like a missing one. */
  private async findVisible(db: Db, ctx: TenantContext, id: string): Promise<PropertyRow> {
    const p = await db.property.findFirst({ where: { id, ...propertyScope(ctx) }, select: propertySelect });
    if (!p) throw new NotFoundException('Property not found');
    return p;
  }

  private async findEditable(db: Db, ctx: TenantContext, id: string): Promise<PropertyRow> {
    const p = await this.findVisible(db, ctx, id);
    if (!canEditProperty(ctx.role, p.assignedUser?.id ?? null, ctx.userId)) {
      throw forbidden(ApiErrorCode.INSUFFICIENT_ROLE, 'Only owners, admins or the assigned agent can edit this property.');
    }
    return p;
  }

  /**
   * Managers may assign anyone in the agency (or nobody). Agents' new listings
   * are assigned to themselves so they can keep editing them; agents cannot
   * reassign. The id must always belong to THIS agency.
   */
  private async resolveAssignee(
    ctx: TenantContext,
    requested: string | null | undefined,
    creating: boolean,
    db: Db = this.prisma,
  ): Promise<string | null> {
    const manager = canDeleteProperties(ctx.role);
    if (!manager) {
      if (requested !== undefined && requested !== ctx.userId && !(creating && requested === null)) {
        throw forbidden(ApiErrorCode.INSUFFICIENT_ROLE, 'Only owners and admins can assign properties to others.');
      }
      return creating ? ctx.userId : (requested ?? null);
    }
    if (requested === undefined || requested === null) return null;
    await this.members.assertIsMember(ctx.agencyId, requested, db);
    return requested;
  }
}
