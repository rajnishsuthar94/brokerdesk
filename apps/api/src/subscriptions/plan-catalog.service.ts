import { Injectable } from '@nestjs/common';
import type { PlanInfo } from '@brokerdesk/shared-types';
import { AppConfigService } from '../config/app-config.service.js';
import type { SubscriptionPlan } from '../generated/prisma/enums.js';
import { PLAN_ORDER, type PlanCatalog, type PlanDefinition, buildCatalog } from './plan-catalog.js';

/** The plan catalogue in force: defaults + validated PLAN_CATALOG_JSON overrides. */
@Injectable()
export class PlanCatalogService {
  readonly catalog: PlanCatalog;

  constructor(config: AppConfigService) {
    this.catalog = buildCatalog(config.get('PLAN_OVERRIDES'));
  }

  get(plan: SubscriptionPlan): PlanDefinition {
    return this.catalog[plan];
  }

  /** Cheapest first. */
  list(): PlanInfo[] {
    return PLAN_ORDER.map((p) => ({ ...this.catalog[p] }));
  }
}
