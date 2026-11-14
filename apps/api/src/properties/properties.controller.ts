import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { MAX_IMAGE_UPLOAD_BYTES, type LeadMatch, type Paginated, type PropertyMatch, type PropertyView } from '@brokerdesk/shared-types';
import { Tenant } from '../common/auth/auth.decorators.js';
import type { TenantContext } from '../common/auth/auth.types.js';
import { requestMeta } from '../common/http/request-meta.js';
import { MatchingService } from '../matching/matching.service.js';
import { CreatePropertyDto, ListPropertiesQueryDto, ReorderImagesDto, UpdatePropertyDto } from './dto/property.dto.js';
import { PropertiesService } from './properties.service.js';

const uuid = new ParseUUIDPipe({ version: 'all' });
const MAX_FILES_PER_UPLOAD = 10;

@ApiTags('properties')
@ApiBearerAuth()
@Controller('properties')
export class PropertiesController {
  constructor(
    private readonly properties: PropertiesService,
    private readonly matching: MatchingService,
  ) {}

  @Get()
  list(@Tenant() ctx: TenantContext, @Query() q: ListPropertiesQueryDto): Promise<Paginated<PropertyView>> {
    return this.properties.list(ctx, q);
  }

  @Post()
  create(@Tenant() ctx: TenantContext, @Body() dto: CreatePropertyDto): Promise<PropertyView> {
    return this.properties.create(ctx, dto);
  }

  @Get(':id')
  get(@Tenant() ctx: TenantContext, @Param('id', uuid) id: string): Promise<PropertyView> {
    return this.properties.get(ctx, id);
  }

  @Patch(':id')
  update(@Tenant() ctx: TenantContext, @Param('id', uuid) id: string, @Body() dto: UpdatePropertyDto): Promise<PropertyView> {
    return this.properties.update(ctx, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Tenant() ctx: TenantContext, @Param('id', uuid) id: string, @Req() req: Request): Promise<void> {
    return this.properties.remove(ctx, id, requestMeta(req));
  }

  /** Upload photos (field "files", up to 10 per request, 8 MB each). Re-encoded, metadata stripped. */
  @Post(':id/images')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('files', MAX_FILES_PER_UPLOAD, { limits: { fileSize: MAX_IMAGE_UPLOAD_BYTES } }))
  addImages(
    @Tenant() ctx: TenantContext,
    @Param('id', uuid) id: string,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
  ): Promise<PropertyView> {
    return this.properties.addImages(ctx, id, files ?? []);
  }

  @Delete(':id/images/:imageId')
  removeImage(
    @Tenant() ctx: TenantContext,
    @Param('id', uuid) id: string,
    @Param('imageId', uuid) imageId: string,
  ): Promise<PropertyView> {
    return this.properties.removeImage(ctx, id, imageId);
  }

  @Put(':id/images/order')
  reorderImages(@Tenant() ctx: TenantContext, @Param('id', uuid) id: string, @Body() dto: ReorderImagesDto): Promise<PropertyView> {
    return this.properties.reorderImages(ctx, id, dto.imageIds);
  }

  /** Leads that match this property (only leads the caller may see). */
  @Get(':id/matches')
  matches(@Tenant() ctx: TenantContext, @Param('id', uuid) id: string): Promise<LeadMatch[]> {
    return this.matching.leadsForProperty(ctx, id);
  }
}

/** Properties that match a lead. Separate controller so it sits under /leads. */
@ApiTags('matching')
@ApiBearerAuth()
@Controller('leads')
export class LeadMatchesController {
  constructor(private readonly matching: MatchingService) {}

  @Get(':id/matches')
  matches(@Tenant() ctx: TenantContext, @Param('id', uuid) id: string): Promise<PropertyMatch[]> {
    return this.matching.propertiesForLead(ctx, id);
  }
}
