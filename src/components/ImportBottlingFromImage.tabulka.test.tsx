// 15. 10. 2026, majitel: „čtení fotky z týhle excelový tabulky udělej ve všech
// zadáváních, ať se nemusí ořezávat — můžu zadat datum, od kdy chci data číst.
// Datum platí do tý doby, než se objeví další (u prázdných políček u datumů)."
//
// Okno „Zadání stočení lahví z fotky" v režimu Tabulka z Excelu: čte se od data
// (výchozí je den po posledním zápisu), fotka se ořízne a zvětší sama, sloupce
// sudů a lahví se přečtou podle sloupců a datum dědí z řádku nad tím.
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

// Editor ořezu se v testu nahrazuje tlačítkem, které „ořezanou" fotku rovnou potvrdí.
vi.mock('./ImageEditor', async () => {
  const React = await import('react');
  return {
    ImageEditorOverlay: ({ onConfirm }: { onConfirm: (url: string) => void }) =>
      React.createElement('button', { onClick: () => onConfirm('data:image/png;base64,UPRAVENA') }, 'Potvrdit ořez'),
  };
});

import { ImportBottlingFromImage } from './ImportBottlingFromImage';
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
  { id: 'k20', label: '20l', volume_l: 20, kind: 'keg' },
  { id: 'p15', label: '1.5l', volume_l: 1.5, kind: 'bottle' },
  { id: 'p1', label: '1l', volume_l: 1, kind: 'bottle' },
  { id: 'p05', label: '0.5l', volume_l: 0.5, kind: 'bottle' },
  { id: 'p033', label: '0.33l', volume_l: 0.33, kind: 'bottle' },
];

const prepis = JSON.parse(JSON.stringify(prepisTabulky(VISION_TABULKA_PUVODNI)));

const r = (p: Partial<RadekTabulky>): RadekTabulky => ({
  cislo: 555, datumVBunce: null, datum: '2026-10-13', pivo: '12 Světlá', pivoId: 's12', sudy: [], lahve: [], varovani: [], ...p,
});
const RADKY_13_10: RadekTabulky[] = [
  r({ cislo: 555, datumVBunce: '2026-10-13', sudy: [{ objemL: 50, ks: 1 }], lahve: [{ objemL: 1.5, ks: 11 }, { objemL: 0.5, ks: 20 }, { objemL: 0.33, ks: 60 }] }),
  r({ cislo: 556, pivo: '11° sv.ležák', pivoId: 's11', sudy: [{ objemL: 30, ks: 1 }], lahve: [{ objemL: 1, ks: 27 }] }),
  r({ cislo: 557, pivo: 'Jantar', pivoId: 'jan', sudy: [{ objemL: 50, ks: 1 }], lahve: [{ objemL: 1.5, ks: 25 }, { objemL: 0.5, ks: 20 }] }),
  r({ cislo: 558, pivo: null, pivoId: null, sudy: [{ objemL: 50, ks: 2 }], lahve: [{ objemL: 1, ks: 72 }, { objemL: 0.5, ks: 40 }] }),
];

const odpovedTabulky = (radky: RadekTabulky[], dny: { datum: string | null; radku: number }[], extra: object = {}) => ({
  tabulka: { radky, dny, varovani: [], vynechano: 0, bezData: 0, ocr: true, ...extra },
});

let fetchMock: ReturnType<typeof vi.fn>;
const telaVolani = () => fetchMock.mock.calls.map((c) => JSON.parse(c[1].body));

function pripravFetch(odpoved: object | ((telo: any) => object) = odpovedTabulky(RADKY_13_10, [{ datum: '2026-10-13', radku: 4 }])) {
  fetchMock = vi.fn().mockImplementation(async (_url: string, init: any) => {
    const telo = JSON.parse(init.body);
    const data = telo.rezim === 'tabulka-okno' ? { tabulka: { prepis } } : typeof odpoved === 'function' ? odpoved(telo) : odpoved;
    return new Response(JSON.stringify(data), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
}

function vykresli(props: Partial<React.ComponentProps<typeof ImportBottlingFromImage>> = {}) {
  const onImport = vi.fn();
  render(
    <ImportBottlingFromImage isOpen onClose={vi.fn()} beers={beers} packages={packages} onImport={onImport} posledniZapis="2026-10-12" {...props} />,
  );
  return onImport;
}

function vlozFotku() {
  const vstupy = document.querySelectorAll('input[type="file"]');
  fireEvent.change(vstupy[1] ?? vstupy[0], { target: { files: [new File(['x'], 'tabulka.png', { type: 'image/png' })] } });
}

describe('Stáčení lahví z fotky — tabulka z Excelu', () => {
  beforeEach(() => {
    localStorage.clear();
    pripravFetch();
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('výchozí je tabulka; čte se od dne po posledním zápisu v appce a fotka se neořezává', async () => {
    vykresli();
    expect(screen.getByRole('button', { name: 'Tabulka z Excelu' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText(/Číst od data/)).toHaveValue('2026-10-13');
    expect(screen.getByText(/Poslední zápis v appce: 12. 10. 2026/)).toBeTruthy();
    // Ořez (✂️) se v režimu tabulky nenabízí — ořízne se sám.
    expect(screen.queryByText(/Oříznout fotku/)).toBeNull();
    vlozFotku();
    expect(await screen.findByText(/Rozpoznané řádky stočení/)).toBeTruthy();
    expect(screen.queryByText(/Oříznout fotku: ZAP/)).toBeNull();
  });

  it('načtení fotky: krok 1 (přepis) a krok 2 (buňky) — výřez od 13. 10., zvětšený', async () => {
    vykresli();
    vlozFotku();
    await screen.findByText(/Rozpoznané řádky stočení/);
    const tela = telaVolani();
    expect(tela.map((t) => t.rezim)).toEqual(['tabulka-okno', 'tabulka']);
    expect(tela[1]).toMatchObject({ imageBase64: 'VYREZ', vyrez: true, odData: '2026-10-13', datumOkna: '2026-10-13' });
  });

  it('čtyři řádky z 13. 10.: sudy, tři druhy lahví, pivo z katalogu a datum stočení z tabulky', async () => {
    vykresli();
    vlozFotku();
    await screen.findByText(/Rozpoznané řádky stočení/);
    expect(screen.getByLabelText('Datum stočení')).toHaveValue('2026-10-13');
    const radky = screen.getAllByTestId('radek-z-tabulky');
    expect(radky).toHaveLength(4);
    expect(within(radky[0]).getByText(/řádek č\. 555/)).toBeTruthy();
    expect(within(radky[0]).getByText(/13. 10. 2026/)).toBeTruthy();
    expect(within(radky[0]).getByText(/„12 Světlá"/)).toBeTruthy();
    // 1 × 50 l → 11 × 1,5 l + 20 × 0,5 l + 60 × 0,33 l = 46,3 l (výtrata 7,4 %)
    expect(within(radky[0]).getByText(/Stočeno 46,3 l z 50 l ze sudů · výtrata 7,4 %/)).toBeTruthy();
    // pivo a sud v řádku
    const selecty = screen.getAllByRole('combobox') as HTMLSelectElement[];
    expect(selecty.find((s) => s.value === 's12')).toBeTruthy();
    expect(screen.getAllByDisplayValue('11')[0]).toBeTruthy(); // 11 ks po 1,5 l
    expect(screen.getAllByDisplayValue('60')[0]).toBeTruthy(); // 60 ks po 0,33 l
  });

  it('prázdné pivo v tabulce zůstane prázdné — do formuláře se nic nehádá, zápis se zastaví', async () => {
    const onImport = vykresli();
    vlozFotku();
    await screen.findByText(/Rozpoznané řádky stočení/);
    expect(within(screen.getAllByTestId('radek-z-tabulky')[3]).getByText(/pivo v tabulce prázdné/)).toBeTruthy();
    fireEvent.click(screen.getByText(/Vložit VŠECHNO/));
    expect(await screen.findByText(/není vybrané pivo/)).toBeTruthy();
    expect(onImport).not.toHaveBeenCalled();
  });

  it('vložení: jen údaje formuláře (bez čísla řádku a varování), datum z tabulky', async () => {
    const onImport = vykresli();
    vlozFotku();
    await screen.findByText(/Rozpoznané řádky stočení/);
    // čtvrtému řádku doplnit pivo
    const selecty = screen.getAllByRole('combobox') as HTMLSelectElement[];
    const bezPiva = selecty.filter((s) => s.value === '' && [...s.options].some((o) => o.value === 'jan'))[0];
    fireEvent.change(bezPiva, { target: { value: 'jan' } });
    fireEvent.click(screen.getByText(/Vložit VŠECHNO/));
    await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1));
    const [rows, datum] = onImport.mock.calls[0];
    expect(datum).toBe('2026-10-13');
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({ beerId: 's12', kegPkgId: 'k50', kegQty: '1', pkgId: 'p15', qty: '11', pkg2Id: 'p05', qty2: '20', pkg3Id: 'p033', qty3: '60' });
    expect(rows[3]).toMatchObject({ beerId: 'jan', kegPkgId: 'k50', kegQty: '2', pkgId: 'p1', qty: '72', pkg2Id: 'p05', qty2: '40' });
    for (const rr of rows) {
      expect(rr).not.toHaveProperty('datum');
      expect(rr).not.toHaveProperty('varovani');
      expect(rr).not.toHaveProperty('cisloRadku');
      expect(rr).not.toHaveProperty('pivoText');
    }
  });

  it('řádek se dvěma sudy (50 l + 20 l) ukáže druhý sud', async () => {
    pripravFetch(odpovedTabulky(
      [r({ cislo: 554, datumVBunce: '2026-10-13', pivo: 'Desítka', pivoId: 's11', sudy: [{ objemL: 50, ks: 1 }, { objemL: 20, ks: 1 }], lahve: [{ objemL: 1.5, ks: 16 }, { objemL: 1, ks: 38 }] })],
      [{ datum: '2026-10-13', radku: 1 }],
    ));
    vykresli();
    vlozFotku();
    await screen.findByText(/Rozpoznané řádky stočení/);
    expect(screen.getByText('Druhý KEG')).toBeTruthy();
    expect(screen.getByText(/Stočeno 62 l z 70 l ze sudů · výtrata 11,4 %/)).toBeTruthy();
  });

  it('varování z čtení jsou u řádku vidět', async () => {
    pripravFetch(odpovedTabulky(
      [r({ varovani: ['Číslo 24 přepis fotky u tohohle řádku nevidí (vidí: 1, 25, 20) — zkontroluj podle fotky.'], sudy: [{ objemL: 50, ks: 1 }], lahve: [{ objemL: 1.5, ks: 24 }] })],
      [{ datum: '2026-10-13', radku: 1 }],
    ));
    vykresli();
    vlozFotku();
    expect(await screen.findByText(/Číslo 24 přepis fotky u tohohle řádku nevidí/)).toBeTruthy();
  });

  it('víc dnů v tabulce: nabídne se nejstarší, ostatní jsou schované a vkládá se jen vybraný den', async () => {
    const stary = r({ cislo: 552, datum: '2026-10-06', datumVBunce: '2026-10-06', sudy: [{ objemL: 50, ks: 3 }], lahve: [{ objemL: 1, ks: 140 }] });
    pripravFetch(odpovedTabulky([stary, ...RADKY_13_10], [{ datum: '2026-10-06', radku: 1 }, { datum: '2026-10-13', radku: 4 }]));
    const onImport = vykresli({ posledniZapis: '2026-10-05' });
    vlozFotku();
    await screen.findByText(/Rozpoznané řádky stočení/);
    // vybraný je nejstarší den, vidět je jeden řádek
    expect(screen.getAllByTestId('radek-z-tabulky')).toHaveLength(1);
    expect(screen.getByLabelText('Datum stočení')).toHaveValue('2026-10-06');
    const vyber = screen.getByTestId('vyber-dne');
    expect(within(vyber).getByRole('button', { name: /6. 10. 2026 · 1 řádek/ })).toHaveAttribute('aria-pressed', 'true');
    // přepnutí na 13. 10. ukáže čtyři řádky a přepíše datum
    fireEvent.click(within(vyber).getByRole('button', { name: /13. 10. 2026 · 4 řádky/ }));
    await waitFor(() => expect(screen.getAllByTestId('radek-z-tabulky')).toHaveLength(4));
    expect(screen.getByLabelText('Datum stočení')).toHaveValue('2026-10-13');
    // doplnit pivo u čtvrtého řádku a vložit — vloží se JEN 13. 10.
    const selecty = screen.getAllByRole('combobox') as HTMLSelectElement[];
    fireEvent.change(selecty.filter((s) => s.value === '' && [...s.options].some((o) => o.value === 'jan'))[0], { target: { value: 'jan' } });
    fireEvent.click(screen.getByText(/Vložit VŠECHNO/));
    await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1));
    const [rows, datum] = onImport.mock.calls[0];
    expect(datum).toBe('2026-10-13');
    expect(rows).toHaveLength(4);
    expect(rows.every((x: any) => x.kegPkgId)).toBe(true);
  });

  it('změna data „číst od" nabídne přečtení znovu — přepis fotky se nepodruhé nedělá', async () => {
    vykresli();
    vlozFotku();
    await screen.findByText(/Rozpoznané řádky stočení/);
    expect(screen.queryByText(/Přečíst znovu od/)).toBeNull();
    fireEvent.change(screen.getByLabelText(/Číst od data/), { target: { value: '2026-10-06' } });
    fireEvent.click(await screen.findByText(/Přečíst znovu od 6. 10. 2026/));
    await waitFor(() => expect(telaVolani()).toHaveLength(3));
    expect(telaVolani().map((t) => t.rezim)).toEqual(['tabulka-okno', 'tabulka', 'tabulka']);
    expect(telaVolani()[2]).toMatchObject({ odData: '2026-10-06', datumOkna: '2026-10-06' });
  });

  it('po posledním datu v tabulce není co číst: řekne to a nabídne poslední datum', async () => {
    vykresli({ posledniZapis: '2026-10-13' }); // od 14. 10.
    vlozFotku();
    expect(await screen.findByText(/Od 14. 10. 2026 v tabulce nic není/)).toBeTruthy();
    expect(screen.getByText(/Poslední datum na fotce je 13. 10. 2026/)).toBeTruthy();
    expect(telaVolani().map((t) => t.rezim)).toEqual(['tabulka-okno']); // AI se nevolala
    fireEvent.click(screen.getByRole('button', { name: /Číst od 13. 10. 2026/ }));
    expect(screen.getByLabelText(/Číst od data/)).toHaveValue('2026-10-13');
  });

  it('bez posledního zápisu je datum prázdné a čte se celá tabulka', async () => {
    vykresli({ posledniZapis: null });
    expect(screen.getByLabelText(/Číst od data/)).toHaveValue('');
    vlozFotku();
    await screen.findByText(/Rozpoznané řádky stočení/);
    expect(telaVolani()[1]).toMatchObject({ odData: null });
  });

  it('ruční ořez fotky (✂️) je pořád k dispozici: upravená fotka se přečte celá znovu, i s novým přepisem', async () => {
    vykresli();
    vlozFotku();
    await screen.findByText(/Rozpoznané řádky stočení/);
    fireEvent.click(screen.getByRole('button', { name: /Oříznout/ }));
    fireEvent.click(await screen.findByText('Potvrdit ořez'));
    await waitFor(() => expect(telaVolani()).toHaveLength(4));
    expect(telaVolani().map((t) => t.rezim)).toEqual(['tabulka-okno', 'tabulka', 'tabulka-okno', 'tabulka']);
    expect(telaVolani()[2].imageBase64).toBe('UPRAVENA'); // z upravené fotky, ne ze starého souboru
    await screen.findByText(/Rozpoznané řádky stočení/);
  });

  it('přepnutí na „Seznam / zpráva": čte se jako dřív a volba se pamatuje; ořez se zase nabízí', async () => {
    vykresli();
    vlozFotku();
    await screen.findByText(/Rozpoznané řádky stočení/);
    fetchMock.mockClear();
    pripravFetch({ items: [{ quantity: 20, beer_name: '12° Světlá', package_label: '0.5l', raw_line: '20x0,5 12sv' }] });
    fireEvent.click(screen.getByRole('button', { name: 'Seznam / zpráva' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(telaVolani()[0]).toHaveProperty('imageBase64');
    expect(telaVolani()[0]).not.toHaveProperty('rezim');
    expect(localStorage.getItem('pivovar_cteni_fotky_rezim_lahve')).toBe('seznam');
    expect(await screen.findByText(/Oříznout fotku/)).toBeTruthy();
    expect(screen.queryByLabelText(/Číst od data/)).toBeNull();
  });

  it('zapamatovaný režim „seznam" se po otevření okna použije', async () => {
    localStorage.setItem('pivovar_cteni_fotky_rezim_lahve', 'seznam');
    vykresli();
    expect(screen.getByRole('button', { name: 'Seznam / zpráva' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByLabelText(/Číst od data/)).toBeNull();
  });

  it('chyba čtení: srozumitelná hláška a cesta dál (zkusit znovu / zapsat ručně)', async () => {
    fetchMock = vi.fn().mockImplementation(async (_u: string, init: any) =>
      JSON.parse(init.body).rezim === 'tabulka-okno'
        ? new Response(JSON.stringify({ tabulka: { prepis } }), { status: 200 })
        : new Response(JSON.stringify({ error: 'AI nepřečetla tabulku ani po opakování — zkus to za chvíli znovu.' }), { status: 502 }));
    vi.stubGlobal('fetch', fetchMock);
    vykresli();
    vlozFotku();
    expect(await screen.findByText(/AI nepřečetla tabulku/)).toBeTruthy();
    expect(screen.getByText(/Zkusit přečíst znovu/)).toBeTruthy();
    expect(screen.getByText(/Zapsat ručně podle fotky/)).toBeTruthy();
  });
});
