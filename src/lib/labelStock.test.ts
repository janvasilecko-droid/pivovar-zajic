import { describe, it, expect } from 'vitest';
import { isExemptFromLabels } from './labelStock';

describe('isExemptFromLabels', () => {
  it('"bez etiket" v poznámce vyjme stočení bez ohledu na velikost', () => {
    expect(isExemptFromLabels('bez etiket', 0.5)).toBe(true);
    expect(isExemptFromLabels('Bez Etiket', 1.5)).toBe(true);
    expect(isExemptFromLabels('šarže 12, bez etiket', 1)).toBe(true);
  });

  it('"bedny"/"sklo" v poznámce vyjme jen obal 0,33l (Lužec)', () => {
    expect(isExemptFromLabels('bedny pro Lužec', 0.33)).toBe(true);
    expect(isExemptFromLabels('sklo', 0.33)).toBe(true);
    // Jiná velikost než 0,33l se nevyjímá, i se stejným slovem v poznámce.
    expect(isExemptFromLabels('bedny', 0.5)).toBe(false);
    expect(isExemptFromLabels('sklo', 1.5)).toBe(false);
  });

  it('normální stočení bez poznámky/výjimky se nevyjímá', () => {
    expect(isExemptFromLabels(null, 0.5)).toBe(false);
    expect(isExemptFromLabels('', 0.33)).toBe(false);
    expect(isExemptFromLabels('běžná šarže', 0.5)).toBe(false);
  });
});
