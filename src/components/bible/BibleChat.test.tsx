import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
const zalozDotazClaude = vi.fn<(p: { dotazId: string; otazka: string; konverzaceId: string | null; problemId: string | null }) => Promise<Odpoved<{ konverzaceId: string | null; dotazId: string }>>>();
vi.mock('../../lib/bibleChatApi', async (puvodni) => ({
  ...(await puvodni<typeof import('../../lib/bibleChatApi')>()),
  nactiStavChatu: async () => stav,
  nactiKonverzace: async () => ({ stav: 'ok', data: konverzace }),
  nactiKonverzaci: (id: string) => nactiKonverzaci(id),
  smazKonverzaci: (id: string) => smazKonverzaci(id),
  zeptejSe: (p: never, na: never) => zeptejSe(p, na),
  zalozDotazClaude: (p: never) => zalozDotazClaude(p),
}));
vi.mock('../../lib/toast', () => ({ potvrd: async () => true }));

import { BibleChat, KONTROLA_ODPOVEDI_MS, vykresliOdpoved } from './BibleChat';

const ZAPNUTO: Odpoved<StavChatu> = { stav: 'ok', data: { migrace: true, klic: true, utracenoUsd: 1.25, chatUsd: 1, chatDotazu: 4, stropUsd: 20, model: 'claude-opus-5-5' } };
const HOTOVO: UdalostChatu = {
  typ: 'hotovo', konverzaceId: KID, zpravaId: ID, text: '## Krátká odpověď\nPěnu drží **bílkoviny**[1].\n- ověř pH[2]', neuplna: false,
  model: 'claude-opus-5-5', cenaUsd: 0.12, utracenoUsd: 1.37, stropUsd: 20, chybaKod: null,
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
  zalozDotazClaude.mockReset();
});
afterEach(() => { vi.useRealTimers(); });

function zeptatSe(text: string) {
  fireEvent.change(screen.getByLabelText('Otázka pro AI sládka'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: /Odpovědět tady/ }));
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
    expect((screen.getByRole('button', { name: /Odpovědět tady/ }) as HTMLButtonElement).disabled).toBe(true);
    // Přes předplatné v aplikaci Claude to jde dál.
    expect(screen.getByRole('link', { name: /Zeptat se v Claude \(předplatné\)/ }).getAttribute('href')).toMatch(/^https:\/\/claude\.ai\/new\?q=/);
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

  it('otázka zvenku (Analýza problémů) se jen připraví — kudy se zeptat, vybere člověk; API dostane i problém', async () => {
    zeptejSe.mockResolvedValue({ ok: true });
    render(<BibleChat otevri={() => {}} problem={{ id: ID, nazev: 'Málo pěny' }} otazkaZvenku={{ text: 'Najdi příčiny', klic: 1 }} />);
    await screen.findByText(/Útrata za AI/);
    expect(zeptejSe).not.toHaveBeenCalled();
    expect((screen.getByLabelText('Otázka pro AI sládka') as HTMLTextAreaElement).value).toBe('Najdi příčiny');
    expect(screen.getByText(/Analýza problému „Málo pěny“/)).toBeTruthy();
    // Do Claude jde zadání s názvem problému.
    const zadani = decodeURIComponent(screen.getByRole('link', { name: /Zeptat se v Claude/ }).getAttribute('href')!.split('?q=')[1]);
    expect(zadani).toContain('analyzuj problém „Málo pěny“');
    expect(zadani).toContain('Otázka: Najdi příčiny');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Odpovědět tady/ })); });
    expect(zeptejSe).toHaveBeenCalledTimes(1);
    expect(zeptejSe.mock.calls[0][0]).toMatchObject({ otazka: 'Najdi příčiny', problemId: ID });
  });

  it('„Zeptat se v Claude": odkaz s otázkou a konektorem, zadání do schránky a vysvětlení', async () => {
    const zapis = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: zapis }, configurable: true });
    render(<BibleChat otevri={() => {}} />);
    await screen.findByText(/Útrata za AI/);
    // Bez otázky nejde.
    expect((screen.getByRole('button', { name: /Zeptat se v Claude/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Otázka pro AI sládka'), { target: { value: 'Proč málo pění?' } });
    const odkaz = screen.getByRole('link', { name: /Zeptat se v Claude \(předplatné\)/ });
    expect(odkaz.getAttribute('target')).toBe('_blank');
    expect(odkaz.getAttribute('rel')).toContain('noopener');
    const zadani = decodeURIComponent(odkaz.getAttribute('href')!.replace('https://claude.ai/new?q=', ''));
    expect(zadani).toContain('konektor „Pivovarská bible“');
    expect(zadani.endsWith('Otázka: Proč málo pění?')).toBe(true);
    // Bez migrace ukládání (stav.dotazy) se odpověď do appky neukládá: zadání bez dotaz_id.
    expect(zadani).not.toContain('dotaz_id');
    fireEvent.click(odkaz);
    expect(zapis).toHaveBeenCalledWith(zadani);
    expect(screen.getByRole('status').textContent).toMatch(/v mobilní aplikaci Claude ji stačí vložit/);
    expect(screen.getByRole('status').textContent).toMatch(/pustit migraci bible 20261114000000_bible_dotazy_claude/);
    expect(zeptejSe).not.toHaveBeenCalled();
    expect(zalozDotazClaude).not.toHaveBeenCalled();
  });

  it('na předplatné s odpovědí zpátky (R33): otázka se uloží, appka čeká a odpověď z Claude sama načte', async () => {
    stav = { stav: 'ok', data: { ...(ZAPNUTO as { data: StavChatu }).data, dotazy: true } };
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn(async () => {}) }, configurable: true });
    zalozDotazClaude.mockImplementation(async (p) => ({ stav: 'ok', data: { konverzaceId: KID, dotazId: p.dotazId } }));
    const otevri = vi.fn();
    render(<BibleChat otevri={otevri} />);
    await screen.findByText(/Útrata za AI/);
    fireEvent.change(screen.getByLabelText('Otázka pro AI sládka'), { target: { value: 'Proč kvašení stojí?' } });
    const odkaz = screen.getByRole('link', { name: /Zeptat se v Claude \(předplatné\)/ });
    const zadani = decodeURIComponent(odkaz.getAttribute('href')!.replace('https://claude.ai/new?q=', ''));
    const dotazId = /dotaz_id: ([0-9a-f-]{36})/.exec(zadani)![1];
    expect(zadani).toContain('nástrojem uloz_odpoved');
    fireEvent.click(odkaz);
    await waitFor(() => expect(zalozDotazClaude).toHaveBeenCalledWith({ dotazId, otazka: 'Proč kvašení stojí?', konverzaceId: null, problemId: null }));
    expect(await screen.findByRole('article', { name: 'Čeká na odpověď z aplikace Claude' })).toBeTruthy();
    expect(screen.getByLabelText('Tvoje otázka').textContent).toBe('Proč kvašení stojí?');
    expect((screen.getByLabelText('Otázka pro AI sládka') as HTMLTextAreaElement).value).toBe('');
    expect(screen.getByRole('status').textContent).toMatch(/Claude odpověď uloží sem do konverzace/);

    const otazka: ZpravaChatu = { id: dotazId, role: 'uzivatel', text: 'Proč kvašení stojí?', kroky: [], citace: [], model: null, cenaUsd: 0, neuplna: false,
      vytvoreno: '2026-11-14T10:00:00Z', proClaude: true, odpovedNa: null };
    const odpoved: ZpravaChatu = { id: ID, role: 'asistent', text: '## Krátká odpověď\nTeplota je nízká [1].', kroky: [], model: 'aplikace Claude (předplatné)',
      cenaUsd: 0, neuplna: false, vytvoreno: '2026-11-14T10:01:00Z', proClaude: false, odpovedNa: dotazId,
      citace: [{ n: 1, dokumentId: ID, pdfIndex: 12, nazev: 'Pivovarství', tistena: '10', kapitola: null, zdroj: 'original', url: null, citat: '' }] };
    nactiKonverzaci
      .mockResolvedValueOnce({ stav: 'ok', data: { id: KID, nazev: 'Proč kvašení stojí?', problemId: null, zpravy: [otazka] } })
      .mockResolvedValue({ stav: 'ok', data: { id: KID, nazev: 'Proč kvašení stojí?', problemId: null, zpravy: [otazka, odpoved] } });
    // Ruční kontrola: ještě nic.
    await waitFor(() => expect((screen.getByRole('button', { name: 'Zkontrolovat teď' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Zkontrolovat teď' }));
    await waitFor(() => expect(nactiKonverzaci).toHaveBeenCalledWith(KID));
    expect(screen.getByRole('article', { name: 'Čeká na odpověď z aplikace Claude' })).toBeTruthy();
    // Návrat do appky z aplikace Claude: odpověď je tu.
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    const clanek = await screen.findByRole('article', { name: 'Odpověď AI sládka' });
    expect(clanek.textContent).toContain('Odpověď z aplikace Claude · předplatné');
    expect(clanek.textContent).not.toContain('USD');
    expect(screen.queryByRole('article', { name: 'Čeká na odpověď z aplikace Claude' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Zdroj 1: Pivovarství, s. 10' }));
    expect(otevri).toHaveBeenCalledWith(ID, 12);
    // Další otázka dostane nové id a navazuje na konverzaci.
    fireEvent.change(screen.getByLabelText('Otázka pro AI sládka'), { target: { value: 'A teplota?' } });
    const dalsi = decodeURIComponent(screen.getByRole('link', { name: /Zeptat se v Claude/ }).getAttribute('href')!.replace('https://claude.ai/new?q=', ''));
    expect(/dotaz_id: ([0-9a-f-]{36})/.exec(dalsi)![1]).not.toBe(dotazId);
    expect(dalsi).toContain('nástrojem dotaz_z_appky');
  });

  it('uložení otázky selže (chybí migrace): otázka se vrátí do políčka a appka řekne proč', async () => {
    stav = { stav: 'ok', data: { ...(ZAPNUTO as { data: StavChatu }).data, dotazy: true } };
    zalozDotazClaude.mockResolvedValue({ stav: 'chyba', kod: 'bez_migrace', zprava: 'Databáze bible ještě nemá potřebnou migraci.' });
    render(<BibleChat otevri={() => {}} />);
    await screen.findByText(/Útrata za AI/);
    fireEvent.change(screen.getByLabelText('Otázka pro AI sládka'), { target: { value: 'Proč kvašení stojí?' } });
    fireEvent.click(screen.getByRole('link', { name: /Zeptat se v Claude/ }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/čeká na migraci databáze bible 20261114000000_bible_dotazy_claude/);
    expect((screen.getByLabelText('Otázka pro AI sládka') as HTMLTextAreaElement).value).toBe('Proč kvašení stojí?');
    expect(screen.queryByRole('article', { name: 'Čeká na odpověď z aplikace Claude' })).toBeNull();
  });

  it('pozdní odpověď serveru pro dřív otevřenou konverzaci nepřepíše tu, kterou člověk otevřel mezitím', async () => {
    stav = { stav: 'ok', data: { ...(ZAPNUTO as { data: StavChatu }).data, dotazy: true } };
    const A = KID;
    const B = '77777777-8888-7777-6666-555555555555';
    konverzace = [
      { id: A, nazev: 'Kvašení', problemId: null, upraveno: null, zprav: 1, cekaClaude: true },
      { id: B, nazev: 'Pěna', problemId: null, upraveno: null, zprav: 1, cekaClaude: false },
    ];
    const zprava = (id: string, text: string, navic: Partial<ZpravaChatu> = {}): ZpravaChatu => ({
      id, role: 'uzivatel', text, kroky: [], citace: [], model: null, cenaUsd: 0, neuplna: false, vytvoreno: null, proClaude: false, odpovedNa: null, ...navic,
    });
    const otazkaA = zprava('dddddddd-0000-4000-8000-00000000000a', 'Proč kvašení stojí?', { proClaude: true });
    let pustA: () => void = () => {};
    let volaniA = 0;
    nactiKonverzaci.mockImplementation(async (id: string) => {
      if (id === B) return { stav: 'ok', data: { id: B, nazev: 'Pěna', problemId: null, zpravy: [zprava('dddddddd-0000-4000-8000-00000000000b', 'Proč málo pění?')] } };
      volaniA++;
      if (volaniA > 1) await new Promise<void>((r) => { pustA = r; });
      return { stav: 'ok', data: { id: A, nazev: 'Kvašení', problemId: null, zpravy: volaniA > 1
        ? [otazkaA, zprava(ID, 'Pozdní odpověď pro A', { role: 'asistent', odpovedNa: otazkaA.id })] : [otazkaA] } };
    });
    render(<BibleChat otevri={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: /Historie/ }));
    fireEvent.click(await screen.findByRole('button', { name: /^Kvašení/ }));
    await screen.findByRole('article', { name: 'Čeká na odpověď z aplikace Claude' });
    await waitFor(() => expect((screen.getByRole('button', { name: 'Zkontrolovat teď' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Zkontrolovat teď' }));
    await waitFor(() => expect(volaniA).toBe(2));
    fireEvent.click(screen.getByRole('button', { name: /Historie/ }));
    fireEvent.click(await screen.findByRole('button', { name: /^Pěna/ }));
    await screen.findByText('Proč málo pění?');
    expect(screen.getByLabelText('Tvoje otázka').textContent).toBe('Proč málo pění?');
    await act(async () => { pustA(); });
    expect(screen.getByLabelText('Tvoje otázka').textContent).toBe('Proč málo pění?');
    expect(screen.queryByText('Pozdní odpověď pro A')).toBeNull();
  });

  it('historie ukáže konverzaci, která čeká na odpověď z Claude; po otevření se na ni čeká', async () => {
    // Falešné hodiny od začátku (běží i reálně, ať čekání testovací knihovny funguje).
    vi.useFakeTimers({ shouldAdvanceTime: true });
    stav = { stav: 'ok', data: { ...(ZAPNUTO as { data: StavChatu }).data, dotazy: true } };
    konverzace = [{ id: KID, nazev: 'Kvašení', problemId: null, upraveno: '2026-11-14T10:00:00Z', zprav: 1, cekaClaude: true }];
    nactiKonverzaci.mockResolvedValue({ stav: 'ok', data: { id: KID, nazev: 'Kvašení', problemId: null, zpravy: [{
      id: 'dddddddd-0000-4000-8000-000000000009', role: 'uzivatel', text: 'Proč kvašení stojí?', kroky: [], citace: [], model: null, cenaUsd: 0,
      neuplna: false, vytvoreno: '2026-11-14T10:00:00Z', proClaude: true, odpovedNa: null,
    }] } });
    render(<BibleChat otevri={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: /Historie/ }));
    expect(await screen.findByText(/čeká na odpověď z Claude/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Kvašení/ }));
    expect(await screen.findByRole('article', { name: 'Čeká na odpověď z aplikace Claude' })).toBeTruthy();
    // Appka se sama ptá znovu (každých KONTROLA_ODPOVEDI_MS), dokud odpověď nepřijde.
    try {
      const pred = nactiKonverzaci.mock.calls.length;
      await act(async () => { await vi.advanceTimersByTimeAsync(KONTROLA_ODPOVEDI_MS + 10); });
      expect(nactiKonverzaci.mock.calls.length).toBe(pred + 1);
      await act(async () => { await vi.advanceTimersByTimeAsync(KONTROLA_ODPOVEDI_MS + 10); });
      expect(nactiKonverzaci.mock.calls.length).toBe(pred + 2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('API bez kreditu: doporučí předplatné a otázka zůstane v políčku (chyba i hotová odpověď s chybou)', async () => {
    zeptejSe.mockResolvedValueOnce({ ok: false, chyba: { kod: 'kredit', zprava: 'Na účtu Claude API došel kredit.', status: 402 } });
    render(<BibleChat otevri={() => {}} />);
    await screen.findByText(/Útrata za AI/);
    zeptatSe('Proč kalné pivo?');
    expect(await screen.findByText(/Claude API nemá kredit/)).toBeTruthy();
    expect((screen.getByLabelText('Otázka pro AI sládka') as HTMLTextAreaElement).value).toBe('Proč kalné pivo?');
    // Chyba kreditu uvnitř hotové (neúplné) odpovědi — otázka se vrátí do políčka.
    zeptejSe.mockImplementationOnce(async (_p, na) => {
      na({ typ: 'start', konverzaceId: KID });
      na({ ...HOTOVO, text: 'Na účtu Claude API došel kredit.', citace: [], neuplna: true, chybaKod: 'kredit' } as UdalostChatu);
      return { ok: true };
    });
    zeptatSe('Proč málo pění?');
    await waitFor(() => expect((screen.getByLabelText('Otázka pro AI sládka') as HTMLTextAreaElement).value).toBe('Proč málo pění?'));
    expect(screen.getByRole('link', { name: /Zeptat se v Claude/ })).toBeTruthy();
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
