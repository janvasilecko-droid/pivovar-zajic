// 🔄 VraceniPiva — pojistka proti tichému zahození nedokončeného řádku.
//
// Z provozu 24. 9. 2026: „1x50 8 tam je, ale kdyz to nevidim tak nevim
// zda se propsali i tmavy a 12." Vrátil tři piva, ale jen jedno se
// doopravdy zapsalo — zbylé dva řádky „jiné pivo" měly něco vyplněné
// (pivo i počet), ale ne úplně všechno (chyběl obal), a `platneVraceni()`
// je tiše vynechala ze zápisu. Uložit proběhlo bez chyby, jen s méně
// položkami, než uživatel zadal.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { VraceniPiva } from './VraceniPiva';
import type { Beer, Package } from '../../lib/supabase';

const inserted: any[] = [];
let selectResult: { data: any[]; error: null } = { data: [], error: null };

vi.mock('../../lib/supabase', async () => {
  const actual = await vi.importActual<any>('../../lib/supabase');
  return {
    ...actual,
    supabase: {
      from: (table: string) => ({
        select: () => ({
          gte: () => ({
            like: () => ({
              order: () => ({
                order: () => ({
                  limit: () => Promise.resolve(selectResult),
                }),
              }),
            }),
          }),
        }),
        insert: (rows: any[]) => { inserted.push({ table, rows }); return Promise.resolve({ error: null }); },
      }),
    },
  };
});

const beers: Beer[] = [
  { id: 'b1', name: 'Osma 8°', short_name: null, degree: '8°', color: null, beer_color: null, price_per_liter: null, is_active: true, sort_order: 1, created_at: '' },
  { id: 'b2', name: '12° Světlé', short_name: null, degree: '12°', color: null, beer_color: null, price_per_liter: null, is_active: true, sort_order: 2, created_at: '' },
  { id: 'b3', name: 'Tmavé', short_name: null, degree: '11°', color: null, beer_color: null, price_per_liter: null, is_active: true, sort_order: 3, created_at: '' },
];
const packages: Package[] = [
  { id: 'p50', label: 'KEG 50l', volume_l: 50, kind: 'keg', sort_order: 1 } as Package,
  { id: 'p30', label: 'KEG 30l', volume_l: 30, kind: 'keg', sort_order: 2 } as Package,
];

function vykresli() {
  return render(
    <VraceniPiva
      orders={[]} items={{}} beers={beers} packages={packages} places={[]}
      onZpet={vi.fn()} onChanged={vi.fn()}
    />,
  );
}

describe('VraceniPiva — neúplný ruční řádek se nezahodí potichu', () => {
  beforeEach(() => {
    inserted.length = 0;
    selectResult = { data: [], error: null };
  });

  it('tři přidané řádky, jen jeden úplný — Uložit je zamčené, dokud se nedoplní zbylé dva', async () => {
    vykresli();
    await waitFor(() => expect(screen.queryByText('Za posledních třicet dní se nic nevrátilo.')).toBeTruthy());

    // „Od koho" — bez objednávky, jménem.
    fireEvent.change(screen.getByPlaceholderText('od koho se pivo vrátilo'), { target: { value: 'Lužec' } });

    // Tři řádky „jiné pivo".
    fireEvent.click(screen.getByText('Přidat jiné pivo'));
    fireEvent.click(screen.getByText('Přidat jiné pivo'));
    fireEvent.click(screen.getByText('Přidat jiné pivo'));

    const pivoSelecty = screen.getAllByLabelText('Pivo');
    const obalSelecty = screen.getAllByLabelText('Obal');
    const pocetInputy = screen.getAllByLabelText('Počet');
    expect(pivoSelecty).toHaveLength(3);

    // Řádek 1 — ÚPLNÝ: 1× KEG 50l Osma 8°.
    fireEvent.change(pivoSelecty[0], { target: { value: 'b1' } });
    fireEvent.change(obalSelecty[0], { target: { value: 'p50' } });
    fireEvent.change(pocetInputy[0], { target: { value: '1' } });

    // Řádek 2 — NEÚPLNÝ: 12° Světlé, počet, ale ZAPOMENUTÝ obal.
    fireEvent.change(pivoSelecty[1], { target: { value: 'b2' } });
    fireEvent.change(pocetInputy[1], { target: { value: '1' } });

    // Řádek 3 — NEÚPLNÝ: Tmavé, ZAPOMENUTÝ počet.
    fireEvent.change(pivoSelecty[2], { target: { value: 'b3' } });
    fireEvent.change(obalSelecty[2], { target: { value: 'p30' } });

    // Varování je vidět a jmenuje počet řádků.
    expect(screen.getByText(/2 řádky „jiné pivo" výš nemá vyplněné/)).toBeTruthy();

    const ulozit = screen.getByText('Uložit vrácení').closest('button')!;
    expect(ulozit).toBeDisabled();

    // I přes zamčené tlačítko: kdyby se přesto zavolalo uloz() (např. Enter
    // ve formuláři), nesmí se nic zapsat s jen jedním ze tří řádků.
    fireEvent.click(ulozit);
    expect(inserted).toHaveLength(0);
  });

  it('po doplnění všech řádků se Uložit odemkne a zapíšou se všechny tři položky', async () => {
    vykresli();
    await waitFor(() => expect(screen.queryByText('Za posledních třicet dní se nic nevrátilo.')).toBeTruthy());

    fireEvent.change(screen.getByPlaceholderText('od koho se pivo vrátilo'), { target: { value: 'Lužec' } });
    fireEvent.click(screen.getByText('Přidat jiné pivo'));
    fireEvent.click(screen.getByText('Přidat jiné pivo'));
    fireEvent.click(screen.getByText('Přidat jiné pivo'));

    const pivoSelecty = screen.getAllByLabelText('Pivo');
    const obalSelecty = screen.getAllByLabelText('Obal');
    const pocetInputy = screen.getAllByLabelText('Počet');

    fireEvent.change(pivoSelecty[0], { target: { value: 'b1' } });
    fireEvent.change(obalSelecty[0], { target: { value: 'p50' } });
    fireEvent.change(pocetInputy[0], { target: { value: '1' } });

    fireEvent.change(pivoSelecty[1], { target: { value: 'b2' } });
    fireEvent.change(obalSelecty[1], { target: { value: 'p30' } });
    fireEvent.change(pocetInputy[1], { target: { value: '1' } });

    fireEvent.change(pivoSelecty[2], { target: { value: 'b3' } });
    fireEvent.change(obalSelecty[2], { target: { value: 'p30' } });
    fireEvent.change(pocetInputy[2], { target: { value: '1' } });

    expect(screen.queryByText(/nemá vyplněné/)).toBeNull();
    const ulozit = screen.getByText('Uložit vrácení').closest('button')!;
    expect(ulozit).not.toBeDisabled();

    fireEvent.click(ulozit);
    await waitFor(() => expect(inserted).toHaveLength(1));
    expect(inserted[0].table).toBe('inventory_adjustments');
    expect(inserted[0].rows).toHaveLength(3);
    expect(inserted[0].rows.map((r: any) => r.beer_id).sort()).toEqual(['b1', 'b2', 'b3']);
  });

  it('rozepsaný neúplný řádek je vizuálně orámovaný, ať je vidět na první pohled', async () => {
    vykresli();
    await waitFor(() => expect(screen.queryByText('Za posledních třicet dní se nic nevrátilo.')).toBeTruthy());
    fireEvent.click(screen.getByText('Přidat jiné pivo'));
    const [pivoSelect] = screen.getAllByLabelText('Pivo');
    fireEvent.change(pivoSelect, { target: { value: 'b1' } });
    // Řádek (rodič selectu) musí nést zvýrazňující třídu.
    const radek = pivoSelect.closest('div')!;
    expect(radek.className).toContain('ring-rose-400');
  });

  it('prázdný řádek (nic zatím nevyplněné) se za neúplný nepočítá', async () => {
    vykresli();
    await waitFor(() => expect(screen.queryByText('Za posledních třicet dní se nic nevrátilo.')).toBeTruthy());
    fireEvent.click(screen.getByText('Přidat jiné pivo'));
    expect(screen.queryByText(/nemá vyplněné/)).toBeNull();
    const [pivoSelect] = screen.getAllByLabelText('Pivo');
    expect(pivoSelect.closest('div')!.className).not.toContain('ring-rose-400');
  });
});
