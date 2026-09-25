// 📷 Čtení výdeje (Fasování / Prodejna / Odpis) z fotky.
//
// Z provozu 22. 9. 2026: „dával jsem číst z fotky fasování obchod a četlo to
// špatně … ať to čte přesně, stejně jako u objednávek, ať půlka obrazu
// originální obrázek a pod ním budou data ke kontrole."
//
// PŘÍČINA: okno výsledek AI slilo do textu („24x 12° Světlá 0,5 l") a
// obrazovka ho pak znovu rozebírala parserem zkratek. Testy hlídají, že se
// ven dostanou rovnou ID z katalogu a že nad řádky je vidět fotka.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProdejnaFromImage } from './ProdejnaFromImage';

vi.mock('../lib/functionAuth', () => ({
  authenticatedFunctionHeaders: vi.fn().mockResolvedValue({ 'Content-Type': 'application/json' }),
}));

// Zmenšení fotky (canvas) funguje i v jsdom stejně jako u stáčení —
// ImportKeggingFromImage.foto.test.tsx ho taky nemockuje.

const beers: any[] = [
  { id: 'b12', name: '12° Světlá', degree: '12°', is_active: true },
  { id: 'bsum', name: 'Summer Ale', degree: null, is_active: true },
];
const packages: any[] = [
  { id: 'lah05', label: 'Lahev 0,5l', kind: 'bottle', volume_l: 0.5 },
  { id: 'lah033', label: 'Lahev 0,33l', kind: 'bottle', volume_l: 0.33 },
  { id: 'keg30', label: 'KEG 30l', kind: 'keg', volume_l: 30 },
];

const onImport = vi.fn();

function vykresli() {
  render(
    <ProdejnaFromImage isOpen onClose={vi.fn()} beers={beers} packages={packages} onImport={onImport} popisVydeje="Prodejna" />,
  );
}

function vlozFotku() {
  const vstup = document.querySelectorAll('input[type="file"]')[0];
  expect(vstup).toBeTruthy();
  fireEvent.change(vstup, { target: { files: [new File(['x'], 'vydej.png', { type: 'image/png' })] } });
}

function odpovezAI(items: unknown[]) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ items, raw_text: '' }), { status: 200 }),
  ));
}

describe('Fasování — čtení z fotky', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    onImport.mockClear();
  });

  it('nad řádky ke kontrole je vidět původní fotka', async () => {
    odpovezAI([{ quantity: 24, beer_name: '12° Světlá', package_label: '0,5 l', raw_line: '24x0,5 12sv' }]);
    vykresli();
    vlozFotku();

    expect(await screen.findByRole('img')).toBeTruthy();
    expect(await screen.findByText(/Přečtené řádky ke kontrole/)).toBeTruthy();
  });

  it('ven jdou ID z katalogu, ne přepsaný text', async () => {
    odpovezAI([
      { quantity: 24, beer_name: '12° Světlá', package_label: '0,5 l', raw_line: '24x0,5 12sv' },
      { quantity: 6, beer_name: 'Summer Ale', package_label: null, raw_line: '6x0,33 summer' },
    ]);
    vykresli();
    vlozFotku();

    const vlozit = await screen.findByText(/Vložit do zápisu/);
    fireEvent.click(vlozit);

    await waitFor(() => expect(onImport).toHaveBeenCalled());
    expect(onImport.mock.calls[0][0]).toEqual([
      { beerId: 'b12', pkgId: 'lah05', qty: '24' },
      { beerId: 'bsum', pkgId: 'lah033', qty: '6' },
    ]);
  });

  it('nedočtený řádek se nezahodí potichu — řekne, co doplnit', async () => {
    odpovezAI([{ quantity: 5, beer_name: 'Něco cizího', package_label: '???', raw_line: '5x ???' }]);
    vykresli();
    vlozFotku();

    fireEvent.click(await screen.findByText(/Vložit do zápisu/));

    expect(await screen.findByText(/chybí pivo, obal nebo počet/)).toBeTruthy();
    expect(onImport).not.toHaveBeenCalled();
  });

  it('když AI nic nenajde, nabídne zápis ručně podle fotky', async () => {
    odpovezAI([]);
    vykresli();
    vlozFotku();

    expect(await screen.findByText(/Zapsat ručně podle fotky/)).toBeTruthy();
  });
});
