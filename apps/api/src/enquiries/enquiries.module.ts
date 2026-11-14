import { Module } from '@nestjs/common';
import { EnquiryFormSettingsController, PublicEnquiryController } from './enquiries.controller.js';
import { EnquiriesService } from './enquiries.service.js';

@Module({
  controllers: [PublicEnquiryController, EnquiryFormSettingsController],
  providers: [EnquiriesService],
})
export class EnquiriesModule {}
