// Úprava objednávky a výčep v poznámce (test výčepů 5. 11. 2026).
//
// Okno rezervace výčepu má tlačítko „Přeskočit (nerezervovat)“. V úpravě
// objednávky se ale po přeskočení výčep TIŠE zarezervoval sám — přesně proti
// popisku. Přeskočit musí znamenat, že se nezarezervuje nic.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { TapReservation } from '../screens/VycepyScreen';

const stav = vi.hoisted(() => ({
  ulozene: [] as any[],
  rpc: vi.fn(async () => ({ error: null })),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({ select: () => Promise.resolve({ data: [], error: null }) })),
    rpc: (...args: unknown[]) => (stav.rpc as any)(...args),
  },
}));
vi.mock('../lib/useMaleSudy', async () => {
  const { hlidejMaleSudy } = await vi.importActual<typeof import('../lib/maleSudy')>('../lib/maleSudy');
  return {
    useMaleSudy: () => ({ zasoba: {}, zadanoKdy: {}, zapocitatPlne: new Set(), nacteno: true, chybiMigrace: false, ulozit: async () => null }),
    useHlidaniMalychSudu: (zasoba: Record<string, number>) => ({
      ...hlidejMaleSudy(zasoba, [], [], undefined, '2026-11-05', { zadano: {}, odepsane: new Set(), odpocty: [] }),
      nacteno: true, chybaNacteni: false, jmenaPiv: new Map(),
    }),
  };
});
vi.mock('../lib/vycepyData', () => ({
  nactiVycepy: vi.fn(async () => [{ id: 'tap-a', name: 'Výčep A', tap_type: 'jednokohout', status: 'clean' }]),
  nactiRezervace: vi.fn(async () => []),
  ulozRezervaci: vi.fn(async (r: TapReservation) => { stav.ulozene.push(r); return null; }),
}));

import { EditOrderModal } from './EditOrderModal';

const objednavka = (note: string | null) => ({
  id: 'T1', order_date: '2026-11-05', place_id: 'p1', place_name: 'Hospoda Test', source: 'manual', status: 'nova', note,
  created_at: '2026-11-04T10:00:00Z', delivery_day: 'ct', delivery_date: '2026-11-12',
  is_prepared: false, is_packaged: false, is_delivered: false, delivered_at: null,
});
const POLOZKY = [{
  id: 'i1', order_id: 'T1', beer_id: 'b10', beer_name: '10° Výčepní', package_id: 'k10', package_label: '10l', quantity: 3, is_prepared: false,
}];

function otevri(note: string | null) {
  const onSaved = vi.fn();
  const onClose = vi.fn();
  render(
    <EditOrderModal
      order={objednavka(note)}
      items={POLOZKY}
      beers={[{ id: 'b10', name: '10° Výčepní' }] as any}
      packages={[{ id: 'k10', label: '10l', kind: 'keg', volume_l: 10 }] as any}
      places={[{ id: 'p1', name: 'Hospoda Test' }] as any}
      onClose={onClose}
      onSaved={onSaved}
    />,
  );
  return { onSaved, onClose };
}

beforeEach(() => {
  stav.ulozene = [];
  stav.rpc.mockClear();
  localStorage.clear();
});

describe('EditOrderModal — výčep v poznámce', () => {
  it('bez zmínky o výčepu se okno rezervace neotevře a objednávka se uloží', async () => {
    const { onSaved } = otevri('doveze řidič');
    fireEvent.click(screen.getByRole('button', { name: 'Uložit změny' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Rezervace výčepu k objednávce')).toBeNull();
    expect(stav.ulozene).toHaveLength(0);
  });

  it('se zmínkou o výčepu se po uložení objednávky otevře okno rezervace', async () => {
    const { onSaved } = otevri('+ výčep dvoukohout');
    fireEvent.click(screen.getByRole('button', { name: 'Uložit změny' }));
    expect(await screen.findByText('Rezervace výčepu k objednávce')).toBeTruthy();
    // Objednávka je uložená, ale okno se zavře až po rozhodnutí o výčepu.
    expect(stav.rpc).toHaveBeenCalledTimes(1);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('„Přeskočit (nerezervovat)“ nerezervuje nic — a objednávka je přesto uložená a okno se zavře', async () => {
    const { onSaved, onClose } = otevri('+ výčep');
    fireEvent.click(screen.getByRole('button', { name: 'Uložit změny' }));
    await screen.findByText('Výčep A');
    fireEvent.click(screen.getByRole('button', { name: /Přeskočit \(nerezervovat\)/ }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(stav.ulozene).toHaveLength(0);
  });

  it('potvrzení rezervuje výčep k této objednávce a pak se okno zavře', async () => {
    const { onSaved, onClose } = otevri('+ výčep');
    fireEvent.click(screen.getByRole('button', { name: 'Uložit změny' }));
    await screen.findByText('Výčep A');
    fireEvent.click(screen.getByRole('button', { name: /Zarezervovat výčep/ }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(stav.ulozene).toHaveLength(1);
    expect(stav.ulozene[0]).toMatchObject({ order_id: 'T1', tap_id: 'tap-a', customer_name: 'Hospoda Test', date_from: '2026-11-05' });
  });

  it('když se rezervace nepodaří uložit, okno zůstane otevřené a objednávka se nezavře', async () => {
    const { ulozRezervaci } = await import('../lib/vycepyData');
    (ulozRezervaci as any).mockResolvedValueOnce('permission denied');
    const { onSaved } = otevri('+ výčep');
    fireEvent.click(screen.getByRole('button', { name: 'Uložit změny' }));
    await screen.findByText('Výčep A');
    fireEvent.click(screen.getByRole('button', { name: /Zarezervovat výčep/ }));
    expect(await screen.findByText(/Rezervaci se nepodařilo uložit.*permission denied/)).toBeTruthy();
    expect(onSaved).not.toHaveBeenCalled();
  });
});
