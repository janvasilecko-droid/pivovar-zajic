// AI sládek: zdroje z internetu v odpovědi jdou jedním klepnutím uložit do bible (neověřené).
// Jen vymyšlené věty a adresy — žádný text skutečných zdrojů (repo je veřejné).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Odpoved, StavChatu, UdalostChatu, ZdrojOdpovedi } from '../../lib/bibleChatApi';
import type { WebZdrojVstup } from '../../lib/bibleWebApi';
import type { BibleRole } from '../../lib/bibleOpravneni';

const ID = '11111111-2222-3333-4444-555555555555';
const KID = '99999999-8888-7777-6666-555555555555';

const ZAPNUTO: Odpoved<StavChatu> = { stav: 'ok', data: { migrace: true, klic: true, dotazy: true, utracenoUsd: 1, chatUsd: 1, chatDotazu: 4, stropUsd: 20, model: 'claude-opus-5-5' } as StavChatu };
const zeptejSe = vi.fn<(p: unknown, na: (u: UdalostChatu) => void) => Promise<unknown>>();
vi.mock('../../lib/bibleChatApi', async (puvodni) => ({
  ...(await puvodni<typeof import('../../lib/bibleChatApi')>()),
  nactiStavChatu: async () => ZAPNUTO,
  nactiKonverzace: async () => ({ stav: 'ok', data: [] }),
  zeptejSe: (p: never, na: never) => zeptejSe(p, na),
}));
vi.mock('../../lib/bibleProvozApi', () => ({ nactiProvoz: async () => ({ stav: 'prazdny' }) }));
vi.mock('../../lib/toast', () => ({ potvrd: async () => true, chyba: () => {} }));
type VysledekUlozeni = { stav: 'ok'; data: { novy: boolean; stav: string | null } } | { stav: 'chyba'; zprava: string };
const ulozWebZdroj = vi.fn<(id: string | null, z: WebZdrojVstup) => Promise<VysledekUlozeni>>();
vi.mock('../../lib/bibleWebApi', async (puvodni) => ({
  ...(await puvodni<typeof import('../../lib/bibleWebApi')>()),
  ulozWebZdroj: (id: string | null, z: WebZdrojVstup) => ulozWebZdroj(id, z),
}));

import { BibleChat } from './BibleChat';

const web = (n: number, url: string | null, nazev: string): ZdrojOdpovedi => ({
  n, dokumentId: null, pdfIndex: null, nazev, tistena: null, kapitola: null, zdroj: 'web', url, citat: 'Úryvek cizí stránky, který se do bible neukládá.',
});
const KNIHA: ZdrojOdpovedi = {
  n: 3, dokumentId: ID, pdfIndex: 12, nazev: 'Pivovarství', tistena: '10', kapitola: null, zdroj: 'original', url: null, citat: 'Věta z knihy.',
};

function hotovo(citace: ZdrojOdpovedi[], text: string): UdalostChatu {
  return {
    typ: 'hotovo', konverzaceId: KID, zpravaId: ID, text, neuplna: false, model: 'claude-opus-5-5', cenaUsd: 0.1,
    utracenoUsd: 1.1, stropUsd: 20, chybaKod: null, kroky: [], citace,
  };
}
const TEXT = '## Krátká odpověď\nPomalé kvašení řeší hlavně teplota[1]. Praxe sládků to potvrzuje[2]. Kniha to doplňuje[3].';
const DVA_WEBY = [web(1, 'https://example.org/kvaseni', 'Pomalé kvašení — průvodce'), web(2, 'https://example.net/praxe', 'Diskuse sládků'), KNIHA];

async function odpovez(citace: ZdrojOdpovedi[], role?: BibleRole | null, text = TEXT) {
  zeptejSe.mockImplementation(async (_p, na) => {
    na({ typ: 'start', konverzaceId: KID });
    na(hotovo(citace, text));
    return { ok: true };
  });
  render(<BibleChat otevri={() => {}} role={role} />);
  await screen.findByText(/Útrata za AI/);
  fireEvent.change(screen.getByLabelText('Otázka pro AI sládka'), { target: { value: 'Proč kvašení stojí?' } });
  fireEvent.click(screen.getByRole('button', { name: /Odpovědět tady/ }));
  await screen.findByRole('article', { name: 'Odpověď AI sládka' });
}
const tlacitko = (n: number) => screen.getByRole('button', { name: `Uložit do bible (zdroj ${n})` }) as HTMLButtonElement;

beforeEach(() => {
  zeptejSe.mockReset();
  ulozWebZdroj.mockReset();
});

describe('Uložit do bible (zdroje z internetu)', () => {
  it('přispěvatel: tlačítko jen u webových zdrojů, ne u knihy', async () => {
    await odpovez(DVA_WEBY, 'prispiva');
    expect(tlacitko(1)).toBeTruthy();
    expect(tlacitko(2)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Uložit do bible (zdroj 3)' })).toBeNull();
    expect(screen.getAllByRole('button', { name: /^Uložit do bible \(zdroj/ })).toHaveLength(2);
    expect(screen.getByText(/Zdroje z internetu jde uložit do bible: uloží se jako neověřené/)).toBeTruthy();
  });

  it('správce má totéž; čtenář ani odpověď bez role tlačítko nevidí', async () => {
    await odpovez(DVA_WEBY, 'spravuje');
    expect(tlacitko(1)).toBeTruthy();
  });

  it.each<[string, BibleRole | null | undefined]>([['čtenář', 'cte'], ['bez přístupu', null], ['role neznámá', undefined]])('%s: žádné ukládání', async (_nazev, role) => {
    await odpovez(DVA_WEBY, role);
    expect(screen.queryByRole('button', { name: /Uložit do bible/ })).toBeNull();
    expect(screen.queryByText(/Zdroje z internetu jde uložit/)).toBeNull();
    // Odkazy na zdroje zůstávají.
    expect(screen.getByRole('link', { name: 'Zdroj 1: Pomalé kvašení — průvodce (web)' })).toBeTruthy();
  });

  it('klepnutí uloží zdroj jako neověřený: adresa, titulek, věta z odpovědi, důvěra 5; úryvek stránky ne', async () => {
    ulozWebZdroj.mockResolvedValue({ stav: 'ok', data: { novy: true, stav: 'neovereno' } });
    await odpovez(DVA_WEBY, 'prispiva');
    fireEvent.click(tlacitko(1));
    await screen.findByText(/Uloženo do bible jako neověřený zdroj/);
    expect(ulozWebZdroj).toHaveBeenCalledTimes(1);
    expect(ulozWebZdroj).toHaveBeenCalledWith(null, {
      url: 'https://example.org/kvaseni', titulek: 'Pomalé kvašení — průvodce', vydavatel: '', datumPublikace: '',
      shrnuti: 'Pomalé kvašení řeší hlavně teplota.', oblasti: [], duvera: 5,
    });
    expect(JSON.stringify(ulozWebZdroj.mock.calls)).not.toContain('Úryvek cizí stránky');
    // Uložený zdroj už tlačítko nemá, druhý ano.
    expect(screen.queryByRole('button', { name: 'Uložit do bible (zdroj 1)' })).toBeNull();
    expect(tlacitko(2)).toBeTruthy();
  });

  it('zdroj už v bibli je: řekne se to i se stavem ověření', async () => {
    ulozWebZdroj.mockResolvedValue({ stav: 'ok', data: { novy: false, stav: 'overeno' } });
    await odpovez([web(1, 'https://example.org/kvaseni', 'Pomalé kvašení — průvodce')], 'prispiva');
    fireEvent.click(tlacitko(1));
    expect(await screen.findByText('Už v bibli je (ověřeno).')).toBeTruthy();
    expect(screen.queryByText(/Uloženo do bible jako neověřený zdroj/)).toBeNull();
  });

  it('chyba serveru: hláška, tlačítko zůstane a druhý pokus projde', async () => {
    ulozWebZdroj.mockResolvedValueOnce({ stav: 'chyba', zprava: 'Webový zdroj smí zapsat přispěvatel nebo správce.' });
    ulozWebZdroj.mockResolvedValueOnce({ stav: 'ok', data: { novy: true, stav: 'neovereno' } });
    await odpovez([web(1, 'https://example.org/kvaseni', 'Pomalé kvašení — průvodce')], 'prispiva');
    fireEvent.click(tlacitko(1));
    expect((await screen.findByRole('alert')).textContent).toBe('Webový zdroj smí zapsat přispěvatel nebo správce.');
    expect(tlacitko(1).disabled).toBe(false);
    fireEvent.click(tlacitko(1));
    await screen.findByText(/Uloženo do bible jako neověřený zdroj/);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(ulozWebZdroj).toHaveBeenCalledTimes(2);
  });

  it('výpadek spojení (výjimka) není pád: srozumitelná hláška a jde to zkusit znovu', async () => {
    ulozWebZdroj.mockRejectedValueOnce(new Error('síť'));
    await odpovez([web(1, 'https://example.org/kvaseni', 'Pomalé kvašení — průvodce')], 'prispiva');
    fireEvent.click(tlacitko(1));
    expect((await screen.findByRole('alert')).textContent).toBe('Uložení se nepovedlo (spojení). Zkus to znovu.');
    expect(tlacitko(1).disabled).toBe(false);
  });

  it('během ukládání je tlačítko zamčené a zdroj se pošle jen jednou', async () => {
    let dokonci: (v: VysledekUlozeni) => void = () => {};
    ulozWebZdroj.mockImplementation(() => new Promise<VysledekUlozeni>((r) => { dokonci = r; }));
    await odpovez([web(1, 'https://example.org/kvaseni', 'Pomalé kvašení — průvodce')], 'prispiva');
    const b = tlacitko(1);
    fireEvent.click(b);
    fireEvent.click(b);
    expect(ulozWebZdroj).toHaveBeenCalledTimes(1);
    expect((screen.getByRole('button', { name: /Ukládám/ }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { dokonci({ stav: 'ok', data: { novy: true, stav: 'neovereno' } }); });
    await screen.findByText(/Uloženo do bible jako neověřený zdroj/);
    expect(ulozWebZdroj).toHaveBeenCalledTimes(1);
  });

  it('hromadné ukládání a klepnutí na jeden zdroj zároveň: zdroj se pošle jen jednou', async () => {
    const OK: VysledekUlozeni = { stav: 'ok', data: { novy: true, stav: 'neovereno' } };
    const cekajici = new Map<string, (v: VysledekUlozeni) => void>();
    ulozWebZdroj.mockImplementation((_id, z) => new Promise<VysledekUlozeni>((r) => { cekajici.set(z.url, r); }));
    await odpovez(DVA_WEBY, 'prispiva');
    fireEvent.click(screen.getByRole('button', { name: 'Uložit všechny zdroje z internetu (2)' }));
    // První zdroj se ukládá, druhý ještě čeká na řadu: klepnutí na něj ho pošle hned.
    fireEvent.click(tlacitko(2));
    expect(ulozWebZdroj).toHaveBeenCalledTimes(2);
    await act(async () => { cekajici.get('https://example.org/kvaseni')?.(OK); });
    // Hromadné ukládání dojde ke druhému zdroji, který už se ukládá — nepošle ho znovu.
    await act(async () => { cekajici.get('https://example.net/praxe')?.(OK); });
    expect(ulozWebZdroj).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.getAllByText(/Uloženo do bible jako neověřený zdroj/)).toHaveLength(2));
  });

  it('hromadně: od dvou zdrojů „Uložit všechny", ukládá po jednom a bez zdrojů už uložených', async () => {
    const poradi: string[] = [];
    ulozWebZdroj.mockImplementation(async (_id, z) => { poradi.push(z.url); return { stav: 'ok', data: { novy: true, stav: 'neovereno' } }; });
    await odpovez(DVA_WEBY, 'prispiva');
    fireEvent.click(tlacitko(2));
    await screen.findByText(/Uloženo do bible jako neověřený zdroj/);
    expect(poradi).toEqual(['https://example.net/praxe']);
    // Zbývá jeden — hromadné tlačítko už není (jen jedno tlačítko u zbývajícího zdroje).
    expect(screen.queryByRole('button', { name: /Uložit všechny zdroje/ })).toBeNull();
    fireEvent.click(tlacitko(1));
    await waitFor(() => expect(poradi).toEqual(['https://example.net/praxe', 'https://example.org/kvaseni']));
  });

  it('hromadně: jedním klepnutím se uloží všechny a každý se nahlásí', async () => {
    const poradi: string[] = [];
    ulozWebZdroj.mockImplementation(async (_id, z) => { poradi.push(z.url); return { stav: 'ok', data: { novy: z.url.endsWith('kvaseni'), stav: 'neovereno' } }; });
    await odpovez([...DVA_WEBY, web(4, 'https://example.com/dalsi', 'Další zdroj')], 'prispiva');
    fireEvent.click(screen.getByRole('button', { name: 'Uložit všechny zdroje z internetu (3)' }));
    await waitFor(() => expect(screen.getAllByText(/Uloženo do bible jako neověřený zdroj|Už v bibli je/)).toHaveLength(3));
    expect(poradi).toEqual(['https://example.org/kvaseni', 'https://example.net/praxe', 'https://example.com/dalsi']);
    expect(screen.getAllByText('Už v bibli je (neověřeno).')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /Uložit/ })).toBeNull();
  });

  it('hromadně po jednotlivém uložení: už uložený zdroj se neposílá znovu', async () => {
    const poradi: string[] = [];
    ulozWebZdroj.mockImplementation(async (_id, z) => { poradi.push(z.url); return { stav: 'ok', data: { novy: true, stav: 'neovereno' } }; });
    await odpovez([...DVA_WEBY, web(4, 'https://example.com/dalsi', 'Další zdroj')], 'prispiva');
    fireEvent.click(tlacitko(1));
    await screen.findByText(/Uloženo do bible jako neověřený zdroj/);
    fireEvent.click(screen.getByRole('button', { name: 'Uložit všechny zdroje z internetu (2)' }));
    await waitFor(() => expect(screen.getAllByText(/Uloženo do bible jako neověřený zdroj/)).toHaveLength(3));
    expect(poradi).toEqual(['https://example.org/kvaseni', 'https://example.net/praxe', 'https://example.com/dalsi']);
  });

  it('hromadně: chyba u jednoho zdroje neposlala ostatní do zapomnění', async () => {
    ulozWebZdroj.mockImplementation(async (_id, z) => (z.url.endsWith('praxe')
      ? { stav: 'chyba', zprava: 'Server neodpověděl.' }
      : { stav: 'ok', data: { novy: true, stav: 'neovereno' } }));
    await odpovez(DVA_WEBY, 'prispiva');
    fireEvent.click(screen.getByRole('button', { name: 'Uložit všechny zdroje z internetu (2)' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Server neodpověděl.');
    expect(ulozWebZdroj).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/Uloženo do bible jako neověřený zdroj/)).toBeTruthy();
    // Zbývá jen ten, co selhal: hromadné tlačítko už není, má vlastní a jde zkusit znovu.
    expect(screen.queryByRole('button', { name: /Uložit všechny zdroje/ })).toBeNull();
    expect(tlacitko(2)).toBeTruthy();
  });

  it('jeden webový zdroj: hromadné tlačítko není; zdroj s neplatnou adresou se nenabízí', async () => {
    await odpovez([web(1, 'https://example.org/kvaseni', 'Dobrý'), web(2, 'javascript:alert(1)', 'Zlý'), web(4, 'https://EXAMPLE.org/kvaseni', 'Duplicita')], 'prispiva');
    expect(screen.queryByRole('button', { name: /Uložit všechny/ })).toBeNull();
    expect(tlacitko(1)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Uložit do bible (zdroj 2)' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Uložit do bible (zdroj 4)' })).toBeNull();
  });

  it('odpověď jen z knih: žádná nabídka ukládání', async () => {
    await odpovez([KNIHA], 'prispiva', 'Kniha to doplňuje[3].');
    expect(screen.queryByRole('button', { name: /Uložit do bible/ })).toBeNull();
    expect(screen.queryByText(/Zdroje z internetu jde uložit/)).toBeNull();
  });
});
