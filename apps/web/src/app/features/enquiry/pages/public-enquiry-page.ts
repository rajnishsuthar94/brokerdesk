import { Component, computed, inject, input, signal } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { type AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, type ValidationErrors, Validators } from '@angular/forms';
import {
  ENQUIRY_CHANNELS,
  type EnquiryChannel,
  type ListingType,
  type PropertyType,
  parseIndianAmount,
} from '@brokerdesk/shared-types';
import { firstValueFrom } from 'rxjs';
import { FieldError } from '../../../shared/components/field-error';
import { formatIndianPhone, formatInr } from '../../../shared/utils/format';
import { errorMessage } from '../../../shared/utils/http-error';
import { leadPhone } from '../../../shared/utils/validators';
import { PROPERTY_TYPE_LABELS, options } from '../../leads/models/lead-labels';
import { PublicEnquiryApiService } from '../services/public-enquiry-api.service';

function indianAmount(control: AbstractControl): ValidationErrors | null {
  const v = typeof control.value === 'string' ? control.value.trim() : '';
  return v === '' || parseIndianAmount(v) !== null ? null : { amount: true };
}

/**
 * Public enquiry form at /enquire/:slug (shared as a link or QR code).
 * No login. Each submission becomes a lead in the agency's BrokerDesk.
 */
@Component({
  selector: 'bd-public-enquiry-page',
  imports: [ReactiveFormsModule, FieldError],
  templateUrl: './public-enquiry-page.html',
})
export class PublicEnquiryPage {
  /** Route parameter. */
  readonly slug = input.required<string>();
  /** `?ref=qr|whatsapp|instagram|…` – where the link was shared. */
  readonly ref = input<string>();

  private readonly api = inject(PublicEnquiryApiService);

  protected readonly agency = rxResource({
    params: () => this.slug(),
    stream: ({ params: slug }) => this.api.info(slug),
  });
  protected readonly agencyError = computed(() =>
    errorMessage(this.agency.error(), 'This enquiry form is not available. Please contact the agency directly.'),
  );
  protected readonly officePhone = computed(() => {
    const phone = this.agency.value()?.phone;
    return phone ? { display: formatIndianPhone(phone), tel: `tel:${phone.replace(/[^\d+]/g, '')}` } : null;
  });

  protected readonly propertyTypeOptions = options(PROPERTY_TYPE_LABELS).filter((o) => o.value !== 'OTHER');
  protected readonly bhkOptions = [1, 2, 3, 4, 5];
  protected readonly submitting = signal(false);
  /** Cleaned name of the person who submitted (null until sent). */
  protected readonly submittedName = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  protected readonly form = inject(NonNullableFormBuilder).group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
    phone: ['', [Validators.required, leadPhone]],
    listingType: ['SALE' as ListingType],
    propertyType: ['' as PropertyType | ''],
    bhk: [''],
    budget: ['', indianAmount],
    preferredLocation: ['', Validators.maxLength(191)],
    message: ['', Validators.maxLength(1000)],
    consent: [false, Validators.requiredTrue],
    /** Honeypot: hidden from people; bots fill it in. */
    website: [''],
  });

  private readonly budgetValue = toSignal(this.form.controls.budget.valueChanges, { initialValue: '' });
  protected readonly budgetHint = computed(() => {
    const v = this.budgetValue().trim();
    const n = v ? parseIndianAmount(v) : null;
    return n === null ? '' : `= ${formatInr(n)}`;
  });

  private channel(): EnquiryChannel {
    const ref = this.ref()?.toLowerCase();
    return (ENQUIRY_CHANNELS as readonly string[]).includes(ref ?? '') ? (ref as EnquiryChannel) : 'other';
  }

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.submitting()) return;
    const v = this.form.getRawValue();
    this.submitting.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(
        this.api.submit(this.slug(), {
          name: v.name.trim(),
          phone: v.phone.trim(),
          listingType: v.listingType,
          propertyType: v.propertyType || undefined,
          bhk: v.bhk ? Number(v.bhk) : undefined,
          budgetMax: v.budget.trim() ? (parseIndianAmount(v.budget) ?? undefined) : undefined,
          preferredLocation: v.preferredLocation.trim() || undefined,
          message: v.message.trim() || undefined,
          consent: true,
          channel: this.channel(),
          website: v.website || undefined,
        }),
      );
      this.submittedName.set(v.name.trim());
    } catch (e: unknown) {
      this.error.set(errorMessage(e, 'Could not send your enquiry. Please try again.'));
    } finally {
      this.submitting.set(false);
    }
  }
}
