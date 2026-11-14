import type { PropertyView } from '@brokerdesk/shared-types';
import type { Prisma } from '../generated/prisma/client.js';
import type { MediaUrlService } from '../media/media-url.service.js';

export const propertySelect = {
  id: true,
  title: true,
  propertyType: true,
  listingType: true,
  projectName: true,
  location: true,
  city: true,
  price: true,
  bhk: true,
  area: true,
  areaUnit: true,
  furnishing: true,
  floor: true,
  parking: true,
  description: true,
  ownerName: true,
  ownerPhone: true,
  availabilityStatus: true,
  createdAt: true,
  updatedAt: true,
  assignedUser: { select: { id: true, name: true } },
  images: {
    select: { id: true, storageKey: true, displayOrder: true },
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
  },
} as const satisfies Prisma.PropertySelect;

export type PropertyRow = Prisma.PropertyGetPayload<{ select: typeof propertySelect }>;

export function toPropertyView(p: PropertyRow, urls: MediaUrlService): PropertyView {
  const images = p.images.map((i) => ({ id: i.id, url: urls.sign(i.storageKey), displayOrder: i.displayOrder }));
  return {
    ...p,
    price: p.price.toNumber(),
    area: p.area?.toNumber() ?? null,
    images,
    coverImageUrl: images[0]?.url ?? null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}
