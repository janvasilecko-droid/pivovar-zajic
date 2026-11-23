// Sklep → přehled tanků: pivo v tanku je výrazná plaketa v barvě piva
// (23. 11. 2026: „v přehledu sklep jak je tank 8, tank 7 atd… udělej ať je
// výrazněji vidět, co tam je za pivo, moc to splývá s tím textem").
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';

const h = vi.hoisted(() => ({ DB: {} as Record<string, any[]> }));

vi.mock('../lib/supabase', async (puvodni) => {
  const skutecny = await puvodni<typeof import('../lib/supabase')>();
  type Filtr = (r: any) => boolean;
  function dotaz(tabulka: string) {
    const filtry: Filtr[] = [];
    const vysledek = () => ({ data: (h.DB[tabulka] ?? []).filter((r) => filtry.every((f) => f(r))), error: null });
    const q: any = {
      then: (ok: any, ko: any) => Promise.resolve(vysledek()).then(ok, ko),
      single: () => Promise.resolve({ data: vysledek().data[0] ?? null, error: null }),
      maybeSingle: () => Promise.resolve({ data: vysledek().data[0] ?? null, error: null }),
      eq: (k: string, v: unknown) => { filtry.push((r) => r[k] === v); return q; },
      in: (k: string, vs: unknown[]) => { filtry.push((r) => vs.includes(r[k])); return q; },
    };
    for (const m of ['select', 'order', 'limit', 'not', 'or', 'neq', 'gte', 'lte', 'gt', 'lt', 'is', 'filter']) q[m] = () => q;
    return q;
  }
  const supabase = {
    from: vi.fn((t: string) => {
      const q = dotaz(t);
      q.insert = (payload: any) => {
        const nove = (Array.isArray(payload) ? payload : [payload]).map((r: any, i: number) => ({ id: `nove-${t}-${i}`, ...r }));
        h.DB[t] = [...(h.DB[t] ?? []), ...nove];
        return { select: () => Promise.resolve({ data: nove, error: null }), then: (ok: any) => Promise.resolve({ data: null, error: null }).then(ok) };
      };
      q.update = () => { const u: any = { eq: () => u, then: (ok: any) => Promise.resolve({ data: null, error: null }).then(ok) }; return u; };
      return q;
    }),
    rpc: vi.fn(async () => ({ data: null, error: null })),
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } } })) },
  };
  return { ...skutecny, supabase, fetchAllRows: vi.fn((t: string) => dotaz(t)), useRealtime: vi.fn() };
});
vi.mock('../lib/auth', () => ({
  useAuth: () => ({ profile: { role: 'admin', display_name: 'Test' }, user: { id: 'u1', email: 'test@example.cz' } }),
}));
vi.mock('../lib/usePlanStaceni', () => ({
  usePlanStaceni: () => ({ data: null, chyba: false, zPameti: false, planySudy: [], planyLahve: [], nacti: async () => {}, puvodMinusu: () => [] }),
}));

import CellarScreen from './Cellar';

const tank = (label: string, extra: Record<string, unknown> = {}) => ({
  id: `t-${label.replace(' ', '')}`, label, capacity_l: label.startsWith('Spilka') ? 8000 : 7500, current_volume_l: 0, status: 'empty',
  current_beer_id: null, current_beer_name: null, started_at: null, initial_volume_l: null, kegging_active: false, ...extra,
});
const PIVA = [
  { id: 'b-12', name: '12° Světlý ležák', beer_color: '#F59E0B', is_active: true, sort_order: 1 },
  { id: 'b-jan', name: 'Jantar', beer_color: '#540f0f', is_active: true, sort_order: 2 },
  { id: 'b-bez', name: 'Jarní speciál', beer_color: null, is_active: true, sort_order: 3 },
];

beforeEach(() => {
  localStorage.clear();
  const vsechny = [1, 2, 3].map((i) => tank(`Spilka ${i}`)).concat([1, 2, 3, 4].map((i) => tank(`Tank ${i}`)));
  h.DB = {
    cellar_tanks: [
      ...vsechny,
      tank('Tank 5'),
      tank('Tank 6', { status: 'active', current_beer_id: 'b-bez', current_beer_name: 'Jarní speciál', current_volume_l: 3000, initial_volume_l: 3000 }),
      tank('Tank 7', { status: 'emptying', current_beer_id: 'b-jan', current_beer_name: 'Jantar', current_volume_l: 1900, initial_volume_l: 3700 }),
      tank('Tank 8', { status: 'active', current_beer_id: 'b-12', current_beer_name: '12° Světlý ležák', current_volume_l: 4200, initial_volume_l: 7000 }),
    ],
    beers: PIVA.map((p) => ({ ...p })),
    packages: [], cellar_transfers: [], cellar_tank_cycles: [], kegging: [],
  };
});

const kartaTanku = (label: string) => screen.getByText(label, { selector: 'div.font-display' }).closest('.card') as HTMLElement;
async function otevri() {
  render(<CellarScreen />);
  await screen.findAllByTestId('pivo-v-tanku');
}

describe('Sklep — pivo v tanku', () => {
  it('u každého tanku s pivem je velká plaketa s názvem; prázdný tank má „— prázdno —"', async () => {
    await otevri();
    expect(screen.getAllByTestId('pivo-v-tanku')).toHaveLength(3);
    expect(within(kartaTanku('Tank 8')).getByTestId('pivo-v-tanku').textContent).toBe('12° Světlý ležák');
    expect(within(kartaTanku('Tank 7')).getByTestId('pivo-v-tanku').textContent).toBe('Jantar');
    expect(within(kartaTanku('Tank 5')).getByTestId('pivo-v-tanku-prazdno').textContent).toBe('— prázdno —');
    expect(within(kartaTanku('Tank 5')).queryByTestId('pivo-v-tanku')).toBeNull();
  });

  it('plaketa má barvu piva z katalogu a stejnou barvu má rámeček karty', async () => {
    await otevri();
    const t8 = kartaTanku('Tank 8');
    expect(within(t8).getByTestId('pivo-v-tanku').style.backgroundColor).toBe('rgb(245, 158, 11)');
    expect(t8.style.borderColor).toBe('rgb(245, 158, 11)');
    const t7 = kartaTanku('Tank 7');
    expect(within(t7).getByTestId('pivo-v-tanku').style.backgroundColor).toBe('rgb(84, 15, 15)');
    // tmavé pivo = světlé písmo
    expect(within(t7).getByTestId('pivo-v-tanku').className).toContain('text-white');
    expect(within(t8).getByTestId('pivo-v-tanku').className).toContain('text-[#451f10]');
  });

  it('pivo bez uložené barvy má neutrální plaketu (ne barvu jiného piva)', async () => {
    await otevri();
    const plaketa = within(kartaTanku('Tank 6')).getByTestId('pivo-v-tanku');
    expect(plaketa.textContent).toBe('Jarní speciál');
    expect(plaketa.className).toContain('bg-primary-50');
    expect(plaketa.style.backgroundColor).toBe('');
  });

  it('pivo se hledá podle id, ne jen podle jména: přejmenované pivo v katalogu drží barvu', async () => {
    h.DB.cellar_tanks = h.DB.cellar_tanks.map((t) => (t.label === 'Tank 8' ? { ...t, current_beer_name: 'Starý název 12°' } : t));
    await otevri();
    const t8 = kartaTanku('Tank 8');
    expect(within(t8).getByTestId('pivo-v-tanku').textContent).toBe('Starý název 12°');
    expect(within(t8).getByTestId('pivo-v-tanku').style.backgroundColor).toBe('rgb(245, 158, 11)');
  });

  it('jméno piva už není podruhé v drobném textu pod plaketou; zbývá objem a „Změnit pivo"', async () => {
    await otevri();
    const t8 = kartaTanku('Tank 8');
    expect(within(t8).getAllByText('12° Světlý ležák')).toHaveLength(1);
    expect(within(t8).getByText(/Počáteční objem:/).textContent).toContain('70.00 hl');
    expect(within(t8).getByRole('button', { name: 'Změnit pivo' })).toBeTruthy();
    await waitFor(() => expect(within(kartaTanku('Tank 5')).getByRole('button', { name: 'Nastavit pivo' })).toBeTruthy());
  });
});
