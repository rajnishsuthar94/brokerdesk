import {
  type BuyerRequirement,
  type PropertyFacts,
  compareMatches,
  evaluateMatch,
  locationTokens,
  matchArea,
  matchBhk,
  matchBudget,
  matchLocation,
  matchPropertyType,
} from './match-engine.js';

const buyer = (o: Partial<BuyerRequirement> = {}): BuyerRequirement => ({
  listingType: 'SALE',
  budgetMin: 7_500_000,
  budgetMax: 9_000_000,
  preferredLocation: 'Shela, Bopal',
  bhk: 3,
  propertyType: 'APARTMENT',
  areaMin: null,
  areaMax: null,
  areaUnit: null,
  ...o,
});

const flat = (o: Partial<PropertyFacts> = {}): PropertyFacts => ({
  listingType: 'SALE',
  price: 8_500_000,
  location: 'Shela',
  city: 'Ahmedabad',
  projectName: 'Applewoods Sorrel',
  bhk: 3,
  propertyType: 'APARTMENT',
  area: 1650,
  areaUnit: 'SQFT',
  ...o,
});

describe('evaluateMatch', () => {
  it('a perfect match scores 100 and explains every criterion', () => {
    const r = evaluateMatch(buyer(), flat());
    expect(r.score).toBe(100);
    expect(r.criteria.map((c) => [c.key, c.status])).toEqual([
      ['listingType', 'match'],
      ['budget', 'match'],
      ['location', 'match'],
      ['bhk', 'match'],
      ['propertyType', 'match'],
      ['area', 'any'],
    ]);
    expect(r.criteria.find((c) => c.key === 'budget')?.detail).toBe('₹85 L is within the budget (₹75 L–₹90 L)');
    expect(r).toMatchObject({ matched: 5, near: 0, missed: 0 });
  });

  it('is deterministic', () => {
    expect(evaluateMatch(buyer(), flat())).toEqual(evaluateMatch(buyer(), flat()));
  });

  it('near results earn half points', () => {
    // 5 scored criteria: 4 match (8) + bhk near (1) = 9 of 10
    expect(evaluateMatch(buyer(), flat({ bhk: 4 })).score).toBe(90);
  });

  it('criteria the buyer left open are not scored', () => {
    const open = buyer({ budgetMin: null, budgetMax: null, preferredLocation: null, bhk: null, propertyType: null });
    const r = evaluateMatch(open, flat({ location: 'Gota', bhk: 1, propertyType: 'PLOT' }));
    expect(r.score).toBe(100); // only listing type was asked for, and it matches
    expect(r.criteria.filter((c) => c.status === 'any')).toHaveLength(5);
  });

  it('wrong listing type pulls the score down hard', () => {
    expect(evaluateMatch(buyer(), flat({ listingType: 'RENT' })).criteria[0]).toMatchObject({
      status: 'miss',
      detail: 'For rent, buyer wants to buy',
    });
  });
});

describe('budget', () => {
  it.each([
    [9_000_000, 'match', '₹90 L is within the budget (₹75 L–₹90 L)'],
    [9_200_000, 'near', '₹92 L is 2% over the ₹90 L budget'],
    [9_900_000, 'near', '₹99 L is 10% over the ₹90 L budget'],
    [9_910_000, 'miss', '₹99.1 L is 10% over the ₹90 L budget'],
    [12_000_000, 'miss', '₹1.2 Cr is 33% over the ₹90 L budget'],
    [6_000_000, 'near', '₹60 L is below the ₹75 L minimum'],
  ])('₹%d → %s', (price, status, detail) => {
    expect(matchBudget(buyer(), flat({ price }))).toEqual({ key: 'budget', status, detail });
  });

  it('works with only a maximum or only a minimum', () => {
    expect(matchBudget(buyer({ budgetMin: null }), flat()).detail).toBe('₹85 L is within the budget (up to ₹90 L)');
    expect(matchBudget(buyer({ budgetMax: null }), flat()).detail).toBe('₹85 L is within the budget (from ₹75 L)');
  });

  it('handles monthly rents', () => {
    const tenant = buyer({ listingType: 'RENT', budgetMin: 20_000, budgetMax: 30_000 });
    expect(matchBudget(tenant, flat({ listingType: 'RENT', price: 28_000 })).detail).toBe('₹28,000 is within the budget (₹20,000–₹30,000)');
  });
});

describe('location', () => {
  it('splits multiple preferred areas', () => {
    expect(locationTokens('Shela, Bopal / South Bopal or Gota & Satellite')).toEqual(['shela', 'bopal', 'south bopal', 'gota', 'satellite']);
  });

  it.each([
    [{ location: 'Bopal' }, 'match'],
    [{ location: 'South Bopal' }, 'match'],
    [{ location: 'SHELA' }, 'match'],
    [{ location: 'Science City Road', projectName: 'Shela Heights' }, 'match'], // project name counts
    [{ location: 'Gota', projectName: null }, 'miss'],
  ])('%j → %s', (property, status) => {
    expect(matchLocation(buyer(), flat(property)).status).toBe(status);
  });

  it('a specific buyer area matches a broader listing location', () => {
    expect(matchLocation(buyer({ preferredLocation: 'Prahlad Nagar Garden' }), flat({ location: 'Prahlad Nagar', projectName: null })).status).toBe('match');
  });
});

describe('BHK and property type', () => {
  it.each([
    [3, 'match'],
    [2, 'near'],
    [4, 'near'],
    [5, 'miss'],
    [null, 'unknown'],
  ])('%s BHK for a 3 BHK buyer → %s', (bhk, status) => {
    expect(matchBhk(buyer(), flat({ bhk })).status).toBe(status);
  });

  it.each([
    ['APARTMENT', 'match'],
    ['PENTHOUSE', 'near'],
    ['BUNGALOW', 'miss'],
    ['OFFICE', 'miss'],
  ] as const)('%s for an apartment buyer → %s', (propertyType, status) => {
    expect(matchPropertyType(buyer(), flat({ propertyType })).status).toBe(status);
  });

  it('independent houses are near each other', () => {
    expect(matchPropertyType(buyer({ propertyType: 'BUNGALOW' }), flat({ propertyType: 'ROW_HOUSE' })).status).toBe('near');
  });
});

describe('area (with unit conversion)', () => {
  const wants = buyer({ areaMin: 1500, areaMax: 1800, areaUnit: 'SQFT' });

  it.each([
    [{ area: 1650, areaUnit: 'SQFT' }, 'match'],
    [{ area: 1400, areaUnit: 'SQFT' }, 'near'], // 6.7% below
    [{ area: 1200, areaUnit: 'SQFT' }, 'miss'],
    [{ area: 180, areaUnit: 'SQYD' }, 'match'], // 1620 sq ft
    [{ area: 150, areaUnit: 'SQM' }, 'match'], // 1614.6 sq ft
    [{ area: null }, 'unknown'],
  ] as const)('%j → %s', (property, status) => {
    expect(matchArea(wants, flat(property)).status).toBe(status);
  });

  it('defaults the buyer unit to sq ft and handles a minimum only', () => {
    expect(matchArea(buyer({ areaMin: 300, areaUnit: 'SQYD' }), flat({ area: 2800, areaUnit: 'SQFT' })).detail).toBe(
      '2800 sq ft, within at least 300 sq yd',
    );
  });
});

describe('compareMatches', () => {
  it('orders by score, then fewer misses, then price closest to the budget', () => {
    const r = (score: number, missed: number) => ({ score, missed, matched: 0, near: 0, criteria: [] });
    const items = [
      { id: 'a', summary: r(80, 1), price: 8_000_000 },
      { id: 'b', summary: r(90, 0), price: 9_500_000 },
      { id: 'c', summary: r(80, 0), price: 7_000_000 },
      { id: 'd', summary: r(80, 0), price: 8_900_000 },
    ];
    expect(items.sort((x, y) => compareMatches(x, y, 9_000_000)).map((i) => i.id)).toEqual(['b', 'd', 'c', 'a']);
  });
});
