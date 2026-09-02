import { describe, it, expect } from 'vitest';
import {
  sestavAudit, obdobiAuditu, zacatekTydne,
  kontrolaFronty, kontrolaKeggingBezTanku, kontrolaNezavezenych,
  kontrolaPrazdnychObjednavek, kontrolaZapornehoSkladu, kontrolaSkladVsInventura,
  kontrolaZahozenych, kontrolaNezpracovanych, kontrolaNeznamychPolozek,
  type VstupAuditu,
} from './hloubkovyAudit';
import { buildMovements, expectedForMonth, stockForMonth } from './stockLedger';

const OBDOBI = { od: '2026-08-31', do: '2026-09-06', mesic: '2026-09' };
const prazdny: VstupAuditu = { ...OBDOBI };

describe('období auditu', () => {
  it('týden začíná pondělím a končí nedělí', () => {
    // 2026-09-02 je středa
    expect(zacatekTydne('2026-09-02')).toBe('2026-08-31');
    expect(obdobiAuditu('tyden', '2026-09-02')).toMatchObject({ od: '2026-08-31', do: '2026-09-06' });
  });

  it('neděle patří do týdne, který začal minulé pondělí — ne do dalšího', () => {
    // Klasický překlep: JS má neděli jako den 0, takže se bez korekce
    // posune o den dopředu a nedělní zápisy vypadnou z auditu.
    expect(zacatekTydne('2026-09-06')).toBe('2026-08-31');
  });

  it('měsíc jde od prvního do posledního dne', () => {
    expect(obdobiAuditu('mesic', '2026-09-02')).toEqual({ od: '2026-09-01', do: '2026-09-30', mesic: '2026-09' });
    // Únor i přestupný rok
    expect(obdobiAuditu('mesic', '2026-02-10').do).toBe('2026-02-28');
  });
});

describe('fronta neodeslaných', () => {
  it('prázdná fronta je v pořádku', () => {
    expect(kontrolaFronty(prazdny).zavaznost).toBe('ok');
  });

  it('cokoli ve frontě je chyba — je to neviditelná objednávka', () => {
    const n = kontrolaFronty({ ...prazdny, neodeslaneCeka: 3 });
    expect(n.zavaznost).toBe('chyba');
    expect(n.pocet).toBe(3);
  });
});

describe('stáčení KEG bez tanku', () => {
  const radek = (entry_date: string, cellar_tank_id: string | null) =>
    ({ entry_date, beer_id: 'p1', package_id: 'o1', quantity: 5, cellar_tank_id });

  it('zápis s tankem projde', () => {
    expect(kontrolaKeggingBezTanku({ ...prazdny, kegging: [radek('2026-09-01', 't1')] }).zavaznost).toBe('ok');
  });

  it('zápis bez tanku je chyba — objem se neodečte ze sklepa', () => {
    const n = kontrolaKeggingBezTanku({ ...prazdny, kegging: [radek('2026-09-01', null)] });
    expect(n.zavaznost).toBe('chyba');
    expect(n.pocet).toBe(1);
  });

  it('zápisy mimo období se nepočítají', () => {
    // Jinak by týdenní audit hlásil pořád dokola i chyby ze starých měsíců
    // a nikdo by ho po druhé nepustil.
    expect(kontrolaKeggingBezTanku({ ...prazdny, kegging: [radek('2026-07-01', null)] }).zavaznost).toBe('ok');
  });
});

describe('objednávky', () => {
  const obj = (o: Partial<any>) => ({
    id: 'x', place_name: 'Hospoda', order_date: '2026-09-01',
    delivery_date: '2026-09-01', status: 'nova', pocetPolozek: 1, ...o,
  });

  it('objednávka bez položek je chyba', () => {
    const n = kontrolaPrazdnychObjednavek({ ...prazdny, objednavky: [obj({ pocetPolozek: 0 })] });
    expect(n.zavaznost).toBe('chyba');
  });

  it('stornovaná objednávka bez položek nevadí', () => {
    const n = kontrolaPrazdnychObjednavek({ ...prazdny, objednavky: [obj({ pocetPolozek: 0, status: 'storno' })] });
    expect(n.zavaznost).toBe('ok');
  });

  it('nezavezená objednávka po termínu se hlásí', () => {
    const n = kontrolaNezavezenych({ ...prazdny, objednavky: [obj({ delivery_date: '2026-09-01' })] }, '2026-09-02');
    expect(n.zavaznost).toBe('pozor');
  });

  it('objednávka na dnešek ještě není po termínu', () => {
    const n = kontrolaNezavezenych({ ...prazdny, objednavky: [obj({ delivery_date: '2026-09-02' })] }, '2026-09-02');
    expect(n.zavaznost).toBe('ok');
  });

  it('vyřízená objednávka se nehlásí, i když je termín pryč', () => {
    const n = kontrolaNezavezenych(
      { ...prazdny, objednavky: [obj({ delivery_date: '2026-09-01', status: 'vyrizeno_zavoz' })] },
      '2026-09-02',
    );
    expect(n.zavaznost).toBe('ok');
  });
});

describe('zprávy', () => {
  it('duplicita na bráně není problém — tak se pozná dvojí doručení', () => {
    const n = kontrolaZahozenych({
      ...prazdny,
      prijemLog: [{ created_at: '2026-09-01T10:00:00Z', vysledek: 'duplicita' }],
    });
    expect(n.zavaznost).toBe('ok');
  });

  it('zpráva zahozená filtrem se hlásí i s radou o whitelistu', () => {
    const n = kontrolaZahozenych({
      ...prazdny,
      prijemLog: [{ created_at: '2026-09-01T10:00:00Z', vysledek: 'zahozeno_filtr', sender_name: 'Nová hospoda' }],
    });
    expect(n.zavaznost).toBe('pozor');
    expect(n.rada).toMatch(/odesílatel/i);
  });

  it('zpráva ve stavu error je chyba, pending jen pozor', () => {
    const z = (status: string) => ({ id: '1', sender_name: 'A', created_at: '2026-09-01T10:00:00Z', status });
    expect(kontrolaNezpracovanych({ ...prazdny, zpravy: [z('pending')] }).zavaznost).toBe('pozor');
    expect(kontrolaNezpracovanych({ ...prazdny, zpravy: [z('error')] }).zavaznost).toBe('chyba');
    expect(kontrolaNezpracovanych({ ...prazdny, zpravy: [z('imported')] }).zavaznost).toBe('ok');
  });
});

describe('neznámé pivo nebo obal', () => {
  it('zápis na smazané pivo je chyba — do skladu se nezapočítá', () => {
    const n = kontrolaNeznamychPolozek({
      ...prazdny,
      znamaPiva: new Set(['p1']),
      znameObaly: new Set(['o1']),
      kegging: [{ entry_date: '2026-09-01', beer_id: 'ZMIZELO', package_id: 'o1', quantity: 3 }],
    });
    expect(n.zavaznost).toBe('chyba');
  });
});

describe('sklad', () => {
  it('záporný stav se hlásí jako chyba', () => {
    const skl = new Map([['p1__o1', { key: 'p1__o1', beer_id: 'p1', package_id: 'o1', qty: -4, baselineDate: null, baselineQty: 0, byKind: {} }]]);
    const n = kontrolaZapornehoSkladu({ ...prazdny, skladLedger: skl as any, popisPolozky: () => '12° Světlá 50l' });
    expect(n.zavaznost).toBe('chyba');
    expect(n.detaily[0]).toContain('12° Světlá 50l');
  });

  it('Sklad a Inventura ze stejné knihy musí vyjít stejně', () => {
    // Tohle je smysl celé kontroly: obě strany počítají z jedněch dat, jen
    // jinou funkcí. Bez uložené fyzické inventury se nesmí lišit.
    const pohyby = buildMovements({
      inventoryRows: [{ beer_id: 'p1', package_id: 'o1', quantity: 10, entry_date: '2026-09-01', note: 'Počáteční stav' }],
      keggingRows: [{ beer_id: 'p1', package_id: 'o1', quantity: 5, entry_date: '2026-09-10' }],
    });
    const n = kontrolaSkladVsInventura({
      ...prazdny,
      inventuraLedger: expectedForMonth(pohyby, '2026-09'),
      skladLedger: stockForMonth(pohyby, '2026-09'),
    });
    expect(n.zavaznost).toBe('ok');
  });
});

describe('sestavAudit', () => {
  it('vrátí řádek za KAŽDOU kontrolu, i za tu, co dopadla dobře', () => {
    // Zelené řádky jsou důvod, proč je to kontrolní tabulka a ne seznam
    // problémů — před uzávěrkou je potřeba vidět, co všechno se prověřilo.
    const v = sestavAudit(prazdny, new Date('2026-09-02T12:00:00Z'));
    expect(v.nalezy.length).toBeGreaterThanOrEqual(13);
    expect(v.chyb + v.pozor + v.ok).toBe(v.nalezy.length);
  });

  it('celková závažnost je ta nejhorší nalezená', () => {
    const cisty = sestavAudit({ ...prazdny, tepMostu: { naposledy: new Date().toISOString(), pripojeno: true }, posledniPrijem: new Date().toISOString() });
    expect(cisty.celkem).toBe('ok');

    const sChybou = sestavAudit({ ...prazdny, neodeslaneCeka: 1, tepMostu: { naposledy: new Date().toISOString(), pripojeno: true }, posledniPrijem: new Date().toISOString() });
    expect(sChybou.celkem).toBe('chyba');
  });

  it('každá kontrola má vlastní stabilní id — jinak se nedá porovnat vývoj', () => {
    const v = sestavAudit(prazdny);
    const ids = v.nalezy.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
