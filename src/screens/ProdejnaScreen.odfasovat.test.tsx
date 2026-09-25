// ↩️ „Odfasovat" u už uloženého zápisu (Fasování → Prodejna i Personál).
//
// Zadání 22. 9. 2026: „u obchodu přidej možnost odfasovat objednávku
// u fasování, vrátí ji do skladu." Do té doby se vrácení muselo přepsat
// ručně v Zápisu (zaškrtávátko + znovu vyplnit pivo, obal, počet).
//
// Test hlídá to jediné, na čem u skladu záleží: vrácení se zapíše jako
// ZÁPORNÝ protizápis dneškem a původní zápis zůstane nedotčený. Kdyby se
// místo toho upravoval nebo mazal původní řádek, ztratila by se stopa po
// výdeji a rozhýbal by se měsíc, který už může být napočítaný.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ProdejnaScreen from './ProdejnaScreen';
import { businessDateISO } from '../lib/businessDate';

// Pozor: NE new Date().toISOString() (UTC) — odfasuj() v ProdejnaScreen.tsx
// počítá "dnešek" přes businessDateISO() (pražský čas), takže kolem půlnoci
// UTC (= 1-2 v noci v Praze) by se test rozešel s kódem o jeden den.
const DNES = businessDateISO();

const h = vi.hoisted(() => {
  const zapisy: any[] = [];
  const smazane: string[] = [];
  const upravene: any[] = [];
  const DB: Record<string, any[]> = {
    fasovani_private: [],
    beers: [],
    packages: [],
    inventory: [],
    parser_aliases: [],
  };
  return { DB, zapisy, smazane, upravene };
});

vi.mock('../lib/supabase', () => {
  function makeQuery(table: string) {
    const data = h.DB[table] ?? [];
    const q: any = Promise.resolve({ data, error: null });
    q.select = vi.fn(() => q);
    q.order = vi.fn(() => q);
    q.eq = vi.fn(() => q);
    q.in = vi.fn((sloupec: string, hodnoty: string[]) => {
      if (sloupec === 'id') h.smazane.push(...hodnoty);
      return q;
    });
    q.limit = vi.fn(() => q);
    q.maybeSingle = vi.fn().mockResolvedValue({ data: data[0] ?? null, error: null });
    q.insert = vi.fn((payload: any) => {
      const radky = Array.isArray(payload) ? payload : [payload];
      h.zapisy.push(...radky.map((r) => ({ ...r, __tabulka: table })));
      const vlozeno: any = Promise.resolve({ data: radky.map((_, i) => ({ id: `novy-${i}` })), error: null });
      vlozeno.select = vi.fn(() => vlozeno);
      return vlozeno;
    });
    q.update = vi.fn((patch: any) => {
      h.upravene.push({ tabulka: table, patch });
      return q;
    });
    q.delete = vi.fn(() => q);
    return q;
  }
  const supabase = { from: vi.fn((t: string) => makeQuery(t)) };
  return {
    supabase,
    fetchAllRows: vi.fn((t: string) => makeQuery(t)),
    useRealtime: vi.fn(),
    beerBg: vi.fn(() => '#f59e0b'),
    beerText: vi.fn(() => '#000'),
    beerInk: vi.fn(() => '#000'),
    beerName: vi.fn((b: any) => b?.name ?? ''),
    pkgBg: vi.fn(() => '#ef4444'),
    pkgText: vi.fn(() => '#fff'),
    formatPackageLabel: vi.fn((l: string) => l),
  };
});

// Potvrzení vždy ANO — test zkoumá, CO se zapíše, ne jestli se appka ptá.
vi.mock('../lib/toast', () => ({
  chyba: vi.fn(),
  uspech: vi.fn(),
  potvrd: vi.fn().mockResolvedValue(true),
  toastZpet: vi.fn(),
}));

describe('Fasování → Odfasovat u uloženého zápisu', () => {
  beforeEach(() => {
    h.zapisy.length = 0;
    h.smazane.length = 0;
    h.upravene.length = 0;
    h.DB.beers = [{ id: 'beer-12', name: '12° Světlá', is_active: true, sort_order: 1 }];
    h.DB.packages = [{ id: 'pkg-05', label: '0,5 l', kind: 'bottle', volume_l: 0.5, sort_order: 1 }];
    h.DB.inventory = [];
    h.DB.fasovani_private = [
      {
        id: 'zapis-1', entry_date: DNES, beer_id: 'beer-12', beer_name: '12° Světlá',
        package_id: 'pkg-05', package_label: '0,5 l', quantity: 5, who: null, note: null,
      },
    ];
  });

  it('zapíše záporný protizápis a původní zápis nechá být', async () => {
    render(<ProdejnaScreen table="fasovani_private" title="Fasování" />);

    fireEvent.click(await screen.findByRole('button', { name: /Přehled/i }));

    const tlacitko = await screen.findAllByRole('button', { name: /Odfasovat — vrátit na sklad/i });
    fireEvent.click(tlacitko[0]);

    await waitFor(() => expect(h.zapisy.length).toBeGreaterThan(0));

    const vraceni = h.zapisy[0];
    expect(vraceni.__tabulka).toBe('fasovani_private');
    expect(vraceni.quantity).toBe(-5);
    expect(vraceni.beer_id).toBe('beer-12');
    expect(vraceni.package_id).toBe('pkg-05');
    // Dneškem, ne datem původního výdeje — vrácení se stalo teď.
    expect(vraceni.entry_date).toBe(DNES);
    expect(String(vraceni.note)).toMatch(/Vráceno na sklad/);

    // Původní zápis se nesmí ani přepsat, ani smazat.
    expect(h.upravene).toEqual([]);
    expect(h.smazane).not.toContain('zapis-1');
  });

  it('u už vráceného (záporného) řádku se tlačítko nenabízí', async () => {
    h.DB.fasovani_private = [
      {
        id: 'zapis-vraceni', entry_date: DNES, beer_id: 'beer-12', beer_name: '12° Světlá',
        package_id: 'pkg-05', package_label: '0,5 l', quantity: -5, who: null,
        note: 'Vráceno na sklad',
      },
    ];
    render(<ProdejnaScreen table="fasovani_private" title="Fasování" />);

    fireEvent.click(await screen.findByRole('button', { name: /Přehled/i }));
    // Řádek se vykresluje dvakrát (seznam na telefon + tabulka na počítač),
    // proto findAll — jde jen o to, že přehled je opravdu vidět.
    expect((await screen.findAllByText(/12° Světlá/)).length).toBeGreaterThan(0);

    expect(screen.queryAllByRole('button', { name: /Odfasovat — vrátit na sklad/i })).toEqual([]);
  });
});
