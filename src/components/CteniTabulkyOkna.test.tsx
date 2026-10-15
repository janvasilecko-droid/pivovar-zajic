// 15. 10. 2026, majitel: „čtení fotky z týhle excelový tabulky udělej ve všech
// zadáváních." Stáčení lahví má vlastní test (ImportBottlingFromImage.tabulka);
// tady stáčení KEG a výdej (fasování / prodejna): výchozí je seznam jako dřív,
// tabulka se zapíná tlačítkem a pamatuje se.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';

vi.mock('../lib/functionAuth', () => ({
  authenticatedFunctionHeaders: vi.fn().mockResolvedValue({ 'Content-Type': 'application/json' }),
}));
vi.mock('../lib/obrazek', async (orig) => ({
  ...(await orig<typeof import('../lib/obrazek')>()),
  zmensenyDataUrl: vi.fn(async () => 'data:image/png;base64,ANALYZA'),
  oriznutyDataUrl: vi.fn(async () => 'data:image/jpeg;base64,VYREZ'),
}));

import { ImportKeggingFromImage } from './ImportKeggingFromImage';
import { ProdejnaFromImage } from './ProdejnaFromImage';
import { prepisTabulky, type RadekTabulky } from '../../supabase/functions/_shared/tabulka-staceni';
import { VISION_TABULKA_PUVODNI } from '../../supabase/functions/_shared/tabulka-vision.fixture';

const beers: any[] = [
  { id: 's12', name: '12° Světlá', degree: '12°', is_active: true },
  { id: 's11', name: '11° Světlá', degree: '11°', is_active: true },
  { id: 'jan', name: 'Jantar', degree: null, is_active: true },
];
const packages: any[] = [
  { id: 'k50', label: ' 50l', volume_l: 50, kind: 'keg' },
  { id: 'k30', label: '30l', volume_l: 30, kind: 'keg' },
  { id: 'p15', label: '1.5l', volume_l: 1.5, kind: 'bottle' },
  { id: 'p1', label: '1l', volume_l: 1, kind: 'bottle' },
  { id: 'p05', label: '0.5l', volume_l: 0.5, kind: 'bottle' },
  { id: 'p033', label: '0.33l', volume_l: 0.33, kind: 'bottle' },
];

const prepis = JSON.parse(JSON.stringify(prepisTabulky(VISION_TABULKA_PUVODNI)));
const r = (p: Partial<RadekTabulky>): RadekTabulky => ({
  cislo: 555, datumVBunce: null, datum: '2026-10-13', pivo: '12 Světlá', pivoId: 's12', sudy: [], lahve: [], varovani: [], ...p,
});
const RADKY: RadekTabulky[] = [
  r({ cislo: 555, datumVBunce: '2026-10-13', sudy: [{ objemL: 50, ks: 1 }], lahve: [{ objemL: 1.5, ks: 11 }, { objemL: 0.5, ks: 20 }, { objemL: 0.33, ks: 60 }] }),
  r({ cislo: 556, pivo: '11° sv.ležák', pivoId: 's11', sudy: [{ objemL: 30, ks: 1 }], lahve: [{ objemL: 1, ks: 27 }] }),
  r({ cislo: 557, pivo: 'Jantar', pivoId: 'jan', sudy: [], lahve: [{ objemL: 1.5, ks: 7 }] }), // jen lahve
];

let fetchMock: ReturnType<typeof vi.fn>;
const telaVolani = () => fetchMock.mock.calls.map((c) => JSON.parse(c[1].body));
function pripravFetch() {
  fetchMock = vi.fn().mockImplementation(async (_u: string, init: any) => {
    const telo = JSON.parse(init.body);
    return new Response(JSON.stringify(telo.rezim === 'tabulka-okno'
      ? { tabulka: { prepis } }
      : { tabulka: { radky: RADKY, dny: [{ datum: '2026-10-13', radku: 3 }], varovani: [], vynechano: 0, bezData: 0, ocr: true } }), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
}
function vlozFotku() {
  const vstupy = document.querySelectorAll('input[type="file"]');
  fireEvent.change(vstupy[1] ?? vstupy[0], { target: { files: [new File(['x'], 'tabulka.png', { type: 'image/png' })] } });
}

describe('Stáčení KEG z fotky — tabulka z Excelu', () => {
  beforeEach(() => { localStorage.clear(); pripravFetch(); });
  afterEach(() => { vi.unstubAllGlobals(); });
  const vykresli = (props: object = {}) => {
    const onImport = vi.fn();
    render(<ImportKeggingFromImage isOpen onClose={vi.fn()} beers={beers} packages={packages} onImport={onImport} posledniZapis="2026-10-12" {...props} />);
    return onImport;
  };

  it('výchozí je seznam (jako dřív); tabulka se zapne tlačítkem a zapamatuje', async () => {
    vykresli();
    expect(screen.getByRole('button', { name: 'Seznam / zpráva' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByLabelText(/Číst od data/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Tabulka z Excelu' }));
    expect(await screen.findByLabelText(/Číst od data/)).toHaveValue('2026-10-13');
    expect(localStorage.getItem('pivovar_cteni_fotky_rezim_keg')).toBe('tabulka');
  });

  it('tabulka: z buněk sudů vzniknou řádky pivo + sud + počet; řádky jen s lahvemi se přeskočí', async () => {
    const onImport = vykresli();
    fireEvent.click(screen.getByRole('button', { name: 'Tabulka z Excelu' }));
    vlozFotku();
    await screen.findByText(/Rozpoznané řádky stáčení KEG/);
    expect(telaVolani().map((t) => t.rezim)).toEqual(['tabulka-okno', 'tabulka']);
    expect(telaVolani()[1]).toMatchObject({ imageBase64: 'VYREZ', vyrez: true, odData: '2026-10-13' });
    expect(screen.getAllByTestId('radek-z-tabulky')).toHaveLength(2);
    expect(screen.getByText(/1 řádek jen s lahvemi se přeskočil/)).toBeTruthy();
    expect(screen.getByLabelText('Datum stočení')).toHaveValue('2026-10-13');

    fireEvent.click(screen.getByText(/Vložit VŠECHNO/));
    await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1));
    const [rows, datum] = onImport.mock.calls[0];
    expect(datum).toBe('2026-10-13');
    expect(rows).toEqual([
      { beerId: 's12', pkgId: 'k50', qty: '1' },
      { beerId: 's11', pkgId: 'k30', qty: '1' },
    ]);
  });

  it('bez řádků se sudy: srozumitelná hláška a cesta dál', async () => {
    fetchMock.mockImplementation(async (_u: string, init: any) => new Response(JSON.stringify(JSON.parse(init.body).rezim === 'tabulka-okno'
      ? { tabulka: { prepis } }
      : { tabulka: { radky: [RADKY[2]], dny: [{ datum: '2026-10-13', radku: 1 }], varovani: [], vynechano: 0, bezData: 0, ocr: true } }), { status: 200 }));
    vykresli();
    fireEvent.click(screen.getByRole('button', { name: 'Tabulka z Excelu' }));
    vlozFotku();
    expect(await screen.findByText(/nepodařilo přečíst žádné sudy/)).toBeTruthy();
    expect(screen.getByText(/Zapsat ručně podle fotky/)).toBeTruthy();
  });

  it('zpět na seznam: čte se jako dřív', async () => {
    localStorage.setItem('pivovar_cteni_fotky_rezim_keg', 'tabulka');
    vykresli();
    vlozFotku();
    await screen.findByText(/Rozpoznané řádky stáčení KEG/);
    fetchMock.mockClear();
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ items: [{ quantity: 2, beer_name: '12° Světlá', package_label: 'KEG 50l', raw_line: '2x50 12sv' }] }), { status: 200 }));
    fireEvent.click(screen.getByRole('button', { name: 'Seznam / zpráva' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(telaVolani()[0]).not.toHaveProperty('rezim');
    expect(await screen.findByText(/Oříznout fotku/)).toBeTruthy();
  });
});

describe('Výdej (fasování / prodejna) z fotky — tabulka z Excelu', () => {
  beforeEach(() => { localStorage.clear(); pripravFetch(); });
  afterEach(() => { vi.unstubAllGlobals(); });
  const vykresli = (props: object = {}) => {
    const onImport = vi.fn();
    render(<ProdejnaFromImage isOpen onClose={vi.fn()} beers={beers} packages={packages} onImport={onImport} popisVydeje="Prodejna" posledniZapis="2026-10-12" {...props} />);
    return onImport;
  };

  it('každá buňka sudů a lahví je jeden řádek výdeje; den z tabulky jde do zápisu', async () => {
    const onImport = vykresli();
    fireEvent.click(screen.getByRole('button', { name: 'Tabulka z Excelu' }));
    vlozFotku();
    await screen.findByText(/Přečtené řádky ke kontrole/);
    // 555: sud + 3 lahve, 556: sud + lahev, 557: lahev = 4 + 2 + 1 řádků
    expect(screen.getAllByTestId('radek-z-tabulky')).toHaveLength(7);
    fireEvent.click(screen.getByText(/Vložit do zápisu/));
    await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1));
    const [rows, datum] = onImport.mock.calls[0];
    expect(datum).toBe('2026-10-13');
    expect(rows.map((x: any) => [x.beerId, x.pkgId, x.qty])).toEqual([
      ['s12', 'k50', '1'], ['s12', 'p15', '11'], ['s12', 'p05', '20'], ['s12', 'p033', '60'],
      ['s11', 'k30', '1'], ['s11', 'p1', '27'],
      ['jan', 'p15', '7'],
    ]);
    expect(Object.keys(rows[0]).sort()).toEqual(['beerId', 'pkgId', 'qty']);
  });

  it('seznam (výchozí) předává jen řádky, bez data — jako dřív', async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ items: [{ quantity: 5, beer_name: '12° Světlá', package_label: '0.5l', raw_line: '5x 12° 0,5l' }] }), { status: 200 }));
    const onImport = vykresli();
    vlozFotku();
    fireEvent.click(await screen.findByText(/Vložit do zápisu/));
    await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1));
    expect(onImport.mock.calls[0][1]).toBeUndefined();
  });

  it('víc dnů: vloží se vybraný den a okno to řekne', async () => {
    const stary = r({ cislo: 552, datum: '2026-10-06', datumVBunce: '2026-10-06', sudy: [{ objemL: 50, ks: 3 }], lahve: [] });
    fetchMock.mockImplementation(async (_u: string, init: any) => new Response(JSON.stringify(JSON.parse(init.body).rezim === 'tabulka-okno'
      ? { tabulka: { prepis } }
      : { tabulka: { radky: [stary, ...RADKY], dny: [{ datum: '2026-10-06', radku: 1 }, { datum: '2026-10-13', radku: 3 }], varovani: [], vynechano: 0, bezData: 0, ocr: true } }), { status: 200 }));
    const onImport = vykresli({ posledniZapis: '2026-10-05' });
    fireEvent.click(screen.getByRole('button', { name: 'Tabulka z Excelu' }));
    vlozFotku();
    await screen.findByText(/Přečtené řádky ke kontrole/);
    const vyber = screen.getByTestId('vyber-dne');
    expect(screen.getAllByTestId('radek-z-tabulky')).toHaveLength(1); // nejstarší den
    fireEvent.click(within(vyber).getByRole('button', { name: /13. 10. 2026 · 3 řádky/ }));
    await waitFor(() => expect(screen.getAllByTestId('radek-z-tabulky')).toHaveLength(7));
    fireEvent.click(screen.getByText(/Vložit do zápisu/));
    await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1));
    expect(onImport.mock.calls[0][1]).toBe('2026-10-13');
    expect(onImport.mock.calls[0][0]).toHaveLength(7);
  });
});
