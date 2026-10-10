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
import { chyba, potvrd } from '../lib/toast';

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

// 10. 10. 2026: „vyřezal jsem 11ku z 12ky z tanku a z 10ky, ale část 10ky šla ze sudů
// 1×30, 1×20 a 1×15 ze skladu — nevím, jak to zapsat."
describe('Řezání se sudy ze skladu', () => {
  const obalySudy: any[] = [
    { id: 'k50', label: 'KEG 50l', kind: 'keg', volume_l: 50 }, { id: 'k30', label: 'KEG 30l', kind: 'keg', volume_l: 30 },
    { id: 'k20', label: 'KEG 20l', kind: 'keg', volume_l: 20 }, { id: 'k15', label: 'KEG 15l', kind: 'keg', volume_l: 15 },
  ];
  const pivaSudy: any[] = [{ id: 'b12', name: '12° Světlá' }, { id: 'b11', name: '11° Světlá' }, { id: 'b10', name: '10° Desítka' }];
  const tankySudy: any[] = [
    { id: 't1', label: 'Tank 12°', status: 'active', current_beer_id: 'b12', current_beer_name: '12° Světlá', current_volume_l: 1000 },
    { id: 't2', label: 'Tank 10°', status: 'active', current_beer_id: 'b10', current_beer_name: '10° Desítka', current_volume_l: 500 },
  ];

  beforeEach(() => { zapisy.length = 0; rpc.mockClear(); (chyba as any).mockClear(); (potvrd as any).mockClear(); });

  function vykresliSudy(skladKusu?: (b: string, p: string) => number) {
    const onUlozeno = vi.fn();
    render(<RezaniPiva beers={pivaSudy} kegPackages={obalySudy} cellarTanks={tankySudy} mesicUzamcen={() => false} skladKusu={skladKusu} onUlozeno={onUlozeno} />);
    fireEvent.change(screen.getByLabelText('Tank A'), { target: { value: 't1' } });
    fireEvent.change(screen.getByLabelText('Pivo (co jde do sudů)'), { target: { value: 'b11' } });
    // stočeno 2× KEG 50 + 1× KEG 30 = 130 l
    fireEvent.change(screen.getByLabelText('Počet KEG 50l'), { target: { value: '2' } });
    fireEvent.click(screen.getByLabelText('Více KEG 30l'));
    // sudy ze skladu: desítka 1× 30 + 1× 20 + 1× 15 = 65 l
    fireEvent.change(screen.getByLabelText('Pivo ze sudů ze skladu'), { target: { value: 'b10' } });
    fireEvent.click(screen.getByLabelText('Více KEG 30l ze skladu'));
    fireEvent.click(screen.getByLabelText('Více KEG 20l ze skladu'));
    fireEvent.click(screen.getByLabelText('Více KEG 15l ze skladu'));
    return onUlozeno;
  }

  it('12° z tanku + 10° jen ze sudů ze skladu: tank B netřeba, sudy se odečtou ze skladu přefukem do řezu', async () => {
    const onUlozeno = vykresliSudy();
    fireEvent.click(screen.getByText('50/50'));
    expect(screen.getByText(/Celkem/).textContent).toContain('130 l');
    expect(screen.getByText(/Celkem/).textContent).toContain('sudy ze skladu 65 l');
    fireEvent.click(screen.getByText('Uložit řez'));
    await waitFor(() => expect(onUlozeno).toHaveBeenCalled());

    // stočená 11° do sudů, 12° z tanku A (polovina litrů)
    const kegging = zapisy.find((z) => z.tabulka === 'kegging')!.data;
    expect(kegging).toEqual([
      expect.objectContaining({ beer_id: 'b11', package_id: 'k50', quantity: 2, cellar_tank_id: 't1', source_volume_l: 50, note: 'Řez: Tank 12° 50 % + sudy ze skladu 50 % (65 l)' }),
      expect.objectContaining({ package_id: 'k30', quantity: 1, cellar_tank_id: 't1', source_volume_l: 15 }),
    ]);
    // z tanku B se nic nebere
    expect(zapisy.filter((z) => z.tabulka === 'cellar_transfers')).toEqual([]);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('adjust_tank_volume', { p_tank_id: 't1', p_delta_l: -65 });
    // sudy ze skladu: přefuk bez cílového obalu, navázaný na první řádek řezu
    const prefuk = zapisy.find((z) => z.tabulka === 'keg_prefuk')!.data as any[];
    expect(prefuk.map((r) => [r.from_package_id, r.from_count, r.to_package_id, r.to_count, r.beer_id])).toEqual([
      ['k30', 1, null, 0, 'b10'], ['k20', 1, null, 0, 'b10'], ['k15', 1, null, 0, 'b10'],
    ]);
    expect(prefuk[0].note).toContain('[rez:k1]');
  });

  it('sudy nestačí na celý podíl B: zbytek se vezme z tanku B, poměrně k řádkům', async () => {
    const onUlozeno = vykresliSudy();
    fireEvent.change(screen.getByLabelText('Tank B'), { target: { value: 't2' } });
    fireEvent.change(screen.getByLabelText('Poměr — tank A %'), { target: { value: '40' } }); // A 52 l, B 78 l = sudy 65 + z tanku 13
    expect(screen.getByText(/Celkem/).textContent).toContain('z Tank 10° 13 l');
    fireEvent.click(screen.getByText('Uložit řez'));
    await waitFor(() => expect(onUlozeno).toHaveBeenCalled());
    const preliti = zapisy.filter((z) => z.tabulka === 'cellar_transfers').map((z) => z.data);
    expect(preliti.map((p: any) => [p.from_tank_id, p.volume_l])).toEqual([['t2', 10], ['t2', 3]]);
    expect(rpc).toHaveBeenCalledWith('adjust_tank_volume', { p_tank_id: 't2', p_delta_l: -10 });
    expect(rpc).toHaveBeenCalledWith('adjust_tank_volume', { p_tank_id: 't2', p_delta_l: -3 });
    expect(zapisy.find((z) => z.tabulka === 'keg_prefuk')).toBeTruthy();
  });

  it('sudů ze skladu je víc než podíl B: nic se neuloží', async () => {
    vykresliSudy();
    fireEvent.click(screen.getByText('80/20')); // B jen 26 l, sudy 65 l
    fireEvent.click(screen.getByText('Uložit řez'));
    await waitFor(() => expect(chyba).toHaveBeenCalled());
    expect((chyba as any).mock.calls[0][0]).toMatch(/Sudy ze skladu \(65 l\) jsou víc než podíl B/);
    expect(zapisy).toHaveLength(0);
  });

  it('na skladě není dost sudů: zeptá se, a když řekneš ne, nezapíše nic', async () => {
    (potvrd as any).mockResolvedValueOnce(false);
    vykresliSudy(() => 0);
    fireEvent.click(screen.getByText('50/50'));
    fireEvent.click(screen.getByText('Uložit řez'));
    await waitFor(() => expect(potvrd).toHaveBeenCalled());
    expect((potvrd as any).mock.calls[0][0]).toContain('KEG 30l je 0, chce se 1');
    expect(zapisy).toHaveLength(0);
  });

  it('u sudů se ukazuje, kolik jich je na skladě', () => {
    vykresliSudy((b, p) => (b === 'b10' && p === 'k30' ? 3 : 0));
    expect(screen.getByText('na skladě 3')).toBeTruthy();
  });

  it('bez sudů ze skladu a bez tanku B se řez pořád neuloží (původní chování)', async () => {
    render(<RezaniPiva beers={pivaSudy} kegPackages={obalySudy} cellarTanks={tankySudy} mesicUzamcen={() => false} onUlozeno={() => {}} />);
    fireEvent.change(screen.getByLabelText('Tank A'), { target: { value: 't1' } });
    fireEvent.change(screen.getByLabelText('Počet KEG 50l'), { target: { value: '2' } });
    fireEvent.click(screen.getByText('Uložit řez'));
    await waitFor(() => expect(chyba).toHaveBeenCalled());
    expect((chyba as any).mock.calls[0][0]).toMatch(/Vyber oba tanky/);
    expect(zapisy).toHaveLength(0);
  });
});
