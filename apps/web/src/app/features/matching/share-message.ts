import type { ListingType, PropertyType } from '@brokerdesk/shared-types';
import { PROPERTY_TYPE_LABELS } from '../../shared/models/real-estate-labels';
import { formatInr } from '../../shared/utils/format';
import { whatsappChatUrl } from '../../shared/utils/whatsapp';

export interface ShareableProperty {
  readonly title: string;
  readonly bhk: number | null;
  readonly propertyType: PropertyType;
  readonly location: string;
  readonly price: number;
  readonly listingType: ListingType;
}

/** WhatsApp click-to-chat link that opens a chat with the buyer, pre-filled with the property. */
export function propertyWhatsappUrl(lead: { name: string; phone: string }, p: ShareableProperty): string {
  const what = [p.bhk ? `${p.bhk} BHK` : null, PROPERTY_TYPE_LABELS[p.propertyType], `in ${p.location}`].filter(Boolean).join(' ');
  const price = formatInr(p.price, 'short') + (p.listingType === 'RENT' ? '/month' : '');
  return whatsappChatUrl(
    lead.phone,
    `Hi ${lead.name}, I have a property that matches your requirement: ${p.title} — ${what}, ${price}. Would you like to see it?`,
  );
}
