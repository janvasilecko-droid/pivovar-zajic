// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { ChybaVypoctu, vypocetText } from './nastroj.ts';
import { NASTROJE } from '../mcp.ts';

describe('nástroj vypocet konektoru Claude', () => {
  it('je mezi nástroji konektoru a instrukce na něj odkazuje', () => {
    expect(NASTROJE.some((n) => n.name === 'vypocet')).toBe(true);
  });
  it('bez id vrátí seznam výpočtů se vstupy a rozsahy', () => {
    const t = vypocetText({});
    expect(t).toContain('• alkohol — Alkohol a prokvašení (Balling)');
    expect(t).toContain('oe: Původní extrakt (stupňovitost mladiny) [°P], 2–30');
    expect(t).toContain('radky (Chmelové dávky, 1–8 řádků)');
  });
  it('spočítá výsledek se vzorcem, předpoklady, rozsahem, nejistotou a zdrojem', () => {
    const t = vypocetText({ id: 'alkohol', vstupy: { oe: 12, ae: 3 } });
    expect(t).toMatch(/Výsledek: Alkohol: 4,87 % obj\.; Alkohol: 3,80 % hm\./);
    expect(t).toContain('skutečný extrakt SE = 0,1808·PE + 0,8192·ZE');
    expect(t).toContain('Zdroj vzorce: C. J. N. Balling');
    expect(t).toContain('nepřepočítávej');
  });
  it('řádky (chmelové dávky) jdou v poli radky', () => {
    const t = vypocetText({ id: 'ibu_tinseth', vstupy: { v: 20, p: 12.3876 }, radky: [{ g: 50, alfa: 10, min: 60 }] });
    expect(t).toMatch(/Hořkost: 57,7 IBU/);
  });
  it('vstup mimo rozsah a neznámý výpočet = chyba pro model i s popisem vstupů', () => {
    expect(() => vypocetText({ id: 'alkohol', vstupy: { oe: 40, ae: 3 } })).toThrow(ChybaVypoctu);
    try {
      vypocetText({ id: 'alkohol', vstupy: { oe: 40, ae: 3 } });
    } catch (e) {
      expect((e as Error).message).toContain('Původní extrakt (stupňovitost mladiny) musí být 2–30 °P');
      expect((e as Error).message).toContain('Vstupy výpočtu alkohol');
    }
    expect(() => vypocetText({ id: 'neco' })).toThrow('Neznámý výpočet');
  });
});
