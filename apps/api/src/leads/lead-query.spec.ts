import type { TenantContext } from '../common/auth/auth.types.js';
import { buildLeadOrderBy, buildLeadWhere, leadScope } from './lead-query.js';

const owner: TenantContext = { userId: 'u-owner', agencyId: 'agency-a', memberId: 'm1', role: 'OWNER' };
const agent: TenantContext = { userId: 'u-agent', agencyId: 'agency-a', memberId: 'm2', role: 'AGENT' };
const NOW = new Date('2026-11-14T06:00:00Z'); // 11:30 IST

describe('leadScope', () => {
  it('managers see every non-deleted lead of their agency', () => {
    expect(leadScope(owner)).toEqual({ agencyId: 'agency-a', deletedAt: null });
  });

  it('agents only see leads assigned to them', () => {
    expect(leadScope(agent)).toEqual({ agencyId: 'agency-a', deletedAt: null, assignedUserId: 'u-agent' });
  });
});

describe('buildLeadWhere', () => {
  it('always starts with the tenant scope, whatever the filters', () => {
    const where = buildLeadWhere(agent, { assignedTo: 'unassigned', search: 'x' }, NOW);
    expect((where.AND as unknown[])[0]).toEqual(leadScope(agent));
  });

  it('searches name, email, location and phone digits', () => {
    const where = buildLeadWhere(owner, { search: '98250 12' }, NOW);
    expect((where.AND as unknown[])[1]).toEqual({
      OR: [
        { name: { contains: '98250 12' } },
        { email: { contains: '98250 12' } },
        { preferredLocation: { contains: '98250 12' } },
        { phone: { contains: '9825012' } },
      ],
    });
  });

  it('"today" uses the IST calendar day and excludes closed leads', () => {
    const where = buildLeadWhere(owner, { followUp: 'today' }, NOW);
    expect(where.AND).toContainEqual({ status: { notIn: ['WON', 'LOST'] } });
    expect(where.AND).toContainEqual({
      nextFollowUpAt: { gte: new Date('2026-11-13T18:30:00Z'), lt: new Date('2026-11-14T18:30:00Z') },
    });
  });

  it('maps assignedTo me/unassigned/id', () => {
    expect(buildLeadWhere(owner, { assignedTo: 'me' }, NOW).AND).toContainEqual({ assignedUserId: 'u-owner' });
    expect(buildLeadWhere(owner, { assignedTo: 'unassigned' }, NOW).AND).toContainEqual({ assignedUserId: null });
  });
});

describe('buildLeadOrderBy', () => {
  it('defaults to newest first with a stable tie-breaker', () => {
    expect(buildLeadOrderBy({})).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
  });

  it('puts leads without a follow-up date last', () => {
    expect(buildLeadOrderBy({ sort: 'nextFollowUpAt' })[0]).toEqual({ nextFollowUpAt: { sort: 'asc', nulls: 'last' } });
  });
});
