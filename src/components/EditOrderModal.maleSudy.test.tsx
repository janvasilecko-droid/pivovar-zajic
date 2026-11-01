// 🛢️ Úprava objednávky a malé sudy (revize 1. 11. 2026): dnešní objednávku T
// odepsal cron po půlnoci, ráno stáčeč naklikal 2× 10 l a objednávka B (čt)
// chce 2× 10 l — K dispozici 0. Zákazník T chce o 2 sudy víc (3 → 5).
// Úprava musí T nechat jeho 3 sudy (v počtu nikdy nebyly) a přidané 2 porovnat
// s K dispozici: „−2× 10l — sudy jen na 3". Dřív úprava T nehlídala vůbec.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ObjednavkaProSudy, OdpocetProSudy, PolozkaProSudy } from '../lib/maleSudy';

// Data hlídání podle scénáře testu (výpočet je skutečný hlidejMaleSudy).
const scenar = vi.hoisted(() => ({
  zasoba: {} as Record<string, number>,
  zadanoKdy: {} as Record<string, { cas: string; den: string }>,
  objednavky: [] as ObjednavkaProSudy[],
  polozky: [] as PolozkaProSudy[],
  dnes: '',
  odepsane: new Set<string>(),
  odpocty: [] as OdpocetProSudy[],
}));

vi.mock('../lib/useMaleSudy', async () => {
  const { hlidejMaleSudy } = await vi.importActual<typeof import('../lib/maleSudy')>('../lib/maleSudy');
  return {
    useMaleSudy: () => ({ zasoba: scenar.zasoba, zadanoKdy: scenar.zadanoKdy, zapocitatPlne: new Set(), nacteno: true, chybiMigrace: false, ulozit: async () => null }),
    useHlidaniMalychSudu: (zasoba: Record<string, number>) => ({
      ...hlidejMaleSudy(zasoba, scenar.objednavky, scenar.polozky, undefined, scenar.dnes, {
        zadano: scenar.zadanoKdy,
        odepsane: scenar.odepsane,
        odpocty: scenar.odpocty,
      }),
      nacteno: true, chybaNacteni: false, jmenaPiv: new Map(),
    }),
  };
});
vi.mock('../lib/supabase', () => ({
  supabase: { from: vi.fn(() => ({ select: () => Promise.resolve({ data: [], error: null }) })) },
}));

import { EditOrderModal } from './EditOrderModal';

const OBJEDNAVKA_T = {
  id: 'T', order_date: '2026-10-26', place_id: null, place_name: 'Hospoda T', source: 'manual', status: 'nova', note: null,
  created_at: '2026-10-26T10:00:00Z', delivery_day: 'ut', delivery_date: '2026-10-27',
  is_prepared: false, is_packaged: false, is_delivered: false, delivered_at: null,
};
const POLOZKY_T = [{
  id: 't1', order_id: 'T', beer_id: 'b10', beer_name: '10° Výčepní', package_id: 'k10', package_label: '10l', quantity: 3, is_prepared: false,
}];

const vykresli = (order: typeof OBJEDNAVKA_T, items: typeof POLOZKY_T) => render(
  <EditOrderModal
    order={order}
    items={items}
    beers={[{ id: 'b10', name: '10° Výčepní' }] as any}
    packages={[{ id: 'k10', label: '10l', kind: 'keg', volume_l: 10 }] as any}
    places={[]}
    onClose={() => {}}
    onSaved={() => {}}
  />,
);

/** Řádek položky (mřížka s pivem, obalem a množstvím) podle zobrazeného množství. */
const radekPolozky = (mnozstvi: string) => screen.getByText(mnozstvi, { selector: 'span' }).closest('div.grid') as HTMLElement;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-10-27T09:00:00Z'));
  scenar.zasoba = { k10: 2 };
  scenar.zadanoKdy = { k10: { cas: '2026-10-27T07:00:00Z', den: '2026-10-27' } };
  scenar.objednavky = [
    { id: 'T', status: 'nova', is_delivered: false, delivery_date: '2026-10-27', created_at: '2026-10-26T10:00:00Z', place_name: 'Hospoda T' },
    { id: 'B', status: 'nova', is_delivered: false, delivery_date: '2026-10-29', created_at: '2026-10-26T11:00:00Z', place_name: 'Hospoda B' },
  ];
  scenar.polozky = [
    { id: 't1', order_id: 'T', package_id: 'k10', quantity: 3, beer_id: 'b10' },
    { id: 'b1', order_id: 'B', package_id: 'k10', quantity: 2, beer_id: 'b10' },
  ];
  scenar.dnes = '2026-10-27';
  scenar.odepsane = new Set(['T']);
  scenar.odpocty = [{ order_id: 'T', order_item_id: 't1', deduct_date: '2026-10-27', created_at: '2026-10-26T23:05:00Z' }];
});
afterEach(() => { vi.useRealTimers(); });

describe('úprava objednávky odepsané před zadáním malých sudů', () => {
  it('původní 3 sudy nesvítí, přidané 2 se porovnají s K dispozici', () => {
    vykresli(OBJEDNAVKA_T, POLOZKY_T);
    expect(screen.getByText('Malé sudy: můžeš dát max 3 (zbývá 0)')).toBeTruthy();
    expect(screen.queryByText(/Nejsou sudy/)).toBeNull();
    const pridat = screen.getByLabelText('Přidat 1');
    fireEvent.click(pridat);
    fireEvent.click(pridat);
    expect(screen.getByText('−2× 10l — sudy jen na 3')).toBeTruthy();
  });
});

// Revize 1. 11. 2026: objednávka, která odjela dřív, než se počet zadal, v počtu
// nikdy nebyla — její úprava je oprava toho, co odvezla, ne nové sudy z prázdných.
describe('úprava objednávky odjeté před dnem zadání', () => {
  it('odjela v pondělí, počet zadán v úterý: úprava 6 → 7 neukáže žádné varování', () => {
    // P odjela v po 26. 10. (odepsaná v noci na pondělí); v út ráno naklikány 2× 10 l, B (čt) je chce obě.
    scenar.objednavky = [
      { id: 'P', status: 'nova', is_delivered: true, delivered_at: '2026-10-25T23:00:00Z', delivery_date: '2026-10-26', created_at: '2026-10-24T10:00:00Z', place_name: 'Hospoda P' },
      scenar.objednavky[1],
    ];
    scenar.polozky = [
      { id: 'p1', order_id: 'P', package_id: 'k10', quantity: 6, beer_id: 'b10' },
      { id: 'b1', order_id: 'B', package_id: 'k10', quantity: 2, beer_id: 'b10' },
    ];
    scenar.odepsane = new Set(['P']);
    scenar.odpocty = [{ order_id: 'P', order_item_id: 'p1', deduct_date: '2026-10-26', created_at: '2026-10-25T23:05:00Z' }];
    const objednavkaP = {
      ...OBJEDNAVKA_T, id: 'P', order_date: '2026-10-24', place_name: 'Hospoda P', created_at: '2026-10-24T10:00:00Z',
      delivery_day: 'po', delivery_date: '2026-10-26', is_delivered: true, delivered_at: '2026-10-25T23:00:00Z',
    };
    vykresli(objednavkaP, [{ ...POLOZKY_T[0], id: 'p1', order_id: 'P', quantity: 6 }]);
    fireEvent.click(screen.getByLabelText('Přidat 1'));
    expect(screen.queryByText(/Malé sudy/)).toBeNull();
    expect(screen.queryByText(/sudy jen na/)).toBeNull();
    expect(screen.queryByText(/Nejsou sudy/)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    // Řádek bez obarvení (zelená / oranžová / červená).
    expect(radekPolozky('7').className).not.toMatch(/bg-emerald-50|bg-amber-100|bg-rose-50/);
  });

  it('objednávka z minulého týdne u obalu bez zadání v tomto týdnu (hranice pondělí): bez varování', () => {
    // Tento týden zadaný jen 20 l; 10 l je doplněný nulou (hlídaný, bez času zadání).
    scenar.zasoba = { k10: 0, k20: 2 };
    scenar.zadanoKdy = { k20: { cas: '2026-10-26T07:00:00Z', den: '2026-10-26' } };
    scenar.objednavky = [
      { id: 'S', status: 'nova', is_delivered: true, delivery_date: '2026-10-23', created_at: '2026-10-21T10:00:00Z', place_name: 'Hospoda S' },
    ];
    scenar.polozky = [{ id: 's1', order_id: 'S', package_id: 'k10', quantity: 2, beer_id: 'b10' }];
    scenar.odepsane = new Set(['S']);
    scenar.odpocty = [{ order_id: 'S', order_item_id: 's1', deduct_date: '2026-10-23', created_at: '2026-10-22T22:05:00Z' }];
    const objednavkaS = {
      ...OBJEDNAVKA_T, id: 'S', order_date: '2026-10-21', place_name: 'Hospoda S', created_at: '2026-10-21T10:00:00Z',
      delivery_day: 'pa', delivery_date: '2026-10-23', is_delivered: true, delivered_at: '2026-10-22T22:00:00Z',
    };
    vykresli(objednavkaS, [{ ...POLOZKY_T[0], id: 's1', order_id: 'S', quantity: 2 }]);
    fireEvent.click(screen.getByLabelText('Přidat 1'));
    expect(screen.queryByText(/Malé sudy/)).toBeNull();
    expect(screen.queryByText(/sudy jen na|Nejsou sudy/)).toBeNull();
    expect(radekPolozky('3').className).not.toMatch(/bg-emerald-50|bg-amber-100|bg-rose-50/);
  });
});
