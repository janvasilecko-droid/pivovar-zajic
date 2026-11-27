// Sklad → Pohyby: řádek „Úprava skladu" s číslem a rozdílem (majitel 27. 11. 2026): „když se zadá Úprava skladu,
// objeví se tam úprava skladu — číslo, rozdíl (zpětným dofasováním se zmenšuje), ale stav skladu je daný úpravou
// a od té doby se počítá s tímhle číslem." Data jsou vymyšlená; dnes je v testu čtvrtek 26. 11. 2026.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { buildMovements } from '../lib/stockLedger';

const h = vi.hoisted(() => ({ pohyby: [] as any[] }));

vi.mock('../lib/businessDate', () => ({ businessDateISO: () => '2026-11-26' }));
vi.mock('../lib/chybyHlaseni', () => ({ zalogujANahlas: vi.fn() }));
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => {
      const q: any = { select: () => q, gte: () => q, lte: () => q, order: () => q, limit: () => Promise.resolve({ data: [], error: null }) };
      return q;
    },
  },
  useRealtime: () => {},
  fetchAllRows: () => Promise.resolve({ data: [], error: null }),
  beerBg: vi.fn(() => '#f59e0b'),
  beerText: vi.fn(() => 'text-white'),
  formatPackageLabel: vi.fn((l: string) => l),
}));
vi.mock('../lib/skladovaKnihaData', () => ({
  nactiSkladovouKnihu: () => Promise.resolve({
    piva: [{ id: 'b8', name: '8° Lehká' }],
    obaly: [{ id: 'l1', label: 'PET 1l', kind: 'bottle', volume_l: 1 }],
    pohyby: h.pohyby,
    kegging: [], bottling: [], inventura: [], fasovani: [], odpisy: [], zavozy: [],
  }),
}));

import PohybySkladu from './PohybySkladu';

const radek = (datum: string, quantity: number, note: string, created_at?: string) =>
  ({ entry_date: datum, beer_id: 'b8', package_id: 'l1', quantity, note, ...(created_at ? { created_at } : {}) });

beforeEach(() => {
  localStorage.clear();
  h.pohyby = buildMovements({
    inventoryRows: [
      radek('2026-11-16', 60, 'Počáteční stav'),
      radek('2026-11-24', 0, 'Týdenní inventura týdne 2026-11-23 (konec dne)', '2026-11-24T08:00:00Z'),
    ],
    bottlingRows: [{ entry_date: '2026-11-18', beer_id: 'b8', package_id: 'l1', quantity: 20 }],
    zavozDeductionRows: [{ deduct_date: '2026-11-25', beer_id: 'b8', package_id: 'l1', quantity: 4, order_id: 'o1' }],
  });
});

describe('PohybySkladu — Úprava skladu: číslo, rozdíl a stav od ní', () => {
  it('řádek „Úprava skladu" ukáže napočítané číslo, živý rozdíl a stav po ní; vnitřní poznámka se neukáže', async () => {
    render(<PohybySkladu />);
    const radekUpravy = await screen.findByTestId('radek-pocitani');
    expect(within(radekUpravy).getByText('Úprava skladu')).toBeTruthy();
    expect(radekUpravy.textContent).toContain('= 0'); // číslo
    // 60 + 20 = 80 podle evidence, napočítáno 0 → ztráta 80.
    expect(within(radekUpravy).getByTestId('rozdil-pocitani').textContent).toMatch(/rozdíl −80 · podle evidence bylo 80/);
    expect(radekUpravy.textContent).toMatch(/na skladě\s*0/);
    expect(radekUpravy.textContent).not.toMatch(/Týdenní inventura týdne/);
    expect(radekUpravy.textContent).not.toMatch(/pozn\.:/);
  });

  it('po Úpravě se počítá s napočítaným číslem dál (závoz −4 → −4 na skladě), nic se nevrací ke starému číslu', async () => {
    render(<PohybySkladu />);
    await screen.findByTestId('radek-pocitani');
    await waitFor(() => expect(document.body.textContent).toMatch(/Zavezeno na objednávku/));
    // Závoz 25. 11. po Úpravě z 24. 11. (stav 0) → −4.
    expect(document.body.textContent).toMatch(/−4Zavezeno na objednávku[\s\S]*na skladě-4/);
  });

  it('souhrn jedné položky mluví o Úpravě skladu a stavu od ní, ne o „inventuře"', async () => {
    render(<PohybySkladu />);
    await screen.findByTestId('radek-pocitani');
    const text = document.body.textContent ?? '';
    expect(text).toMatch(/\(Úprava skladu v období\)/);
    expect(text).toMatch(/Úprava skladu 24\. 11\.: napočítáno 0; rozdíl proti evidenci v období -80\. Stav skladu je daný napočítaným číslem a počítá se od něj dál\./);
    expect(text).toMatch(/Út 24\. 11\.Úprava skladu = 0/);
    expect(text).not.toMatch(/inventura = |inventura v období/);
  });

  it('sedí-li počítání, řádek řekne „sedělo"', async () => {
    h.pohyby = buildMovements({
      inventoryRows: [
        radek('2026-11-16', 60, 'Počáteční stav'),
        radek('2026-11-24', 80, 'Týdenní inventura týdne 2026-11-23 (konec dne)', '2026-11-24T08:00:00Z'),
      ],
      bottlingRows: [{ entry_date: '2026-11-18', beer_id: 'b8', package_id: 'l1', quantity: 20 }],
    });
    render(<PohybySkladu />);
    const radekUpravy = await screen.findByTestId('radek-pocitani');
    expect(within(radekUpravy).getByTestId('rozdil-pocitani').textContent).toMatch(/^sedělo · podle evidence bylo 80/);
  });

  it('měsíční inventura zůstává „Inventura" (s poznámkou), ne „Úprava skladu"', async () => {
    h.pohyby = buildMovements({
      inventoryRows: [
        radek('2026-11-16', 60, 'Počáteční stav'),
        radek('2026-11-24', 50, 'Schválená inventura'),
      ],
    });
    render(<PohybySkladu />);
    const radekUpravy = await screen.findByTestId('radek-pocitani');
    expect(within(radekUpravy).getByText('Inventura')).toBeTruthy();
    expect(radekUpravy.textContent).toMatch(/pozn\.: Schválená inventura/);
    expect(within(radekUpravy).getByTestId('rozdil-pocitani').textContent).toMatch(/rozdíl −10/);
  });
});
