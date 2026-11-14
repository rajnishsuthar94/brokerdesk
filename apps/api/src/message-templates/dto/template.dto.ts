import { MAX_TEMPLATE_LENGTH, TEMPLATE_CATEGORIES, type TemplateCategory } from '@brokerdesk/shared-types';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import { ToTrimmedText } from '../../common/validation/validators.js';

export class CreateTemplateDto {
  @ToTrimmedText()
  @IsString({ message: 'Title is required' })
  @Length(2, 150, { message: 'Title must be 2–150 characters' })
  title!: string;

  @ToTrimmedText()
  @IsString({ message: 'Message is required' })
  @Length(2, MAX_TEMPLATE_LENGTH, { message: `Message must be 2–${MAX_TEMPLATE_LENGTH} characters` })
  message!: string;

  @IsIn(TEMPLATE_CATEGORIES, { message: 'Choose a category' })
  category!: TemplateCategory;
}

export class UpdateTemplateDto {
  @ToTrimmedText()
  @IsOptional()
  @IsString()
  @Length(2, 150, { message: 'Title must be 2–150 characters' })
  title?: string;

  @ToTrimmedText()
  @IsOptional()
  @IsString()
  @Length(2, MAX_TEMPLATE_LENGTH, { message: `Message must be 2–${MAX_TEMPLATE_LENGTH} characters` })
  message?: string;

  @IsOptional()
  @IsIn(TEMPLATE_CATEGORIES, { message: 'Choose a category' })
  category?: TemplateCategory;
}
