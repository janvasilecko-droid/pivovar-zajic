import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

type Moznosti = { signal?: AbortSignal; onPrubeh?: (podil: number) => void };
const volani: { nazev: string; moznosti: Moznosti }[] = [];

vi.mock('../../lib/bibleKnihovnaApi', () => ({
  nahrajDokument: vi.fn((soubor: File, _popis: unknown, moznosti: Moznosti) => {
    volani.push({ nazev: soubor.name, moznosti });
    moznosti.onPrubeh?.(0.42);
    // Nahrávání „běží", dokud ho někdo nezastaví.
    return new Promise((ok) => {
      moznosti.signal?.addEventListener('abort', () => ok({ stav: 'chyba', zprava: 'Nahrávání zastaveno. Nahrání jde dokončit: vyber stejný soubor a nahraj ho znovu.' }));
    });
  }),
}));

import { BibleNahrat } from './BibleNahrat';

function vyberSoubory(...jmena: string[]) {
  const vstup = screen.getByLabelText(/Soubory/) as HTMLInputElement;
  fireEvent.change(vstup, { target: { files: jmena.map((j) => new File(['%PDF'], j, { type: 'application/pdf' })) } });
}

beforeEach(() => { volani.length = 0; });

describe('Nahrání knih — průběh a zastavení', () => {
  it('ukáže průběh v procentech; Zastavit přeruší aktuální soubor a zbytek fronty nespustí', async () => {
    render(<BibleNahrat onNahrano={vi.fn()} onZavrit={vi.fn()} />);
    vyberSoubory('a.pdf', 'b.pdf');
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Nahrát 2 soubory/ }));
    expect(await screen.findByText('Nahrávám… 42 %')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Zavřít' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Zastavit/ }));
    expect(await screen.findByText(/Nahrávání zastaveno/)).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Zavřít' })).toBeTruthy());
    expect(volani.map((v) => v.nazev)).toEqual(['a.pdf']);
    expect(volani[0].moznosti.signal?.aborted).toBe(true);
  });

  it('odchod z obrazovky nahrávání zastaví', async () => {
    const { unmount } = render(<BibleNahrat onNahrano={vi.fn()} onZavrit={vi.fn()} />);
    vyberSoubory('a.pdf');
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /Nahrát 1 soubor/ }));
    await waitFor(() => expect(volani).toHaveLength(1));
    unmount();
    expect(volani[0].moznosti.signal?.aborted).toBe(true);
  });
});
