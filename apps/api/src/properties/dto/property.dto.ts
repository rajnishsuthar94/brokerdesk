import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MAX_PROPERTY_IMAGES, PROPERTY_SORT_FIELDS, type PropertySortField } from '@brokerdesk/shared-types';
import { normalizeIndianMobile } from '../../common/utils/normalize.js';
import { ToTrimmedText } from '../../common/validation/validators.js';
import { AreaUnit, AvailabilityStatus, Furnishing, ListingType, PropertyType } from '../../generated/prisma/enums.js';

const MAX_PRICE = 1_000_000_000_000;
/** Owner phone may be a mobile (normalised to +91…) or a landline such as 079-2650 1234. */
const PHONE_PATTERN = /^\+?[\d\s\-()]{7,20}$/;

/**
 * Only unambiguous mobile formats (10 digits, or 91/+91 + 10 digits) are
 * normalised to E.164. A 0-prefixed 11-digit number is often a landline with an
 * STD code (Ahmedabad 079-2650 1234), so it is kept exactly as typed.
 */
const ToOwnerPhone = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    if (trimmed === '') return null;
    const digits = trimmed.replace(/\D/g, '');
    const unambiguous = digits.length === 10 || (digits.length === 12 && digits.startsWith('91'));
    return unambiguous ? (normalizeIndianMobile(trimmed) ?? trimmed) : trimmed;
  });

const BlankToNull = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) => (value === '' ? null : value));

/**
 * Optional property fields. title / propertyType / listingType / location / price
 * are declared only in the subclasses (class-validator merges inherited
 * decorators, so an inherited @IsOptional would make them optional on create).
 */
export class PropertyDetailsDto {
  @ToTrimmedText(null)
  @IsOptional()
  @IsString()
  @MaxLength(191)
  projectName?: string | null;

  @ToTrimmedText()
  @IsOptional()
  @IsString()
  @Length(2, 100)
  city?: string;

  @BlankToNull()
  @IsOptional()
  @IsInt({ message: 'BHK must be a whole number' })
  @Min(1)
  @Max(20)
  bhk?: number | null;

  @BlankToNull()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Area must be a number' })
  @Min(1)
  @Max(10_000_000)
  area?: number | null;

  @IsOptional()
  @IsEnum(AreaUnit)
  areaUnit?: AreaUnit;

  @BlankToNull()
  @IsOptional()
  @IsEnum(Furnishing)
  furnishing?: Furnishing | null;

  @ToTrimmedText(null)
  @IsOptional()
  @IsString()
  @MaxLength(30)
  floor?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50)
  parking?: number;

  @ToTrimmedText(null)
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  @ToTrimmedText(null)
  @IsOptional()
  @IsString()
  @MaxLength(150)
  ownerName?: string | null;

  @ToOwnerPhone()
  @IsOptional()
  @Matches(PHONE_PATTERN, { message: 'Enter a valid owner phone number' })
  ownerPhone?: string | null;

  @IsOptional()
  @IsEnum(AvailabilityStatus)
  availabilityStatus?: AvailabilityStatus;

  @BlankToNull()
  @IsOptional()
  @IsUUID('all', { message: 'Choose a valid team member' })
  assignedUserId?: string | null;
}

export class CreatePropertyDto extends PropertyDetailsDto {
  @ToTrimmedText()
  @IsString({ message: 'Title is required' })
  @Length(3, 200, { message: 'Title must be 3–200 characters' })
  title!: string;

  @IsEnum(PropertyType, { message: 'Choose a property type' })
  propertyType!: PropertyType;

  @IsEnum(ListingType, { message: 'Choose Sale or Rent' })
  listingType!: ListingType;

  @ToTrimmedText()
  @IsString({ message: 'Location is required' })
  @Length(2, 191)
  location!: string;

  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Price is required' })
  @Min(1, { message: 'Price must be more than zero' })
  @Max(MAX_PRICE)
  price!: number;
}

export class UpdatePropertyDto extends PropertyDetailsDto {
  @ToTrimmedText()
  @IsOptional()
  @IsString()
  @Length(3, 200, { message: 'Title must be 3–200 characters' })
  title?: string;

  @IsOptional()
  @IsEnum(PropertyType)
  propertyType?: PropertyType;

  @IsOptional()
  @IsEnum(ListingType)
  listingType?: ListingType;

  @ToTrimmedText()
  @IsOptional()
  @IsString()
  @Length(2, 191)
  location?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(MAX_PRICE)
  price?: number;
}

const ToArray = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) => {
    if (value === undefined || value === '') return undefined;
    const list: unknown[] = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [value];
    return list.map((v) => (typeof v === 'string' ? v.trim() : v)).filter((v) => v !== '');
  });

export class ListPropertiesQueryDto {
  @ToTrimmedText()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsEnum(ListingType)
  listingType?: ListingType;

  @ToArray()
  @IsOptional()
  @ArrayMaxSize(10)
  @IsEnum(PropertyType, { each: true })
  propertyType?: PropertyType[];

  @ToArray()
  @IsOptional()
  @ArrayMaxSize(10)
  @IsEnum(AvailabilityStatus, { each: true })
  availabilityStatus?: AvailabilityStatus[];

  @ToArray()
  @IsOptional()
  @ArrayMaxSize(10)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(20, { each: true })
  bhk?: number[];

  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @IsOptional()
  @Matches(/^(me|unassigned|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i)
  assignedTo?: string;

  @IsOptional()
  @IsIn(PROPERTY_SORT_FIELDS)
  sort?: PropertySortField;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';

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

export class ReorderImagesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_PROPERTY_IMAGES)
  @IsUUID('all', { each: true })
  imageIds!: string[];
}
