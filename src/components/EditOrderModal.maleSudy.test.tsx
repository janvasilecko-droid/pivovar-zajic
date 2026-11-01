// 🛢️ Úprava objednávky a malé sudy (revize 1. 11. 2026): dnešní objednávku T
// odepsal cron po půlnoci, ráno stáčeč naklikal 2× 10 l a objednávka B (čt)
// chce 2× 10 l — K dispozici 0. Zákazník T chce o 2 sudy víc (3 → 5).
// Úprava musí T nechat jeho 3 sudy (v počtu nikdy nebyly) a přidané 2 porovnat
// s K dispozici: „−2× 10l — sudy jen na 3". Dřív úprava T nehlídala vůbec.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../lib/useMaleSudy', async () => {
  const { hlidejMaleSudy } = await vi.importActual<typeof import('../lib/maleSudy')>('../lib/maleSudy');
  const zadanoKdy = { k10: { cas: '2026-10-27T07:00:00Z', den: '2026-10-27' } };
  const objednavky = [
    { id: 'T', status: 'nova', is_delivered: false, delivery_date: '2026-10-27', created_at: '2026-10-26T10:00:00Z', place_name: 'Hospoda T' },
    { id: 'B', status: 'nova', is_delivered: false, delivery_date: '2026-10-29', created_at: '2026-10-26T11:00:00Z', place_name: 'Hospoda B' },
  ];
  const polozky = [
    { id: 't1', order_id: 'T', package_id: 'k10', quantity: 3, beer_id: 'b10' },
    { id: 'b1', order_id: 'B', package_id: 'k10', quantity: 2, beer_id: 'b10' },
  ];
  return {
    useMaleSudy: () => ({ zasoba: { k10: 2 }, zadanoKdy, zapocitatPlne: new Set(), nacteno: true, chybiMigrace: false, ulozit: async () => null }),
    useHlidaniMalychSudu: (zasoba: Record<string, number>) => ({
      ...hlidejMaleSudy(zasoba, objednavky, polozky, undefined, '2026-10-27', {
        zadano: zadanoKdy,
        odepsane: new Set(['T']),
        odpocty: [{ order_id: 'T', order_item_id: 't1', deduct_date: '2026-10-27', created_at: '2026-10-26T23:05:00Z' }],
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

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-10-27T09:00:00Z'));
});
afterEach(() => { vi.useRealTimers(); });

describe('úprava objednávky odepsané před zadáním malých sudů', () => {
  it('původní 3 sudy nesvítí, přidané 2 se porovnají s K dispozici', () => {
    render(
      <EditOrderModal
        order={OBJEDNAVKA_T}
        items={POLOZKY_T}
        beers={[{ id: 'b10', name: '10° Výčepní' }] as any}
        packages={[{ id: 'k10', label: '10l', kind: 'keg', volume_l: 10 }] as any}
        places={[]}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );
    expect(screen.getByText('Malé sudy: můžeš dát max 3 (zbývá 0)')).toBeTruthy();
    expect(screen.queryByText(/Nejsou sudy/)).toBeNull();
    const pridat = screen.getByLabelText('Přidat 1');
    fireEvent.click(pridat);
    fireEvent.click(pridat);
    expect(screen.getByText('−2× 10l — sudy jen na 3')).toBeTruthy();
  });
});
