import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { MemberRole } from '../../generated/prisma/enums.js';
import { ToNormalizedEmail, ToTrimmedText } from '../../common/validation/validators.js';

/** Office numbers may be landlines (079-2650 1234), so this is looser than a mobile check. */
const PHONE_PATTERN = /^\+?[\d\s\-()]{7,20}$/;

export class CreateAgencyDto {
  @ToTrimmedText()
  @IsString()
  @Length(2, 150)
  name!: string;

  @ToNormalizedEmail()
  @IsOptional()
  @IsEmail()
  @MaxLength(191)
  email?: string;

  @ToTrimmedText()
  @IsOptional()
  @Matches(PHONE_PATTERN, { message: 'Enter a valid phone number' })
  phone?: string;

  @ToTrimmedText()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ToTrimmedText()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ToTrimmedText()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;
}

/** Blank optional fields are cleared (stored as NULL). */
export class UpdateAgencyDto {
  @ToTrimmedText()
  @IsOptional()
  @IsString()
  @Length(2, 150)
  name?: string;

  @ToNormalizedEmail(null)
  @IsOptional()
  @IsEmail()
  @MaxLength(191)
  email?: string | null;

  @ToTrimmedText(null)
  @IsOptional()
  @Matches(PHONE_PATTERN, { message: 'Enter a valid phone number' })
  phone?: string | null;

  @ToTrimmedText(null)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string | null;

  @ToTrimmedText(null)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string | null;

  @ToTrimmedText(null)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string | null;
}

export class InviteMemberDto {
  @ToNormalizedEmail()
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(191)
  email!: string;

  @IsEnum(MemberRole)
  role!: MemberRole;
}

export class ChangeRoleDto {
  @IsEnum(MemberRole)
  role!: MemberRole;
}

export class InvitationTokenDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(20, 200)
  token!: string;
}
