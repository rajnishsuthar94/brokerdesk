import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ApiErrorCode } from '@brokerdesk/shared-types';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { generateOpaqueToken, hashToken } from '../common/crypto/tokens.js';
import { unauthorized } from '../common/http/api-errors.js';
import type { RequestMeta } from '../common/http/request-meta.js';
import { AppConfigService } from '../config/app-config.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * A just-rotated token presented again within this window is treated as a benign
 * race (two browser tabs refreshing at once) instead of token theft.
 */
export const REFRESH_REUSE_GRACE_MS = 30_000;

export interface IssuedRefreshToken {
  readonly token: string;
  readonly expiresAt: Date;
}

type Db = Prisma.TransactionClient | PrismaService;

/**
 * Rotating refresh tokens with reuse detection.
 *
 * - The browser holds the raw token in an HttpOnly cookie; the DB stores only SHA-256.
 * - Every refresh revokes the presented token and issues a new one in the same family.
 * - Presenting an already-rotated token (outside the grace window) means it was
 *   copied: the whole family is revoked and the event is audited.
 */
@Injectable()
export class RefreshTokenService {
  private readonly logger = new Logger(RefreshTokenService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly audit: AuditService,
  ) {}

  private invalid(): UnauthorizedException {
    return new UnauthorizedException('Your session has expired. Please log in again.');
  }

  /** Starts a new token family (login, register, password change). */
  issue(userId: string, meta: RequestMeta, db: Db = this.prisma): Promise<IssuedRefreshToken> {
    return this.create(db, userId, randomUUID(), meta).then(({ token, expiresAt }) => ({ token, expiresAt }));
  }

  private async create(
    db: Db,
    userId: string,
    familyId: string,
    meta: RequestMeta,
  ): Promise<{ id: string; token: string; expiresAt: Date }> {
    const token = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + this.config.get('REFRESH_TOKEN_TTL_DAYS') * 86_400_000);
    const row = await db.refreshToken.create({
      data: {
        userId,
        familyId,
        tokenHash: hashToken(token),
        expiresAt,
        userAgent: meta.userAgent,
        ipAddress: meta.ipAddress,
      },
      select: { id: true },
    });
    return { id: row.id, token, expiresAt };
  }

  /** Validates and rotates a refresh token. Returns the user id and the replacement token. */
  async rotate(presented: string, meta: RequestMeta): Promise<{ userId: string } & IssuedRefreshToken> {
    const now = new Date();
    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(presented) },
      select: {
        id: true,
        userId: true,
        familyId: true,
        expiresAt: true,
        revokedAt: true,
        replacedById: true,
        user: { select: { isActive: true } },
      },
    });
    if (!row) throw this.invalid();

    if (row.revokedAt) {
      // Revoked without being rotated (logout, password change, family already
      // killed): simply no longer valid, nothing suspicious.
      if (row.replacedById === null) throw this.invalid();

      // Rotated moments ago: another tab refreshed with the same cookie.
      if (now.getTime() - row.revokedAt.getTime() < REFRESH_REUSE_GRACE_MS) {
        throw unauthorized(ApiErrorCode.REFRESH_RACE, 'Session was refreshed in another tab. Retry.');
      }

      // A rotated token presented again later was copied: revoke the whole family.
      await this.revokeFamily(row.familyId);
      this.logger.warn(`Refresh token reuse detected for user ${row.userId}; family revoked`);
      await this.audit.recordSafely({
        action: AuditAction.AUTH_REFRESH_REUSE_DETECTED,
        actorUserId: row.userId,
        entityType: 'refresh_token_family',
        entityId: row.familyId,
        meta,
      });
      throw this.invalid();
    }

    if (row.expiresAt <= now || !row.user.isActive) throw this.invalid();

    return this.prisma.$transaction(async (tx) => {
      // Conditional claim: only one concurrent request can rotate this token.
      const claimed = await tx.refreshToken.updateMany({
        where: { id: row.id, revokedAt: null },
        data: { revokedAt: now },
      });
      if (claimed.count === 0) {
        throw unauthorized(ApiErrorCode.REFRESH_RACE, 'Session was refreshed in another tab. Retry.');
      }
      const next = await this.create(tx, row.userId, row.familyId, meta);
      await tx.refreshToken.update({ where: { id: row.id }, data: { replacedById: next.id } });
      return { userId: row.userId, token: next.token, expiresAt: next.expiresAt };
    });
  }

  /** Logout: revokes the presented token's whole family (this device's session). */
  async revokeByToken(presented: string): Promise<string | null> {
    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(presented) },
      select: { userId: true, familyId: true },
    });
    if (!row) return null;
    await this.revokeFamily(row.familyId);
    return row.userId;
  }

  async revokeFamily(familyId: string, db: Db = this.prisma): Promise<void> {
    await db.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Signs the user out everywhere (password reset/change, deactivation). */
  async revokeAllForUser(userId: string, db: Db = this.prisma): Promise<void> {
    await db.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
