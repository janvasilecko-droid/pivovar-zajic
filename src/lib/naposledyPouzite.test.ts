import { describe, it, expect } from 'vitest';
import {
  klicVyberu, nactiNaposled, zapamatujVyber, serazPodleNaposled,
  KOLIK_NAPOSLED, type UlozisteVyberu,
} from './naposledyPouzite';

function pamet(): UlozisteVyberu & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, v); },
  };
}

const KLIC = 'test';

describe('naposledy použité', () => {
  it('zapamatuje si výběr, nejnovější první', () => {
    const s = pamet();
    zapamatujVyber(KLIC, 'a', s);
    zapamatujVyber(KLIC, 'b', s);
    expect(nactiNaposled(KLIC, s)).toEqual(['b', 'a']);
  });

  it('opakovaný výběr téhož posune dopředu, nezdvojí', () => {
    const s = pamet();
    zapamatujVyber(KLIC, 'a', s);
    zapamatujVyber(KLIC, 'b', s);
    zapamatujVyber(KLIC, 'a', s);
    expect(nactiNaposled(KLIC, s)).toEqual(['a', 'b']);
  });

  it(`drží nejvýš ${KOLIK_NAPOSLED} — víc už není „naposledy"`, () => {
    const s = pamet();
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) zapamatujVyber(KLIC, id, s);
    const v = nactiNaposled(KLIC, s);
    expect(v).toHaveLength(KOLIK_NAPOSLED);
    expect(v[0]).toBe('g');
    expect(v).not.toContain('a');
  });

  it('klíč je na uživatele a na místo — prodejna sahá na jiná piva než sklep', () => {
    expect(klicVyberu('kegging', 'u1')).not.toBe(klicVyberu('prodejna', 'u1'));
    expect(klicVyberu('kegging', 'u1')).not.toBe(klicVyberu('kegging', 'u2'));
    expect(klicVyberu('kegging', null)).toContain('guest');
  });

  it('poškozené nebo chybějící úložiště dá prázdno a nespadne', () => {
    const s = pamet();
    s.data.set(KLIC, 'tohle není JSON');
    expect(nactiNaposled(KLIC, s)).toEqual([]);
    s.data.set(KLIC, '{"a":1}');
    expect(nactiNaposled(KLIC, s)).toEqual([]);
    expect(nactiNaposled(KLIC, null)).toEqual([]);
    expect(() => zapamatujVyber(KLIC, 'a', null)).not.toThrow();
  });

  it('prázdné id se nezapamatuje', () => {
    const s = pamet();
    zapamatujVyber(KLIC, '', s);
    expect(nactiNaposled(KLIC, s)).toEqual([]);
  });
});

describe('serazPodleNaposled', () => {
  type P = { id: string };
  const seznam: P[] = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
  const id = (p: P) => p.id;

  it('naposledy použité jdou dopředu v pořadí použití', () => {
    expect(serazPodleNaposled(seznam, id, ['c', 'a']).map(id)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('zbytek ZŮSTÁVÁ v původním pořadí číselníku', () => {
    // Původní pořadí je sort_order, tedy pořadí, ve kterém piva v pivovaru
    // chodí. Kdo hledá pivo, které naposledy nepoužil, ho musí najít tam,
    // kde ho vždycky měl.
    expect(serazPodleNaposled(seznam, id, ['d']).map(id)).toEqual(['d', 'a', 'b', 'c']);
  });

  it('bez historie se pořadí nemění vůbec', () => {
    expect(serazPodleNaposled(seznam, id, [])).toBe(seznam);
  });

  it('id, které v seznamu už není (smazané pivo), nic nerozhodí', () => {
    expect(serazPodleNaposled(seznam, id, ['zmizelo', 'b']).map(id)).toEqual(['b', 'a', 'c', 'd']);
  });

  it('prázdný seznam položek dá prázdno', () => {
    expect(serazPodleNaposled([] as P[], id, ['a'])).toEqual([]);
  });
});
