import { normalizeEmail, normalizeIndianMobile, normalizeText } from './normalize.js';

describe('normalizeIndianMobile', () => {
  it.each([
    ['9825012345', '+919825012345'],
    ['98250 12345', '+919825012345'],
    ['09825012345', '+919825012345'],
    ['919825012345', '+919825012345'],
    ['+91 98250 12345', '+919825012345'],
    ['+91-98250-12345', '+919825012345'],
    ['(+91) 98250 12345', '+919825012345'],
    ['6000000000', '+916000000000'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeIndianMobile(input)).toBe(expected);
  });

  it.each([
    ['too short', '98250123'],
    ['starts with 5', '5825012345'],
    ['foreign', '+44 7911 123456'],
    ['letters', '98250abcde'],
    ['13 digits', '9198250123456'],
    ['empty', ''],
  ])('rejects %s', (_label, input) => {
    expect(normalizeIndianMobile(input)).toBeNull();
  });
});

describe('normalizeEmail / normalizeText', () => {
  it('lower-cases and trims emails', () => {
    expect(normalizeEmail('  Ramesh.Patel@Example.COM ')).toBe('ramesh.patel@example.com');
  });

  it('collapses whitespace', () => {
    expect(normalizeText('  Sabarmati   Realty \n LLP ')).toBe('Sabarmati Realty LLP');
  });
});
