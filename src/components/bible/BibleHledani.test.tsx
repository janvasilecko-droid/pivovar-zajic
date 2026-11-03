import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Hledani, PolozkaPrehledu, PrehledTematu } from '../../lib/bibleHledaniApi';

// Jen vymyšlené krátké věty — žádný text skutečných knih (repo je veřejné).
const hledejVKnihach = vi.fn<(dotaz: string, id?: string) => Promise<Hledani>>();
let seznamPrehledu: { stav: 'ok'; prehledy: PolozkaPrehledu[]; migrace: boolean } = { stav: 'ok', prehledy: [], migrace: true };
const nactiPrehled = vi.fn<(klic: string) => Promise<{ stav: 'ok'; prehled: PrehledTematu } | { stav: 'chyba'; zprava: string }>>();
vi.mock('../../lib/bibleHledaniApi', () => ({
  hledejVKnihach: (d: string, id?: string) => hledejVKnihach(d, id),
  nactiPrehledy: async () => seznamPrehledu,
  nactiPrehled: (k: string) => nactiPrehled(k),
}));

import { BibleHledani, prehledyKDotazu, ZvyraznenyUryvek } from './BibleHledani';

const ID = '11111111-2222-3333-4444-555555555555';

beforeEach(() => {
  hledejVKnihach.mockReset();
  nactiPrehled.mockReset();
  seznamPrehledu = { stav: 'ok', prehledy: [], migrace: true };
});

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

const P = (klic: string, nazev: string): PolozkaPrehledu => ({ klic, nazev, oblast: 'F', kontrola: null, vytvoreno: null });

describe('přehledy témat s odkazy na knihy', () => {
  it('dokud nejsou, vysvětlí kdy vzniknou; pak je nabídne', async () => {
    const { unmount } = render(<BibleHledani otevri={() => {}} />);
    await waitFor(() => expect(screen.getByText(/až budou všechny knihy zpracované a přeložené/)).toBeTruthy());
    unmount();
    seznamPrehledu = { stav: 'ok', prehledy: [P('chmelovar', 'Chmelovar'), P('rmutovani', 'Rmutování')], migrace: true };
    render(<BibleHledani otevri={() => {}} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Rmutování' })).toBeTruthy());
  });

  it('dotaz „chmelovar" nabídne přehled; v přehledu citace i zdroje otevřou knihu na stránce', async () => {
    seznamPrehledu = { stav: 'ok', prehledy: [P('chmelovar', 'Chmelovar'), P('filtrace', 'Filtrace piva')], migrace: true };
    hledejVKnihach.mockResolvedValue({ stav: 'ok', vysledky: [] });
    nactiPrehled.mockResolvedValue({ stav: 'ok', prehled: {
      klic: 'chmelovar', nazev: 'Chmelovar', kontrola: null, vytvoreno: null,
      text: '## Doba varu\n\nVar trvá 60–90 min [1], odpar 6–8 % [2].',
      zdroje: [
        { n: 1, dokumentId: ID, nazev: 'Kniha A', pdfIndex: 40, tistena: '38', kapitola: 'Chmelovar', zdroj: 'preklad' },
        { n: 2, dokumentId: ID, nazev: 'Kniha B', pdfIndex: 7, tistena: null, kapitola: null, zdroj: 'original' },
      ],
    } });
    const otevri = vi.fn();
    render(<BibleHledani otevri={otevri} />);
    fireEvent.change(screen.getByLabelText('Hledat v knihách'), { target: { value: 'chmelovar' } });
    fireEvent.click(screen.getByRole('button', { name: /Hledat/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Chmelovar' })).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Filtrace piva' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Chmelovar' }));
    await waitFor(() => expect(screen.getByText('Doba varu')).toBeTruthy());
    expect(nactiPrehled).toHaveBeenCalledWith('chmelovar');
    fireEvent.click(screen.getByRole('button', { name: 'Zdroj 1: Kniha A, s. 38' }));
    expect(otevri).toHaveBeenLastCalledWith(ID, 40);
    // Seznam zdrojů dole: [2] Kniha B, list 7
    fireEvent.click(screen.getByText('Kniha B').closest('button')!);
    expect(otevri).toHaveBeenLastCalledWith(ID, 7);
    expect(screen.getAllByText('[2]')).toHaveLength(2); // citace v textu i ve zdrojích
    fireEvent.click(screen.getByRole('button', { name: /Zpět na hledání/ }));
    expect(screen.getByLabelText('Hledat v knihách')).toBeTruthy();
  });

  it('párování dotazu s názvem přehledu bez diakritiky', () => {
    const seznam = [P('chmelovar', 'Chmelovar'), P('rmutovani', 'Rmutování'), P('dekokce', 'Dekokční a infuzní rmutování')];
    expect(prehledyKDotazu(seznam, 'rmutovani teplota').map((p) => p.klic)).toEqual(['rmutovani', 'dekokce']);
    expect(prehledyKDotazu(seznam, 'xy')).toEqual([]);
  });
});
