import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { ApiErrorCode, type SessionResponse } from '@brokerdesk/shared-types';
import { AllowNoAgency, CurrentAuth, Public } from '../common/auth/auth.decorators.js';
import type { AuthPrincipal } from '../common/auth/auth.types.js';
import { requestMeta } from '../common/http/request-meta.js';
import { AppConfigService } from '../config/app-config.service.js';
import { AuthService, type AuthResult } from './auth.service.js';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  RefreshDto,
  RegisterDto,
  ResetPasswordDto,
  SwitchAgencyDto,
} from './dto/auth.dto.js';
import {
  assertClientHeader,
  clearRefreshCookie,
  readRefreshCookie,
  setRefreshCookie,
} from './refresh-cookie.js';
import type { SessionInfo } from './session.service.js';

/** Every auth endpoint is rate limited per client IP (AUTH_THROTTLE_*). */
@ApiTags('auth')
@Controller('auth')
@UseGuards(ThrottlerGuard)
@SkipThrottle({ publicEnquiry: true })
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: AppConfigService,
  ) {}

  private get secureCookie(): boolean {
    return this.config.get('REFRESH_COOKIE_SECURE');
  }

  private respond(res: Response, result: AuthResult): SessionResponse {
    setRefreshCookie(res, result.refresh.token, result.refresh.expiresAt, this.secureCookie);
    return result.session;
  }

  @Post('register')
  @Public()
  async register(@Body() dto: RegisterDto, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<SessionResponse> {
    return this.respond(res, await this.auth.register(dto, requestMeta(req)));
  }

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<SessionResponse> {
    return this.respond(res, await this.auth.login(dto, requestMeta(req)));
  }

  /** Uses the HttpOnly refresh cookie; rotates it. */
  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshDto, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<SessionResponse> {
    assertClientHeader(req);
    const token = readRefreshCookie(req);
    if (!token) throw new UnauthorizedException('Please log in to continue.');
    try {
      return this.respond(res, await this.auth.refresh(token, dto.agencyId, requestMeta(req)));
    } catch (error: unknown) {
      // A dead token should not linger in the browser (except during a benign tab race).
      const isRace =
        error instanceof UnauthorizedException &&
        (error.getResponse() as { code?: string }).code === ApiErrorCode.REFRESH_RACE;
      if (!isRace) clearRefreshCookie(res, this.secureCookie);
      throw error;
    }
  }

  @Post('logout')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    assertClientHeader(req);
    await this.auth.logout(readRefreshCookie(req), requestMeta(req));
    clearRefreshCookie(res, this.secureCookie);
  }

  /** Always 202, whether or not the email exists. */
  @Post('forgot-password')
  @Public()
  @HttpCode(HttpStatus.ACCEPTED)
  forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request): { message: string } {
    this.auth.requestPasswordReset(dto.email, requestMeta(req));
    return { message: 'If an account exists for this email, a reset link has been sent.' };
  }

  @Post('reset-password')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  resetPassword(@Body() dto: ResetPasswordDto, @Req() req: Request): Promise<void> {
    return this.auth.resetPassword(dto.token, dto.password, requestMeta(req));
  }

  @Get('me')
  @AllowNoAgency()
  @ApiBearerAuth()
  me(@CurrentAuth() auth: AuthPrincipal): Promise<SessionInfo> {
    return this.auth.me(auth.userId, auth.agencyIdHint);
  }

  /** Issues a new access token scoped to another agency the user belongs to. */
  @Post('switch-agency')
  @AllowNoAgency()
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  switchAgency(@CurrentAuth() auth: AuthPrincipal, @Body() dto: SwitchAgencyDto, @Req() req: Request): Promise<SessionResponse> {
    return this.auth.switchAgency(auth.userId, dto.agencyId, requestMeta(req));
  }

  /** Signs out all other devices and returns a fresh session for this one. */
  @Post('change-password')
  @AllowNoAgency()
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentAuth() auth: AuthPrincipal,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponse> {
    return this.respond(res, await this.auth.changePassword(auth.userId, dto, auth.agencyIdHint, requestMeta(req)));
  }
}
