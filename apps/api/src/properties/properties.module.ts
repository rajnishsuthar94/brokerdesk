import { Module } from '@nestjs/common';
import { AgenciesModule } from '../agencies/agencies.module.js';
import { MatchingService } from '../matching/matching.service.js';
import { LeadMatchesController, PropertiesController } from './properties.controller.js';
import { PropertiesService } from './properties.service.js';

@Module({
  imports: [AgenciesModule],
  controllers: [PropertiesController, LeadMatchesController],
  providers: [PropertiesService, MatchingService],
})
export class PropertiesModule {}
