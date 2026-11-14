import { Module } from '@nestjs/common';
import { AgenciesModule } from '../agencies/agencies.module.js';
import { RelatedSiteVisitsController, SiteVisitsController } from './site-visits.controller.js';
import { SiteVisitsService } from './site-visits.service.js';

@Module({
  imports: [AgenciesModule],
  controllers: [SiteVisitsController, RelatedSiteVisitsController],
  providers: [SiteVisitsService],
})
export class SiteVisitsModule {}
