// Z provozu 15. 9. 2026: „přidej předdefinovaný sud 50l a k počtu sudů
// přidej +/-" — u ručně přidaného řádku šlo "Zdrojový KEG"/"Počet KEGů"
// zadat jen přes klávesnici a výběr ze seznamu, žádný rychlý výchozí obal.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ImportBottlingFromImage } from './ImportBottlingFromImage';

vi.mock('../lib/functionAuth', () => ({
  authenticatedFunctionHeaders: vi.fn().mockResolvedValue({ 'Content-Type': 'application/json' }),
}));

const beers: any[] = [{ id: 'b1', name: '12° Světlá', degree: '12°' }];
const packages: any[] = [
  { id: 'p05', label: 'Lahve 0.5l', kind: 'bottle', volume_l: 0.5 },
  { id: 'k30', label: 'KEG 30l', kind: 'keg', volume_l: 30 },
  { id: 'k50', label: 'KEG 50l', kind: 'keg', volume_l: 50 },
];

async function vykresliSRucnimRadkem() {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ items: [], raw_text: '' }), { status: 200 }),
  ));
  render(
    <ImportBottlingFromImage isOpen onClose={vi.fn()} beers={beers} packages={packages} onImport={vi.fn()} />,
  );
  const vstupy = document.querySelectorAll('input[type="file"]');
  const soubor = new File(['xxx'], 'staceni.png', { type: 'image/png' });
  fireEvent.change(vstupy[1] ?? vstupy[0], { target: { files: [soubor] } });
  fireEvent.click(await screen.findByText(/Zapsat ručně podle fotky/i));
}

/** „Zdrojový KEG" nemá <label htmlFor>, takže se hledá pozicí (Pivo, pak KEG). */
function kegSelect(): HTMLSelectElement {
  return document.querySelectorAll('select')[1] as HTMLSelectElement;
}

describe('Zdrojový KEG u ručně přidaného řádku — 50l výchozí, +/- u počtu', () => {
  it('tlačítko + z prázdna nastaví počet 1 a vybere KEG 50l', async () => {
    await vykresliSRucnimRadkem();

    fireEvent.click(screen.getByRole('button', { name: 'Přidat keg' }));

    expect(screen.getByPlaceholderText('např. 2')).toHaveValue('1');
    expect(kegSelect()).toHaveValue('k50');
  });

  it('opakované + jen počítá dál, sud podruhé nepřepisuje', async () => {
    await vykresliSRucnimRadkem();

    fireEvent.click(screen.getByRole('button', { name: 'Přidat keg' }));
    fireEvent.change(kegSelect(), { target: { value: 'k30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Přidat keg' }));

    expect(screen.getByPlaceholderText('např. 2')).toHaveValue('2');
    expect(kegSelect()).toHaveValue('k30');
  });

  it('- na nule je vypnuté; z 1 na 0 vynuluje počet, ale sud nechá vybraný', async () => {
    await vykresliSRucnimRadkem();

    expect(screen.getByRole('button', { name: 'Ubrat keg' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Přidat keg' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ubrat keg' }));

    expect(screen.getByPlaceholderText('např. 2')).toHaveValue('');
    expect(kegSelect()).toHaveValue('k50');
  });
});
