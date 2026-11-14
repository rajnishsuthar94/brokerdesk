import type { SiteVisitView } from '@brokerdesk/shared-types';
import type { Prisma } from '../generated/prisma/client.js';
import type { MediaUrlService } from '../media/media-url.service.js';

export const siteVisitSelect = {
  id: true,
  scheduledAt: true,
  status: true,
  feedback: true,
  createdAt: true,
  lead: { select: { id: true, name: true, phone: true, status: true } },
  property: {
    select: {
      id: true,
      title: true,
      location: true,
      images: { select: { storageKey: true }, orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }], take: 1 },
    },
  },
  assignedUser: { select: { id: true, name: true } },
} as const satisfies Prisma.SiteVisitSelect;

export type SiteVisitRow = Prisma.SiteVisitGetPayload<{ select: typeof siteVisitSelect }>;

export function toSiteVisitView(v: SiteVisitRow, urls: MediaUrlService): SiteVisitView {
  const cover = v.property.images[0];
  return {
    id: v.id,
    lead: v.lead,
    property: {
      id: v.property.id,
      title: v.property.title,
      location: v.property.location,
      coverImageUrl: cover ? urls.sign(cover.storageKey) : null,
    },
    assignedUser: v.assignedUser,
    scheduledAt: v.scheduledAt.toISOString(),
    status: v.status,
    feedback: v.feedback,
    createdAt: v.createdAt.toISOString(),
  };
}
