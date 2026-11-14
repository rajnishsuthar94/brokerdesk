import { Component, computed, effect, inject, input, output, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { type AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, type ValidationErrors, Validators } from '@angular/forms';
import {
  type AreaUnit,
  type AvailabilityStatus,
  type Furnishing,
  type ListingType,
  type PropertyInput,
  type PropertyType,
  type PropertyView,
  type TeamMember,
  parseIndianAmount,
} from '@brokerdesk/shared-types';
import { FieldError } from '../../../shared/components/field-error';
import {
  AREA_UNIT_LABELS,
  AVAILABILITY_LABELS,
  FURNISHING_LABELS,
  LISTING_LABELS_PROPERTY,
  PROPERTY_TYPE_LABELS,
  options,
} from '../../../shared/models/real-estate-labels';
import { formatInr } from '../../../shared/utils/format';

function requiredAmount(control: AbstractControl): ValidationErrors | null {
  const v = typeof control.value === 'string' ? control.value.trim() : '';
  if (v === '') return { required: true };
  const n = parseIndianAmount(v);
  return n !== null && n > 0 ? null : { amount: true };
}

const numOrNull = (v: string): number | null => (v.trim() === '' ? null : Number(v));
const textOrNull = (v: string): string | null => v.trim() || null;

/** Presentational property form for create and edit. Emits a PropertyInput. */
@Component({
  selector: 'bd-property-form',
  imports: [ReactiveFormsModule, FieldError],
  templateUrl: './property-form.html',
})
export class PropertyForm {
  readonly property = input<PropertyView | null>(null);
  readonly members = input<readonly TeamMember[]>([]);
  readonly canAssign = input(false);
  readonly busy = input(false);
  readonly submitLabel = input('Save property');
  readonly save = output<PropertyInput>();
  readonly cancelled = output<void>();

  protected readonly typeOptions = options(PROPERTY_TYPE_LABELS);
  protected readonly listingOptions = options(LISTING_LABELS_PROPERTY);
  protected readonly unitOptions = options(AREA_UNIT_LABELS);
  protected readonly furnishingOptions = options(FURNISHING_LABELS);
  protected readonly availabilityOptions = options(AVAILABILITY_LABELS);
  protected readonly bhkOptions = [1, 2, 3, 4, 5, 6];

  protected readonly form = inject(NonNullableFormBuilder).group({
    title: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(200)]],
    listingType: ['SALE' as ListingType],
    propertyType: ['APARTMENT' as PropertyType, Validators.required],
    projectName: ['', Validators.maxLength(191)],
    location: ['', [Validators.required, Validators.maxLength(191)]],
    city: ['Ahmedabad', [Validators.required, Validators.maxLength(100)]],
    price: ['', requiredAmount],
    bhk: [''],
    area: ['', Validators.min(1)],
    areaUnit: ['SQFT' as AreaUnit],
    furnishing: ['' as Furnishing | ''],
    floor: ['', Validators.maxLength(30)],
    parking: ['0'],
    description: ['', Validators.maxLength(5000)],
    ownerName: ['', Validators.maxLength(150)],
    ownerPhone: ['', Validators.pattern(/^\+?[\d\s\-()]{7,20}$/)],
    availabilityStatus: ['AVAILABLE' as AvailabilityStatus],
    assignedUserId: [''],
  });

  private readonly values = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  protected readonly priceHint = computed(() => {
    const v = this.values().price?.trim() ?? '';
    const n = v ? parseIndianAmount(v) : null;
    const perMonth = this.values().listingType === 'RENT' ? ' per month' : '';
    return n === null ? '' : `= ${formatInr(n)}${perMonth}`;
  });
  protected readonly isRent = computed(() => this.values().listingType === 'RENT');

  constructor() {
    // Copy the property being edited into the (non-signal) reactive form.
    effect(() => {
      const p = this.property();
      if (!p) return;
      untracked(() =>
        this.form.reset({
          title: p.title,
          listingType: p.listingType,
          propertyType: p.propertyType,
          projectName: p.projectName ?? '',
          location: p.location,
          city: p.city,
          price: String(p.price),
          bhk: p.bhk?.toString() ?? '',
          area: p.area?.toString() ?? '',
          areaUnit: p.areaUnit,
          furnishing: p.furnishing ?? '',
          floor: p.floor ?? '',
          parking: String(p.parking),
          description: p.description ?? '',
          ownerName: p.ownerName ?? '',
          ownerPhone: p.ownerPhone ?? '',
          availabilityStatus: p.availabilityStatus,
          assignedUserId: p.assignedUser?.id ?? '',
        }),
      );
    });
  }

  protected submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.busy()) return;
    const v = this.form.getRawValue();
    this.save.emit({
      title: v.title.trim(),
      listingType: v.listingType,
      propertyType: v.propertyType,
      projectName: textOrNull(v.projectName),
      location: v.location.trim(),
      city: v.city.trim(),
      price: parseIndianAmount(v.price) ?? 0,
      bhk: numOrNull(v.bhk),
      area: numOrNull(v.area),
      areaUnit: v.areaUnit,
      furnishing: v.furnishing || null,
      floor: textOrNull(v.floor),
      parking: Number(v.parking) || 0,
      description: textOrNull(v.description),
      ownerName: textOrNull(v.ownerName),
      ownerPhone: textOrNull(v.ownerPhone),
      availabilityStatus: v.availabilityStatus,
      ...(this.canAssign() ? { assignedUserId: v.assignedUserId || null } : {}),
    });
  }
}
