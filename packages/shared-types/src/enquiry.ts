import type { ListingType, PropertyType } from './enums.js';

/** Where a public enquiry came from (the `ref` query parameter of the form link). */
export const ENQUIRY_CHANNELS = ['qr', 'whatsapp', 'instagram', 'facebook', 'website', 'other'] as const;
export type EnquiryChannel = (typeof ENQUIRY_CHANNELS)[number];

/** Public info shown on the enquiry page (GET /public/enquiry/:slug). Nothing private. */
export interface PublicEnquiryInfo {
  readonly agencyName: string;
  readonly city: string | null;
  /** Agency office phone, if the owner entered one. */
  readonly phone: string | null;
}

/** Body of POST /public/enquiry/:slug. */
export interface PublicEnquiryRequest {
  readonly name: string;
  readonly phone: string;
  readonly email?: string;
  readonly listingType?: ListingType;
  readonly propertyType?: PropertyType;
  readonly bhk?: number;
  /** Rupees. */
  readonly budgetMax?: number;
  readonly preferredLocation?: string;
  readonly message?: string;
  /** Required: permission to be contacted (DPDP Act). */
  readonly consent: true;
  readonly channel?: EnquiryChannel;
  /** Honeypot. Real visitors never fill this; must be empty. */
  readonly website?: string;
}

/** Enquiry form settings for the agency (GET /agencies/current/enquiry-form). */
export interface EnquiryFormSettings {
  readonly enabled: boolean;
  readonly slug: string;
  /** Full public URL of the form. */
  readonly url: string;
}
