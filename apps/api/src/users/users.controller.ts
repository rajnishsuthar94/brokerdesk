import { Body, Controller, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';
import type { SessionUser } from '@brokerdesk/shared-types';
import { AllowNoAgency, CurrentAuth } from '../common/auth/auth.decorators.js';
import type { AuthPrincipal } from '../common/auth/auth.types.js';
import { IsIndianMobile, ToIndianMobile, ToTrimmedText } from '../common/validation/validators.js';
import { PrismaService } from '../prisma/prisma.service.js';

export class UpdateProfileDto {
  @ToTrimmedText()
  @IsOptional()
  @IsString()
  @Length(2, 150)
  name?: string;

  /** A blank value removes the phone number. */
  @ToIndianMobile(null)
  @IsOptional()
  @IsIndianMobile()
  phone?: string | null;
}

/** The signed-in user's own profile. Email changes need verification and are not supported yet. */
@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Patch('me')
  @AllowNoAgency()
  updateMe(@CurrentAuth() auth: AuthPrincipal, @Body() dto: UpdateProfileDto): Promise<SessionUser> {
    return this.prisma.user.update({
      where: { id: auth.userId },
      data: { name: dto.name, phone: dto.phone },
      select: { id: true, name: true, email: true, phone: true },
    });
  }
}
