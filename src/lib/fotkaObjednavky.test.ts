// Z provozu 7. 10. 2026: fotka 1,5l lahví se uložila jako dvě objednávky —
// „Restaurace" jen u prvního řádku, zbytek bez odběratele.
// 16. 10. 2026: víc dnů závozu na jedné fotce (odběratel × den = objednávka).
import { describe, it, expect } from 'vitest';
import { datumKratce, nabidkaDnuZavozu, objednavkyZFotky, odberatelRadku, seskupDoObjednavek, zavozRadku, zavozZTextuRadku } from './fotkaObjednavky';

/** Odběratelé řádků bez vlastního dne závozu. */
const bezDne = (odberatele: string[]) => odberatele.map((odberatel) => ({ odberatel }));

describe('odberatelRadku', () => {
  it('odběratel jen u jednoho řádku platí pro celou fotku', () => {
    const r = odberatelRadku(['Restaurace', null, '', undefined, null], '');
    expect(r).toEqual(['Restaurace', 'Restaurace', 'Restaurace', 'Restaurace', 'Restaurace']);
    expect(objednavkyZFotky(bezDne(r))).toEqual([{ odberatel: 'Restaurace', zavoz: null, polozek: 5 }]);
  });

  it('stejné jméno jinak napsané je pořád jeden odběratel', () => {
    expect(odberatelRadku(['Restaurace', ' restaurace ', null], null)).toEqual(['Restaurace', 'Restaurace', 'Restaurace']);
  });

  it('hlavní odběratel nahoře doplní řádky bez odběratele, vlastní nechá', () => {
    expect(odberatelRadku([null, 'Sluhy', ''], 'Chmeloun')).toEqual(['Chmeloun', 'Sluhy', 'Chmeloun']);
  });

  it('dva různí odběratelé na fotce = dvě objednávky jako dosud', () => {
    const r = odberatelRadku(['Chmeloun', 'Sluhy', null], '');
    expect(r).toEqual(['Chmeloun', 'Sluhy', '']);
    expect(objednavkyZFotky(bezDne(r))).toEqual([
      { odberatel: 'Chmeloun', zavoz: null, polozek: 1 },
      { odberatel: 'Sluhy', zavoz: null, polozek: 1 },
      { odberatel: '', zavoz: null, polozek: 1 },
    ]);
  });

  it('bez odběratele všude = jedna objednávka bez odběratele', () => {
    const r = odberatelRadku([null, null], '  ');
    expect(r).toEqual(['', '']);
    expect(objednavkyZFotky(bezDne(r))).toEqual([{ odberatel: '', zavoz: null, polozek: 2 }]);
  });

  it('lístek bez odběratele: napíšu „Restaurace" na první řádek → jedna objednávka (13. 10. 2026)', () => {
    const r = odberatelRadku(['Restaurace', null, null, '', null], '');
    expect(r).toEqual(['Restaurace', 'Restaurace', 'Restaurace', 'Restaurace', 'Restaurace']);
    expect(objednavkyZFotky(bezDne(r))).toEqual([{ odberatel: 'Restaurace', zavoz: null, polozek: 5 }]);
  });

  it('hlavní odběratel nahoře a stejné jméno jinak psané u řádků = pořád jedna objednávka', () => {
    const r = odberatelRadku(['restaurace ', 'RESTAURACE', null], 'Restaurace');
    expect(new Set(r).size).toBe(1);
    expect(objednavkyZFotky(bezDne(r))).toHaveLength(1);
  });

  it('dva skutečně různí odběratelé zůstanou dvě objednávky', () => {
    expect(objednavkyZFotky(bezDne(odberatelRadku(['Restaurace', 'Obchod', null], '')))).toHaveLength(3);
    expect(objednavkyZFotky(bezDne(odberatelRadku(['Restaurace', 'Obchod'], ''))).map((o) => o.odberatel)).toEqual(['Restaurace', 'Obchod']);
  });
});

describe('zavozRadku — den závozu řádku', () => {
  it('vlastní den má přednost před společným', () => {
    expect(zavozRadku('2026-10-22', '2026-10-20')).toBe('2026-10-22');
  });

  it('řádek bez vlastního dne dostane společný', () => {
    expect(zavozRadku(null, '2026-10-20')).toBe('2026-10-20');
    expect(zavozRadku(undefined, '2026-10-20')).toBe('2026-10-20');
    expect(zavozRadku('', '2026-10-20')).toBe('2026-10-20');
  });

  it('neexistující den se nebere (vlastní → společný, společný → žádný)', () => {
    expect(zavozRadku('2026-02-31', '2026-10-20')).toBe('2026-10-20');
    expect(zavozRadku('22. 10.', '2026-10-20')).toBe('2026-10-20');
    expect(zavozRadku(null, '2026-13-01')).toBeNull();
    expect(zavozRadku('2026-02-31', '')).toBeNull();
  });

  it('bez dne vůbec: žádný den', () => {
    expect(zavozRadku(null, null)).toBeNull();
    expect(zavozRadku(undefined, undefined)).toBeNull();
  });
});

describe('seskupDoObjednavek — odběratel × den závozu', () => {
  const r = (odberatel: string, zavoz?: string | null, extra: Record<string, unknown> = {}) => ({ odberatel, zavoz, ...extra });

  it('stejný odběratel, dva dny = dvě objednávky; každá si nese svůj den a své řádky', () => {
    const s = seskupDoObjednavek([
      r('Restaurace', '2026-10-20', { id: 1 }),
      r('Restaurace', '2026-10-22', { id: 2 }),
      r('Restaurace', '2026-10-20', { id: 3 }),
    ]);
    expect(s.map((x) => [x.odberatel, x.zavoz, x.radky.map((y) => y.id)])).toEqual([
      ['Restaurace', '2026-10-20', [1, 3]],
      ['Restaurace', '2026-10-22', [2]],
    ]);
  });

  it('řádky bez vlastního dne dostanou společný a splynou s řádky, které stejný den mají napsaný', () => {
    const s = seskupDoObjednavek([r('Restaurace', null, { id: 1 }), r('Restaurace', '2026-10-20', { id: 2 }), r('Restaurace', undefined, { id: 3 })], '2026-10-20');
    expect(s).toHaveLength(1);
    expect(s[0].zavoz).toBe('2026-10-20');
    expect(s[0].radky.map((x) => (x as { id: number }).id)).toEqual([1, 2, 3]);
  });

  it('vlastní den jiný než společný je samostatná objednávka, pořadí podle fotky', () => {
    const s = seskupDoObjednavek([r('Obchod', '2026-10-22'), r('Obchod'), r('Restaurace')], '2026-10-20');
    expect(s.map((x) => [x.odberatel, x.zavoz])).toEqual([
      ['Obchod', '2026-10-22'],
      ['Obchod', '2026-10-20'],
      ['Restaurace', '2026-10-20'],
    ]);
  });

  it('bez společného dne a bez vlastních: jedna objednávka bez dne (jako dosud)', () => {
    const s = seskupDoObjednavek([r('Restaurace'), r('Restaurace', null)]);
    expect(s).toEqual([{ odberatel: 'Restaurace', zavoz: null, radky: [r('Restaurace'), r('Restaurace', null)] }]);
  });

  it('jméno psané jinak je tentýž odběratel; jméno bere první výskyt', () => {
    const s = seskupDoObjednavek([r('Restaurace', '2026-10-20'), r(' restaurace ', '2026-10-20'), r('RESTAURACE', '2026-10-20')]);
    expect(s).toHaveLength(1);
    expect(s[0].odberatel).toBe('Restaurace');
    expect(s[0].radky).toHaveLength(3);
  });

  it('různí odběratelé ve stejný den jsou různé objednávky', () => {
    const s = seskupDoObjednavek([r('Restaurace', '2026-10-20'), r('Obchod', '2026-10-20')]);
    expect(s.map((x) => x.odberatel)).toEqual(['Restaurace', 'Obchod']);
  });

  it('neexistující vlastní den se bere jako „bez vlastního" a spadne do společného', () => {
    const s = seskupDoObjednavek([r('Restaurace', '2026-02-31'), r('Restaurace', null)], '2026-10-20');
    expect(s).toHaveLength(1);
    expect(s[0].zavoz).toBe('2026-10-20');
  });

  it('prázdný vstup nezaloží nic', () => {
    expect(seskupDoObjednavek([])).toEqual([]);
  });
});

describe('objednavkyZFotky — náhled „Uloží se jako…" s dny', () => {
  it('počítá položky v objednávce odběratel × den', () => {
    expect(objednavkyZFotky([
      { odberatel: 'Restaurace', zavoz: '2026-10-20' },
      { odberatel: 'Restaurace', zavoz: '2026-10-22' },
      { odberatel: 'Restaurace', zavoz: '2026-10-20' },
      { odberatel: 'Obchod' },
    ], '2026-10-20')).toEqual([
      { odberatel: 'Restaurace', zavoz: '2026-10-20', polozek: 2 },
      { odberatel: 'Restaurace', zavoz: '2026-10-22', polozek: 1 },
      { odberatel: 'Obchod', zavoz: '2026-10-20', polozek: 1 },
    ]);
  });

  it('bez společného dne má řádek bez vlastního dne „žádný den"', () => {
    expect(objednavkyZFotky([{ odberatel: 'Obchod' }, { odberatel: 'Obchod', zavoz: '2026-10-22' }])).toEqual([
      { odberatel: 'Obchod', zavoz: null, polozek: 1 },
      { odberatel: 'Obchod', zavoz: '2026-10-22', polozek: 1 },
    ]);
  });
});

describe('datumKratce', () => {
  it('den v týdnu a datum bez nul a roku', () => {
    expect(datumKratce('2026-10-20')).toBe('Út 20. 10.');
    expect(datumKratce('2026-10-05')).toBe('Po 5. 10.');
    expect(datumKratce('2026-10-17')).toBe('So 17. 10.');
    expect(datumKratce('2026-11-01')).toBe('Ne 1. 11.');
    expect(datumKratce('2026-10-22')).toBe('Čt 22. 10.');
    expect(datumKratce('2026-10-16')).toBe('Pá 16. 10.');
    expect(datumKratce('2026-10-21')).toBe('St 21. 10.');
  });

  it('neexistující datum dá prázdný text', () => {
    expect(datumKratce('2026-02-31')).toBe('');
    expect(datumKratce('')).toBe('');
  });
});

describe('nabidkaDnuZavozu', () => {
  const dny = nabidkaDnuZavozu('2026-10-16');

  it('týden zpátky a dva týdny dopředu od dneška, od nejstaršího (22 dnů)', () => {
    expect(dny).toHaveLength(22);
    expect(dny[0].datum).toBe('2026-10-09');
    expect(dny[7].datum).toBe('2026-10-16');
    expect(dny[21].datum).toBe('2026-10-30');
    expect(dny.map((d) => d.datum)).toEqual([...dny.map((d) => d.datum)].sort());
  });

  it('dnešek a minulé dny jsou v popisku řečeny; budoucí ne', () => {
    expect(dny[7].popisek).toBe('Pá 16. 10. (dnes)');
    expect(dny[6].popisek).toBe('Čt 15. 10. (už proběhl)');
    expect(dny[0].popisek).toBe('Pá 9. 10. (už proběhl)');
    expect(dny[8].popisek).toBe('So 17. 10.');
    expect(dny.filter((d) => d.proslo).map((d) => d.datum)).toEqual(dny.slice(0, 7).map((d) => d.datum));
  });

  it('jsou v něm i víkendy (nedělní závoz)', () => {
    expect(dny.map((d) => d.popisek)).toContain('Ne 18. 10.');
    expect(dny.map((d) => d.popisek)).toContain('Ne 11. 10. (už proběhl)');
  });

  it('přes přelom měsíce a roku', () => {
    const konec = nabidkaDnuZavozu('2026-12-28');
    expect(konec.at(-1)!.datum).toBe('2027-01-11');
    expect(konec.map((d) => d.datum)).toContain('2026-12-31');
    expect(konec.map((d) => d.datum)).toContain('2027-01-01');
    expect(konec.find((d) => d.datum === '2027-01-01')!.popisek).toBe('Pá 1. 1.');
  });

  it('jiný rozsah a neplatný dnešek', () => {
    expect(nabidkaDnuZavozu('2026-10-16', 0, 2).map((d) => d.datum)).toEqual(['2026-10-16', '2026-10-17', '2026-10-18']);
    expect(nabidkaDnuZavozu('chyba')).toEqual([]);
  });
});

describe('zavozZTextuRadku — den napsaný v textu řádku', () => {
  // 16. 10. 2026 je pátek
  it('název dne dá nejbližší takový den od dneška', () => {
    expect(zavozZTextuRadku('2x50 12sv v úterý', '2026-10-16')).toBe('2026-10-20');
    expect(zavozZTextuRadku('na čtvrtek 1x30', '2026-10-16')).toBe('2026-10-22');
    expect(zavozZTextuRadku('v pondělí', '2026-10-16')).toBe('2026-10-19');
  });

  it('dnešní den platí dnes (včetně)', () => {
    expect(zavozZTextuRadku('v pátek 3x30', '2026-10-16')).toBe('2026-10-16');
  });

  it('bez názvu dne, víkend nebo prázdný text: žádný den', () => {
    expect(zavozZTextuRadku('2x50 12sv desitka', '2026-10-16')).toBeNull();
    expect(zavozZTextuRadku('v sobotu', '2026-10-16')).toBeNull();
    expect(zavozZTextuRadku('', '2026-10-16')).toBeNull();
    expect(zavozZTextuRadku(null, '2026-10-16')).toBeNull();
    expect(zavozZTextuRadku(undefined, '2026-10-16')).toBeNull();
  });
});
