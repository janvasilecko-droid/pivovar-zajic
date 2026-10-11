// Ořezání historie v Pohybech (11. 10. 2026, simulace růstu dat): stav ke
// KAŽDÉMU dni od „den před obdobím" dál musí vyjít stejně z celé historie
// i z ořezané — jinak by Pohyby ukazovaly jiné číslo než Sklad.
import { describe, it, expect } from 'vitest';
import { buildMovements, stockAsOf, stockAtStartOfDay } from './stockLedger';
import { pohybyBezStareHistorie } from './pohybySkladu';

function gen(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const posun = (iso: string, d: number) => { const x = new Date(iso + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10); };

function data() {
  const rnd = gen(42); const c = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
  const piva = ['b1', 'b2', 'b3', 'b4']; const obaly = ['k50', 'k30', 'l05', 'pet'];
  const inv: any[] = [], keg: any[] = [], bot: any[] = [], fas: any[] = [], zav: any[] = [], adj: any[] = [], pre: any[] = [];
  for (let d = 0; d < 300; d++) {
    const den = posun('2026-01-01', d);
    if (den.endsWith('-01')) for (const b of piva) for (const o of obaly) if (rnd() < 0.8) inv.push({ entry_date: den, beer_id: b, package_id: o, quantity: c(0, 50), note: 'Počáteční stav' });
    if (den.endsWith('-28')) for (const b of piva) for (const o of obaly) if (rnd() < 0.3) inv.push({ entry_date: den, beer_id: b, package_id: o, quantity: c(0, 50), note: 'Fyzická inventura' });
    for (let i = 0; i < 4; i++) keg.push({ entry_date: den, beer_id: piva[c(0, 3)], package_id: obaly[c(0, 3)], quantity: c(1, 9), created_at: `k${d}-${i}` });
    for (let i = 0; i < 2; i++) bot.push({ entry_date: den, beer_id: piva[c(0, 3)], package_id: 'l05', quantity: c(10, 80), kegs_used: c(1, 2), kegs_used_package_id: 'k50', created_at: `b${d}-${i}` });
    for (let i = 0; i < 3; i++) fas.push({ entry_date: den, beer_id: piva[c(0, 3)], package_id: obaly[c(0, 3)], quantity: c(1, 4) });
    for (let i = 0; i < 3; i++) zav.push({ deduct_date: den, beer_id: piva[c(0, 3)], package_id: obaly[c(0, 3)], quantity: c(1, 6), order_id: `o${d}${i}` });
    if (rnd() < 0.2) adj.push({ entry_date: den, beer_id: piva[c(0, 3)], package_id: obaly[c(0, 3)], quantity: c(-3, 3) || 1, reason: 'Dorovnání' });
    if (rnd() < 0.1) pre.push({ entry_date: den, beer_id: piva[0], from_package_id: 'k50', from_count: 1, to_package_id: 'k30', to_count: 2 });
  }
  return buildMovements({
    inventoryRows: inv, keggingRows: keg, bottlingRows: bot, fasovaniRows: fas, zavozDeductionRows: zav, adjustmentRows: adj, prefukRows: pre,
    packages: obaly.map((id) => ({ id, kind: id.startsWith('k') ? 'keg' : 'bottle', volume_l: 50 })) as any,
  });
}

describe('pohybyBezStareHistorie', () => {
  const pohyby = data();

  it('ořezaná historie je kratší a stavy ke všem dnům od „den před obdobím" sedí s celou', () => {
    for (const od of ['2026-03-01', '2026-06-29', '2026-09-28', '2026-10-01', '2026-02-14']) {
      const ore = pohybyBezStareHistorie(pohyby, od);
      expect(ore.length).toBeLessThanOrEqual(pohyby.length);
      for (let i = -1; i <= 40; i++) {
        const den = posun(od, i);
        expect(stockAsOf(ore, den)).toEqual(stockAsOf(pohyby, den));
      }
      expect(stockAtStartOfDay(ore, od)).toEqual(stockAtStartOfDay(pohyby, od));
    }
  });

  it('opravdu zahodí starou historii (jinak by to nic neušetřilo)', () => {
    const ore = pohybyBezStareHistorie(pohyby, '2026-10-01');
    expect(ore.length).toBeLessThan(pohyby.length * 0.5);
  });

  it('bez inventury před obdobím nic nezahodí', () => {
    const jenPohyby = pohyby.filter((m) => m.kind !== 'inventura');
    expect(pohybyBezStareHistorie(jenPohyby, '2026-10-01')).toBe(jenPohyby);
  });
});
