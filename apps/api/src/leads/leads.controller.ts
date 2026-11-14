import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { LeadActivityView, LeadImportResult, LeadView, Paginated } from '@brokerdesk/shared-types';
import { Roles, Tenant } from '../common/auth/auth.decorators.js';
import type { TenantContext } from '../common/auth/auth.types.js';
import { requestMeta } from '../common/http/request-meta.js';
import { MemberRole } from '../generated/prisma/enums.js';
import {
  AssignLeadDto,
  ChangeLeadStatusDto,
  CreateLeadActivityDto,
  CreateLeadDto,
  ImportLeadsQueryDto,
  LeadFiltersDto,
  ListLeadsQueryDto,
  UpdateLeadDto,
} from './dto/lead.dto.js';
import { LeadFileService } from './lead-file.service.js';
import { LeadsService } from './leads.service.js';

const MAX_IMPORT_BYTES = 1024 * 1024; // 1 MB ≈ 2000 rows comfortably
const uuid = new ParseUUIDPipe({ version: 'all' });

/**
 * Leads of the current agency. Visibility is enforced in the service:
 * owners/admins see all leads, agents only leads assigned to them.
 */
@ApiTags('leads')
@ApiBearerAuth()
@Controller('leads')
export class LeadsController {
  constructor(
    private readonly leads: LeadsService,
    private readonly files: LeadFileService,
  ) {}

  @Get()
  list(@Tenant() ctx: TenantContext, @Query() query: ListLeadsQueryDto): Promise<Paginated<LeadView>> {
    return this.leads.list(ctx, query);
  }

  /** CSV of the leads matching the filters (owners/admins). Must be declared before :id. */
  @Get('export')
  @Roles(MemberRole.OWNER, MemberRole.ADMIN)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  async export(
    @Tenant() ctx: TenantContext,
    @Query() filters: LeadFiltersDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const { csv } = await this.files.export(ctx, filters, requestMeta(req));
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    res.setHeader('Content-Disposition', `attachment; filename="brokerdesk-leads-${date}.csv"`);
    return csv;
  }

  /**
   * Import from CSV or Excel .xlsx (owners/admins). `mode=preview` validates and
   * reports duplicates without saving; `mode=commit` creates the leads in one
   * transaction. The real file type is detected from its content, not its name.
   */
  @Post('import')
  @Roles(MemberRole.OWNER, MemberRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMPORT_BYTES, files: 1 } }))
  import(
    @Tenant() ctx: TenantContext,
    @Query() query: ImportLeadsQueryDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: Request,
  ): Promise<LeadImportResult> {
    if (!file) throw new BadRequestException('Attach a CSV or Excel file in the "file" field.');
    if (/\.xls$/i.test(file.originalname)) {
      throw new BadRequestException(
        'Old Excel files (.xls) are not supported. In Excel use File → Save As → Excel Workbook (.xlsx) or CSV.',
      );
    }
    if (!/\.(csv|xlsx)$/i.test(file.originalname)) {
      throw new BadRequestException('Only .csv and .xlsx files can be imported.');
    }
    return this.files.import(ctx, file.buffer, query.mode, query.duplicates ?? 'skip', requestMeta(req));
  }

  @Post()
  create(@Tenant() ctx: TenantContext, @Body() dto: CreateLeadDto): Promise<LeadView> {
    return this.leads.create(ctx, dto);
  }

  @Get(':id')
  get(@Tenant() ctx: TenantContext, @Param('id', uuid) id: string): Promise<LeadView> {
    return this.leads.get(ctx, id);
  }

  @Patch(':id')
  update(@Tenant() ctx: TenantContext, @Param('id', uuid) id: string, @Body() dto: UpdateLeadDto): Promise<LeadView> {
    return this.leads.update(ctx, id, dto);
  }

  @Patch(':id/status')
  changeStatus(@Tenant() ctx: TenantContext, @Param('id', uuid) id: string, @Body() dto: ChangeLeadStatusDto): Promise<LeadView> {
    return this.leads.changeStatus(ctx, id, dto);
  }

  @Patch(':id/assignee')
  assign(
    @Tenant() ctx: TenantContext,
    @Param('id', uuid) id: string,
    @Body() dto: AssignLeadDto,
    @Req() req: Request,
  ): Promise<LeadView> {
    return this.leads.assign(ctx, id, dto.assignedUserId ?? null, requestMeta(req));
  }

  /** Soft delete (owners/admins). */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Tenant() ctx: TenantContext, @Param('id', uuid) id: string, @Req() req: Request): Promise<void> {
    return this.leads.remove(ctx, id, requestMeta(req));
  }

  @Get(':id/activities')
  activities(@Tenant() ctx: TenantContext, @Param('id', uuid) id: string): Promise<LeadActivityView[]> {
    return this.leads.listActivities(ctx, id);
  }

  @Post(':id/activities')
  addActivity(
    @Tenant() ctx: TenantContext,
    @Param('id', uuid) id: string,
    @Body() dto: CreateLeadActivityDto,
  ): Promise<LeadActivityView> {
    return this.leads.addActivity(ctx, id, dto);
  }
}
