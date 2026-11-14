import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { SITE_VISIT_VIEWS, type SiteVisitListView } from '@brokerdesk/shared-types';
import { ToTrimmedText } from '../../common/validation/validators.js';

const BlankToNull = (): PropertyDecorator => Transform(({ value }: { value: unknown }) => (value === '' ? null : value));

export class CreateSiteVisitDto {
  @IsUUID('all', { message: 'Choose a buyer' })
  leadId!: string;

  @IsUUID('all', { message: 'Choose a property' })
  propertyId!: string;

  @IsISO8601({ strict: true }, { message: 'Choose a valid date and time' })
  scheduledAt!: string;

  /** Saved in the lead's history (e.g. "meet at the society gate"). */
  @ToTrimmedText()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @BlankToNull()
  @IsOptional()
  @IsUUID('all', { message: 'Choose a valid team member' })
  assignedUserId?: string | null;
}

export class UpdateSiteVisitDto {
  /** A new time reschedules the visit (status RESCHEDULED). */
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'Choose a valid date and time' })
  scheduledAt?: string;

  @BlankToNull()
  @IsOptional()
  @IsUUID('all', { message: 'Choose a valid team member' })
  assignedUserId?: string | null;
}

export class CompleteSiteVisitDto {
  /** The buyer's reaction. */
  @ToTrimmedText()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  feedback?: string;
}

export class ListSiteVisitsQueryDto {
  @IsOptional()
  @IsIn(SITE_VISIT_VIEWS)
  view?: SiteVisitListView;

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
