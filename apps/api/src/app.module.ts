import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AgenciesModule } from './agencies/agencies.module.js';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter.js';
import { AppConfigService } from './config/app-config.service.js';
import { AppConfigModule } from './config/config.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { MessageTemplatesModule } from './message-templates/message-templates.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { EnquiriesModule } from './enquiries/enquiries.module.js';
import { FollowUpsModule } from './follow-ups/follow-ups.module.js';
import { HealthModule } from './health/health.module.js';
import { LeadsModule } from './leads/leads.module.js';
import { MailModule } from './mail/mail.module.js';
import { MediaModule } from './media/media.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { PropertiesModule } from './properties/properties.module.js';
import { SiteVisitsModule } from './site-visits/site-visits.module.js';
import { SubscriptionsModule } from './subscriptions/subscriptions.module.js';
import { UsersModule } from './users/users.module.js';

/**
 * Root module. Feature modules are added phase by phase; see docs/architecture.md.
 *
 * Security defaults (applied globally by AuthModule):
 * every route requires authentication AND a verified agency membership unless it
 * is explicitly marked @Public() or @AllowNoAgency().
 */
@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    AuditModule,
    MailModule,
    MediaModule,
    SubscriptionsModule,
    // In-memory rate-limit store: fine for a single API instance. Use a shared
    // store (e.g. Redis) before running multiple instances.
    ThrottlerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        throttlers: [
          {
            name: 'auth',
            ttl: config.get('AUTH_THROTTLE_TTL_SECONDS') * 1000,
            limit: config.get('AUTH_THROTTLE_LIMIT'),
          },
          {
            name: 'publicEnquiry',
            ttl: config.get('PUBLIC_ENQUIRY_THROTTLE_TTL_SECONDS') * 1000,
            limit: config.get('PUBLIC_ENQUIRY_THROTTLE_LIMIT'),
          },
        ],
      }),
    }),
    HealthModule,
    AuthModule,
    UsersModule,
    AgenciesModule,
    LeadsModule,
    EnquiriesModule,
    PropertiesModule,
    FollowUpsModule,
    SiteVisitsModule,
    DashboardModule,
    ReportsModule,
    MessageTemplatesModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: PrismaExceptionFilter }],
})
export class AppModule {}
