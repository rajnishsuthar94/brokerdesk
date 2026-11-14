import { BadRequestException, ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ApiErrorCode, type SessionResponse } from '@brokerdesk/shared-types';
import { AgenciesService } from '../agencies/agencies.service.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { generateOpaqueToken, hashToken } from '../common/crypto/tokens.js';
import { forbidden } from '../common/http/api-errors.js';
import type { RequestMeta } from '../common/http/request-meta.js';
import { AppConfigService } from '../config/app-config.service.js';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ChangePasswordDto, LoginDto, RegisterDto } from './dto/auth.dto.js';
import { PasswordService } from './password.service.js';
import { type IssuedRefreshToken, RefreshTokenService } from './refresh-token.service.js';
import { type SessionInfo, SessionService } from './session.service.js';

export interface AuthResult {
  readonly session: SessionResponse;
  readonly refresh: IssuedRefreshToken;
}

const INVALID_CREDENTIALS = 'Incorrect email or password';
const INVALID_RESET = 'This password reset link is invalid or has expired. Please request a new one.';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly sessions: SessionService,
    private readonly agencies: AgenciesService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
  ) {}

  async register(dto: RegisterDto, meta: RequestMeta): Promise<AuthResult> {
    const passwordHash = await this.passwords.hash(dto.password);

    const { userId, agencyId, refresh } = await this.prisma.$transaction(async (tx) => {
      const exists = await tx.user.findUnique({ where: { email: dto.email }, select: { id: true } });
      if (exists) throw new ConflictException('An account with this email already exists. Please log in.');

      const user = await tx.user.create({
        data: { name: dto.name, email: dto.email, phone: dto.phone ?? null, passwordHash, lastLoginAt: new Date() },
        select: { id: true },
      });
      const agency = dto.agencyName
        ? await this.agencies.createInTransaction(tx, user.id, { name: dto.agencyName }, meta)
        : null;
      await this.audit.record(
        { action: AuditAction.AUTH_REGISTER, agencyId: agency?.id, actorUserId: user.id, entityType: 'user', entityId: user.id, meta },
        tx,
      );
      return { userId: user.id, agencyId: agency?.id ?? null, refresh: await this.refreshTokens.issue(user.id, meta, tx) };
    });

    return { session: await this.sessions.create(userId, agencyId), refresh };
  }

  async login(dto: LoginDto, meta: RequestMeta): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true, passwordHash: true, isActive: true },
    });
    // Always run a full Argon2 verification so response time does not reveal whether the email exists.
    const valid = await this.passwords.verify(user?.passwordHash ?? null, dto.password);

    if (!user || !valid || !user.isActive) {
      await this.audit.recordSafely({
        action: AuditAction.AUTH_LOGIN_FAILED,
        actorUserId: user?.id ?? null,
        metadata: { reason: !user ? 'unknown_email' : !valid ? 'bad_password' : 'inactive' },
        meta,
      });
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const passwordHash = this.passwords.needsRehash(user.passwordHash)
      ? await this.passwords.hash(dto.password)
      : undefined;
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), passwordHash } });

    const refresh = await this.refreshTokens.issue(user.id, meta);
    const session = await this.sessions.create(user.id, dto.agencyId);
    await this.audit.recordSafely({
      action: AuditAction.AUTH_LOGIN,
      agencyId: session.activeAgencyId,
      actorUserId: user.id,
      meta,
    });
    return { session, refresh };
  }

  async refresh(presentedToken: string, preferredAgencyId: string | undefined, meta: RequestMeta): Promise<AuthResult> {
    const rotated = await this.refreshTokens.rotate(presentedToken, meta);
    const session = await this.sessions.create(rotated.userId, preferredAgencyId);
    return { session, refresh: { token: rotated.token, expiresAt: rotated.expiresAt } };
  }

  async logout(presentedToken: string | undefined, meta: RequestMeta): Promise<void> {
    if (!presentedToken) return;
    const userId = await this.refreshTokens.revokeByToken(presentedToken);
    if (userId) await this.audit.recordSafely({ action: AuditAction.AUTH_LOGOUT, actorUserId: userId, meta });
  }

  me(userId: string, agencyIdHint: string | null): Promise<SessionInfo> {
    return this.sessions.describe(userId, agencyIdHint);
  }

  async switchAgency(userId: string, agencyId: string, meta: RequestMeta): Promise<SessionResponse> {
    const membership = await this.prisma.agencyMember.findUnique({
      where: { agencyId_userId: { agencyId, userId } },
      select: { id: true },
    });
    // Same response for "agency exists but you're not a member" and "no such agency".
    if (!membership) throw forbidden(ApiErrorCode.NOT_A_MEMBER, 'You are not a member of this agency.');
    await this.audit.recordSafely({ action: AuditAction.AUTH_AGENCY_SWITCHED, agencyId, actorUserId: userId, meta });
    return this.sessions.create(userId, agencyId);
  }

  /**
   * Always succeeds from the caller's point of view (no account enumeration).
   * The work runs after the response so timing does not reveal whether the email exists.
   */
  requestPasswordReset(email: string, meta: RequestMeta): void {
    void this.issuePasswordReset(email, meta).catch((error: unknown) => {
      this.logger.error('Password reset request failed', error instanceof Error ? error.stack : undefined);
    });
  }

  private async issuePasswordReset(email: string, meta: RequestMeta): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email }, select: { id: true, email: true, isActive: true } });
    if (!user?.isActive) return;

    const token = generateOpaqueToken();
    const ttlMinutes = this.config.get('PASSWORD_RESET_TTL_MINUTES');
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      // Only the newest link works.
      await tx.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: now } });
      await tx.passwordResetToken.create({
        data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(now.getTime() + ttlMinutes * 60_000) },
      });
      await this.audit.record({ action: AuditAction.AUTH_PASSWORD_RESET_REQUESTED, actorUserId: user.id, meta }, tx);
    });
    const link = `${this.config.get('APP_BASE_URL')}/reset-password?token=${encodeURIComponent(token)}`;
    await this.mail.sendPasswordReset(user.email, link, ttlMinutes);
  }

  async resetPassword(token: string, newPassword: string, meta: RequestMeta): Promise<void> {
    const now = new Date();
    const row = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(token) },
      select: { id: true, userId: true, usedAt: true, expiresAt: true, user: { select: { isActive: true } } },
    });
    if (!row || row.usedAt || row.expiresAt <= now || !row.user.isActive) throw new BadRequestException(INVALID_RESET);

    const passwordHash = await this.passwords.hash(newPassword);
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.passwordResetToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: now } });
      if (claimed.count === 0) throw new BadRequestException(INVALID_RESET);
      await tx.user.update({ where: { id: row.userId }, data: { passwordHash } });
      // Sign out every device: whoever knew the old password loses access.
      await this.refreshTokens.revokeAllForUser(row.userId, tx);
      await this.audit.record({ action: AuditAction.AUTH_PASSWORD_RESET, actorUserId: row.userId, meta }, tx);
    });
  }

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
    agencyIdHint: string | null,
    meta: RequestMeta,
  ): Promise<AuthResult> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } });
    if (!(await this.passwords.verify(user.passwordHash, dto.currentPassword))) {
      throw new BadRequestException('Your current password is incorrect');
    }
    const passwordHash = await this.passwords.hash(dto.newPassword);
    const refresh = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash } });
      await this.refreshTokens.revokeAllForUser(userId, tx);
      await this.audit.record({ action: AuditAction.AUTH_PASSWORD_CHANGED, actorUserId: userId, meta }, tx);
      return this.refreshTokens.issue(userId, meta, tx);
    });
    return { session: await this.sessions.create(userId, agencyIdHint), refresh };
  }
}
