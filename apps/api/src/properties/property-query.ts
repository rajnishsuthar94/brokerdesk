import type { TenantContext } from '../common/auth/auth.types.js';
import type { Prisma } from '../generated/prisma/client.js';
import { AvailabilityStatus } from '../generated/prisma/enums.js';
import type { ListPropertiesQueryDto } from './dto/property.dto.js';

/**
 * Properties visible to the caller: every non-deleted property of their agency.
 * (Inventory is shared within an agency; editing rights are checked separately.)
 * EVERY property query must start from this.
 */
export function propertyScope(ctx: TenantContext): Prisma.PropertyWhereInput {
  return { agencyId: ctx.agencyId, deletedAt: null };
}

export function buildPropertyWhere(ctx: TenantContext, q: ListPropertiesQueryDto): Prisma.PropertyWhereInput {
  const and: Prisma.PropertyWhereInput[] = [propertyScope(ctx)];

  if (q.search) {
    const digits = q.search.replace(/\D/g, '');
    const or: Prisma.PropertyWhereInput[] = [
      { title: { contains: q.search } },
      { location: { contains: q.search } },
      { projectName: { contains: q.search } },
      { ownerName: { contains: q.search } },
    ];
    if (digits.length >= 4) or.push({ ownerPhone: { contains: digits } });
    and.push({ OR: or });
  }
  if (q.listingType) and.push({ listingType: q.listingType });
  if (q.propertyType?.length) and.push({ propertyType: { in: q.propertyType } });
  if (q.bhk?.length) and.push({ bhk: { in: q.bhk } });
  if (q.minPrice !== undefined) and.push({ price: { gte: q.minPrice } });
  if (q.maxPrice !== undefined) and.push({ price: { lte: q.maxPrice } });
  // Archived listings are hidden unless explicitly asked for.
  and.push(
    q.availabilityStatus?.length
      ? { availabilityStatus: { in: q.availabilityStatus } }
      : { availabilityStatus: { not: AvailabilityStatus.ARCHIVED } },
  );
  if (q.assignedTo === 'me') and.push({ assignedUserId: ctx.userId });
  else if (q.assignedTo === 'unassigned') and.push({ assignedUserId: null });
  else if (q.assignedTo) and.push({ assignedUserId: q.assignedTo });

  return { AND: and };
}

export function buildPropertyOrderBy(q: ListPropertiesQueryDto): Prisma.PropertyOrderByWithRelationInput[] {
  const field = q.sort ?? 'createdAt';
  const order = q.order ?? (field === 'title' || field === 'price' ? 'asc' : 'desc');
  return [{ [field]: order }, { id: 'desc' }];
}
