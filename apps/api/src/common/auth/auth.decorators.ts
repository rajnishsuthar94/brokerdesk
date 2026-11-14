import {
  createParamDecorator,
  type ExecutionContext,
  InternalServerErrorException,
  SetMetadata,
} from '@nestjs/common';
import type { Request } from 'express';
import type { MemberRole } from '../../generated/prisma/enums.js';
import type { AuthPrincipal, TenantContext } from './auth.types.js';

export const IS_PUBLIC_KEY = 'bd:isPublic';
export const ALLOW_NO_AGENCY_KEY = 'bd:allowNoAgency';
export const ROLES_KEY = 'bd:roles';

/**
 * Route needs no authentication (login, register, health…).
 * Everything else is authenticated by default (deny by default).
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Route needs an authenticated user but no active agency (profile, create agency,
 * accept invitation, switch agency). Every other authenticated route requires a
 * verified agency membership (deny by default).
 */
export const AllowNoAgency = (): MethodDecorator & ClassDecorator =>
  SetMetadata(ALLOW_NO_AGENCY_KEY, true);

/** Restrict a tenant route to the given membership roles. */
export const Roles = (...roles: MemberRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);

/** Injects the authenticated principal. */
export const CurrentAuth = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthPrincipal => {
  const auth = ctx.switchToHttp().getRequest<Request>().auth;
  if (!auth) throw new InternalServerErrorException('CurrentAuth used on an unauthenticated route');
  return auth;
});

/** Injects the verified tenant context (agency + role from the membership row). */
export const Tenant = createParamDecorator((_: unknown, ctx: ExecutionContext): TenantContext => {
  const tenant = ctx.switchToHttp().getRequest<Request>().tenant;
  if (!tenant) throw new InternalServerErrorException('Tenant used on a route without agency context');
  return tenant;
});
