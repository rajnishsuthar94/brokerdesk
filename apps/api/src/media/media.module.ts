import { Global, Module } from '@nestjs/common';
import { LocalDiskStorageService, StorageService } from '../storage/storage.service.js';
import { ImageProcessorService } from './image-processor.service.js';
import { MediaController } from './media.controller.js';
import { MediaUrlService } from './media-url.service.js';

@Global()
@Module({
  controllers: [MediaController],
  providers: [
    MediaUrlService,
    ImageProcessorService,
    { provide: StorageService, useClass: LocalDiskStorageService },
  ],
  exports: [MediaUrlService, ImageProcessorService, StorageService],
})
export class MediaModule {}
