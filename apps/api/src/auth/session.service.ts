import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { MembershipSummary, SessionResponse, SessionUser } from '@brokerdesk/shared-types';
import { PrismaService } from '../prisma/prisma.service.js';
import { AccessTokenService } from './access-token.service.js';

export interface SessionInfo {
  readonly user: SessionUser;
  readonly memberships: readonly MembershipSummary[];
  /** Verified: either a real membership of the user, or null. */
  readonly activeAgencyId: string | null;
}

/** Builds session payloads. The active agency is always resolved from real memberships. */
@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessTokens: AccessTokenService,
  ) {}

  async describe(userId: string, preferredAgencyId?: string | null): Promise<SessionInfo> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        isActive: true,
        memberships: {
          select: { id: true, role: true, agency: { select: { id: true, name: true } } },
          orderBy: { joinedAt: 'asc' },
        },
      },
    });
    if (!user?.isActive) throw new UnauthorizedException('Please log in to continue.');

    const memberships: MembershipSummary[] = user.memberships.map((m) => ({
      memberId: m.id,
      agencyId: m.agency.id,
      agencyName: m.agency.name,
      role: m.role,
    }));
    const preferred = memberships.find((m) => m.agencyId === preferredAgencyId);
    return {
      user: { id: user.id, name: user.name, email: user.email, phone: user.phone },
      memberships,
      activeAgencyId: preferred?.agencyId ?? memberships[0]?.agencyId ?? null,
    };
  }

  async create(userId: string, preferredAgencyId?: string | null): Promise<SessionResponse> {
    const info = await this.describe(userId, preferredAgencyId);
    return {
      ...info,
      accessToken: this.accessTokens.sign(userId, info.activeAgencyId),
      expiresIn: this.accessTokens.ttlSeconds,
    };
  }
}
