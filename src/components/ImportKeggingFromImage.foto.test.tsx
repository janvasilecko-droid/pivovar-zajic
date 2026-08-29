// Z provozu: „nefunguje zadávání stáčení lahve a KEG podle fotky."
//
// Tři různé příčiny, každá s vlastním testem:
//  1) Fotoaparát v KEG stáčení ukládal snímek do fronty `pendingFiles`, kterou
//     nikdo nikdy nečetl — vyfotit a nestalo se nic.
//  2) Objem sudu se hledal jako `\b(50|30|20|15|10)\b`, jenže v běžných
//     zápisech („4x50", „2x30l") kolem čísla není hranice slova, takže obal
//     zůstal prázdný.
//  3) Řádky bez rozpoznaného piva se při potvrzení POTICHU zahodily a okno se
//     zavřelo — vypadalo to, že tlačítko nic nedělá.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ImportKeggingFromImage } from './ImportKeggingFromImage';

vi.mock('../lib/functionAuth', () => ({
  authenticatedFunctionHeaders: vi.fn().mockResolvedValue({ 'Content-Type': 'application/json' }),
}));

const beers: any[] = [
  { id: 'b12', name: '12° Světlá', degree: '12°', is_active: true },
  { id: 'b11', name: '11° Světlá', degree: '11°', is_active: true },
];
const packages: any[] = [
  { id: 'k50', label: 'KEG 50l', kind: 'keg', volume_l: 50 },
  { id: 'k30', label: 'KEG 30l', kind: 'keg', volume_l: 30 },
];

const onImport = vi.fn();

function vykresli() {
  render(
    <ImportKeggingFromImage isOpen onClose={vi.fn()} beers={beers} packages={packages} onImport={onImport} />,
  );
}

/** Vstupy jsou dva: [0] galerie, [1] fotoaparát (capture="environment"). */
function vlozFotku(kterym: 'galerie' | 'fotoaparat') {
  const vstupy = document.querySelectorAll('input[type="file"]');
  const vstup = kterym === 'fotoaparat' ? vstupy[1] : vstupy[0];
  expect(vstup).toBeTruthy();
  fireEvent.change(vstup, { target: { files: [new File(['x'], 'keg.png', { type: 'image/png' })] } });
}

function odpovezAI(items: unknown[]) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ items, raw_text: '' }), { status: 200 }),
  ));
}

describe('Stáčení KEG z fotky', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    onImport.mockClear();
  });

  it('fotka z fotoaparátu se opravdu načte a přečte', async () => {
    odpovezAI([{ quantity: 4, degree: '12°', beer_name: '12° Světlá', package_label: '', raw_line: '12sv 4x50' }]);
    vykresli();
    vlozFotku('fotoaparat');

    // Fotka je vidět a AI se na ni opravdu zeptalo.
    expect(await screen.findByRole('img')).toBeTruthy();
    await waitFor(() => expect(fetch).toHaveBeenCalled());
  });

  it('objem sudu pozná i ze zápisu „4x50" (bez mezer kolem čísla)', async () => {
    odpovezAI([{ quantity: 4, degree: '12°', beer_name: '12° Světlá', package_label: '', raw_line: '12sv 4x50' }]);
    vykresli();
    vlozFotku('galerie');

    await screen.findByText(/Rozpoznané řádky/i);
    const vyberObalu = await waitFor(() => {
      const s = Array.from(document.querySelectorAll('select')).find((el) =>
        Array.from(el.options).some((o) => o.textContent?.includes('KEG 50l')),
      );
      expect(s).toBeTruthy();
      return s as HTMLSelectElement;
    });
    expect(vyberObalu.value).toBe('k50');
  });

  it('řádek bez piva se potichu nezahodí — řekne, co doplnit', async () => {
    // Pivo, které v katalogu není → beerId zůstane prázdné.
    odpovezAI([{ quantity: 2, degree: null, beer_name: 'Kdovíco', package_label: '', raw_line: '2x30 kdovíco' }]);
    vykresli();
    vlozFotku('galerie');

    const potvrdit = await screen.findByText(/Vložit VŠECHNO|Vložit a další fotka/i);
    fireEvent.click(potvrdit);

    expect(await screen.findByText(/není vybrané pivo/i)).toBeTruthy();
    expect(onImport).not.toHaveBeenCalled();
  });
});
