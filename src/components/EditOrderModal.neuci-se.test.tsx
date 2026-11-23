// Úprava hotové objednávky nesmí nic „učit" čtečku objednávek.
//
// Do 23. 11. 2026 se při každé změně piva nebo obalu v tomhle okně potichu
// uložila „naučená zkratka" (tabulka parser_aliases) — klíčem byl NÁZEV z katalogu,
// takže vznikla pravidla „30l → 1 l" (13×), „0.5l → 1 l", „50l → 30 l". Čtečka
// je pak dostávala jako nápovědu a obaly ve zprávách četla špatně.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const stav = vi.hoisted(() => ({
  tabulky: [] as string[],
  zapisy: [] as { tabulka: string; akce: string }[],
  rpc: vi.fn(async (..._a: unknown[]) => ({ error: null })),
}));

vi.mock('../lib/supabase', () => {
  const dotaz = (tabulka: string) => {
    const q: Record<string, any> = {};
    for (const m of ['select', 'eq', 'in', 'order', 'limit', 'range', 'not']) q[m] = () => q;
    for (const akce of ['insert', 'update', 'upsert', 'delete']) q[akce] = () => { stav.zapisy.push({ tabulka, akce }); return q; };
    q.maybeSingle = () => Promise.resolve({ data: null, error: null });
    q.single = () => Promise.resolve({ data: null, error: null });
    q.then = (ok: (v: unknown) => unknown, chyba?: (e: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok, chyba);
    return q;
  };
  const supabase = {
    from: vi.fn((tabulka: string) => { stav.tabulky.push(tabulka); return dotaz(tabulka); }),
    rpc: (...args: unknown[]) => stav.rpc(...args),
  };
  return { supabase, fetchAllRows: (tabulka: string) => supabase.from(tabulka).select() };
});
vi.mock('../lib/useMaleSudy', async () => {
  const { hlidejMaleSudy } = await vi.importActual<typeof import('../lib/maleSudy')>('../lib/maleSudy');
  return {
    useMaleSudy: () => ({ zasoba: {}, zadanoKdy: {}, zapocitatPlne: new Set(), nacteno: true, chybiMigrace: false, ulozit: async () => null }),
    useHlidaniMalychSudu: (zasoba: Record<string, number>) => ({
      ...hlidejMaleSudy(zasoba, [], [], undefined, '2026-11-23', { zadano: {}, odepsane: new Set(), odpocty: [] }),
      nacteno: true, chybaNacteni: false, jmenaPiv: new Map(),
    }),
  };
});

import { EditOrderModal } from './EditOrderModal';

const OBJEDNAVKA = {
  id: 'T1', order_date: '2026-11-23', place_id: 'p1', place_name: 'Hospoda Test', source: 'whatsapp', status: 'nova', note: null,
  created_at: '2026-11-23T08:00:00Z', delivery_day: 'st', delivery_date: '2026-11-25',
  is_prepared: false, is_packaged: false, is_delivered: false, delivered_at: null,
};
const POLOZKY = [{
  id: 'i1', order_id: 'T1', beer_id: 'b12', beer_name: '12° Světlá', package_id: 'k30', package_label: '30l', quantity: 20, is_prepared: false,
}];
const PIVA = [{ id: 'b12', name: '12° Světlá', degree: '12°' }, { id: 'bj', name: 'Jantar', degree: null }];
const OBALY = [{ id: 'k30', label: '30l', kind: 'keg', volume_l: 30 }, { id: 'l1', label: '1l', kind: 'bottle', volume_l: 1 }];

beforeEach(() => {
  stav.tabulky = [];
  stav.zapisy = [];
  stav.rpc.mockClear();
  localStorage.clear();
});

describe('EditOrderModal — změna piva a obalu nic neučí', () => {
  it('z „30l" změněného na 1 l nevznikne naučená zkratka — uloží se jen objednávka', async () => {
    const onSaved = vi.fn();
    render(
      <EditOrderModal
        order={OBJEDNAVKA as any}
        items={POLOZKY as any}
        beers={PIVA as any}
        packages={OBALY as any}
        places={[{ id: 'p1', name: 'Hospoda Test' }] as any}
        onClose={vi.fn()}
        onSaved={onSaved}
      />,
    );
    fireEvent.change(screen.getByLabelText('Obal'), { target: { value: 'l1' } });
    fireEvent.change(screen.getByLabelText('Pivo'), { target: { value: 'bj' } });
    fireEvent.click(screen.getByRole('button', { name: 'Uložit změny' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));

    // Objednávka se uložila se změněnou položkou…
    expect(stav.rpc).toHaveBeenCalledTimes(1);
    const [nazev, parametry] = stav.rpc.mock.calls[0] as [string, { p_items: { beer_id: string; package_id: string }[] }];
    expect(nazev).toBe('replace_order_with_items');
    expect(parametry.p_items).toMatchObject([{ beer_id: 'bj', package_id: 'l1' }]);
    // …a nic dalšího: žádná naučená zkratka v databázi ani v prohlížeči.
    await new Promise((r) => setTimeout(r, 0));
    expect(stav.tabulky).not.toContain('parser_aliases');
    expect(stav.zapisy).toEqual([]);
    expect(localStorage.getItem('user_learned_aliases')).toBeNull();
  });
});
