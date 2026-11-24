// 🎨 Nastavení: Vzhled zvlášť.
//
// Majitel 18. 11. 2026: „nastavení zvlášť vzhled." Obrazovka Aplikace &
// Nastavení byla jedna dlouhá stránka — barevný režim, velikost prvků a efekty
// byly rozházené mezi instalací, upozorněními a heslem. Teď má dva oddíly:
// Vzhled (barevný režim, hustota, plynulost, poloha lišty, menu) a Ostatní.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import AppSettingsScreen from './AppSettingsScreen';
import { getTheme } from '../lib/theme';

vi.mock('../lib/supabase', () => {
  const prazdny = (): unknown => {
    const proxy: unknown = new Proxy({}, {
      get(_c, prop) {
        if (prop === 'then') return (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok);
        if (prop === 'maybeSingle' || prop === 'single') return () => Promise.resolve({ data: null, error: null });
        return () => proxy;
      },
    });
    return proxy;
  };
  const supabase = {
    from: () => prazdny(),
    rpc: () => prazdny(),
    auth: {
      getUser: async () => ({ data: { user: { id: 'u1' } } }),
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: () => Promise.resolve(),
  };
  const fetchAllRows = () => prazdny();
  return new Proxy({ supabase, fetchAllRows }, {
    has: () => true,
    get(cil, prop) {
      if (prop in cil) return (cil as Record<string | symbol, unknown>)[prop];
      if (prop === '__esModule') return true;
      if (prop === 'then') return undefined;
      return () => undefined;
    },
  });
});

const SPRAVCE = {
  profile: { id: 'u1', role: 'admin', display_name: 'Jan', home_layout: {}, permissions: undefined as unknown },
  user: { id: 'u1', email: 'jan@example.cz' },
  reloadProfile: async () => undefined,
};
// Stav přihlášení se mezi vykresleními nemění (stejný objekt) — jen test může před vykreslením vyměnit uživatele.
let stavAuth = SPRAVCE;
vi.mock('../lib/auth', () => ({ useAuth: () => stavAuth }));

/** Vykreslí obrazovku a nechá doběhnout počáteční načítání (stav upozornění, odesílatelé…). */
async function otevri(setPage = vi.fn()) {
  const v = render(<AppSettingsScreen setPage={setPage} />);
  await act(async () => { await new Promise((ok) => setTimeout(ok, 0)); });
  return v;
}

const nadpis = (re: RegExp) => screen.queryByRole('heading', { name: re });
const zalozka = (nazev: string) => screen.getByRole('tab', { name: new RegExp(nazev) });

describe('Aplikace & Nastavení — oddíly', () => {
  beforeEach(() => {
    stavAuth = SPRAVCE;
    localStorage.clear();
    sessionStorage.clear();
    // jsdom matchMedia nemá (obrazovka zjišťuje, jestli běží jako nainstalovaná aplikace, a režim „podle systému").
    window.matchMedia = ((dotaz: string) => ({
      matches: false, media: dotaz, onchange: null,
      addEventListener: () => undefined, removeEventListener: () => undefined,
      addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
    // Klepnutí odemyká zvuk upozornění (lib/notifications.ts) — jsdom přehrávání nemá.
    vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  });

  it('AI sládek jako samostatná aplikace (R39): karta s odkazem je v Ostatních jen pro toho, kdo má přístup do bible', async () => {
    stavAuth = SPRAVCE;
    const spravce = await otevri();
    fireEvent.click(zalozka('Ostatní'));
    expect(nadpis(/AI sládek — samostatná aplikace/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Otevřít AI sládka' }).getAttribute('href')).toMatch(/\/sladek\/$/);
    spravce.unmount();

    stavAuth = { ...SPRAVCE, profile: { ...SPRAVCE.profile, id: 'u2', role: 'user', permissions: { dashboard: { view: true, edit: false } } }, user: { id: 'u2', email: 'eva@example.cz' } };
    const bezPristupu = await otevri();
    fireEvent.click(zalozka('Ostatní'));
    expect(nadpis(/Instalace aplikace/)).toBeTruthy();
    expect(nadpis(/AI sládek — samostatná aplikace/)).toBeNull();
    bezPristupu.unmount();

    stavAuth = { ...stavAuth, profile: { ...stavAuth.profile, permissions: { bible: { view: true, edit: false } } } };
    await otevri();
    fireEvent.click(zalozka('Ostatní'));
    expect(nadpis(/AI sládek — samostatná aplikace/)).toBeTruthy();
  });

  it('otevře se Vzhled: barevný režim, hustota, plynulost, poloha lišty a menu pohromadě', async () => {
    await otevri();
    expect(zalozka('Vzhled').getAttribute('aria-selected')).toBe('true');
    expect(zalozka('Ostatní').getAttribute('aria-selected')).toBe('false');

    expect(nadpis(/Barevný režim/)).toBeTruthy();
    expect(nadpis(/Hustota zobrazení/)).toBeTruthy();
    expect(nadpis(/Plynulost/)).toBeTruthy();
    expect(nadpis(/Poloha navigační lišty/)).toBeTruthy();
    expect(nadpis(/Přizpůsobení menu/)).toBeTruthy();
    expect(nadpis(/Lišta nahoře na ploše/)).toBeTruthy();

    // Nic z ostatního tu není.
    expect(nadpis(/Instalace aplikace/)).toBeNull();
    expect(nadpis(/Upozornění \(notifikace\)/)).toBeNull();
    expect(nadpis(/Změna hesla/)).toBeNull();
    expect(nadpis(/WhatsApp — povolení odesílatelé/)).toBeNull();
  });

  it('Ostatní: instalace, upozornění, účet a správa — a nic z vzhledu', async () => {
    await otevri();
    fireEvent.click(zalozka('Ostatní'));

    expect(zalozka('Ostatní').getAttribute('aria-selected')).toBe('true');
    expect(nadpis(/Instalace aplikace/)).toBeTruthy();
    expect(nadpis(/Odezva při dotyku/)).toBeTruthy();
    expect(nadpis(/Upozornění \(notifikace\)/)).toBeTruthy();
    expect(nadpis(/Změna hesla/)).toBeTruthy();
    expect(nadpis(/Hlášení/)).toBeTruthy();

    expect(nadpis(/Barevný režim/)).toBeNull();
    expect(nadpis(/Hustota zobrazení/)).toBeNull();
    expect(nadpis(/Plynulost/)).toBeNull();
    expect(nadpis(/Poloha navigační lišty/)).toBeNull();
  });

  it('zvolený oddíl se pamatuje i po novém otevření', async () => {
    const { unmount } = await otevri();
    fireEvent.click(zalozka('Ostatní'));
    unmount();

    await otevri();
    expect(zalozka('Ostatní').getAttribute('aria-selected')).toBe('true');
    expect(nadpis(/Změna hesla/)).toBeTruthy();

    fireEvent.click(zalozka('Vzhled'));
    expect(nadpis(/Hustota zobrazení/)).toBeTruthy();
  });

  it('přepínač je přístupný: záložky řídí panel a panel je jimi popsaný', async () => {
    await otevri();
    const seznam = screen.getByRole('tablist', { name: 'Oddíly nastavení' });
    expect(seznam).toBeTruthy();
    const panel = screen.getByRole('tabpanel');
    expect(panel.getAttribute('id')).toBe(zalozka('Vzhled').getAttribute('aria-controls'));
    expect(panel.getAttribute('aria-labelledby')).toBe(zalozka('Vzhled').getAttribute('id'));
  });

  it('přepnutí barevného režimu funguje v oddílu Vzhled', async () => {
    await otevri();
    fireEvent.click(screen.getByRole('button', { name: /Tmavý/ }));
    expect(getTheme()).toBe('dark');
    fireEvent.click(screen.getByRole('button', { name: /Světlý/ }));
    expect(getTheme()).toBe('light');
  });

  it('karta o liště nahoře odkáže na plochu, kde se odpočty nastavují', async () => {
    const setPage = vi.fn();
    await otevri(setPage);
    fireEvent.click(screen.getByRole('button', { name: 'Otevřít plochu' }));
    expect(setPage).toHaveBeenCalledWith('home');
  });
});
