import type {
  AreaUnit,
  AvailabilityStatus,
  Furnishing,
  ListingType,
  MemberRole,
  PropertyType,
} from './enums.js';
import type { UserRef } from './leads.js';

export interface PropertyImageView {
  readonly id: string;
  /** Short-lived signed URL (images are private). Refresh by re-fetching the property. */
  readonly url: string;
  readonly displayOrder: number;
}

export interface PropertyView {
  readonly id: string;
  readonly title: string;
  readonly propertyType: PropertyType;
  readonly listingType: ListingType;
  readonly projectName: string | null;
  readonly location: string;
  readonly city: string;
  /** Rupees. Sale price, or monthly rent when listingType = RENT. */
  readonly price: number;
  readonly bhk: number | null;
  readonly area: number | null;
  readonly areaUnit: AreaUnit;
  readonly furnishing: Furnishing | null;
  readonly floor: string | null;
  readonly parking: number;
  readonly description: string | null;
  readonly ownerName: string | null;
  readonly ownerPhone: string | null;
  readonly availabilityStatus: AvailabilityStatus;
  readonly assignedUser: UserRef | null;
  /** First image (cover) or null. */
  readonly coverImageUrl: string | null;
  readonly images: readonly PropertyImageView[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PropertyInput {
  readonly title: string;
  readonly propertyType: PropertyType;
  readonly listingType: ListingType;
  readonly projectName?: string | null;
  readonly location: string;
  readonly city?: string;
  readonly price: number;
  readonly bhk?: number | null;
  readonly area?: number | null;
  readonly areaUnit?: AreaUnit;
  readonly furnishing?: Furnishing | null;
  readonly floor?: string | null;
  readonly parking?: number;
  readonly description?: string | null;
  readonly ownerName?: string | null;
  readonly ownerPhone?: string | null;
  readonly availabilityStatus?: AvailabilityStatus;
  /** Owners/admins only. */
  readonly assignedUserId?: string | null;
}

export const PROPERTY_SORT_FIELDS = ['createdAt', 'updatedAt', 'price', 'title'] as const;
export type PropertySortField = (typeof PROPERTY_SORT_FIELDS)[number];

export interface PropertyListQuery {
  readonly search?: string;
  readonly listingType?: ListingType;
  readonly propertyType?: readonly PropertyType[];
  readonly availabilityStatus?: readonly AvailabilityStatus[];
  readonly bhk?: readonly number[];
  readonly minPrice?: number;
  readonly maxPrice?: number;
  readonly assignedTo?: string;
  readonly sort?: PropertySortField;
  readonly order?: 'asc' | 'desc';
  readonly page?: number;
  readonly pageSize?: number;
}

export const MAX_PROPERTY_IMAGES = 20;
export const MAX_IMAGE_UPLOAD_BYTES = 8 * 1024 * 1024;

/**
 * Property permissions. Inventory is shared across the agency: every member can
 * view and add properties. Editing: owners/admins, or the assigned agent.
 * Delete: owners/admins. (The API enforces; the UI uses these for display.)
 */
export function canEditProperty(role: MemberRole, assignedUserId: string | null, userId: string): boolean {
  return role === 'OWNER' || role === 'ADMIN' || assignedUserId === userId;
}

export function canDeleteProperties(role: MemberRole): boolean {
  return role === 'OWNER' || role === 'ADMIN';
}
