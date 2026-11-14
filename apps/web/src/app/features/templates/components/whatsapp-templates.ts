import { Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import {
  PLACEHOLDER_HELP,
  TEMPLATE_CATEGORY_LABELS,
  type MessageTemplateView,
  type SiteVisitView,
  type TemplateValues,
  missingPlaceholders,
  renderTemplate,
} from '@brokerdesk/shared-types';
import { AuthStore } from '../../../core/auth/auth.store';
import { ActivitiesApiService } from '../../../core/services/activities-api.service';
import { BusinessApiService } from '../../../core/services/business-api.service';
import { relativeIstDateTime } from '../../../shared/utils/ist-time';
import { whatsappChatUrl } from '../../../shared/utils/whatsapp';

export interface TemplateLead {
  readonly id: string;
  readonly name: string;
  readonly phone: string;
}

/**
 * Pick a message template for a lead: placeholders are filled from the lead,
 * the signed-in broker, the agency and the lead's next site visit, then the
 * message opens in WhatsApp (official click-to-chat) to be reviewed and sent
 * by the broker. Nothing is sent automatically.
 */
@Component({
  selector: 'bd-whatsapp-templates',
  imports: [RouterLink],
  template: `
    <div class="mb-3 flex items-center justify-between gap-2">
      <h2 id="wa-templates-title" class="text-base font-semibold">WhatsApp messages</h2>
      <a routerLink="/templates" class="bd-link text-sm">{{ auth.canManageTeam() ? 'Manage' : 'View all' }}</a>
    </div>
    @if (templates.isLoading() && !templates.value()) {
      <div class="h-12 animate-pulse rounded-xl bg-slate-100" aria-busy="true"></div>
    } @else if (list().length === 0) {
      <p class="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
        No templates yet.
        @if (auth.canManageTeam()) { <a routerLink="/templates" class="bd-link">Add starter templates</a> } @else { Ask your owner or admin to add some. }
      </p>
    } @else {
      <label class="bd-label" for="wa-template">Template</label>
      <select id="wa-template" class="bd-input" (change)="selectedId.set(valueOf($event))" data-testid="wa-template-select">
        @for (t of list(); track t.id) {
          <option [value]="t.id" [selected]="t.id === selected()?.id">{{ categoryLabels[t.category] }} · {{ t.title }}</option>
        }
      </select>
      @if (selected(); as t) {
        <p class="mt-3 whitespace-pre-line rounded-lg bg-emerald-50 p-3 text-sm text-slate-800" data-testid="wa-preview">{{ text() }}</p>
        @if (missing().length) {
          <p class="mt-2 text-xs text-amber-800">Not filled in: {{ missing().join(', ') }} — add it in WhatsApp before sending.</p>
        }
        <a class="bd-btn mt-3 bg-[#25D366] text-white hover:bg-[#1ebe5b]" [href]="url()" target="_blank" rel="noopener"
           [attr.aria-label]="'Open ' + t.title + ' in WhatsApp for ' + lead().name" data-testid="wa-open">
          Open in WhatsApp
        </a>
        <p class="mt-1 text-xs text-slate-500">Opens WhatsApp with the message ready — you review and send it.</p>
      }
    }
  `,
})
export class WhatsappTemplates {
  readonly lead = input.required<TemplateLead>();

  protected readonly auth = inject(AuthStore);
  private readonly api = inject(BusinessApiService);
  private readonly activities = inject(ActivitiesApiService);
  protected readonly categoryLabels = TEMPLATE_CATEGORY_LABELS;

  protected readonly templates = rxResource({ params: () => this.auth.activeAgencyId(), stream: () => this.api.templates() });
  private readonly visits = rxResource({ params: () => this.lead().id, stream: ({ params: id }) => this.activities.siteVisitsForLead(id) });

  protected readonly list = computed<readonly MessageTemplateView[]>(() => this.templates.value() ?? []);
  protected readonly selectedId = signal<string | null>(null);
  protected readonly selected = computed(() => this.list().find((t) => t.id === this.selectedId()) ?? this.list().at(0) ?? null);

  /** The next open visit (soonest first), for {{property}} / {{location}} / {{visit_time}}. */
  private readonly nextVisit = computed<SiteVisitView | null>(() => {
    const open = (this.visits.value() ?? []).filter((v) => v.status === 'SCHEDULED' || v.status === 'RESCHEDULED');
    return open.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))[0] ?? null;
  });

  private readonly values = computed<TemplateValues>(() => {
    const lead = this.lead();
    const visit = this.nextVisit();
    return {
      name: lead.name.split(' ')[0],
      full_name: lead.name,
      agent: this.auth.user()?.name,
      agency: this.auth.activeMembership()?.agencyName,
      property: visit?.property.title,
      location: visit?.property.location,
      visit_time: visit ? relativeIstDateTime(visit.scheduledAt) : undefined,
    };
  });

  protected readonly text = computed(() => renderTemplate(this.selected()?.message ?? '', this.values()));
  protected readonly missing = computed(() =>
    missingPlaceholders(this.selected()?.message ?? '', this.values()).map((p) => PLACEHOLDER_HELP[p].toLowerCase()),
  );
  protected readonly url = computed(() => whatsappChatUrl(this.lead().phone, this.text()));

  protected valueOf(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }
}
