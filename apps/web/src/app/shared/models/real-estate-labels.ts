import type { AreaUnit, AvailabilityStatus, Furnishing, ListingType, PropertyType } from '@brokerdesk/shared-types';

/** Display labels shared by leads, properties and matching. */

export const PROPERTY_TYPE_LABELS: Readonly<Record<PropertyType, string>> = {
  APARTMENT: 'Apartment / Flat',
  BUNGALOW: 'Bungalow / Villa',
  ROW_HOUSE: 'Row house',
  TENEMENT: 'Tenement',
  PENTHOUSE: 'Penthouse',
  PLOT: 'Plot',
  SHOP: 'Shop',
  OFFICE: 'Office',
  OTHER: 'Other',
};

export const LISTING_LABELS: Readonly<Record<ListingType, string>> = { SALE: 'Buy', RENT: 'Rent' };

export const LISTING_LABELS_PROPERTY: Readonly<Record<ListingType, string>> = { SALE: 'For sale', RENT: 'For rent' };

export const AREA_UNIT_LABELS: Readonly<Record<AreaUnit, string>> = { SQFT: 'sq ft', SQYD: 'sq yd', SQM: 'sq m' };

export const AVAILABILITY_LABELS: Readonly<Record<AvailabilityStatus, string>> = {
  AVAILABLE: 'Available',
  ON_HOLD: 'On hold',
  SOLD: 'Sold',
  RENTED: 'Rented out',
  ARCHIVED: 'Archived',
};

export const AVAILABILITY_STYLES: Readonly<Record<AvailabilityStatus, string>> = {
  AVAILABLE: 'bg-emerald-100 text-emerald-800',
  ON_HOLD: 'bg-amber-100 text-amber-800',
  SOLD: 'bg-slate-200 text-slate-700',
  RENTED: 'bg-slate-200 text-slate-700',
  ARCHIVED: 'bg-slate-100 text-slate-500',
};

export const FURNISHING_LABELS: Readonly<Record<Furnishing, string>> = {
  UNFURNISHED: 'Unfurnished',
  SEMI_FURNISHED: 'Semi-furnished',
  FULLY_FURNISHED: 'Fully furnished',
};

/** `{ value, label }` options for selects, in declaration order. */
export function options<T extends string>(labels: Readonly<Record<T, string>>): { value: T; label: string }[] {
  return (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }));
}
