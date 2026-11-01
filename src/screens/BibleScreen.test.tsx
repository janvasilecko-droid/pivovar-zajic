import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

let profil: { role: string; permissions?: unknown } | null = null;
vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1', email: 'u@pivovar.cz' }, profile: profil }) }));
// Brána projektu bible: knihovna (prázdná, nebo s jednou zpracovanou knihou),
// čtení knihy; kapacita a útrata jen pro správce.
const ID = '11111111-2222-3333-4444-555555555555';
let dokumenty: unknown[] = [];
vi.mock('../lib/bibleKlient', () => ({
  BIBLE_URL: 'https://cegrelgvkygcatupqwrx.supabase.co',
  odkazDoUloziste: () => null,
  volejBibli: async (_funkce: string, telo: { akce?: string }) => {
    if (telo.akce === 'dokumenty') return { ok: true, data: dokumenty };
    if (telo.akce === 'nastaveni') return { ok: true, data: {} };
    if (telo.akce === 'kniha') {
      return { ok: true, data: { dokument: { ...(dokumenty[0] as object), postup: {} }, kapitoly: [], listy: [[1, null, 'v', 0]] } };
    }
    return { ok: false, chyba: { kod: 'zakazano', zprava: 'jen pro správce', status: 403 } };
  },
}));

import BibleScreen, { BIBLE_DLAZDICE } from './BibleScreen';

describe('Pivovarská bible — plocha', () => {
  it('má 8 dlaždic přesně podle zadání (bod 10)', () => {
    expect(BIBLE_DLAZDICE.map((d) => d.nazev)).toEqual([
      'Odborný chatbot', 'Knihovna dokumentů', 'Výpočtová laboratoř', 'Technologie pivovaru',
      'Receptury a várky', 'Analýza problémů', 'Zkušenosti sládků', 'Správa znalostí',
    ]);
  });

  it('bez povolení ukáže jen vysvětlení, kde přístup získat — žádné dlaždice', () => {
    profil = { role: 'user', permissions: { dashboard: { view: true, edit: true } } };
    render(<BibleScreen />);
    expect(screen.getByRole('alert').textContent).toMatch(/nemáš přístup/);
    expect(screen.queryByText('Knihovna dokumentů')).toBeNull();
  });

  it('správce vidí plochu; nehotová dlaždice poctivě řekne etapu a nic nepředstírá', () => {
    profil = { role: 'admin' };
    const setPage = vi.fn();
    render(<BibleScreen setPage={setPage} />);
    expect(screen.getByText('Knihovna dokumentů')).toBeTruthy();
    fireEvent.click(screen.getByText('Odborný chatbot'));
    expect(screen.getByText(/Připravujeme · etapa 5/)).toBeTruthy();
    expect(screen.getByText(/AI zatím z knih neodpovídá/)).toBeTruthy();
    expect(setPage).toHaveBeenCalledWith('bible', undefined, 'chat');
  });

  it('uživatel s povoleným modulem bible plochu vidí', () => {
    profil = { role: 'user', permissions: { bible: { view: true, edit: false } } };
    render(<BibleScreen pageSubTab="sprava" />);
    expect(screen.getByText('Kdo má přístup')).toBeTruthy();
    expect(screen.getByText(/Tvoje role v knihovně/).textContent).toMatch(/čte/);
  });

  it('zpracovaná kniha jde z knihovny otevřít ve čtečce; Zpět vede do knihovny', async () => {
    profil = { role: 'admin' };
    dokumenty = [{
      id: ID, nazev: 'Technologie piva', autor: null, vydani: null, rok: null, isbn: null, jazyk: 'cs', druh: 'kniha', oblasti: [],
      zdroj: null, soubor_nazev: 'kniha.pdf', soubor_velikost: 1000, soubor_mime: 'application/pdf', stav: 'hotovo', stav_zprava: null,
      postup: { stran: 1, kapitol: 0, pasazi: 1 }, stran_celkem: 1, kvalita_ocr: null, licence: null, nahral: 'u1', nahral_jmeno: 'Honza',
      created_at: '2026-10-31T10:00:00Z', zpracovano_at: '2026-10-31T12:00:00Z',
    }];
    const setPage = vi.fn();
    await act(async () => { render(<BibleScreen setPage={setPage} pageSubTab="knihovna" />); });
    await act(async () => { fireEvent.click(await screen.findByRole('button', { name: 'Číst' })); });
    expect(setPage).toHaveBeenLastCalledWith('bible', undefined, `kniha:${ID}`);
    expect(screen.getByRole('heading', { name: 'Čtení knihy' })).toBeTruthy();
    // Čtečka se načte líně a ukáže knihu.
    expect(await screen.findByText(/nemá rozpoznané kapitoly/)).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Zpět do knihovny' })); });
    expect(setPage).toHaveBeenLastCalledWith('bible', undefined, 'knihovna');
    expect(screen.getByRole('heading', { name: 'Knihovna dokumentů' })).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Číst' })).toBeTruthy();
    dokumenty = [];
  });

  it('nezpracovaná kniha tlačítko Číst nemá; trasa s neplatným id zůstane na ploše', async () => {
    profil = { role: 'admin' };
    dokumenty = [{
      id: ID, nazev: 'Čekající kniha', autor: null, vydani: null, rok: null, isbn: null, jazyk: 'cs', druh: 'kniha', oblasti: [],
      zdroj: null, soubor_nazev: 'kniha.pdf', soubor_velikost: 1000, soubor_mime: 'application/pdf', stav: 'ceka', stav_zprava: null,
      postup: {}, stran_celkem: null, kvalita_ocr: null, licence: null, nahral: 'u1', nahral_jmeno: 'Honza',
      created_at: '2026-10-31T10:00:00Z', zpracovano_at: null,
    }];
    await act(async () => { render(<BibleScreen pageSubTab="knihovna" />); });
    expect(await screen.findByText('Čekající kniha')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Číst' })).toBeNull();
    dokumenty = [];
  });

  it('trasa s neplatným id knihy ukáže plochu bible', () => {
    profil = { role: 'admin' };
    render(<BibleScreen pageSubTab="kniha:neni-uuid" />);
    expect(screen.getByRole('heading', { name: 'Digitální hlavní sládek' })).toBeTruthy();
  });
});
