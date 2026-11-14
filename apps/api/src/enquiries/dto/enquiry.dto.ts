import { Transform } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ENQUIRY_CHANNELS, type EnquiryChannel } from '@brokerdesk/shared-types';
import { ToNormalizedEmail, ToTrimmedText } from '../../common/validation/validators.js';
import { ListingType, PropertyType } from '../../generated/prisma/enums.js';
import { IsLeadPhone, ToLeadPhone } from '../../leads/dto/lead.dto.js';

/**
 * Body of the PUBLIC enquiry form. Deliberately narrow: visitors can only
 * describe their requirement. Status, priority, assignee and agency are set by
 * the server; any other field is rejected (forbidNonWhitelisted).
 */
export class PublicEnquiryDto {
  @ToTrimmedText()
  @IsString({ message: 'Please enter your name' })
  @Length(2, 100, { message: 'Please enter your name' })
  name!: string;

  @ToLeadPhone()
  @IsString({ message: 'Please enter your mobile number' })
  @IsLeadPhone()
  phone!: string;

  @ToNormalizedEmail()
  @IsOptional()
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(191)
  email?: string;

  @IsOptional()
  @IsEnum(ListingType)
  listingType?: ListingType;

  @IsOptional()
  @IsEnum(PropertyType)
  propertyType?: PropertyType;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  bhk?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000_000)
  budgetMax?: number;

  @ToTrimmedText()
  @IsOptional()
  @IsString()
  @MaxLength(191)
  preferredLocation?: string;

  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() || undefined : value))
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;

  /** Permission to be contacted about this enquiry (India DPDP Act). */
  @Equals(true, { message: 'Please agree to be contacted about your enquiry' })
  consent!: true;

  @IsOptional()
  @IsIn(ENQUIRY_CHANNELS)
  channel?: EnquiryChannel;

  /** Honeypot: hidden from people, filled in by bots. Any value = silently ignored. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  website?: string;
}

export class UpdateEnquiryFormDto {
  @IsBoolean()
  enabled!: boolean;
}
