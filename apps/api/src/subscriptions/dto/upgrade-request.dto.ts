import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ToTrimmedText } from '../../common/validation/validators.js';
import { SubscriptionPlan } from '../../generated/prisma/enums.js';

export class UpgradeRequestDto {
  @IsEnum(SubscriptionPlan, { message: 'Choose a plan' })
  plan!: SubscriptionPlan;

  @ToTrimmedText()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
