import type { MemberRole } from '@brokerdesk/shared-types';

export const ROLE_LABELS: Readonly<Record<MemberRole, string>> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  AGENT: 'Agent',
};

export const ROLE_DESCRIPTIONS: Readonly<Record<MemberRole, string>> = {
  OWNER: 'Full control, including billing and owners',
  ADMIN: 'Manages agents, agency details and all data',
  AGENT: 'Works on leads and properties',
};
