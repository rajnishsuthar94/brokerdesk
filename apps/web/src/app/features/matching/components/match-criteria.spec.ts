import { TestBed } from '@angular/core/testing';
import type { MatchCriterion } from '@brokerdesk/shared-types';
import { propertyWhatsappUrl } from '../share-message';
import { MatchCriteria } from './match-criteria';

describe('MatchCriteria', () => {
  const criteria: MatchCriterion[] = [
    { key: 'listingType', status: 'match', detail: 'For sale, as wanted' },
    { key: 'budget', status: 'near', detail: '₹93 L is 3% over the ₹90 L budget' },
    { key: 'location', status: 'miss', detail: 'In Gota; buyer prefers Shela' },
    { key: 'area', status: 'any', detail: 'No area requirement' },
  ];

  it('shows ✓ / ~ / ✗ chips, hides "any", and explains anything that is not a full match', async () => {
    TestBed.configureTestingModule({ imports: [MatchCriteria] });
    const fixture = TestBed.createComponent(MatchCriteria);
    fixture.componentRef.setInput('criteria', criteria);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const chips = Array.from(el.querySelectorAll('ul:first-child > li')).map((li) => li.textContent?.replace(/\s+/g, ' ').trim());
    expect(chips).toHaveLength(3);
    expect(chips[0]).toMatch(/^✓\s*Buy\/Rent/);
    expect(chips[1]).toMatch(/^~\s*Budget/);
    expect(chips[2]).toMatch(/^✗\s*Location/);
    expect(el.textContent).toContain('₹93 L is 3% over the ₹90 L budget');
    expect(el.textContent).toContain('In Gota; buyer prefers Shela');
    expect(el.textContent).not.toContain('No area requirement');
  });
});

describe('propertyWhatsappUrl', () => {
  it('opens a chat with the buyer, pre-filled with the property', () => {
    const url = propertyWhatsappUrl(
      { name: 'Amit', phone: '+919825012345' },
      { title: 'Applewoods 3BHK', bhk: 3, propertyType: 'APARTMENT', location: 'Shela', price: 8500000, listingType: 'SALE' },
    );
    expect(url.startsWith('https://wa.me/919825012345?text=')).toBe(true);
    expect(decodeURIComponent(url.split('text=')[1]!)).toBe(
      'Hi Amit, I have a property that matches your requirement: Applewoods 3BHK — 3 BHK Apartment / Flat in Shela, ₹85 L. Would you like to see it?',
    );
  });

  it('marks rents per month', () => {
    const url = propertyWhatsappUrl(
      { name: 'Priya', phone: '+919426055667' },
      { title: 'Rental', bhk: 2, propertyType: 'APARTMENT', location: 'Prahlad Nagar', price: 28000, listingType: 'RENT' },
    );
    expect(decodeURIComponent(url)).toContain('₹28,000/month');
  });
});
