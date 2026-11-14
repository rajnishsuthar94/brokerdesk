import { Module } from '@nestjs/common';
import { MessageTemplatesController } from './message-templates.controller.js';
import { MessageTemplatesService } from './message-templates.service.js';

@Module({
  controllers: [MessageTemplatesController],
  providers: [MessageTemplatesService],
})
export class MessageTemplatesModule {}
