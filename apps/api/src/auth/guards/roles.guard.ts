import { type CanActivate, type ExecutionContext, Injectable, InternalServerErrorException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ApiErrorCode } from '@brokerdesk/shared-types';
import { ROLES_KEY } from '../../common/auth/auth.decorators.js';
import { forbidden } from '../../common/http/api-errors.js';
import type { MemberRole } from '../../generated/prisma/enums.js';

/** Enforces `@Roles(...)` using the role from the verified TenantContext. Runs after AccessGuard. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<MemberRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles || roles.length === 0) return true;

    const tenant = context.switchToHttp().getRequest<Request>().tenant;
    if (!tenant) {
      // @Roles on a @Public/@AllowNoAgency route is a programming error.
      throw new InternalServerErrorException('@Roles requires an agency-scoped route');
    }
    if (!roles.includes(tenant.role)) {
      throw forbidden(ApiErrorCode.INSUFFICIENT_ROLE, 'You do not have permission to do this.');
    }
    return true;
  }
}
