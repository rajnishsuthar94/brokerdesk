/**
 * WhatsApp message templates. Messages are opened with WhatsApp's official
 * click-to-chat link (wa.me) for the broker to review and send themselves —
 * nothing is sent automatically.
 */

export const TEMPLATE_CATEGORIES = ['GREETING', 'FOLLOW_UP', 'SITE_VISIT', 'PROPERTY_SHARE', 'GENERAL'] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

export const TEMPLATE_CATEGORY_LABELS: Readonly<Record<TemplateCategory, string>> = {
  GREETING: 'First contact',
  FOLLOW_UP: 'Follow-up',
  SITE_VISIT: 'Site visit',
  PROPERTY_SHARE: 'Share property',
  GENERAL: 'General',
};

export const MAX_TEMPLATES_PER_AGENCY = 50;
export const MAX_TEMPLATE_LENGTH = 2000;

export const TEMPLATE_PLACEHOLDERS = ['name', 'full_name', 'agent', 'agency', 'property', 'location', 'price', 'visit_time'] as const;
export type TemplatePlaceholder = (typeof TEMPLATE_PLACEHOLDERS)[number];

export const PLACEHOLDER_HELP: Readonly<Record<TemplatePlaceholder, string>> = {
  name: "Buyer's first name",
  full_name: "Buyer's full name",
  agent: 'Your name',
  agency: 'Agency name',
  property: 'Property title',
  location: 'Property location',
  price: 'Property price (e.g. ₹85 L)',
  visit_time: 'Next site visit date & time',
};

export interface MessageTemplateView {
  readonly id: string;
  readonly title: string;
  readonly message: string;
  readonly category: TemplateCategory;
  readonly updatedAt: string;
}

export interface MessageTemplateInput {
  readonly title: string;
  readonly message: string;
  readonly category: TemplateCategory;
}

export type TemplateValues = Partial<Record<TemplatePlaceholder, string | null | undefined>>;

/** Placeholders a message uses that have no value in this context. */
export function missingPlaceholders(message: string, values: TemplateValues): TemplatePlaceholder[] {
  const used = new Set<TemplatePlaceholder>();
  for (const m of message.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)) {
    const key = m[1] as TemplatePlaceholder;
    if ((TEMPLATE_PLACEHOLDERS as readonly string[]).includes(key) && !values[key]?.trim()) used.add(key);
  }
  return [...used];
}

/**
 * Fills {{placeholders}}. Known placeholders without a value become empty (and
 * the spacing around them is tidied); unknown ones are left as typed so the
 * broker notices them before sending.
 */
export function renderTemplate(message: string, values: TemplateValues): string {
  const filled = message.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (whole, key: string) =>
    (TEMPLATE_PLACEHOLDERS as readonly string[]).includes(key) ? (values[key as TemplatePlaceholder]?.trim() ?? '') : whole,
  );
  return filled
    .split('\n')
    .map((line) => line.replace(/[ \t]{2,}/g, ' ').replace(/ +([,.!?])/g, '$1').trimEnd())
    .join('\n')
    .trim();
}

/** Starter templates an agency can add with one click (then edit freely, in any language). */
export const DEFAULT_TEMPLATES: readonly MessageTemplateInput[] = [
  {
    title: 'Thanks for your enquiry',
    category: 'GREETING',
    message: 'Hello {{name}}, thank you for your enquiry with {{agency}}. I am {{agent}} and I will help you find the right property. When is a good time to talk?',
  },
  {
    title: 'Following up',
    category: 'FOLLOW_UP',
    message: 'Hi {{name}}, {{agent}} from {{agency}} here. Just following up on your property search — are you still looking? I have a few new options that may suit you.',
  },
  {
    title: 'Site visit confirmation',
    category: 'SITE_VISIT',
    message: 'Hi {{name}}, your site visit to {{property}}, {{location}} is confirmed for {{visit_time}}. Please share your live location when you leave. — {{agent}}, {{agency}}',
  },
  {
    title: 'Share a property',
    category: 'PROPERTY_SHARE',
    message: 'Hi {{name}}, this property may interest you:\n{{property}}, {{location}}\nPrice: {{price}}\nShall I arrange a site visit? — {{agent}}, {{agency}}',
  },
  {
    title: 'After the site visit',
    category: 'FOLLOW_UP',
    message: 'Hi {{name}}, thank you for visiting {{property}} today. How did you like it? Happy to answer any questions or show you more options. — {{agent}}',
  },
];
