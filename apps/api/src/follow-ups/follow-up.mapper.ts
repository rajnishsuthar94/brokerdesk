import type { FollowUpView } from '@brokerdesk/shared-types';
import type { Prisma } from '../generated/prisma/client.js';

export const followUpSelect = {
  id: true,
  dueAt: true,
  status: true,
  notes: true,
  completedAt: true,
  createdAt: true,
  lead: { select: { id: true, name: true, phone: true, status: true } },
  assignedUser: { select: { id: true, name: true } },
} as const satisfies Prisma.FollowUpSelect;

export type FollowUpRow = Prisma.FollowUpGetPayload<{ select: typeof followUpSelect }>;

export function toFollowUpView(f: FollowUpRow): FollowUpView {
  return {
    ...f,
    dueAt: f.dueAt.toISOString(),
    completedAt: f.completedAt?.toISOString() ?? null,
    createdAt: f.createdAt.toISOString(),
  };
}
