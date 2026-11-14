import { Injectable, Logger } from '@nestjs/common';
import type { RequestMeta } from '../common/http/request-meta.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Catalogue of audited actions. Keep names stable – they are queried later. */
export const AuditAction = {
  AUTH_REGISTER: 'auth.register',
  AUTH_LOGIN: 'auth.login',
  AUTH_LOGIN_FAILED: 'auth.login_failed',
  AUTH_LOGOUT: 'auth.logout',
  AUTH_REFRESH_REUSE_DETECTED: 'auth.refresh_reuse_detected',
  AUTH_PASSWORD_RESET_REQUESTED: 'auth.password_reset_requested',
  AUTH_PASSWORD_RESET: 'auth.password_reset',
  AUTH_PASSWORD_CHANGED: 'auth.password_changed',
  AUTH_AGENCY_SWITCHED: 'auth.agency_switched',
  AGENCY_CREATED: 'agency.created',
  AGENCY_UPDATED: 'agency.updated',
  INVITATION_CREATED: 'invitation.created',
  INVITATION_REVOKED: 'invitation.revoked',
  INVITATION_ACCEPTED: 'invitation.accepted',
  MEMBER_ROLE_CHANGED: 'member.role_changed',
  MEMBER_REMOVED: 'member.removed',
  MEMBER_LEFT: 'member.left',
  LEAD_ASSIGNED: 'lead.assigned',
  LEAD_DELETED: 'lead.deleted',
  LEADS_IMPORTED: 'leads.imported',
  LEADS_EXPORTED: 'leads.exported',
  PROPERTY_DELETED: 'property.deleted',
  ENQUIRY_FORM_UPDATED: 'enquiry_form.updated',
  ENQUIRY_LINK_RESET: 'enquiry_form.link_reset',
  ENQUIRY_REJECTED_LIMIT: 'enquiry_form.rejected_lead_limit',
  SUBSCRIPTION_UPGRADE_REQUESTED: 'subscription.upgrade_requested',
  SUBSCRIPTION_CHANGED: 'subscription.changed',
  MESSAGE_TEMPLATE_CHANGED: 'message_template.changed',
  REPORT_EXPORTED: 'report.exported',
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

export interface AuditEntry {
  readonly action: AuditAction;
  readonly agencyId?: string | null;
  readonly actorUserId?: string | null;
  readonly entityType?: string;
  readonly entityId?: string;
  readonly metadata?: Prisma.InputJsonObject;
  readonly meta?: RequestMeta;
}

type AuditWriter = Pick<Prisma.TransactionClient, 'auditLog'>;

/**
 * Append-only audit trail. Pass the transaction client (`tx`) when the audited
 * change happens inside a transaction so both commit or roll back together.
 * Never put secrets (passwords, tokens) in metadata.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry, tx?: AuditWriter): Promise<void> {
    const client = tx ?? this.prisma;
    await client.auditLog.create({
      data: {
        action: entry.action,
        agencyId: entry.agencyId ?? null,
        actorUserId: entry.actorUserId ?? null,
        entityType: entry.entityType ?? null,
        entityId: entry.entityId ?? null,
        metadata: entry.metadata ?? Prisma.DbNull,
        ipAddress: entry.meta?.ipAddress ?? null,
        userAgent: entry.meta?.userAgent ?? null,
      },
    });
  }

  /**
   * For events outside a transaction where failing to audit must not fail the
   * user's request (e.g. a failed login attempt). Errors are logged instead.
   */
  async recordSafely(entry: AuditEntry): Promise<void> {
    try {
      await this.record(entry);
    } catch (error: unknown) {
      this.logger.error(`Failed to write audit entry ${entry.action}`, error instanceof Error ? error.stack : undefined);
    }
  }
}
