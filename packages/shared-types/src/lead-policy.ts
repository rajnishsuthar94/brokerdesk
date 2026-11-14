import { MemberRole } from './enums.js';

/**
 * Lead access rules. Single source of truth: the API enforces them, the web app
 * uses them only to decide what to show.
 *
 * - OWNER / ADMIN: every lead in the agency; may delete, (re)assign, import, export.
 * - AGENT: only leads assigned to them (new leads they create are assigned to
 *   them); cannot delete, reassign, import or export. Leads outside their scope
 *   behave exactly like non-existent ones (404).
 */
export function canSeeAllLeads(role: MemberRole): boolean {
  return role === MemberRole.OWNER || role === MemberRole.ADMIN;
}

export const canAssignLeads = canSeeAllLeads;
export const canDeleteLeads = canSeeAllLeads;
/** Bulk import/export is limited to managers (bulk export is a data-exfiltration risk). */
export const canImportExportLeads = canSeeAllLeads;
