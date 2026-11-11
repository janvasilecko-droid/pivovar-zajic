import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { FiltrHledani, Hledani, PolozkaPrehledu, PrehledTematu } from '../../lib/bibleHledaniApi';

// Jen vymyšlené krátké věty — žádný text skutečných knih (repo je veřejné).
const hledejVKnihach = vi.fn<(dotaz: string, id?: string, filtr?: FiltrHledani | null) => Promise<Hledani>>();
let seznamPrehledu: { stav: 'ok'; prehledy: PolozkaPrehledu[]; migrace: boolean } = { stav: 'ok', prehledy: [], migrace: true };
const nactiPrehled = vi.fn<(klic: string) => Promise<{ stav: 'ok'; prehled: PrehledTematu } | { stav: 'chyba'; zprava: string }>>();
vi.mock('../../lib/bibleHledaniApi', async (puvodni) => ({
  ...(await puvodni<typeof import('../../lib/bibleHledaniApi')>()),
  hledejVKnihach: (d: string, id?: string, f?: FiltrHledani | null) => hledejVKnihach(d, id, f),
  nactiPrehledy: async () => seznamPrehledu,
  nactiPrehled: (k: string) => nactiPrehled(k),
}));

let vazbyVydani: { stav: 'ok'; vazby: { id: string; predchozi: string }[]; migrace: boolean } = { stav: 'ok', vazby: [], migrace: true };
vi.mock('../../lib/bibleKnihovnaApi', () => ({
  nactiVydani: async () => vazbyVydani,
  nactiDokumenty: async () => ({ stav: 'ok', dokumenty: [
    { id: '11111111-2222-3333-4444-555555555555', nazev: 'Pivovarství', rok: 2019, stav: 'hotovo' },
    { id: '99999999-2222-3333-4444-555555555555', nazev: 'Rozpracovaná', rok: 2020, stav: 'zpracovava' },
  ] }),
}));

// Zkušenosti sládků (hledají se souběžně s knihami).
type Zk = { id: string; typ: string; nazev: string; text: string; oblasti: string[]; uroven: number; zdroj: string | null;
  zapsal: string | null; zapsalJmeno: string | null; vytvoreno: string | null; upraveno: string | null };
const nactiZkusenosti = vi.fn<(f: { dotaz?: string; oblast?: string }, v?: { volne?: boolean }) => Promise<
  { stav: 'ok'; zkusenosti: Zk[]; migrace: boolean; volne: boolean } | { stav: 'chyba'; zprava: string }>>();
vi.mock('../../lib/bibleZkusenostiApi', async (puvodni) => ({
  ...(await puvodni<typeof import('../../lib/bibleZkusenostiApi')>()),
  nactiZkusenosti: (f: { dotaz?: string; oblast?: string }, v?: { volne?: boolean }) => nactiZkusenosti(f, v),
}));
const zk = (navic: Partial<Zk> = {}): Zk => ({
  id: 'z1', typ: 'reseni_problemu', nazev: 'Pěna po stočení', text: 'Pomohlo snížit tlak při stáčení.', oblasti: ['F'], uroven: 4,
  zdroj: 'Pivovar U Zajíce', zapsal: 'u1', zapsalJmeno: 'Honza', vytvoreno: null, upraveno: null, ...navic,
});

import { BibleHledani, prehledyKDotazu, ZvyraznenyUryvek } from './BibleHledani';

const ID = '11111111-2222-3333-4444-555555555555';

beforeEach(() => {
  hledejVKnihach.mockReset();
  nactiPrehled.mockReset();
  nactiZkusenosti.mockReset().mockResolvedValue({ stav: 'ok', zkusenosti: [], migrace: true, volne: false });
  seznamPrehledu = { stav: 'ok', prehledy: [], migrace: true };
  vazbyVydani = { stav: 'ok', vazby: [], migrace: true };
});

describe('zkušenosti sládků v hledání', () => {
  const vysledekKnihy = { dokumentId: ID, nazev: 'Pivovarství', autor: null, rok: null, zdroj: 'original' as const, pdfIndex: 3, tistena: null, kapitola: null, druh: 'text', uryvek: 'Pěna a tlak.' };

  it('ukáže zkušenosti s úrovní důvěryhodnosti nad výsledky z knih (hledá se i volně)', async () => {
    hledejVKnihach.mockResolvedValue({ stav: 'ok', vysledky: [vysledekKnihy] });
    nactiZkusenosti.mockResolvedValue({ stav: 'ok', zkusenosti: [zk()], migrace: true, volne: false });
    render(<BibleHledani otevri={() => {}} />);
    fireEvent.change(screen.getByLabelText('Hledat v knihách'), { target: { value: 'pěna' } });
    fireEvent.click(screen.getByRole('button', { name: /Hledat/ }));
    const blok = await screen.findByRole('region', { name: 'Zkušenosti sládků k dotazu' });
    expect(blok.textContent).toContain('Pěna po stočení');
    expect(blok.textContent).toContain('úroveň 4: Zkušenost jednoho sládka');
    expect(blok.textContent).toContain('Řešení problému');
    expect(blok.textContent).toContain('Zdroj: Pivovar U Zajíce');
    expect(nactiZkusenosti).toHaveBeenCalledWith({ dotaz: 'pěna', oblast: undefined }, { volne: true });
    expect(screen.getByText(/Nalezeno 1/)).toBeTruthy();
    // Blok zkušeností je v pořadí před výsledky z knih.
    expect(blok.compareDocumentPosition(screen.getByText(/Nalezeno 1/)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('dlouhý text se zkrátí a rozbalí; víc než tři zkušenosti až na požádání', async () => {
    hledejVKnihach.mockResolvedValue({ stav: 'ok', vysledky: [] });
    const dlouhy = `${'Slovo '.repeat(60)}konec textu.`;
    nactiZkusenosti.mockResolvedValue({ stav: 'ok', migrace: true, volne: true, zkusenosti: [
      zk({ id: 'a', text: dlouhy }), zk({ id: 'b', nazev: 'Druhá' }), zk({ id: 'c', nazev: 'Třetí' }), zk({ id: 'd', nazev: 'Čtvrtá' }),
    ] });
    render(<BibleHledani otevri={() => {}} />);
    fireEvent.change(screen.getByLabelText('Hledat v knihách'), { target: { value: 'proč málo pění' } });
    fireEvent.click(screen.getByRole('button', { name: /Hledat/ }));
    const blok = await screen.findByRole('region', { name: 'Zkušenosti sládků k dotazu' });
    expect(blok.textContent).not.toContain('konec textu.');
    expect(blok.textContent).not.toContain('Čtvrtá');
    // V knihách nic — hláška to řekne jen o knihách.
    expect(screen.getByText(/V knihách jsem nic nenašel pro „proč málo pění“/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Celý text' }));
    expect(blok.textContent).toContain('konec textu.');
    expect(screen.getByRole('button', { name: 'Zkrátit' }).getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Další zkušenosti (1)' }));
    expect(blok.textContent).toContain('Čtvrtá');
  });

  it('s filtrem knihy, autora, roku, jazyka nebo druhu se zkušenosti nehledají; oblast ano', async () => {
    hledejVKnihach.mockResolvedValue({ stav: 'ok', vysledky: [vysledekKnihy] });
    render(<BibleHledani otevri={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Filtry/ }));
    fireEvent.change(screen.getByLabelText('Oblast'), { target: { value: 'F' } });
    fireEvent.change(screen.getByLabelText('Hledat v knihách'), { target: { value: 'pěna' } });
    fireEvent.click(screen.getByRole('button', { name: /^Hledat/ }));
    await waitFor(() => expect(nactiZkusenosti).toHaveBeenLastCalledWith({ dotaz: 'pěna', oblast: 'F' }, { volne: true }));
    const pocet = nactiZkusenosti.mock.calls.length;
    fireEvent.change(screen.getByLabelText('Jazyk knihy'), { target: { value: 'de' } });
    await waitFor(() => expect(hledejVKnihach).toHaveBeenLastCalledWith('pěna', undefined, expect.objectContaining({ jazyk: 'de' })));
    expect(nactiZkusenosti.mock.calls.length).toBe(pocet);
  });

  it('chyba zkušeností hledání v knihách nezastaví', async () => {
    hledejVKnihach.mockResolvedValue({ stav: 'ok', vysledky: [vysledekKnihy] });
    nactiZkusenosti.mockResolvedValue({ stav: 'chyba', zprava: 'Databáze neodpovídá.' });
    render(<BibleHledani otevri={() => {}} />);
    fireEvent.change(screen.getByLabelText('Hledat v knihách'), { target: { value: 'pěna' } });
    fireEvent.click(screen.getByRole('button', { name: /Hledat/ }));
    await waitFor(() => expect(screen.getByText(/Nalezeno 1/)).toBeTruthy());
    expect(screen.queryByRole('region', { name: 'Zkušenosti sládků k dotazu' })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('hledání v knihách', () => {
  it('výsledek ze staršího vydání má označení (v knihovně je novější)', async () => {
    vazbyVydani = { stav: 'ok', vazby: [{ id: 'nove-vydani', predchozi: ID }], migrace: true };
    hledejVKnihach.mockResolvedValue({ stav: 'ok', vysledky: [
      { dokumentId: ID, nazev: 'Pivovarství, 1. vyd.', autor: null, rok: 1990, zdroj: 'original', pdfIndex: 3, tistena: null, kapitola: null, druh: 'text', uryvek: 'Rmut 62 °C.' },
      { dokumentId: 'nove-vydani', nazev: 'Pivovarství, 2. vyd.', autor: null, rok: 2010, zdroj: 'original', pdfIndex: 5, tistena: null, kapitola: null, druh: 'text', uryvek: 'Rmut 63 °C.' },
    ] });
    render(<BibleHledani otevri={() => {}} />);
    fireEvent.change(screen.getByLabelText('Hledat v knihách'), { target: { value: 'rmut' } });
    fireEvent.click(screen.getByRole('button', { name: /Hledat/ }));
    await waitFor(() => expect(screen.getByText(/Nalezeno 2/)).toBeTruthy());
    const oznaceni = screen.getAllByText('starší vydání — v knihovně je novější');
    expect(oznaceni).toHaveLength(1);
    expect(oznaceni[0].closest('button')!.textContent).toContain('Pivovarství, 1. vyd.');
  });

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
    expect(hledejVKnihach).toHaveBeenCalledWith('amylaza', undefined, {});
    expect(screen.getByText('· s. 158')).toBeTruthy();
    expect(screen.getByText('· list 12')).toBeTruthy();
    expect(screen.getByText('český překlad')).toBeTruthy();
    expect(screen.getByText('originál')).toBeTruthy();
    expect(screen.getByText('β-amyláza').tagName).toBe('MARK');
    fireEvent.click(screen.getByText('· s. 158'));
    expect(otevri).toHaveBeenCalledWith(ID, 170);
  });

  it('otázka v běžné řeči: poznámka o volném hledání, shoda a zvýraznění začátků slov; otázka pro AI sládka', async () => {
    hledejVKnihach.mockResolvedValue({ stav: 'ok', volne: true, slova: ['amylaz', 'pomal'], vysledky: [
      { dokumentId: ID, nazev: 'Pivovarství', autor: null, rok: null, zdroj: 'original', pdfIndex: 4, tistena: null, kapitola: null, druh: 'text', uryvek: 'Amyláza pracuje pomaleji.', shoda: 2, slov: 3 },
    ] });
    const zeptatSe = vi.fn();
    render(<BibleHledani otevri={() => {}} zeptatSe={zeptatSe} />);
    fireEvent.change(screen.getByLabelText('Hledat v knihách'), { target: { value: 'proč amyláza pracuje pomalu' } });
    fireEvent.click(screen.getByRole('button', { name: /Hledat/ }));
    await waitFor(() => expect(screen.getByText(/Všechna slova na jedné stránce nejsou/)).toBeTruthy());
    expect(screen.getByText(/amylaz…, pomal…/)).toBeTruthy();
    expect(screen.getByText('shoda 2 z 3 slov')).toBeTruthy();
    expect(screen.getByText('pomaleji.').tagName).toBe('MARK');
    expect(screen.getByText('pracuje').tagName).toBe('SPAN');
    fireEvent.click(screen.getByRole('button', { name: /Zeptat se AI sládka/ }));
    expect(zeptatSe).toHaveBeenCalledWith('proč amyláza pracuje pomalu');
  });

  it('filtry: výběr hned hledá znovu, nad výsledky je filtr slovy, zrušení hledá bez filtru', async () => {
    hledejVKnihach.mockResolvedValue({ stav: 'ok', vysledky: [
      { dokumentId: ID, nazev: 'Pivovarství', autor: null, rok: 2019, zdroj: 'original', pdfIndex: 4, tistena: null, kapitola: null, druh: 'text', uryvek: 'Würze und Maische.' },
    ], slova: ['mladin', 'wurz'], varianty: true });
    render(<BibleHledani otevri={() => {}} />);
    fireEvent.change(screen.getByLabelText('Hledat v knihách'), { target: { value: 'mladina' } });
    fireEvent.click(screen.getByRole('button', { name: /^Hledat$/ }));
    await waitFor(() => expect(screen.getByText(/Nalezeno 1/)).toBeTruthy());
    expect(screen.getByText('Würze').tagName).toBe('MARK');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Filtry/ })); });
    expect(screen.getByRole('option', { name: 'Pivovarství (2019)' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: /Rozpracovaná/ })).toBeNull();
    await act(async () => { fireEvent.change(screen.getByLabelText('Jazyk knihy'), { target: { value: 'de' } }); });
    await waitFor(() => expect(hledejVKnihach).toHaveBeenLastCalledWith('mladina', undefined, { jazyk: 'de' }));
    await act(async () => { fireEvent.change(screen.getByLabelText('Kniha'), { target: { value: ID } }); });
    await waitFor(() => expect(hledejVKnihach).toHaveBeenLastCalledWith('mladina', ID, { jazyk: 'de' }));
    expect(screen.getByText(/filtr: Pivovarství · němčina/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Rok od'), { target: { value: '1970' } });
    await act(async () => { fireEvent.blur(screen.getByLabelText('Rok od')); });
    await waitFor(() => expect(hledejVKnihach).toHaveBeenLastCalledWith('mladina', ID, { jazyk: 'de', rokOd: 1970 }));
    expect(screen.getByRole('button', { name: 'Filtry (3)' })).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Zrušit filtry' })); });
    await waitFor(() => expect(hledejVKnihach).toHaveBeenLastCalledWith('mladina', undefined, {}));
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
    await waitFor(() => expect(screen.getAllByText(/až budou všechny knihy zpracované a přeložené/)).toHaveLength(2));
    expect(screen.getByRole('region', { name: 'Pracovní postupy' }).textContent).toContain('šrotování, rmutování');
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
  it('pracovní postupy: zvlášť pod přehledy, bez předpony „Postup:"; otevřený postup má upozornění', async () => {
    seznamPrehledu = { stav: 'ok', prehledy: [P('chmelovar', 'Chmelovar'), P('postup_chmelovar', 'Postup: chmelovar a dávkování chmele')], migrace: true };
    nactiPrehled.mockResolvedValue({ stav: 'ok', prehled: {
      klic: 'postup_chmelovar', nazev: 'Postup: chmelovar a dávkování chmele', kontrola: null, vytvoreno: null,
      text: '## Postup\n1. Mladinu přiveď k varu [1].',
      zdroje: [{ n: 1, dokumentId: ID, nazev: 'Kniha A', pdfIndex: 40, tistena: '38', kapitola: null, zdroj: 'preklad' }],
    } });
    render(<BibleHledani otevri={() => {}} />);
    const postupy = await screen.findByRole('region', { name: 'Pracovní postupy' });
    const prehledy = screen.getByRole('region', { name: 'Přehledy témat' });
    expect(prehledy.textContent).toContain('Chmelovar');
    expect(prehledy.textContent).not.toContain('dávkování');
    fireEvent.click(screen.getByRole('button', { name: 'Chmelovar a dávkování chmele' }));
    expect(postupy).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Pracovní postup')).toBeTruthy());
    expect(nactiPrehled).toHaveBeenCalledWith('postup_chmelovar');
    expect(screen.getByRole('note').textContent).toContain('porovnej ho s návodem k vašemu zařízení');
    expect(screen.getByText(/Mladinu přiveď k varu/)).toBeTruthy();
  });
});

describe('přehled s citacemi ve tvaru [1, 2]', () => {
  it('i skupinová citace je odkaz; zdroje dole jen citované', async () => {
    seznamPrehledu = { stav: 'ok', prehledy: [P('chmelovar', 'Chmelovar')], migrace: true };
    nactiPrehled.mockResolvedValue({ stav: 'ok', prehled: {
      klic: 'chmelovar', nazev: 'Chmelovar', kontrola: null, vytvoreno: null,
      text: 'Var trvá 60–90 min [1, 2].',
      zdroje: [
        { n: 1, dokumentId: ID, nazev: 'Kniha A', pdfIndex: 40, tistena: '38', kapitola: null, zdroj: 'preklad' },
        { n: 2, dokumentId: ID, nazev: 'Kniha B', pdfIndex: 7, tistena: null, kapitola: null, zdroj: 'original' },
        { n: 3, dokumentId: ID, nazev: 'Kniha C', pdfIndex: 9, tistena: null, kapitola: null, zdroj: 'original' },
      ],
    } });
    const otevri = vi.fn();
    render(<BibleHledani otevri={otevri} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Chmelovar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Zdroj 2: Kniha B, list 7' }));
    expect(otevri).toHaveBeenLastCalledWith(ID, 7);
    expect(screen.queryByText('Kniha C')).toBeNull();
  });
});
