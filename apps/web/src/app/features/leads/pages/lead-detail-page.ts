import { Component, computed, effect, inject, input, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { canAssignLeads, canDeleteLeads, type LeadStatus } from '@brokerdesk/shared-types';
import { AuthStore } from '../../../core/auth/auth.store';
import { TeamDirectoryStore } from '../../../core/services/team-directory.store';
import { ToastService } from '../../../core/services/toast.service';
import { ConfirmDialogService } from '../../../shared/components/confirm-dialog';
import { IndianPhonePipe, InrPipe, IstDatePipe } from '../../../shared/pipes/format.pipes';
import { errorMessage } from '../../../shared/utils/http-error';
import { LeadFollowUps } from '../../activities/components/lead-follow-ups';
import { WhatsappTemplates } from '../../templates/components/whatsapp-templates';
import { RelatedSiteVisits } from '../../activities/components/related-site-visits';
import { PropertyMatches } from '../../matching/components/property-matches';
import { ActivityTimeline, type NewActivity } from '../components/activity-timeline';
import { ContactActions } from '../components/contact-actions';
import { StatusBadge } from '../components/status-badge';
import {
  AREA_UNIT_LABELS,
  LISTING_LABELS,
  PRIORITY_LABELS,
  PRIORITY_STYLES,
  PROPERTY_TYPE_LABELS,
  SOURCE_LABELS,
  STATUS_LABELS,
  STATUS_ORDER,
} from '../models/lead-labels';
import { LeadDetailStore } from '../store/lead-detail.store';
import { LeadsListStore } from '../store/leads-list.store';

@Component({
  selector: 'bd-lead-detail-page',
  imports: [RouterLink, StatusBadge, ContactActions, ActivityTimeline, PropertyMatches, LeadFollowUps, RelatedSiteVisits, WhatsappTemplates, InrPipe, IstDatePipe, IndianPhonePipe],
  providers: [LeadDetailStore],
  templateUrl: './lead-detail-page.html',
})
export class LeadDetailPage {
  /** Route parameter (withComponentInputBinding). */
  readonly id = input.required<string>();

  protected readonly store = inject(LeadDetailStore);
  protected readonly team = inject(TeamDirectoryStore);
  private readonly listStore = inject(LeadsListStore);
  private readonly auth = inject(AuthStore);
  private readonly toasts = inject(ToastService);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly router = inject(Router);
  private readonly timeline = viewChild(ActivityTimeline);

  protected readonly statuses = STATUS_ORDER;
  protected readonly statusLabels = STATUS_LABELS;
  protected readonly priorityLabels = PRIORITY_LABELS;
  protected readonly priorityStyles = PRIORITY_STYLES;
  protected readonly sourceLabels = SOURCE_LABELS;
  protected readonly listingLabels = LISTING_LABELS;
  protected readonly typeLabels = PROPERTY_TYPE_LABELS;
  protected readonly areaUnitLabels = AREA_UNIT_LABELS;

  protected readonly canAssign = computed(() => {
    const role = this.auth.role();
    return role !== null && canAssignLeads(role);
  });
  protected readonly canDelete = computed(() => {
    const role = this.auth.role();
    return role !== null && canDeleteLeads(role);
  });
  protected readonly isOverdue = computed(() => {
    const l = this.store.lead();
    return !!l?.nextFollowUpAt && new Date(l.nextFollowUpAt).getTime() < Date.now() && l.status !== 'WON' && l.status !== 'LOST';
  });

  constructor() {
    // Side effect: (re)load when the route parameter changes.
    effect(() => this.store.load(this.id()));
  }

  protected async onStatusChange(event: Event): Promise<void> {
    const select = event.target as HTMLSelectElement;
    const status = select.value as LeadStatus;
    const before = this.store.lead()?.status;
    if (!before || status === before) return;
    try {
      await this.store.changeStatus(status);
      this.listStore.reload();
      this.toasts.success(`Status changed to ${STATUS_LABELS[status]}`);
    } catch (e: unknown) {
      select.value = before;
      this.toasts.error(errorMessage(e));
    }
  }

  protected async onAssign(event: Event): Promise<void> {
    const select = event.target as HTMLSelectElement;
    const before = this.store.lead()?.assignedUser?.id ?? '';
    try {
      await this.store.assign(select.value || null);
      this.listStore.reload();
      this.toasts.success(select.value ? 'Lead assigned' : 'Lead unassigned');
    } catch (e: unknown) {
      select.value = before;
      this.toasts.error(errorMessage(e));
    }
  }

  protected async onAddActivity(activity: NewActivity): Promise<void> {
    try {
      await this.store.addActivity(activity.type, activity.description);
      this.timeline()?.reset();
      this.toasts.success('Added to history');
    } catch (e: unknown) {
      this.toasts.error(errorMessage(e));
    }
  }

  protected async onDelete(): Promise<void> {
    const lead = this.store.lead();
    if (!lead) return;
    const ok = await this.confirm.ask({
      title: `Delete ${lead.name}?`,
      message: 'The lead will be removed from your lists. Its history is kept for your records.',
      confirmText: 'Delete lead',
      danger: true,
    });
    if (!ok) return;
    try {
      await this.store.remove();
      this.listStore.reload();
      this.toasts.success(`${lead.name} was deleted`);
      await this.router.navigateByUrl('/leads');
    } catch (e: unknown) {
      this.toasts.error(errorMessage(e));
    }
  }
}
