import { DEFAULT_TEMPLATES, missingPlaceholders, renderTemplate } from '@brokerdesk/shared-types';

describe('renderTemplate', () => {
  it('fills placeholders (spaces inside braces allowed)', () => {
    expect(renderTemplate('Hi {{name}}, {{ agent }} from {{agency}}.', { name: 'Amit', agent: 'Ramesh', agency: 'Shela Homes' }))
      .toBe('Hi Amit, Ramesh from Shela Homes.');
  });

  it('drops known placeholders without a value and tidies the spacing', () => {
    expect(renderTemplate('Hello {{name}} , thanks!', {})).toBe('Hello, thanks!');
    expect(renderTemplate('Line {{property}}\nPrice: {{price}}', { property: 'Applewoods' })).toBe('Line Applewoods\nPrice:');
  });

  it('keeps unknown placeholders visible so they get noticed', () => {
    expect(renderTemplate('Hi {{nmae}}', { name: 'Amit' })).toBe('Hi {{nmae}}');
  });

  it('lists placeholders that are used but have no value', () => {
    expect(missingPlaceholders('Hi {{name}}, visit {{property}} at {{visit_time}} {{oops}}', { name: 'Amit', property: ' ' })).toEqual(['property', 'visit_time']);
  });

  it('starter templates only use known placeholders', () => {
    for (const t of DEFAULT_TEMPLATES) {
      expect(renderTemplate(t.message, {})).not.toContain('{{');
    }
  });
});
