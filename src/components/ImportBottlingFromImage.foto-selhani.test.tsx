// Hlášeno z provozu: „načetl jsem fotku do stáčení lahví, ale nezobrazila se
// ani fotka, ani parsování." Příčina byla v tom, že se CELÉ zobrazení
// (náhled fotky i tabulka řádků) ukazovalo až po ÚSPĚŠNÉM přečtení — když AI
// nic nevrátila nebo volání selhalo, zmizela i fotka a obrazovka vypadala,
// jako by se nestalo vůbec nic.
//
// Test drží obojí: fotka se ukáže hned po načtení a při nezdařeném čtení
// zůstane vidět spolu s cestou dál (zkusit znovu / zapsat ručně).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ImportBottlingFromImage } from './ImportBottlingFromImage';

vi.mock('../lib/functionAuth', () => ({
  authenticatedFunctionHeaders: vi.fn().mockResolvedValue({ 'Content-Type': 'application/json' }),
}));

const beers: any[] = [{ id: 'b1', name: '12° Světlá', degree: '12°' }];
const packages: any[] = [{ id: 'p1', label: 'Lahve 0.5l', kind: 'bottle', volume_l: 0.5 }];

function vlozFotku(typ = 'image/png') {
  const vstupy = document.querySelectorAll('input[type="file"]');
  const soubor = new File(['xxx'], 'staceni.png', { type: typ });
  fireEvent.change(vstupy[1] ?? vstupy[0], { target: { files: [soubor] } });
}

function vykresli() {
  render(
    <ImportBottlingFromImage
      isOpen
      onClose={vi.fn()}
      beers={beers}
      packages={packages}
      onImport={vi.fn()}
    />,
  );
}

describe('Stáčení lahví z fotky — když se čtení nepovede', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fotka zůstane vidět i když AI nic nerozpozná', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [], raw_text: '' }), { status: 200 }),
    ));
    vykresli();
    vlozFotku();

    expect(await screen.findByRole('img')).toBeTruthy();
    expect(await screen.findByText(/nepodařilo se|nepodařilo/i)).toBeTruthy();
    expect(screen.getByText(/Zkusit přečíst znovu/i)).toBeTruthy();
    expect(screen.getByText(/Zapsat ručně podle fotky/i)).toBeTruthy();
  });

  it('fotka zůstane vidět i když volání funkce spadne', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('Internal Server Error', { status: 500 }),
    ));
    vykresli();
    vlozFotku();

    expect(await screen.findByRole('img')).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/Čtení z fotky selhalo/i)).toBeTruthy());
  });

  it('posílá skutečný typ obrázku, ne natvrdo jpeg', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [] }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    vykresli();
    vlozFotku('image/png');

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const telo = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(telo.imageMimeType).toBe('image/png');
  });

  // Řádky bez rozpoznaného piva se při potvrzení POTICHU zahodily a okno se
  // zavřelo — z pohledu obsluhy tlačítko „Vložit VŠECHNO" nedělalo nic.
  it('řádek bez piva se potichu nezahodí — řekne, co doplnit', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        items: [{ quantity: 20, degree: null, beer_name: 'Kdovíco', package_label: 'Lahve 0.5l', raw_line: '20x0,5 kdovíco' }],
        raw_text: '',
      }), { status: 200 }),
    ));
    vykresli();
    vlozFotku();

    const potvrdit = await screen.findByText(/Vložit VŠECHNO|Vložit a další fotka/i);
    fireEvent.click(potvrdit);

    expect(await screen.findByText(/není vybrané pivo/i)).toBeTruthy();
  });
});
