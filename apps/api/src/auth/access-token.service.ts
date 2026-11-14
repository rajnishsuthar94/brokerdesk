import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AccessTokenClaims } from '../common/auth/auth.types.js';
import { AppConfigService } from '../config/app-config.service.js';

const ISSUER = 'brokerdesk-api';
const AUDIENCE = 'brokerdesk-web';

/** Signs and verifies short-lived HS256 access tokens. */
@Injectable()
export class AccessTokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
  ) {}

  get ttlSeconds(): number {
    return this.config.get('JWT_ACCESS_TTL_SECONDS');
  }

  sign(userId: string, agencyId: string | null): string {
    const claims: AccessTokenClaims = { sub: userId, aid: agencyId, typ: 'access' };
    return this.jwt.sign(claims, {
      secret: this.config.get('JWT_ACCESS_SECRET'),
      expiresIn: this.ttlSeconds,
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithm: 'HS256',
    });
  }

  /** Returns the claims, or null for any invalid/expired/foreign token. */
  verify(token: string): AccessTokenClaims | null {
    try {
      const payload = this.jwt.verify<Record<string, unknown>>(token, {
        secret: this.config.get('JWT_ACCESS_SECRET'),
        issuer: ISSUER,
        audience: AUDIENCE,
        algorithms: ['HS256'],
      });
      const { sub, aid, typ } = payload;
      if (typ !== 'access' || typeof sub !== 'string') return null;
      if (aid !== null && typeof aid !== 'string') return null;
      return { sub, aid, typ };
    } catch {
      return null;
    }
  }
}
