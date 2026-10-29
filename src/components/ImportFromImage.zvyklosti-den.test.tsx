// 📅 Čtení objednávky z fotky: den závozu se nedomýšlí ze zvyklostí odběratele
// (29. 10. 2026, majitel: „musím výslovně napsat datum, nebo musí být ve čtené
// objednávce datum“). Dřív se bez dne na fotce doplnil obvyklý den odběratele
// a datum z něj vyšlo jako nejbližší takový den od dneška — ve čtvrtek tedy
// o týden dál. Teď zůstane „nevybráno“, dokud den nevybere člověk.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Beer, Package, Place } from '../lib/supabase';
import type { ParsedLine } from '../lib/orderParser';

const h = vi.hoisted(() => ({ radky: [] as unknown[], nactiZvyklosti: vi.fn() }));

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
  nactiZvyklosti: h.nactiZvyklosti,
}));
vi.mock('../lib/businessDate', async (puvodni) => ({
  ...(await puvodni<typeof import('../lib/businessDate')>()),
  businessDateISO: () => '2026-10-29',
}));
vi.mock('./PhotoReviewPane', () => ({ PhotoReviewPane: () => null }));

import { ImportFromImage } from './ImportFromImage';

const PIVA = [{ id: 'b11', name: '11° Světlá' }] as unknown as Beer[];
const OBALY = [{ id: 'k10', label: 'KEG 10l' }] as unknown as Package[];
const MISTA = [{ id: 'p1', name: 'Martin' }] as unknown as Place[];

const radek = (): ParsedLine => ({
  raw: '1x10l 11sv', originalLine: '1x10l 11sv', quantity: 1, beer_id: 'b11', beer_name: null,
  package_id: 'k10', package_label: null, confidence: 'high', issues: [], place_name: 'Martin',
});

type Import = (items: Record<string, unknown>[], meta: Record<string, unknown>) => void;

async function otevri() {
  h.radky = [radek()];
  const onImport = vi.fn<Import>();
  render(
    <ImportFromImage
      beers={PIVA} packages={OBALY} places={MISTA} existing={[]} targetLabel={null}
      initialFiles={[]} onClose={vi.fn()} onImport={onImport}
    />,
  );
  fireEvent.change(screen.getByPlaceholderText(/Např\.: 12 svetly/), { target: { value: 'text' } });
  fireEvent.click(screen.getByRole('button', { name: 'Parsovat' }));
  await screen.findByTestId('spolecny-den-zavozu');
  await waitFor(() => expect(h.nactiZvyklosti).toHaveReturned());
  await new Promise((r) => setTimeout(r, 30));
  return onImport;
}

beforeEach(() => {
  localStorage.clear();
  h.nactiZvyklosti.mockReset();
  h.nactiZvyklosti.mockResolvedValue({ obvyklyDen: 'st', obvyklyZavoz: null, obvykleMnozstvi: new Map(), objednavek: 8 });
});

describe('ImportFromImage — den závozu ze zvyklostí odběratele', () => {
  it('fotka bez dne + odběratel s obvyklou středou: společný den zůstane nevybráno', async () => {
    await otevri();
    const spolecny = screen.getByTestId('spolecny-den-zavozu');
    expect(within(spolecny).getByText('nevybráno')).toBeTruthy();
    expect(within(spolecny).getByRole('button', { name: 'St' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByText(/obvyklý den odběratele/)).toBeNull();
    // (Nabídka dnů v rozbalovátku u položky „St 4. 11.“ obsahuje; šipka u dne ne.)
    expect(within(spolecny).queryByText(/4\. 11\./)).toBeNull();
  });

  it('import jde bez dne i bez data', async () => {
    const onImport = await otevri();
    fireEvent.click(screen.getByLabelText(/Zkontroloval jsem data/));
    fireEvent.click(screen.getByRole('button', { name: /^Importovat/ }));
    await waitFor(() => expect(onImport).toHaveBeenCalled());
    const [, meta] = onImport.mock.calls[0];
    expect(meta).toMatchObject({ den: null, datumZavozu: null });
  });

  it('den vybraný rukou platí dál', async () => {
    const onImport = await otevri();
    fireEvent.click(within(screen.getByTestId('spolecny-den-zavozu')).getByRole('button', { name: 'Pá' }));
    fireEvent.click(screen.getByLabelText(/Zkontroloval jsem data/));
    fireEvent.click(screen.getByRole('button', { name: /^Importovat/ }));
    await waitFor(() => expect(onImport).toHaveBeenCalled());
    const [, meta] = onImport.mock.calls[0];
    expect(meta).toMatchObject({ den: 'pa', datumZavozu: '2026-10-30' });
  });
});
