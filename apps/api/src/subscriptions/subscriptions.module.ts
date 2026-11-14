import { Global, Module } from '@nestjs/common';
import { PlanCatalogService } from './plan-catalog.service.js';
import { SubscriptionLimitsService } from './subscription-limits.service.js';
import { SubscriptionsController } from './subscriptions.controller.js';
import { SubscriptionsService } from './subscriptions.service.js';

@Global()
@Module({
  controllers: [SubscriptionsController],
  providers: [PlanCatalogService, SubscriptionLimitsService, SubscriptionsService],
  exports: [PlanCatalogService, SubscriptionLimitsService, SubscriptionsService],
})
export class SubscriptionsModule {}
