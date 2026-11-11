import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Konverzace, Odpoved, StavChatu, UdalostChatu, ZpravaChatu } from '../../lib/bibleChatApi';

// Jen vymyšlené krátké věty — žádný text skutečných knih (repo je veřejné).
const ID = '11111111-2222-3333-4444-555555555555';
const KID = '99999999-8888-7777-6666-555555555555';

let stav: Odpoved<StavChatu>;
let konverzace: Konverzace[] = [];
const zeptejSe = vi.fn<(p: { otazka: string; konverzaceId?: string | null; problemId?: string | null; web?: boolean }, na: (u: UdalostChatu) => void) => Promise<unknown>>();
const nactiKonverzaci = vi.fn<(id: string) => Promise<Odpoved<{ id: string; nazev: string; problemId: string | null; zpravy: ZpravaChatu[] }>>>();
const smazKonverzaci = vi.fn<(id: string) => Promise<Odpoved<boolean>>>();
vi.mock('../../lib/bibleChatApi', async (puvodni) => ({
  ...(await puvodni<typeof import('../../lib/bibleChatApi')>()),
  nactiStavChatu: async () => stav,
  nactiKonverzace: async () => ({ stav: 'ok', data: konverzace }),
  nactiKonverzaci: (id: string) => nactiKonverzaci(id),
  smazKonverzaci: (id: string) => smazKonverzaci(id),
  zeptejSe: (p: never, na: never) => zeptejSe(p, na),
}));
vi.mock('../../lib/toast', () => ({ potvrd: async () => true }));

import { BibleChat, vykresliOdpoved } from './BibleChat';

const ZAPNUTO: Odpoved<StavChatu> = { stav: 'ok', data: { migrace: true, klic: true, utracenoUsd: 1.25, chatUsd: 1, chatDotazu: 4, stropUsd: 20, model: 'claude-opus-5-5' } };
const HOTOVO: UdalostChatu = {
  typ: 'hotovo', konverzaceId: KID, zpravaId: ID, text: '## Krátká odpověď\nPěnu drží **bílkoviny**[1].\n- ověř pH[2]', neuplna: false,
  model: 'claude-opus-5-5', cenaUsd: 0.12, utracenoUsd: 1.37, stropUsd: 20,
  kroky: [{ nastroj: 'hledej_v_knihach', popis: 'Hledám v knihách: „pěna“', chyba: false }],
  citace: [
    { n: 1, dokumentId: ID, pdfIndex: 12, nazev: 'Pivovarství', tistena: '10', kapitola: null, zdroj: 'preklad', url: null, citat: 'Bílkoviny drží pěnu.' },
    { n: 2, dokumentId: null, pdfIndex: null, nazev: 'Článek o pH', tistena: null, kapitola: null, zdroj: 'web', url: 'https://example.org/ph', citat: '' },
  ],
};

beforeEach(() => {
  stav = ZAPNUTO;
  konverzace = [];
  zeptejSe.mockReset();
  nactiKonverzaci.mockReset();
  smazKonverzaci.mockReset();
});

function zeptatSe(text: string) {
  fireEvent.change(screen.getByLabelText('Otázka pro AI sládka'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: /Zeptat se/ }));
}

describe('AI sládek (chatbot)', () => {
  it('průběh: kroky a průběžný text, pak odpověď s citacemi — číslo otevře stránku knihy, web jde ven', async () => {
    let dokonci: () => void = () => {};
    zeptejSe.mockImplementation(async (_p, na) => {
      na({ typ: 'start', konverzaceId: KID });
      na({ typ: 'krok', popis: 'Hledám v knihách: „pěna“' });
      na({ typ: 'text', text: 'Pěnu drží' });
      await new Promise<void>((r) => { dokonci = r; });
      na(HOTOVO);
      return { ok: true };
    });
    const otevri = vi.fn();
    render(<BibleChat otevri={otevri} />);
    expect(await screen.findByText(/Útrata za AI tento měsíc: 1,25 USD z 20,00 USD · model claude-opus-5-5/)).toBeTruthy();
    zeptatSe('Proč mi pivo málo pění?');
    expect(await screen.findByText('Hledám v knihách: „pěna“')).toBeTruthy();
    expect(screen.getByText('Pěnu drží')).toBeTruthy();
    expect(screen.getByLabelText('Tvoje otázka').textContent).toBe('Proč mi pivo málo pění?');
    expect(zeptejSe.mock.calls[0][0]).toEqual({ otazka: 'Proč mi pivo málo pění?', konverzaceId: null, problemId: null, web: false });
    await act(async () => { dokonci(); });
    const odpoved = await screen.findByRole('article', { name: 'Odpověď AI sládka' });
    expect(odpoved.querySelector('h4')?.textContent).toBe('Krátká odpověď');
    expect(screen.getByText('bílkoviny').closest('strong')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Zdroj 1: Pivovarství, s. 10' }));
    expect(otevri).toHaveBeenCalledWith(ID, 12);
    const web = screen.getByRole('link', { name: 'Zdroj 2: Článek o pH (web)' });
    expect(web.getAttribute('href')).toBe('https://example.org/ph');
    expect(web.getAttribute('rel')).toBe('noopener noreferrer');
    expect(screen.getByText('„Bílkoviny drží pěnu.“')).toBeTruthy();
    expect(screen.getByText(/Útrata za AI tento měsíc: 1,37 USD/)).toBeTruthy();
    // Navazující otázka jde do stejné konverzace.
    zeptejSe.mockResolvedValueOnce({ ok: true });
    zeptatSe('A co teplota?');
    await waitFor(() => expect(zeptejSe).toHaveBeenCalledTimes(2));
    expect(zeptejSe.mock.calls[1][0]).toMatchObject({ otazka: 'A co teplota?', konverzaceId: KID });
  });

  it('chyba před odpovědí (strop): hláška a otázka se vrátí do políčka', async () => {
    zeptejSe.mockResolvedValue({ ok: false, chyba: { kod: 'strop', zprava: 'Měsíční strop útraty za AI je vyčerpaný.', status: 429 } });
    render(<BibleChat otevri={() => {}} />);
    await screen.findByText(/Útrata za AI/);
    zeptatSe('Proč kalné pivo?');
    expect((await screen.findByRole('alert')).textContent).toBe('Měsíční strop útraty za AI je vyčerpaný.');
    expect(screen.queryByLabelText('Tvoje otázka')).toBeNull();
    expect((screen.getByLabelText('Otázka pro AI sládka') as HTMLTextAreaElement).value).toBe('Proč kalné pivo?');
  });

  it('vypnutý (strop 0) nebo bez klíče: vysvětlení a tlačítko nejde', async () => {
    stav = { stav: 'ok', data: { ...(ZAPNUTO as { data: StavChatu }).data, stropUsd: 0 } };
    const { unmount } = render(<BibleChat otevri={() => {}} />);
    expect(await screen.findByText(/AI sládek je vypnutý/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Otázka pro AI sládka'), { target: { value: 'Otázka' } });
    expect((screen.getByRole('button', { name: /Zeptat se/ }) as HTMLButtonElement).disabled).toBe(true);
    unmount();
    stav = { stav: 'ok', data: { ...(ZAPNUTO as { data: StavChatu }).data, klic: false } };
    render(<BibleChat otevri={() => {}} />);
    expect(await screen.findByText(/nemá klíč k Claude API/)).toBeTruthy();
  });

  it('historie: otevře konverzaci se zprávami a smaže ji', async () => {
    konverzace = [{ id: KID, nazev: 'Pěna', problemId: null, upraveno: '2026-11-11T10:00:00Z', zprav: 2 }];
    nactiKonverzaci.mockResolvedValue({ stav: 'ok', data: { id: KID, nazev: 'Pěna', problemId: null, zpravy: [
      { id: ID, role: 'uzivatel', text: 'Starší otázka', kroky: [], citace: [], model: null, cenaUsd: 0, neuplna: false, vytvoreno: null },
      { id: KID, role: 'asistent', text: 'Starší odpověď', kroky: [], citace: [], model: 'm', cenaUsd: 0.05, neuplna: true, vytvoreno: null },
    ] } });
    smazKonverzaci.mockResolvedValue({ stav: 'ok', data: true });
    render(<BibleChat otevri={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: /Historie \(1\)/ }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Pěna/ })); });
    expect(nactiKonverzaci).toHaveBeenCalledWith(KID);
    expect(screen.getByText('Starší otázka')).toBeTruthy();
    expect(screen.getByText('Starší odpověď')).toBeTruthy();
    expect(screen.getByText('neúplná odpověď')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Historie/ }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Smazat konverzaci Pěna' })); });
    expect(smazKonverzaci).toHaveBeenCalledWith(KID);
    expect(screen.queryByText('Starší otázka')).toBeNull();
  });

  it('otázka zvenku (Analýza problémů) se pošle hned jednou, s problémem', async () => {
    zeptejSe.mockResolvedValue({ ok: true });
    const { rerender } = render(<BibleChat otevri={() => {}} problem={{ id: ID, nazev: 'Málo pěny' }} otazkaZvenku={{ text: 'Najdi příčiny', klic: 1 }} />);
    await waitFor(() => expect(zeptejSe).toHaveBeenCalledTimes(1));
    expect(zeptejSe.mock.calls[0][0]).toMatchObject({ otazka: 'Najdi příčiny', problemId: ID });
    expect(screen.getByText(/Analýza problému „Málo pěny“/)).toBeTruthy();
    rerender(<BibleChat otevri={() => {}} problem={{ id: ID, nazev: 'Málo pěny' }} otazkaZvenku={{ text: 'Najdi příčiny', klic: 1 }} />);
    await act(async () => {});
    expect(zeptejSe).toHaveBeenCalledTimes(1);
  });

  it('vykreslení textu: odrážky, tučně i s citací uvnitř, neznámé číslo zůstane textem', () => {
    const otevri = vi.fn();
    const mapa = new Map(HOTOVO.typ === 'hotovo' ? HOTOVO.citace.map((c) => [c.n, c]) : []);
    render(<p>{vykresliOdpoved('- **pH 5,2[1]** a [9]', mapa, otevri)}</p>);
    expect(screen.getByText(/^•/)).toBeTruthy();
    expect(screen.getByText('pH 5,2').closest('strong')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Zdroj 1: Pivovarství, s. 10' }));
    expect(otevri).toHaveBeenCalledWith(ID, 12);
    expect(screen.getByText(/\[9\]/)).toBeTruthy();
  });
});
