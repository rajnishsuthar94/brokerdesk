import { REPORT_EXPORT_SECTIONS, type ReportExportSection } from '@brokerdesk/shared-types';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/** IST calendar dates "YYYY-MM-DD", both inclusive. Validated in depth by resolveReportRange. */
export class ReportQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(10)
  from?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  to?: string;
}

export class ReportExportQueryDto extends ReportQueryDto {
  @IsOptional()
  @IsIn(REPORT_EXPORT_SECTIONS)
  section?: ReportExportSection;
}
