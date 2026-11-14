import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AgenciesModule } from '../agencies/agencies.module.js';
import { AccessTokenService } from './access-token.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AccessGuard } from './guards/access.guard.js';
import { RolesGuard } from './guards/roles.guard.js';
import { PasswordService } from './password.service.js';
import { RefreshTokenService } from './refresh-token.service.js';
import { SessionService } from './session.service.js';

@Module({
  // Secret and options are passed per call by AccessTokenService (from validated config).
  imports: [JwtModule.register({}), AgenciesModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    AccessTokenService,
    RefreshTokenService,
    SessionService,
    // Global guards, in order: authenticate + resolve tenant, then check roles.
    { provide: APP_GUARD, useClass: AccessGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}
