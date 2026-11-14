import { Controller, Get, NotFoundException, Param, Query, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../common/auth/auth.decorators.js';
import { STORAGE_KEY_PATTERN, StorageService } from '../storage/storage.service.js';
import { MediaUrlService } from './media-url.service.js';

/**
 * Serves private images using signed URLs (see MediaUrlService). Every failure —
 * bad key, bad or expired signature, missing file — is the same 404, so the
 * endpoint cannot be used to probe for files.
 */
@ApiExcludeController()
@Controller('media')
@Public()
export class MediaController {
  constructor(
    private readonly urls: MediaUrlService,
    private readonly storage: StorageService,
  ) {}

  @Get(':a/:b/:file')
  async get(
    @Param('a') a: string,
    @Param('b') b: string,
    @Param('file') file: string,
    @Query('exp') exp: string | undefined,
    @Query('sig') sig: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const key = `${a}/${b}/${file}`;
    const notFound = new NotFoundException('Not found');
    if (!STORAGE_KEY_PATTERN.test(key) || !exp || !sig) throw notFound;
    const remaining = this.urls.verify(key, exp, sig);
    if (remaining === null) throw notFound;
    const object = await this.storage.open(key);
    if (!object) throw notFound;

    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Content-Length', String(object.size));
    res.setHeader('Cache-Control', `private, max-age=${Math.min(remaining, 86_400)}, immutable`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'inline');
    object.stream.pipe(res);
  }
}
