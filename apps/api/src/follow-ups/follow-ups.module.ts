import { Module } from '@nestjs/common';
import { AgenciesModule } from '../agencies/agencies.module.js';
import { FollowUpsController, LeadFollowUpsController } from './follow-ups.controller.js';
import { FollowUpsService } from './follow-ups.service.js';

@Module({
  imports: [AgenciesModule],
  controllers: [FollowUpsController, LeadFollowUpsController],
  providers: [FollowUpsService],
})
export class FollowUpsModule {}
