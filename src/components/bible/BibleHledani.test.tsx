import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Hledani } from '../../lib/bibleHledaniApi';

// Jen vymyšlené krátké věty — žádný text skutečných knih (repo je veřejné).
const hledejVKnihach = vi.fn<(dotaz: string, id?: string) => Promise<Hledani>>();
vi.mock('../../lib/bibleHledaniApi', () => ({ hledejVKnihach: (d: string, id?: string) => hledejVKnihach(d, id) }));

import { BibleHledani, ZvyraznenyUryvek } from './BibleHledani';

const ID = '11111111-2222-3333-4444-555555555555';

beforeEach(() => hledejVKnihach.mockReset());

describe('hledání v knihách', () => {
  it('najde výsledky (originál i překlad) s místem v knize a otevře stránku', async () => {
    hledejVKnihach.mockResolvedValue({ stav: 'ok', vysledky: [
      { dokumentId: ID, nazev: 'Pivovarství', autor: 'Novák', rok: 2019, zdroj: 'preklad', pdfIndex: 170, tistena: '158', kapitola: 'Rmutování', druh: 'text', uryvek: 'β-amyláza pracuje při 62 °C.' },
      { dokumentId: ID, nazev: 'Pivovarství', autor: null, rok: null, zdroj: 'original', pdfIndex: 12, tistena: null, kapitola: null, druh: 'tabulka', uryvek: 'Amylase at 62 °C.' },
    ] });
    const otevri = vi.fn();
    render(<BibleHledani otevri={otevri} />);
    fireEvent.change(screen.getByLabelText('Hledat v knihách'), { target: { value: 'amylaza' } });
    fireEvent.click(screen.getByRole('button', { name: /Hledat/ }));
    await waitFor(() => expect(screen.getByText(/Nalezeno 2/)).toBeTruthy());
    expect(hledejVKnihach).toHaveBeenCalledWith('amylaza', undefined);
    expect(screen.getByText('· s. 158')).toBeTruthy();
    expect(screen.getByText('· list 12')).toBeTruthy();
    expect(screen.getByText('český překlad')).toBeTruthy();
    expect(screen.getByText('originál')).toBeTruthy();
    expect(screen.getByText('β-amyláza').tagName).toBe('MARK');
    fireEvent.click(screen.getByText('· s. 158'));
    expect(otevri).toHaveBeenCalledWith(ID, 170);
  });

  it('nic nenalezeno, chyba a krátký dotaz', async () => {
    hledejVKnihach.mockResolvedValueOnce({ stav: 'ok', vysledky: [] });
    render(<BibleHledani otevri={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Hledat/ }));
    expect(screen.getByRole('alert').textContent).toMatch(/dva znaky/);
    expect(hledejVKnihach).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Hledat v knihách'), { target: { value: 'xyz' } });
    fireEvent.click(screen.getByRole('button', { name: /Hledat/ }));
    await waitFor(() => expect(screen.getByText(/Nic jsem nenašel pro „xyz“/)).toBeTruthy());
    hledejVKnihach.mockResolvedValueOnce({ stav: 'chyba', zprava: 'Spojení se přerušilo.' });
    fireEvent.click(screen.getByRole('button', { name: /Hledat/ }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Spojení se přerušilo.'));
  });

  it('zvýraznění: začátky slov bez ohledu na diakritiku, bez HTML', () => {
    const { container } = render(<ZvyraznenyUryvek text="Rmutování <b>při</b> 62 °C" dotaz="rmut 62" />);
    expect([...container.querySelectorAll('mark')].map((m) => m.textContent)).toEqual(['Rmutování', '62']);
    expect(container.querySelector('b')).toBeNull();
  });
});
