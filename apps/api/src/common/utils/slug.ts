import { randomBytes } from 'node:crypto';

/**
 * Public, unguessable slug for an agency's enquiry form:
 * "<readable-name>-<8 random hex chars>", e.g. "sabarmati-realty-3f9c2a1b".
 * The random part (32 bits) stops people enumerating other agencies' forms;
 * the readable part reassures buyers the link is genuine.
 * Must match the backfill format in migration 20261114170000_enquiry_form.
 */
export function makePublicSlug(agencyName: string): string {
  const base =
    agencyName
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 40)
      .replace(/^-+|-+$/g, '') || 'agency';
  return `${base}-${randomBytes(4).toString('hex')}`;
}
