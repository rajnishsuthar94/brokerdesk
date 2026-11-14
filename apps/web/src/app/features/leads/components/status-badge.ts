import { Component, computed, input } from '@angular/core';
import type { LeadStatus } from '@brokerdesk/shared-types';
import { STATUS_LABELS, STATUS_STYLES } from '../models/lead-labels';

@Component({
  selector: 'bd-status-badge',
  template: `<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap" [class]="style()">{{ label() }}</span>`,
})
export class StatusBadge {
  readonly status = input.required<LeadStatus>();
  protected readonly label = computed(() => STATUS_LABELS[this.status()]);
  protected readonly style = computed(() => STATUS_STYLES[this.status()]);
}
