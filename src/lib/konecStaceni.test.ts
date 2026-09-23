// Značka „konec stáčení hotový" — podle ní databáze pozná, jestli má večer
// poslat připomínku (zadání 22. 9. 2026).
import { describe, it, expect } from 'vitest';
import { jeKonecHotov, polozkyKonce, sZnackouKonce, KONEC_HOTOVO } from './konecStaceni';

const ITEMS = [
  { id: 'start_1', category: '1. Začátek stáčení', required: true },
  { id: 'end_1', category: '2. Konec stáčení', required: true },
  { id: 'end_2', category: '2. Konec stáčení', required: true },
  { id: 'week_1', category: '3. Týdenní kontrola', required: true },
  { id: 'month_1', category: '4. Měsíční údržba', required: true },
];

describe('polozkyKonce', () => {
  it('vybere jen sekci konce stáčení', () => {
    expect(polozkyKonce(ITEMS).map((i) => i.id)).toEqual(['end_1', 'end_2']);
  });
});

describe('jeKonecHotov', () => {
  it('hotovo až když jsou odškrtnuté všechny kroky konce', () => {
    expect(jeKonecHotov(ITEMS, { end_1: true })).toBe(false);
    expect(jeKonecHotov(ITEMS, { end_1: true, end_2: true })).toBe(true);
  });

  it('začátek, týdenní ani měsíční kroky o tom nerozhodují', () => {
    // Všechno ostatní hotové, úklid ne → pořád nehotovo.
    expect(jeKonecHotov(ITEMS, { start_1: true, week_1: true, month_1: true })).toBe(false);
    // Úklid hotový, zbytek ne → hotovo.
    expect(jeKonecHotov(ITEMS, { end_1: true, end_2: true })).toBe(true);
  });

  it('volba (text) se počítá jako splněná — KEG sanitace NaOH/Persteril', () => {
    const sVolbou = [
      { id: 'keg_end_1', category: '2. Konec stáčení', required: true },
      { id: 'keg_end_2', category: '2. Konec stáčení', required: true },
    ];
    expect(jeKonecHotov(sVolbou, { keg_end_1: 'NaOH', keg_end_2: true })).toBe(true);
    expect(jeKonecHotov(sVolbou, { keg_end_1: '', keg_end_2: true })).toBe(false);
  });

  it('prázdná sekce se nepovažuje za splněnou', () => {
    expect(jeKonecHotov([{ id: 'start_1', category: '1. Začátek stáčení' }], {})).toBe(false);
  });

  it('odškrtnutý krok značku zase sundá', () => {
    expect(jeKonecHotov(ITEMS, { end_1: true, end_2: false })).toBe(false);
  });
});

describe('sZnackouKonce', () => {
  it('přidá značku, původní mapu nemění', () => {
    const puvodni = { end_1: true, end_2: true };
    const nova = sZnackouKonce(ITEMS, puvodni);
    expect(nova[KONEC_HOTOVO]).toBe(true);
    expect(KONEC_HOTOVO in puvodni).toBe(false);
  });

  it('nehotový konec značku uloží jako nesplněnou, ať se v databázi smaže', () => {
    expect(sZnackouKonce(ITEMS, { end_1: true })[KONEC_HOTOVO]).toBe(false);
  });
});
