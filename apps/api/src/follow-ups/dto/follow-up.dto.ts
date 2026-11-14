import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';
import { FOLLOW_UP_VIEWS, type FollowUpListView } from '@brokerdesk/shared-types';
import { ToTrimmedText } from '../../common/validation/validators.js';

const BlankToNull = (): PropertyDecorator => Transform(({ value }: { value: unknown }) => (value === '' ? null : value));

export class CreateFollowUpDto {
  @IsUUID('all')
  leadId!: string;

  @IsISO8601({ strict: true }, { message: 'Choose a valid date and time' })
  dueAt!: string;

  @ToTrimmedText()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @BlankToNull()
  @IsOptional()
  @IsUUID('all', { message: 'Choose a valid team member' })
  assignedUserId?: string | null;
}

export class UpdateFollowUpDto {
  /** A new date reschedules the follow-up. */
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'Choose a valid date and time' })
  dueAt?: string;

  @ToTrimmedText(null)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  @BlankToNull()
  @IsOptional()
  @IsUUID('all', { message: 'Choose a valid team member' })
  assignedUserId?: string | null;
}

export class CompleteFollowUpDto {
  @ToTrimmedText()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  outcome?: string;

  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'Choose a valid date and time for the next follow-up' })
  nextDueAt?: string;
}

export class CancelDto {
  @ToTrimmedText()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class ListFollowUpsQueryDto {
  @IsOptional()
  @IsIn(FOLLOW_UP_VIEWS)
  view?: FollowUpListView;

  @IsOptional()
  @Matches(/^(me|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i)
  assignedTo?: string;

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
