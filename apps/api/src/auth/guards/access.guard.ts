import { type CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ApiErrorCode } from '@brokerdesk/shared-types';
import { ALLOW_NO_AGENCY_KEY, IS_PUBLIC_KEY } from '../../common/auth/auth.decorators.js';
import { forbidden } from '../../common/http/api-errors.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AccessTokenService } from '../access-token.service.js';

/**
 * Global authentication + tenant guard (deny by default).
 *
 * 1. `@Public()` routes skip authentication.
 * 2. Otherwise a valid Bearer access token is required.
 * 3. Unless the route is `@AllowNoAgency()`, the token's agency hint is verified
 *    against `agency_members` ON EVERY REQUEST and the request receives a
 *    `TenantContext` built from that row. The role always comes from the
 *    database, never from the token, so removals and role changes apply at once.
 */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: AccessTokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const claims = this.readBearer(req);
    if (!claims) throw new UnauthorizedException('Please log in to continue.');

    req.auth = { userId: claims.sub, agencyIdHint: claims.aid };

    if (this.reflector.getAllAndOverride<boolean>(ALLOW_NO_AGENCY_KEY, targets)) {
      const user = await this.prisma.user.findUnique({
        where: { id: claims.sub },
        select: { isActive: true },
      });
      if (!user?.isActive) throw new UnauthorizedException('Please log in to continue.');
      return true;
    }

    if (!claims.aid) {
      throw forbidden(ApiErrorCode.NO_ACTIVE_AGENCY, 'Select or create an agency to continue.');
    }

    const member = await this.prisma.agencyMember.findUnique({
      where: { agencyId_userId: { agencyId: claims.aid, userId: claims.sub } },
      select: { id: true, role: true, user: { select: { isActive: true } } },
    });
    if (!member) {
      throw forbidden(ApiErrorCode.NOT_A_MEMBER, 'You no longer have access to this agency.');
    }
    if (!member.user.isActive) throw new UnauthorizedException('Please log in to continue.');

    req.tenant = { userId: claims.sub, agencyId: claims.aid, memberId: member.id, role: member.role };
    return true;
  }

  private readBearer(req: Request): ReturnType<AccessTokenService['verify']> {
    const header = req.get('authorization');
    if (!header) return null;
    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
    return this.tokens.verify(token);
  }
}
