import type { LeadActivityType, LeadPriority, LeadSource, LeadStatus } from '@brokerdesk/shared-types';

// Labels shared with properties/matching live in shared/models; re-exported for convenience.
export { AREA_UNIT_LABELS, LISTING_LABELS, PROPERTY_TYPE_LABELS, options } from '../../../shared/models/real-estate-labels';

/** Display labels and colours for lead enums (one place, used by every lead screen). */

export const STATUS_LABELS: Readonly<Record<LeadStatus, string>> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  QUALIFIED: 'Qualified',
  SITE_VISIT: 'Site Visit',
  NEGOTIATION: 'Negotiation',
  WON: 'Won',
  LOST: 'Lost',
};

/** Tailwind classes for status badges (sales pipeline left → right). */
export const STATUS_STYLES: Readonly<Record<LeadStatus, string>> = {
  NEW: 'bg-sky-100 text-sky-800',
  CONTACTED: 'bg-indigo-100 text-indigo-800',
  QUALIFIED: 'bg-violet-100 text-violet-800',
  SITE_VISIT: 'bg-amber-100 text-amber-800',
  NEGOTIATION: 'bg-orange-100 text-orange-800',
  WON: 'bg-emerald-100 text-emerald-800',
  LOST: 'bg-slate-200 text-slate-700',
};

export const STATUS_ORDER: readonly LeadStatus[] = ['NEW', 'CONTACTED', 'QUALIFIED', 'SITE_VISIT', 'NEGOTIATION', 'WON', 'LOST'];

export const PRIORITY_LABELS: Readonly<Record<LeadPriority, string>> = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High' };
export const PRIORITY_STYLES: Readonly<Record<LeadPriority, string>> = {
  LOW: 'text-slate-500',
  MEDIUM: 'text-amber-700',
  HIGH: 'text-red-700',
};

export const SOURCE_LABELS: Readonly<Record<LeadSource, string>> = {
  WALK_IN: 'Walk-in',
  PHONE: 'Phone call',
  WHATSAPP: 'WhatsApp',
  REFERRAL: 'Referral',
  WEBSITE: 'Website',
  PROPERTY_PORTAL: 'Property portal',
  SOCIAL_MEDIA: 'Social media',
  NEWSPAPER: 'Newspaper',
  ENQUIRY_FORM: 'Enquiry form / QR',
  OTHER: 'Other',
};

export const ACTIVITY_LABELS: Readonly<Record<LeadActivityType, string>> = {
  NOTE: 'Note',
  CALL: 'Call',
  WHATSAPP: 'WhatsApp',
  EMAIL: 'Email',
  MEETING: 'Meeting',
  STATUS_CHANGE: 'Status',
  ASSIGNMENT: 'Assignment',
  FOLLOW_UP: 'Follow-up',
  SITE_VISIT: 'Site visit',
  SYSTEM: 'System',
};

