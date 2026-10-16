// Čtení objednávky z fotky: den závozu u každé položky (16. 10. 2026:
// „udělej to pro všechno i objednávky"). Kontrola čtení nabízí společný den
// celé fotky a u položky jiný; náhled řekne, kolik objednávek z toho vznikne.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Beer, Package, Place } from '../lib/supabase';
import type { ParsedLine } from '../lib/orderParser';

const h = vi.hoisted(() => ({ radky: [] as unknown[] }));

vi.mock('../lib/orderParser', async (puvodni) => ({
  ...(await puvodni<typeof import('../lib/orderParser')>()),
  parseOrderText: () => h.radky,
  loadAliasMap: async () => ({ beer: new Map(), package: new Map() }),
  loadPlaceAliasMap: async () => new Map(),
  saveAlias: vi.fn(async () => {}),
  savePlaceAlias: vi.fn(async () => {}),
}));
vi.mock('../lib/zvyklostiOdberatele', async (puvodni) => ({
  ...(await puvodni<typeof import('../lib/zvyklostiOdberatele')>()),
  nactiZvyklosti: async () => null,
}));
vi.mock('../lib/businessDate', async (puvodni) => ({
  ...(await puvodni<typeof import('../lib/businessDate')>()),
  businessDateISO: () => '2026-10-16',
}));
vi.mock('./PhotoReviewPane', () => ({ PhotoReviewPane: () => null }));

import { ImportFromImage } from './ImportFromImage';

const PIVA = [{ id: 'b12', name: '12° Světlá' }, { id: 'b10', name: '10° Desítka' }] as unknown as Beer[];
const OBALY = [{ id: 'k50', label: 'KEG 50l' }] as unknown as Package[];
const MISTA = [{ id: 'p1', name: 'Restaurace' }, { id: 'p2', name: 'Obchod' }] as unknown as Place[];

const radek = (place: string | null, beer = 'b12', qty = 1): ParsedLine => ({
  raw: `${qty}x ${beer}`, originalLine: `${qty}x ${beer}`, quantity: qty, beer_id: beer, beer_name: null,
  package_id: 'k50', package_label: null, confidence: 'high', issues: [], place_name: place,
});

type Import = (items: Record<string, unknown>[], meta: Record<string, unknown>) => void;

async function otevri(radky: ParsedLine[], opts: { targetLabel?: string | null } = {}) {
  h.radky = radky;
  const onImport = vi.fn<Import>();
  render(
    <ImportFromImage
      beers={PIVA} packages={OBALY} places={MISTA} existing={[]} targetLabel={opts.targetLabel ?? null}
      initialFiles={[]} onClose={vi.fn()} onImport={onImport}
    />,
  );
  fireEvent.change(screen.getByPlaceholderText(/Např\.: 12 svetly/), { target: { value: 'text' } });
  fireEvent.click(screen.getByRole('button', { name: 'Parsovat' }));
  await screen.findByTestId('spolecny-den-zavozu').catch(() => null);
  return onImport;
}

const dnyZavozu = () => screen.queryAllByLabelText(/^Den závozu — řádek/) as HTMLSelectElement[];
const importuj = async (onImport: ReturnType<typeof vi.fn>) => {
  fireEvent.click(screen.getByLabelText(/Zkontroloval jsem data/));
  fireEvent.click(screen.getByRole('button', { name: /^Importovat/ }));
  await waitFor(() => expect(onImport).toHaveBeenCalled());
  return onImport.mock.calls[0] as [Record<string, unknown>[], Record<string, unknown>];
};

beforeEach(() => { localStorage.clear(); });

describe('ImportFromImage — den závozu u položky', () => {
  it('u každé položky je výběr dne; výchozí je společný den', async () => {
    await otevri([radek('Restaurace'), radek('Restaurace', 'b10')]);
    const vyber = dnyZavozu();
    expect(vyber).toHaveLength(2);
    expect(vyber[0].value).toBe('');
    expect(within(vyber[0]).getByRole('option', { name: 'Společný den — nevybráno' })).toBeTruthy();
    expect(within(vyber[0]).getByRole('option', { name: 'Pá 16. 10. (dnes)' })).toBeTruthy();
    expect(within(vyber[0]).getByRole('option', { name: 'Ne 11. 10. (už proběhl)' })).toBeTruthy();
  });

  it('společný den vybraný přímo v kontrole se ukáže ve výběru u položek', async () => {
    await otevri([radek('Restaurace')]);
    const spolecny = screen.getByTestId('spolecny-den-zavozu');
    fireEvent.click(within(spolecny).getByRole('button', { name: 'Út' }));
    expect(within(dnyZavozu()[0]).getByRole('option', { name: 'Společný den — Út 20. 10.' })).toBeTruthy();
  });

  it('vybraný den jde s položkou do importu; ostatní položky mají null', async () => {
    const onImport = await otevri([radek('Restaurace'), radek('Restaurace', 'b10')]);
    fireEvent.click(within(screen.getByTestId('spolecny-den-zavozu')).getByRole('button', { name: 'Út' }));
    fireEvent.change(dnyZavozu()[1], { target: { value: '2026-10-22' } });
    const [items, meta] = await importuj(onImport);
    expect(items.map((i) => i.zavoz)).toEqual([null, '2026-10-22']);
    expect(meta).toMatchObject({ den: 'ut', datumZavozu: '2026-10-20' });
  });

  it('náhled: jeden odběratel na dva dny = dvě objednávky s dny; bez rady o odběrateli', async () => {
    await otevri([radek('Restaurace'), radek('Restaurace', 'b10')]);
    expect(screen.queryByText(/Uloží se jako/)).toBeNull();
    fireEvent.click(within(screen.getByTestId('spolecny-den-zavozu')).getByRole('button', { name: 'Út' }));
    fireEvent.change(dnyZavozu()[1], { target: { value: '2026-10-22' } });
    const text = screen.getByText(/Uloží se jako/).textContent!;
    expect(text).toContain('Uloží se jako 2 objednávky: Restaurace, Út 20. 10. (1 položka) · Restaurace, Čt 22. 10. (1 položka).');
    expect(text).toContain('Den závozu změníš u každé položky.');
    expect(text).not.toContain('Patří všechno jednomu odběrateli');
  });

  it('náhled: dva odběratelé ve stejný den jako dřív (bez dnů v textu, s radou o odběrateli)', async () => {
    await otevri([radek('Restaurace'), radek('Obchod', 'b10')]);
    const text = screen.getByText(/Uloží se jako/).textContent!;
    expect(text).toContain('Restaurace (1 položka) · Obchod (1 položka).');
    expect(text).toContain('Patří všechno jednomu odběrateli?');
    expect(text).not.toContain('Den závozu změníš');
  });

  it('závoz v minulosti: upozornění, že se po uložení hned odečte ze skladu', async () => {
    await otevri([radek('Restaurace')]);
    expect(screen.queryByText(/Závoz už proběhl — po uložení se hned odečte/)).toBeNull();
    fireEvent.change(dnyZavozu()[0], { target: { value: '2026-10-11' } });
    expect(screen.getByText(/Závoz už proběhl — po uložení se hned odečte ze skladu: Restaurace, Ne 11. 10./)).toBeTruthy();
  });

  it('návrat na „společný den" vrátí položku do jedné objednávky', async () => {
    const onImport = await otevri([radek('Restaurace'), radek('Restaurace', 'b10')]);
    fireEvent.change(dnyZavozu()[1], { target: { value: '2026-10-22' } });
    fireEvent.change(dnyZavozu()[1], { target: { value: '' } });
    expect(screen.queryByText(/Uloží se jako/)).toBeNull();
    const [items] = await importuj(onImport);
    expect(items.map((i) => i.zavoz)).toEqual([null, null]);
  });

  it('do existující objednávky se den nevybírá', async () => {
    await otevri([radek('Restaurace')], { targetLabel: 'Restaurace 12. 10.' });
    expect(dnyZavozu()).toHaveLength(0);
    expect(screen.queryByTestId('spolecny-den-zavozu')).toBeNull();
  });
});
