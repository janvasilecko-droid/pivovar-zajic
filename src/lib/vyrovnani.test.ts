import { describe, expect, it } from 'vitest';
import { jeVyrovnani, vyrovnaniZaMesic } from './vyrovnani';
import { buildMovements, stockKey } from './stockLedger';

const B = 'pivo';
const KEG50 = 'keg50';
const LAHEV1 = 'lahev1';
const packages = [{ id: KEG50, kind: 'keg', volume_l: 50 }];

describe('jeVyrovnani', () => {
  it('pozná doplněný přebytek i odečtené manko', () => {
    expect(jeVyrovnani('Doplněno z inventury 2026-08 — 50l (přebytek 6 ks)', '2026-08')).toBe(true);
    expect(jeVyrovnani('Odečteno z inventury 2026-08 — 30l (manko -3 ks)', '2026-08')).toBe(true);
  });

  it('běžnou výrobu za vyrovnání nepovažuje', () => {
    expect(jeVyrovnani(null, '2026-08')).toBe(false);
    expect(jeVyrovnani('', '2026-08')).toBe(false);
    expect(jeVyrovnani('Proplach cest: NaOH 2%', '2026-08')).toBe(false);
    expect(jeVyrovnani('38-12-1l\n56-12-1.5l', '2026-08')).toBe(false);
  });

  it('zápis z jiného měsíce se do tohohle nepočítá', () => {
    // Jinak by se u položky srovnávané opakovaně sečetly všechny měsíce.
    expect(jeVyrovnani('Doplněno z inventury 2026-07 — 50l (přebytek 6 ks)', '2026-08')).toBe(false);
  });
});

describe('vyrovnaniZaMesic', () => {
  it('doplněné stočení má kladné znaménko, odečtené záporné', () => {
    const mv = buildMovements({
      packages,
      keggingRows: [
        { beer_id: B, package_id: KEG50, entry_date: '2026-08-31', quantity: 6, note: 'Doplněno z inventury 2026-08 — 50l (přebytek 6 ks)' },
        { beer_id: B, package_id: KEG50, entry_date: '2026-08-31', quantity: -2, note: 'Odečteno z inventury 2026-08 — 50l (manko -2 ks)' },
      ],
    });
    expect(vyrovnaniZaMesic(mv, '2026-08').get(stockKey(B, KEG50))).toBe(4);
  });

  it('běžná výroba se do vyrovnání nepočítá', () => {
    const mv = buildMovements({
      packages,
      keggingRows: [
        { beer_id: B, package_id: KEG50, entry_date: '2026-08-18', quantity: 8, note: 'Proplach cest: NaOH 2%' },
        { beer_id: B, package_id: KEG50, entry_date: '2026-08-31', quantity: 6, note: 'Doplněno z inventury 2026-08 — 50l (přebytek 6 ks)' },
      ],
    });
    expect(vyrovnaniZaMesic(mv, '2026-08').get(stockKey(B, KEG50))).toBe(6);
  });

  it('SUDY ODEČTENÉ KVŮLI SROVNÁNÍ LAHVÍ se objeví na sudovém řádku', () => {
    // Tohle bylo dřív nejhůř dohledatelné: srovnání se dělá na řádku lahví,
    // ale ubyde kvůli němu sud — a na sudovém řádku po tom nezůstala stopa.
    const mv = buildMovements({
      packages,
      bottlingRows: [{
        beer_id: B, package_id: LAHEV1, entry_date: '2026-08-31', quantity: 717,
        kegs_used: 17, kegs_used_package_id: KEG50, created_at: 'x',
        note: 'Doplněno z inventury 2026-08 — 1l z 50l sudů (dávka)',
      }],
    });
    const v = vyrovnaniZaMesic(mv, '2026-08');
    expect(v.get(stockKey(B, LAHEV1))).toBe(717);
    expect(v.get(stockKey(B, KEG50))).toBe(-17);
  });

  it('u položky bez srovnání nevrací nic — nula a „nesrovnávalo se" jsou dvě věci', () => {
    const mv = buildMovements({
      packages,
      keggingRows: [{ beer_id: B, package_id: KEG50, entry_date: '2026-08-18', quantity: 8 }],
    });
    expect(vyrovnaniZaMesic(mv, '2026-08').has(stockKey(B, KEG50))).toBe(false);
  });

  it('srovnání z jiného měsíce se nezapočítá', () => {
    const mv = buildMovements({
      packages,
      keggingRows: [{ beer_id: B, package_id: KEG50, entry_date: '2026-07-31', quantity: 6, note: 'Doplněno z inventury 2026-07 — 50l (přebytek 6 ks)' }],
    });
    expect(vyrovnaniZaMesic(mv, '2026-08').has(stockKey(B, KEG50))).toBe(false);
    expect(vyrovnaniZaMesic(mv, '2026-07').get(stockKey(B, KEG50))).toBe(6);
  });
});
