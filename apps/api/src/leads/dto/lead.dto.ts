import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  registerDecorator,
  type ValidationOptions,
} from 'class-validator';
import {
  FOLLOW_UP_FILTERS,
  LEAD_ACTIVITY_TYPES_USER,
  LEAD_SORT_FIELDS,
  type FollowUpFilter,
  type LeadSortField,
  type UserLeadActivityType,
} from '@brokerdesk/shared-types';
import { normalizeLeadPhone } from '../../common/utils/normalize.js';
import { ToNormalizedEmail, ToTrimmedText } from '../../common/validation/validators.js';
import {
  AreaUnit,
  LeadPriority,
  LeadSource,
  LeadStatus,
  ListingType,
  PropertyType,
} from '../../generated/prisma/enums.js';

const MAX_AMOUNT = 1_000_000_000_000; // ₹1 lakh crore
const MAX_AREA = 10_000_000;

/** Normalises to E.164; invalid input is left for the validator to reject. */
export const ToLeadPhone = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? (value.trim() === '' ? undefined : (normalizeLeadPhone(value) ?? value)) : value,
  );

export function IsLeadPhone(options?: ValidationOptions): PropertyDecorator {
  return (target: object, propertyName: string | symbol) => {
    registerDecorator({
      name: 'isLeadPhone',
      target: target.constructor,
      propertyName: String(propertyName),
      options: {
        message: 'Enter a valid 10-digit Indian mobile number, or an international number starting with +',
        ...options,
      },
      validator: { validate: (v: unknown) => typeof v === 'string' && /^\+\d{8,15}$/.test(v) },
    });
  };
}

/** Accepts "" from forms as "clear this field". */
const BlankToNull = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) => (value === '' ? null : value));

/**
 * Editable lead fields other than name/phone. `undefined` = not provided
 * (unchanged on update); `null` = clear the field.
 *
 * name/phone are declared ONLY in the subclasses: class-validator merges
 * decorators from parent classes, so an inherited @IsOptional() would make them
 * optional on create too.
 */
export class LeadDetailsDto {
  @ToNormalizedEmail(null)
  @IsOptional()
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(191)
  email?: string | null;

  @IsOptional()
  @IsEnum(LeadSource, { message: 'Choose a valid lead source' })
  source?: LeadSource;

  @BlankToNull()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Minimum budget must be a number' })
  @Min(0)
  @Max(MAX_AMOUNT)
  budgetMin?: number | null;

  @BlankToNull()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Maximum budget must be a number' })
  @Min(0)
  @Max(MAX_AMOUNT)
  budgetMax?: number | null;

  @ToTrimmedText(null)
  @IsOptional()
  @IsString()
  @MaxLength(191)
  preferredLocation?: string | null;

  @BlankToNull()
  @IsOptional()
  @IsInt({ message: 'BHK must be a whole number' })
  @Min(1)
  @Max(20)
  bhk?: number | null;

  @BlankToNull()
  @IsOptional()
  @IsEnum(PropertyType, { message: 'Choose a valid property type' })
  propertyType?: PropertyType | null;

  @IsOptional()
  @IsEnum(ListingType, { message: 'Choose Sale or Rent' })
  listingType?: ListingType;

  @BlankToNull()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_AREA)
  areaMin?: number | null;

  @BlankToNull()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_AREA)
  areaMax?: number | null;

  @BlankToNull()
  @IsOptional()
  @IsEnum(AreaUnit)
  areaUnit?: AreaUnit | null;

  @IsOptional()
  @IsEnum(LeadStatus, { message: 'Choose a valid status' })
  status?: LeadStatus;

  @IsOptional()
  @IsEnum(LeadPriority, { message: 'Choose a valid priority' })
  priority?: LeadPriority;

  @ToTrimmedText(null)
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string | null;

  @BlankToNull()
  @IsOptional()
  @IsUUID('all', { message: 'Choose a valid team member' })
  assignedUserId?: string | null;

  /** Create/save even if another lead already has this phone number. */
  @IsOptional()
  @IsBoolean()
  allowDuplicate?: boolean;
}

export class CreateLeadDto extends LeadDetailsDto {
  @ToTrimmedText()
  @IsString({ message: 'Name is required' })
  @Length(2, 150, { message: 'Name must be 2–150 characters' })
  name!: string;

  @ToLeadPhone()
  @IsString({ message: 'Phone number is required' })
  @IsLeadPhone()
  phone!: string;

  /**
   * Optional first follow-up. Creates a real follow-up record; afterwards the
   * lead's next follow-up is managed through /follow-ups (it is derived from them).
   */
  @BlankToNull()
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'Next follow-up must be a valid date' })
  nextFollowUpAt?: string | null;
}

export class UpdateLeadDto extends LeadDetailsDto {
  @ToTrimmedText()
  @IsOptional()
  @IsString()
  @Length(2, 150, { message: 'Name must be 2–150 characters' })
  name?: string;

  @ToLeadPhone()
  @IsOptional()
  @IsLeadPhone()
  phone?: string;
}

/** Either DTO: everything the service maps onto the model. */
export type LeadFieldsDto = CreateLeadDto | UpdateLeadDto;

export class ChangeLeadStatusDto {
  @IsEnum(LeadStatus, { message: 'Choose a valid status' })
  status!: LeadStatus;

  /** Optional note saved with the status change. */
  @ToTrimmedText()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class AssignLeadDto {
  /** A member of the agency, or null to unassign. */
  @IsOptional()
  @IsUUID('all', { message: 'Choose a valid team member' })
  assignedUserId!: string | null;
}

export class CreateLeadActivityDto {
  @IsIn(LEAD_ACTIVITY_TYPES_USER, { message: 'Choose a valid activity type' })
  activityType!: UserLeadActivityType;

  @ToTrimmedText()
  @IsString()
  @Length(1, 2000, { message: 'Description must be 1–2000 characters' })
  description!: string;
}

/** Query strings arrive as strings; repeated params (?status=NEW&status=WON) as arrays. */
const ToArray = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) => {
    if (value === undefined || value === '') return undefined;
    const list: unknown[] = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [value];
    // Non-strings are kept as-is so the enum validator rejects them.
    return list.map((v) => (typeof v === 'string' ? v.trim() : v)).filter((v) => v !== '');
  });

export class LeadFiltersDto {
  @ToTrimmedText()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ToArray()
  @IsOptional()
  @ArrayMaxSize(10)
  @IsEnum(LeadStatus, { each: true })
  status?: LeadStatus[];

  @ToArray()
  @IsOptional()
  @ArrayMaxSize(10)
  @IsEnum(LeadPriority, { each: true })
  priority?: LeadPriority[];

  @ToArray()
  @IsOptional()
  @ArrayMaxSize(10)
  @IsEnum(LeadSource, { each: true })
  source?: LeadSource[];

  @IsOptional()
  @IsEnum(ListingType)
  listingType?: ListingType;

  @IsOptional()
  @IsEnum(PropertyType)
  propertyType?: PropertyType;

  /** A member's user id, "me" or "unassigned". */
  @IsOptional()
  @Matches(/^(me|unassigned|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i, {
    message: 'assignedTo must be "me", "unassigned" or a team member id',
  })
  assignedTo?: string;

  @IsOptional()
  @IsIn(FOLLOW_UP_FILTERS)
  followUp?: FollowUpFilter;

  @IsOptional()
  @IsIn(LEAD_SORT_FIELDS)
  sort?: LeadSortField;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';
}

export class ListLeadsQueryDto extends LeadFiltersDto {
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000)
  page?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class ImportLeadsQueryDto {
  @IsIn(['preview', 'commit'])
  mode!: 'preview' | 'commit';

  @IsOptional()
  @IsIn(['skip', 'create'])
  duplicates?: 'skip' | 'create';
}
