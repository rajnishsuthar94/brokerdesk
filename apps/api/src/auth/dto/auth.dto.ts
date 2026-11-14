import { IsEmail, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';
import {
  IsAcceptablePassword,
  IsIndianMobile,
  PASSWORD_MAX_LENGTH,
  ToIndianMobile,
  ToNormalizedEmail,
  ToTrimmedText,
} from '../../common/validation/validators.js';

export class RegisterDto {
  /** Full name, e.g. "Ramesh Patel". */
  @ToTrimmedText()
  @IsString()
  @Length(2, 150)
  name!: string;

  @ToNormalizedEmail()
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(191)
  email!: string;

  /** Indian mobile number; stored as +91XXXXXXXXXX. */
  @ToIndianMobile()
  @IsOptional()
  @IsIndianMobile()
  phone?: string;

  @IsString()
  @IsAcceptablePassword()
  password!: string;

  /** Creates a new agency owned by this user. Omit when joining via an invitation. */
  @ToTrimmedText()
  @IsOptional()
  @IsString()
  @Length(2, 150)
  agencyName?: string;
}

export class LoginDto {
  @ToNormalizedEmail()
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(191)
  email!: string;

  @IsString()
  @Length(1, PASSWORD_MAX_LENGTH)
  password!: string;

  /** Preferred agency (e.g. last used). Ignored unless the user is a member. */
  @IsOptional()
  @IsUUID('all')
  agencyId?: string;
}

export class RefreshDto {
  /** Agency to scope the new access token to. Ignored unless the user is a member. */
  @IsOptional()
  @IsUUID('all')
  agencyId?: string;
}

export class SwitchAgencyDto {
  @IsUUID('all')
  agencyId!: string;
}

export class ForgotPasswordDto {
  @ToNormalizedEmail()
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(191)
  email!: string;
}

export class ResetPasswordDto {
  @IsString()
  @Length(20, 200)
  token!: string;

  @IsString()
  @IsAcceptablePassword()
  password!: string;
}

export class ChangePasswordDto {
  @IsString()
  @Length(1, PASSWORD_MAX_LENGTH)
  currentPassword!: string;

  @IsString()
  @IsAcceptablePassword()
  newPassword!: string;
}
