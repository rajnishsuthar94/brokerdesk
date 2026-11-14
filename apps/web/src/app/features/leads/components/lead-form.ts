import { Component, computed, effect, inject, input, output, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  type AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  type ValidationErrors,
  Validators,
} from '@angular/forms';
import {
  type AreaUnit,
  type LeadInput,
  type LeadPriority,
  type LeadSource,
  type LeadStatus,
  type LeadView,
  type ListingType,
  type PropertyType,
  type TeamMember,
  parseIndianAmount,
} from '@brokerdesk/shared-types';
import { FieldError } from '../../../shared/components/field-error';
import { leadPhone } from '../../../shared/utils/validators';
import { formatInr, fromIstInputValue } from '../../../shared/utils/format';
import {
  AREA_UNIT_LABELS,
  LISTING_LABELS,
  PRIORITY_LABELS,
  PROPERTY_TYPE_LABELS,
  SOURCE_LABELS,
  STATUS_LABELS,
  options,
} from '../models/lead-labels';

/** "", "85 L", "1.2 Cr", "8500000" are valid; anything else is not. */
function indianAmount(control: AbstractControl): ValidationErrors | null {
  const v = typeof control.value === 'string' ? control.value.trim() : '';
  return v === '' || parseIndianAmount(v) !== null ? null : { amount: true };
}


const amountOrNull = (v: string): number | null => (v.trim() ? parseIndianAmount(v) : null);
const numberOrNull = (v: string): number | null => (v.trim() === '' ? null : Number(v));

/** Presentational lead form used for both create and edit. Emits a LeadInput. */
@Component({
  selector: 'bd-lead-form',
  imports: [ReactiveFormsModule, FieldError],
  templateUrl: './lead-form.html',
})
export class LeadForm {
  /** Existing lead when editing. */
  readonly lead = input<LeadView | null>(null);
  readonly members = input<readonly TeamMember[]>([]);
  /** Owners/admins may choose the assignee; agents' leads are always theirs. */
  readonly canAssign = input(false);
  readonly busy = input(false);
  readonly submitLabel = input('Save lead');
  readonly save = output<LeadInput>();
  readonly cancelled = output<void>();

  protected readonly statusOptions = options(STATUS_LABELS);
  protected readonly priorityOptions = options(PRIORITY_LABELS);
  protected readonly sourceOptions = options(SOURCE_LABELS);
  protected readonly propertyTypeOptions = options(PROPERTY_TYPE_LABELS);
  protected readonly listingOptions = options(LISTING_LABELS);
  protected readonly areaUnitOptions = options(AREA_UNIT_LABELS);
  protected readonly bhkOptions = [1, 2, 3, 4, 5, 6];

  protected readonly form = inject(NonNullableFormBuilder).group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(150)]],
    phone: ['', [Validators.required, leadPhone]],
    email: ['', [Validators.email, Validators.maxLength(191)]],
    listingType: ['SALE' as ListingType],
    propertyType: ['' as PropertyType | ''],
    bhk: [''],
    budgetMin: ['', indianAmount],
    budgetMax: ['', indianAmount],
    preferredLocation: ['', Validators.maxLength(191)],
    areaMin: ['', Validators.min(0)],
    areaMax: ['', Validators.min(0)],
    areaUnit: ['' as AreaUnit | ''],
    status: ['NEW' as LeadStatus],
    priority: ['MEDIUM' as LeadPriority],
    source: ['OTHER' as LeadSource],
    assignedUserId: [''],
    nextFollowUpAt: [''],
    notes: ['', Validators.maxLength(5000)],
  });

  private readonly values = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  /** Live "= ₹85,00,000" hints so brokers can type "85 L". */
  protected readonly budgetMinHint = computed(() => this.amountHint(this.values().budgetMin));
  protected readonly budgetMaxHint = computed(() => this.amountHint(this.values().budgetMax));
  protected readonly budgetRangeError = computed(() => {
    const min = amountOrNull(this.values().budgetMin ?? '');
    const max = amountOrNull(this.values().budgetMax ?? '');
    return min !== null && max !== null && min > max;
  });

  constructor() {
    // Side effect: copy the lead being edited into the (non-signal) reactive form.
    effect(() => {
      const lead = this.lead();
      if (!lead) return;
      untracked(() =>
        this.form.reset({
          name: lead.name,
          phone: lead.phone,
          email: lead.email ?? '',
          listingType: lead.listingType,
          propertyType: lead.propertyType ?? '',
          bhk: lead.bhk?.toString() ?? '',
          budgetMin: lead.budgetMin?.toString() ?? '',
          budgetMax: lead.budgetMax?.toString() ?? '',
          preferredLocation: lead.preferredLocation ?? '',
          areaMin: lead.areaMin?.toString() ?? '',
          areaMax: lead.areaMax?.toString() ?? '',
          areaUnit: lead.areaUnit ?? '',
          status: lead.status,
          priority: lead.priority,
          source: lead.source,
          assignedUserId: lead.assignedUser?.id ?? '',
          notes: lead.notes ?? '',
        }),
      );
    });
  }

  private amountHint(value: string | undefined): string {
    const n = value?.trim() ? parseIndianAmount(value) : null;
    return n === null ? '' : `= ${formatInr(n)}`;
  }

  protected submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.budgetRangeError() || this.busy()) return;
    const v = this.form.getRawValue();
    const input: LeadInput = {
      name: v.name.trim(),
      phone: v.phone.trim(),
      email: v.email.trim() || null,
      listingType: v.listingType,
      propertyType: v.propertyType || null,
      bhk: numberOrNull(v.bhk),
      budgetMin: amountOrNull(v.budgetMin),
      budgetMax: amountOrNull(v.budgetMax),
      preferredLocation: v.preferredLocation.trim() || null,
      areaMin: numberOrNull(v.areaMin),
      areaMax: numberOrNull(v.areaMax),
      areaUnit: v.areaUnit || null,
      status: v.status,
      priority: v.priority,
      source: v.source,
      notes: v.notes.trim() || null,
      ...(this.canAssign() ? { assignedUserId: v.assignedUserId || null } : {}),
      // The API accepts a first follow-up date only when creating a lead.
      ...(this.lead() ? {} : { nextFollowUpAt: fromIstInputValue(v.nextFollowUpAt) }),
    };
    this.save.emit(input);
  }
}
