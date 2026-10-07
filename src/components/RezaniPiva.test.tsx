// Zadání 7. 10. 2026: „Přidej do stáčení záložku řezání, kde můžu vybrat
// tanky a pivo, poměr, když řežu pivo ze 2 tanků."
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const zapisy: { tabulka: string; akce: string; data: any }[] = [];
const rpc = vi.fn(async () => ({ error: null }));
vi.mock('../lib/businessDate', () => ({ businessDateISO: () => '2026-10-07' }));
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (tabulka: string) => ({
      insert: (data: any) => {
        zapisy.push({ tabulka, akce: 'insert', data });
        const rows = (Array.isArray(data) ? data : [data]).map((r: any, i: number) => ({ id: `k${i + 1}`, ...r }));
        const vysledek = { data: rows, error: null };
        return Object.assign(Promise.resolve(vysledek), { select: async () => vysledek });
      },
      update: (data: any) => ({ eq: async () => { zapisy.push({ tabulka, akce: 'update', data }); return { error: null }; } }),
    }),
    rpc: (...a: any[]) => (rpc as any)(...a),
  },
}));
vi.mock('../lib/toast', () => ({ chyba: vi.fn(), oznam: vi.fn(), potvrd: vi.fn(async () => true), uspech: vi.fn() }));

import RezaniPiva from './RezaniPiva';
import { chyba } from '../lib/toast';

const tanky: any[] = [
  { id: 't1', label: 'Tank 1', status: 'active', current_beer_id: 'b12', current_beer_name: '12° Světlá', current_volume_l: 1000 },
  { id: 't2', label: 'Tank 2', status: 'emptying', current_beer_id: 'b12', current_beer_name: '12° Světlá', current_volume_l: 500 },
  { id: 't3', label: 'Tank 3', status: 'empty', current_beer_id: null, current_beer_name: null, current_volume_l: 0 },
];
const obaly: any[] = [{ id: 'k50', label: 'KEG 50l', kind: 'keg', volume_l: 50 }, { id: 'k30', label: 'KEG 30l', kind: 'keg', volume_l: 30 }];
const piva: any[] = [{ id: 'b12', name: '12° Světlá' }];

describe('Řezání ze dvou tanků', () => {
  beforeEach(() => { zapisy.length = 0; rpc.mockClear(); (chyba as any).mockClear(); });

  it('zapíše sudy k tanku A s jeho podílem a podíl B odečte z tanku B', async () => {
    const onUlozeno = vi.fn();
    render(<RezaniPiva beers={piva} kegPackages={obaly} cellarTanks={tanky} mesicUzamcen={() => false} onUlozeno={onUlozeno} />);
    // Prázdný tank se nenabízí.
    expect((screen.getByLabelText('Tank A') as HTMLSelectElement).options.length).toBe(3);
    fireEvent.change(screen.getByLabelText('Tank A'), { target: { value: 't1' } });
    fireEvent.change(screen.getByLabelText('Tank B'), { target: { value: 't2' } });
    expect((screen.getByLabelText('Pivo (co jde do sudů)') as HTMLSelectElement).value).toBe('b12');
    fireEvent.click(screen.getByText('60/40'));
    fireEvent.change(screen.getByLabelText('Počet KEG 50l'), { target: { value: '2' } });
    fireEvent.click(screen.getByLabelText('Více KEG 30l'));
    expect(screen.getByText(/Celkem/).textContent).toContain('130 l');
    fireEvent.click(screen.getByText('Uložit řez'));
    await waitFor(() => expect(onUlozeno).toHaveBeenCalled());

    const kegging = zapisy.find((z) => z.tabulka === 'kegging')!.data;
    expect(kegging).toEqual([
      expect.objectContaining({ beer_id: 'b12', package_id: 'k50', quantity: 2, cellar_tank_id: 't1', source_volume_l: 60, note: 'Řez: Tank 1 60 % + Tank 2 40 %' }),
      expect.objectContaining({ package_id: 'k30', quantity: 1, cellar_tank_id: 't1', source_volume_l: 18 }),
    ]);
    const preliti = zapisy.filter((z) => z.tabulka === 'cellar_transfers').map((z) => z.data);
    expect(preliti).toEqual([
      expect.objectContaining({ from_tank_id: 't2', to_tank_id: null, volume_l: 40, note: expect.stringContaining('[rez:k1]') }),
      expect.objectContaining({ from_tank_id: 't2', volume_l: 12, note: expect.stringContaining('[rez:k2]') }),
    ]);
    expect(rpc).toHaveBeenCalledWith('adjust_tank_volume', { p_tank_id: 't2', p_delta_l: -40 });
    expect(rpc).toHaveBeenCalledWith('adjust_tank_volume', { p_tank_id: 't2', p_delta_l: -12 });
    expect(rpc).toHaveBeenCalledWith('adjust_tank_volume', { p_tank_id: 't1', p_delta_l: -78 });
  });

  it('přečerpaný tank B: nic se neuloží', async () => {
    render(<RezaniPiva beers={piva} kegPackages={obaly} cellarTanks={tanky} mesicUzamcen={() => false} onUlozeno={() => {}} />);
    fireEvent.change(screen.getByLabelText('Tank A'), { target: { value: 't1' } });
    fireEvent.change(screen.getByLabelText('Tank B'), { target: { value: 't2' } });
    fireEvent.click(screen.getByText('50/50'));
    fireEvent.change(screen.getByLabelText('Počet KEG 50l'), { target: { value: '30' } });
    fireEvent.click(screen.getByText('Uložit řez'));
    await waitFor(() => expect(chyba).toHaveBeenCalled());
    expect((chyba as any).mock.calls[0][0]).toMatch(/Tank 2 by se přečerpal/);
    expect(zapisy).toHaveLength(0);
    expect(rpc).not.toHaveBeenCalled();
  });
});
