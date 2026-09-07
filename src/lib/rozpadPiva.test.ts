import { describe, it, expect } from 'vitest';
import { sestavRozpadPiva, neprazdneSekce, souhrnPodleObalu, type ZdrojeRozpadu } from './rozpadPiva';

const PIVO = 'pivo-12sv';
const JINE = 'pivo-10';
const KEG50 = 'keg-50';
const KEG30 = 'keg-30';
const LAHEV = 'lahev-1l';

const obaly: Record<string, string> = { [KEG50]: '50l', [KEG30]: '30l', [LAHEV]: '1l' };
const popis = (id?: string | null) => (id && obaly[id]) || '?';

const zdroje: ZdrojeRozpadu = {
  zavozy: [
    { deduct_date: '2026-08-12', beer_id: PIVO, package_id: KEG50, quantity: 4, odberatel: 'Malešice' },
    { deduct_date: '2026-08-26', beer_id: PIVO, package_id: KEG30, quantity: 2, odberatel: 'Maneo' },
    { deduct_date: '2026-09-02', beer_id: PIVO, package_id: KEG30, quantity: 8, odberatel: 'Radek' },   // mimo období
    { deduct_date: '2026-08-13', beer_id: JINE, package_id: KEG50, quantity: 9, odberatel: 'Jiné pivo' }, // jiné pivo
  ],
  fasovani: [{ entry_date: '2026-08-05', beer_id: PIVO, package_id: LAHEV, quantity: 6, kdo: 'Petr' }],
  prodejna: [{ entry_date: '2026-08-06', beer_id: PIVO, package_id: LAHEV, quantity: 3 }],
  odpisy: [{ entry_date: '2026-08-07', beer_id: PIVO, package_id: KEG50, quantity: 1 }],
  akce: [{
    entry_date: '2026-08-15', nazev: 'Slavnosti',
    items: [
      { beer_id: PIVO, package_id: KEG50, quantity_taken: 5, quantity_returned: 2 },
      { beer_id: JINE, package_id: KEG50, quantity_taken: 4, quantity_returned: 0 },
    ],
  }],
  kegging: [{ entry_date: '2026-08-18', beer_id: PIVO, package_id: KEG50, quantity: 10, note: 'Tank 4' }],
  bottling: [{ entry_date: '2026-08-20', beer_id: PIVO, package_id: LAHEV, quantity: 120, kegs_used: 2, kegs_used_package_id: KEG50 }],
};

const rozpad = () => sestavRozpadPiva(zdroje, PIVO, '2026-08-01', '2026-08-31', [{ obal: '50l', mnozstvi: 7 }], popis);

describe('sestavRozpadPiva', () => {
  it('objednávky vypíše po odběratelích s obalem a množstvím', () => {
    const s = rozpad().sekce.find((x) => x.nazev === 'Objednávky (závoz)')!;
    expect(s.radky.map((r) => [r.kdo, r.obal, r.mnozstvi])).toEqual([
      ['Malešice', '50l', 4],
      ['Maneo', '30l', 2],
    ]);
    expect(s.celkem).toBe(6);
  });

  it('nebere jiné pivo ani pohyb mimo období', () => {
    const vse = rozpad().sekce.flatMap((s) => s.radky.map((r) => r.kdo));
    expect(vse).not.toContain('Radek');    // 2. 9. je mimo srpen
    expect(vse).not.toContain('Jiné pivo');
  });

  it('u akce se odečítá jen to, co se nevrátilo', () => {
    const s = rozpad().sekce.find((x) => x.nazev === 'Akce')!;
    expect(s.celkem).toBe(3); // 5 odvezeno − 2 vráceno
  });

  it('sudy spotřebované na lahve jsou výdej sudů, ne příjem', () => {
    const s = rozpad().sekce.find((x) => x.nazev === 'Sudy na lahve')!;
    expect(s.smer).toBe('vydej');
    expect(s.radky[0].obal).toBe('50l');
    expect(s.celkem).toBe(2);
  });

  it('stáčení je příjem a nese poznámku (tank)', () => {
    const s = rozpad().sekce.find((x) => x.nazev === 'Stáčení KEG')!;
    expect(s.smer).toBe('prijem');
    expect(s.radky[0].poznamka).toBe('Tank 4');
  });

  it('očekávaný stav = počáteční + příjem − výdej', () => {
    const r = rozpad();
    // příjem 10 + 120 = 130; výdej 6 (objednávky) + 6 + 3 + 1 + 3 + 2 = 21
    expect(r.prijemCelkem).toBe(130);
    expect(r.vydejCelkem).toBe(21);
    // Součty se dělají po obalech — padesátky s lahvemi se nesčítají.
    const souhrn = souhrnPodleObalu(r);
    const padesatky = souhrn.find((x) => x.obal === '50l')!;
    expect(padesatky.pocatecni).toBe(7);
    expect(padesatky.prijem).toBe(10);
    expect(padesatky.vydej).toBe(4 + 1 + 3 + 2);
    expect(padesatky.ocekavano).toBe(7 + 10 - 10);
  });

  it('řádky uvnitř sekce jdou chronologicky', () => {
    const s = sestavRozpadPiva(
      { zavozy: [
        { deduct_date: '2026-08-20', beer_id: PIVO, package_id: KEG50, quantity: 1, odberatel: 'B' },
        { deduct_date: '2026-08-02', beer_id: PIVO, package_id: KEG50, quantity: 1, odberatel: 'A' },
      ] },
      PIVO, '2026-08-01', '2026-08-31', [], popis,
    ).sekce.find((x) => x.nazev === 'Objednávky (závoz)')!;
    expect(s.radky.map((r) => r.kdo)).toEqual(['A', 'B']);
  });

  it('neznámý obal se ukáže jako „?", řádek se nezahodí', () => {
    const s = sestavRozpadPiva(
      { zavozy: [{ deduct_date: '2026-08-02', beer_id: PIVO, package_id: 'neznamy', quantity: 2, odberatel: 'X' }] },
      PIVO, '2026-08-01', '2026-08-31', [], popis,
    ).sekce.find((x) => x.nazev === 'Objednávky (závoz)')!;
    expect(s.radky[0].obal).toBe('?');
  });

  it('hranice období se počítají (první i poslední den)', () => {
    const s = sestavRozpadPiva(
      { zavozy: [
        { deduct_date: '2026-08-01', beer_id: PIVO, package_id: KEG50, quantity: 1, odberatel: 'první den' },
        { deduct_date: '2026-08-31', beer_id: PIVO, package_id: KEG50, quantity: 1, odberatel: 'poslední den' },
        { deduct_date: '2026-07-31', beer_id: PIVO, package_id: KEG50, quantity: 9, odberatel: 'den před' },
      ] },
      PIVO, '2026-08-01', '2026-08-31', [], popis,
    ).sekce.find((x) => x.nazev === 'Objednávky (závoz)')!;
    expect(s.celkem).toBe(2);
  });
});

describe('neprazdneSekce', () => {
  it('vrátí jen sekce, ve kterých něco je', () => {
    const nazvy = neprazdneSekce(rozpad()).map((s) => s.nazev);
    expect(nazvy).toContain('Objednávky (závoz)');
    expect(nazvy).toContain('Stáčení KEG');
    expect(nazvy.every((n) => n !== 'Přefuk')).toBe(true);
  });
});
