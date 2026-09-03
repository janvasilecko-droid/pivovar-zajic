import { describe, it, expect } from 'vitest';
import {
  frontaTanku, zaradOdecet, odeberZFronty, zapisNeuspech, kZopakovani,
  pocetVeFronte, zpracujFrontu, novyKlic, MAX_POKUSU, KLIC_ULOZISTE,
  type UlozisteFronty, type OdecetVeFronte, type VysledekOdectu,
} from './tankFronta';

function pamet(): UlozisteFronty & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, v); },
  };
}

const ODECET = { klic: 'k1', tankId: 't6', label: 'Tank 6', deltaL: -450, zdroj: 'staceni' };

describe('fronta odečtů z tanků', () => {
  it('zařadí a přečte', () => {
    const s = pamet();
    zaradOdecet(ODECET, s);
    const f = frontaTanku(s);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ klic: 'k1', tankId: 't6', deltaL: -450, pokusu: 0, vzdano: false });
  });

  it('tentýž klíč frontu nezdvojí', () => {
    // Uživatel může uložit stáčení znovu a klíč se posílá stejný — nesmí
    // z toho být dvojí odečet ani ve frontě.
    const s = pamet();
    zaradOdecet(ODECET, s);
    zaradOdecet(ODECET, s);
    expect(frontaTanku(s)).toHaveLength(1);
  });

  it('odebrání funguje a neznámý klíč nic nerozbije', () => {
    const s = pamet();
    zaradOdecet(ODECET, s);
    expect(odeberZFronty('neexistuje', s)).toHaveLength(1);
    expect(odeberZFronty('k1', s)).toHaveLength(0);
  });

  it('po vyčerpání pokusů se položka označí jako vzdaná, ale ZŮSTANE', () => {
    // Mazat do ticha je přesně to, co dělá schodky nedohledatelnými.
    const s = pamet();
    zaradOdecet(ODECET, s);
    for (let i = 0; i < MAX_POKUSU; i += 1) zapisNeuspech('k1', 'síť', s);
    const f = frontaTanku(s);
    expect(f).toHaveLength(1);
    expect(f[0].vzdano).toBe(true);
    expect(f[0].pokusu).toBe(MAX_POKUSU);
    expect(kZopakovani(f)).toHaveLength(0);
  });

  it('poškozené úložiště se čte jako prázdná fronta', () => {
    const s = pamet();
    s.data.set(KLIC_ULOZISTE, '{tohle není JSON');
    expect(frontaTanku(s)).toEqual([]);
    s.data.set(KLIC_ULOZISTE, '{"a":1}');
    expect(frontaTanku(s)).toEqual([]);
  });

  it('bez úložiště vrací prázdno a nepadá', () => {
    expect(frontaTanku(null)).toEqual([]);
    expect(() => zaradOdecet(ODECET, null)).not.toThrow();
  });
});

describe('zpracujFrontu', () => {
  it('úspěšný odečet zmizí z fronty', async () => {
    const s = pamet();
    zaradOdecet(ODECET, s);
    const r = await zpracujFrontu(async () => ({ stav: 'provedeno' }), s);
    expect(r).toEqual({ hotovo: 1, selhalo: 0, zbyva: 0 });
  });

  it('„již provedeno" je ÚSPĚCH, ne chyba', async () => {
    // To je celý smysl klíče idempotence: server odečet kdysi provedl, jen
    // se to nedozvěděl klient. Kdyby to fronta brala jako chybu, zkoušela
    // by to pořád dokola u odečtu, který je dávno hotový.
    const s = pamet();
    zaradOdecet(ODECET, s);
    const r = await zpracujFrontu(async () => ({ stav: 'jiz_provedeno' }), s);
    expect(r.hotovo).toBe(1);
    expect(pocetVeFronte(s)).toBe(0);
  });

  it('chyba položku ve frontě nechá a připočte pokus', async () => {
    const s = pamet();
    zaradOdecet(ODECET, s);
    const r = await zpracujFrontu(async () => ({ stav: 'chyba', chyba: 'offline' }), s);
    expect(r).toEqual({ hotovo: 0, selhalo: 1, zbyva: 1 });
    expect(frontaTanku(s)[0]).toMatchObject({ pokusu: 1, chyba: 'offline' });
  });

  it('výjimka z volání se bere jako chyba, ne jako pád zpracování', async () => {
    const s = pamet();
    zaradOdecet(ODECET, s);
    zaradOdecet({ ...ODECET, klic: 'k2' }, s);
    const r = await zpracujFrontu(async () => { throw new Error('TypeError: fetch'); }, s);
    expect(r.selhalo).toBe(2);
    expect(frontaTanku(s).every((p) => p.chyba === 'TypeError: fetch')).toBe(true);
  });

  it('projde všechny položky, i když první selže', async () => {
    const s = pamet();
    zaradOdecet(ODECET, s);
    zaradOdecet({ ...ODECET, klic: 'k2', label: 'Spilka 1' }, s);
    const volani: string[] = [];
    const r = await zpracujFrontu(async (p: OdecetVeFronte): Promise<VysledekOdectu> => {
      volani.push(p.klic);
      return p.klic === 'k1' ? { stav: 'chyba', chyba: 'x' } : { stav: 'provedeno' };
    }, s);
    expect(volani).toEqual(['k1', 'k2']);
    expect(r).toEqual({ hotovo: 1, selhalo: 1, zbyva: 1 });
  });

  it('vzdané položky se samy nezkoušejí', async () => {
    const s = pamet();
    zaradOdecet(ODECET, s);
    for (let i = 0; i < MAX_POKUSU; i += 1) zapisNeuspech('k1', 'síť', s);
    let volano = 0;
    await zpracujFrontu(async () => { volano += 1; return { stav: 'provedeno' }; }, s);
    expect(volano).toBe(0);
  });

  it('prázdná fronta nic nevolá', async () => {
    const s = pamet();
    let volano = 0;
    const r = await zpracujFrontu(async () => { volano += 1; return { stav: 'provedeno' }; }, s);
    expect(volano).toBe(0);
    expect(r).toEqual({ hotovo: 0, selhalo: 0, zbyva: 0 });
  });
});

describe('novyKlic', () => {
  it('je pokaždé jiný a dost dlouhý pro kontrolu na serveru', () => {
    // Funkce adjust_tank_volume_once odmítne klíč krátší než 8 znaků.
    const a = novyKlic();
    const b = novyKlic();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(8);
  });
});
